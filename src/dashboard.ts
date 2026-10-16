import type {OpenClawPluginApi} from 'openclaw/plugin-sdk/core';
import type {Config} from './config.ts';
import {connectionOwner} from './config.ts';
import {connectionLifecycle, CALLBACK_PATH} from './connections.ts';
import {RestClient} from './rest.ts';
import {operatorCandidateAuthorization} from './candidate-authorization.ts';
import {credentials} from './credentials.ts';
import {accessToken} from './authorization.ts';
import {authorizationSnapshot, matchesAuthorizationSnapshot} from './authorization-snapshot.ts';
import {mutationStore} from './mutation-workflow.ts';
import path from 'node:path';
import {userError} from './readiness.ts';
import {mcpReadiness, localMcpReadiness} from './mcp.ts';
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
            return response({
              status: 'ok',
              target: {
                documentId: binding.documentId,
                workspaceId: binding.workspaceId,
                elementId: binding.elementId,
                primaryWorkspaceId: binding.primaryWorkspaceId,
              },
              oauthWrite: store.read(true).scopes.includes('OAuth2Write'),
              proposals: await proposals.list(),
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
