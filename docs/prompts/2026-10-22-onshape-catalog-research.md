---
target-repo: edge-robot/clawonshape
branch: feat/21-work-context-selection
worktree: <workspace>/clawonshape (container: /workspaces/clawonshape)
issue: edge-robot/clawonshape#21
architecture-ref: clawonshape/docs/interface/work-context.md#2-provider-reads-plugin-rest-read-only-existing-oauth-read-authority
contract-version: work-context-1.0.0-draft (amended CR-1–CR-8)
foreign-repo-commit: cc67472   # onshape-mcp (read-only mount; contains the Onshape OpenAPI)
base-commit: f6d8bd7
status: issued
---
# Research: Onshape REST calls for listing documents/workspaces and searching parts

## Goal

Recommend the Onshape REST calls best suited to a work-context selector in which a user can:

1. list the Onshape **documents** they can access, with search and paging;
2. list the **workspaces** of a chosen document (and recognise the protected Primary);
3. **search for parts** within a workspace across all its Part Studios, and ideally across
   documents, by name (and part number if available);
4. show a small thumbnail or preview per part or Part Studio.

This is a **research and recommendation task only**. Do not change production code, contracts or
the UI. The result is the basis for a contract revision by the architect and a UI rework by the
Codex team.

## Why

Live acceptance on 2026-10-22 (plugin 0.3.0-rc.2) worked technically:

- the R1–R5 reads succeeded, so `m/{mv}` worked for configuration and preview;
- the real partId `JHD` was returned.

The user still rejected the workflow as not intuitive. Two reasons:

- Document selection is a single preselected entry, because increment 1 restricts it to the bound
  document.
- Part selection only works inside the one bound Part Studio, and searching is limited to the
  loaded list.

The user wants real listing of documents and workspaces and a search for parts in them.

## Context

- Current contract: `docs/interface/work-context.md` §1 (increment-1 bounds) and §2 (R0–R5).
- Current code: `src/rest.ts` (R0–R5 and the read limits), `src/work-context.ts`,
  `src/work-context-service.ts`.
- Onshape OpenAPI (version 1.222.x): `/workspaces/onshape-mcp/crates/onshape-mcp-io/onshape-openapi.json`.
- Official guides: https://onshape-public.github.io/docs/ (API intro, Documents, Part Studios,
  Parts, Thumbnails, Associativity, rate limits). Use WebFetch if it is available to you. Mark
  anything you could not verify as **unverified**.
- Candidates the architect already found in the OpenAPI (verify and compare; do not assume they are
  right):
  - `GET /documents` (`getDocuments`, query `q`, `filter`, `owner`, `ownerType`, `sortColumn`,
    `sortOrder`, `offset`, `limit`);
  - `GET /documents/d/{did}/workspaces` (`getDocumentWorkspaces`);
  - `GET /documents/d/{did}/{wvm}/{wvmid}/elements?elementType=PARTSTUDIO`;
  - `GET /parts/d/{did}/{wvm}/{wvmid}` (`getPartsWMV`). This covers **all parts of a workspace in one
    call**, across Part Studios, with `elementId` per part.
  - `GET /parts/d/{did}/{wvm}/{wvmid}/e/{eid}` (`getPartsWMVE`);
  - thumbnails endpoints;
  - any global search endpoint (for example `/search`, `/globaltreenodes`, `/documents/search`), if
    it exists.

## Binding constraints

- No live provider calls: the devcontainer has no credentials, by design. Work from the OpenAPI,
  the official documentation and the recorded fixtures.
- Do not edit `src/**`, `ui/**`, `docs/interface/**`, `docs/ADR.md`, `spec.md` or tests. The only
  new file is the report. You may add a small analysis script under the scratch area of your
  container, but do not commit it.
- Keep authority in view. Listing documents beyond the binding is a **read** with the existing
  OAuth read scope. It does **not** make those documents goal-eligible: the MCP target bounds are
  static (G3, edge-robot/clawonshape#3). Your recommendation must say how the selector can show
  non-eligible documents and parts truthfully, for example as inspection-only.

## Steps

1. For each of the four needs, list every candidate call, with:
   - method, path and API version;
   - key query parameters, paging and sorting;
   - the response fields relevant to the selector (IDs, names, part numbers, element and Part Studio
     grouping, `isHidden`, `bodyType`, microversion, thumbnail links);
   - whether `m/{mv}` (revision pinning) is supported;
   - the OAuth scope needed;
   - known limits (page size, rate limits, response size).
2. Compare the alternatives and recommend one call, or a combination, per need. Include:
   - the expected number of calls for a typical interaction (open dialog, type a search, select a
     document, select a workspace, search parts, preview);
   - caching and invalidation (`modifiedAt`, microversion);
   - server-side vs. client-side filtering.
3. Search across documents: state clearly whether Onshape offers a server-side part search across
   documents. If not, propose the cheapest acceptable approach. For example: search documents by
   name with `q`, then load parts with one `getPartsWMV` per chosen workspace. Say why.
4. Describe the identity and revision handling for each recommended call:
   - pinning via `m/{mv}`;
   - partId stability;
   - same-name parts.
5. Draft a **proposed contract delta** (as a change request, not an edit). Cover:
   - new or changed gateway methods (for example paged `work-context-documents`,
     `work-context-workspaces`, and `work-context-parts` with `query`);
   - response views;
   - eligibility flags and reasons for non-bound documents, workspaces and studios;
   - limits;
   - error codes.
   Keep the hard rules of §5 (adoption recheck, interlock, CAS, no writes) unchanged.
6. List open points that need a live check, and the exact read that would settle each one.

## Acceptance criteria

| # | Criterion |
|---|---|
| R1 | Every recommended call is cited with OpenAPI `operationId` and path (and doc URL where used) |
| R2 | One recommendation per need with call counts and caching |
| R3 | Clear statement on cross-document part search (exists / does not exist / unverified) |
| R4 | Authority and eligibility handling for non-bound resources is explicit |
| R5 | Proposed contract delta as CR-n entries, implementable without new rights |
| R6 | No file changes besides the report |

## Branch and worktree rules

Work on `feat/21-work-context-selection` in `/workspaces/clawonshape`. Commit only the report, with
the trailers:

- `Refs: edge-robot/clawonshape#21`
- `Prompt: docs/prompts/2026-10-22-onshape-catalog-research.md`
- `Agent: ts-plugin-dev`
- `Co-Authored-By`

Author `Albert Kos <kickban3000@gmail.com>`. Never push. No new branches, worktrees or stashes.

## Expected report / handoff format

`docs/prompts/2026-10-22-onshape-catalog-research.report.md` with frontmatter `status`,
`contract-version: work-context-1.0.0-draft` and `e2e-request: none`. Sections:

- summary recommendation (one table: need → call(s) → why);
- detailed comparison per need;
- the cross-document search finding;
- identity and revision handling;
- proposed contract delta as CR-n;
- open live checks;
- sources.
