---
prompt: docs/prompts/2026-10-22-onshape-catalog-research.md
branch: feat/21-work-context-selection
commits: bdce0ef..HEAD (one report-only commit on top of the prompt commit bdce0ef)
status: done
contract-version: work-context-1.0.0-draft
e2e-request: none
---
# Report: Onshape REST calls for document/workspace listing and part search

Research only. No production code, contract, fixture, UI or test was changed (`e2e-request: none`:
nothing deployable changed; the live checks in §6 are read-only probes the architect can run).
The analysis script `ops.mjs`/`op.mjs` lived only in the container scratch area and is not committed.

Preconditions checked: `CLAUDE_DEVCONTAINER=1`; branch `feat/21-work-context-selection`; HEAD
`bdce0ef` = base `f6d8bd7` + the prompt commit; `onshape-mcp` at `cc67472e3dd0…`;
`docs/interface/work-context.md` at `work-context-1.0.0-draft` (amended CR-1–CR-8).

**Source discrepancy:** the prompt names OpenAPI version 1.222.x. The file at
`/workspaces/onshape-mcp/crates/onshape-mcp-io/onshape-openapi.json` reports
`info.version = 1.216.80836-7d2542b69551`, `servers[0].url = https://cad.onshape.com/api/v16`.
All OpenAPI statements below refer to **1.216.80836**. The plugin uses `/api/v10/` (`src/rest.ts:12`).
The guides use v10 in their examples. I assume the paths below exist under v10 too; this is
verified live only for R1–R5.

## 1. Summary recommendation

| Need | Recommended call(s) | Why |
|---|---|---|
| N1 List and search documents | `getDocuments`: `GET /api/v10/documents?q=…&filter=…&sortColumn=modifiedAt&sortOrder=desc&offset=…&limit=20` | The only general, `OAuth2Read`, GET-based document search. Name search runs server-side (`q`, case-insensitive). Paging is fixed at ≤ 20 per page. The bound document is always pinned at the top from the binding and needs no listing call. |
| N2 List the workspaces of a document | `getDocumentWorkspaces`: `GET /api/v10/documents/d/{did}/workspaces` (already used as R0 label read) | One call returns every workspace with `id`, `name`, `microversion`, `modifiedAt`, `isReadOnly` and `protectionRule`. "Protected Primary" stays a **plugin** notion (`binding.primaryWorkspaceId`), not a provider flag. |
| N3a Find parts in a workspace across Part Studios | `getCurrentMicroversion` (R1) → `getElementsInDocument` at `m/{mv}`, `elementType=PARTSTUDIO` (R2) → `getPartsWMVE` at `m/{mv}` **per Part Studio** (R4 generalized). The plugin filters by name and part number. **Upgrade path:** if live check L1 shows that `getPartsWMV` (`GET /parts/d/{did}/m/{mv}`) works **without** `elementId`, replace the per-studio loop with that one call. | Pinned to one microversion, so it is immutable and fully cacheable. Response shape and `partId`s are already live-verified (R4, `JHD`). **The OpenAPI marks `elementId` as required on `getPartsWMV`**, which contradicts the prompt's premise, so the one-call path is unverified. |
| N3b Search parts across documents | **No server-side part search exists** in OpenAPI 1.216. Use the N1 document search (`q`), then N2/N3a for the workspace the user chooses. | Cheapest honest approach. A fan-out over all documents is too expensive under the annual API call limits (§3). |
| N4 Thumbnail / preview | Part: `getPartShadedViews` at `m/{mv}` (R5, unchanged; on focus or selection only). Part Studio: `getPartStudioShadedViews` at `m/{mv}` (lazy, one per visible studio). Document tiles: none in the first rework (optional later: `getDocumentThumbnailWithSize`, binary, `w` only). | Shaded views are JSON (base64 PNG), pinnable to `m/{mv}`, and use the existing JSON reader and the 65 000-character limit (CR-3). The `/thumbnails/*` endpoints are `w`/`v` only, return `image/*` (would need a new binary reader), and `withThumbnails` is "not supported for microversion". |

Typical interaction (inside the bound document, P = number of Part Studios, cache cold):

| Step | Provider calls | Cached afterwards |
|---|---|---|
| Open dialog | 1 (`getDocuments` first page) + the existing catalog for the bound document (R0 2 + R1 1 + R2 1 + R3 1 + R4 1 + R1 recheck 1 = 7) | document page 60 s; bound catalog at `mv` forever (LRU) |
| Type a document search (debounced, ≥ 2 chars) | 1 per committed query, +1 per "more" (20 per page) | per `(q, filter, offset)` 60 s |
| Select a document | 1 (`getDocumentWorkspaces`) | 30 s |
| Select a workspace | 2 (R1 + R2 at `m/{mv}`) | R2 at `mv` forever |
| Search parts in that workspace | first query: P (`getPartsWMVE` per studio) + 1 (R1 recheck); later keystrokes: **0** (filtering in the plugin over cached `mv` data); with L1 passing: 1 + 1 | parts per `(did, mv, eid)` forever |
| Preview a part | 1 (R5) | per `(did, mv, eid, partId, size)` forever |

## 2. Detailed comparison per need

Common to every call below: OpenAPI `security` = `OAuth2Read` (the plugin already holds it,
evidence 2026-10-22: `owner-rest` connected with `OAuth2Read`, `OAuth2Write`), all are `GET`,
`x-BTVisibility: PRODUCTION`. Rate limits: per-endpoint thresholds are not published.
A 429 response carries `Retry-After` and `X-Rate-Limit-Remaining`. Annual call caps apply
per company (Professional 5 000 per user, Enterprise 10 000 per user, Free/Standard 2 500).
2xx/3xx calls from private OAuth apps count; 4xx/5xx do not; 402 means the cap is reached
([limits](https://onshape-public.github.io/docs/auth/limits/),
[response codes](https://onshape-public.github.io/docs/api-adv/errors/)). ⚠️ Whether the ClawOnshape
OAuth app counts as private (counted) is **unverified**. I assume it does, which makes call count the
dominant cost.

### N1: list and search documents

| Candidate | operationId, path | Paging / sorting | Relevant response fields | `m/{mv}` | Assessment |
|---|---|---|---|---|---|
| **A (recommended)** | `getDocuments` `GET /documents` | `offset` ≥ 0, `limit` 1..**20** (max), `next`/`previous` URLs; `sortColumn` `name\|modifiedAt\|createdAt\|email\|modifiedBy\|promotedAt`, `sortOrder` `asc\|desc`; `q` name contains (case-insensitive); `filter` `0 My Documents\|1 Created\|2 Shared\|3 Trash\|4 Public\|5 Recent\|6 By Owner\|7 By Company\|9 By Team`; also `owner`, `ownerType`, `label`, `project`, `parentId` | `BTGlobalTreeNodeListResponse{items, next, previous, href}`. `items[]` is polymorphic by `jsonType` (`document-summary`, `folder`, `project`, …). For `document-summary`: `id`, `name`, `modifiedAt`, `owner.name`, `defaultWorkspace{id,name,microversion}`, `thumbnail{href,sizes[]}`, `permission` (`NOACCESS…OWNER`), `trash`, `public` | n/a (no revision) | One GET per 20 hits, server-side name match; the guide says best matches come first ([documents guide](https://onshape-public.github.io/docs/api-adv/documents/)). |
| B | `search` `POST /documents/search` | body: `rawQuery`, `documentFilter`, `foundIn` `ALL\|WORKSPACES\|VERSIONS`, `when` `ALL\|LATEST\|LATEST_PER_HIT`, `offset`, `limit` ≤ 20 | **untyped** (`{type: object}`) | n/a | POST, untyped response, description says "in the name" like A. Rejected: no extra value shown, and a POST on the read path breaks the plugin's "reads are GET" rule (work-context §2 avoids even `idtranslations`). |
| C | `getDocumentsByName` `GET /companies/{cid}/documentsbyname` | none | `BTGlobalTreeNodeSummaryInfo[]` | n/a | Rejected: "can only be called by company admins", exact name only. |
| — | `/globaltreenodes/*` | — | — | — | **Not present** in OpenAPI 1.216. |

Server- vs client-side: `q` is server-side. Item-kind filtering (`jsonType = "document-summary"`,
`trash = false`) is plugin-side. The plugin MUST drop non-document items and MUST NOT expose `owner`
e-mail or `permissionSet`; only `id`, `name`, `modifiedAt`, `owner.name` (optional) and
`defaultWorkspace.id` reach the view.

Caching: no revision handle exists, so cache in memory only for `(connection, q, filter, sort, offset)`
with a 60 s TTL. Drop the cache on authorization or binding change, disconnect, or explicit
"refresh". Do not persist it. `modifiedAt` is a display hint, not an invalidation key.

Response size: 20 rich summary items. I expect them to stay well below the existing 1 MiB read limit
(⚠️ unverified, L3).

### N2: list the workspaces of a document

| Candidate | operationId, path | Relevant fields | `m/{mv}` | Assessment |
|---|---|---|---|---|
| **A (recommended)** | `getDocumentWorkspaces` `GET /documents/d/{did}/workspaces` (already R0, CR-1) | `BTWorkspaceInfo[]`: `id`, `documentId`, `name`, `microversion`, `modifiedAt`, `isReadOnly`, `protectionRule` (`OPEN\|MERGE\|FAST_FORWARD_MERGE`), `type`, `parent`, `thumbnail` | n/a | Not paged. The existing `> 1000 → provider_protocol_error` guard (`src/rest.ts:508`) stays. |
| B | `getDocument` `GET /documents/{did}` | `defaultWorkspace{id,name,microversion}` | n/a | Only the default ("Main") workspace. A label/fallback source, not a list. |

Recognising the protected Primary: Onshape has no "Primary" concept. In the **bound** document
the Primary is `binding.primaryWorkspaceId`, exactly as today. In a **non-bound** document no
workspace is a Primary, so every workspace is inspection-only. The provider fields
`protectionRule`/`isReadOnly` and `defaultWorkspace.id` MAY be shown as labels ("Standard",
"schreibgeschützt") but MUST NOT decide eligibility. Their exact semantics are ⚠️ unverified (L4).

`workspaces[].microversion` could save an R1 per workspace in the list. It MUST NOT replace R1
as the fence, because it is a different endpoint and its freshness is unverified (L4).

### N3a: parts in one workspace, across Part Studios

| Candidate | operationId, path | Key params | Relevant response fields | `m/{mv}` | Assessment |
|---|---|---|---|---|---|
| **A (recommended)** | `getPartsWMVE` `GET /parts/d/{did}/{wvm}/{wvmid}/e/{eid}` (R4 today) | `withThumbnails` ("not supported for microversion"), `includeFlatParts`, `configuration`, `includePropertyDefaults` | `BTPartMetadataInfo[]`: `partId`, `name`, `partNumber`, `elementId`, `bodyType`, `isHidden`, `isMesh`, `isFlattenedBody`, `microversionId`, `partIdentity`, `configurationId`, `thumbnailInfo`, `revision`, `state` | **yes**, live-verified (L1 2026-10-22) | One call per Part Studio. Bounded and immutable at `mv`. |
| B (upgrade if L1 passes) | `getPartsWMV` `GET /parts/d/{did}/{wvm}/{wvmid}` | **`elementId` (query, `required: true`** in OpenAPI 1.216, "The id of the element in which to perform the operation"), others as A | same `BTPartMetadataInfo[]` incl. `elementId` per part | `wvm` enum includes `m` | ⚠️ **Contradiction:** the prompt and the [metadata guide](https://onshape-public.github.io/docs/api-adv/metadata/) describe it as "workspace level", but the OpenAPI requires `elementId`. If it requires `elementId`, it is no better than A. If the server accepts it without, it is the cheapest call (1 per workspace). Settle by L1 before relying on it. |
| C | `getInsertables` `GET /documents/d/{did}/{wv}/{wvid}/insertables?includeParts=true` | `elementId` optional, many `include*` flags, paged via `next` | `BTInsertableInfo[]`: `elementId`, `elementName`, `partName`, `deterministicId`, `bodyType`, `isMesh`, `isFlattenedBody`, `microversionId`, `thumbnailUri` | **no** (`wv` = `w\|v` only) | Workspace-wide, but not pinnable, page size unknown, and `deterministicId = partId` is ⚠️ unverified. Rejected as primary; keep as a fallback only if L1 fails **and** P is large (L5). |
| D | `getWMVEPsMetadata` `GET /metadata/d/{did}/{wvm}/{wvmid}/e/{eid}/p` | `thumbnail`, `includeComputedProperties` | metadata property bags (incl. "Part number") | `wvm` | Per element, heavier than A, and A already carries `partNumber`. Rejected. |
| E | `getWMVEsMetadata` `GET /metadata/d/{did}/{wvm}/{wvmid}/e` | `depth` | element metadata only | `wvm` | No parts. Rejected. |

Studio list: R2 `getElementsInDocument` `GET /documents/d/{did}/m/{mv}/elements?elementType=PARTSTUDIO`
(fields `id`, `name`, `elementType`, `microversionId`, `thumbnailInfo`; `withThumbnails` exists).
Alternative `getDocumentContents` (`…/contents`) adds folders, which are not needed.

Filtering: there is no server-side part-name filter on any parts endpoint. The plugin filters
case-insensitively (NFC-normalized substring) on `name` and `partNumber`. The UI receives
only the bounded result. Kind filters (`bodyType`, `isMesh`, `isFlattenedBody`) are plugin-side,
as today. Do not pass `includeFlatParts` (flattened sheet-metal bodies stay excluded).

Configured Part Studios: without `configuration` the default configuration is returned. For
non-bound studios the R3 configuration check costs one more call each, so in the search result
these studios carry `configurationChecked: false` and are inspection-only anyway (see CR-11).

Limits: keep `PART_LIMIT = 500` per studio and the 4 MiB R4 read limit (`src/rest.ts:576`).
New: at most `STUDIO_SCAN_LIMIT = 20` Part Studios per workspace search, and at most 100 search hits
returned. Beyond either, `truncated: true` with the reason.

### N3b: cross-document part search: see §3.

### N4: thumbnails and previews

| Candidate | operationId, path | `m/{mv}` | Format | Assessment |
|---|---|---|---|---|
| **Part (recommended, unchanged R5)** | `getPartShadedViews` `GET /parts/d/{did}/{wvm}/{wvmid}/e/{eid}/partid/{partid}/shadedviews` | yes (WC2 live pass) | JSON `images[]` base64 PNG | Only on focus/selection, 256 px (CR-3). |
| **Part Studio (recommended)** | `getPartStudioShadedViews` `GET /partstudios/d/{did}/{wvm}/{wvmid}/e/{eid}/shadedviews` | yes (`wvm`); used in the codebase at `m` (`src/rest.ts:652`) | JSON base64 | Lazy, one per studio the user expands. Small size (e.g. 128 px). |
| Element thumbnail | `getElementThumbnailWithSize` `GET /thumbnails/d/{did}/{wv}/{wvid}/e/{eid}/s/{sz}` | **no** (`w\|v`) | `image/*` | Not pinned; needs a new binary reader. Deferred. |
| Document thumbnail | `getDocumentThumbnailWithSize` `GET /thumbnails/d/{did}/w/{wid}/s/{sz}`; `getThumbnailForDocument` `GET /thumbnails/d/{did}` (info JSON) | no | `image/*` / JSON | The `thumbnail.sizes[].href` in N1 items needs an authenticated fetch; the browser has no Onshape token, so the plugin would proxy one call per visible tile. Deferred: costs 20 calls per page. |
| `withThumbnails=true` on parts/elements | — | "not supported for microversion" | hrefs | Rejected (same proxy problem, not pinned). |

The thumbnails guide URL (`/docs/api-adv/thumbnails/`) returns 404 and there is no thumbnails guide
in the navigation, so N4 rests on the OpenAPI and the live WC2 result only.

## 3. Cross-document part search: finding

**Does not exist** (as a server-side part search) in OpenAPI 1.216.80836. Evidence: no operation
whose path or `operationId` matches `search`, `globaltreenodes` or `magic` except
`POST /documents/search`. Its body documents `rawQuery` as "Search for documents that contain the
given string in the name" and its response is untyped. The parts endpoints all need a document and
a `wvm` id (and, per OpenAPI, an `elementId`). `getRevisionByPartNumber`/`enumerateRevisions` cover
**released revisions** in a company (release management), not workspace parts. The guides mention
no part search. ⚠️ Whether `POST /documents/search` with `foundIn` matches part/tab names
(as the Onshape web search may) is **unverified** (L6). Even if it does, I recommend against it
(POST, untyped, rule break).

Cheapest acceptable approach: **document-first search.** The user searches documents by name (`q`,
1 call per 20 hits), picks a document and workspace (2–3 calls), then searches parts there
(P+1 calls cold, 0 warm). Why: a real "all parts everywhere" search would need for every document
`getDocumentWorkspaces` + R1 + R2 + P × `getPartsWMVE`, which is ≥ 4 calls per document. For an
account with 100 documents that is ≥ 400 calls per search, close to a tenth of a Professional
user's **annual** cap, plus 429 exposure. A bounded variant ("search parts in the 5 most recently
modified documents") is possible later but is a product decision, not recommended now.

## 4. Identity and revision handling

| Call | Pinning | Identity rules |
|---|---|---|
| N1 `getDocuments` | none | `documentId` (24-hex) is the identity; `name` is a label (nullable, CR-2 style). |
| N2 `getDocumentWorkspaces` | none | `workspaceId` (24-hex). Eligibility from the binding only. |
| R1 `getCurrentMicroversion` | defines `mv` | `mv` is the revision handle for everything after it. Read again after the last R2/R4 of a request; a change → `selection_observation_stale` (unchanged rule, now per workspace). |
| R2 `getElementsInDocument` at `m/{mv}` | yes | `elementId` (24-hex) + `elementType = PARTSTUDIO`. |
| N3a `getPartsWMVE` at `m/{mv}` | yes | A part is identified by **`(documentId, elementId, partId)` at `mv`**. `partId` is only unique within one Part Studio and one microversion. It is not a persistent ID: the associativity guide says "Onshape does not expose a persistent ID … When the model changes, the ID may change", and shows `JHD` → `SPLIT` / `FAILED_TO_RESOLVE` ([associativity](https://onshape-public.github.io/docs/api-adv/associativity/)). Keep the increment-1 rule: re-find the same `partId` at the later `mv`; missing blocks. `partIdentity` is opaque (⚠️ unverified semantics, not identity). `partNumber` is user metadata: not unique, may be empty, label only. Equal `partId`s in two workspaces of the same document MUST NOT be treated as the same part (⚠️ unverified, L7). |
| R5 / studio shaded views at `m/{mv}` | yes | Cache key `(did, mv, eid, partId?, size)`. |

Same-name parts: inside one studio they are distinguished by `partId` (as today). In workspace
search results the row label is `name · partNumber? · studio name · partId`, sorted by `name`, then
`studioName`, then `partId`. Across documents the document name is part of the result header, because
search runs inside one chosen workspace. The preview is the visual disambiguator.

Caching summary: everything keyed by `mv` is immutable and goes into an in-memory LRU bounded by
entries and bytes (proposal: 64 entries, 8 MiB). Unpinned lists (N1, N2) get short TTLs. **All
caches are dropped** on authorization snapshot change, binding change, disconnect/reconnect or plugin
dispose, so that cached data never outlives the authority that read it. Nothing is persisted.

## 5. Proposed contract delta (change requests; not edited)

Target: `work-context.md` → `work-context-1.1.0-draft` (additive for gateway consumers). §5
(adoption order, interlock, CAS, no writes) is **unchanged**. Adoption stays limited to the
increment-1 bounds (`selection_target_not_allowed` for everything else). No new OAuth scope, no MCP
change, no server contract change (onshape-mcp unaffected). All new reads are GET with
`OAuth2Read` through the existing `RestClient` guard (`operator.read`, authorization snapshot
unchanged before and after, `liveReads` enabled).

**CR-9: Provider reads R6–R8 (§2).**
```diff
+| R6 | Document search | `GET /api/v10/documents?q={q}&filter={f}&sortColumn={c}&sortOrder={o}&offset={n}&limit=20` (`getDocuments`) |
+| R7 | Workspaces of any listed document | `GET /api/v10/documents/d/{d}/workspaces` (`getDocumentWorkspaces`; the R0 read, now for any `d`) |
+| R8 | Part Studio preview | `GET /api/v10/partstudios/d/{d}/m/{mv}/e/{e}/shadedviews` (`getPartStudioShadedViews`), ≤ 128 px |
 | R1/R2/R4/R5 | unchanged requests, but `{d}`, `{w}`, `{e}` MAY be any listed document/workspace/Part Studio for inspection |
```
R6/R7 have no revision. R1 → R2/R4 → R1 stays the fence for every workspace-level read.

**CR-10: Gateway methods (§4).** All `operator.read`, no writes, unknown keys → `invalid_arguments`.

| Action | Input | Result |
|---|---|---|
| `work-context-documents` | `{connectionRef?, query?: string 0..100, offset?: int ≥ 0 multiple of 20, filter?: "recent"\|"mine"\|"shared"}` | `{ok, documents: DocumentPage}` |
| `work-context-workspaces` | `{connectionRef?, documentId}` | `{ok, workspaces: WorkspaceList}` |
| `work-context-parts` | `{connectionRef?, documentId, workspaceId, query?: string 0..100, elementId?}` | `{ok, parts: PartSearch}`. Without `query`, all parts (bounded). With `elementId`, one studio only. |
| `work-context-preview` (changed) | `{connectionRef?, documentId?, workspaceId?, elementId, partId?, observedMicroversion}` | as today. Without `partId` → Part Studio preview (R8). `documentId`/`workspaceId` default to the binding. The "MUST be the bound element" rule is relaxed to "any element of a listed workspace; R1 of **that** workspace equals `observedMicroversion`". |

`work-context-catalog` stays as the bound-document fast path (unchanged, backward compatible).

**CR-11: Views (§6).**
```json
// DocumentPage
{"items": [{"documentId": "24-hex", "name": "string|null", "modifiedAt": "ISO|null",
            "bound": false, "goalEligible": false, "reason": "document_not_provisioned"}],
 "offset": 0, "hasMore": true, "query": "string", "observedAt": 0}
// WorkspaceList
{"documentId": "24-hex", "items": [{"workspaceId": "24-hex", "name": "string|null", "role": "primary|candidate|default|other",
  "readOnly": false, "goalEligible": false, "reason": "workspace_inspection_only"}], "observedAt": 0}
// PartSearch
{"documentId": "24-hex", "workspaceId": "24-hex", "observedMicroversion": "24-hex", "query": "string",
 "studios": [{"elementId": "24-hex", "name": "string|null", "goalEligible": false, "reason": "element_not_provisioned",
              "configurationChecked": false}],
 "hits": [{"elementId": "24-hex", "partId": "string", "name": "string", "partNumber": "string|null",
           "bodyType": "solid", "hidden": false, "selectable": false, "reason": "document_not_provisioned"}],
 "truncated": false, "truncatedReason": null, "observedAt": 0}
```
Rules: the bound document is always `items[0]` with `bound: true`. On page 0 it is shown even if
it does not match `query`; then it is labelled "gebunden". Other entries are de-duplicated against it.
`hits` are sorted by `name`, `studio name`, `partId`. `selectable: true` only when document,
workspace and element are the binding's, the element has no configuration (R3), and the part kind
is supported. Otherwise `selectable: false` with the **first** failing reason in this order:
`document_not_provisioned`, `workspace_inspection_only` / `candidate_inspection_only`,
`element_not_provisioned`, `configuration_unsupported`, `part_kind_unsupported`.

UI contract (truthful display): non-eligible rows are listed, browsable and previewable, carry a
visible badge "nur ansehen" with the reason text, and "Auswahl übernehmen" is disabled with the
reason. The view never hides that the goal target is fixed to the binding.

**CR-12: Limits.** Document page = 20 (provider max); `query` ≤ 100 chars after trim, NFC;
document search queries < 2 chars are not sent (UI debounce ≥ 300 ms, recommended);
`STUDIO_SCAN_LIMIT = 20` studios per part search; `PART_LIMIT = 500` per studio (unchanged);
≤ 100 hits returned; R6 1 MiB, R7 1 MiB, R4 4 MiB (unchanged); Part Studio preview base64
< 65 000 chars (CR-3 rule). In-memory LRU 64 entries / 8 MiB for `mv`-keyed data, TTL 60 s (R6) and
30 s (R7). Every cache is dropped on authorization/binding change, disconnect or dispose.
At most one provider read in flight per connection for the catalog methods (serialized, no
parallel fan-out), so the plugin does not cause 429 bursts.

**CR-13: Error codes and view reasons (§8).**

| Code | Kind | Meaning |
|---|---|---|
| `document_not_provisioned` | view reason | document is not the bound document; inspection only |
| `workspace_inspection_only` | view reason | non-Primary workspace of the bound document (generalizes `candidate_inspection_only`, which stays for the Candidate row) |
| `document_not_accessible` | error | R7/R1/R2 returned 403/404 for a non-bound document (mapped from `provider_forbidden` / `provider_not_found` only for these methods) |
| `provider_quota_exhausted` | error | provider returned 402 (annual API limit). Today it falls into `provider_unavailable` (`src/http.ts:15`); separating it helps the operator. |
| `part_search_truncated` | view `truncatedReason` | studio or hit limit reached; the UI asks for a narrower query |

Reused: `invalid_arguments`, `provider_rate_limited` (429; no automatic retry, no `Retry-After`
loop; the UI shows "später erneut"), `provider_protocol_error`, `selection_observation_stale`,
`live_reads_disabled`, `reconnect_required`, `authorization_changed`.

**CR-14: Agent projection.** The new methods are dashboard-only. `onshape_status` and the Lead
projection do not expose document lists or search results (data minimisation: account-wide
document names stay out of agent context). §6.3 is unchanged.

Additive/breaking: additive for the UI and the Engineer. **Behaviour change** in
`work-context-preview` (relaxed element rule) needs W-test updates. No change for onshape-mcp.

## 6. Open live checks

Each check is a single authenticated GET by the architect through Clawake (the plugin has no live
access here). Use the `wegwerf-document` binding from 2026-10-22.

| ID | Question | Exact read that settles it |
|---|---|---|
| L1 | Does `getPartsWMV` work without `elementId`, and at `m`? | `GET /api/v10/parts/d/{d}/m/{mv}` (no query). Expect 200 with parts from all studios (`elementId` per item) → adopt the one-call path; 400 → keep per-studio. Also try `/api/v16/…` to see whether the version matters. |
| L2 | `getDocuments` default and `filter` semantics with `q` | `GET /api/v10/documents?q=wegwerf&limit=20` vs `&filter=0` vs `&filter=5`; record count, `jsonType`s, whether shared documents appear, response bytes. |
| L3 | `getDocuments` page size in bytes | the L2 response length for `limit=20` (bounds the 1 MiB choice). |
| L4 | Workspace fields | `GET /api/v10/documents/d/{d}/workspaces`: values of `protectionRule`, `isReadOnly`, `type`, and whether `microversion` equals R1 right after. |
| L5 | `getInsertables` as fallback | `GET /api/v10/documents/d/{d}/w/{w}/insertables?includeParts=true`: page size, `next`, and whether `deterministicId` equals `partId` (`JHD`). |
| L6 | Does document search match part names? | `GET /api/v10/documents?q=Part%201` (a part name that is not in any document name); `POST /documents/search` only if the architect wants evidence for the rejection. |
| L7 | `partId` across workspaces | after branching a Candidate: R4 on Primary and Candidate at their own `mv`; compare the `partId`s for the same feature (informs the "never equal by id" rule). |
| L8 | `getPartStudioShadedViews` at `m/{mv}` at 128 px | `GET /api/v10/partstudios/d/{d}/m/{mv}/e/{e}/shadedviews?outputWidth=128&outputHeight=128&pixelSize=0&viewMatrix=isometric`, check base64 length < 65 000. |
| L9 | Non-bound document access codes | R7 on a document id the account cannot see: 403 or 404? (fixes the `document_not_accessible` mapping) |
| L10 | API call accounting | whether the ClawOnshape OAuth app is private (counted) and the company plan, from the Onshape developer portal. Sets how strict CR-12 must be. |

---

## Changed files

```
docs/prompts/2026-10-22-onshape-catalog-research.report.md | new (this report)
```

## Checks

No code changed; run because the rules require it before every report.

| Command | Result |
|---|---|
| `npm ci` | pass |
| `npm run typecheck` | pass |
| `npm test` | pass: 217 tests, 217 pass, 0 fail |
| `npm run test:native-files` | pass (`status: PASS`, `powerLossDurability: UNVERIFIED` as before) |
| `npm pack --dry-run` | pass: 199 files, 518.3 kB |
| `npx biome ci` | pass: 71 files checked, no fixes |

## Acceptance criteria

| # | Result | Evidence |
|---|---|---|
| R1 | met | Each recommended call has its `operationId` and path in §1/§2 (`getDocuments`, `getDocumentWorkspaces`, `getCurrentMicroversion`, `getElementsInDocument`, `getPartsWMVE`, `getPartsWMV`, `getPartShadedViews`, `getPartStudioShadedViews`, the rejected alternatives); guide URLs in Sources |
| R2 | met | §1 table and the call-count table; caching per need in §2 and §4 |
| R3 | met | §3: does not exist in OpenAPI 1.216; the content match of `POST /documents/search` is marked unverified (L6) |
| R4 | met | §2 N2, CR-11 (eligibility order, "nur ansehen"), CR-14; adoption unchanged |
| R5 | met | CR-9–CR-14, all `GET`/`OAuth2Read`, no new scope, no MCP change |
| R6 | met | `git show --stat` of the report commit: one file |

## Contract deviations and change requests

No deviation in code. The change requests are CR-9 to CR-14 in §5. They are additive for consumers,
except the relaxed `work-context-preview` element rule (a behaviour change). onshape-mcp is not
affected.

## Live E2E request

None (research only). The read-only probes L1–L10 in §6 should run before the architect fixes
CR-9/CR-10. L1 decides the part-search call count.

## Open points and risks

- **Premise risk:** the prompt's "`getPartsWMV` covers all parts of a workspace in one call"
  contradicts the OpenAPI (`elementId` required). The design works either way (per-studio loop).
- **API call budget:** with an assumed private OAuth app on a Professional plan (5 000 calls per user
  per year), an unbounded selector would use up the budget quickly. CR-12 caching and
  serialization are essential, not optional (L10).
- Exposing account-wide document names in the dashboard to every `operator.read` client is a
  product/authority decision for the architect (CR-14 keeps them away from agents).
- The OpenAPI version differs from the prompt (1.216 vs 1.222.x), and the spec's server URL is
  v16 while the plugin uses v10.

## Out-of-scope findings

- `src/http.ts:15`: HTTP 402 (API limit reached) maps to `provider_unavailable`, indistinguishable
  from a 5xx outage. Proposed `provider_quota_exhausted` in CR-13; not fixed.
- `docs/evidence/2026-10-22-work-context-live-acceptance.md` is untracked in the shared checkout
  (not mine; left untouched).

## Sources

- OpenAPI `onshape-openapi.json` 1.216.80836 (onshape-mcp @ `cc67472`): operations listed above,
  schemas `BTGlobalTreeNodeListResponse`, `BTGlobalTreeNodeInfo` (discriminator `jsonType`),
  `BTWorkspaceInfo`, `BTWorkspaceProtectionRuleOptions`, `BTDocumentElementInfo`,
  `BTPartMetadataInfo`, `BTInsertablesListResponse`, `BTInsertableInfo`, `BTShadedViewsInfo`,
  `BTThumbnailInfo`, `BTOldPermission`, `BTESVersionWorkspaceChoice`, `BTESResultsFilter`.
- https://onshape-public.github.io/docs/api-adv/documents/ (`getDocuments` example, ranking, v10)
- https://onshape-public.github.io/docs/api-adv/metadata/ (getPartsWMV described as workspace level;
  "Part number")
- https://onshape-public.github.io/docs/api-adv/associativity/ (no persistent IDs; SPLIT/FAILED_TO_RESOLVE)
- https://onshape-public.github.io/docs/auth/limits/ (annual caps, what counts, 402)
- https://onshape-public.github.io/docs/api-adv/errors/ (429 `Retry-After`, `X-Rate-Limit-Remaining`)
- https://onshape-public.github.io/docs/api-adv/partstudios/ (no parts-listing content)
- `/docs/api-adv/thumbnails/`: 404; no thumbnails guide exists in the navigation.
- Live evidence `docs/evidence/2026-10-22-work-context-live-acceptance.md` (WC1–WC3, `JHD`).
- Code: `src/rest.ts:12,170,508,556,576,599,652`, `src/http.ts:1-70`, `src/work-context.ts:9-10`,
  `src/work-context-service.ts:28`.
