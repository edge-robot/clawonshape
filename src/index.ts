import {sameBinding, sameOAuth, sameDelegation, sameAuthorizedBinding} from './authorization-snapshot.ts';
import type {AnyAgentTool, OpenClawPluginApi, OpenClawPluginToolContext} from 'openclaw/plugin-sdk/core';
import {parseConfig, connectionOwner, id} from './config.ts';
import {RestClient, validateFeatureObservation, validateFeatureReadEvidence} from './rest.ts';
import type {FeatureReadEvidence} from './rest.ts';
import {credentials} from './credentials.ts';
import {registerCli} from './cli.ts';
import {registerDashboard} from './dashboard.ts';
import {userError} from './readiness.ts';
import {
  authorizedBinding,
  leadBinding,
  delegateRender,
  delegateTask,
  validateEngineeringTask,
  verifyTaskEnvelope,
  delegationKeySync,
  signResult,
} from './delegation.ts';
import {saveRender, readRender, imageHash} from './render.ts';
import {accessToken} from './authorization.ts';
import {mcpTokenOwner} from './mcp-token-owner.ts';
import {mutationStore, mutationToolFailure} from './mutation-workflow.ts';
import {registerGoalTools} from './goal-tools.ts';
import type {OutboundLoader} from './goal-delivery.ts';
import {goalForReport} from './goal-service.ts';
import {reportView} from './goal-lifecycle.ts';
import type {WorkContextView} from './work-context.ts';
import {workContextStatus} from './work-context-service.ts';
import path from 'node:path';
export default {
  id: 'claw-onshape',
  name: 'Claw-Onshape',
  register(api: OpenClawPluginApi) {
    const config = parseConfig(api.pluginConfig);
    const current = () => {
      const entry = api.runtime.config.current().plugins?.entries?.['claw-onshape'];
      if (entry?.enabled !== true) {
        throw new Error('authorization_changed');
      }
      return parseConfig(entry.config);
    };
    // §6.3 WorkContextView for the Engineer's onshape_status: the selection revalidated with plugin REST reads (R1–R4)
    // under the tool's authorization; read failures become validity "unverified" with the read code.
    const engineerWorkContext = async (
      ctx: OpenClawPluginToolContext<2>,
      initial: NonNullable<ReturnType<typeof authorizedBinding>>,
    ): Promise<WorkContextView> => {
      const binding = initial.binding;
      const oauth = current().oauth;
      const guard = () => {
        ctx.assertInvocationCurrent?.();
        const c = current();
        const a = authorizedBinding(c, ctx);
        if (!a || !sameAuthorizedBinding(a, initial) || !sameOAuth(c.oauth, oauth)) {
          throw new Error('authorization_changed');
        }
      };
      const readGuard = () => {
        guard();
        if (!current().liveReads) {
          throw new Error('live_reads_disabled');
        }
      };
      const stateDir = api.runtime.state.resolveStateDir();
      const store = () => {
        const c = current();
        return credentials(
          stateDir,
          binding.connectionRef,
          connectionOwner(binding),
          c.localMcp?.connectionRef === binding.connectionRef ? c.localMcp.credentialDirectory : undefined,
        );
      };
      let usedToken: string | undefined;
      const client = new RestClient(async () => {
        usedToken = await accessToken(await store(), oauth, readGuard);
        readGuard();
        return usedToken;
      });
      return workContextStatus({
        stateDir,
        config: current(),
        binding,
        client,
        now: Date.now,
        guard,
        readGuard,
        fence: async () => {
          guard();
          if (usedToken !== undefined && (await store()).read().accessToken !== usedToken) {
            throw new Error('authorization_changed');
          }
        },
      });
    };
    registerCli(api, config);
    // Only the long-running gateway owns access-token.json (edge-robot/clawonshape#16). `openclaw onshape …` CLI
    // invocations load the plugin in "discovery" mode and retire that instance through runtime-lifecycle dispose,
    // so neither the owner nor its null-on-dispose may hang off register() or registerRuntimeLifecycle. Plugin
    // services are started and stopped only by the gateway; the mode check keeps non-gateway loads inert.
    if (config.localMcp && api.registrationMode === 'full') {
      let owner: ReturnType<typeof mcpTokenOwner> | undefined;
      api.registerService({
        id: 'onshape-mcp-access-owner',
        start: () => {
          owner ??= mcpTokenOwner(
            current,
            () => api.runtime.state.resolveStateDir(),
            (message) => api.logger.warn(message),
          );
          owner.start();
        },
        stop: async () => {
          const stopping = owner;
          owner = undefined;
          await stopping?.dispose();
        },
      });
    }
    const lifecycle = registerDashboard(api, current);
    // goal-workflow.md §7: outbound text to the recorded origin through the host channel adapter (ADR-2026-10-16
    // spike rule 3). The target is the host-provided conversation target stored with the goal origin.
    const outboundFor =
      (ctx: OpenClawPluginToolContext<2>): OutboundLoader =>
      async (channel) => {
        const cfg = ctx.getRuntimeConfig?.() ?? ctx.runtimeConfig ?? ctx.config;
        const adapter = await api.runtime.channel.outbound.loadAdapter(channel);
        const sendText = adapter?.sendText;
        if (!cfg || !sendText) {
          return undefined;
        }
        return async ({to, text, accountId}) => {
          await sendText({cfg, to, text, accountId: accountId ?? null});
        };
      };
    api.registerTool(
      {
        contextVersion: 2,
        create: (ctx: OpenClawPluginToolContext<2>) => {
          const initial = authorizedBinding(config, ctx)?.binding;
          if (!initial) {
            return null;
          }
          return {
            name: 'onshape_inspect',
            label: 'Inspect active Onshape workspace',
            description:
              'Read document/workspace membership and element identifiers for your configured Onshape context.',
            // Native runtime accepts JSON Schema. The SDK types carry TypeBox metadata
            // which this dependency-free, empty object schema does not need at runtime.
            parameters: {type: 'object', properties: {}, additionalProperties: false} as AnyAgentTool['parameters'],
            async execute(_callId: string, params: unknown) {
              const guard = () => {
                ctx.assertInvocationCurrent?.();
                const c = current();
                const b = authorizedBinding(c, ctx)?.binding;
                if (!b || !sameBinding(b, initial)) {
                  throw new Error('authorization_changed');
                }
                if (!c.liveReads) {
                  throw new Error('live_reads_disabled');
                }
                return b;
              };
              try {
                if (!params || typeof params !== 'object' || Array.isArray(params) || Object.keys(params).length) {
                  throw new Error('invalid_arguments');
                }
                const b = guard();
                const store = await credentials(
                  api.runtime.state.resolveStateDir(),
                  b.connectionRef,
                  connectionOwner(b),
                  current().localMcp?.connectionRef === b.connectionRef
                    ? current().localMcp?.credentialDirectory
                    : undefined,
                );
                let usedToken: string | undefined;
                const oauth = current().oauth;
                const tokenGuard = () => {
                  guard();
                  if (!sameOAuth(current().oauth, oauth)) {
                    throw new Error('authorization_changed');
                  }
                };
                const client = new RestClient(async () => {
                  usedToken = await accessToken(store, oauth, tokenGuard);
                  return usedToken;
                });
                let result: Awaited<ReturnType<typeof client.inspect>>;
                try {
                  result = await client.inspect(b);
                } catch (e) {
                  if (e instanceof Error && e.message === 'reconnect_required' && usedToken) {
                    try {
                      await store.exclusive(async () => {
                        if (store.read().accessToken === usedToken) {
                          await store.save(null);
                        }
                      });
                      // biome-ignore lint/suspicious/noEmptyBlockStatements: TODO(#9): failure to clear the stale grant is swallowed; the original error is rethrown
                    } catch {}
                  }
                  throw e;
                }
                guard();
                if (store.read().accessToken !== usedToken) {
                  throw new Error('authorization_changed');
                }
                return {content: [{type: 'text' as const, text: JSON.stringify(result)}], details: result};
              } catch (e) {
                const result = userError(e);
                return {
                  content: [{type: 'text' as const, text: result.message}],
                  details: {error: result.code, ...result},
                  isError: true,
                };
              }
            },
          };
        },
      },
      {optional: true},
    );
    const emptySchema = {type: 'object', properties: {}, additionalProperties: false} as AnyAgentTool['parameters'];
    const noArgs = (params: unknown) => {
      if (!params || typeof params !== 'object' || Array.isArray(params) || Object.keys(params).length) {
        throw new Error('invalid_arguments');
      }
    };
    const signedDetails = (ctx: OpenClawPluginToolContext, details: Record<string, unknown>) => {
      const c = current(),
        auth = authorizedBinding(c, ctx);
      return auth?.contextId
        ? {...details, delegationProof: signResult(details, auth.contextId, delegationKeySync(c))}
        : details;
    };
    api.registerTool(
      {
        contextVersion: 2,
        create: (ctx: OpenClawPluginToolContext<2>) => {
          const b = leadBinding(config, ctx);
          if (!b) {
            return null;
          }
          return {
            name: 'onshape_delegate_task',
            label: 'Delegate engineering task',
            description:
              'Delegate a freely formulated inspect, edit, verify or goal task to Mechanical Engineer and its Workshop skills. The host signs the exact request; an edit request alone does not approve CAD writes. For workflow goal the host also signs this conversation as the goal origin; a goal is confirmed only by the operator in the dashboard.',
            parameters: {
              type: 'object',
              properties: {
                workflow: {type: 'string', enum: ['inspect', 'edit', 'verify', 'goal']},
                task: {type: 'string', minLength: 1, maxLength: 8000},
                approvalId: {
                  type: 'string',
                  description: 'Previously operator-approved proposal to execute; optional for edit.',
                },
                goalId: {
                  type: 'string',
                  description:
                    'Existing goal to continue, resume or revise; workflow goal only, optional on the first delegation.',
                },
              },
              required: ['workflow', 'task'],
              additionalProperties: false,
            } as AnyAgentTool['parameters'],
            async execute(_id: string, params: unknown) {
              const guard = () => {
                ctx.assertInvocationCurrent?.();
                if (
                  !sameBinding(leadBinding(current(), ctx), b) ||
                  !sameDelegation(current().delegation, config.delegation)
                ) {
                  throw new Error('authorization_changed');
                }
              };
              try {
                validateEngineeringTask(params);
                guard();
                if (params.workflow === 'goal') {
                  const details = await goalTools.leadDelegate(ctx, b, {
                    task: params.task,
                    ...(params.goalId ? {goalId: params.goalId} : {}),
                  });
                  return {
                    content: [{type: 'text' as const, text: JSON.stringify(details)}],
                    details,
                    ...(['blocked', 'unavailable'].includes(details.status as string) ? {isError: true} : {}),
                  };
                }
                const details = await delegateTask(current(), b, guard, params, undefined, undefined, (message) =>
                  api.logger.warn(message),
                );
                guard();
                return {
                  content: [{type: 'text' as const, text: JSON.stringify(details)}],
                  details,
                  ...(['blocked', 'unavailable'].includes(details.status as string) ? {isError: true} : {}),
                };
              } catch (e) {
                const details = userError(e);
                return {content: [{type: 'text' as const, text: details.message}], details, isError: true};
              }
            },
          };
        },
      },
      {optional: true},
    );
    for (const operation of ['propose', 'context', 'reconcile'] as const) {
      api.registerTool(
        {
          contextVersion: 2,
          create: (ctx: OpenClawPluginToolContext<2>) => {
            const initial = authorizedBinding(config, ctx);
            if (!initial?.contextId) {
              return null;
            }
            const name = {
              propose: 'onshape_propose_update',
              context: 'onshape_mutation_context',
              reconcile: 'onshape_reconcile_update',
            }[operation];
            return {
              name,
              label: name,
              description:
                operation === 'propose'
                  ? 'Record a complete Candidate feature update proposal for operator review; performs no CAD write.'
                  : operation === 'context'
                    ? 'Get the approved Candidate update for this signed task; performs no MCP call. Returns apiCall: ' +
                      'parse the text result if needed and pass apiCall unchanged as the arguments of ' +
                      'onshape__onshape_api_call, exactly once, then call onshape_reconcile_update.'
                    : 'Independently reconcile Candidate parameters/state and Primary preservation after a native update; ' +
                      'never retries a write. Terminal outcomes: VERIFIED, or REJECTED with reason ' +
                      'approval_expired_not_dispatched when the approval expired without execution; report REJECTED ' +
                      'and stop, a new proposal is required.',
              parameters: {
                type: 'object',
                properties: {
                  request: {type: 'object', additionalProperties: true},
                  ...(operation === 'propose'
                    ? {
                        body: {type: 'object', additionalProperties: true},
                        summary: {type: 'string', minLength: 1, maxLength: 6000},
                      }
                    : {proposalId: {type: 'string'}}),
                },
                required: operation === 'propose' ? ['request', 'body', 'summary'] : ['request', 'proposalId'],
                additionalProperties: false,
              } as AnyAgentTool['parameters'],
              async execute(_id: string, params: unknown) {
                const guard = () => {
                  ctx.assertInvocationCurrent?.();
                  const auth = authorizedBinding(current(), ctx);
                  if (!auth || !sameAuthorizedBinding(auth, initial)) {
                    throw new Error('authorization_changed');
                  }
                  return auth.binding;
                };
                try {
                  if (!params || typeof params !== 'object' || Array.isArray(params)) {
                    throw new Error('invalid_arguments');
                  }
                  const p = params as {request: unknown; body: unknown; summary: string; proposalId: string};
                  const b = guard(),
                    c = current();
                  // biome-ignore lint/style/noNonNullAssertion: narrowed by the initial?.contextId guard at factory creation; lost in this closure
                  verifyTaskEnvelope(p.request, b, initial.contextId!, delegationKeySync(c));
                  if (p.request.workflow !== 'edit' && operation !== 'reconcile') {
                    throw new Error('invalid_arguments');
                  }
                  if (b.workspaceId === b.primaryWorkspaceId) {
                    throw new Error('protected_primary_workspace');
                  }
                  if (!c.liveReads || !c.localMcp) {
                    throw new Error('live_reads_disabled');
                  }
                  const store = await credentials(
                    api.runtime.state.resolveStateDir(),
                    b.connectionRef,
                    connectionOwner(b),
                    c.localMcp.credentialDirectory,
                  );
                  const tokenGuard = () => {
                    guard();
                    if (!sameOAuth(current().oauth, c.oauth)) {
                      throw new Error('authorization_changed');
                    }
                  };
                  const client = new RestClient(() => accessToken(store, c.oauth, tokenGuard));
                  const proposals = await mutationStore(api.runtime.state.resolveStateDir(), b);
                  let result: object;
                  if (operation === 'propose') {
                    result = await proposals.propose(p.request, p.body, p.summary, client);
                  } else {
                    if (operation === 'context' && p.request.approvalId !== p.proposalId) {
                      throw new Error('mutation_approval_unavailable');
                    }
                    result =
                      operation === 'context'
                        ? await proposals.executionContext(p.proposalId)
                        : await proposals.reconcile(
                            p.proposalId,
                            client,
                            path.join(c.localMcp.credentialDirectory, 'mutation-approvals'),
                          );
                  }
                  guard();
                  const details = {status: 'ok', ...result};
                  return {content: [{type: 'text' as const, text: JSON.stringify(details)}], details};
                } catch (e) {
                  // Same logger path as claw_onshape.candidate_authorization_rejected; the creation-time binding
                  // identifies the owner even when the authorization guard itself failed.
                  return mutationToolFailure(name, e, initial.binding, (message) => api.logger.warn(message));
                }
              },
            };
          },
        },
        {optional: true},
      );
    }
    api.registerTool(
      {
        contextVersion: 2,
        create: (ctx: OpenClawPluginToolContext<2>) => {
          const initial = authorizedBinding(config, ctx);
          if (!initial?.contextId) {
            return null;
          }
          return {
            name: 'onshape_complete_task',
            label: 'Complete signed engineering task',
            description:
              'Verify the Lead request signature and independently check arbitrary observed feature parameters/state, then sign the engineering report for A2A. Summary and plans remain agent interpretation; this tool never invokes MCP or grants a write.',
            parameters: {
              type: 'object',
              properties: {
                request: {type: 'object', additionalProperties: true},
                status: {type: 'string', enum: ['ok', 'planned', 'blocked', 'unavailable']},
                summary: {type: 'string', minLength: 1, maxLength: 6000},
                proposalId: {type: 'string'},
                goalId: {
                  type: 'string',
                  description: 'Goal of a workflow goal request; the report carries its result.',
                },
                evidence: {
                  type: 'object',
                  properties: {
                    microversionId: {type: 'string'},
                    observations: {
                      type: 'array',
                      minItems: 1,
                      maxItems: 50,
                      items: {
                        type: 'object',
                        properties: {
                          featureId: {type: 'string'},
                          featureStatus: {type: 'string'},
                          parameterId: {type: 'string'},
                          expression: {type: 'string'},
                        },
                        required: ['featureId', 'featureStatus'],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ['microversionId', 'observations'],
                  additionalProperties: false,
                },
              },
              required: ['request', 'status', 'summary'],
              additionalProperties: false,
            } as AnyAgentTool['parameters'],
            async execute(_id: string, params: unknown) {
              const guard = () => {
                ctx.assertInvocationCurrent?.();
                const a = authorizedBinding(current(), ctx);
                if (!a || !sameAuthorizedBinding(a, initial)) {
                  throw new Error('authorization_changed');
                }
                return a.binding;
              };
              try {
                if (
                  !params ||
                  typeof params !== 'object' ||
                  Array.isArray(params) ||
                  Object.keys(params).some(
                    (k) => !['request', 'status', 'summary', 'evidence', 'proposalId', 'goalId'].includes(k),
                  )
                ) {
                  throw new Error('invalid_arguments');
                }
                const p = params as {
                  request: unknown;
                  status: string;
                  summary: string;
                  proposalId?: string;
                  goalId?: unknown;
                  evidence?: FeatureReadEvidence;
                };
                if (
                  !['ok', 'planned', 'blocked', 'unavailable'].includes(p.status) ||
                  typeof p.summary !== 'string' ||
                  !p.summary.trim() ||
                  p.summary.length > 6000
                ) {
                  throw new Error('invalid_arguments');
                }
                const b = guard(),
                  c = current();
                // biome-ignore lint/style/noNonNullAssertion: narrowed by the initial?.contextId guard at factory creation; lost in this closure
                verifyTaskEnvelope(p.request, b, initial.contextId!, delegationKeySync(c));
                let goal: object | undefined;
                if (p.goalId !== undefined) {
                  if (p.request.workflow !== 'goal') {
                    throw new Error('invalid_arguments');
                  }
                  // The goal result comes from the durable goal record, never from the agent's summary.
                  goal = reportView(await goalForReport(await goalTools.engineerContext(ctx, initial), p.goalId));
                }
                let mutationOutcome: string | undefined;
                if (p.proposalId) {
                  const proposals = await mutationStore(api.runtime.state.resolveStateDir(), b);
                  mutationOutcome = (await proposals.read(p.proposalId)).status;
                }
                let verified: object | undefined;
                if (p.evidence) {
                  validateFeatureReadEvidence(p.evidence);
                  if (!c.liveReads) {
                    throw new Error('live_reads_disabled');
                  }
                  const store = await credentials(
                    api.runtime.state.resolveStateDir(),
                    b.connectionRef,
                    connectionOwner(b),
                    c.localMcp?.credentialDirectory,
                  );
                  const oauth = c.oauth;
                  let usedToken: string | undefined;
                  const tokenGuard = () => {
                    guard();
                    if (!sameOAuth(current().oauth, oauth)) {
                      throw new Error('authorization_changed');
                    }
                  };
                  const client = new RestClient(async () => {
                    usedToken = await accessToken(store, oauth, tokenGuard);
                    return usedToken;
                  });
                  verified = await client.verifyFeatureEvidence(b, p.evidence);
                  guard();
                  if (store.read().accessToken !== usedToken) {
                    throw new Error('authorization_changed');
                  }
                }
                const details = signedDetails(ctx, {
                  status: p.status,
                  summary: p.summary,
                  requestId: p.request.requestId,
                  requestHash: p.request.requestHash,
                  workflow: p.request.workflow,
                  ...(p.proposalId ? {proposalId: p.proposalId, mutationOutcome} : {}),
                  ...(goal ? {goalId: p.goalId, goal} : {}),
                  summaryVerification: 'agent_interpretation',
                  documentId: b.documentId,
                  workspaceId: b.workspaceId,
                  elementId: b.elementId,
                  ...(verified ? {evidence: verified} : {}),
                  verification: verified ? 'independent_rest_match' : 'agent_report',
                  onshapeUrl: `https://cad.onshape.com/documents/${b.documentId}/w/${b.workspaceId}/e/${b.elementId}`,
                });
                return {content: [{type: 'text' as const, text: JSON.stringify(details)}], details};
              } catch (e) {
                const details = userError(e);
                return {content: [{type: 'text' as const, text: details.message}], details, isError: true};
              }
            },
          };
        },
      },
      {optional: true},
    );
    api.registerTool(
      {
        contextVersion: 2,
        create: (ctx: OpenClawPluginToolContext<2>) => {
          const initial = authorizedBinding(config, ctx);
          if (!initial) {
            return null;
          }
          return {
            name: 'onshape_verify_feature_read',
            label: 'Verify native Onshape feature observation',
            description:
              'Independently verify a live native MCP plateWidth/feature state observation against the configured Onshape target. Call native MCP first; this tool never invokes MCP or modifies CAD.',
            parameters: {
              type: 'object',
              properties: {
                microversionId: {type: 'string'},
                featureId: {type: 'string'},
                plateWidth: {type: 'string'},
                featureStatus: {type: 'string'},
              },
              required: ['microversionId', 'featureId', 'plateWidth', 'featureStatus'],
              additionalProperties: false,
            } as AnyAgentTool['parameters'],
            async execute(_id: string, params: unknown) {
              const guard = () => {
                ctx.assertInvocationCurrent?.();
                const c = current(),
                  a = authorizedBinding(c, ctx);
                if (!a || !sameAuthorizedBinding(a, initial)) {
                  throw new Error('authorization_changed');
                }
                if (!c.liveReads) {
                  throw new Error('live_reads_disabled');
                }
                return a.binding;
              };
              try {
                validateFeatureObservation(params);
                const b = guard(),
                  c = current();
                const store = await credentials(
                  api.runtime.state.resolveStateDir(),
                  b.connectionRef,
                  connectionOwner(b),
                  c.localMcp?.connectionRef === b.connectionRef ? c.localMcp.credentialDirectory : undefined,
                );
                const oauth = c.oauth;
                const tokenGuard = () => {
                  guard();
                  if (!sameOAuth(current().oauth, oauth)) {
                    throw new Error('authorization_changed');
                  }
                };
                let usedToken: string | undefined;
                const client = new RestClient(async () => {
                  usedToken = await accessToken(store, oauth, tokenGuard);
                  return usedToken;
                });
                const verified = await client.verifyFeatureRead(b, params);
                guard();
                if (store.read().accessToken !== usedToken) {
                  throw new Error('authorization_changed');
                }
                const details = signedDetails(ctx, verified);
                return {content: [{type: 'text' as const, text: JSON.stringify(details)}], details};
              } catch (e) {
                let details: Record<string, unknown> = {status: 'unavailable', ...userError(e)};
                try {
                  details = signedDetails(ctx, details);
                } catch {
                  // Signing is best effort for error results; the result is isError either way.
                }
                return {content: [{type: 'text' as const, text: JSON.stringify(details)}], details, isError: true};
              }
            },
          };
        },
      },
      {optional: true},
    );
    api.registerTool(
      {
        contextVersion: 2,
        create: (ctx: OpenClawPluginToolContext<2>) => {
          const b = leadBinding(config, ctx);
          if (!b) {
            return null;
          }
          return {
            name: 'onshape_delegate_inspect',
            label: 'Ask Mechanical Engineer for live plate inspection',
            description:
              'Delegate a read-only native MCP Camera Mount Plate inspection over authenticated A2A and verify the signed independent REST evidence. Reports current width, feature state and revision.',
            parameters: emptySchema,
            async execute(_id: string, params: unknown) {
              const guard = () => {
                ctx.assertInvocationCurrent?.();
                const c = current();
                if (!sameBinding(leadBinding(c, ctx), b) || !sameDelegation(c.delegation, config.delegation)) {
                  throw new Error('authorization_changed');
                }
              };
              try {
                noArgs(params);
                guard();
                const details = await delegateRender(
                  current(),
                  b,
                  guard,
                  undefined,
                  undefined,
                  (message) => api.logger.warn(message),
                  true,
                );
                guard();
                if (details.status === 'ok') {
                  if (
                    details.documentId !== b.documentId ||
                    details.workspaceId !== b.workspaceId ||
                    details.elementId !== b.elementId ||
                    details.verification !== 'independent_rest_match'
                  ) {
                    throw new Error('delegation_denied');
                  }
                  validateFeatureObservation({
                    microversionId: details.microversionId,
                    featureId: details.featureId,
                    plateWidth: details.plateWidth,
                    featureStatus: details.featureStatus,
                  });
                }
                return {
                  content: [{type: 'text' as const, text: JSON.stringify(details)}],
                  details,
                  ...(details.status !== 'ok' ? {isError: true} : {}),
                };
              } catch (e) {
                const details = userError(e);
                return {content: [{type: 'text' as const, text: details.message}], details, isError: true};
              }
            },
          };
        },
      },
      {optional: true},
    );
    api.registerTool(
      {
        contextVersion: 2,
        create: (ctx: OpenClawPluginToolContext<2>) => {
          const auth = authorizedBinding(config, ctx);
          const engineer =
            config.engineerAgentId ?? config.delegation?.engineerAgentId ?? 'clawcad-mechanical-engineer';
          if (!auth && (ctx.agentId !== engineer || config.bindings.length)) {
            return null;
          }
          return {
            name: 'onshape_status',
            label: 'Claw-Onshape readiness',
            description:
              'Explain connection readiness and native dashboard onboarding, and report the adopted work context ' +
              '(revalidated with part metadata reads only). No geometry read, CAD write or credential exposure.',
            parameters: emptySchema,
            async execute(_id: string, params: unknown) {
              try {
                noArgs(params);
                ctx.assertInvocationCurrent?.();
                const c = current();
                const selected = authorizedBinding(c, ctx);
                if (auth && (!selected || !sameAuthorizedBinding(auth, selected))) {
                  throw new Error('authorization_changed');
                }
                const readiness = await lifecycle.status(selected?.binding.connectionRef);
                // work-context.md §6.3: the Engineer's status gains workContext (null without a bound element).
                const workContext = selected?.binding.elementId ? await engineerWorkContext(ctx, selected) : null;
                const details = signedDetails(ctx, {...readiness, workContext});
                return {content: [{type: 'text' as const, text: JSON.stringify(details)}], details};
              } catch (e) {
                const details = userError(e);
                return {content: [{type: 'text' as const, text: details.message}], details, isError: true};
              }
            },
          };
        },
      },
      {optional: true},
    );
    api.registerTool(
      {
        contextVersion: 2,
        create: (ctx: OpenClawPluginToolContext<2>) => {
          const initial = authorizedBinding(config, ctx);
          if (!initial) {
            return null;
          }
          return {
            name: 'onshape_render',
            label: 'Show Camera Mount Plate',
            description:
              'Inspect the configured Camera Mount Plate and return its current Onshape PNG view pinned to the inspected microversion. No CAD writes.',
            parameters: emptySchema,
            async execute(_id: string, params: unknown) {
              const guard = () => {
                ctx.assertInvocationCurrent?.();
                const c = current(),
                  a = authorizedBinding(c, ctx);
                if (!a || !sameAuthorizedBinding(a, initial)) {
                  throw new Error('authorization_changed');
                }
                if (!c.liveReads) {
                  throw new Error('live_reads_disabled');
                }
                return a.binding;
              };
              try {
                noArgs(params);
                const b = guard(),
                  store = await credentials(
                    api.runtime.state.resolveStateDir(),
                    b.connectionRef,
                    connectionOwner(b),
                    current().localMcp?.connectionRef === b.connectionRef
                      ? current().localMcp?.credentialDirectory
                      : undefined,
                  );
                const oauth = current().oauth;
                const tokenGuard = () => {
                  guard();
                  if (!sameOAuth(current().oauth, oauth)) {
                    throw new Error('authorization_changed');
                  }
                };
                let usedToken: string | undefined;
                const client = new RestClient(async () => {
                  usedToken = await accessToken(store, oauth, tokenGuard);
                  return usedToken;
                });
                const {bytes, metadata} = await client.render(b);
                guard();
                if (store.read().accessToken !== usedToken) {
                  throw new Error('authorization_changed');
                }
                if (!ctx.workspaceDir) {
                  throw new Error('credential_store_unavailable');
                }
                const filePath = await saveRender(ctx.workspaceDir, bytes);
                guard();
                if (store.read().accessToken !== usedToken) {
                  throw new Error('authorization_changed');
                }
                const details = signedDetails(ctx, {
                  ...metadata,
                  filePath,
                  sha256: imageHash(bytes),
                  bytes: bytes.length,
                });
                return {
                  content: [
                    {type: 'text' as const, text: JSON.stringify(details)},
                    {type: 'image' as const, data: bytes.toString('base64'), mimeType: 'image/png'},
                  ],
                  details,
                };
              } catch (e) {
                const explanation = userError(e);
                let details: Record<string, unknown> = {status: 'unavailable', ...explanation};
                try {
                  details = signedDetails(ctx, details);
                } catch {
                  // Signing is best effort for error results; the result is isError either way.
                }
                return {content: [{type: 'text' as const, text: JSON.stringify(details)}], details, isError: true};
              }
            },
          };
        },
      },
      {optional: true},
    );
    api.registerTool(
      {
        contextVersion: 2,
        create: (ctx: OpenClawPluginToolContext<2>) => {
          const b = leadBinding(config, ctx);
          if (!b) {
            return null;
          }
          return {
            name: 'onshape_delegate_render',
            label: 'Ask Mechanical Engineer for Camera Mount Plate',
            description:
              'Delegate a configured, requester-authorized read/render task to the Mechanical Engineer over native A2A. Lead receives no Onshape credential or direct CAD capability.',
            parameters: emptySchema,
            async execute(_id: string, params: unknown) {
              const guard = () => {
                ctx.assertInvocationCurrent?.();
                const c = current();
                if (!sameBinding(leadBinding(c, ctx), b) || !sameDelegation(c.delegation, config.delegation)) {
                  throw new Error('authorization_changed');
                }
              };
              try {
                noArgs(params);
                guard();
                const details = await delegateRender(current(), b, guard, undefined, undefined, (message) =>
                  api.logger.warn(message),
                );
                guard();
                if (details.status !== 'ok') {
                  return {
                    content: [
                      {
                        type: 'text' as const,
                        text:
                          typeof details.message === 'string'
                            ? details.message
                            : 'The Mechanical Engineer could not load the Camera Mount Plate.',
                      },
                    ],
                    details,
                    isError: true,
                  };
                }
                if (
                  details.documentId !== b.documentId ||
                  details.workspaceId !== b.workspaceId ||
                  details.elementId !== b.elementId ||
                  !id(details.microversionId) ||
                  typeof details.filePath !== 'string' ||
                  typeof details.sha256 !== 'string' ||
                  !ctx.workspaceDir
                ) {
                  throw new Error('delegation_denied');
                }
                const bytes = await readRender(ctx.workspaceDir, details.filePath, details.sha256);
                guard();
                if (ctx.delivery) {
                  await ctx.delivery.send({
                    text: `Camera Mount Plate — current inspected revision ${details.microversionId}. ${details.onshapeUrl}`,
                    mediaUrl: details.filePath,
                  });
                  guard();
                  details.delivered = true;
                }
                return {
                  content: [
                    {type: 'text' as const, text: JSON.stringify(details)},
                    {type: 'image' as const, data: bytes.toString('base64'), mimeType: 'image/png'},
                  ],
                  details,
                };
              } catch (e) {
                const details = userError(e);
                return {content: [{type: 'text' as const, text: details.message}], details, isError: true};
              }
            },
          };
        },
      },
      {optional: true},
    );
    // Registered last so that the existing tool order stays unchanged; the closures above run only after register().
    const goalTools = registerGoalTools(api, config, current, outboundFor);
  },
};
