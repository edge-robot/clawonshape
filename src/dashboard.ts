import type {OpenClawPluginApi, PluginSessionActionResult} from 'openclaw/plugin-sdk/core';
import type {Config} from './config.ts';
import {connectionOwner} from './config.ts';
import {connectionLifecycle, CALLBACK_PATH} from './connections.ts';
import {RestClient, validatedDisplayNames} from './rest.ts';
import {operatorCandidateAuthorization} from './candidate-authorization.ts';
import {credentials} from './credentials.ts';
import {accessToken} from './authorization.ts';
import {authorizationSnapshot, matchesAuthorizationSnapshot} from './authorization-snapshot.ts';
import {mutationStore} from './mutation-workflow.ts';
import path from 'node:path';
import {state, userError} from './readiness.ts';
import {mcpReadiness, localMcpReadiness} from './mcp.ts';
import {imageHash, IMAGE_SIZE} from './render.ts';

// OpenClaw 2026.9.9 plugin JSON: 65,536 chars/string, 262,144 serialized bytes.
// Leave metadata/envelope headroom; larger images fail closed, without resizing evidence.
export const DASHBOARD_PNG_MAX_BYTES = 180_000;
export function registerDashboard(
  api: OpenClawPluginApi,
  current: () => Config,
  readMcp: typeof mcpReadiness = mcpReadiness,
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
  api.registerHttpRoute({path: CALLBACK_PATH, match: 'exact', auth: 'plugin', handler: lifecycle.callback});
  api.lifecycle.registerRuntimeLifecycle({id: 'onshape-consent', dispose: lifecycle.cancel, cleanup: lifecycle.cancel});
  return lifecycle;
}
