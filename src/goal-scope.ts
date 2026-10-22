// Pure goal scope model (docs/interface/goal-workflow.md §2, §6). No I/O, no clock, no OpenClaw imports.
import {createHash} from 'node:crypto';

export const GOAL_OPERATION = 'updatePartStudioFeature';
export const GOAL_DEFAULT_MAX_DISPATCHES = 10;
export const GOAL_MAX_DISPATCHES = 25;
export const GOAL_DEFAULT_LIFETIME_MS = 7_200_000;
export const GOAL_MIN_LIFETIME_MS = 60_000;
export const GOAL_MAX_LIFETIME_MS = 28_800_000;

export type ConditionKind = 'parameterEquals' | 'featureState' | 'featureUnchanged' | 'note';
export type GoalCondition = {
  id: string;
  kind: ConditionKind;
  featureId?: string;
  parameterId?: string;
  expression?: string;
  state?: 'OK';
  text: string;
};
export type GoalTarget = {
  documentId: string;
  elementId: string;
  primaryWorkspaceId: string;
  baseMicroversion: string;
};
export type GoalScope = {
  version: 1;
  goalText: string;
  goalConditions: GoalCondition[];
  preservationConditions: GoalCondition[];
  target: GoalTarget;
  candidate: {mode: 'create'; workspaceId: null} | {mode: 'reuse'; workspaceId: string};
  operations: ['updatePartStudioFeature'];
  featureIds: string[];
  maxDispatches: number;
  lifetimeMs: number;
  requester: {channel: string; senderId: string};
  origin: {channel: string; target: string};
  // goal-1.2.0 (work-context.md §7): present only for a valid work-context selection; part of goalHash when present.
  focus?: GoalFocus;
};
// Intent, not a containment claim: goal and preservation conditions stay feature-based.
export type GoalFocus = {partId: string; partName: string; elementId: string; selectionRevision: number};
// work-context.md §2 ⚠️ WC3 (same pattern as the selection record).
const FOCUS_PART_ID = /^[A-Za-z0-9_.+-]{1,64}$/;

const HEX24 = /^[a-f0-9]{24}$/;
export const GOAL_FEATURE_ID = /^[A-Za-z0-9_]{1,64}$/;
const CONDITION_ID = /^[a-z0-9-]{1,32}$/;
// biome-ignore lint/suspicious/noControlCharactersInRegex: identifiers must not carry control characters
const CONTROL = /[\u0000-\u001f\u007f]/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const boundedText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length >= 1 && value.length <= max && value.trim().length > 0;
const identifier = (value: unknown, max = 256): value is string =>
  typeof value === 'string' && value.length >= 1 && value.length <= max && !CONTROL.test(value);
const onlyKeys = (value: Record<string, unknown>, allowed: readonly string[]) =>
  Object.keys(value).every((key) => allowed.includes(key));
export const hex24 = (value: unknown): value is string => typeof value === 'string' && HEX24.test(value);

function invalid(): never {
  throw new Error('invalid_arguments');
}

// Canonical JSON (§2): keys sorted at every level, no whitespace, UTF-8 without ASCII escaping, arrays in order.
// Only plain JSON data is accepted; anything else fails closed instead of being silently dropped.
export function canonicalJson(value: unknown): string {
  let nodes = 0;
  const encode = (v: unknown, depth: number): string => {
    if (depth > 64 || ++nodes > 200_000) {
      invalid();
    }
    if (v === null || typeof v === 'string' || typeof v === 'boolean') {
      return JSON.stringify(v);
    }
    if (typeof v === 'number') {
      return Number.isFinite(v) ? JSON.stringify(v) : invalid();
    }
    if (Array.isArray(v)) {
      return `[${v.map((item) => encode(item, depth + 1)).join(',')}]`;
    }
    if (!isRecord(v) || ![Object.prototype, null].includes(Object.getPrototypeOf(v))) {
      return invalid();
    }
    const keys = Object.keys(v).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${encode(v[key], depth + 1)}`).join(',')}}`;
  };
  return encode(value, 0);
}

export const sha256Hex = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

// goalHash = SHA-256 of the canonical scope; featureIds are sorted before hashing (§2).
export function goalHash(scope: GoalScope): string {
  return sha256Hex(canonicalJson({...scope, featureIds: [...scope.featureIds].sort()}));
}

const CONDITION_FIELDS: Record<ConditionKind, readonly string[]> = {
  parameterEquals: ['featureId', 'parameterId', 'expression'],
  featureState: ['featureId', 'state'],
  featureUnchanged: ['featureId'],
  note: [],
};

function validateCondition(value: unknown): GoalCondition {
  if (!isRecord(value) || typeof value.kind !== 'string' || !Object.hasOwn(CONDITION_FIELDS, value.kind)) {
    return invalid();
  }
  const kind = value.kind as ConditionKind;
  const required = CONDITION_FIELDS[kind];
  // Only the fields of this kind are allowed: every key is part of the confirmed goalHash.
  if (!onlyKeys(value, ['id', 'kind', 'text', ...required]) || !required.every((key) => key in value)) {
    return invalid();
  }
  if (typeof value.id !== 'string' || !CONDITION_ID.test(value.id) || !boundedText(value.text, 500)) {
    return invalid();
  }
  if ('featureId' in value && (typeof value.featureId !== 'string' || !GOAL_FEATURE_ID.test(value.featureId))) {
    return invalid();
  }
  if ('parameterId' in value && !identifier(value.parameterId, 128)) {
    return invalid();
  }
  if ('expression' in value && !boundedText(value.expression, 200)) {
    return invalid();
  }
  if ('state' in value && value.state !== 'OK') {
    return invalid();
  }
  const condition: GoalCondition = {id: value.id, kind, text: value.text};
  for (const key of required) {
    // Validated above; the record is a JSON object of strings for these keys.
    Object.assign(condition, {[key]: value[key]});
  }
  return condition;
}

function validateConditions(value: unknown, min: number): GoalCondition[] {
  if (!Array.isArray(value) || value.length < min || value.length > 20) {
    return invalid();
  }
  const conditions = value.map(validateCondition);
  if (new Set(conditions.map((c) => c.id)).size !== conditions.length) {
    return invalid();
  }
  return conditions;
}

export function validateFeatureIds(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > 32 ||
    value.some((f) => typeof f !== 'string' || !GOAL_FEATURE_ID.test(f)) ||
    new Set(value).size !== value.length
  ) {
    return invalid();
  }
  return [...(value as string[])].sort();
}

// Structural validation of a complete scope (§2). Throws invalid_arguments. Returns a fresh copy.
export function validateScope(value: unknown): GoalScope {
  const keys = [
    'version',
    'goalText',
    'goalConditions',
    'preservationConditions',
    'target',
    'candidate',
    'operations',
    'featureIds',
    'maxDispatches',
    'lifetimeMs',
    'requester',
    'origin',
  ];
  if (
    !isRecord(value) ||
    !onlyKeys(value, [...keys, 'focus']) ||
    !keys.every((key) => key in value) ||
    value.version !== 1
  ) {
    return invalid();
  }
  if (!boundedText(value.goalText, 2000)) {
    return invalid();
  }
  const goalConditions = validateConditions(value.goalConditions, 1);
  if (!goalConditions.some((c) => c.kind !== 'note')) {
    return invalid();
  }
  const preservationConditions = validateConditions(value.preservationConditions, 0);
  const target = value.target;
  if (
    !isRecord(target) ||
    !onlyKeys(target, ['documentId', 'elementId', 'primaryWorkspaceId', 'baseMicroversion']) ||
    ![target.documentId, target.elementId, target.primaryWorkspaceId, target.baseMicroversion].every(hex24)
  ) {
    return invalid();
  }
  const candidate = value.candidate;
  if (!isRecord(candidate) || !onlyKeys(candidate, ['mode', 'workspaceId']) || !('workspaceId' in candidate)) {
    return invalid();
  }
  let candidatePlan: GoalScope['candidate'];
  if (candidate.mode === 'create' && candidate.workspaceId === null) {
    candidatePlan = {mode: 'create', workspaceId: null};
  } else if (
    candidate.mode === 'reuse' &&
    hex24(candidate.workspaceId) &&
    candidate.workspaceId !== target.primaryWorkspaceId
  ) {
    candidatePlan = {mode: 'reuse', workspaceId: candidate.workspaceId};
  } else {
    return invalid();
  }
  if (!Array.isArray(value.operations) || value.operations.length !== 1 || value.operations[0] !== GOAL_OPERATION) {
    return invalid();
  }
  const featureIds = validateFeatureIds(value.featureIds);
  if (canonicalJson(featureIds) !== canonicalJson(value.featureIds)) {
    // §2: featureIds are stored sorted ascending.
    return invalid();
  }
  if (
    !Number.isSafeInteger(value.maxDispatches) ||
    (value.maxDispatches as number) < 1 ||
    (value.maxDispatches as number) > GOAL_MAX_DISPATCHES ||
    !Number.isSafeInteger(value.lifetimeMs) ||
    (value.lifetimeMs as number) < GOAL_MIN_LIFETIME_MS ||
    (value.lifetimeMs as number) > GOAL_MAX_LIFETIME_MS
  ) {
    return invalid();
  }
  const requester = value.requester;
  const origin = value.origin;
  if (
    !isRecord(requester) ||
    !onlyKeys(requester, ['channel', 'senderId']) ||
    !identifier(requester.channel) ||
    !identifier(requester.senderId) ||
    !isRecord(origin) ||
    !onlyKeys(origin, ['channel', 'target']) ||
    !identifier(origin.channel) ||
    !identifier(origin.target)
  ) {
    return invalid();
  }
  const focus = 'focus' in value ? validateFocus(value.focus, target.elementId as string) : undefined;
  return {
    version: 1,
    goalText: value.goalText,
    goalConditions,
    preservationConditions,
    target: {
      documentId: target.documentId as string,
      elementId: target.elementId as string,
      primaryWorkspaceId: target.primaryWorkspaceId as string,
      baseMicroversion: target.baseMicroversion as string,
    },
    candidate: candidatePlan,
    operations: [GOAL_OPERATION],
    featureIds,
    maxDispatches: value.maxDispatches as number,
    lifetimeMs: value.lifetimeMs as number,
    requester: {channel: requester.channel, senderId: requester.senderId},
    origin: {channel: origin.channel, target: origin.target},
    // Absent key without a selection: a goal without focus hashes exactly as in goal-1.1.0.
    ...(focus ? {focus} : {}),
  };
}

function validateFocus(value: unknown, elementId: string): GoalFocus {
  if (
    !isRecord(value) ||
    !onlyKeys(value, ['partId', 'partName', 'elementId', 'selectionRevision']) ||
    typeof value.partId !== 'string' ||
    !FOCUS_PART_ID.test(value.partId) ||
    !identifier(value.partName, 200) ||
    value.partName.trim() !== value.partName ||
    value.elementId !== elementId ||
    !Number.isSafeInteger(value.selectionRevision) ||
    (value.selectionRevision as number) < 1
  ) {
    return invalid();
  }
  return {
    partId: value.partId,
    partName: value.partName,
    elementId,
    selectionRevision: value.selectionRevision as number,
  };
}

// Every feature ID a scope refers to (scope featureIds and condition featureIds), sorted and unique.
export function referencedFeatureIds(scope: GoalScope): string[] {
  const ids = new Set(scope.featureIds);
  for (const condition of [...scope.goalConditions, ...scope.preservationConditions]) {
    if (condition.featureId) {
      ids.add(condition.featureId);
    }
  }
  return [...ids].sort();
}

// GW3 (§6): volatile keys of a v16 features-read feature object. Fixed by
// tests/fixtures/features-response-goal-2026-10-21.json; anything else is part of the canonical feature hash.
export const VOLATILE_FEATURE_KEYS: readonly string[] = ['nodeId', 'microversionSkew'];
const volatileKey = (key: string) => VOLATILE_FEATURE_KEYS.includes(key) || key.startsWith('_');

function stripVolatile(value: unknown, depth: number): unknown {
  if (depth > 64) {
    return invalid();
  }
  if (Array.isArray(value)) {
    return value.map((item) => stripVolatile(item, depth + 1));
  }
  if (isRecord(value)) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      if (!volatileKey(key)) {
        result[key] = stripVolatile(value[key], depth + 1);
      }
    }
    return result;
  }
  return value;
}

export function canonicalFeatureHash(feature: unknown): string {
  if (!isRecord(feature)) {
    return invalid();
  }
  return sha256Hex(canonicalJson(stripVolatile(feature, 0)));
}
