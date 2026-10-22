# Interface contract: work-context selection (ClawOnshape plugin-facing)

| | |
|---|---|
| Contract-Version | `work-context-1.0.0-draft` (requires `goal-workflow.md` ≥ `goal-1.2.0-draft`; no server contract change) |
| Status | **draft**: contract-first, not implemented |
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

## Changelog

- `work-context-1.0.0-draft` (2026-10-22): initial contract-first draft for increment 1 (#21).
