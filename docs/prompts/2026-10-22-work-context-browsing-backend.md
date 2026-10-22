---
target-repo: edge-robot/clawonshape
branch: feat/21-work-context-selection
worktree: /home/kaos/Projects/01_pib/02_sw/clawonshape (container: /workspaces/clawonshape)
issue: edge-robot/clawonshape#21
architecture-ref: clawonshape/docs/interface/work-context.md#11-browsing-documents-workspaces-and-part-search-work-context-110-draft
contract-version: work-context-1.1.0-draft
foreign-repo-commit: cc67472   # onshape-mcp (read-only mount); no server change
base-commit: 9b535e4
status: issued
---
# Work-context browsing backend: documents, workspaces, part search (#21, contract 1.1.0)

## Goal

Implement `docs/interface/work-context.md` §11 (`work-context-1.1.0-draft`):

- reads R6–R8;
- the gateway methods `work-context-documents`, `work-context-workspaces`, `work-context-parts`
  and the extended `work-context-preview`;
- the views `DocumentPage`, `WorkspaceList` and `PartSearch`;
- limits, caching and serialization (§11.4);
- the codes of §11.5;
- tests W12–W18.

Everything outside the §1 bounds stays inspection-only, and adoption is unchanged.

## Context

- Contract §11, including the authority paragraph. Your research report is the source:
  `docs/prompts/2026-10-22-onshape-catalog-research.report.md`. CR-9–CR-14 are adopted with these
  changes:
  - `getPartsWMV` is dropped (`elementId` is required in OpenAPI 1.222 as well; the architect
    checked);
  - the preview without `partId` returns the Part Studio preview at 128 px;
  - the hit sort order and the reason order are as written in §11.3.
- Fixtures: `docs/interface/work-context-fixtures/document-page.json`, `workspace-list.json`,
  `part-search.json` and the extended `error-codes.json`.
- Existing code: `src/rest.ts` (R0–R5, limits, `RestClient` guard), `src/work-context.ts`,
  `src/work-context-service.ts`, `src/dashboard.ts`, `src/http.ts` (status code mapping).
- Live status: 0.3.0-rc.2 is deployed. WC1–WC3 pass live. The selector UX is reworked in parallel by
  the Codex team against the same fixtures.

## Binding constraints and prohibitions

- Contract-first. Do not edit `docs/interface/**`, `docs/ADR.md`, `spec.md` or `tests/contract/**`.
  On a contract problem: `status: blocked` plus CR-n in the report.
- **File ownership:** the Codex team owns `ui/**`, `tests/cockpit*`,
  `scripts/test-cockpit-browser.mjs`, `docs/engineering-cockpit.md` and `docs/product/**`. They work
  in parallel in a separate worktree. Do not edit those files.
- GET only, existing `OAuth2Read`. No POST (`/documents/search` stays rejected). No MCP call. No
  cross-document fan-out.
- `work-context-adopt`, `-clear`, `-status`, `-catalog`, the interlock, CAS and the goal hand-off
  must not change in behaviour. W1–W11 stay green unchanged, except where §11.2 explicitly extends
  the preview. Report that change.
- Only `id`, `name`, `modifiedAt` and `defaultWorkspace.id` of R6 items may reach a view. No owner
  e-mail and no permission sets. The new data never reaches `onshape_status` or any agent tool
  (CR-14).
- Caches are in memory only and are dropped on authorization or binding change, disconnect and
  dispose. At most one browsing read in flight per connection. No automatic retry on 429.
- `src/http.ts`: add `provider_quota_exhausted` for 402 **only** in a way that leaves existing
  callers' codes unchanged, or map it inside the work-context methods. Say which you chose.
- No new runtime dependencies. Do not touch `Containerfile`, `.devcontainer/`, `scripts/dev.sh`,
  `.claude/` or `deploy/`.
- Work only on `feat/21-work-context-selection` in `/workspaces/clawonshape`. No new branches,
  worktrees or stashes. Never push.

## Steps

1. Verify branch, HEAD (`9b535e4` or later) and that the contract says `work-context-1.1.0-draft`.
   Record the baseline checks.
2. `src/rest.ts`: R6 (`documents` with `q`, `filter` mapping `recent` → 5, `mine` → 0,
   `shared` → 2, sort by `modifiedAt` desc, `offset`, `limit=20`), R7 for any `d`, R8. Apply the
   existing validation and the size limits of §11.4.
3. `src/work-context.ts`: pure projections for `DocumentPage`, `WorkspaceList` and `PartSearch`:
   - bound document pinned and de-duplicated;
   - non-document and trashed items dropped;
   - roles assigned;
   - NFC substring filter on `name` and `partNumber`;
   - sort order and the eligibility reason order;
   - truncation.
4. `src/work-context-service.ts`: the new methods, with:
   - the per-studio R4 loop with the R1 → R2/R4 → R1 fence per workspace;
   - the LRU/TTL caches;
   - per-connection serialization;
   - the extended preview with the R1 rule of the chosen workspace;
   - `document_not_accessible` for 403/404 on listed documents.
5. `src/dashboard.ts`: register the three actions (`operator.read`, strict input keys) and the
   extended preview input.
6. Tests W12–W18 with recorded-shape responses under `tests/fixtures/work-context/` (synthetic IDs).
   Extend W11 to cover the new codes.

## Acceptance criteria and tests

| # | Criterion | Evidence |
|---|---|---|
| B1 | Views equal `document-page.json`, `workspace-list.json`, `part-search.json` from recorded responses | W12–W14 |
| B2 | Inspection-only is truthful: every non-bound row has the right first reason; adopt outside §1 rejected with the record unchanged | W14, W16 |
| B3 | Revision fence per workspace; preview rule for non-bound parts and studios | W14, W15 |
| B4 | Caches, invalidation and one read in flight | W17 |
| B5 | 402/403/404/429 mapping without retry | W18 |
| B6 | No agent exposure; GET only; no write files | method log + W3-style file-absence check |
| B7 | W1–W11 unchanged and green; typecheck, `npm test`, `biome ci` pass | checks table |

## Branch and worktree rules

Commit on `feat/21-work-context-selection` only, in small logical commits, with:

- the trailers `Refs: edge-robot/clawonshape#21`,
  `Prompt: docs/prompts/2026-10-22-work-context-browsing-backend.md`, `Agent: ts-plugin-dev` and
  `Co-Authored-By`;
- author `Albert Kos <kickban3000@gmail.com>`.

Never push.

## Expected report / handoff format

Write `docs/prompts/2026-10-22-work-context-browsing-backend.report.md` with frontmatter `status`,
`contract-version: work-context-1.1.0-draft` and `e2e-request: required`. Include:

- the checks table;
- B1–B7 with test names;
- your choice for the 402 mapping;
- changed files;
- CRs;
- notes for the UI consumer;
- the commit list.
