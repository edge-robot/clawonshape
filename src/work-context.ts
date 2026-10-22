// Pure work-context model (docs/interface/work-context.md, work-context-1.0.0-draft): binding key, part eligibility,
// provider-response projections (R2–R4), the Catalog and WorkContextView projections and the revalidation table.
// No I/O, no clock, no OpenClaw imports.
import type {Binding} from './config.ts';
import {canonicalJson, hex24, sha256Hex} from './goal-scope.ts';

// §2 ⚠️ WC3: the OpenAPI schema types partId as a plain string; the pattern is widened from a live response.
export const PART_ID = /^[A-Za-z0-9_.+-]{1,64}$/;
export const PART_NAME_MAX = 200;
export const PART_LIMIT = 500;
export const PART_STUDIO_LIMIT = 1000;
// Upper bound for validated part entries in one R4 response (the byte limit of the read bounds it as well).
export const PART_RESPONSE_LIMIT = 10_000;

export type SelectionReason = 'part_kind_unsupported';
export type CatalogPart = {
  partId: string;
  name: string;
  bodyType: string;
  hidden: boolean;
  selectable: boolean;
  reason: SelectionReason | null;
};
export type PartStudio = {elementId: string; name: string | null};
export type CatalogWorkspace = {
  workspaceId: string;
  name: string | null;
  role: 'primary' | 'candidate';
  selectable: boolean;
  reason: 'candidate_inspection_only' | null;
};
export type CatalogPartStudio = {
  elementId: string;
  name: string | null;
  goalEligible: boolean;
  reason: 'element_not_provisioned' | 'configuration_unsupported' | null;
  truncated: boolean;
  parts: CatalogPart[] | null;
};
export type Catalog = {
  document: {documentId: string; name: string | null; preselected: true};
  workspaces: CatalogWorkspace[];
  observedMicroversion: string;
  partStudios: CatalogPartStudio[];
  selectionRevision: number;
  observedAt: number;
};

export type Selection = {
  documentId: string;
  workspaceId: string;
  elementId: string;
  partId: string;
  partName: string;
  bodyType: string;
  configuration: 'default';
  observedMicroversion: string;
};
export type AdoptedBy = {kind: 'dashboard-operator'; clientId?: string};
// §3. After work-context-clear, selection, adoptedAt and adoptedBy are null and the revision is kept (never reused).
export type SelectionRecord = {
  version: 1;
  bindingKey: string;
  selectionRevision: number;
  selection: Selection | null;
  adoptedAt: number | null;
  adoptedBy: AdoptedBy | null;
};

export type Validity = 'none' | 'valid' | 'invalid' | 'unverified';
export type Interlock = {blocked: boolean; code: string | null; goalId: string | null};
export type WorkContextView = {
  selectionRevision: number;
  validity: Validity;
  reason: string | null;
  selection:
    | (Selection & {
        documentName: string | null;
        workspaceName: string | null;
        partStudioName: string | null;
        currentMicroversion: string | null;
        onshapeUrl: string;
      })
    | null;
  adoptedAt: number | null;
  adoptedBy: AdoptedBy | null;
  interlock: Interlock;
  observedAt: number;
};
export type {GoalFocus} from './goal-scope.ts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const safeInt = (value: unknown, min: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min;
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

function protocolError(): never {
  throw new Error('provider_protocol_error');
}
function invalidState(): never {
  throw new Error('goal_state_invalid');
}

// §3 bindingKey: SHA-256 of the canonical JSON (goal-workflow §2) of the eight binding fields of §1.
export function bindingKeyFields(binding: Binding) {
  if (!binding.elementId) {
    throw new Error('target_missing');
  }
  return {
    agentId: binding.agentId,
    requesterSenderId: binding.requesterSenderId,
    messageChannel: binding.messageChannel,
    agentAccountId: binding.agentAccountId,
    connectionRef: binding.connectionRef,
    documentId: binding.documentId,
    primaryWorkspaceId: binding.primaryWorkspaceId,
    elementId: binding.elementId,
  };
}
export const bindingKey = (binding: Binding): string => sha256Hex(canonicalJson(bindingKeyFields(binding)));

// Display label: the existing display-name rules (no control, format or surrogate characters, trimmed), then a length.
export function displayName(raw: unknown, max: number): string | null {
  if (typeof raw !== 'string' || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(raw)) {
    return null;
  }
  const name = raw.trim();
  return name && Array.from(name).length <= max ? name : null;
}

export const validPartId = (value: unknown): value is string => typeof value === 'string' && PART_ID.test(value);

// §1 part kind: selectable only for solid, non-mesh, non-flattened bodies. A missing or non-boolean flag is not
// evidence of "not mesh" / "not flattened": such a part is listed as unsupported (fail closed).
function selectablePart(entry: Record<string, unknown>, bodyType: string): boolean {
  return bodyType === 'solid' && entry.isMesh === false && entry.isFlattenedBody === false;
}

// R4 projection: every entry is validated (an invalid partId or name fails the whole response), partIds are unique,
// and the list is sorted by name, then partId (§6.1).
export function projectParts(response: unknown): CatalogPart[] {
  if (!Array.isArray(response) || response.length > PART_RESPONSE_LIMIT) {
    return protocolError();
  }
  const parts: CatalogPart[] = [];
  const seen = new Set<string>();
  for (const entry of response) {
    if (!isRecord(entry) || !validPartId(entry.partId) || seen.has(entry.partId)) {
      return protocolError();
    }
    const name = displayName(entry.name, PART_NAME_MAX);
    const bodyType = displayName(entry.bodyType, 64);
    if (name === null || bodyType === null) {
      return protocolError();
    }
    if (entry.isHidden !== undefined && typeof entry.isHidden !== 'boolean') {
      return protocolError();
    }
    seen.add(entry.partId);
    const selectable = selectablePart(entry, bodyType);
    parts.push({
      partId: entry.partId,
      name,
      bodyType,
      hidden: entry.isHidden === true,
      selectable,
      reason: selectable ? null : 'part_kind_unsupported',
    });
  }
  return parts.sort((a, b) => compare(a.name, b.name) || compare(a.partId, b.partId));
}

// Locale-independent order so that the catalog is reproducible on every host.
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// R2 projection: Part Studios at the observed revision, in provider order.
export function projectPartStudios(response: unknown): PartStudio[] {
  if (!Array.isArray(response) || response.length > PART_STUDIO_LIMIT) {
    return protocolError();
  }
  const studios: PartStudio[] = [];
  for (const entry of response) {
    if (!isRecord(entry) || !hex24(entry.id)) {
      return protocolError();
    }
    // The query asks for Part Studios only; anything else is ignored rather than trusted.
    if (entry.elementType === 'PARTSTUDIO') {
      studios.push({elementId: entry.id, name: displayName(entry.name, 256)});
    }
  }
  if (new Set(studios.map((s) => s.elementId)).size !== studios.length) {
    return protocolError();
  }
  return studios;
}

// R3: true when the Part Studio has configuration parameters (configuration_unsupported).
export function configured(response: unknown): boolean {
  if (!isRecord(response) || !Array.isArray(response.configurationParameters)) {
    return protocolError();
  }
  return response.configurationParameters.length > 0;
}

// §5 steps 5 and 6 and the §5.2 rows for a stored or requested part at one revision. Returns null when it holds.
export function partCheck(
  studios: PartStudio[],
  isConfigured: boolean,
  parts: CatalogPart[] | null,
  elementId: string,
  partId: string,
): string | null {
  if (!studios.some((s) => s.elementId === elementId)) {
    return 'target_not_part_studio';
  }
  if (isConfigured) {
    return 'configuration_unsupported';
  }
  const part = (parts ?? []).filter((p) => p.partId === partId);
  if (part.length !== 1) {
    return 'selection_part_missing';
  }
  if (!part[0].selectable) {
    return 'selection_part_unsupported';
  }
  return null;
}

export type CatalogInput = {
  binding: Binding;
  documentName: string | null;
  workspaces: {workspaceId: string; name: string | null}[];
  candidateWorkspaceId: string | null;
  observedMicroversion: string;
  studios: PartStudio[];
  isConfigured: boolean;
  parts: CatalogPart[] | null;
  selectionRevision: number;
  observedAt: number;
};

// §6.1 Catalog. Only the bound document and Primary are selectable; only the bound element is enumerated.
export function catalogView(input: CatalogInput): Catalog {
  const {binding} = input;
  const nameOf = (workspaceId: string) => input.workspaces.find((w) => w.workspaceId === workspaceId)?.name ?? null;
  const workspaces: CatalogWorkspace[] = [
    {
      workspaceId: binding.primaryWorkspaceId,
      name: nameOf(binding.primaryWorkspaceId),
      role: 'primary',
      selectable: true,
      reason: null,
    },
  ];
  const candidate = input.candidateWorkspaceId;
  if (
    candidate &&
    candidate !== binding.primaryWorkspaceId &&
    input.workspaces.some((w) => w.workspaceId === candidate)
  ) {
    workspaces.push({
      workspaceId: candidate,
      name: nameOf(candidate),
      role: 'candidate',
      selectable: false,
      reason: 'candidate_inspection_only',
    });
  }
  const partStudios = input.studios.map((studio): CatalogPartStudio => {
    if (studio.elementId !== binding.elementId) {
      return {...studio, goalEligible: false, reason: 'element_not_provisioned', truncated: false, parts: null};
    }
    if (input.isConfigured || input.parts === null) {
      return {...studio, goalEligible: false, reason: 'configuration_unsupported', truncated: false, parts: null};
    }
    return {
      ...studio,
      goalEligible: true,
      reason: null,
      truncated: input.parts.length > PART_LIMIT,
      parts: input.parts.slice(0, PART_LIMIT),
    };
  });
  return {
    document: {documentId: binding.documentId, name: input.documentName, preselected: true},
    workspaces,
    observedMicroversion: input.observedMicroversion,
    partStudios,
    selectionRevision: input.selectionRevision,
    observedAt: input.observedAt,
  };
}

export type Observation =
  | {
      ok: true;
      currentMicroversion: string;
      check: string | null;
      documentName: string | null;
      workspaceName: string | null;
      partStudioName: string | null;
      currentPartName: string | null;
    }
  | {ok: false; code: string};

// §5.2 revalidation table.
export function revalidate(
  selection: Selection | null,
  observation: Observation | undefined,
): {validity: Validity; reason: string | null} {
  if (!selection) {
    return {validity: 'none', reason: null};
  }
  if (!observation?.ok) {
    return {validity: 'unverified', reason: observation?.code ?? 'onshape_unavailable'};
  }
  if (observation.check === 'target_not_part_studio' || observation.check === 'selection_part_missing') {
    return {validity: 'invalid', reason: 'selection_part_missing'};
  }
  if (observation.check) {
    return {validity: 'invalid', reason: observation.check};
  }
  if (observation.currentMicroversion !== selection.observedMicroversion) {
    return {validity: 'valid', reason: 'revision_advanced'};
  }
  return {validity: 'valid', reason: null};
}

export const onshapeUrl = (s: Selection) =>
  `https://cad.onshape.com/documents/${s.documentId}/w/${s.workspaceId}/e/${s.elementId}`;

// §6.2 WorkContextView. Names come from the status-time reads; a missing name is null, never the ID.
export function workContextView(
  record: SelectionRecord | undefined,
  observation: Observation | undefined,
  interlock: Interlock,
  observedAt: number,
): WorkContextView {
  const selection = record?.selection ?? null;
  const {validity, reason} = revalidate(selection, observation);
  const seen = observation?.ok ? observation : undefined;
  return {
    selectionRevision: record?.selectionRevision ?? 0,
    validity,
    reason,
    selection: selection
      ? {
          documentId: selection.documentId,
          documentName: seen?.documentName ?? null,
          workspaceId: selection.workspaceId,
          workspaceName: seen?.workspaceName ?? null,
          elementId: selection.elementId,
          partStudioName: seen?.partStudioName ?? null,
          partId: selection.partId,
          // The current label when the part is still present; otherwise the adopted label (never the ID).
          partName: seen?.currentPartName ?? selection.partName,
          bodyType: selection.bodyType,
          configuration: selection.configuration,
          observedMicroversion: selection.observedMicroversion,
          currentMicroversion: seen?.currentMicroversion ?? null,
          onshapeUrl: onshapeUrl(selection),
        }
      : null,
    adoptedAt: selection ? (record?.adoptedAt ?? null) : null,
    adoptedBy: selection && record?.adoptedBy ? {...record.adoptedBy} : null,
    interlock: {...interlock},
    observedAt,
  };
}

const SELECTION_KEYS = [
  'documentId',
  'workspaceId',
  'elementId',
  'partId',
  'partName',
  'bodyType',
  'configuration',
  'observedMicroversion',
] as const;

// Deserialization boundary of a stored record (§3). Anything unexpected fails closed with goal_state_invalid.
export function validateSelectionRecord(value: unknown, key: string): SelectionRecord {
  if (
    !isRecord(value) ||
    !exactKeys(value, ['version', 'bindingKey', 'selectionRevision', 'selection', 'adoptedAt', 'adoptedBy']) ||
    value.version !== 1 ||
    value.bindingKey !== key ||
    !safeInt(value.selectionRevision, 1)
  ) {
    return invalidState();
  }
  if (value.selection === null) {
    if (value.adoptedAt !== null || value.adoptedBy !== null) {
      return invalidState();
    }
    return {
      version: 1,
      bindingKey: key,
      selectionRevision: value.selectionRevision,
      selection: null,
      adoptedAt: null,
      adoptedBy: null,
    };
  }
  const s = value.selection;
  if (
    !isRecord(s) ||
    !exactKeys(s, SELECTION_KEYS) ||
    ![s.documentId, s.workspaceId, s.elementId, s.observedMicroversion].every(hex24) ||
    !validPartId(s.partId) ||
    displayName(s.partName, PART_NAME_MAX) !== s.partName ||
    displayName(s.bodyType, 64) !== s.bodyType ||
    s.configuration !== 'default' ||
    !safeInt(value.adoptedAt, 0)
  ) {
    return invalidState();
  }
  const by = value.adoptedBy;
  if (
    !isRecord(by) ||
    by.kind !== 'dashboard-operator' ||
    Object.keys(by).some((k) => k !== 'kind' && k !== 'clientId') ||
    (by.clientId !== undefined && (typeof by.clientId !== 'string' || displayName(by.clientId, 256) !== by.clientId))
  ) {
    return invalidState();
  }
  return {
    version: 1,
    bindingKey: key,
    selectionRevision: value.selectionRevision,
    selection: {
      documentId: s.documentId as string,
      workspaceId: s.workspaceId as string,
      elementId: s.elementId as string,
      partId: s.partId,
      partName: s.partName as string,
      bodyType: s.bodyType as string,
      configuration: 'default',
      observedMicroversion: s.observedMicroversion as string,
    },
    adoptedAt: value.adoptedAt,
    adoptedBy: {kind: 'dashboard-operator', ...(typeof by.clientId === 'string' ? {clientId: by.clientId} : {})},
  };
}

// §2/§3 increment-1 bounds of a selection: the bound document, the protected Primary and the bound element.
export function selectionInBounds(selection: Selection, binding: Binding): boolean {
  return (
    selection.documentId === binding.documentId &&
    selection.workspaceId === binding.primaryWorkspaceId &&
    selection.elementId === binding.elementId
  );
}
