// Pure goal lifecycle (docs/interface/goal-workflow.md §1, §3–§7, §9) and the goal grant schema (onshape-mcp.md
// §12.2). No I/O and no clock: every time value is an input. The verification core is the seam that a Verifiable
// Credential verifier replaces later (ADR-2026-10-21 D1); it does not depend on the dashboard.
import {timingSafeEqual} from 'node:crypto';
import type {GoalCondition, GoalScope} from './goal-scope.ts';
import {canonicalFeatureHash, goalHash, GOAL_FEATURE_ID, GOAL_OPERATION, hex24, validateScope} from './goal-scope.ts';

export type GoalState =
  | 'AWAITING_CONFIRMATION'
  | 'ACTIVE'
  | 'RECONCILING'
  | 'BLOCKED'
  | 'STOPPED'
  | 'EXPIRED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CLOSED';
export const GOAL_STATES: readonly GoalState[] = [
  'AWAITING_CONFIRMATION',
  'ACTIVE',
  'RECONCILING',
  'BLOCKED',
  'STOPPED',
  'EXPIRED',
  'COMPLETED',
  'FAILED',
  'CLOSED',
];
// CLOSED (CR-3): an operator ended a paused goal so that a new goal can start for the binding.
export const TERMINAL_STATES: readonly GoalState[] = ['COMPLETED', 'FAILED', 'CLOSED'];
export const isTerminal = (state: GoalState) => TERMINAL_STATES.includes(state);
// §1: the legacy approval is blocked while a goal holds live authority.
export const AUTHORITY_STATES: readonly GoalState[] = ['ACTIVE', 'RECONCILING'];

export const CONFIRMATION_LIFETIME_MS = 1_800_000;
// §5 rule 3, as approval v2 rule 4: covers the 30 s server Onshape timeout.
export const RECONCILE_GRACE_MS = 60_000;
export const MAX_VERIFICATIONS = 50;
export const GRANT_MAX_BYTES = 65_536;

export type GoalBinding = {agentId: string; documentId: string; elementId: string; primaryWorkspaceId: string};
export type ConfirmedBy = {kind: 'dashboard-operator'; clientId?: string};
export type GoalConfirmation = {
  nonce: string;
  issuedAt: number;
  expiresAt: number;
  confirmedAt?: number;
  confirmedBy?: ConfirmedBy;
};
export type GrantMirror = {
  grantRevision: number;
  state: 'ACTIVE' | 'STOPPED';
  issuedAt: number;
  expiresAt: number;
  maxDispatches: number;
  reconciledThrough: number;
};
export type Reconciliation = {
  sequence: number;
  featureId: string;
  sourceMicroversion: string;
  admittedAt: number;
  observedMicroversion: string;
  outcome: 'NOT_APPLIED' | 'APPLIED_OR_SUPERSEDED';
  reconciledAt: number;
};
export type VerificationCheck = {
  conditionId: string;
  kind: GoalCondition['kind'];
  result: 'pass' | 'fail' | 'unverifiable';
  observed: string | null;
};
export type Verification = {
  verifiedAt: number;
  microversionId: string;
  passed: boolean;
  checks: VerificationCheck[];
  openLimits: string[];
};
export type ResultDelivery = {
  deliveredAt: number;
  via: 'lead-reply' | 'outbound';
  channel: string;
  target: string;
};
export type GoalResult = {
  state: GoalState;
  summary: string;
  verificationIndex: number | null;
  revisionUrl: string | null;
  openLimits: string[];
  delivery?: ResultDelivery;
};
export type GoalRecord = {
  goalId: string;
  scopeRevision: number;
  scope: GoalScope;
  goalHash: string;
  state: GoalState;
  binding: GoalBinding;
  candidateWorkspaceId: string | null;
  baseline: {microversionId: string; features: Record<string, string>} | null;
  confirmation: GoalConfirmation;
  grant: GrantMirror | null;
  reconciliations: Reconciliation[];
  verifications: Verification[];
  result: GoalResult | null;
  origin: {channel: string; target: string; accountId?: string};
  requester: {channel: string; senderId: string};
  createdAt: number;
  updatedAt: number;
  // Plugin-internal (not projected): highest grantRevision ever published for this goal, so that a revision
  // published after a null reset still strictly increases (§12.2).
  lastGrantRevision: number;
  // Plugin-internal: the candidate-attempt slot before this goal started creating its Candidate. Lets a repeated
  // confirmation adopt the attempt of an interrupted one instead of creating a second Candidate (T3).
  candidatePreparation: {replacedAttemptId: string | null} | null;
};

// Server journal summary (onshape-mcp.md §12.7).
// Server contract 1.2.0 §12.7: the journal entry named by unreconciledSequence. Diagnostic data, not operator-only
// (goal-1.1.0 §9); it carries no request body, path, token or nonce.
export type UnreconciledEntry = {
  sequence: number;
  grantRevision: number;
  requestHash: string;
  featureId: string;
  sourceMicroversion: string;
  admittedAt: number;
  outcome: 'PENDING' | 'UNCERTAIN';
  httpStatus: number | null;
};
export type JournalSummary = {
  goalId: string;
  entries: number;
  counted: number;
  maxSequence: number;
  unreconciledSequence: number | null;
  lastOutcome: string | null;
  lastAdmittedAt: number | null;
  // null when nothing is unreconciled, and for a 1.1.0 server that does not send the key.
  unreconciledEntry: UnreconciledEntry | null;
};
export type Capability = 'AVAILABLE' | 'UNSUPPORTED' | 'BLOCKED';

// Goal grant document v1 (§12.2). `null` means no goal authority.
export type GoalGrant = {
  version: 1;
  goalId: string;
  grantRevision: number;
  goalHash: string;
  state: 'ACTIVE' | 'STOPPED';
  issuedAt: number;
  expiresAt: number;
  target: {documentId: string; workspaceId: string; elementId: string};
  operations: ['updatePartStudioFeature'];
  featureIds: string[];
  maxDispatches: number;
  reconciledThrough: number;
};

const UUID_V4 = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export const uuidV4 = (value: unknown): value is string => typeof value === 'string' && UUID_V4.test(value);
const sha256 = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const safeInt = (value: unknown, min: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min;

function fail(code: string): never {
  throw new Error(code);
}

export function sameGoalBinding(a: GoalBinding, b: GoalBinding): boolean {
  return (
    a.agentId === b.agentId &&
    a.documentId === b.documentId &&
    a.elementId === b.elementId &&
    a.primaryWorkspaceId === b.primaryWorkspaceId
  );
}

// §12.2 structural validation of a grant document, including caps. Returns the list of violations (empty = valid).
export function grantViolations(value: unknown): string[] {
  if (value === null) {
    return [];
  }
  const keys = [
    'version',
    'goalId',
    'grantRevision',
    'goalHash',
    'state',
    'issuedAt',
    'expiresAt',
    'target',
    'operations',
    'featureIds',
    'maxDispatches',
    'reconciledThrough',
  ];
  if (!isRecord(value)) {
    return ['not an object or null'];
  }
  const errors: string[] = [];
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) {
      errors.push(`unknown field ${key}`);
    }
  }
  for (const key of keys) {
    if (!(key in value)) {
      errors.push(`missing ${key}`);
    }
  }
  if (value.version !== 1) {
    errors.push('version');
  }
  if (!uuidV4(value.goalId)) {
    errors.push('goalId');
  }
  if (!safeInt(value.grantRevision, 1)) {
    errors.push('grantRevision');
  }
  if (!sha256(value.goalHash)) {
    errors.push('goalHash');
  }
  if (value.state !== 'ACTIVE' && value.state !== 'STOPPED') {
    errors.push('state');
  }
  if (!safeInt(value.issuedAt, 0) || !safeInt(value.expiresAt, 0)) {
    errors.push('issuedAt/expiresAt');
  } else {
    const lifetime = (value.expiresAt as number) - (value.issuedAt as number);
    if (lifetime <= 0 || lifetime > 28_800_000) {
      errors.push('lifetime');
    }
  }
  const target = value.target;
  if (
    !isRecord(target) ||
    Object.keys(target).length !== 3 ||
    ![target.documentId, target.workspaceId, target.elementId].every(hex24)
  ) {
    errors.push('target');
  }
  if (!Array.isArray(value.operations) || value.operations.length !== 1 || value.operations[0] !== GOAL_OPERATION) {
    errors.push('operations');
  }
  const featureIds = value.featureIds;
  if (
    !Array.isArray(featureIds) ||
    featureIds.length < 1 ||
    featureIds.length > 32 ||
    featureIds.some((f) => typeof f !== 'string' || !GOAL_FEATURE_ID.test(f)) ||
    new Set(featureIds).size !== featureIds.length
  ) {
    errors.push('featureIds');
  }
  if (!safeInt(value.maxDispatches, 1) || (value.maxDispatches as number) > 25) {
    errors.push('maxDispatches');
  }
  if (!safeInt(value.reconciledThrough, 0)) {
    errors.push('reconciledThrough');
  }
  if (Buffer.byteLength(JSON.stringify(value)) > GRANT_MAX_BYTES) {
    errors.push('size');
  }
  return errors;
}

// The only producer of grant documents (T10): exactly the §12.2 fields, from the record mirror.
export function grantDocument(record: GoalRecord, mirror: GrantMirror): GoalGrant {
  if (!record.candidateWorkspaceId) {
    return fail('goal_candidate_mismatch');
  }
  const grant: GoalGrant = {
    version: 1,
    goalId: record.goalId,
    grantRevision: mirror.grantRevision,
    goalHash: record.goalHash,
    state: mirror.state,
    issuedAt: mirror.issuedAt,
    expiresAt: mirror.expiresAt,
    target: {
      documentId: record.binding.documentId,
      workspaceId: record.candidateWorkspaceId,
      elementId: record.binding.elementId,
    },
    operations: [GOAL_OPERATION],
    featureIds: [...record.scope.featureIds],
    maxDispatches: mirror.maxDispatches,
    reconciledThrough: mirror.reconciledThrough,
  };
  if (grantViolations(grant).length) {
    return fail('goal_state_invalid');
  }
  return grant;
}

// Next mirror revision. Every published revision strictly increases per goalId.
export function nextGrant(record: GoalRecord, change: Partial<Omit<GrantMirror, 'grantRevision'>>): GrantMirror {
  const base = record.grant;
  const issuedAt = change.issuedAt ?? base?.issuedAt;
  const expiresAt = change.expiresAt ?? base?.expiresAt;
  const maxDispatches = change.maxDispatches ?? base?.maxDispatches;
  if (issuedAt === undefined || expiresAt === undefined || maxDispatches === undefined) {
    return fail('goal_state_invalid');
  }
  return {
    grantRevision: record.lastGrantRevision + 1,
    state: change.state ?? base?.state ?? 'STOPPED',
    issuedAt,
    expiresAt,
    maxDispatches,
    reconciledThrough: change.reconciledThrough ?? base?.reconciledThrough ?? 0,
  };
}

// §3: the grant may be reset to null only for a terminal or paused goal whose journal has no unreconciled entry.
export function grantReleasable(record: GoalRecord, summary: JournalSummary | null): boolean {
  return (
    ['COMPLETED', 'FAILED', 'CLOSED', 'STOPPED', 'EXPIRED', 'BLOCKED'].includes(record.state) &&
    summary !== null &&
    summary.goalId === record.goalId &&
    summary.unreconciledSequence === null
  );
}

// §3 transition table, as data. The service applies guards; this answers "is the event allowed in this state".
export type GoalEvent = 'revise' | 'renew' | 'confirm' | 'reconcile' | 'verify' | 'stop' | 'expire' | 'fail' | 'close';
const ALLOWED: Record<GoalEvent, readonly GoalState[]> = {
  revise: ['AWAITING_CONFIRMATION', 'STOPPED', 'EXPIRED', 'BLOCKED'],
  renew: ['STOPPED', 'EXPIRED', 'BLOCKED'],
  confirm: ['AWAITING_CONFIRMATION'],
  // ACTIVE enters RECONCILING; a paused goal can still reconcile a dispatch that was in flight (§3 STOP rule).
  reconcile: ['ACTIVE', 'RECONCILING', 'STOPPED', 'EXPIRED', 'BLOCKED', 'AWAITING_CONFIRMATION'],
  verify: ['ACTIVE'],
  stop: ['ACTIVE', 'RECONCILING', 'AWAITING_CONFIRMATION', 'BLOCKED'],
  expire: ['AWAITING_CONFIRMATION', 'ACTIVE', 'RECONCILING'],
  fail: ['AWAITING_CONFIRMATION', 'ACTIVE', 'RECONCILING', 'BLOCKED', 'STOPPED', 'EXPIRED'],
  close: ['STOPPED', 'EXPIRED', 'BLOCKED'],
};
export function eventAllowed(state: GoalState, event: GoalEvent): boolean {
  return ALLOWED[event].includes(state);
}
export function assertEvent(record: GoalRecord, event: GoalEvent): void {
  if (!eventAllowed(record.state, event)) {
    fail('goal_state_invalid');
  }
}

// Time-driven transitions (§3 confirmation expiry and grant expiry). Returns the new state or undefined.
export function dueExpiry(record: GoalRecord, now: number): 'EXPIRED' | undefined {
  if (record.state === 'AWAITING_CONFIRMATION' && now >= record.confirmation.expiresAt) {
    return 'EXPIRED';
  }
  if ((record.state === 'ACTIVE' || record.state === 'RECONCILING') && record.grant && now >= record.grant.expiresAt) {
    return 'EXPIRED';
  }
  return undefined;
}

export type Confirmer = {
  kind: 'dashboard-operator';
  // Gateway client connection id, recorded as clientId (GW2). Not an identity claim.
  clientId?: string;
  // Operator scopes of the calling client; only operator.admin confers confirmation authority.
  scopes: readonly string[];
};
export type ConfirmationInput = {
  record: GoalRecord;
  nonce: unknown;
  expectedGoalHash: unknown;
  confirmer: Confirmer;
  now: number;
  // The plugin binding as it is now; must equal the record binding.
  currentBinding: GoalBinding;
};

// §4.1 verification core. Pure and synchronous. Throws the first failing code; returns confirmedBy on success.
export function verifyGoalConfirmation(input: ConfirmationInput): ConfirmedBy {
  const {record, nonce, expectedGoalHash, confirmer, now, currentBinding} = input;
  if (confirmer.kind !== 'dashboard-operator' || !confirmer.scopes.includes('operator.admin')) {
    return fail('authorization_changed');
  }
  if (record.state !== 'AWAITING_CONFIRMATION') {
    return fail('goal_state_invalid');
  }
  if (!sameGoalBinding(record.binding, currentBinding)) {
    return fail('authorization_changed');
  }
  if (!Number.isSafeInteger(now) || now >= record.confirmation.expiresAt) {
    return fail('goal_confirmation_expired');
  }
  let recomputed: string;
  try {
    recomputed = goalHash(validateScope(record.scope));
  } catch {
    return fail('goal_hash_mismatch');
  }
  if (typeof expectedGoalHash !== 'string' || expectedGoalHash !== recomputed || recomputed !== record.goalHash) {
    return fail('goal_hash_mismatch');
  }
  const expected = Buffer.from(record.confirmation.nonce, 'utf8');
  const given = Buffer.from(typeof nonce === 'string' ? nonce : '', 'utf8');
  // Constant-time comparison; the length check leaks only the fixed public nonce length.
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return fail('goal_state_invalid');
  }
  const clientId =
    typeof confirmer.clientId === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(confirmer.clientId)
      ? confirmer.clientId
      : undefined;
  return clientId ? {kind: 'dashboard-operator', clientId} : {kind: 'dashboard-operator'};
}

export type ReconcileInput = {
  goalId: string;
  sequence: number;
  featureId: string;
  sourceMicroversion: string;
  admittedAt: number;
};
export function validateReconcileInput(value: unknown): ReconcileInput {
  if (
    !isRecord(value) ||
    !uuidV4(value.goalId) ||
    !safeInt(value.sequence, 1) ||
    typeof value.featureId !== 'string' ||
    !GOAL_FEATURE_ID.test(value.featureId) ||
    !hex24(value.sourceMicroversion) ||
    !safeInt(value.admittedAt, 1)
  ) {
    return fail('invalid_arguments');
  }
  return {
    goalId: value.goalId,
    sequence: value.sequence,
    featureId: value.featureId,
    sourceMicroversion: value.sourceMicroversion,
    admittedAt: value.admittedAt,
  };
}

// goal-1.1.0 §5: reconcile input taken from the summary's unreconciledEntry (only goalId given).
export function reconcileInputFromEntry(goalId: string, entry: UnreconciledEntry | null): ReconcileInput {
  if (!entry) {
    // Nothing is unreconciled (or a 1.1.0 server cannot name it): there is no input to reconcile.
    return fail('goal_state_invalid');
  }
  return {
    goalId,
    sequence: entry.sequence,
    featureId: entry.featureId,
    sourceMicroversion: entry.sourceMicroversion,
    admittedAt: entry.admittedAt,
  };
}

// goal-1.1.0 §5: explicit input MUST equal unreconciledEntry when the summary provides one.
export function assertInputMatchesEntry(input: ReconcileInput, entry: UnreconciledEntry | null): void {
  if (
    entry &&
    (entry.sequence !== input.sequence ||
      entry.featureId !== input.featureId ||
      entry.sourceMicroversion !== input.sourceMicroversion ||
      entry.admittedAt !== input.admittedAt)
  ) {
    fail('goal_state_invalid');
  }
}

// §5 rules 1–3 (no provider read needed). 'idempotent' = rule 1; 'read' = continue with rule 4.
export function reconcilePrecheck(
  record: GoalRecord,
  input: ReconcileInput,
  summary: JournalSummary | null,
  now: number,
): 'idempotent' | 'read' {
  if (!record.grant) {
    return fail('goal_state_invalid');
  }
  if (!record.scope.featureIds.includes(input.featureId)) {
    return fail('goal_state_invalid');
  }
  if (input.sequence <= record.grant.reconciledThrough) {
    return 'idempotent';
  }
  if (!summary) {
    return fail('mcp_discovery_failed');
  }
  if (summary.goalId !== record.goalId || summary.unreconciledSequence !== input.sequence) {
    return fail('goal_state_invalid');
  }
  if (now < input.admittedAt + RECONCILE_GRACE_MS) {
    return fail('mutation_outcome_unknown');
  }
  return 'read';
}

// §5 rule 4: classification by the Candidate's current microversion.
export function reconcileOutcome(input: ReconcileInput, observedMicroversion: string): Reconciliation['outcome'] {
  return observedMicroversion === input.sourceMicroversion ? 'NOT_APPLIED' : 'APPLIED_OR_SUPERSEDED';
}

// The goal state after a successful reconciliation (rule 5): ACTIVE when the goal holds live authority, otherwise
// unchanged (a STOP or expiry that happened meanwhile stays in force).
export function stateAfterReconcile(state: GoalState): GoalState {
  return state === 'ACTIVE' || state === 'RECONCILING' ? 'ACTIVE' : state;
}

export type FeaturesRead = {
  microversionId: string;
  features: Record<string, unknown>[];
  featureStates: Record<string, unknown>;
};

const featureIdOf = (feature: Record<string, unknown>) =>
  typeof feature.featureId === 'string' ? feature.featureId : undefined;

export function baselineHashes(read: FeaturesRead): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const feature of read.features) {
    const id = featureIdOf(feature);
    if (!id || Object.hasOwn(hashes, id)) {
      // A feature without an ID or a duplicate ID cannot be preserved by ID.
      return fail('provider_protocol_error');
    }
    hashes[id] = canonicalFeatureHash(feature);
  }
  return hashes;
}

function evaluateCondition(
  condition: GoalCondition,
  read: FeaturesRead,
  baseline: Record<string, string> | null,
): VerificationCheck {
  const check = (result: VerificationCheck['result'], observed: string | null): VerificationCheck => ({
    conditionId: condition.id,
    kind: condition.kind,
    result,
    observed,
  });
  if (condition.kind === 'note') {
    return check('unverifiable', null);
  }
  const matches = read.features.filter((f) => featureIdOf(f) === condition.featureId);
  if (matches.length > 1) {
    return check('unverifiable', 'duplicate feature');
  }
  if (matches.length === 0) {
    return check('fail', 'feature missing');
  }
  const feature = matches[0];
  if (condition.kind === 'parameterEquals') {
    const parameters = Array.isArray(feature.parameters) ? feature.parameters : undefined;
    if (!parameters) {
      return check('unverifiable', null);
    }
    const found = parameters.filter((p) => isRecord(p) && p.parameterId === condition.parameterId);
    if (found.length > 1) {
      return check('unverifiable', 'duplicate parameter');
    }
    if (found.length === 0) {
      return check('fail', 'parameter missing');
    }
    const expression = (found[0] as Record<string, unknown>).expression;
    if (typeof expression !== 'string') {
      return check('unverifiable', null);
    }
    const observed = expression.trim();
    return check(observed === condition.expression ? 'pass' : 'fail', observed.slice(0, 200));
  }
  if (condition.kind === 'featureState') {
    const state = read.featureStates[condition.featureId as string];
    const status = isRecord(state) ? state.featureStatus : undefined;
    if (typeof status !== 'string') {
      return check('unverifiable', null);
    }
    return check(status === condition.state ? 'pass' : 'fail', status.slice(0, 64));
  }
  // featureUnchanged
  const expected = baseline?.[condition.featureId as string];
  if (!expected) {
    return check('unverifiable', 'no baseline');
  }
  const observed = canonicalFeatureHash(feature);
  return check(observed === expected ? 'pass' : 'fail', observed);
}

// §6 evaluation. `summary` null (unavailable) never passes.
export function evaluateVerification(
  record: GoalRecord,
  read: FeaturesRead,
  summary: JournalSummary | null,
  now: number,
): Verification {
  const baseline = record.baseline?.features ?? null;
  const checks: VerificationCheck[] = [];
  const openLimits: string[] = [];
  for (const condition of [...record.scope.goalConditions, ...record.scope.preservationConditions]) {
    checks.push(evaluateCondition(condition, read, baseline));
    if (condition.kind === 'note') {
      openLimits.push(condition.text);
    }
  }
  // Implicit preservation: every baseline feature outside featureIds is unchanged; a removed one fails.
  if (baseline) {
    for (const featureId of Object.keys(baseline).sort()) {
      if (record.scope.featureIds.includes(featureId)) {
        continue;
      }
      const matches = read.features.filter((f) => featureIdOf(f) === featureId);
      const observed = matches.length === 1 ? canonicalFeatureHash(matches[0]) : null;
      checks.push({
        conditionId: `implicit:${featureId}`,
        kind: 'featureUnchanged',
        result: observed === baseline[featureId] ? 'pass' : 'fail',
        observed: observed ?? (matches.length ? 'duplicate feature' : 'feature missing'),
      });
    }
  }
  const machineChecks = checks.filter((c) => c.kind !== 'note');
  const passed =
    baseline !== null &&
    machineChecks.every((c) => c.result === 'pass') &&
    summary !== null &&
    summary.goalId === record.goalId &&
    summary.unreconciledSequence === null;
  return {verifiedAt: now, microversionId: read.microversionId, passed, checks, openLimits};
}

// A verification that could not evaluate a required check (as opposed to a definitive failure).
export function verificationIncomplete(verification: Verification, summary: JournalSummary | null): boolean {
  return summary === null || verification.checks.some((c) => c.kind !== 'note' && c.result === 'unverifiable');
}

export function revisionUrl(record: GoalRecord): string | null {
  const microversion = record.verifications.at(-1)?.microversionId ?? record.baseline?.microversionId;
  if (!record.candidateWorkspaceId || !microversion) {
    return null;
  }
  const {documentId, elementId} = record.binding;
  return `https://cad.onshape.com/documents/${documentId}/w/${record.candidateWorkspaceId}/m/${microversion}/e/${elementId}`;
}

// §7 result for COMPLETED, BLOCKED, STOPPED, EXPIRED or FAILED.
export function goalResult(record: GoalRecord, state: GoalState, summary: string): GoalResult {
  const last = record.verifications.length ? record.verifications.length - 1 : null;
  const notes = [...record.scope.goalConditions, ...record.scope.preservationConditions]
    .filter((c) => c.kind === 'note')
    .map((c) => c.text);
  return {
    state,
    summary: summary.slice(0, 2000),
    verificationIndex: last,
    revisionUrl: revisionUrl({...record, state}),
    openLimits: last === null ? notes : record.verifications[last].openLimits,
  };
}

export type GoalView = {
  goalId: string;
  scopeRevision: number;
  state: GoalState;
  goalText: string;
  goalConditions: GoalCondition[];
  preservationConditions: GoalCondition[];
  goalHash: string;
  confirmationRequired: boolean;
  target: {
    documentId: string;
    elementId: string;
    primaryWorkspaceId: string;
    candidateWorkspaceId: string | null;
    baseMicroversion: string;
  };
  scope: {featureIds: string[]; operations: string[]; maxDispatches: number; lifetimeMs: number};
  progress: {
    dispatches: number | null;
    remaining: number | null;
    unreconciledSequence: number | null;
    unreconciledEntry: UnreconciledEntry | null;
    lastOutcome: string | null;
    lastVerification: Verification | null;
  };
  grant: {revision: number; state: 'ACTIVE' | 'STOPPED'; expiresAt: number} | null;
  confirmation: {
    expiresAt: number;
    confirmedAt: number | null;
    confirmedBy: ConfirmedBy | null;
    // CR-1: non-null only in the operator goal-status view while AWAITING_CONFIRMATION (operatorNonceView).
    nonce: string | null;
  };
  result: GoalResult | null;
  capability: Capability;
  observedAt: number;
};

// §9 projection. Progress comes only from the server journal summary, never from agent claims.
export function goalView(
  record: GoalRecord,
  summary: JournalSummary | null,
  capability: Capability,
  now: number,
): GoalView {
  const usable = summary !== null && summary.goalId === record.goalId ? summary : null;
  const budget = record.grant?.maxDispatches ?? record.scope.maxDispatches;
  return {
    goalId: record.goalId,
    scopeRevision: record.scopeRevision,
    state: record.state,
    goalText: record.scope.goalText,
    goalConditions: record.scope.goalConditions,
    preservationConditions: record.scope.preservationConditions,
    goalHash: record.goalHash,
    confirmationRequired: record.state === 'AWAITING_CONFIRMATION',
    target: {
      documentId: record.binding.documentId,
      elementId: record.binding.elementId,
      primaryWorkspaceId: record.binding.primaryWorkspaceId,
      candidateWorkspaceId: record.candidateWorkspaceId,
      baseMicroversion: record.scope.target.baseMicroversion,
    },
    scope: {
      featureIds: [...record.scope.featureIds],
      operations: [...record.scope.operations],
      maxDispatches: record.scope.maxDispatches,
      lifetimeMs: record.scope.lifetimeMs,
    },
    progress: {
      dispatches: usable ? usable.counted : null,
      remaining: usable ? Math.max(0, budget - usable.counted) : null,
      unreconciledSequence: usable ? usable.unreconciledSequence : null,
      // Mirrors the server entry unchanged; shown to agents too (goal-1.1.0 §9).
      unreconciledEntry: usable?.unreconciledEntry ? {...usable.unreconciledEntry} : null,
      lastOutcome: usable ? usable.lastOutcome : null,
      lastVerification: record.verifications.at(-1) ?? null,
    },
    grant: record.grant
      ? {revision: record.grant.grantRevision, state: record.grant.state, expiresAt: record.grant.expiresAt}
      : null,
    confirmation: {
      expiresAt: record.confirmation.expiresAt,
      confirmedAt: record.confirmation.confirmedAt ?? null,
      confirmedBy: record.confirmation.confirmedBy ?? null,
      // Agents, signed reports and every other projection never see the nonce (§9, CR-1).
      nonce: null,
    },
    result: record.result,
    capability,
    observedAt: now,
  };
}

// Structural check of a stored record. Fails closed on anything the lifecycle relies on.
export function validateRecord(value: unknown, goalId: string): GoalRecord {
  // Deserialization boundary: every field the lifecycle relies on is checked below before the value is returned.
  const v = value as GoalRecord;
  if (
    !isRecord(value) ||
    v.goalId !== goalId ||
    !uuidV4(v.goalId) ||
    !safeInt(v.scopeRevision, 1) ||
    !GOAL_STATES.includes(v.state) ||
    !isRecord(v.binding) ||
    typeof v.binding.agentId !== 'string' ||
    ![v.binding.documentId, v.binding.elementId, v.binding.primaryWorkspaceId].every(hex24) ||
    (v.candidateWorkspaceId !== null && !hex24(v.candidateWorkspaceId)) ||
    !isRecord(v.confirmation) ||
    typeof v.confirmation.nonce !== 'string' ||
    !/^[a-f0-9]{32}$/.test(v.confirmation.nonce) ||
    !safeInt(v.confirmation.issuedAt, 0) ||
    !safeInt(v.confirmation.expiresAt, 0) ||
    (v.grant !== null && (!isRecord(v.grant) || !safeInt(v.grant.grantRevision, 1))) ||
    !Array.isArray(v.reconciliations) ||
    !Array.isArray(v.verifications) ||
    v.verifications.length > MAX_VERIFICATIONS ||
    !safeInt(v.lastGrantRevision, 0) ||
    (v.grant !== null && v.grant.grantRevision > v.lastGrantRevision) ||
    !safeInt(v.createdAt, 0) ||
    !safeInt(v.updatedAt, 0)
  ) {
    return fail('goal_state_invalid');
  }
  let scope: GoalScope;
  try {
    scope = validateScope(v.scope);
  } catch {
    return fail('goal_state_invalid');
  }
  if (goalHash(scope) !== v.goalHash) {
    return fail('goal_state_invalid');
  }
  return v;
}

// Size bound for a GoalView projection (dashboard JSON limits, tool results). Keeps every key; when the view is too
// large, the last verification keeps only its non-passing checks (failures first), then none.
export function boundedView(view: GoalView, maxBytes: number): GoalView {
  const fits = (candidate: GoalView) => Buffer.byteLength(JSON.stringify(candidate)) <= maxBytes;
  const last = view.progress.lastVerification;
  if (fits(view) || !last) {
    return view;
  }
  const withChecks = (checks: VerificationCheck[]): GoalView => ({
    ...view,
    progress: {...view.progress, lastVerification: {...last, checks}},
  });
  const order = {fail: 0, unverifiable: 1, pass: 2};
  const open = last.checks.filter((c) => c.result !== 'pass').sort((a, b) => order[a.result] - order[b.result]);
  for (const limit of [50, 20, 5]) {
    const trimmed = withChecks(open.slice(0, limit));
    if (fits(trimmed)) {
      return trimmed;
    }
  }
  return withChecks([]);
}

// The goal part of a signed onshape_complete_task report (§7): what the Lead needs to post the result. Bounded so that
// the signed A2A result stays far below the 32 768-character transport limit.
export function reportView(view: GoalView) {
  const result = view.result
    ? {...view.result, openLimits: view.result.openLimits.slice(0, 20).map((text) => text.slice(0, 500))}
    : null;
  return {
    goalId: view.goalId,
    scopeRevision: view.scopeRevision,
    state: view.state,
    goalHash: view.goalHash,
    result,
    capability: view.capability,
  };
}

// §9 CR-1: the only projection that carries the confirmation nonce. Used solely by the dashboard goal-status action
// (operator.read) for the current goal; any state other than AWAITING_CONFIRMATION yields null.
export function operatorNonceView(view: GoalView, record: GoalRecord): GoalView {
  const nonce =
    record.goalId === view.goalId && record.state === 'AWAITING_CONFIRMATION' && view.state === 'AWAITING_CONFIRMATION'
      ? record.confirmation.nonce
      : null;
  return {...view, confirmation: {...view.confirmation, nonce}};
}
