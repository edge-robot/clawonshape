// Goal transitions (docs/interface/goal-workflow.md §3–§7) over the durable store and the grant writer. Used by the
// dashboard gateway actions and the agent tools. Ordering rules: the goal record is persisted before a grant revision
// is published; STOPPED is persisted and published before a STOP is reported. No action retries a provider write.
import {randomBytes, randomUUID} from 'node:crypto';
import path from 'node:path';
import type {Binding, Config} from './config.ts';
import type {CandidateAttempt} from './candidate-attempts.ts';
import type {PrepareCandidateWorkspaceInput, PrepareCandidateWorkspaceResult} from './rest.ts';
import {mutationStore} from './mutation-workflow.ts';
import type {
  Capability,
  Confirmer,
  FeaturesRead,
  GoalBinding,
  GoalRecord,
  GoalState,
  GoalView,
  GrantMirror,
  JournalSummary,
} from './goal-lifecycle.ts';
import {
  assertEvent,
  baselineHashes,
  CONFIRMATION_LIFETIME_MS,
  dueExpiry,
  evaluateVerification,
  goalResult,
  goalView,
  grantDocument,
  grantReleasable,
  isTerminal,
  MAX_VERIFICATIONS,
  nextGrant,
  reconcileOutcome,
  reconcilePrecheck,
  sameGoalBinding,
  stateAfterReconcile,
  uuidV4,
  validateReconcileInput,
  verificationIncomplete,
  verifyGoalConfirmation,
} from './goal-lifecycle.ts';
import type {GoalCondition, GoalScope} from './goal-scope.ts';
import {
  GOAL_DEFAULT_LIFETIME_MS,
  GOAL_DEFAULT_MAX_DISPATCHES,
  GOAL_OPERATION,
  goalHash,
  referencedFeatureIds,
  validateScope,
} from './goal-scope.ts';
import {approvalFileActive, goalStore, writeGoalGrant} from './goal-store.ts';
import type {GoalStore} from './goal-store.ts';
import {goalCapability, journalSummary} from './goal-mcp.ts';

export type GoalClient = {
  goalFeatures(binding: Binding, workspaceId: string): Promise<FeaturesRead>;
  goalWorkspaceMicroversion(binding: Binding, workspaceId: string): Promise<string>;
  goalCandidateExists(binding: Binding, workspaceId: string): Promise<boolean>;
};
// Existing candidate path (REST OAuth2Write), bound by the caller to the operator authority and the Primary source.
export type CandidateCreation = {
  readAttempt(): Promise<CandidateAttempt | undefined>;
  create(input: PrepareCandidateWorkspaceInput): Promise<PrepareCandidateWorkspaceResult>;
};
export type GoalContext = {
  stateDir: string;
  config: Config;
  binding: Binding;
  client: GoalClient;
  // Egress to MCP_URL only (capabilities, journal summary).
  fetcher: typeof fetch;
  now: () => number;
  // Re-checks the caller's authorization synchronously; called immediately before every effect.
  guard: () => void;
};
export type Origin = {channel: string; target: string; accountId?: string};
export type ProposeInput = {
  goalText?: unknown;
  goalConditions?: unknown;
  preservationConditions?: unknown;
  featureIds?: unknown;
  maxDispatches?: unknown;
  lifetimeMinutes?: unknown;
  goalId?: unknown;
};
export type Execution = {
  candidateWorkspaceId: string;
  featureIds: string[];
  operation: 'updatePartStudioFeature';
  remaining: number | null;
  grantExpiresAt: number;
};

const HISTORY_LIMIT = 10;

function fail(code: string): never {
  throw new Error(code);
}

export function goalBindingOf(binding: Binding): GoalBinding {
  if (!binding.elementId) {
    return fail('target_missing');
  }
  return {
    agentId: binding.agentId,
    documentId: binding.documentId,
    elementId: binding.elementId,
    primaryWorkspaceId: binding.primaryWorkspaceId,
  };
}

export function validateOrigin(value: unknown): Origin {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fail('delegation_denied');
  }
  const o = value as Record<string, unknown>;
  const text = (v: unknown) =>
    // biome-ignore lint/suspicious/noControlCharactersInRegex: conversation targets must not carry control characters
    typeof v === 'string' && v.length >= 1 && v.length <= 256 && !/[\u0000-\u001f\u007f]/.test(v);
  if (
    Object.keys(o).some((k) => !['channel', 'target', 'accountId'].includes(k)) ||
    !text(o.channel) ||
    !text(o.target) ||
    (o.accountId !== undefined && !text(o.accountId))
  ) {
    return fail('delegation_denied');
  }
  return {
    channel: o.channel as string,
    target: o.target as string,
    ...(o.accountId !== undefined ? {accountId: o.accountId as string} : {}),
  };
}

function approvalDirectory(config: Config): string {
  const directory = config.goals?.enabled ? config.goals.approvalDirectory : undefined;
  return directory ?? fail('goal_unsupported');
}

// Config gate (goal_unsupported when disabled), then the capability probe.
async function gate(ctx: GoalContext, requireAvailable: boolean): Promise<Capability> {
  approvalDirectory(ctx.config);
  const capability = await goalCapability(ctx.fetcher);
  if (requireAvailable && capability !== 'AVAILABLE') {
    return fail('goal_unsupported');
  }
  return capability;
}

function owned(record: GoalRecord, ctx: GoalContext): GoalRecord {
  if (!sameGoalBinding(record.binding, goalBindingOf(ctx.binding))) {
    return fail('authorization_changed');
  }
  return record;
}

async function readOwned(store: GoalStore, ctx: GoalContext, goalId: unknown): Promise<GoalRecord> {
  if (!uuidV4(goalId)) {
    return fail('invalid_arguments');
  }
  let record: GoalRecord;
  try {
    record = await store.read(goalId);
  } catch (e) {
    throw e instanceof Error && e.message === 'goal_not_found' ? e : new Error('goal_state_invalid');
  }
  if (!sameGoalBinding(record.binding, goalBindingOf(ctx.binding))) {
    // Another binding's goal is "unknown for this binding" (§8).
    return fail('goal_not_found');
  }
  return record;
}

const maxReconciled = (record: GoalRecord) =>
  Math.max(record.grant?.reconciledThrough ?? 0, ...record.reconciliations.map((r) => r.sequence));

// Persist the record, then publish the grant revision (or null). Returns the persisted record.
async function commit(
  store: GoalStore,
  ctx: GoalContext,
  next: GoalRecord,
  grant: GrantMirror | null | 'unchanged',
): Promise<GoalRecord> {
  const at = ctx.now();
  let record: GoalRecord = {...next, updatedAt: at};
  if (grant === null) {
    record = {...record, grant: null};
  } else if (grant !== 'unchanged') {
    if (grant.grantRevision <= record.lastGrantRevision) {
      return fail('goal_state_invalid');
    }
    record = {...record, grant, lastGrantRevision: grant.grantRevision};
  }
  // Validate the document before persisting so that a record never mirrors an unpublishable grant.
  const document = grant === null || grant === 'unchanged' ? undefined : grantDocument(record, grant);
  ctx.guard();
  await store.save(record);
  if (grant === null) {
    await writeGoalGrant(approvalDirectory(ctx.config), null);
  } else if (document) {
    await writeGoalGrant(approvalDirectory(ctx.config), document);
  }
  return record;
}

// §3 null rule: only for terminal/paused goals whose journal has no unreconciled entry.
async function releaseIfPossible(
  store: GoalStore,
  ctx: GoalContext,
  record: GoalRecord,
  summary: JournalSummary | null,
): Promise<GoalRecord> {
  if (record.grant === null || !grantReleasable(record, summary)) {
    return record;
  }
  return commit(store, ctx, record, null);
}

// Time-driven transitions; applied before any other event and by status.
async function sweep(store: GoalStore, ctx: GoalContext, record: GoalRecord): Promise<GoalRecord> {
  const due = dueExpiry(record, ctx.now());
  if (!due) {
    return record;
  }
  const grant = record.grant ? nextGrant(record, {state: 'STOPPED'}) : 'unchanged';
  const summary = record.state === 'AWAITING_CONFIRMATION' ? 'Confirmation expired.' : 'Goal grant expired.';
  return commit(store, ctx, {...record, state: due, result: goalResult(record, due, summary)}, grant);
}

async function viewOf(ctx: GoalContext, record: GoalRecord, capability: Capability): Promise<GoalView> {
  const summary = await journalSummary(record.goalId, ctx.fetcher);
  return goalView(record, summary, capability, ctx.now());
}

function conditionsOrDefault(value: unknown): unknown {
  return value === undefined ? [] : value;
}

function lifetime(value: unknown): number {
  if (value === undefined) {
    return GOAL_DEFAULT_LIFETIME_MS;
  }
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > 480) {
    return fail('invalid_arguments');
  }
  return value * 60_000;
}

export async function proposeGoal(
  ctx: GoalContext,
  envelope: {workflow: unknown; goalId?: unknown; origin?: unknown},
  input: ProposeInput,
): Promise<GoalView> {
  const capability = await gate(ctx, true);
  if (envelope.workflow !== 'goal') {
    return fail('invalid_arguments');
  }
  const origin = validateOrigin(envelope.origin);
  if (envelope.goalId !== undefined && envelope.goalId !== input.goalId) {
    return fail('invalid_arguments');
  }
  if (input.goalId !== undefined && !uuidV4(input.goalId)) {
    return fail('invalid_arguments');
  }
  const binding = goalBindingOf(ctx.binding);
  // Structural validation before any provider read; the base microversion is filled in after the read.
  const draft = (baseMicroversion: string, candidate: GoalScope['candidate']): GoalScope =>
    validateScope({
      version: 1,
      goalText: input.goalText,
      goalConditions: input.goalConditions,
      preservationConditions: conditionsOrDefault(input.preservationConditions),
      target: {
        documentId: binding.documentId,
        elementId: binding.elementId,
        primaryWorkspaceId: binding.primaryWorkspaceId,
        baseMicroversion,
      },
      candidate,
      operations: [GOAL_OPERATION],
      featureIds: Array.isArray(input.featureIds) ? [...input.featureIds].sort() : input.featureIds,
      maxDispatches: input.maxDispatches ?? GOAL_DEFAULT_MAX_DISPATCHES,
      lifetimeMs: lifetime(input.lifetimeMinutes),
      requester: {channel: ctx.binding.messageChannel, senderId: ctx.binding.requesterSenderId},
      origin: {channel: origin.channel, target: origin.target},
    });
  draft('0'.repeat(24), {mode: 'create', workspaceId: null});
  // Every referenced feature must exist in the Primary Part Studio (read, REST).
  const primary = await ctx.client.goalFeatures(ctx.binding, binding.primaryWorkspaceId);
  const present = new Set(primary.features.map((f) => f.featureId));
  const store = await goalStore(ctx.stateDir);
  const record = await store.exclusive(async () => {
    const now = ctx.now();
    const confirmation = {
      nonce: randomBytes(16).toString('hex'),
      issuedAt: now,
      expiresAt: now + CONFIRMATION_LIFETIME_MS,
    };
    if (input.goalId !== undefined) {
      const existing = await sweep(store, ctx, await readOwned(store, ctx, input.goalId));
      const candidate: GoalScope['candidate'] = existing.candidateWorkspaceId
        ? {mode: 'reuse', workspaceId: existing.candidateWorkspaceId}
        : {mode: 'create', workspaceId: null};
      // renew = the confirmed scope unchanged: same target (base microversion) and same Candidate plan.
      const unchanged = draft(existing.scope.target.baseMicroversion, existing.scope.candidate);
      const fresh = draft(primary.microversionId, candidate);
      if (goalHash(unchanged) === existing.goalHash) {
        // renew: unchanged scope, new nonce (§3).
        assertEvent(existing, 'renew');
        return commit(
          store,
          ctx,
          {...existing, state: 'AWAITING_CONFIRMATION', confirmation, result: null, origin},
          'unchanged',
        );
      }
      assertEvent(existing, 'revise');
      if (referencedFeatureIds(fresh).some((id) => !present.has(id))) {
        return fail('invalid_arguments');
      }
      return commit(
        store,
        ctx,
        {
          ...existing,
          scopeRevision: existing.scopeRevision + 1,
          scope: fresh,
          goalHash: goalHash(fresh),
          state: 'AWAITING_CONFIRMATION',
          confirmation,
          result: null,
          origin,
        },
        'unchanged',
      );
    }
    const scope = draft(primary.microversionId, {mode: 'create', workspaceId: null});
    if (referencedFeatureIds(scope).some((id) => !present.has(id))) {
      return fail('invalid_arguments');
    }
    if ((await store.nonTerminal()).length) {
      return fail('goal_active_conflict');
    }
    const created: GoalRecord = {
      goalId: randomUUID(),
      scopeRevision: 1,
      scope,
      goalHash: goalHash(scope),
      state: 'AWAITING_CONFIRMATION',
      binding,
      candidateWorkspaceId: null,
      baseline: null,
      confirmation,
      grant: null,
      reconciliations: [],
      verifications: [],
      result: null,
      origin,
      requester: scope.requester,
      createdAt: now,
      updatedAt: now,
      lastGrantRevision: 0,
      candidatePreparation: null,
    };
    return commit(store, ctx, created, 'unchanged');
  });
  return viewOf(ctx, record, capability);
}

export function execution(view: GoalView, record: GoalRecord): Execution | undefined {
  if (record.state !== 'ACTIVE' || !record.candidateWorkspaceId || !record.grant) {
    return undefined;
  }
  return {
    candidateWorkspaceId: record.candidateWorkspaceId,
    featureIds: [...record.scope.featureIds],
    operation: GOAL_OPERATION,
    remaining: view.progress.remaining,
    grantExpiresAt: record.grant.expiresAt,
  };
}

// §4.1 goal-status / §4.2 onshape_goal_status. Applies due expiries; no provider I/O.
export async function goalStatus(
  ctx: GoalContext,
  goalId?: unknown,
): Promise<{goal: GoalView | null; history: GoalView[]; execution?: Execution}> {
  const capability = await gate(ctx, false);
  const store = await goalStore(ctx.stateDir);
  const binding = goalBindingOf(ctx.binding);
  const mine = (await store.list()).filter((r) => sameGoalBinding(r.binding, binding));
  let current: GoalRecord | undefined;
  if (goalId !== undefined) {
    current = await readOwned(store, ctx, goalId);
  } else {
    current = mine.filter((r) => !isTerminal(r.state)).at(-1);
  }
  if (current && dueExpiry(current, ctx.now())) {
    const due = current;
    current = await store.exclusive(async () => sweep(store, ctx, owned(await store.read(due.goalId), ctx)));
  }
  const history: GoalView[] = [];
  for (const record of mine.filter((r) => isTerminal(r.state)).slice(-HISTORY_LIMIT)) {
    history.push(goalView(record, null, capability, ctx.now()));
  }
  if (!current) {
    return {goal: null, history};
  }
  const view = await viewOf(ctx, current, capability);
  const exec = execution(view, current);
  return exec ? {goal: view, history, execution: exec} : {goal: view, history};
}

async function legacyExclusive(ctx: GoalContext): Promise<void> {
  const proposals = await mutationStore(ctx.stateDir, ctx.binding);
  if ((await proposals.list()).some((receipt) => receipt.status === 'UNKNOWN')) {
    return fail('mutation_reconciliation_required');
  }
  const directories = new Set([approvalDirectory(ctx.config)]);
  if (ctx.config.localMcp) {
    directories.add(path.join(ctx.config.localMcp.credentialDirectory, 'mutation-approvals'));
  }
  for (const directory of directories) {
    if (await approvalFileActive(directory, ctx.now())) {
      return fail('mutation_reconciliation_required');
    }
  }
}

function createdCandidate(result: PrepareCandidateWorkspaceResult): string {
  if (result.status === 'ok') {
    return result.references.candidateWorkspaceId;
  }
  if (result.status === 'unavailable') {
    return fail(result.reason);
  }
  return fail(result.code);
}

// The Candidate of this goal: reuse, adopt an interrupted creation of this goal, or create once (T3).
async function ensureCandidate(
  store: GoalStore,
  ctx: GoalContext,
  initial: GoalRecord,
  creation: CandidateCreation,
): Promise<GoalRecord> {
  let record = initial;
  const scope = record.scope;
  if (record.candidateWorkspaceId) {
    // Either the Candidate this scope created (mode create, resumed by renew) or the declared reused Candidate.
    const declared = scope.candidate.mode === 'create' || scope.candidate.workspaceId === record.candidateWorkspaceId;
    if (!declared) {
      return fail('goal_candidate_mismatch');
    }
    if (!(await ctx.client.goalCandidateExists(ctx.binding, record.candidateWorkspaceId))) {
      return fail('goal_candidate_mismatch');
    }
    return record;
  }
  if (scope.candidate.mode !== 'create') {
    return fail('goal_candidate_mismatch');
  }
  const attempt = await creation.readAttempt();
  const unresolved = (a: CandidateAttempt) =>
    fail(a.status === 'UNKNOWN' ? 'candidate_creation_unknown' : 'candidate_verification_pending');
  let candidateWorkspaceId: string | undefined;
  if (record.candidatePreparation && attempt && attempt.attemptId !== record.candidatePreparation.replacedAttemptId) {
    // A previous confirmation of this goal dispatched a creation and was interrupted.
    if (attempt.status === 'UNKNOWN' || attempt.status === 'CREATED_UNVERIFIED') {
      return unresolved(attempt);
    }
    if (
      attempt.status === 'VERIFIED' &&
      attempt.candidateWorkspaceId &&
      attempt.sourceWorkspaceId === scope.target.primaryWorkspaceId &&
      attempt.sourceMicroversionId === scope.target.baseMicroversion
    ) {
      candidateWorkspaceId = attempt.candidateWorkspaceId;
    }
  } else if (attempt && (attempt.status === 'UNKNOWN' || attempt.status === 'CREATED_UNVERIFIED')) {
    return unresolved(attempt);
  }
  if (!candidateWorkspaceId) {
    const preparing = await commit(
      store,
      ctx,
      {...record, candidatePreparation: {replacedAttemptId: attempt?.attemptId ?? null}},
      'unchanged',
    );
    ctx.guard();
    const result = await creation.create({
      sourceMicroversionId: scope.target.baseMicroversion,
      candidateWorkspaceName: `ClawOnshape goal ${record.goalId.slice(0, 8)}`,
      // The operator's goal confirmation is the explicit acknowledgement of the previous completed attempt.
      ...(attempt ? {replaceCompletedAttemptId: attempt.attemptId} : {}),
    });
    candidateWorkspaceId = createdCandidate(result);
    record = preparing;
  }
  // Persist the Candidate immediately: one goal, one Candidate (ADR-2026-10-21 D2).
  return commit(store, ctx, {...record, candidateWorkspaceId, candidatePreparation: null}, 'unchanged');
}

export async function confirmGoal(
  ctx: GoalContext,
  input: {goalId: unknown; nonce: unknown; expectedGoalHash: unknown},
  confirmer: Confirmer,
  creation: CandidateCreation,
): Promise<GoalView> {
  const capability = await gate(ctx, true);
  const store = await goalStore(ctx.stateDir);
  const binding = goalBindingOf(ctx.binding);
  const record = await store.exclusive(async () => {
    let record = await readOwned(store, ctx, input.goalId);
    const verify = () =>
      verifyGoalConfirmation({
        record,
        nonce: input.nonce,
        expectedGoalHash: input.expectedGoalHash,
        confirmer,
        now: ctx.now(),
        currentBinding: binding,
      });
    // The verification core runs before any provider I/O or write (T4).
    verify();
    await legacyExclusive(ctx);
    record = await ensureCandidate(store, ctx, record, creation);
    if (!record.candidateWorkspaceId) {
      return fail('goal_candidate_mismatch');
    }
    if (!record.baseline) {
      const read = await ctx.client.goalFeatures(ctx.binding, record.candidateWorkspaceId);
      record = await commit(
        store,
        ctx,
        {...record, baseline: {microversionId: read.microversionId, features: baselineHashes(read)}},
        'unchanged',
      );
    }
    // Serialize against the legacy approval path (§1) with its own lock, then publish.
    const proposals = await mutationStore(ctx.stateDir, ctx.binding);
    return proposals.exclusive(async () => {
      await legacyExclusive(ctx);
      const confirmedBy = verify();
      const at = ctx.now();
      const grant: GrantMirror = {
        grantRevision: record.lastGrantRevision + 1,
        state: 'ACTIVE',
        issuedAt: at,
        expiresAt: at + record.scope.lifetimeMs,
        maxDispatches: record.scope.maxDispatches,
        reconciledThrough: maxReconciled(record),
      };
      return commit(
        store,
        ctx,
        {
          ...record,
          state: 'ACTIVE',
          confirmation: {...record.confirmation, confirmedAt: at, confirmedBy},
          result: null,
        },
        grant,
      );
    });
  });
  return viewOf(ctx, record, capability);
}

// §3 stop. Always permitted for a bound caller (it only narrows authority); no capability probe needed to act.
export async function stopGoal(ctx: GoalContext, goalId: unknown, reason: unknown): Promise<GoalView> {
  if (typeof reason !== 'string' || !reason.trim() || reason.length > 500) {
    return fail('invalid_arguments');
  }
  approvalDirectory(ctx.config);
  const store = await goalStore(ctx.stateDir);
  const record = await store.exclusive(async () => {
    const record = await readOwned(store, ctx, goalId);
    if (record.state === 'STOPPED' || record.state === 'EXPIRED') {
      // Idempotent: re-publish the STOPPED mirror (repairs an interrupted publish), never re-activate.
      if (record.grant?.state === 'STOPPED') {
        await writeGoalGrant(approvalDirectory(ctx.config), grantDocument(record, record.grant));
      }
      return record;
    }
    assertEvent(record, 'stop');
    const grant = record.grant ? nextGrant(record, {state: 'STOPPED'}) : 'unchanged';
    return commit(store, ctx, {...record, state: 'STOPPED', result: goalResult(record, 'STOPPED', reason)}, grant);
  });
  // The STOP is reported only after the record and the grant were written.
  return viewOf(ctx, record, await goalCapability(ctx.fetcher));
}

export async function reconcileGoal(ctx: GoalContext, data: unknown): Promise<GoalView> {
  const capability = await gate(ctx, true);
  const input = validateReconcileInput(data);
  const store = await goalStore(ctx.stateDir);
  const record = await store.exclusive(async () => {
    let record = await sweep(store, ctx, await readOwned(store, ctx, input.goalId));
    assertEvent(record, 'reconcile');
    if (record.state === 'ACTIVE') {
      record = await commit(store, ctx, {...record, state: 'RECONCILING'}, 'unchanged');
    }
    const summary = await journalSummary(record.goalId, ctx.fetcher);
    if (reconcilePrecheck(record, input, summary, ctx.now()) === 'idempotent') {
      return record.state === 'RECONCILING' ? commit(store, ctx, {...record, state: 'ACTIVE'}, 'unchanged') : record;
    }
    if (!record.candidateWorkspaceId) {
      return fail('goal_candidate_mismatch');
    }
    // Rule 4: a read failure leaves the goal RECONCILING (the error propagates after the persisted state).
    const observed = await ctx.client.goalWorkspaceMicroversion(ctx.binding, record.candidateWorkspaceId);
    const state = stateAfterReconcile(record.state);
    const grant = nextGrant(record, {
      state: state === 'ACTIVE' ? 'ACTIVE' : 'STOPPED',
      reconciledThrough: input.sequence,
    });
    return commit(
      store,
      ctx,
      {
        ...record,
        state,
        reconciliations: [
          ...record.reconciliations,
          {
            sequence: input.sequence,
            featureId: input.featureId,
            sourceMicroversion: input.sourceMicroversion,
            admittedAt: input.admittedAt,
            observedMicroversion: observed,
            outcome: reconcileOutcome(input, observed),
            reconciledAt: ctx.now(),
          },
        ],
      },
      grant,
    );
  });
  return viewOf(ctx, record, capability);
}

export async function verifyGoal(ctx: GoalContext, goalId: unknown): Promise<GoalView> {
  const capability = await gate(ctx, true);
  const store = await goalStore(ctx.stateDir);
  let incomplete = false;
  const record = await store.exclusive(async () => {
    const record = await sweep(store, ctx, await readOwned(store, ctx, goalId));
    assertEvent(record, 'verify');
    const candidate = record.candidateWorkspaceId;
    if (!candidate) {
      return fail('goal_candidate_mismatch');
    }
    let read: FeaturesRead;
    try {
      read = await ctx.client.goalFeatures(ctx.binding, candidate);
    } catch (e) {
      if (e instanceof Error && e.message === 'provider_not_found') {
        if (!(await ctx.client.goalCandidateExists(ctx.binding, candidate))) {
          // Candidate lost (§3): FAILED; the grant is narrowed to STOPPED, then released when the journal allows.
          const grant = record.grant ? nextGrant(record, {state: 'STOPPED'}) : 'unchanged';
          const failed = await commit(
            store,
            ctx,
            {...record, state: 'FAILED', result: goalResult(record, 'FAILED', 'The goal Candidate no longer exists.')},
            grant,
          );
          return releaseIfPossible(store, ctx, failed, await journalSummary(record.goalId, ctx.fetcher));
        }
      }
      throw e;
    }
    const summary = await journalSummary(record.goalId, ctx.fetcher);
    const verification = evaluateVerification(record, read, summary, ctx.now());
    const verifications = [...record.verifications, verification].slice(-MAX_VERIFICATIONS);
    const withEvidence = {...record, verifications};
    if (verification.passed) {
      const completed = await commit(
        store,
        ctx,
        {
          ...withEvidence,
          state: 'COMPLETED',
          result: goalResult(withEvidence, 'COMPLETED', 'All goal and preservation conditions verified.'),
        },
        nextGrant(record, {state: 'STOPPED'}),
      );
      return releaseIfPossible(store, ctx, completed, summary);
    }
    incomplete = verificationIncomplete(verification, summary);
    const exhausted = !!summary && summary.counted >= (record.grant?.maxDispatches ?? record.scope.maxDispatches);
    if (exhausted) {
      const state: GoalState = 'BLOCKED';
      return commit(
        store,
        ctx,
        {
          ...withEvidence,
          state,
          result: goalResult(withEvidence, state, 'Dispatch budget used up without a verified goal.'),
        },
        nextGrant(record, {state: 'STOPPED'}),
      );
    }
    return commit(store, ctx, withEvidence, 'unchanged');
  });
  if (incomplete) {
    return fail('goal_verification_incomplete');
  }
  return viewOf(ctx, record, capability);
}

// Read-only view for onshape_complete_task (goalId field) and the result delivery.
export async function goalForReport(ctx: GoalContext, goalId: unknown): Promise<GoalView> {
  const capability = await gate(ctx, false);
  const store = await goalStore(ctx.stateDir);
  return viewOf(ctx, await readOwned(store, ctx, goalId), capability);
}

export type {GoalCondition};
