# Interface contract: work-context selection (ClawOnshape plugin-facing)

| | |
|---|---|
| Contract-Version | `work-context-1.2.0-draft` (requires `goal-workflow.md` ≥ `goal-1.2.0-draft`; no server contract change) |
| Status | **draft**: 1.1.0 deployed (0.3.0-rc.3, live acceptance 2026-10-26 in progress); §12 (1.2.0, robust part search and call accounting, [#22](https://github.com/edge-robot/clawonshape/issues/22)) deferred at closure; call-cost baseline measured (§12.6) |
| Owner | onshape-architekt (only the architect edits this file and `work-context-fixtures/`) |
| ADR | [`docs/ADR.md`](../ADR.md) → "ADR-2026-10-21: Task-scoped Onshape workspace and part selection", increment 1 |
| Issues | [edge-robot/clawonshape#21](https://github.com/edge-robot/clawonshape/issues/21) (this contract, backend), [#17](https://github.com/edge-robot/clawonshape/issues/17) (selector UI, consumer), [#18](https://github.com/edge-robot/clawonshape/issues/18) (goal hand-off), [edge-robot/onshape-mcp#9](https://github.com/edge-robot/onshape-mcp/issues/9) (no server change in increment 1) |
| Product source | [`spec.md` → "Select an Onshape work context"](../../spec.md#select-an-onshape-work-context) (S1–S9), mockups `docs/product/onshape-selection-2026-10-21/` |

Consumers: the dashboard selector (Codex top-down team, #17), the Engineer agent through
`onshape_status` and `onshape_goal_propose`, and the plugin's own goal service. Normative words:
**MUST**, **MUST NOT**, **SHOULD**, **MAY**. Unverified provider or runtime assumptions are marked
⚠️ and listed in §10.

The fixtures of this contract live in `docs/interface/work-context-fixtures/` and are read in place
by the plugin tests and the UI tests of this repository. They are **not** part of the server
fixture tree `docs/interface/fixtures/` and are not copied to onshape-mcp: this contract is internal
to ClawOnshape (backend ↔ dashboard ↔ Engineer tools).

---

## 1. Increment 1 scope (decided 2026-10-22)

Increment 1 narrows the S1–S9 journey to what the existing binding and the static MCP target bounds
already authorize. Nothing in this contract grants a new right, OAuth scope or provider path.

| Topic | Increment 1 rule |
|---|---|
| Ownership key | One confirmed selection **per binding** (`agentId`, `requesterSenderId`, `messageChannel`, `agentAccountId`, `connectionRef`, `documentId`, `primaryWorkspaceId`, `elementId`). A task/session-level key is deferred to [#20](https://github.com/edge-robot/clawonshape/issues/20) and a later contract. |
| Adopter | The same authority as goal confirmation: dashboard client with `operator.admin`. Reading the catalog, previews and status needs `operator.read`. |
| Document | Only `binding.documentId`. It is listed alone and preselected. No document search across the OAuth account. |
| Workspace | Only the protected Primary (`binding.primaryWorkspaceId`) is selectable. The goal-owned Candidate of the current goal is listed for information with `selectable: false`. Non-Primary selection is inspection-only and out of scope until a source-policy decision (#18). |
| Part Studio | Every Part Studio of the Primary is listed. Only `binding.elementId` is goal-eligible; parts are enumerated only for that element. Other Part Studios carry `reason: "element_not_provisioned"` (MCP static bounds, G3 / [#3](https://github.com/edge-robot/clawonshape/issues/3)). |
| Configuration | Only Part Studios without configuration parameters. A configured Part Studio carries `reason: "configuration_unsupported"`. |
| Part kind | Selectable: `bodyType = "solid"`, not mesh, not flattened sheet-metal body. Others are listed with `selectable: false, reason: "part_kind_unsupported"`. Hidden parts are listed with `hidden: true` and stay selectable. |
| Goal source | Unchanged: goals are proposed against Primary at its current microversion. The selection adds a `focus` to the goal scope (§7); it never moves the goal target. |

## 2. Provider reads (plugin REST, read-only, existing OAuth read authority)

All reads use the plugin's existing REST client and credential path, the same guard as
`workspace-context` (`operator.read` still present, authorization snapshot unchanged,
`liveReads` enabled) before and after every read, and the existing response size limits.

| # | Purpose | Request |
|---|---|---|
| R1 | Primary revision | `GET /api/v10/documents/d/{d}/w/{primary}/currentmicroversion` (existing) |
| R2 | Part Studios at that revision | `GET /api/v10/documents/d/{d}/m/{mv}/elements?elementType=PARTSTUDIO` |
| R3 | Configuration check, bound element | `GET /api/v10/elements/d/{d}/m/{mv}/e/{e}/configuration` ⚠️ WC1 |
| R4 | Parts of the bound element at that revision | `GET /api/v10/parts/d/{d}/m/{mv}/e/{e}` (no `withThumbnails`; not supported for microversions) |
| R5 | Part preview | `GET /api/v10/parts/d/{d}/m/{mv}/e/{e}/partid/{partId}/shadedviews` with the render path's `viewMatrix`, `pixelSize=0`, size ≤ 512 ⚠️ WC2 |

Rules:

- R2–R5 MUST use the microversion `mv` returned by R1 of the same request. After R4, R1 is read
  again; if it changed, the response is `selection_observation_stale` (the UI retries once, then
  shows "Stand hat sich geändert").
- `partId` and `name` MUST be validated (`partId` `^[A-Za-z0-9_.+-]{1,64}$` ⚠️ WC3, `name` 1..200
  characters after the existing display-name validation); invalid entries make the response
  `provider_protocol_error`. At most 500 parts are returned; beyond that `truncated: true`.
- No `idtranslations` (POST) call is used in increment 1. Identity across revisions is checked by
  presence of the same `partId` in R4 at the later revision (§5); a missing `partId` blocks.
- No read is admitted through MCP for this contract. onshape-mcp needs no change (#9).

## 3. Selection record (durable, plugin state)

Stored in the Engineer plugin's private state directory, one file per binding key, atomic replace,
same file rules as the goal store. Browser drafts are never stored.

| Field | Type | Rule |
|---|---|---|
| `version` | `1` | |
| `bindingKey` | sha256-hex | lowercase SHA-256 of the canonical JSON (goal-workflow §2 rules) of the eight binding fields in §1; test vector `work-context-fixtures/binding-key.json` |
| `selectionRevision` | integer ≥ 1 | +1 on every successful adopt or clear; never reused for a binding key |
| `selection` | object \| `null` | `null` after `work-context-clear` |
| `selection.documentId` | 24-hex | equals `binding.documentId` |
| `selection.workspaceId` | 24-hex | equals `binding.primaryWorkspaceId` (increment 1) |
| `selection.elementId` | 24-hex | equals `binding.elementId` (increment 1) |
| `selection.partId` | string | from R4 |
| `selection.partName` | string | label only, never identity |
| `selection.bodyType` | string | from R4 |
| `selection.configuration` | `"default"` | increment 1 |
| `selection.observedMicroversion` | 24-hex | `mv` of the adopt-time recheck |
| `adoptedAt` | Unix ms | |
| `adoptedBy` | `{kind: "dashboard-operator", clientId?}` | as `goal-confirm` (goal-workflow GW2) |

A changed binding yields a different `bindingKey`: the old record is not visible through the new
binding and is not migrated. Existing element-only bindings have no selection (`selection: null`);
the plugin MUST NOT create a selection by picking the first or only part.

## 4. Dashboard gateway methods (Engineer gateway)

All methods return `{ok: true, ...}` or `{ok: false, code, message}` with a code from §8 or an
existing plugin code. Input objects reject unknown keys (`invalid_arguments`). `connectionRef` is
optional and resolves exactly one binding as in `workspace-context`.

| Action | Scope | Input | Result |
|---|---|---|---|
| `work-context-catalog` | `operator.read` | `{connectionRef?}` | `{ok, catalog: Catalog}` (§6.1). Reads R1–R4. No write of any kind. |
| `work-context-preview` | `operator.read` | `{connectionRef?, elementId, partId, observedMicroversion}` | `{ok, preview: {mimeType: "image/png", dataBase64, partId, observedMicroversion}}`; `elementId` MUST be the bound element and `observedMicroversion` MUST equal R1 at request time, else `selection_observation_stale`. A provider failure returns `preview_unavailable`; the UI shows an explicit "Vorschau nicht verfügbar" and never substitutes the whole Part Studio render. |
| `work-context-status` | `operator.read` | `{connectionRef?}` | `{ok, workContext: WorkContextView}` (§6.2), revalidated with R1 and R4 |
| `work-context-adopt` | `operator.admin` | `{connectionRef?, expectedSelectionRevision, documentId, workspaceId, elementId, partId, observedMicroversion}` | `{ok, workContext: WorkContextView}`; §5 |
| `work-context-clear` | `operator.admin` | `{connectionRef?, expectedSelectionRevision}` | `{ok, workContext}` with `selection: null`; same interlock and CAS as adopt |

`expectedSelectionRevision` is `0` when no record exists yet.

## 5. Adoption

`work-context-adopt` runs in this order; the first failure wins and nothing is written before step 8:

1. Scope `operator.admin` present and authorization snapshot unchanged (`authorization_changed`).
2. Input shape valid; `documentId`, `workspaceId`, `elementId` equal the increment-1 values from the
   binding (`selection_target_not_allowed`).
3. Interlock (§5.1) clear.
4. R1: current Primary microversion equals `observedMicroversion` (`selection_observation_stale`).
5. R2/R3: element is a Part Studio at `mv` without configuration parameters
   (`configuration_unsupported`).
6. R4: exactly one part with `partId` exists at `mv` (`selection_part_missing`) and it is selectable
   (`selection_part_unsupported`).
7. Authorization guard again (late-reply fence: the snapshot and the token used are unchanged).
8. Under the store lock: the interlock is re-evaluated, `selectionRevision` equals
   `expectedSelectionRevision` (`selection_revision_conflict`), then the record is replaced with
   `selectionRevision + 1`.

On any failure the previous record stays unchanged. Adoption never creates a Candidate, a goal, a
proposal, an approval or a grant and never changes the binding, OAuth state or MCP target.

### 5.1 Interlock

Adopt and clear MUST be refused with the existing code while any of these hold for the plugin
instance (store-wide, as goal exclusivity):

| Condition | Code |
|---|---|
| a non-terminal goal exists (`AWAITING_CONFIRMATION`, `ACTIVE`, `RECONCILING`, `BLOCKED`, `STOPPED`, `EXPIRED`) | `goal_active_conflict` |
| a legacy payload receipt is `UNKNOWN`, an approval v2 file is active, or a candidate attempt is `UNKNOWN` / `CREATED_UNVERIFIED` | `mutation_reconciliation_required` |
| the goal or candidate store cannot be read | `goal_state_invalid` (fail closed) |

Adoption takes the same store lock that `goal-confirm` and `onshape_goal_propose` take, so adoption
and goal confirmation are serialized. A user who wants another part closes the goal first
(`goal-close` after reconciliation).

### 5.2 Revalidation (`work-context-status`)

| Situation | `validity` | `reason` |
|---|---|---|
| no record or `selection: null` | `none` | `null` |
| R1 equals `observedMicroversion` | `valid` | `null` |
| R1 differs, `partId` still present and selectable at the new `mv` | `valid` | `revision_advanced` (UI shows "Stand neuer als Auswahl") |
| `partId` missing at the new `mv` | `invalid` | `selection_part_missing` |
| part no longer selectable or element now configured | `invalid` | `selection_part_unsupported` / `configuration_unsupported` |
| reads impossible (reconnect, live reads off, provider error) | `unverified` | the read error code |

`invalid` and `unverified` selections MUST NOT be used as goal focus and MUST NOT expose a cached
preview. `unverified` keeps the record; nothing is deleted automatically.

## 6. Normalized views

The dashboard renders these views and derives no state itself (MVC, #2).

### 6.1 `Catalog`

```json
{
  "document": {"documentId": "24-hex", "name": "string", "preselected": true},
  "workspaces": [
    {"workspaceId": "24-hex", "name": "string", "role": "primary", "selectable": true, "reason": null},
    {"workspaceId": "24-hex", "name": "string", "role": "candidate", "selectable": false, "reason": "candidate_inspection_only"}
  ],
  "observedMicroversion": "24-hex",
  "partStudios": [
    {"elementId": "24-hex", "name": "string", "goalEligible": true, "reason": null, "truncated": false,
     "parts": [{"partId": "string", "name": "string", "bodyType": "solid", "hidden": false, "selectable": true, "reason": null}]},
    {"elementId": "24-hex", "name": "string", "goalEligible": false, "reason": "element_not_provisioned", "truncated": false, "parts": null}
  ],
  "selectionRevision": 0,
  "observedAt": 0
}
```

`parts` is sorted by `name`, then `partId`. Same-name parts are distinguished by `partId` (shown as a
secondary short identifier) and the preview. `parts: null` means "not enumerated", not "empty"; an
empty Part Studio has `parts: []`. Fixture: `work-context-fixtures/catalog.json`.

### 6.2 `WorkContextView`

```json
{
  "selectionRevision": 3,
  "validity": "valid",
  "reason": null,
  "selection": {"documentId": "…", "documentName": "…", "workspaceId": "…", "workspaceName": "…",
                "elementId": "…", "partStudioName": "…", "partId": "…", "partName": "…",
                "bodyType": "solid", "configuration": "default",
                "observedMicroversion": "…", "currentMicroversion": "…",
                "onshapeUrl": "https://cad.onshape.com/documents/{d}/w/{w}/e/{e}"},
  "adoptedAt": 0,
  "adoptedBy": {"kind": "dashboard-operator"},
  "interlock": {"blocked": false, "code": null, "goalId": null},
  "observedAt": 0
}
```

`interlock` tells the UI in advance whether "Auswahl ändern" can succeed; the server still enforces
§5.1 at adoption. Names are re-read at status time; a missing name is `null`, never the ID.
Fixtures: `view-valid.json`, `view-invalid.json`, `view-none.json`; adopt input `adopt-request.json`.

### 6.3 Agent projection

The Engineer's `onshape_status` result gains `workContext: WorkContextView | null` with the same
shape. The Lead's projection is unchanged in increment 1 ⚠️ WC4.

## 7. Goal hand-off (goal-workflow `goal-1.2.0-draft`)

- `onshape_goal_propose` reads the selection record under the store lock. If `validity` is `valid`,
  the scope gains `focus: {partId, partName, elementId, selectionRevision}`; the plugin re-reads R4 at
  `scope.target.baseMicroversion` and MUST fail with `selection_part_missing` if the part is absent.
  If `validity` is `invalid` or `unverified`, propose fails with that reason code. With no selection
  the scope has no `focus` (unchanged behaviour of goal-1.1.0).
- `focus` is part of `goalHash` when present (goal-workflow §2). Test vector:
  `work-context-fixtures/goal-hash-focus.json`.
- The dashboard MUST show `focus.partName` and its Part Studio next to the target before
  `goal-confirm`. `focus` is intent: goal and preservation conditions stay feature-based, and a
  passing verification does not claim that only the focused part changed (ADR decision 8).
- Because §5.1 blocks adoption while any goal is non-terminal, the focus of a running goal cannot
  drift. A later selection never rewrites `focus`, history, Candidate, grant or evidence of an
  earlier goal.

## 8. Error codes

New plugin codes, listed in `work-context-fixtures/error-codes.json`:

| Code | Meaning | UI outcome (S8) |
|---|---|---|
| `selection_observation_stale` | Primary moved since the catalog was read | refresh the catalog, review again |
| `selection_part_missing` | `partId` not present at the current revision | "Bauteil nicht mehr vorhanden", choose again |
| `selection_part_unsupported` | part kind not supported in increment 1 | explain, not selectable |
| `configuration_unsupported` | Part Studio has configuration parameters | explain, not selectable |
| `element_not_provisioned` | Part Studio outside the provisioned MCP target | explain "nicht für Ziele freigegeben" |
| `selection_target_not_allowed` | document/workspace/element outside increment-1 bounds | reject, no write |
| `selection_revision_conflict` | another adoption won (CAS) | reload status, show the winning selection |
| `preview_unavailable` | part preview could not be read | "Vorschau nicht verfügbar" |

Reused existing codes: `invalid_arguments`, `authorization_changed`, `live_reads_disabled`,
`not_configured`, `provider_protocol_error`, `goal_active_conflict`, `mutation_reconciliation_required`,
`goal_state_invalid`. Catalog-level reasons `candidate_inspection_only` and `revision_advanced` are
view reasons, not error codes.

## 9. Tests (offline; mapped to S1–S9)

| # | Test | S |
|---|---|---|
| W1 | catalog from recorded R1–R4 responses equals `catalog.json`; same-name parts stay distinct by `partId` | S1, S2 |
| W2 | R1 changes between start and end of the catalog read → `selection_observation_stale` | S4 |
| W3 | adopt happy path: revision 0 → 1, view equals `view-valid.json`, no provider write, no goal/Candidate/approval/grant file created | S5, S7 |
| W4 | adopt rejects: missing `operator.admin`, foreign element/workspace/document, configured element, unsupported part, missing part, stale microversion, stale `expectedSelectionRevision`, changed authorization between reads; previous record unchanged in every case | S4, S5 |
| W5 | interlock: each non-terminal goal state, legacy `UNKNOWN` receipt, active approval v2, candidate attempt `UNKNOWN` → refused; after `goal-close` → allowed | S6 |
| W6 | two concurrent adopts with the same `expectedSelectionRevision`: exactly one wins | S5 |
| W7 | adopt racing `goal-confirm`: serialized; never a confirmed goal whose `focus` differs from the record at confirmation | S6 |
| W8 | restart/reload: record survives; status revalidates (`valid`, `revision_advanced`, `invalid`, `unverified`) | S5, S9 |
| W9 | changed binding sees no selection; element-only binding has `selection: null` | S5 |
| W10 | goal hand-off: `focus` present iff `valid`; `goalHash` equals `goal-hash-focus.json`; part missing at base revision → `selection_part_missing` | S6 |
| W11 | every code the work-context module emits is in `error-codes.json` or an existing plugin code | — |

UI tests for the selector (#17) use the same fixtures as mocked responses. Browser evidence for S3
and S9 belongs to #17; synthetic tests establish no live acceptance.

## 10. Open points

| ID | Point | Resolution path |
|---|---|---|
| WC1 | `configuration` endpoint behaviour with `m/{mv}` | ts-plugin-dev records a real response in the live E2E; fallback `w/{primary}` with the same R1 recheck |
| WC2 | `parts/…/shadedviews` with `m/{mv}` (OpenAPI lists `wvm`) | live E2E; on failure `preview_unavailable` is the documented outcome |
| WC3 | Real `partId` alphabet | widen the pattern from the live response before acceptance |
| WC4 | Lead visibility of the selection | with #20 / task identity |
| WC5 | Task-level ownership, sharing and retention | deferred; increment 2 contract |
| WC6 | Selection across Part Studios / documents (needs MCP target provisioning) | G3 [#3](https://github.com/edge-robot/clawonshape/issues/3), [onshape-mcp#9](https://github.com/edge-robot/onshape-mcp/issues/9) |

## 11. Browsing: documents, workspaces and part search (`work-context-1.1.0-draft`)

Source: live acceptance 2026-10-22 (`docs/evidence/2026-10-22-work-context-live-acceptance.md`). The
user rejected the increment-1 selector because document choice was a single preselected entry and
part search only covered the bound Part Studio. The research report
`docs/prompts/2026-10-22-onshape-catalog-research.report.md` gives the provider analysis; CR-9–CR-14
from it are adopted here with the changes noted.

**Authority (decided 2026-10-22).** The user asked for real listing. Listing documents, workspaces
and parts is a read with the existing `OAuth2Read` scope and needs `operator.read`. It grants no new
right: **adoption stays limited to the increment-1 bounds** (§1, §5 unchanged), because the MCP target
is static (G3, #3). Everything outside the bounds is browsable and previewable as **inspection only**
and says why. Document lists and search results are dashboard-only and never reach agent context.

### 11.1 Additional provider reads

| # | Purpose | Request |
|---|---|---|
| R6 | Document search, paged | `GET /api/v10/documents?q={q}&filter={f}&sortColumn=modifiedAt&sortOrder=desc&offset={n}&limit=20` (`getDocuments`) |
| R7 | Workspaces of a listed document | `GET /api/v10/documents/d/{d}/workspaces` (`getDocumentWorkspaces`; the R0 read, now for any `d`) |
| R8 | Part Studio preview | `GET /api/v10/partstudios/d/{d}/m/{mv}/e/{e}/shadedviews` (`getPartStudioShadedViews`), 128 px |
| R1, R2, R4, R5 | as §2 | `{d}`, `{w}`, `{e}` MAY be any document, workspace or Part Studio that R6/R7/R2 listed in the same connection |

- Parts are read **per Part Studio** (R4). `getPartsWMV` (`/parts/d/{d}/{wvm}/{wvmid}`) requires
  `elementId` in OpenAPI 1.216 and 1.222 and is therefore not a workspace-wide shortcut.
- No server-side part search exists. Part search is **document-first**: R6 finds documents by name,
  then R7, then R1 → R2 → R4 × studios → R1 recheck in the chosen workspace, and the plugin filters by
  `name` and `partNumber` (case-insensitive, NFC substring). No fan-out across documents.
- R6/R7 have no revision. R1 → R2/R4 → R1 stays the fence for every workspace-level read.
- Non-document items of R6 (`jsonType` other than `document-summary`) and trashed documents are
  dropped. Only `id`, `name`, `modifiedAt` and `defaultWorkspace.id` reach the view; owner e-mail and
  permission sets never do.

### 11.2 Additional gateway methods

All `operator.read`, GET only, unknown keys → `invalid_arguments`.

| Action | Input | Result |
|---|---|---|
| `work-context-documents` | `{connectionRef?, query?: string 0..100, offset?: integer ≥ 0, multiple of 20, filter?: "recent" \| "mine" \| "shared"}` | `{ok, documents: DocumentPage}` |
| `work-context-workspaces` | `{connectionRef?, documentId}` | `{ok, workspaces: WorkspaceList}` |
| `work-context-parts` | `{connectionRef?, documentId, workspaceId, query?: string 0..100, elementId?}` | `{ok, parts: PartSearch}`; no `query` = all parts (bounded); `elementId` = one studio only |
| `work-context-preview` (extended) | `{connectionRef?, documentId?, workspaceId?, elementId, partId?, observedMicroversion}` | as §4; `documentId`/`workspaceId` default to the binding; without `partId` → Part Studio preview (R8). The element may be any Part Studio of a listed workspace; R1 of **that** workspace MUST equal `observedMicroversion`, else `selection_observation_stale` |

`work-context-catalog`, `-status`, `-adopt` and `-clear` are unchanged. `work-context-adopt` still
rejects everything outside §1 with `selection_target_not_allowed`.

### 11.3 Views

```json
{"DocumentPage": {"items": [{"documentId": "24-hex", "name": "string|null", "modifiedAt": "ISO-8601|null",
   "bound": true, "goalEligible": true, "reason": null}], "offset": 0, "hasMore": false, "query": "", "observedAt": 0},
 "WorkspaceList": {"documentId": "24-hex", "items": [{"workspaceId": "24-hex", "name": "string|null",
   "role": "primary|candidate|default|other", "readOnly": false, "goalEligible": true, "reason": null}], "observedAt": 0},
 "PartSearch": {"documentId": "24-hex", "workspaceId": "24-hex", "observedMicroversion": "24-hex", "query": "",
   "studios": [{"elementId": "24-hex", "name": "string|null", "goalEligible": true, "reason": null, "configurationChecked": true}],
   "hits": [{"elementId": "24-hex", "partId": "string", "name": "string", "partNumber": "string|null", "bodyType": "solid",
     "hidden": false, "selectable": true, "reason": null}],
   "truncated": false, "truncatedReason": null, "observedAt": 0}}
```

- The bound document is always `items[0]` on page 0 with `bound: true`, even if it does not match
  `query` (then labelled "gebunden"); other entries are de-duplicated against it.
- `role`: `primary` = `binding.primaryWorkspaceId` in the bound document; `candidate` = the current
  goal's Candidate; `default` = the provider default workspace of a non-bound document (label only);
  otherwise `other`. Provider flags (`isReadOnly`, `protectionRule`) are labels and never decide
  eligibility.
- `hits` are sorted by `name`, studio name, `partId`. `selectable: true` only for parts that `adopt`
  would accept (§1). Otherwise `selectable: false` with the **first** failing reason in this order:
  `document_not_provisioned`, `candidate_inspection_only` / `workspace_inspection_only`,
  `element_not_provisioned`, `configuration_unsupported`, `part_kind_unsupported`.
- `configurationChecked: false` for studios whose R3 was not read (all non-bound studios); they are
  inspection-only anyway.
- A part is identified by `(documentId, workspaceId, elementId, partId)` at `observedMicroversion`;
  equal `partId`s in different workspaces or studios are different parts.

### 11.4 Limits, caching and rate protection

- Document page 20 (provider maximum). `query` ≤ 100 characters after trim, NFC. The UI sends
  document queries only from 2 characters on, debounced ≥ 300 ms.
- At most 20 Part Studios scanned per part search, 500 parts per studio, 100 hits returned; beyond
  that `truncated: true`, `truncatedReason: "part_search_truncated"`.
- Response limits: R6 1 MiB, R7 1 MiB, R4 4 MiB; previews below 65 000 base64 characters (CR-3).
- In-memory LRU for `mv`-keyed data (64 entries, 8 MiB); TTL 60 s for R6, 30 s for R7. All caches are
  dropped on authorization or binding change, disconnect/reconnect and plugin dispose. Nothing is
  persisted.
- At most one provider read in flight per connection for the browsing methods (serialized). No
  automatic retry on 429.

### 11.5 Error codes and view reasons

| Code | Kind | Meaning / UI outcome |
|---|---|---|
| `document_not_provisioned` | view reason | not the bound document; "nur ansehen" |
| `workspace_inspection_only` | view reason | non-Primary workspace; "nur ansehen" (`candidate_inspection_only` stays for the Candidate) |
| `document_not_accessible` | error | R7/R1/R2 returned 403/404 for a listed document; "kein Zugriff" |
| `provider_quota_exhausted` | error | provider 402 (annual API limit); "Onshape-API-Kontingent erschöpft" |
| `part_search_truncated` | `truncatedReason` | narrow the query |

Reused: `provider_rate_limited` (429, "später erneut", no retry loop), `invalid_arguments`,
`provider_protocol_error`, `selection_observation_stale`, `live_reads_disabled`,
`reconnect_required`, `authorization_changed`.

### 11.6 Tests (offline) W12–W18

| # | Test |
|---|---|
| W12 | documents: paging (`offset` multiple of 20, `hasMore`), bound document pinned first and de-duplicated, non-document and trashed items dropped, no owner e-mail in the view; equals `document-page.json` |
| W13 | workspaces: roles `primary`/`candidate`/`default`/`other`, eligibility from the binding only; equals `workspace-list.json` |
| W14 | parts: per-studio R4 at `m/{mv}`, R1 recheck, filtering by name and part number, sort order, eligibility reason order, truncation; equals `part-search.json` |
| W15 | preview of a non-bound part and of a Part Studio (R8) with the R1 rule of that workspace |
| W16 | adopt of any hit outside §1 → `selection_target_not_allowed`, record unchanged |
| W17 | cache: hit within TTL, drop on authorization change and reconnect; one read in flight per connection |
| W18 | 402 → `provider_quota_exhausted`, 403/404 on a listed document → `document_not_accessible`, 429 → `provider_rate_limited` without retry |

### 11.7 Open live checks

| ID | Check |
|---|---|
| WC7 | R6 with `q` and each `filter`: item kinds, whether shared documents appear, response size |
| WC8 | R7 field values (`isReadOnly`, `protectionRule`, default workspace) on the live documents |
| WC9 | R8 at `m/{mv}` and 128 px below 65 000 characters |
| WC10 | 403 vs. 404 for an inaccessible document |
| WC11 | API call accounting of the ClawOnshape OAuth app (private/counted?) and the plan's annual cap |

### 11.8 Accepted interpretations (ts-plugin-dev report 2026-10-22, CR-15–CR-22)

- **CR-15** Without `filter`, R6 sends no `filter` (provider default); `recent`/`mine`/`shared` → 5/0/2.
- **CR-16** The pinned bound document takes its label from the R6 page if present, otherwise from the
  R0 label read (cached with the R6 TTL); `modifiedAt` may be `null`.
- **CR-17** The `default` role of a non-bound document comes from the cached R6 listing, otherwise
  from one R0 read.
- **CR-18** `PartSearch.studios` lists all Part Studios of R2 in provider order, also when narrowed or
  truncated; only scanned studios contribute hits. The studio list is the UI remedy for
  `part_search_truncated`.
- **CR-19** R3 is read only for the bound studio in the bound Primary; a configured bound studio is
  still enumerated and its hits carry `configuration_unsupported`.
- **CR-20** Preview: a non-bound `documentId` requires `workspaceId` (`invalid_arguments`); a
  non-Part-Studio element → `selection_observation_stale`; studio preview has `partId: null`;
  403/404 → `document_not_accessible` only for non-bound targets; 402 → `provider_quota_exhausted`;
  the preview reads R2 at `mv` (cached) to check the element.
- **CR-21** Cache partition = sha256 of authorization snapshot, `bindingKey` and the token hash; a
  token refresh starts a fresh partition. `catalog`, `status`, `adopt`, `clear` are uncached and not
  serialized (1.0 behaviour).
- **CR-22** `document_not_accessible` covers 403/404 on R7, R1, R2 and R0 in the browsing methods;
  R6 403 stays `provider_forbidden`; R4 keeps its provider codes. The 402 mapping lives inside the
  browsing methods; `src/http.ts` and other callers are unchanged.

## 12. Robust part search and REST call accounting (`work-context-1.2.0-draft`)

Issue: [edge-robot/clawonshape#22](https://github.com/edge-robot/clawonshape/issues/22). Source: live
acceptance 2026-10-26 (`docs/evidence/2026-10-26-selector-v2-and-goal-live-acceptance.md`, F2):

- part search in a large real document failed as a whole with `provider_protocol_error`, and the
  cause could not be determined;
- the Onshape usage counter rose by 112 calls during one short dashboard session, against a plan
  cap of **2,500 API calls per year**.

§1–§11 stay valid except where this section says otherwise. Adoption bounds (§1, §5) are unchanged.

**Status: deferred at project closure (2026-10-26, ADR-2026-10-26).** Only the §12.6 call-cost baseline
has been measured (K2, `tests/rest-calls.test.mjs`). The deployed code implements §1–§11.

The §12 fixture shapes live in `work-context-fixtures/draft-1.2.0/`:
- `part-search.json` and `error-codes.json` with the new fields;
- `part-search-partial.json`.

They replace the fixtures of the same names only when §12 is implemented. Until then, the tests read
the 1.1.0 fixtures in `work-context-fixtures/`.

### 12.1 Per-studio scan status

`PartSearch.studios[]` gains three fields:

```json
{"elementId": "24-hex", "name": "string|null", "goalEligible": true, "reason": null, "configurationChecked": true,
 "scan": "scanned|not_scanned|failed", "scanError": null, "skippedEntries": 0}
```

- `scanned`: R4 (and R3 where §11 requires it) succeeded; hits of this studio are included.
- `not_scanned`: beyond the scan limit (§12.4) or excluded by an `elementId` refinement. It
  contributes no hits.
- `failed`: the R4 (or R3) read for this studio failed with a **studio-local** code. These codes are
  `provider_response_too_large`, `provider_protocol_error`, `provider_not_found` and
  `provider_forbidden`. `scanError` carries the code. The search continues with the next studio.
- **Search-wide** failures still fail the whole method and stop further reads at once:
  - R1 or R2 failures;
  - `provider_quota_exhausted` (402);
  - `provider_rate_limited` (429);
  - `reconnect_required` (401 or token);
  - `authorization_changed`;
  - a changed R1 recheck (`selection_observation_stale`).
- A `failed` bound studio makes every part of that studio non-adoptable. `catalog`, `status` and
  `adopt` keep their 1.0 failure behaviour for the bound studio (§5.2), with the entry tolerance of
  §12.2.
- New top-level field `failedStudios` (integer): the count of studios with `scan: "failed"`. The UI
  shows the affected studios as "nicht lesbar" and keeps all other hits usable.

### 12.2 Entry tolerance for R4

- Response-level shape errors still fail the studio (`provider_protocol_error`):
  - not an array;
  - more than `PART_RESPONSE_LIMIT` entries;
  - invalid JSON.
- An **individual** entry that fails validation is **skipped and counted** (`skippedEntries`); it
  never fails the response. The checks are:
  - part ID pattern;
  - duplicate `partId`;
  - name empty, above 200 characters, or containing control or format characters;
  - missing or invalid `bodyType`;
  - non-boolean `isHidden`.
- Skipped entries do not appear as hits and cannot be adopted. Adopting or revalidating a part
  whose entry is skipped yields `selection_part_missing`.
- This applies to every R4 projection: `catalog`, `status`, `adopt` and `parts`. It applies to R4
  entries only; R1, R2, R6 and R7 keep their validation.

### 12.3 Oversize code

- New code `provider_response_too_large`: a provider response exceeded the byte limit of its read.
  Before 1.2.0 this mapped to `provider_protocol_error`.
- In the browsing methods it is studio-local for R4 (§12.1). It is search-wide for R6, R7 and R2.
- UI text: "Onshape-Antwort zu groß".
- The R4 byte limit is raised from 4 MiB to **16 MiB**. The read stays streamed and aborts as soon
  as the limit is exceeded. Only the projection is cached, never the raw body.

### 12.4 Call economy (quota)

- **Automatic scan limit:** a part search without `elementId` scans at most **10** Part Studios
  (was 20), in R2 order. The bound studio, when present, is scanned first. Remaining studios are
  `not_scanned`, and `truncatedReason: "part_search_truncated"` applies as in §11.4. A refinement
  to one `elementId` scans exactly that studio.
- **Negative cache:** a studio-local deterministic failure is cached under the same `mv` key and
  partition as a success. This applies to `provider_response_too_large` and
  `provider_protocol_error`. Repeating the search or pressing "Erneut laden" at the same `mv` makes
  no new R4 call for that studio. `provider_not_found` and `provider_forbidden` are not cached.
- **Stop on quota signals:** after 402 or 429 the method makes no further provider call. Every
  queued browsing read of the same connection is rejected with the same code; it is not sent.
- No new automatic reads: no read may be added to page load, focus or visibility events, and no
  polling.

### 12.5 REST call accounting

- Every outbound Onshape request of the plugin passes one counter. This includes the cockpit,
  inspection, render, goal, work-context and OAuth requests.
- The counter is keyed by:
  - a route **template**: IDs replaced by `{d}`, `{w}`, `{m}`, `{e}`, `{p}`; no query string;
  - the method;
  - the status class (`2xx`, `4xx`, `5xx`, `error`).
- OAuth token endpoint requests are counted under their own template `oauth/token` and kept apart
  from API calls.
- The counter lives in memory only. It counts since plugin start, per connection.
- After each gateway method or agent tool invocation that made at least one provider request, the
  plugin logs one info line:

  ```
  claw-onshape rest-calls action=<gateway method or tool name> calls=<n> total=<since start> routes=<template>:<n>,...
  ```

  The line contains no IDs, names, tokens or response content.
- **Diagnostics:** every `provider_protocol_error` and `provider_response_too_large` in the
  work-context and browsing paths logs one warn line:

  ```
  claw-onshape provider-check action=<...> read=<R1..R8> check=<check name> [bytes=<n>] [index=<entry index>] [field=<field name>]
  ```

  It contains no values from the response. Skipped entries (§12.2) are summarised per studio as
  `check=entry_skipped count=<n> fields=<field>:<n>,...`.
- These lines are the evidence for WC11. They count only the plugin's own requests. Requests that
  agents make through onshape-mcp are not covered and are tracked separately.

### 12.6 Call-cost table (normative budget)

The implementation report MUST provide the measured number of provider calls (cold cache / warm
cache) for each dashboard action. The architect records the table here, and tests assert it as an
upper bound:

- dashboard load of the Engineer cockpit;
- `work-context-status`;
- `work-context-catalog`;
- document search page;
- workspace list;
- part search (bound Primary, N studios);
- part search (other document);
- part preview;
- studio preview;
- adopt;
- clear.

Measured baseline of the deployed code (0.3.0-rc.3 @ `667f01c`). Source: K2 report
`docs/prompts/2026-10-26-closure-call-cost-baseline.report.md`, asserted as upper bounds in
`tests/rest-calls.test.mjs`. The setup is two Part Studios unless noted, a fresh token, and "sel." means with
an adopted selection.

| Action | Cold | Warm |
|---|---:|---:|
| dashboard load (no sel. / sel.) | 3 / 9 | 3 / 9 |
| selector open (no sel. / sel.) | 8 / 16 | 2 / 9 |
| `work-context-status` (sel.) / `onshape_status` (sel.) / adopt | 6 / 6 / 6 | 6 / 6 / 6 |
| document search page / workspace list | 1 / 1–2 | 0 / 0 |
| part search, bound Primary, 2 / 5 / 21 studios | 6 / 9 / 23 | 2 / 2 / 2 |
| part search after a new Primary revision (5 studios) | 9 | 2 |
| part preview / studio preview | 3 / 3 | 1 / 1 |
| cockpit CAD view / `onshape_render` / `onshape_inspect` | 6 / 6 / 3 | 6 / 6 / 3 |
| goal propose (sel.) / confirm / verify | 4 / 1 / 1 | – |
| example operator session (load, open, 3 searches, preview, adopt, CAD view, reload) | **40** | **46** |

The main cost drivers:
- status revalidation is uncached (6 calls per call);
- every search costs 2 R1 calls;
- a new revision triggers a full studio rescan;
- failures are not cached;
- each token refresh empties the cache.

Agent calls through onshape-mcp are not included.

### 12.7 Tests (offline) W19–W24

| # | Test |
|---|---|
| W19 | one studio fails (oversize, protocol, 403, 404): `scan: "failed"` with `scanError`, other studios' hits returned, `failedStudios` counted; equals `draft-1.2.0/part-search-partial.json` |
| W20 | entry tolerance: invalid entries skipped and counted, valid ones listed; adopt of a skipped part → `selection_part_missing`; catalog/status of the bound studio survive one invalid foreign entry |
| W21 | R4 above 16 MiB → `provider_response_too_large`, read aborted early; R6/R7/R2 oversize → search-wide `provider_response_too_large` |
| W22 | negative cache: a repeated search at the same `mv` makes no R4 call for a failed studio; a new `mv` re-reads it; 403/404 not cached |
| W23 | 402/429 stop: no further calls in the method; queued reads rejected without dispatch |
| W24 | call accounting: counter by template/method/status class, log line format without IDs/values, diagnostics lines, and the §12.6 budgets as upper bounds |

### 12.8 Open live checks

| ID | Check |
|---|---|
| WC12 | the large real document: which check failed (diagnostic line), `scan` states, and the call count of one part search |
| WC13 | per-action call counts in the live log match §12.6; total for one full selector journey |

## Accepted interpretations (ts-plugin-dev report 2026-10-22, CR-1–CR-8)

- **CR-1 R0 label reads.** `GET /api/v10/documents/{d}` and `GET /api/v10/documents/d/{d}/workspaces`
  (the `workspace-context` reads) supply labels only, never identity or revision evidence.
- **CR-2 Nullable names.** `Catalog.document.name`, `workspaces[].name` and `partStudios[].name` are
  `string | null` (missing or invalid label). Part names stay strict (`provider_protocol_error`).
  *Superseded for R4 entries by §12.2 (1.2.0): an invalid entry is skipped, not the whole response.*
- **CR-3 Preview size.** The preview is a 256×256 PNG in one `dataBase64` string below 65 000
  characters (OpenClaw plugin JSON string limit); larger → `preview_unavailable`.
- **CR-4** A bound element that is not a Part Studio at `mv` → `target_not_part_studio` in catalog and
  adopt; status shows `invalid` / `selection_part_missing`.
- **CR-5** In the preview an R1 failure keeps its own read code; only R5 failures are `preview_unavailable`.
- **CR-6** `partStudios` keep the R2 provider order. The Candidate row appears only when the binding's
  current non-terminal goal has a `candidateWorkspaceId` present in the workspace list.
- **CR-7** `interlock.goalId` is set only for a goal of the same binding. The store lock does not wait:
  a concurrent loser may receive `connection_busy_or_state_unavailable` instead of
  `selection_revision_conflict`; the UI reloads status in both cases.
- **CR-8** After `work-context-clear` the record keeps `selectionRevision`; `selection`, `adoptedAt`,
  `adoptedBy` are `null`.
- Further consumer-visible codes: `target_missing`, `reconnect_required` and other read codes appear
  as `unverified` reasons; an unreadable selection store yields `validity: "unverified"`,
  `reason: "goal_state_invalid"`, `selection: null`.

## Changelog

- `work-context-1.2.0-draft` (2026-10-26): §12 from live finding F2 (#22):
  - per-studio scan status (`scan`, `scanError`, `skippedEntries`, `failedStudios`);
  - R4 entry tolerance (supersedes CR-2 for R4 entries);
  - `provider_response_too_large` and the R4 limit raised to 16 MiB;
  - quota economy: automatic scan limit 10 (was 20), negative cache, stop on 402/429;
  - REST call accounting and diagnostics log lines;
  - call-cost table; tests W19–W24; live checks WC12–WC13.

  Additive for the view; behaviour change for the scan limit, for oversize mapping and for strict R4
  entries.

- `work-context-1.1.0-draft` amended (2026-10-22): §11.8 accepted interpretations CR-15–CR-22 from the
  browsing backend report (no MUST changed).

- `work-context-1.1.0-draft` (2026-10-22): additive §11 browsing (R6–R8; `work-context-documents`,
  `-workspaces`, `-parts`; extended `-preview`; views, limits, codes, W12–W18, WC7–WC11) from the
  research CR-9–CR-14. Changes against the CRs: `getPartsWMV` dropped (elementId required in OpenAPI
  1.222 too); listing authority decided by the user's request; adoption bounds unchanged.

- `work-context-1.0.0-draft` amended (2026-10-22): accepted interpretations CR-1–CR-8 from the backend
  report (no MUST changed; fixtures unchanged).

- `work-context-1.0.0-draft` (2026-10-22): initial contract-first draft for increment 1 (#21).
