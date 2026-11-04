---
prompt: docs/prompts/2026-10-22-work-context-browsing-backend.md
branch: feat/21-work-context-selection
commits: 1689f71..HEAD (1689f71, ea04c3f, plus the report commit)
status: done
contract-version: work-context-1.1.0-draft
e2e-request: required
---
# Report: Work-context browsing backend: documents, workspaces, part search (#21, contract 1.1.0)

## Summary

This implements `work-context.md` §11 (`work-context-1.1.0-draft`):

- **Reads:** R6 document search, R7 workspaces of any listed document, and R8 Part Studio preview
  at 128 px. R1–R5 now also work for listed non-bound documents, workspaces and Part Studios.
- **Gateway methods:** `work-context-documents`, `-workspaces` and `-parts`, plus the extended
  `work-context-preview`.
- **Views:** `DocumentPage`, `WorkspaceList`, `PartSearch`.
- **§11.4:** an in-memory cache with per-connection serialization.
- **§11.5:** the new codes.
- **Tests:** W12–W18.

Adoption, status, catalog, interlock, CAS and the goal hand-off are unchanged. Everything outside
the §1 bounds is inspection-only with the first failing reason, and `adopt` still rejects it with
`selection_target_not_allowed` (W16).

Preconditions:
- `CLAUDE_DEVCONTAINER=1`.
- Branch `feat/21-work-context-selection`.
- HEAD `9c8e48e`, which is later than `9b535e4`.
- The contract header reads `work-context-1.1.0-draft`.
- onshape-mcp is at `cc67472`.
- The baseline had 216/217 passing. W11 was red because the 1.1.0 `error-codes.json` lists
  `document_not_accessible` without an operator text yet; it is green now.

**402 mapping choice:** the mapping happens **inside the work-context browsing methods**
(`browseError` in `src/work-context-service.ts`, using `ProviderHttpError.status`). `src/http.ts`
is unchanged, so every existing caller keeps `provider_unavailable` for 402. W18 asserts this for
the catalog.

## Changed files

```
 src/dashboard.ts                                   |  53 +-   three actions, preview keys, cache scope, lifecycle
 src/readiness.ts                                   |   3 +    texts for document_not_accessible, provider_quota_exhausted
 src/rest.ts                                        | 152 +++-  R6, R0 label, R7, R1–R5 for any id, R8; R1–R5 delegate
 src/work-context-cache.ts                          | 176 +++++ new: BrowseCache (LRU/TTL, scope partitions, serialization)
 src/work-context-service.ts                        | 334 ++++-  documents/workspaces/parts/extended preview, error mapping
 src/work-context.ts                                | 371 +++++  pure projections and views for §11.3
 tests/fixtures/work-context/README.md              |   5 +    describes the new recorded-shape fixtures
 tests/fixtures/work-context/documents-search.json  |  12 +    R6 page (folder, trash, bad label, owner/permission fields)
 tests/fixtures/work-context/parts-fasteners.json   |   4 +    R4 of a non-bound studio with part numbers
 tests/fixtures/work-context/workspaces-browse.json |   5 +    R7 with a non-Primary workspace
 tests/mcp-readiness.test.mjs                       |   3 +    exact action list gains the three actions
 tests/work-context.test.mjs                        | 762 ++++- generalized fake REST; W11/§4 adjusted; W12–W18, B6, cache unit
```

## Checks

| Command | Result |
|---|---|
| `npm ci` | pass |
| `npm run typecheck` | pass |
| `npm test` | pass: 227 tests, 227 pass, 0 fail (baseline 217, 216 pass) |
| `npm run test:native-files` | pass (`status: PASS`) |
| `npm pack --dry-run` | pass: 206 files, 545.5 kB; `dist/work-context-cache.js` included; no `state/`, `*.tgz`, `.env` |
| `npx biome ci` | pass: 72 files, no fixes |

## Acceptance criteria

| # | Result | Evidence |
|---|---|---|
| B1 | met | `W12 documents: … equals document-page.json`, `W13 workspaces: … equals workspace-list.json` and `W14 parts: … equals part-search.json` compare the views from recorded-shape responses with `deepEqual` |
| B2 | met | W14 checks the first-reason order for every case: `document_not_provisioned` (non-bound document), `candidate_inspection_only` (goal Candidate), `workspace_inspection_only` (other workspace), `element_not_provisioned`, `configuration_unsupported` before `part_kind_unsupported`. W16 adopts every non-selectable hit from three searches (≥ 5 adopts) and gets `selection_target_not_allowed` with the record file byte-identical |
| B3 | met | W14: R1 → R2 → R3 (bound studio only) → R4 × studios → R1, all at `/m/{mv}`; an R1 change gives `selection_observation_stale`. W15: preview of a non-bound part and of a non-bound document uses R1 of **that** workspace (stale when it differs; the Primary's revision does not stand in); an R8 Part Studio preview has `partId: null`; an element that is not a Part Studio at `mv` gives `selection_observation_stale` |
| B4 | met | `W17 cache: …`: R6 TTL 60 s and R7 TTL 30 s at the exact boundaries; R2/R3/R4 reused at the same `mv` while R1 is always read; a fresh partition after an authorization change and after reconnect; disconnect gives `reconnect_required` with no cached data served; `live_reads_disabled` likewise; dispose and cleanup clear the cache; 5 concurrent browsing requests → `maxInFlight === 1`; no cache file on disk. `W17 BrowseCache: …`: a superseded scope neither reads nor writes (negative test), entry and byte LRU bounds, oversized values not stored, TTL, a failed read does not block the queue |
| B5 | met | `W18 402 → …`: 12 cases over R6/R7/R1/R2/R4/preview. Each makes exactly one failing provider call (no retry); 429 gives `provider_rate_limited`; the catalog still gives `provider_unavailable` for 402; failures are not cached |
| B6 | met | Every fake REST call is logged with its method and is GET in W12/W15. W15 and W17 assert no record or cache file. `B6 browsing is dashboard-only` checks that `dist/index.js` (agent tools, `onshape_status`) references none of the browsing functions and that the manifest declares no work-context tool. Only the dashboard registers the methods (`mcp-readiness` exact action list) |
| B7 | met | W1–W11 pass. Changes to existing tests: W11 extended to the §11.5 codes and view reasons; the §4 preview test follows §11.2 (see below); `mcp-readiness` exact list |

Changes to existing tests (as the prompt asked, reported here):
- `§4 work-context-preview` asserted `selection_observation_stale` for the non-bound studio
  `abab…`, which is a Part Studio at `mv`. Under §11.2 that preview is allowed, so the test now uses
  an element that is **not** a Part Studio (still `selection_observation_stale`). Its failure cases
  use parts that were not previewed yet, because the earlier successful preview at the same `mv`
  is cached (immutable at `mv`).
- W11 also scans `work-context-cache` and separates returned view reasons from thrown codes.

## Contract deviations and change requests

No deviation from a MUST. Interpretations where §11 is silent, proposed for adoption:

- **CR-15 Default `filter`.** Without `filter`, R6 sends **no** `filter` parameter (provider
  default). `recent`/`mine`/`shared` map to 5/0/2. WC7 should record which documents the provider
  default returns.
- **CR-16 Bound-document label on page 0.** The pinned entry takes `name`/`modifiedAt` from the R6
  page when present. Otherwise it comes from the R0 label read (`GET /documents/{d}`; the 1.0
  `document.json` has no `modifiedAt` → `null`). R0 results of the same connection are cached with
  the R6 TTL.
- **CR-17 `default` role source.** The default workspace of a non-bound document comes from the R6
  listing of the same connection (cached, no extra call), else from one R0 label read.
- **CR-18 `studios` in `PartSearch`.** Lists **all** Part Studios of R2 in provider order, also
  when `elementId` narrows the scan or more than 20 exist. Only scanned studios contribute hits.
  This gives the UI the studio picker as the remedy for `part_search_truncated`.
- **CR-19 R3 in part search.** R3 is read for the bound studio in the bound Primary only, so that
  studio always has `configurationChecked: true`. A configured bound studio is still enumerated
  (default configuration) and its hits carry `configuration_unsupported`.
- **CR-20 Preview details.**
  - Without `documentId` the binding's document is used.
  - A non-bound `documentId` without `workspaceId` gives `invalid_arguments`.
  - An element that is not a Part Studio at `observedMicroversion` gives
    `selection_observation_stale` (as 1.0 for a foreign element).
  - Without `partId`, `preview.partId` is `null`.
  - 403/404 on R1 maps to `document_not_accessible` only for a non-default target. The bound
    Primary keeps its 1.0 read codes; a 402 there now becomes `provider_quota_exhausted`.
  - The preview now also reads R2 at `mv` (cached), to check the element.
- **CR-21 Cache scope and invalidation.** The partition key is `sha256([authorization snapshot,
  bindingKey, sha256(access token)])`. A token refresh therefore also starts a fresh partition
  (conservative; about one refill per hour). The token is read before every cache lookup, so a
  disconnected or read-disabled connection never sees cached data. The `catalog`, `status`,
  `adopt` and `clear` methods do not use the cache and are not serialized (unchanged 1.0
  behaviour).
- **CR-22 `document_not_accessible` scope.** It applies to 403/404 on R7, R1, R2 and the R0 label
  read in the browsing methods. R6 403 stays `provider_forbidden`; R4 403/404 keep their provider
  codes.

## Notes for the UI consumer (Codex team)

- New actions (all `operator.read`):
  - `work-context-documents {query?, offset?, filter?}` → `result.documents`;
  - `work-context-workspaces {documentId}` → `result.workspaces`;
  - `work-context-parts {documentId, workspaceId, query?, elementId?}` → `result.parts`.
- Unknown keys give `invalid_arguments`. `offset` must be a multiple of 20.
- Send document queries from 2 characters on, debounced ≥ 300 ms (§11.4). The backend accepts
  shorter ones.
- `hasMore` follows the provider `next` link. Page 0 always starts with the bound document
  (`bound: true`). When it does not match the query, show it with the "gebunden" label.
- `PartSearch.studios` lists all Part Studios. Narrow a truncated search with `elementId`.
  `hits[].elementId` + `studios[].name` give the studio label.
- A part is `(documentId, workspaceId, elementId, partId)` at `observedMicroversion`. Pass exactly
  those values to `work-context-preview`, and for a non-bound document always pass `workspaceId`.
  Studio preview: omit `partId`; the result has `partId: null` and is a 128×128 PNG.
- Only rows with `selectable: true` / `goalEligible: true` may enable "Auswahl übernehmen". Every
  other row shows "nur ansehen" with its reason.
- New error texts: `document_not_accessible` ("kein Zugriff") and `provider_quota_exhausted`. Also
  handle `provider_rate_limited` (no automatic retry; offer "später erneut") and
  `selection_observation_stale` (reload the search once).
- The backend serializes concurrent browsing calls per connection. Fire-and-forget requests queue
  up rather than fail, so cancel stale searches in the UI.

## Live E2E request

Required (new externally visible gateway methods, changed preview behaviour, new provider reads).

- **Preconditions:** a plugin build from `ea04c3f` or later (e.g. `0.3.0-rc.3`), Engineer with
  `liveReads: true`, `owner-rest` connected with `OAuth2Read`, the `wegwerf-document` binding, the
  reworked selector UI or direct gateway calls.
- **Checks:**
  1. `work-context-documents {query: "weg"}`: the bound document is first, with a name; other
     documents are listed as `document_not_provisioned`; no owner e-mail in the result. Record
     `filter` absent vs `recent`/`mine`/`shared` and the response size (WC7).
  2. `work-context-workspaces` for the bound document and one other document: roles, `readOnly`
     labels, the default workspace (WC8).
  3. `work-context-parts` in the bound Primary with a query matching `Part 1`: the hit `JHD` is
     `selectable: true`; parts in other studios or documents are inspection-only.
  4. `work-context-preview` without `partId` for a studio: a 128 px PNG below 65 000 characters
     (WC9). With `partId` for a non-bound studio: a PNG.
  5. A document id the account cannot read: `document_not_accessible`; record 403 vs 404 (WC10).
  6. `work-context-adopt` with a non-bound hit: `selection_target_not_allowed`, record unchanged.
- **Expected:** GET only, no file other than the existing selection record, no MCP traffic.

## Open points and risks

- WC7–WC11 stay open (live). WC11 (API call accounting) decides whether the TTLs need tuning.
- R6 response size is bounded at 1 MiB and an over-20-item page fails closed
  (`provider_protocol_error`). If the provider ever returns more than `limit` items, this blocks
  browsing (WC7 shows it).
- The cache key uses an access-token hash in memory. The token itself is never stored, logged or
  returned.
- Biome reformatted only lines I added. I ran it per file with `format --write`, and the files were
  `biome ci`-clean before.

## Out-of-scope findings

- `src/rest.ts:361,417,477,785,786,888,907,1007,1014` have lines longer than 120 columns (existing
  code, untouched).
- Untracked files of the Codex team in this shared checkout:
  `docs/product/onshape-selection-2026-10-21/*-v2.*`, `docs/prompts/2026-10-20-approval-v2-writer.md`.
  Not staged, not touched.

## OpenClaw API usage

Nothing new. `api.lifecycle.registerRuntimeLifecycle` (`node_modules/openclaw/dist/types-DuAVdnLS.d.ts`,
`PluginRuntimeLifecycleRegistration` at line 14850: `{id, dispose?, cleanup?}`) was already used by
the dashboard. It now also registers `work-context-browse-cache`. `api.session.controls.registerSessionAction`
is unchanged in shape.

## Commits

- `1689f71` feat: ✨ work-context R6–R8 reads and §11.3 browsing projections
- `ea04c3f` feat: 🔎 work-context browsing gateway methods, cache and W12–W18
- report commit: docs: 📖 report for the work-context browsing backend
