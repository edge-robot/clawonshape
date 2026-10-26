---
target-repo: edge-robot/clawonshape
branch: feat/21-work-context-selection
worktree: /home/kaos/Projects/01_pib/02_sw/clawonshape (container: /workspaces/clawonshape)
issue: edge-robot/clawonshape#22
architecture-ref: clawonshape/docs/interface/work-context.md#12-robust-part-search-and-rest-call-accounting-work-context-120-draft
contract-version: work-context-1.2.0-draft
foreign-repo-commit: cc67472   # onshape-mcp (read-only mount); no server change
base-commit: 42f438d
status: superseded   # interrupted 2026-10-26 (devcontainer died); narrowed to docs/prompts/2026-10-26-closure-call-cost-baseline.md at project closure; §12 implementation deferred (#22 open)
---
# Robust part search and REST call accounting (#22, contract 1.2.0)

## Goal

Implement `docs/interface/work-context.md` §12 (`work-context-1.2.0-draft`):

- the per-studio scan status;
- R4 entry tolerance;
- `provider_response_too_large` with the 16 MiB R4 limit;
- the quota rules: scan limit 10 with the bound studio first, negative cache, stop on 402/429;
- REST call accounting with log lines;
- payload-free diagnostics;
- the measured call-cost table;
- tests W19–W24.

## Why (live finding, 2026-10-26)

Plugin 0.3.0-rc.3 is deployed. In the Engineer dashboard, part search in a large real document
failed as a whole with `provider_protocol_error`. Nobody can tell whether the cause was:

- an R4 response above 4 MiB;
- one invalid part entry;
- invalid JSON.

During the same short session the Onshape usage counter rose from 688 to 800 calls. The plan cap is
**2,500 API calls per year**. The plugin cannot attribute calls to actions.

Evidence: `docs/evidence/2026-10-26-selector-v2-and-goal-live-acceptance.md` (F2).

## Context

- Contract §12 is normative. §11.8 CR-15–CR-22 and the 1.0 CRs stay valid, except CR-2 for R4
  entries.
- Fixtures: `docs/interface/work-context-fixtures/part-search.json` (new fields),
  `part-search-partial.json` (new) and `error-codes.json` (new code).
- Code:
  - `src/rest.ts`: `get`, `partsResponse`, R1–R8;
  - `src/http.ts`: `jsonRequest`, byte limit, `ProviderHttpError`;
  - `src/work-context.ts`: `projectPartRows`, `PART_*` limits;
  - `src/work-context-service.ts`: `workContextParts`, `browseRead`, `STUDIO_SCAN_LIMIT`, the
    catalog/status/adopt R4 paths;
  - `src/work-context-cache.ts`;
  - the other REST callers: cockpit, inspection, render, goal, OAuth.
- The UI (`ui/**`) belongs to the Codex team. Do not edit it. The UI follow-up for `scan` states is
  issued after your report.

## Binding constraints and prohibitions

- Contract-first. Do not edit `docs/interface/**`, `docs/ADR.md`, `spec.md`, `tests/contract/**`,
  `ui/**`, `tests/cockpit*`, `scripts/test-cockpit-browser.mjs` or `docs/product/**`. On a contract
  problem: `status: blocked` plus CR-n in the report.
- **No new provider reads.**
  - The number of calls of any existing action MUST NOT increase.
  - No read may be added to page load, focus, visibility, timers or polling.
  - Report every action whose count changes, with old → new.
- Logs contain no IDs, names, tokens, query strings, response values or e-mail. They contain only
  route templates, counts, check names, field names, entry indices and byte counts.
- The counter is in memory only. Nothing is persisted, and nothing is exposed to agent tools.
- Adoption bounds (§1), interlock, CAS and the goal hand-off are unchanged. W1–W18 stay green; where
  §12 changes behaviour (scan limit, oversize code, entry tolerance), update the test and list it in
  the report.
- No new runtime dependencies. Do not touch `Containerfile`, `.devcontainer/`, `scripts/dev.sh`,
  `.claude/` or `deploy/`.
- Work only on `feat/21-work-context-selection` in `/workspaces/clawonshape`. No new branches,
  worktrees or stashes. Never push.
- No live Onshape calls. Tests use recorded-shape fixtures with synthetic IDs.

## Steps

1. Verify the branch, HEAD (`42f438d` or later) and the contract header (`work-context-1.2.0-draft`).
   Record the baseline checks.
2. **Measure first.**
   - Add a fetch-counting test harness.
   - Record today's call counts (cold / warm cache) for every §12.6 action **before** changing
     behaviour.
   - Also record what the cockpit dashboard load triggers on the server side: which gateway methods
     the current UI calls on load, and their reads. Read `ui/control-ui.js`, but do not edit it.
3. `src/http.ts` / `src/rest.ts`:
   - a distinct oversize error → `provider_response_too_large`, while existing non-browsing callers
     keep their observable codes unless §12.3 says otherwise; say which callers changed;
   - the R4 limit at 16 MiB with an early abort;
   - one call counter around every Onshape and OAuth request, with route templating per §12.5.
4. `src/work-context.ts`: entry tolerance in `projectPartRows` (skip and count per field), and
   response-level errors per §12.2.
5. `src/work-context-service.ts` / `src/work-context-cache.ts`:
   - per-studio `scan` / `scanError` / `skippedEntries` / `failedStudios`;
   - search-wide versus studio-local codes;
   - scan limit 10 with the bound studio first;
   - negative cache;
   - the 402/429 stop, including rejecting queued reads without dispatch.
6. Logging per §12.5 through the plugin logger: one `rest-calls` line per gateway method or tool
   invocation, and `provider-check` lines.
7. Tests W19–W24. Extend W14 for the new fields (`part-search.json`) and W11 for the new code.
8. Measure again, and fill the call-cost table in the report (before / after, cold / warm).

## Acceptance criteria and tests

| # | Criterion | Evidence |
|---|---|---|
| R1 | Failed studio is local; other hits are returned; view equals `part-search-partial.json` | W19 |
| R2 | Invalid entries are skipped and counted; adoption of a skipped part is impossible | W20 |
| R3 | Oversize is distinct, aborts early at 16 MiB, and is search-wide for R6/R7/R2 | W21 |
| R4 | Negative cache and the 402/429 stop; no extra calls | W22, W23 |
| R5 | Accounting and diagnostics lines carry no payload; budgets are asserted | W24 + sample log lines in the report |
| R6 | No action makes more calls than before; the call-cost table is complete | before/after table |
| R7 | W1–W18 green, with changed tests listed; typecheck, `npm test` and `biome ci` pass | checks table |

## Branch and worktree rules

Commit on `feat/21-work-context-selection` only, in small logical commits. Each commit has:

- author `Albert Kos <kickban3000@gmail.com>`;
- the trailers `Refs: edge-robot/clawonshape#22`,
  `Prompt: docs/prompts/2026-10-26-robust-part-search-call-accounting.md`, `Agent: ts-plugin-dev`
  and `Co-Authored-By`.

Never push. Leave the working tree clean except for files you do not own.

## Expected report / handoff format

Write `docs/prompts/2026-10-26-robust-part-search-call-accounting.report.md` with frontmatter:

- `status`;
- `contract-version: work-context-1.2.0-draft`;
- `e2e-request: required`.

Include:

- the checks table;
- R1–R7 with test names;
- the call-cost table (before / after, cold / warm);
- what the dashboard load triggers;
- changed callers for the oversize code;
- sample log lines;
- changed files;
- changed existing tests;
- CRs;
- notes for the UI consumer (`scan` states, `failedStudios`, new code text);
- the commit list.
