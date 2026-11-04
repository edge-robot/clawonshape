// Work-context selection service (docs/interface/work-context.md §4–§7): catalog, preview, status, adopt, clear, the
// interlock and the goal hand-off focus. Provider access is read-only (R1–R5 plus the document/workspace labels);
// adopt and clear write only the selection record, under the goal store lock shared with goal-confirm and propose.
import {lstat} from 'node:fs/promises';
import path from 'node:path';
import type {Binding, Config} from './config.ts';
import {candidateAttempts} from './candidate-attempts.ts';
import {sameGoalBinding} from './goal-lifecycle.ts';
import {hex24} from './goal-scope.ts';
import {approvalFileActive, goalStore} from './goal-store.ts';
import {mutationStore} from './mutation-workflow.ts';
import {userError} from './readiness.ts';
import type {
  AdoptedBy,
  Catalog,
  DocumentFilter,
  DocumentPage,
  DocumentSummary,
  PartRow,
  PartSearch,
  ScannedStudio,
  WorkspaceList,
  WorkspaceSummary,
  CatalogPart,
  GoalFocus,
  Interlock,
  Observation,
  PartStudio,
  SelectionRecord,
  WorkContextView,
} from './work-context.ts';
import {
  bindingKey,
  catalogView,
  DOCUMENT_FILTER,
  DOCUMENT_PAGE_SIZE,
  documentPageView,
  normalizeQuery,
  partCheck,
  partSearchView,
  STUDIO_SCAN_LIMIT,
  selectionInBounds,
  validPartId,
  workContextView,
  workspaceListView,
} from './work-context.ts';
import {selectionStore} from './work-context-store.ts';
import type {BrowseAccess} from './work-context-cache.ts';
import {DOCUMENTS_TTL_MS, uncachedAccess, WORKSPACES_TTL_MS} from './work-context-cache.ts';
import {ProviderHttpError} from './http.ts';

// OpenClaw 2026.9.9 plugin JSON: 65,536 characters per string (dashboard.ts); leave headroom.
export const PREVIEW_BASE64_MAX_CHARS = 65_000;

export type WorkContextClient = {
  workContextNames(binding: Binding): Promise<{
    documentName: string | null;
    workspaces: {workspaceId: string; name: string | null}[];
  }>;
  primaryMicroversion(binding: Binding): Promise<string>;
  partStudiosAt(binding: Binding, microversionId: string): Promise<PartStudio[]>;
  configuredAt(binding: Binding, microversionId: string): Promise<boolean>;
  partsAt(binding: Binding, microversionId: string): Promise<CatalogPart[]>;
  partPreview(binding: Binding, microversionId: string, partId: string): Promise<Buffer>;
  // §11.1 browsing reads (R6, R0 label, R7, R1–R5 and R8 for any listed document/workspace/Part Studio).
  documentSearch(
    query: string,
    offset: number,
    filter: number | undefined,
  ): Promise<{documents: DocumentSummary[]; hasMore: boolean}>;
  documentLabel(documentId: string): Promise<DocumentSummary>;
  documentWorkspaces(documentId: string): Promise<WorkspaceSummary[]>;
  workspaceMicroversion(documentId: string, workspaceId: string): Promise<string>;
  studiosAt(documentId: string, microversionId: string): Promise<PartStudio[]>;
  configurationAt(documentId: string, microversionId: string, elementId: string): Promise<boolean>;
  partRowsAt(documentId: string, microversionId: string, elementId: string): Promise<PartRow[]>;
  partPreviewAt(documentId: string, microversionId: string, elementId: string, partId: string): Promise<Buffer>;
  studioPreviewAt(documentId: string, microversionId: string, elementId: string): Promise<Buffer>;
};
export type WorkContextDeps = {
  stateDir: string;
  config: Config;
  binding: Binding;
  client: WorkContextClient;
  now: () => number;
  // Caller authorization (scope and authorization snapshot); throws authorization_changed.
  guard: () => void;
  // guard plus liveReads; called before and after every provider read.
  readGuard: () => void;
  // Late-reply fence: the access token used by the reads is still the stored one.
  fence: () => void | Promise<void>;
  // §11.4 cache partition of this connection, bound to the request's scope; absent = no reuse.
  browse?: BrowseAccess;
};
// partId is null for a Part Studio preview (§11.2, R8).
export type Preview = {
  mimeType: 'image/png';
  dataBase64: string;
  partId: string | null;
  observedMicroversion: string;
};

const NO_INTERLOCK: Interlock = {blocked: false, code: null, goalId: null};
const ADOPT_KEYS = [
  'connectionRef',
  'expectedSelectionRevision',
  'documentId',
  'workspaceId',
  'elementId',
  'partId',
  'observedMicroversion',
];

function fail(code: string): never {
  throw new Error(code);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

function boundElement(binding: Binding): string {
  return binding.elementId ?? fail('target_missing');
}

async function exists(target: string): Promise<boolean> {
  try {
    await lstat(target);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw new Error('goal_state_invalid');
  }
}

// §5.1 interlock, store-wide like goal exclusivity. Never throws: unreadable state is a blocked interlock with
// goal_state_invalid (fail closed). Absent stores are not created by this read.
export async function interlockState(deps: Pick<WorkContextDeps, 'stateDir' | 'config' | 'binding' | 'now'>) {
  const {stateDir, config, binding} = deps;
  const invalid: Interlock = {blocked: true, code: 'goal_state_invalid', goalId: null};
  try {
    if (await exists(path.join(stateDir, 'claw-onshape', 'goals'))) {
      const open = await (await goalStore(stateDir)).nonTerminal();
      if (open.length) {
        const elementId = boundElement(binding);
        const mine = open.find((record) =>
          sameGoalBinding(record.binding, {
            agentId: binding.agentId,
            documentId: binding.documentId,
            elementId,
            primaryWorkspaceId: binding.primaryWorkspaceId,
          }),
        );
        // Another binding's goal blocks too, but its ID is not shown through this binding.
        return {blocked: true, code: 'goal_active_conflict', goalId: mine?.goalId ?? null};
      }
    }
  } catch {
    return invalid;
  }
  const reconciliation: Interlock = {blocked: true, code: 'mutation_reconciliation_required', goalId: null};
  try {
    if (await exists(path.join(stateDir, 'claw-onshape', 'mutations'))) {
      const receipts = await (await mutationStore(stateDir, binding)).list();
      if (receipts.some((receipt) => receipt.status === 'UNKNOWN')) {
        return reconciliation;
      }
    }
    const directories = new Set<string>();
    if (config.goals?.enabled && config.goals.approvalDirectory) {
      directories.add(config.goals.approvalDirectory);
    }
    if (config.localMcp) {
      directories.add(path.join(config.localMcp.credentialDirectory, 'mutation-approvals'));
    }
    for (const directory of directories) {
      if (await approvalFileActive(directory, deps.now())) {
        return reconciliation;
      }
    }
    if (await exists(path.join(stateDir, 'claw-onshape-candidate-attempts'))) {
      const source = {...binding, workspaceId: binding.primaryWorkspaceId};
      const attempt = await (await candidateAttempts(stateDir, source)).exclusive(async (r) => r.read());
      if (attempt && (attempt.status === 'UNKNOWN' || attempt.status === 'CREATED_UNVERIFIED')) {
        return reconciliation;
      }
    }
  } catch {
    return invalid;
  }
  return NO_INTERLOCK;
}

async function assertInterlock(deps: WorkContextDeps): Promise<void> {
  const state = await interlockState(deps);
  if (state.blocked) {
    fail(state.code ?? 'goal_state_invalid');
  }
}

// One provider read between two authorization checks (§2: before and after every read).
async function read<T>(deps: WorkContextDeps, action: () => Promise<T>): Promise<T> {
  deps.readGuard();
  const value = await action();
  deps.readGuard();
  return value;
}

async function readRecord(stateDir: string, binding: Binding): Promise<SelectionRecord | undefined> {
  return (await selectionStore(stateDir)).read(bindingKey(binding));
}

// The goal-owned Candidate of the binding's current (non-terminal) goal, listed for information only.
async function currentCandidate(stateDir: string, binding: Binding): Promise<string | null> {
  if (!(await exists(path.join(stateDir, 'claw-onshape', 'goals')))) {
    return null;
  }
  const elementId = boundElement(binding);
  const open = (await (await goalStore(stateDir)).nonTerminal()).filter((record) =>
    sameGoalBinding(record.binding, {
      agentId: binding.agentId,
      documentId: binding.documentId,
      elementId,
      primaryWorkspaceId: binding.primaryWorkspaceId,
    }),
  );
  return open.at(-1)?.candidateWorkspaceId ?? null;
}

// §4 work-context-catalog: R1–R4, then R1 again (selection_observation_stale). No write of any kind.
export async function workContextCatalog(deps: WorkContextDeps): Promise<Catalog> {
  const {binding, client} = deps;
  const elementId = boundElement(binding);
  const names = await read(deps, () => client.workContextNames(binding));
  const observedMicroversion = await read(deps, () => client.primaryMicroversion(binding));
  const studios = await read(deps, () => client.partStudiosAt(binding, observedMicroversion));
  if (!studios.some((s) => s.elementId === elementId)) {
    return fail('target_not_part_studio');
  }
  const isConfigured = await read(deps, () => client.configuredAt(binding, observedMicroversion));
  const parts = isConfigured ? null : await read(deps, () => client.partsAt(binding, observedMicroversion));
  const recheck = await read(deps, () => client.primaryMicroversion(binding));
  if (recheck !== observedMicroversion) {
    return fail('selection_observation_stale');
  }
  await deps.fence();
  let record: SelectionRecord | undefined;
  let candidateWorkspaceId: string | null;
  try {
    record = await readRecord(deps.stateDir, binding);
    candidateWorkspaceId = await currentCandidate(deps.stateDir, binding);
  } catch {
    return fail('goal_state_invalid');
  }
  return catalogView({
    binding,
    documentName: names.documentName,
    workspaces: names.workspaces,
    candidateWorkspaceId,
    observedMicroversion,
    studios,
    isConfigured,
    parts,
    selectionRevision: record?.selectionRevision ?? 0,
    observedAt: deps.now(),
  });
}

function strictInput(payload: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!isRecord(payload) || Object.keys(payload).some((key) => !keys.includes(key))) {
    return fail('invalid_arguments');
  }
  return payload;
}

// Status-time observation of a stored selection (§5.2). Read failures become `unverified` with the read error code;
// only a changed caller authorization aborts the request.
async function observe(deps: WorkContextDeps, record: SelectionRecord): Promise<Observation> {
  const selection = record.selection;
  if (!selection) {
    return {ok: false, code: 'onshape_unavailable'};
  }
  const {binding, client} = deps;
  try {
    const names = await read(deps, () => client.workContextNames(binding));
    const currentMicroversion = await read(deps, () => client.primaryMicroversion(binding));
    const studios = await read(deps, () => client.partStudiosAt(binding, currentMicroversion));
    let isConfigured = false;
    let parts: CatalogPart[] | null = null;
    if (studios.some((s) => s.elementId === selection.elementId)) {
      isConfigured = await read(deps, () => client.configuredAt(binding, currentMicroversion));
      parts = isConfigured ? null : await read(deps, () => client.partsAt(binding, currentMicroversion));
    }
    await deps.fence();
    return {
      ok: true,
      currentMicroversion,
      check: partCheck(studios, isConfigured, parts, selection.elementId, selection.partId),
      documentName: names.documentName,
      workspaceName: names.workspaces.find((w) => w.workspaceId === selection.workspaceId)?.name ?? null,
      partStudioName: studios.find((s) => s.elementId === selection.elementId)?.name ?? null,
      currentPartName: parts?.find((p) => p.partId === selection.partId)?.name ?? null,
    };
  } catch (e) {
    if (e instanceof Error && e.message === 'authorization_changed') {
      throw e;
    }
    return {ok: false, code: userError(e).code};
  }
}

// §4 work-context-status and the Engineer's onshape_status workContext (§6.3).
export async function workContextStatus(deps: WorkContextDeps): Promise<WorkContextView> {
  deps.guard();
  boundElement(deps.binding);
  const interlock = await interlockState(deps);
  let record: SelectionRecord | undefined;
  try {
    record = await readRecord(deps.stateDir, deps.binding);
  } catch {
    // Unreadable selection state: nothing is claimed about a selection (fail closed, nothing deleted).
    return {
      ...workContextView(undefined, undefined, interlock, deps.now()),
      validity: 'unverified',
      reason: 'goal_state_invalid',
    };
  }
  if (record?.selection && !selectionInBounds(record.selection, deps.binding)) {
    return {
      ...workContextView(record, undefined, interlock, deps.now()),
      validity: 'invalid',
      reason: 'selection_target_not_allowed',
    };
  }
  const observation = record?.selection ? await observe(deps, record) : undefined;
  return workContextView(record, observation, interlock, deps.now());
}

function expectedRevision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    return fail('invalid_arguments');
  }
  return value;
}

// Step 8 (§5): under the goal store lock, re-evaluate the interlock, compare the revision (CAS) and replace.
async function commitRecord(
  deps: WorkContextDeps,
  expected: number,
  next: (revision: number) => SelectionRecord,
): Promise<SelectionRecord> {
  const store = await selectionStore(deps.stateDir);
  const key = bindingKey(deps.binding);
  return (await goalStore(deps.stateDir)).exclusive(async () => {
    await assertInterlock(deps);
    const existing = await store.read(key);
    if ((existing?.selectionRevision ?? 0) !== expected) {
      return fail('selection_revision_conflict');
    }
    const record = next(expected + 1);
    deps.guard();
    await store.save(record);
    return record;
  });
}

// §4/§5 work-context-adopt, in the order of §5; the first failure wins and nothing is written before step 8.
export async function adoptWorkContext(
  deps: WorkContextDeps,
  payload: unknown,
  adoptedBy: AdoptedBy,
): Promise<WorkContextView> {
  const {binding, client} = deps;
  // 1. scope and authorization snapshot.
  deps.guard();
  // 2. input shape and increment-1 bounds.
  const input = strictInput(payload, ADOPT_KEYS);
  if (ADOPT_KEYS.slice(1).some((key) => !(key in input))) {
    return fail('invalid_arguments');
  }
  const expected = expectedRevision(input.expectedSelectionRevision);
  const {documentId, workspaceId, elementId, partId, observedMicroversion} = input;
  if (
    ![documentId, workspaceId, elementId, observedMicroversion].every(hex24) ||
    !validPartId(partId) ||
    typeof observedMicroversion !== 'string'
  ) {
    return fail('invalid_arguments');
  }
  const bound = boundElement(binding);
  if (documentId !== binding.documentId || workspaceId !== binding.primaryWorkspaceId || elementId !== bound) {
    return fail('selection_target_not_allowed');
  }
  // 3. interlock.
  await assertInterlock(deps);
  // 4. R1 equals the observed revision.
  const names = await read(deps, () => client.workContextNames(binding));
  const mv = await read(deps, () => client.primaryMicroversion(binding));
  if (mv !== observedMicroversion) {
    return fail('selection_observation_stale');
  }
  // 5. R2/R3: a Part Studio at mv without configuration parameters.
  const studios = await read(deps, () => client.partStudiosAt(binding, mv));
  if (!studios.some((s) => s.elementId === bound)) {
    return fail('target_not_part_studio');
  }
  if (await read(deps, () => client.configuredAt(binding, mv))) {
    return fail('configuration_unsupported');
  }
  // 6. R4: exactly one selectable part with partId at mv.
  const parts = await read(deps, () => client.partsAt(binding, mv));
  const problem = partCheck(studios, false, parts, bound, partId);
  if (problem) {
    return fail(problem);
  }
  const part = parts.find((p) => p.partId === partId) ?? fail('selection_part_missing');
  // 7. late-reply fence: authorization snapshot and token unchanged.
  deps.readGuard();
  await deps.fence();
  // 8. lock, interlock, CAS, replace.
  const adoptedAt = deps.now();
  const saved = await commitRecord(deps, expected, (selectionRevision) => ({
    version: 1,
    bindingKey: bindingKey(binding),
    selectionRevision,
    selection: {
      documentId: binding.documentId,
      workspaceId: binding.primaryWorkspaceId,
      elementId: bound,
      partId: part.partId,
      partName: part.name,
      bodyType: part.bodyType,
      configuration: 'default',
      observedMicroversion: mv,
    },
    adoptedAt,
    adoptedBy,
  }));
  return workContextView(
    saved,
    {
      ok: true,
      currentMicroversion: mv,
      check: null,
      documentName: names.documentName,
      workspaceName: names.workspaces.find((w) => w.workspaceId === binding.primaryWorkspaceId)?.name ?? null,
      partStudioName: studios.find((s) => s.elementId === bound)?.name ?? null,
      currentPartName: part.name,
    },
    await interlockState(deps),
    adoptedAt,
  );
}

// §4 work-context-clear: same interlock and CAS as adopt; no provider read.
export async function clearWorkContext(deps: WorkContextDeps, payload: unknown): Promise<WorkContextView> {
  deps.guard();
  const input = strictInput(payload, ['connectionRef', 'expectedSelectionRevision']);
  const expected = expectedRevision(input.expectedSelectionRevision);
  boundElement(deps.binding);
  await assertInterlock(deps);
  const saved = await commitRecord(deps, expected, (selectionRevision) => ({
    version: 1,
    bindingKey: bindingKey(deps.binding),
    selectionRevision,
    selection: null,
    adoptedAt: null,
    adoptedBy: null,
  }));
  return workContextView(saved, undefined, await interlockState(deps), deps.now());
}

// §7 goal hand-off: called by onshape_goal_propose under the goal store lock. No selection → no focus. Otherwise the
// selection must hold at the goal's base microversion (R2–R4 at that revision); a read failure (unverified) or an
// invalid selection fails the proposal with that code.
export async function goalFocus(
  stateDir: string,
  binding: Binding,
  client: Pick<WorkContextClient, 'partStudiosAt' | 'configuredAt' | 'partsAt'>,
  baseMicroversion: string,
): Promise<GoalFocus | undefined> {
  let record: SelectionRecord | undefined;
  try {
    record = await readRecord(stateDir, binding);
  } catch {
    return fail('goal_state_invalid');
  }
  const selection = record?.selection;
  if (!record || !selection) {
    return undefined;
  }
  if (!selectionInBounds(selection, binding)) {
    return fail('selection_target_not_allowed');
  }
  const studios = await client.partStudiosAt(binding, baseMicroversion);
  let isConfigured = false;
  let parts: CatalogPart[] | null = null;
  if (studios.some((s) => s.elementId === selection.elementId)) {
    isConfigured = await client.configuredAt(binding, baseMicroversion);
    parts = isConfigured ? null : await client.partsAt(binding, baseMicroversion);
  }
  const problem = partCheck(studios, isConfigured, parts, selection.elementId, selection.partId);
  if (problem) {
    return fail(problem === 'target_not_part_studio' ? 'selection_part_missing' : problem);
  }
  return {
    partId: selection.partId,
    partName: selection.partName,
    elementId: selection.elementId,
    selectionRevision: record.selectionRevision,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// §11 browsing (work-context-1.1.0-draft). operator.read, GET only, no write of any kind. Every method runs serialized
// per connection (one browsing read sequence in flight) and maps provider statuses as §11.5 requires.

type BrowseRead = {
  // R7/R1/R2 (and the R0 label read) of a listed document: 403/404 → document_not_accessible.
  documentScoped?: boolean;
};

// §11.5 mapping inside the browsing methods only; existing callers of http.ts keep their codes.
function browseError(e: unknown, options: BrowseRead): unknown {
  if (e instanceof ProviderHttpError) {
    if (e.status === 402) {
      return new Error('provider_quota_exhausted');
    }
    if (options.documentScoped && (e.status === 403 || e.status === 404)) {
      return new Error('document_not_accessible');
    }
  }
  return e;
}

async function browseRead<T>(deps: WorkContextDeps, action: () => Promise<T>, options: BrowseRead = {}): Promise<T> {
  try {
    return await read(deps, action);
  } catch (e) {
    throw browseError(e, options);
  }
}

const access = (deps: WorkContextDeps): BrowseAccess => deps.browse ?? uncachedAccess();

function hex24Input(value: unknown): string {
  return hex24(value) ? value : fail('invalid_arguments');
}

// Candidate of the binding's current goal; only meaningful inside the bound document.
async function candidateOf(deps: WorkContextDeps, documentId: string): Promise<string | null> {
  if (documentId !== deps.binding.documentId) {
    return null;
  }
  try {
    return await currentCandidate(deps.stateDir, deps.binding);
  } catch {
    return fail('goal_state_invalid');
  }
}

// R6 page through the cache (TTL 60 s); also remembers each document's default workspace for R7 roles.
async function documentPage(deps: WorkContextDeps, query: string, offset: number, filter: number | undefined) {
  const cache = access(deps);
  const page = await cache.timed(`r6:${filter ?? '-'}:${offset}:${query}`, DOCUMENTS_TTL_MS, () =>
    browseRead(deps, () => deps.client.documentSearch(query, offset, filter)),
  );
  for (const d of page.documents) {
    await cache.timed(`r0:${d.documentId}`, DOCUMENTS_TTL_MS, async () => d);
  }
  return page;
}

// R0 label read of one document, through the cache (an R6 hit of the same connection serves it).
function documentLabel(deps: WorkContextDeps, documentId: string): Promise<DocumentSummary> {
  return access(deps).timed(`r0:${documentId}`, DOCUMENTS_TTL_MS, () =>
    browseRead(deps, () => deps.client.documentLabel(documentId), {documentScoped: true}),
  );
}

// §11.2 work-context-documents.
export async function workContextDocuments(deps: WorkContextDeps, payload: unknown): Promise<DocumentPage> {
  deps.guard();
  const input = strictInput(payload, ['connectionRef', 'query', 'offset', 'filter']);
  const query = normalizeQuery(input.query);
  const offset = input.offset ?? 0;
  if (typeof offset !== 'number' || !Number.isSafeInteger(offset) || offset < 0 || offset % DOCUMENT_PAGE_SIZE) {
    return fail('invalid_arguments');
  }
  let filter: number | undefined;
  if (input.filter !== undefined) {
    if (typeof input.filter !== 'string' || !Object.hasOwn(DOCUMENT_FILTER, input.filter)) {
      return fail('invalid_arguments');
    }
    filter = DOCUMENT_FILTER[input.filter as DocumentFilter];
  }
  boundElement(deps.binding);
  return access(deps).exclusive(async () => {
    const page = await documentPage(deps, query, offset, filter);
    // Page 0 pins the bound document; its labels come from this page or from the R0 label read.
    const bound =
      offset === 0
        ? (page.documents.find((d) => d.documentId === deps.binding.documentId) ??
          (await documentLabel(deps, deps.binding.documentId)))
        : null;
    await deps.fence();
    return documentPageView({
      binding: deps.binding,
      bound,
      documents: page.documents,
      offset,
      hasMore: page.hasMore,
      query,
      observedAt: deps.now(),
    });
  });
}

// §11.2 work-context-workspaces.
export async function workContextWorkspaces(deps: WorkContextDeps, payload: unknown): Promise<WorkspaceList> {
  deps.guard();
  const input = strictInput(payload, ['connectionRef', 'documentId']);
  const documentId = hex24Input(input.documentId);
  boundElement(deps.binding);
  return access(deps).exclusive(async () => {
    const workspaces = await access(deps).timed(`r7:${documentId}`, WORKSPACES_TTL_MS, () =>
      browseRead(deps, () => deps.client.documentWorkspaces(documentId), {documentScoped: true}),
    );
    // The provider default workspace is a label of non-bound documents only.
    const defaultWorkspaceId =
      documentId === deps.binding.documentId ? null : (await documentLabel(deps, documentId)).defaultWorkspaceId;
    const candidateWorkspaceId = await candidateOf(deps, documentId);
    await deps.fence();
    return workspaceListView({
      binding: deps.binding,
      documentId,
      workspaces,
      defaultWorkspaceId,
      candidateWorkspaceId,
      observedAt: deps.now(),
    });
  });
}

// R2 at mv through the microversion cache (immutable at mv).
function studiosAt(deps: WorkContextDeps, documentId: string, mv: string): Promise<PartStudio[]> {
  return access(deps).pinned(`r2:${documentId}:${mv}`, () =>
    browseRead(deps, () => deps.client.studiosAt(documentId, mv), {documentScoped: true}),
  );
}

// §11.2 work-context-parts: R1 → R2 → (R3 bound studio) → R4 × studios → R1 recheck, all in one workspace.
export async function workContextParts(deps: WorkContextDeps, payload: unknown): Promise<PartSearch> {
  deps.guard();
  const input = strictInput(payload, ['connectionRef', 'documentId', 'workspaceId', 'query', 'elementId']);
  const documentId = hex24Input(input.documentId);
  const workspaceId = hex24Input(input.workspaceId);
  const elementId = input.elementId === undefined ? undefined : hex24Input(input.elementId);
  const query = normalizeQuery(input.query);
  const {binding} = deps;
  const bound = boundElement(binding);
  return access(deps).exclusive(async () => {
    const cache = access(deps);
    const candidateWorkspaceId = await candidateOf(deps, documentId);
    const mv = await browseRead(deps, () => deps.client.workspaceMicroversion(documentId, workspaceId), {
      documentScoped: true,
    });
    const studios = await studiosAt(deps, documentId, mv);
    if (elementId !== undefined && !studios.some((s) => s.elementId === elementId)) {
      return fail('target_not_part_studio');
    }
    const selected = elementId === undefined ? studios : studios.filter((s) => s.elementId === elementId);
    const scanned: ScannedStudio[] = [];
    const inBounds = documentId === binding.documentId && workspaceId === binding.primaryWorkspaceId;
    for (const studio of selected.slice(0, STUDIO_SCAN_LIMIT)) {
      // R3 only where adopt could accept a part (§1): the bound studio in the bound Primary.
      const configured =
        inBounds && studio.elementId === bound
          ? await cache.pinned(`r3:${documentId}:${mv}:${studio.elementId}`, () =>
              browseRead(deps, () => deps.client.configurationAt(documentId, mv, studio.elementId)),
            )
          : null;
      const parts = await cache.pinned(`r4:${documentId}:${mv}:${studio.elementId}`, () =>
        browseRead(deps, () => deps.client.partRowsAt(documentId, mv, studio.elementId)),
      );
      scanned.push({studio, configured, parts});
    }
    const recheck = await browseRead(deps, () => deps.client.workspaceMicroversion(documentId, workspaceId), {
      documentScoped: true,
    });
    if (recheck !== mv) {
      return fail('selection_observation_stale');
    }
    await deps.fence();
    return partSearchView({
      binding,
      documentId,
      workspaceId,
      candidateWorkspaceId,
      observedMicroversion: mv,
      query,
      studios,
      scanned,
      studiosTruncated: selected.length > STUDIO_SCAN_LIMIT,
      observedAt: deps.now(),
    });
  });
}

// §4 / §11.2 work-context-preview. documentId/workspaceId default to the binding; the element may be any Part Studio
// of that workspace at observedMicroversion, which MUST equal R1 of that workspace (selection_observation_stale).
// Without partId the Part Studio preview (R8) is returned. R5/R8 failures are preview_unavailable (CR-5).
export async function workContextPreview(deps: WorkContextDeps, payload: unknown): Promise<Preview> {
  const {binding, client} = deps;
  const input = strictInput(payload, [
    'connectionRef',
    'documentId',
    'workspaceId',
    'elementId',
    'partId',
    'observedMicroversion',
  ]);
  if (
    !hex24(input.elementId) ||
    (input.partId !== undefined && !validPartId(input.partId)) ||
    !hex24(input.observedMicroversion) ||
    (input.documentId !== undefined && !hex24(input.documentId)) ||
    (input.workspaceId !== undefined && !hex24(input.workspaceId))
  ) {
    return fail('invalid_arguments');
  }
  const documentId = input.documentId ?? binding.documentId;
  // A workspace of a non-bound document must be named; the Primary default applies to the bound document only.
  if (input.workspaceId === undefined && documentId !== binding.documentId) {
    return fail('invalid_arguments');
  }
  const workspaceId = input.workspaceId ?? binding.primaryWorkspaceId;
  const elementId = input.elementId;
  const partId = input.partId ?? null;
  const observedMicroversion = input.observedMicroversion;
  const defaultTarget = documentId === binding.documentId && workspaceId === binding.primaryWorkspaceId;
  return access(deps).exclusive(async () => {
    // The bound Primary keeps its 1.0 read codes; a listed document maps 403/404 to document_not_accessible.
    const current = await browseRead(deps, () => client.workspaceMicroversion(documentId, workspaceId), {
      documentScoped: !defaultTarget,
    });
    if (current !== observedMicroversion) {
      return fail('selection_observation_stale');
    }
    const studios = await studiosAt(deps, documentId, observedMicroversion);
    if (!studios.some((s) => s.elementId === elementId)) {
      return fail('selection_observation_stale');
    }
    const bytes = await access(deps).pinned(
      `preview:${documentId}:${observedMicroversion}:${elementId}:${partId ?? ''}`,
      () =>
        read(deps, () =>
          partId === null
            ? client.studioPreviewAt(documentId, observedMicroversion, elementId)
            : client.partPreviewAt(documentId, observedMicroversion, elementId, partId),
        ),
    );
    await deps.fence();
    const dataBase64 = bytes.toString('base64');
    if (dataBase64.length > PREVIEW_BASE64_MAX_CHARS) {
      return fail('preview_unavailable');
    }
    return {mimeType: 'image/png', dataBase64, partId, observedMicroversion};
  });
}
