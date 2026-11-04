// Agent tools of the goal workflow (docs/interface/goal-workflow.md §4.2). Engineer: propose, status, reconcile,
// verify, stop. Lead: status and stop, both through the signed A2A delegation (the goal store lives in the Engineer
// plugin). Every tool is a contextVersion 2 factory, returns null without a binding and re-checks authorization
// (ctx.assertInvocationCurrent plus the binding snapshot) immediately before every effect.
import type {AnyAgentTool, OpenClawPluginApi, OpenClawPluginToolContext} from 'openclaw/plugin-sdk/core';
import {sameAuthorizedBinding, sameBinding, sameDelegation, sameOAuth} from './authorization-snapshot.ts';
import {accessToken} from './authorization.ts';
import type {Config} from './config.ts';
import {connectionOwner} from './config.ts';
import {credentials} from './credentials.ts';
import type {GoalOrigin} from './delegation.ts';
import {authorizedBinding, delegateGoalTask, delegationKeySync, leadBinding, verifyTaskEnvelope} from './delegation.ts';
import type {OutboundLoader} from './goal-delivery.ts';
import {DeliveryFailure, deliverGoalResult, rememberGoalOrigin, resultText} from './goal-delivery.ts';
import type {GoalResult} from './goal-lifecycle.ts';
import {boundedView, uuidV4} from './goal-lifecycle.ts';
import type {GoalView} from './goal-lifecycle.ts';

// Tool results stay small enough for the agent context; failing checks are kept first.
const TOOL_VIEW_MAX_BYTES = 24_000;
const toolView = (view: GoalView) => boundedView(view, TOOL_VIEW_MAX_BYTES);
import type {GoalContext} from './goal-service.ts';
import {goalStatus, proposeGoal, reconcileGoal, stopGoal, validateOrigin, verifyGoal} from './goal-service.ts';
import {userError} from './readiness.ts';
import {RestClient} from './rest.ts';

type Ctx = OpenClawPluginToolContext<2>;
type Authorized = NonNullable<ReturnType<typeof authorizedBinding>>;

const schema = (value: object) =>
  // The native runtime accepts JSON Schema; the SDK type carries TypeBox metadata this plain schema does not need.
  value as AnyAgentTool['parameters'];
const conditionSchema = {
  type: 'object',
  properties: {
    id: {type: 'string', pattern: '^[a-z0-9-]{1,32}$'},
    kind: {type: 'string', enum: ['parameterEquals', 'featureState', 'featureUnchanged', 'note']},
    featureId: {type: 'string', pattern: '^[A-Za-z0-9_]{1,64}$'},
    parameterId: {type: 'string', minLength: 1, maxLength: 128},
    expression: {type: 'string', minLength: 1, maxLength: 200},
    state: {type: 'string', enum: ['OK']},
    text: {type: 'string', minLength: 1, maxLength: 500},
  },
  required: ['id', 'kind', 'text'],
  additionalProperties: false,
};
const reconcileProperties = {
  goalId: {type: 'string'},
  sequence: {type: 'integer', minimum: 1},
  featureId: {type: 'string'},
  sourceMicroversion: {type: 'string', pattern: '^[a-f0-9]{24}$'},
  admittedAt: {type: 'integer', minimum: 1},
  // Contract §6/§12.3 CR-5: the unknown-outcome error data merges these fixed fields; the Engineer passes the data
  // unchanged, so they are accepted with exactly these values and then ignored.
  outcome: {type: 'string', enum: ['UNKNOWN']},
  retryAllowed: {type: 'boolean', enum: [false]},
  reconciliationRequired: {type: 'boolean', enum: [true]},
};

// onshape_goal_reconcile input: the server error data as delivered (§12.3 CR-5), reduced to the §5 fields.
export function reconcileToolInput(params: unknown): Record<string, unknown> {
  const p = onlyKeys(params, Object.keys(reconcileProperties));
  if (
    ('outcome' in p && p.outcome !== 'UNKNOWN') ||
    ('retryAllowed' in p && p.retryAllowed !== false) ||
    ('reconciliationRequired' in p && p.reconciliationRequired !== true)
  ) {
    throw new Error('invalid_arguments');
  }
  const {outcome: _outcome, retryAllowed: _retry, reconciliationRequired: _required, ...data} = p;
  return data;
}

function ok(details: Record<string, unknown>) {
  return {content: [{type: 'text' as const, text: JSON.stringify(details)}], details};
}
function failure(error: unknown) {
  const details = userError(error);
  return {content: [{type: 'text' as const, text: details.message}], details, isError: true as const};
}
function onlyKeys(params: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    throw new Error('invalid_arguments');
  }
  if (Object.keys(params).some((key) => !keys.includes(key))) {
    throw new Error('invalid_arguments');
  }
  // Plain JSON object with only the listed keys; every value is validated by the goal service.
  return params as Record<string, unknown>;
}

// Origin of a Lead turn (GW1): the host-provided delivery route of the active conversation, never tool arguments.
export function leadOrigin(ctx: Ctx): GoalOrigin {
  const route = ctx.deliveryContext;
  return validateOrigin({
    channel: route?.channel,
    target: route?.to,
    ...(route?.accountId ? {accountId: route.accountId} : {}),
  });
}

export function registerGoalTools(
  api: OpenClawPluginApi,
  config: Config,
  current: () => Config,
  outboundFor: (ctx: Ctx) => OutboundLoader,
  fetcher: typeof fetch = fetch,
  now: () => number = Date.now,
) {
  const stateDir = () => api.runtime.state.resolveStateDir();

  const engineerContext = async (ctx: Ctx, initial: Authorized): Promise<GoalContext> => {
    const guard = () => {
      ctx.assertInvocationCurrent();
      const auth = authorizedBinding(current(), ctx);
      if (!auth || !sameAuthorizedBinding(auth, initial)) {
        throw new Error('authorization_changed');
      }
      return auth.binding;
    };
    const binding = guard();
    const c = current();
    const store = await credentials(
      stateDir(),
      binding.connectionRef,
      connectionOwner(binding),
      c.localMcp?.connectionRef === binding.connectionRef ? c.localMcp.credentialDirectory : undefined,
    );
    const tokenGuard = () => {
      guard();
      const latest = current();
      if (!sameOAuth(latest.oauth, c.oauth)) {
        throw new Error('authorization_changed');
      }
      if (!latest.liveReads) {
        throw new Error('live_reads_disabled');
      }
    };
    return {
      stateDir: stateDir(),
      config: c,
      binding,
      client: new RestClient(() => accessToken(store, c.oauth, tokenGuard)),
      fetcher,
      now,
      guard: () => {
        guard();
      },
    };
  };

  // Lead → Engineer goal delegation with the signed origin, followed by one result-delivery attempt (§7).
  const leadDelegate = async (
    ctx: Ctx,
    lead: NonNullable<ReturnType<typeof leadBinding>>,
    task: {task: string; goalId?: string},
  ) => {
    const guard = () => {
      ctx.assertInvocationCurrent();
      if (!sameBinding(leadBinding(current(), ctx), lead) || !sameDelegation(current().delegation, config.delegation)) {
        throw new Error('authorization_changed');
      }
    };
    const origin = leadOrigin(ctx);
    guard();
    const details = await delegateGoalTask(
      current(),
      lead,
      guard,
      {workflow: 'goal', ...task},
      origin,
      undefined,
      undefined,
      (message) => api.logger.warn(message),
    );
    guard();
    return deliverFromReport(ctx, details, origin);
  };

  const deliverFromReport = async (ctx: Ctx, details: Record<string, unknown>, origin: GoalOrigin) => {
    const goalId = details.goalId;
    if (!uuidV4(goalId)) {
      return details;
    }
    await rememberGoalOrigin(stateDir(), goalId, origin);
    const goal = details.goal;
    const result =
      goal && typeof goal === 'object' && !Array.isArray(goal) ? (goal as {result?: unknown}).result : undefined;
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      return details;
    }
    // Signed Engineer report (verified by delegateRender); the result shape is the §7 projection.
    const goalResult = result as GoalResult;
    try {
      ctx.assertInvocationCurrent();
      const delivery = await deliverGoalResult({
        stateDir: stateDir(),
        goalId,
        result: goalResult,
        current: ctx.deliveryContext,
        loadOutbound: outboundFor(ctx),
        now,
      });
      return {...details, goalResultDelivery: delivery, goalResultText: resultText(goalResult)};
    } catch (e) {
      // §7 step 3: the recorded receipt (with its failure) plus the code; never a provider text.
      const receipt = e instanceof DeliveryFailure ? e.receipt : undefined;
      return {...details, goalResultDelivery: {...receipt, ...userError(e)}};
    }
  };

  const leadResult = (details: Record<string, unknown>) => ({
    ...ok(details),
    ...(['blocked', 'unavailable'].includes(details.status as string) ? {isError: true as const} : {}),
  });

  // onshape_goal_propose (Engineer; signed Lead request with workflow "goal").
  api.registerTool(
    {
      contextVersion: 2,
      create: (ctx: Ctx) => {
        const initial = authorizedBinding(config, ctx);
        if (!initial?.contextId) {
          return null;
        }
        const contextId = initial.contextId;
        return {
          name: 'onshape_goal_propose',
          label: 'Propose a CAD goal for confirmation',
          description:
            'Record a goal (text, machine-checkable conditions, feature IDs, budget, lifetime) for one Candidate. ' +
            'Performs no CAD write and never confirms: the operator confirms it in the dashboard ("Verify Candidate"). ' +
            'Pass goalId to revise or renew a stopped, expired or blocked goal.',
          parameters: schema({
            type: 'object',
            properties: {
              request: {type: 'object', additionalProperties: true},
              goalText: {type: 'string', minLength: 1, maxLength: 2000},
              goalConditions: {type: 'array', minItems: 1, maxItems: 20, items: conditionSchema},
              preservationConditions: {type: 'array', maxItems: 20, items: conditionSchema},
              featureIds: {
                type: 'array',
                minItems: 1,
                maxItems: 32,
                items: {type: 'string', pattern: '^[A-Za-z0-9_]{1,64}$'},
              },
              maxDispatches: {type: 'integer', minimum: 1, maximum: 25},
              lifetimeMinutes: {type: 'integer', minimum: 1, maximum: 480},
              goalId: {type: 'string'},
            },
            required: ['request', 'goalText', 'goalConditions', 'featureIds'],
            additionalProperties: false,
          }),
          async execute(_id: string, params: unknown) {
            try {
              const p = onlyKeys(params, [
                'request',
                'goalText',
                'goalConditions',
                'preservationConditions',
                'featureIds',
                'maxDispatches',
                'lifetimeMinutes',
                'goalId',
              ]);
              const goal = await engineerContext(ctx, initial);
              verifyTaskEnvelope(p.request, goal.binding, contextId, delegationKeySync(goal.config));
              const view = await proposeGoal(goal, p.request, p);
              goal.guard();
              return ok({status: 'ok', goal: toolView(view)});
            } catch (e) {
              return failure(e);
            }
          },
        };
      },
    },
    {optional: true},
  );

  // onshape_goal_status (Lead through A2A, Engineer directly).
  api.registerTool(
    {
      contextVersion: 2,
      create: (ctx: Ctx) => {
        const lead = leadBinding(config, ctx);
        const initial = lead ? undefined : authorizedBinding(config, ctx);
        if (!lead && !initial) {
          return null;
        }
        return {
          name: 'onshape_goal_status',
          label: 'Goal status',
          description: lead
            ? 'Ask the Mechanical Engineer for the status of a CAD goal (signed A2A). Posts a finished goal result to ' +
              'the conversation that delegated the goal.'
            : 'Current goal state, progress from the server journal and, when ACTIVE, the execution scope ' +
              '(Candidate, feature IDs, remaining budget, grant expiry). Read-only.',
          parameters: schema({
            type: 'object',
            properties: {goalId: {type: 'string'}},
            additionalProperties: false,
          }),
          async execute(_id: string, params: unknown) {
            try {
              const p = onlyKeys(params, ['goalId']);
              if (p.goalId !== undefined && !uuidV4(p.goalId)) {
                throw new Error('invalid_arguments');
              }
              if (lead) {
                const details = await leadDelegate(ctx, lead, {
                  task:
                    'Goal status request. Call onshape_goal_status' +
                    (p.goalId ? ` with goalId ${p.goalId}` : '') +
                    ', then onshape_complete_task with this request, status ok, a one-line summary and the goalId. ' +
                    'Return the complete onshape_complete_task details unchanged as one plain JSON object, including ' +
                    'delegationProof. Do not modify CAD.',
                  ...(typeof p.goalId === 'string' ? {goalId: p.goalId} : {}),
                });
                return leadResult(details);
              }
              if (!initial) {
                throw new Error('authorization_changed');
              }
              const goal = await engineerContext(ctx, initial);
              const status = await goalStatus(goal, p.goalId);
              goal.guard();
              return ok({
                status: 'ok',
                goal: status.goal ? toolView(status.goal) : null,
                ...(status.execution ? {execution: status.execution} : {}),
              });
            } catch (e) {
              return failure(e);
            }
          },
        };
      },
    },
    {optional: true},
  );

  // onshape_goal_reconcile (Engineer) with the server error data.
  api.registerTool(
    {
      contextVersion: 2,
      create: (ctx: Ctx) => {
        const initial = authorizedBinding(config, ctx);
        if (!initial) {
          return null;
        }
        return {
          name: 'onshape_goal_reconcile',
          label: 'Reconcile an uncertain goal dispatch',
          description:
            'After mutation_outcome_unknown_reconcile_required or goal_reconciliation_required, pass the error data ' +
            '(goalId, sequence, featureId, sourceMicroversion, admittedAt) unchanged. If the error data is lost, pass ' +
            'only goalId: the server journal summary names the unreconciled entry. Never retry the update blindly; ' +
            'on mutation_outcome_unknown wait and reconcile again.',
          parameters: schema({
            type: 'object',
            properties: reconcileProperties,
            required: ['goalId'],
            additionalProperties: false,
          }),
          async execute(_id: string, params: unknown) {
            try {
              const p = reconcileToolInput(params);
              const goal = await engineerContext(ctx, initial);
              const view = await reconcileGoal(goal, p);
              goal.guard();
              return ok({status: 'ok', goal: toolView(view)});
            } catch (e) {
              return failure(e);
            }
          },
        };
      },
    },
    {optional: true},
  );

  // onshape_goal_verify (Engineer): independent REST verification of the Candidate.
  api.registerTool(
    {
      contextVersion: 2,
      create: (ctx: Ctx) => {
        const initial = authorizedBinding(config, ctx);
        if (!initial) {
          return null;
        }
        return {
          name: 'onshape_goal_verify',
          label: 'Verify the goal on the Candidate',
          description:
            'Independently re-read the Candidate (REST) and evaluate every goal and preservation condition plus ' +
            'implicit preservation of all other features. Only this verification can complete a goal.',
          parameters: schema({
            type: 'object',
            properties: {goalId: {type: 'string'}},
            required: ['goalId'],
            additionalProperties: false,
          }),
          async execute(_id: string, params: unknown) {
            try {
              const p = onlyKeys(params, ['goalId']);
              const goal = await engineerContext(ctx, initial);
              const view = await verifyGoal(goal, p.goalId);
              goal.guard();
              return ok({status: 'ok', goal: toolView(view)});
            } catch (e) {
              return failure(e);
            }
          },
        };
      },
    },
    {optional: true},
  );

  // onshape_goal_stop (Lead through A2A, Engineer directly). STOP only narrows authority.
  api.registerTool(
    {
      contextVersion: 2,
      create: (ctx: Ctx) => {
        const lead = leadBinding(config, ctx);
        const initial = lead ? undefined : authorizedBinding(config, ctx);
        if (!lead && !initial) {
          return null;
        }
        return {
          name: 'onshape_goal_stop',
          label: 'Stop a goal',
          description:
            'Stop a goal immediately: the grant is written STOPPED before the stop is reported. Executed changes are ' +
            'not rolled back. A resume needs a new confirmation.',
          parameters: schema({
            type: 'object',
            properties: {goalId: {type: 'string'}, reason: {type: 'string', minLength: 1, maxLength: 500}},
            required: ['goalId', 'reason'],
            additionalProperties: false,
          }),
          async execute(_id: string, params: unknown) {
            try {
              const p = onlyKeys(params, ['goalId', 'reason']);
              if (!uuidV4(p.goalId) || typeof p.reason !== 'string' || !p.reason.trim() || p.reason.length > 500) {
                throw new Error('invalid_arguments');
              }
              if (lead) {
                const details = await leadDelegate(ctx, lead, {
                  task:
                    `STOP goal ${p.goalId} now. Reason: ${p.reason.replace(/\s+/g, ' ')}. Call onshape_goal_stop with ` +
                    'this goalId and reason before anything else, then onshape_complete_task with this request, ' +
                    'status ok, a one-line summary and the goalId. Return the complete onshape_complete_task details ' +
                    'unchanged as one plain JSON object, including delegationProof. Do not modify CAD.',
                  goalId: p.goalId,
                });
                return leadResult(details);
              }
              if (!initial) {
                throw new Error('authorization_changed');
              }
              const goal = await engineerContext(ctx, initial);
              const view = await stopGoal(goal, p.goalId, p.reason);
              goal.guard();
              return ok({status: 'ok', goal: toolView(view)});
            } catch (e) {
              return failure(e);
            }
          },
        };
      },
    },
    {optional: true},
  );

  return {leadDelegate, engineerContext};
}
