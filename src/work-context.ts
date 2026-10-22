// Pure work-context model (docs/interface/work-context.md, work-context-1.1.0-draft): binding key, part eligibility,
// provider-response projections (R2–R7), the Catalog, WorkContextView and §11 browsing views, the revalidation table.
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
export type PartRow = CatalogPart & {partNumber: string | null};
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
// and the list is sorted by name, then partId (§6.1). The catalog part view carries no part number.
export function projectParts(response: unknown): CatalogPart[] {
  return projectPartRows(response).map(({partNumber: _partNumber, ...part}) => part);
}

// R4 projection with the part number label (§11.3 PartSearch). A missing or invalid part number is null.
export function projectPartRows(response: unknown): PartRow[] {
  if (!Array.isArray(response) || response.length > PART_RESPONSE_LIMIT) {
    return protocolError();
  }
  const parts: PartRow[] = [];
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
      partNumber: displayName(entry.partNumber, PART_NAME_MAX),
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

// ---------------------------------------------------------------------------------------------------------------------
// §11 browsing (work-context-1.1.0-draft): documents, workspaces and part search. Inspection-only outside the §1
// bounds; nothing here widens what adopt accepts.

export const DOCUMENT_PAGE_SIZE = 20;
export const QUERY_MAX = 100;
export const STUDIO_SCAN_LIMIT = 20;
export const HIT_LIMIT = 100;
export const WORKSPACE_LIMIT = 1000;

export type DocumentFilter = 'recent' | 'mine' | 'shared';
// §11.2 filter → getDocuments `filter` (0 My Documents, 2 Shared, 5 Recent).
export const DOCUMENT_FILTER: Readonly<Record<DocumentFilter, number>> = Object.freeze({recent: 5, mine: 0, shared: 2});

export type BrowseReason =
  | 'document_not_provisioned'
  | 'candidate_inspection_only'
  | 'workspace_inspection_only'
  | 'element_not_provisioned'
  | 'configuration_unsupported'
  | 'part_kind_unsupported';

// Only these four R6 fields may reach a view (§11.1); owner, e-mail and permissions are never copied.
export type DocumentSummary = {
  documentId: string;
  name: string | null;
  modifiedAt: string | null;
  defaultWorkspaceId: string | null;
};
export type DocumentPageItem = {
  documentId: string;
  name: string | null;
  modifiedAt: string | null;
  bound: boolean;
  goalEligible: boolean;
  reason: 'document_not_provisioned' | null;
};
export type DocumentPage = {
  items: DocumentPageItem[];
  offset: number;
  hasMore: boolean;
  query: string;
  observedAt: number;
};
export type WorkspaceRole = 'primary' | 'candidate' | 'default' | 'other';
export type WorkspaceSummary = {workspaceId: string; name: string | null; readOnly: boolean};
export type WorkspaceListItem = WorkspaceSummary & {
  role: WorkspaceRole;
  goalEligible: boolean;
  reason: BrowseReason | null;
};
export type WorkspaceList = {documentId: string; items: WorkspaceListItem[]; observedAt: number};
export type PartSearchStudio = {
  elementId: string;
  name: string | null;
  goalEligible: boolean;
  reason: BrowseReason | null;
  configurationChecked: boolean;
};
export type PartSearchHit = {
  elementId: string;
  partId: string;
  name: string;
  partNumber: string | null;
  bodyType: string;
  hidden: boolean;
  selectable: boolean;
  reason: BrowseReason | null;
};
export type PartSearch = {
  documentId: string;
  workspaceId: string;
  observedMicroversion: string;
  query: string;
  studios: PartSearchStudio[];
  hits: PartSearchHit[];
  truncated: boolean;
  truncatedReason: 'part_search_truncated' | null;
  observedAt: number;
};

// §11.4 query: trimmed, NFC, at most 100 characters, no control/format/surrogate characters. Absent = "".
export function normalizeQuery(raw: unknown): string {
  if (raw === undefined) {
    return '';
  }
  if (typeof raw !== 'string' || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(raw)) {
    throw new Error('invalid_arguments');
  }
  const query = raw.normalize('NFC').trim();
  if (Array.from(query).length > QUERY_MAX) {
    throw new Error('invalid_arguments');
  }
  return query;
}

const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
// modifiedAt is a display label: a well-formed ISO-8601 timestamp is passed through, anything else is null.
function isoLabel(raw: unknown): string | null {
  return typeof raw === 'string' && raw.length <= 40 && ISO_8601.test(raw) && !Number.isNaN(Date.parse(raw))
    ? raw
    : null;
}

// R0 / R6 item → DocumentSummary. The id is identity and must be valid; everything else is a nullable label.
export function documentSummary(entry: unknown): DocumentSummary {
  if (!isRecord(entry) || !hex24(entry.id)) {
    return protocolError();
  }
  const workspace = entry.defaultWorkspace;
  return {
    documentId: entry.id,
    name: displayName(entry.name, 256),
    modifiedAt: isoLabel(entry.modifiedAt),
    defaultWorkspaceId: isRecord(workspace) && hex24(workspace.id) ? workspace.id : null,
  };
}

// R6 projection (getDocuments, BTGlobalTreeNodeListResponse). Items other than `document-summary` and trashed
// documents are dropped; a trash flag that is not exactly false is treated as trashed (never shown).
export function projectDocumentPage(response: unknown): {documents: DocumentSummary[]; hasMore: boolean} {
  if (!isRecord(response) || !Array.isArray(response.items) || response.items.length > DOCUMENT_PAGE_SIZE) {
    return protocolError();
  }
  if (response.next !== undefined && response.next !== null && typeof response.next !== 'string') {
    return protocolError();
  }
  const documents: DocumentSummary[] = [];
  for (const entry of response.items) {
    if (!isRecord(entry)) {
      return protocolError();
    }
    if (entry.jsonType !== 'document-summary' || (entry.trash !== undefined && entry.trash !== false)) {
      continue;
    }
    documents.push(documentSummary(entry));
  }
  if (new Set(documents.map((d) => d.documentId)).size !== documents.length) {
    return protocolError();
  }
  return {documents, hasMore: typeof response.next === 'string' && response.next.length > 0};
}

// §11.3 DocumentPage. On page 0 the bound document is pinned first (even when it does not match the query); the
// bound document never appears a second time on any page.
export function documentPageView(input: {
  binding: Binding;
  bound: DocumentSummary | null;
  documents: DocumentSummary[];
  offset: number;
  hasMore: boolean;
  query: string;
  observedAt: number;
}): DocumentPage {
  const item = (d: DocumentSummary, bound: boolean): DocumentPageItem => ({
    documentId: d.documentId,
    name: d.name,
    modifiedAt: d.modifiedAt,
    bound,
    goalEligible: bound,
    reason: bound ? null : 'document_not_provisioned',
  });
  const others = input.documents.filter((d) => d.documentId !== input.binding.documentId).map((d) => item(d, false));
  const pinned =
    input.offset === 0
      ? [
          item(
            input.bound ?? {
              documentId: input.binding.documentId,
              name: null,
              modifiedAt: null,
              defaultWorkspaceId: null,
            },
            true,
          ),
        ]
      : [];
  return {
    items: [...pinned, ...others],
    offset: input.offset,
    hasMore: input.hasMore,
    query: input.query,
    observedAt: input.observedAt,
  };
}

// R7 projection (getDocumentWorkspaces) for any document; ids unique and in this document.
export function projectWorkspaces(response: unknown, documentId: string): WorkspaceSummary[] {
  if (!Array.isArray(response) || response.length > WORKSPACE_LIMIT) {
    return protocolError();
  }
  const workspaces: WorkspaceSummary[] = [];
  for (const w of response) {
    if (!isRecord(w) || !hex24(w.id) || (w.documentId !== undefined && w.documentId !== documentId)) {
      return protocolError();
    }
    // isReadOnly is a label only; anything but true is shown as writable and never decides eligibility.
    workspaces.push({workspaceId: w.id, name: displayName(w.name, 256), readOnly: w.isReadOnly === true});
  }
  if (new Set(workspaces.map((w) => w.workspaceId)).size !== workspaces.length) {
    return protocolError();
  }
  return workspaces;
}

const ROLE_ORDER: Record<WorkspaceRole, number> = {primary: 0, candidate: 1, default: 2, other: 3};

// §11.3 WorkspaceList. Roles and eligibility come from the binding only; provider flags are labels.
export function workspaceListView(input: {
  binding: Binding;
  documentId: string;
  workspaces: WorkspaceSummary[];
  defaultWorkspaceId: string | null;
  candidateWorkspaceId: string | null;
  observedAt: number;
}): WorkspaceList {
  const {binding} = input;
  const boundDocument = input.documentId === binding.documentId;
  if (boundDocument && !input.workspaces.some((w) => w.workspaceId === binding.primaryWorkspaceId)) {
    return protocolError();
  }
  const items = input.workspaces.map((w, index) => {
    let role: WorkspaceRole = 'other';
    if (boundDocument && w.workspaceId === binding.primaryWorkspaceId) {
      role = 'primary';
    } else if (boundDocument && w.workspaceId === input.candidateWorkspaceId) {
      role = 'candidate';
    } else if (!boundDocument && w.workspaceId === input.defaultWorkspaceId) {
      role = 'default';
    }
    const reason = workspaceReason(binding, input.documentId, w.workspaceId, input.candidateWorkspaceId);
    return {index, item: {...w, role, goalEligible: reason === null, reason}};
  });
  items.sort((a, b) => ROLE_ORDER[a.item.role] - ROLE_ORDER[b.item.role] || a.index - b.index);
  return {
    documentId: input.documentId,
    items: items.map(({item}) => ({
      workspaceId: item.workspaceId,
      name: item.name,
      role: item.role,
      readOnly: item.readOnly,
      goalEligible: item.goalEligible,
      reason: item.reason,
    })),
    observedAt: input.observedAt,
  };
}

// §11.3 reason order, document and workspace levels.
function workspaceReason(
  binding: Binding,
  documentId: string,
  workspaceId: string,
  candidateWorkspaceId: string | null,
): BrowseReason | null {
  if (documentId !== binding.documentId) {
    return 'document_not_provisioned';
  }
  if (workspaceId === binding.primaryWorkspaceId) {
    return null;
  }
  return workspaceId === candidateWorkspaceId ? 'candidate_inspection_only' : 'workspace_inspection_only';
}

// Case-insensitive NFC substring match on the part name and part number (§11.1).
const fold = (value: string) => value.normalize('NFC').toLowerCase();
export const partMatches = (part: {name: string; partNumber: string | null}, query: string): boolean =>
  !query ||
  fold(part.name).includes(fold(query)) ||
  (part.partNumber !== null && fold(part.partNumber).includes(fold(query)));

export type ScannedStudio = {
  studio: PartStudio;
  // Only read (R3) for the bound element in the bound Primary; null = not checked.
  configured: boolean | null;
  parts: PartRow[];
};

// §11.3 PartSearch: studio eligibility, hits filtered, sorted (name, studio name, partId) and truncated.
export function partSearchView(input: {
  binding: Binding;
  documentId: string;
  workspaceId: string;
  candidateWorkspaceId: string | null;
  observedMicroversion: string;
  query: string;
  studios: PartStudio[];
  scanned: ScannedStudio[];
  studiosTruncated: boolean;
  observedAt: number;
}): PartSearch {
  const {binding} = input;
  const base = workspaceReason(binding, input.documentId, input.workspaceId, input.candidateWorkspaceId);
  const checked = new Map(input.scanned.map((s) => [s.studio.elementId, s.configured]));
  const studioReason = (elementId: string): BrowseReason | null => {
    if (base) {
      return base;
    }
    if (elementId !== binding.elementId) {
      return 'element_not_provisioned';
    }
    // The bound studio is only eligible when R3 was read and found no configuration parameters.
    return checked.get(elementId) === false ? null : 'configuration_unsupported';
  };
  const studios = input.studios.map((studio): PartSearchStudio => {
    const reason = studioReason(studio.elementId);
    return {
      elementId: studio.elementId,
      name: studio.name,
      goalEligible: reason === null,
      reason,
      configurationChecked: typeof checked.get(studio.elementId) === 'boolean',
    };
  });
  let truncated = input.studiosTruncated;
  const hits: (PartSearchHit & {studioName: string})[] = [];
  for (const {studio, parts} of input.scanned) {
    if (parts.length > PART_LIMIT) {
      truncated = true;
    }
    const reasonOfStudio = studioReason(studio.elementId);
    for (const part of parts.slice(0, PART_LIMIT)) {
      if (!partMatches(part, input.query)) {
        continue;
      }
      const reason = reasonOfStudio ?? part.reason;
      hits.push({
        elementId: studio.elementId,
        partId: part.partId,
        name: part.name,
        partNumber: part.partNumber,
        bodyType: part.bodyType,
        hidden: part.hidden,
        selectable: reason === null,
        reason,
        studioName: studio.name ?? '',
      });
    }
  }
  hits.sort((a, b) => compare(a.name, b.name) || compare(a.studioName, b.studioName) || compare(a.partId, b.partId));
  if (hits.length > HIT_LIMIT) {
    truncated = true;
  }
  return {
    documentId: input.documentId,
    workspaceId: input.workspaceId,
    observedMicroversion: input.observedMicroversion,
    query: input.query,
    studios,
    hits: hits.slice(0, HIT_LIMIT).map(({studioName: _studioName, ...hit}) => hit),
    truncated,
    truncatedReason: truncated ? 'part_search_truncated' : null,
    observedAt: input.observedAt,
  };
}
