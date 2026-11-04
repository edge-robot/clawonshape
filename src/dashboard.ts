import type {OpenClawPluginApi, PluginSessionActionResult} from 'openclaw/plugin-sdk/core';
import type {Config} from './config.ts';
import {connectionOwner} from './config.ts';
import {connectionLifecycle, CALLBACK_PATH} from './connections.ts';
import {RestClient, validatedDisplayNames} from './rest.ts';
import {operatorCandidateAuthorization, operatorGoalCandidateAuthorization} from './candidate-authorization.ts';
import {candidateAttempts} from './candidate-attempts.ts';
import {goalAuthorityActive} from './goal-store.ts';
import {closeGoal, confirmGoal, goalStatus, reconcileGoal, stopGoal} from './goal-service.ts';
import {boundedView} from './goal-lifecycle.ts';
import type {GoalView} from './goal-lifecycle.ts';

// Plugin JSON results are bounded (DASHBOARD_PNG_MAX_BYTES note above); history entries stay small.
const GOAL_VIEW_MAX_BYTES = 160_000;
const GOAL_HISTORY_VIEW_MAX_BYTES = 8_000;
const boundedGoal = (view: GoalView) => boundedView(view, GOAL_VIEW_MAX_BYTES);
import type {GoalContext} from './goal-service.ts';
import {credentials} from './credentials.ts';
import {accessToken} from './authorization.ts';
import {authorizationSnapshot, matchesAuthorizationSnapshot} from './authorization-snapshot.ts';
import {mutationStore} from './mutation-workflow.ts';
import path from 'node:path';
import {state, userError} from './readiness.ts';
import {mcpReadiness, localMcpReadiness} from './mcp.ts';
import {imageHash, IMAGE_SIZE} from './render.ts';
import type {WorkContextDeps} from './work-context-service.ts';
import {
  adoptWorkContext,
  clearWorkContext,
  workContextCatalog,
  workContextDocuments,
  workContextParts,
  workContextPreview,
  workContextStatus,
  workContextWorkspaces,
} from './work-context-service.ts';
import {BrowseCache} from './work-context-cache.ts';
import {bindingKey} from './work-context.ts';
import {sha256Hex} from './goal-scope.ts';

// OpenClaw 2026.9.9 plugin JSON: 65,536 chars/string, 262,144 serialized bytes.
// Leave metadata/envelope headroom; larger images fail closed, without resizing evidence.
export const DASHBOARD_PNG_MAX_BYTES = 180_000;
export function registerDashboard(
  api: OpenClawPluginApi,
  current: () => Config,
  readMcp: typeof mcpReadiness = mcpReadiness,
  // Egress to MCP_URL for the goal capability and journal-summary probes (injectable for tests).
  goalFetcher: typeof fetch = fetch,
  now: () => number = Date.now,
) {
  const lifecycle = connectionLifecycle(
    current,
    () => api.runtime.state.resolveStateDir(),
    () => api.runtime.config.current().gateway?.controlUi?.allowedOrigins ?? [],
  );
  const controls = api.session.controls;
  for (const actionId of ['render', 'workspace-context'] as const) {
    controls.registerSessionAction({
      id: actionId,
      description:
        actionId === 'render'
          ? 'Read the configured Part Studio as a revision-pinned PNG'
          : 'Read current names for the exact assigned workspace without rendering',
      requiredScopes: ['operator.read'],
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {connectionRef: {type: 'string', pattern: '^[a-z][a-z0-9_-]{0,63}$'}},
      },
      async handler(action): Promise<PluginSessionActionResult> {
        try {
          const initial = current();
          const snapshot = authorizationSnapshot(initial);
          const guard = () => {
            if (
              !action.client?.scopes.includes('operator.read') ||
              !matchesAuthorizationSnapshot(current(), snapshot)
            ) {
              throw new Error('authorization_changed');
            }
            if (!current().liveReads) {
              throw new Error('live_reads_disabled');
            }
          };
          guard();
          const input = action.payload ?? {};
          if (
            typeof input !== 'object' ||
            Array.isArray(input) ||
            Object.keys(input).some((key) => key !== 'connectionRef') ||
            ('connectionRef' in input &&
              (typeof input.connectionRef !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(input.connectionRef)))
          ) {
            throw new Error('invalid_arguments');
          }
          const ref = (input as {connectionRef?: string}).connectionRef;
          const bindings = initial.bindings.filter((b) => ref === undefined || b.connectionRef === ref);
          if (bindings.length !== 1) {
            throw new Error('not_configured');
          }
          const binding = bindings[0];
          const store = await credentials(
            api.runtime.state.resolveStateDir(),
            binding.connectionRef,
            connectionOwner(binding),
            initial.localMcp?.connectionRef === binding.connectionRef
              ? initial.localMcp.credentialDirectory
              : undefined,
          );
          let usedToken: string | undefined;
          const client = new RestClient(async () => {
            usedToken = await accessToken(store, initial.oauth, guard);
            guard();
            return usedToken;
          });
          if (actionId === 'workspace-context') {
            const metadata = await client.workspaceContext(binding);
            guard();
            if (store.read().accessToken !== usedToken) {
              throw new Error('authorization_changed');
            }
            return {
              ok: true,
              result: {
                status: 'ok',
                connectionRef: binding.connectionRef,
                ...metadata,
                observedAt: new Date().toISOString(),
              },
            };
          }
          const {bytes, metadata} = await client.render(binding);
          guard();
          if (store.read().accessToken !== usedToken) {
            throw new Error('authorization_changed');
          }
          if (bytes.length > DASHBOARD_PNG_MAX_BYTES) {
            return {ok: true, result: {status: 'unavailable', code: 'dashboard_image_too_large'}};
          }
          const encoded = bytes.toString('base64');
          return {
            ok: true,
            result: {
              status: 'ok',
              documentId: metadata.documentId,
              workspaceId: metadata.workspaceId,
              elementId: metadata.elementId,
              microversionId: metadata.microversionId,
              revisionUrl: metadata.revisionUrl,
              ...validatedDisplayNames(metadata),
              renderedAt: new Date().toISOString(),
              width: IMAGE_SIZE,
              height: IMAGE_SIZE,
              bytes: bytes.length,
              sha256: imageHash(bytes),
              pngBase64Chunks: encoded.match(/.{1,60000}/g) ?? [],
            },
          };
        } catch (error) {
          return {ok: true, result: userError(error)};
        }
      },
    });
  }
  for (const actionId of ['status', 'connect', 'disconnect'] as const) {
    controls.registerSessionAction({
      id: actionId,
      description: `Claw-Onshape ${actionId}`,
      requiredScopes: [actionId === 'status' ? 'operator.read' : 'operator.admin'],
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          connectionRef: {type: 'string', pattern: '^[a-z][a-z0-9_-]{0,63}$'},
          requestRestWriteAccess: {type: 'boolean'},
        },
      },
      async handler(action) {
        try {
          const snapshot = authorizationSnapshot(current());
          const assertCurrent = () => {
            if (
              !action.client?.scopes.includes(actionId === 'status' ? 'operator.read' : 'operator.admin') ||
              !matchesAuthorizationSnapshot(current(), snapshot)
            ) {
              throw new Error('authorization_changed');
            }
          };
          // Dashboard authority is operator scope, NOT a claim of Discord identity.
          if (!action.client?.scopes.includes(actionId === 'status' ? 'operator.read' : 'operator.admin')) {
            throw new Error('authorization_changed');
          }
          const input = action.payload as {connectionRef?: string} | undefined;
          if (
            input?.connectionRef !== undefined &&
            !current().bindings.some((b) => b.connectionRef === input.connectionRef)
          ) {
            throw new Error('not_configured');
          }
          const connections = [...new Set(current().bindings.map((b) => b.connectionRef))];
          const name = input?.connectionRef ?? (connections.length === 1 ? connections[0] : undefined);
          if (actionId === 'status') {
            const native = await readMcp(),
              local = current().localMcp;
            const mcp = local ? await localMcpReadiness(native, local) : native;
            let rest: Awaited<ReturnType<typeof lifecycle.status>> | ReturnType<typeof userError>;
            try {
              rest = await lifecycle.status(name);
            } catch (e) {
              rest = userError(e);
            }
            assertCurrent();
            return {ok: true, result: {...rest, connections, mcp}};
          }
          if (!name) {
            throw new Error('not_configured');
          }
          return {
            ok: true,
            result:
              actionId === 'connect'
                ? await lifecycle.start(name, {
                    requestRestWriteAccess: !!(action.payload as {requestRestWriteAccess?: boolean} | undefined)
                      ?.requestRestWriteAccess,
                  })
                : await lifecycle.disconnect(name),
          };
        } catch (e) {
          return {ok: true, result: userError(e)};
        }
      },
    });
  }
  for (const actionId of [
    'candidate-prepare',
    'candidate-check',
    'mutation-status',
    'mutation-approve',
    'mutation-reconcile',
  ] as const) {
    controls.registerSessionAction({
      id: actionId,
      description: `Claw-Onshape ${actionId}`,
      requiredScopes: [actionId === 'mutation-status' ? 'operator.read' : 'operator.admin'],
      schema: {
        type: 'object',
        properties: {
          connectionRef: {type: 'string'},
          candidateWorkspaceId: {type: 'string'},
          candidateWorkspaceName: {type: 'string'},
          proposalId: {type: 'string'},
          expectedPayloadHash: {type: 'string'},
        },
        additionalProperties: false,
      },
      async handler(action) {
        const response = (value: unknown) => ({ok: true as const, result: JSON.parse(JSON.stringify(value))});
        try {
          const required = actionId === 'mutation-status' ? 'operator.read' : 'operator.admin';
          const initial = current(),
            snapshot = authorizationSnapshot(initial);
          const assertOperator = () => {
            if (!action.client?.scopes.includes(required) || !matchesAuthorizationSnapshot(current(), snapshot)) {
              throw new Error('authorization_changed');
            }
          };
          assertOperator();
          const input = action.payload as {
            connectionRef?: string;
            candidateWorkspaceId?: string;
            candidateWorkspaceName?: string;
            proposalId?: string;
            expectedPayloadHash?: string;
          };
          const bindings = initial.bindings.filter(
            (b) => !input?.connectionRef || b.connectionRef === input.connectionRef,
          );
          if (bindings.length !== 1) {
            throw new Error('not_configured');
          }
          const binding = bindings[0];
          const store = await credentials(
            api.runtime.state.resolveStateDir(),
            binding.connectionRef,
            connectionOwner(binding),
            initial.localMcp?.credentialDirectory,
          );
          const proposals = await mutationStore(api.runtime.state.resolveStateDir(), binding);
          if (actionId === 'mutation-status') {
            const records = await proposals.list();
            assertOperator();
            return response({
              status: 'ok',
              target: {
                documentId: binding.documentId,
                workspaceId: binding.workspaceId,
                elementId: binding.elementId,
                primaryWorkspaceId: binding.primaryWorkspaceId,
              },
              // Operator-authorized local context remains visible without an OAuth grant.
              // A disconnected/expired grant is never presented as usable write access.
              oauthWrite: store.status() === 'connected' && store.read().scopes.includes('OAuth2Write'),
              proposals: records,
            });
          }
          const client = new RestClient(() => accessToken(store, initial.oauth, assertOperator), fetch, {
            stateDir: api.runtime.state.resolveStateDir(),
            authorization: operatorCandidateAuthorization(
              current,
              binding,
              api.runtime.state.resolveStateDir(),
              assertOperator,
            ),
          });
          if (actionId === 'candidate-prepare' || actionId === 'candidate-check') {
            if (actionId === 'candidate-prepare' && binding.workspaceId !== binding.primaryWorkspaceId) {
              throw new Error('candidate_already_assigned');
            }
            if (
              actionId === 'candidate-check' &&
              (!input?.candidateWorkspaceId || input.candidateWorkspaceId === binding.primaryWorkspaceId)
            ) {
              throw new Error('protected_primary_workspace');
            }
            const sourceMicroversionId = await client.sourceRevision(binding);
            const result = await client.prepareCandidateWorkspace(binding, {
              sourceMicroversionId,
              ...(actionId === 'candidate-check'
                ? {candidateWorkspaceId: input.candidateWorkspaceId}
                : {candidateWorkspaceName: input?.candidateWorkspaceName ?? 'ClawOnshape Candidate'}),
            });
            assertOperator();
            return response(result);
          }
          if (!input?.proposalId || !initial.localMcp) {
            throw new Error('invalid_arguments');
          }
          const approvalDirectory = path.join(initial.localMcp.credentialDirectory, 'mutation-approvals');
          if (actionId === 'mutation-approve') {
            const token = await accessToken(store, initial.oauth, assertOperator);
            void token;
            if (
              !store.read().scopes.includes('OAuth2Write') ||
              initial.oauth?.applicationPermissions.canWriteDocuments !== true
            ) {
              throw new Error('oauth_write_scope_missing');
            }
            const record = await proposals.approve(
              input.proposalId,
              input.expectedPayloadHash ?? '',
              approvalDirectory,
              client,
              assertOperator,
              async () => {
                if (await goalAuthorityActive(api.runtime.state.resolveStateDir())) {
                  throw new Error('goal_active_conflict');
                }
              },
            );
            return response({status: 'approved', proposal: record, reconciliationRequired: true});
          }
          const record = await proposals.reconcile(input.proposalId, client, approvalDirectory);
          assertOperator();
          if (record.status === 'REJECTED') {
            return response({
              status: 'rejected',
              proposal: record,
              message: state(record.reason ?? 'onshape_unavailable').message,
            });
          }
          return response({status: 'verified', proposal: record});
        } catch (e) {
          return {ok: true, result: userError(e)};
        }
      },
    });
  }
  registerGoalActions(api, current, goalFetcher, now);
  registerWorkContextActions(api, current, now);
  api.registerHttpRoute({path: CALLBACK_PATH, match: 'exact', auth: 'plugin', handler: lifecycle.callback});
  api.lifecycle.registerRuntimeLifecycle({id: 'onshape-consent', dispose: lifecycle.cancel, cleanup: lifecycle.cancel});
  return lifecycle;
}

const GOAL_ACTION_KEYS = {
  'goal-status': ['connectionRef'],
  'goal-confirm': ['connectionRef', 'goalId', 'nonce', 'expectedGoalHash'],
  'goal-stop': ['connectionRef', 'goalId'],
  'goal-reconcile': ['connectionRef', 'goalId', 'sequence', 'featureId', 'sourceMicroversion', 'admittedAt'],
  'goal-close': ['connectionRef', 'goalId'],
} as const;

// goal-workflow.md §4.1. Every response is {ok: true, goal: GoalView} (goal-status also carries history) or
// {ok: false, code, message}. goal-confirm acts only on an explicit operator call with the displayed goalHash.
function registerGoalActions(
  api: OpenClawPluginApi,
  current: () => Config,
  goalFetcher: typeof fetch,
  now: () => number,
) {
  for (const actionId of ['goal-status', 'goal-confirm', 'goal-stop', 'goal-reconcile', 'goal-close'] as const) {
    const required = actionId === 'goal-status' ? 'operator.read' : 'operator.admin';
    api.session.controls.registerSessionAction({
      id: actionId,
      description: `Claw-Onshape ${actionId}`,
      requiredScopes: [required],
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          connectionRef: {type: 'string', pattern: '^[a-z][a-z0-9_-]{0,63}$'},
          goalId: {type: 'string'},
          nonce: {type: 'string'},
          expectedGoalHash: {type: 'string'},
          sequence: {type: 'integer'},
          featureId: {type: 'string'},
          sourceMicroversion: {type: 'string'},
          admittedAt: {type: 'integer'},
        },
      },
      async handler(action): Promise<PluginSessionActionResult> {
        const response = (value: unknown) => ({ok: true as const, result: JSON.parse(JSON.stringify(value))});
        try {
          const initial = current();
          const snapshot = authorizationSnapshot(initial);
          const assertOperator = () => {
            if (!action.client?.scopes.includes(required) || !matchesAuthorizationSnapshot(current(), snapshot)) {
              throw new Error('authorization_changed');
            }
          };
          assertOperator();
          const payload: unknown = action.payload ?? {};
          if (
            !payload ||
            typeof payload !== 'object' ||
            Array.isArray(payload) ||
            Object.keys(payload).some((key) => !(GOAL_ACTION_KEYS[actionId] as readonly string[]).includes(key))
          ) {
            throw new Error('invalid_arguments');
          }
          // Validated as a plain JSON object with only the listed keys; each value is checked where it is used.
          const input = payload as Record<string, unknown>;
          const ref = input.connectionRef;
          if (ref !== undefined && (typeof ref !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(ref))) {
            throw new Error('invalid_arguments');
          }
          const bindings = initial.bindings.filter((b) => ref === undefined || b.connectionRef === ref);
          if (bindings.length !== 1) {
            throw new Error('not_configured');
          }
          const binding = bindings[0];
          const stateDir = api.runtime.state.resolveStateDir();
          const store = await credentials(
            stateDir,
            binding.connectionRef,
            connectionOwner(binding),
            initial.localMcp?.credentialDirectory,
          );
          const readGuard = () => {
            assertOperator();
            if (!current().liveReads) {
              throw new Error('live_reads_disabled');
            }
          };
          const client = new RestClient(() => accessToken(store, initial.oauth, readGuard));
          const ctx: GoalContext = {
            stateDir,
            config: initial,
            binding,
            client,
            fetcher: goalFetcher,
            now,
            guard: assertOperator,
          };
          if (actionId === 'goal-status') {
            // CR-1: the operator view of the current goal carries the confirmation nonce while it awaits confirmation.
            const {goal, history} = await goalStatus(ctx, undefined, {operatorNonce: true});
            assertOperator();
            return response({
              ok: true,
              goal: goal ? boundedGoal(goal) : null,
              history: history.map((view) => boundedView(view, GOAL_HISTORY_VIEW_MAX_BYTES)),
            });
          }
          if (actionId === 'goal-close') {
            return response({ok: true, goal: boundedGoal(await closeGoal(ctx, input.goalId))});
          }
          if (actionId === 'goal-stop') {
            return response({
              ok: true,
              goal: boundedGoal(await stopGoal(ctx, input.goalId, 'Stopped by the operator.')),
            });
          }
          if (actionId === 'goal-reconcile') {
            readGuard();
            // connectionRef selects the binding only; {goalId} alone reconciles from the summary entry (goal-1.1.0).
            const {connectionRef: _ref, ...data} = input;
            return response({ok: true, goal: boundedGoal(await reconcileGoal(ctx, data))});
          }
          readGuard();
          // The Candidate is created from Primary through the existing candidate path (REST OAuth2Write).
          const source = {...binding, workspaceId: binding.primaryWorkspaceId};
          const creator = new RestClient(() => accessToken(store, initial.oauth, readGuard), fetch, {
            stateDir,
            authorization: operatorGoalCandidateAuthorization(current, binding, stateDir, assertOperator),
          });
          const goal = await confirmGoal(
            ctx,
            {goalId: input.goalId, nonce: input.nonce, expectedGoalHash: input.expectedGoalHash},
            {
              kind: 'dashboard-operator',
              ...(typeof action.client?.connId === 'string' ? {clientId: action.client.connId} : {}),
              scopes: action.client?.scopes ?? [],
            },
            {
              readAttempt: async () => (await candidateAttempts(stateDir, source)).exclusive(async (r) => r.read()),
              create: (candidateInput) => creator.prepareCandidateWorkspace(source, candidateInput),
            },
          );
          return response({ok: true, goal: boundedGoal(goal)});
        } catch (e) {
          return response({ok: false, ...userError(e)});
        }
      },
    });
  }
}

// work-context.md §4 and §11.2. Input keys are strict (invalid_arguments); connectionRef resolves exactly one binding
// as in workspace-context. Every response is {ok: true, ...} or {ok: false, code, message}.
const WORK_CONTEXT_ACTIONS = {
  'work-context-catalog': {scope: 'operator.read', keys: ['connectionRef']},
  'work-context-preview': {
    scope: 'operator.read',
    keys: ['connectionRef', 'documentId', 'workspaceId', 'elementId', 'partId', 'observedMicroversion'],
  },
  'work-context-documents': {scope: 'operator.read', keys: ['connectionRef', 'query', 'offset', 'filter']},
  'work-context-workspaces': {scope: 'operator.read', keys: ['connectionRef', 'documentId']},
  'work-context-parts': {
    scope: 'operator.read',
    keys: ['connectionRef', 'documentId', 'workspaceId', 'query', 'elementId'],
  },
  'work-context-status': {scope: 'operator.read', keys: ['connectionRef']},
  'work-context-adopt': {
    scope: 'operator.admin',
    keys: [
      'connectionRef',
      'expectedSelectionRevision',
      'documentId',
      'workspaceId',
      'elementId',
      'partId',
      'observedMicroversion',
    ],
  },
  'work-context-clear': {scope: 'operator.admin', keys: ['connectionRef', 'expectedSelectionRevision']},
} as const;
// Methods that use the §11.4 cache and per-connection serialization (the extended preview included).
const BROWSE_ACTIONS: ReadonlySet<string> = new Set([
  'work-context-documents',
  'work-context-workspaces',
  'work-context-parts',
  'work-context-preview',
]);
const WORK_CONTEXT_PROPERTIES: Record<string, Record<string, string | number>> = {
  connectionRef: {type: 'string', pattern: '^[a-z][a-z0-9_-]{0,63}$'},
  expectedSelectionRevision: {type: 'integer', minimum: 0},
  documentId: {type: 'string'},
  workspaceId: {type: 'string'},
  elementId: {type: 'string'},
  partId: {type: 'string'},
  observedMicroversion: {type: 'string'},
  query: {type: 'string'},
  offset: {type: 'integer', minimum: 0},
  filter: {type: 'string'},
};

function registerWorkContextActions(api: OpenClawPluginApi, current: () => Config, now: () => number) {
  // §11.4: browsing cache of this plugin instance, in memory only; dispose and host cleanup drop it.
  const browseCache = new BrowseCache(now);
  api.lifecycle.registerRuntimeLifecycle({
    id: 'work-context-browse-cache',
    dispose: () => browseCache.clear(),
    cleanup: () => browseCache.clear(),
  });
  for (const actionId of Object.keys(WORK_CONTEXT_ACTIONS) as (keyof typeof WORK_CONTEXT_ACTIONS)[]) {
    const {scope: required, keys} = WORK_CONTEXT_ACTIONS[actionId];
    api.session.controls.registerSessionAction({
      id: actionId,
      description: `Claw-Onshape ${actionId}`,
      requiredScopes: [required],
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: Object.fromEntries(keys.map((key) => [key, WORK_CONTEXT_PROPERTIES[key]])),
      },
      async handler(action): Promise<PluginSessionActionResult> {
        const response = (value: unknown) => ({ok: true as const, result: JSON.parse(JSON.stringify(value))});
        try {
          const initial = current();
          const snapshot = authorizationSnapshot(initial);
          const guard = () => {
            if (!action.client?.scopes.includes(required) || !matchesAuthorizationSnapshot(current(), snapshot)) {
              throw new Error('authorization_changed');
            }
          };
          guard();
          const payload: unknown = action.payload ?? {};
          if (
            !payload ||
            typeof payload !== 'object' ||
            Array.isArray(payload) ||
            Object.keys(payload).some((key) => !(keys as readonly string[]).includes(key))
          ) {
            throw new Error('invalid_arguments');
          }
          // Validated as a plain JSON object with only the listed keys; each value is checked by the service.
          const input = payload as Record<string, unknown>;
          const ref = input.connectionRef;
          if (ref !== undefined && (typeof ref !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(ref))) {
            throw new Error('invalid_arguments');
          }
          const bindings = initial.bindings.filter((b) => ref === undefined || b.connectionRef === ref);
          if (bindings.length !== 1) {
            throw new Error('not_configured');
          }
          const binding = bindings[0];
          const stateDir = api.runtime.state.resolveStateDir();
          const store = await credentials(
            stateDir,
            binding.connectionRef,
            connectionOwner(binding),
            initial.localMcp?.connectionRef === binding.connectionRef
              ? initial.localMcp.credentialDirectory
              : undefined,
          );
          const readGuard = () => {
            guard();
            if (!current().liveReads) {
              throw new Error('live_reads_disabled');
            }
          };
          let usedToken: string | undefined;
          const client = new RestClient(async () => {
            usedToken = await accessToken(store, initial.oauth, readGuard);
            readGuard();
            return usedToken;
          });
          const deps: WorkContextDeps = {
            stateDir,
            config: initial,
            binding,
            client,
            now,
            guard,
            readGuard,
            // Late-reply fence (§5 step 7): the token the reads used is still the stored one.
            fence: () => {
              guard();
              if (usedToken !== undefined && store.read().accessToken !== usedToken) {
                throw new Error('authorization_changed');
              }
            },
          };
          if (BROWSE_ACTIONS.has(actionId)) {
            // Scope fingerprint: authorization snapshot, binding and the hash of the access token in use. A changed
            // authorization, binding or token (refresh, disconnect/reconnect) selects a fresh, empty partition. The
            // token is read first, so a disconnected connection fails before any cached data is served.
            const token = await accessToken(store, initial.oauth, readGuard);
            readGuard();
            const scope = sha256Hex(JSON.stringify([snapshot, bindingKey(binding), sha256Hex(token)]));
            deps.browse = browseCache.access(binding.connectionRef, scope);
          }
          if (actionId === 'work-context-documents') {
            return response({ok: true, documents: await workContextDocuments(deps, input)});
          }
          if (actionId === 'work-context-workspaces') {
            return response({ok: true, workspaces: await workContextWorkspaces(deps, input)});
          }
          if (actionId === 'work-context-parts') {
            return response({ok: true, parts: await workContextParts(deps, input)});
          }
          if (actionId === 'work-context-catalog') {
            return response({ok: true, catalog: await workContextCatalog(deps)});
          }
          if (actionId === 'work-context-preview') {
            return response({ok: true, preview: await workContextPreview(deps, input)});
          }
          if (actionId === 'work-context-status') {
            return response({ok: true, workContext: await workContextStatus(deps)});
          }
          if (actionId === 'work-context-clear') {
            return response({ok: true, workContext: await clearWorkContext(deps, input)});
          }
          // Same confirmer identity rule as goal-confirm (goal-workflow GW2).
          const adoptedBy = {
            kind: 'dashboard-operator' as const,
            ...(typeof action.client?.connId === 'string' ? {clientId: action.client.connId} : {}),
          };
          return response({ok: true, workContext: await adoptWorkContext(deps, input, adoptedBy)});
        } catch (e) {
          return response({ok: false, ...userError(e)});
        }
      },
    });
  }
}
