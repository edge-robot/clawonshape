---
prompt: docs/prompts/2026-10-22-work-context-backend.md
branch: feat/21-work-context-selection
commits: 613f22e..0f02900
status: done
contract-version: work-context-1.0.0-draft
e2e-request: required
---
# Report: Work-context selection backend, increment 1 (#21)

## Summary

The backend of `docs/interface/work-context.md` (`work-context-1.0.0-draft`) is implemented:

- the durable selection record per binding key;
- the five dashboard gateway methods;
- adoption in the exact §5 order (interlock, R1 recheck, late-reply fence, CAS under the goal store lock);
- the `Catalog` and `WorkContextView` projections, including `workContext` in the Engineer's `onshape_status`;
- the goal hand-off `scope.focus` (goal-1.2.0-draft).

Provider access is GET only: R1–R5 plus the existing document/workspace label reads (see CR-1). Nothing in this
path creates a Candidate, goal, proposal, approval or grant. No MCP change, no new dependency, no manifest change
(no new tool).

Preconditions verified:

- Container: `CLAUDE_DEVCONTAINER=1`.
- Branch: `feat/21-work-context-selection`; HEAD `613553c` contains `ae7a05f`.
- Contract versions: `tests/contract/VERSION` = `1.2.0-draft` (digest unchanged); `work-context.md` says
  `work-context-1.0.0-draft`.
- Foreign repo: onshape-mcp HEAD = `cc67472e3dd05d178bce4736c5f158abe6e4df3e`.

## Changed files

`git diff --stat 613553c..HEAD`: 23 files, +2425 / −15.

| File | Purpose |
|---|---|
| `src/work-context.ts` (new) | Pure model: `bindingKey`, part eligibility, R2–R4 projections and validation, `catalogView`, `revalidate` (§5.2), `workContextView`, record validation |
| `src/work-context-store.ts` (new) | Private per-binding-key record, atomic replace, fsync of file and directory; no lock of its own |
| `src/work-context-service.ts` (new) | Catalog, preview, status, adopt, clear, interlock (§5.1), `goalFocus` (§7) |
| `src/rest.ts` | GET-only reads `workContextNames`, `primaryMicroversion` (R1), `partStudiosAt` (R2), `configuredAt` (R3), `partsAt` (R4), `partPreview` (R5) |
| `src/render.ts` | `decodePng(response, size = IMAGE_SIZE)`; existing callers unchanged |
| `src/dashboard.ts` | The `work-context-*` session actions |
| `src/readiness.ts` | Operator texts for the eight new codes |
| `src/goal-scope.ts` | Optional `focus` in `GoalScope`/`validateScope`; the key is absent without focus, so the hash is unchanged |
| `src/goal-lifecycle.ts` | `GoalView.target.focus` (`null` without focus) |
| `src/goal-service.ts` | `proposeGoal` adds the focus under the store lock (new, revise and renew); `GoalClient` gains the R2–R4 reads |
| `src/index.ts` | Engineer `onshape_status` → `workContext`; tool description updated (it now does metadata reads) |
| `src/delegation.ts` | WC4: Lead side drops `workContext` from a signed Engineer result after signature verification |
| `skills/onshape-goal-iteration/SKILL.md` | One paragraph: focus is intent, conditions stay feature-based, report effects on other parts |
| `tests/work-context.test.mjs` (new) | W1–W11 plus §3 vector, preview, §6.3/WC4 |
| `tests/fixtures/work-context/*` (new) | Recorded-shape REST responses (synthetic IDs, OpenAPI field sets) |
| `tests/contract.test.mjs` | GoalView fixture comparison treats the absent `target.focus` as `null` (goal-1.2.0 changelog); the fixture itself is untouched |
| `tests/mcp-readiness.test.mjs` | Exact dashboard action list extended by the five new actions |

## Checks

| Command | Baseline (`613553c`) | After (`0f02900`) |
|---|---|---|
| `npm ci` | pass | pass |
| `npm run typecheck` | pass | pass |
| `npm test` | pass, 199 tests | pass, **217** tests (+18 new; no legacy test removed) |
| `npm run test:native-files` | — | pass (`"status":"PASS"`, `powerLossDurability: UNVERIFIED` as before) |
| `npm pack --dry-run` | — | pass: 193 files; `dist/`, manifest, docs, skills; no `state/`, `.tgz` or `.env` (the only `.tgz` match is the `filename:` notice line) |
| `npx biome ci .` | pass (65 files) | pass (69 files, no diagnostics) |

One legacy test was adapted, not weakened: "GoalView of an ACTIVE goal … exactly the fixture keys" now asserts
that the shared fixture has no `target.focus` and expects `focus: null` in the produced view, as the goal-1.2.0
changelog requires. All other legacy assertions are unchanged.

## Acceptance criteria

| # | Result | Evidence |
|---|---|---|
| A1 | met | `W1 catalog from recorded R1–R4 responses equals catalog.json; same-name parts stay distinct` (deep-equals `catalog.json`; `Bracket` JHD/JHH distinct; `Fasteners` → `element_not_provisioned`, `parts: null`; read order `document, workspaces, r1, r2, r3, r4, r1`, R2–R4 at `m/{R1}`); `W1 configured Part Studio → configuration_unsupported, parts not enumerated`; `W1 part validation: …` (invalid partId/name/duplicate → `provider_protocol_error`, 501 parts → `truncated: true`, 500 returned; mesh/flattened/flag-less → `part_kind_unsupported`) |
| A2 | met | `W2 R1 changes between start and end of the catalog read → selection_observation_stale` (no record file); W4 "stale microversion" |
| A3 | met | `W3 adopt happy path …` (view equals `view-valid.json`, record revision 1, mode 0600, no token in the record); `W4 adopt rejects every invalid case; the previous record stays unchanged`. W4 cases: missing `operator.admin`; foreign document, workspace and element; unsupported part; missing part; stale microversion; stale `expectedSelectionRevision`; unknown key; malformed partId; configured element; authorization change during R4; token rotation during R4 (fence); live reads off; clear CAS and scope. The record bytes are compared after every case. Also checked: revision 1 → clear 2 → adopt 3 (never reused) |
| A4 | met | `W5 interlock: every non-terminal goal state …` (each of the six states refuses adopt and clear with `goal_active_conflict`; status interlock carries the `goalId`; no R1 before the interlock); `W5 interlock: legacy UNKNOWN receipt, active approval v2, candidate attempt UNKNOWN; allowed after goal-close` (also `CREATED_UNVERIFIED`); `W5 unreadable goal or candidate state fails closed with goal_state_invalid` |
| A5 | met | `W6 two concurrent adopts …` (exactly one wins; the loser gets `selection_revision_conflict` or `connection_busy_or_state_unavailable`, see the UI notes); `W7 adopt racing propose/goal-confirm is serialized; …` (A: adopt paused in R4 while propose commits → adopt `goal_active_conflict`, goal focus equals the record; B: clear while confirm holds the lock → refused; the confirmed goal's focus equals the record) |
| A6 | met | `W8 restart/reload: …` (fresh registration reads the record; `valid`, `revision_advanced`; `invalid` deep-equals `view-invalid.json`; `selection_part_unsupported`, `configuration_unsupported`; `unverified` for 503, live reads off and 401 with the record bytes unchanged); `W9 a changed binding sees no selection; …` (view equals `view-none.json`) |
| A7 | met | `W10 goal hand-off: …` (no selection: no `focus` key, `goalHash` = `vector.json`; selection: scope deep-equals `goal-hash-focus.json` and `goalHash` = its vector; renew after STOP keeps the hash; part missing at base → `selection_part_missing`; 503 → `provider_unavailable`; configured → `configuration_unsupported`; no goal file on failure; after clear no focus). The existing T1 test is unchanged and passes |
| A8 | met | W3: every fake-REST call is `GET`; `claw-onshape/goals`, `claw-onshape/mutations`, `claw-onshape-candidate-attempts` and the approval directory contain no `.json`; `creates = 0`; catalog, preview and status leave the record bytes unchanged |
| A9 | met | `W11 every code the work-context modules emit is in error-codes.json or an existing plugin code` (scans `dist/work-context*.js`; all contract codes have texts) |
| A10 | met | Checks table |

Other tests:

- `§3 bindingKey matches the binding-key.json test vector`: each of the eight fields changes the key; the legacy
  `workspaceId` does not.
- `§4 work-context-preview: …`: the R5 path is `m/{mv}` and `partid/{id}`, 256 px with `pixelSize=0`. Stale
  revision and foreign element give `selection_observation_stale`. 404, 503 and an 800 px image give
  `preview_unavailable`.
- `§6.3 Engineer onshape_status carries workContext; WC4 the Lead projection drops it`.

## Provider facts

**WC3 (offline evidence).** In `/workspaces/onshape-mcp/crates/onshape-mcp-io/onshape-openapi.json`,
`BTPartMetadataInfo.partId` is `{"type": "string"}` with no pattern, enum or example. The path parameter `partid`
of `getPartShadedViews` is also a plain string. No example part IDs appear anywhere in the spec. The contract
pattern `^[A-Za-z0-9_.+-]{1,64}$` is therefore unverified and stays to be widened from a live R4 response.

The partId is URL-encoded in the R5 path. Other facts from the spec:

- `isMesh`, `isFlattenedBody`, `isHidden` are booleans; `bodyType` is a free string.
- `getPartsWMVE` has an `includeFlatParts` query parameter; it is not sent, so the provider default applies.

**WC1 assumption in code.** R3 is `elements/d/{d}/m/{mv}/e/{e}/configuration`. A response without an array
`configurationParameters` is `provider_protocol_error`; a non-empty array is `configuration_unsupported`. The
`w/{primary}` fallback is **not** implemented: the contract makes it conditional on the live result.

**WC2 assumption in code.** R5 is `parts/…/m/{mv}/…/partid/{id}/shadedviews` with the render `VIEW_MATRIX`,
`outputWidth`/`outputHeight` 256, `pixelSize=0`, `edges=show`. The response is decoded like the render path
(`images[0]`, PNG with the exact 256×256 header). Any failure except 401 is `preview_unavailable`.

## Contract deviations and change requests

None of these changes a MUST. They are interpretations where the contract is silent, proposed for recording as
"accepted interpretations", as was done in goal-workflow.md. They are not blocking.

- **CR-1 (additive, §2): label reads.** §2 lists R1–R5 only, but the views require `document.name`, workspace
  names and `documentName`/`workspaceName`. The plugin uses the existing read-only metadata GETs
  `documents/{d}` and `documents/d/{d}/workspaces` (the same calls as `workspace-context`), under the same guard.
  - Proposed contract text: "R0: `GET documents/{d}` and `GET documents/d/{d}/workspaces` for labels only (never
    identity or revision evidence)."
  - Impact on onshape-mcp: none.
- **CR-2 (clarification, §6.1): nullable names.** `Catalog.document.name`, `workspaces[].name` and
  `partStudios[].name` are `null` when the provider label is missing or fails display-name validation. This
  follows §6.2's "a missing name is null, never the ID". Part names stay strict (`provider_protocol_error`).
  - Proposed: type these as `string | null`.
- **CR-3 (clarification, §4 preview): size.** A single `dataBase64` string must stay below OpenClaw's
  65,536-character limit for strings in plugin JSON. The plugin requests 256 px (contract: ≤ 512) and returns
  `preview_unavailable` above 65,000 characters.
  - Alternative if 512 px is wanted: chunked base64 as in `render` (breaking for the UI shape).
- **CR-4 (clarification, §5/§8): element not a Part Studio.** If the bound element is not a Part Studio at `mv`,
  catalog and adopt return the existing code `target_not_part_studio`; status shows it as `invalid` /
  `selection_part_missing`.
- **CR-5 (clarification, §4 preview): R1 errors.** In the preview, an R1 failure (for example `provider_unavailable`
  or `reconnect_required`) keeps its own code. Only R5 failures are `preview_unavailable`.
- **CR-6 (clarification, §6.1): ordering and Candidate listing.**
  - `partStudios` follow R2 provider order (the fixture order).
  - The Candidate row appears only if the binding's current non-terminal goal has a `candidateWorkspaceId` and
    that ID is in the workspace list.
- **CR-7 (clarification, §5.1): interlock details.**
  - `interlock.goalId` is shown only for a goal of the same binding. Another binding's goal blocks with
    `goalId: null`.
  - The store lock does not wait, so a concurrent loser may get the existing
    `connection_busy_or_state_unavailable` instead of `selection_revision_conflict`.
- **CR-8 (clarification, §3): record after clear.** After `work-context-clear` the record keeps
  `selectionRevision` and has `selection`, `adoptedAt` and `adoptedBy` set to `null`.

## Notes for the UI consumer (#17)

**Actions:** `work-context-catalog`, `work-context-preview`, `work-context-status`, `work-context-adopt`,
`work-context-clear`.

- Inputs exactly as §4. Unknown keys → `invalid_arguments`. `expectedSelectionRevision` is an integer ≥ 0.
- The gateway envelope is `{ok: true, result}`. `result` is `{ok: true, catalog | preview | workContext}` or
  `{ok: false, code, message}`, as for the goal actions.

**Catalog:**

- Names may be `null` (CR-2).
- A configured bound studio has `goalEligible: false`, `reason: "configuration_unsupported"`, `parts: null`.

**WorkContextView:**

- `unverified` keeps `selection` (record data) with `documentName`, `workspaceName`, `partStudioName` and
  `currentMicroversion` set to `null`. `partName` is the adopted label when the part is no longer present.
- `adoptedAt` and `adoptedBy` are `null` when `selection` is `null`. `adoptedBy.clientId` is present only if the
  gateway exposes `client.connId` (GW2).
- An unreadable selection store yields `validity: "unverified"`, `reason: "goal_state_invalid"`, `selection: null`.

**Error codes to handle:**

- `connection_busy_or_state_unavailable` (lock held): retry after reload.
- `target_not_part_studio`, `target_missing`, `not_configured`.
- `reconnect_required` and other read codes as `unverified` reasons.

**Preview:** 256×256 PNG. Stale or foreign → `selection_observation_stale`.

**GoalView:** `target.focus` is `{partId, partName, elementId, selectionRevision}` or `null`.

## Live E2E request

**Preconditions:**

- A plugin build from `0f02900`; version unchanged at `0.3.0-rc.1`, the architect bumps it.
- Config: `liveReads: true`, `goals.enabled: true`.
- The bound Camera Mount document with an unconfigured Part Studio and at least two parts.

**Steps and expected results:**

1. `work-context-catalog`:
   - Record the real R3 (WC1) and R4 responses. WC3: verify that every real `partId` matches the pattern.
   - Expected: the bound studio is enumerated, other studios show `element_not_provisioned`, and only GETs appear.
2. `work-context-preview` for one part (WC2).
   - Expected: a PNG under 65,000 base64 characters, or `preview_unavailable`; never a whole-studio image.
3. `work-context-adopt` with the catalog's `observedMicroversion` and `expectedSelectionRevision: 0`.
   - Expected: `selectionRevision: 1`, `valid`.
   - Repeat with a stale revision. Expected: `selection_revision_conflict`.
4. Edit Primary in Onshape, then `work-context-status`.
   - Expected: `valid` / `revision_advanced`. After deleting the part: `invalid` / `selection_part_missing`.
5. Engineer `onshape_status` (through the Lead delegation fallback and directly).
   - Expected: the Engineer result has `workContext`; the Lead output does not (WC4).
6. Goal proposal with a valid selection.
   - Expected: the dashboard shows `target.focus` before `goal-confirm`, and adopt/clear are refused with
     `goal_active_conflict` until `goal-close`.

## Open points and risks

- WC1, WC2 and WC3 are open until the live E2E (above). If R3 does not accept `m/{mv}`, every catalog fails with
  that read code. The fallback needs a decision and a small change.
- Status, adopt and propose with a selection do 4–6 provider GETs each, which adds rate-limit exposure. Status
  through `onshape_status` runs on every Engineer readiness call that has a bound element.
- **Interlock and other bindings.** Legacy receipts of another binding make `mutationStore.list()` fail
  (`authorization_changed`), so the interlock is `goal_state_invalid` in multi-binding setups. This matches the
  existing `legacyExclusive` behaviour.
- **Fixtures.** The REST fixtures are recorded-shape (OpenAPI field sets), not live captures; see
  `tests/fixtures/work-context/README.md`.
- **Commit build state.** Intermediate commits were not built separately: no worktree or stash is allowed. All
  checks ran on `0f02900`.

## Out-of-scope findings

- `src/goal-store.ts:113-116`: the non-waiting `operation.lock` is not recovered after a crash. A stale lock
  blocks goal transitions and, from now on, adopt/clear with `connection_busy_or_state_unavailable` until an
  operator removes it. Not changed.
- `src/mutation-workflow.ts:174-186`: `read()` rejects receipts of other bindings, so `list()` is not usable for
  store-wide checks in multi-binding setups (see the risk above). Not changed.
- The repository root contains ignored release archives `edge-robot-claw-onshape-0.1.0/0.2.0/0.2.1.tgz`. They are
  not tracked and not mine. Not touched.
