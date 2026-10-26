---
target-repo: edge-robot/clawonshape
branch: feat/21-work-context-selection
worktree: /home/kaos/Projects/01_pib/02_sw/clawonshape (container: /workspaces/clawonshape)
issue: edge-robot/clawonshape#22 (narrowed), closure edge-robot/clawonshape#23
architecture-ref: clawonshape/docs/interface/work-context.md#12-robust-part-search-and-rest-call-accounting-work-context-120-draft
contract-version: work-context-1.2.0-draft
foreign-repo-commit: de4ad9d   # onshape-mcp (read-only mount); no server change
base-commit: the commit that adds this prompt
status: done   # accepted 2026-10-26 (report 8e1d40f); W11/W14 red state fixed by the architect (draft-1.2.0 fixtures)
supersedes: docs/prompts/2026-10-26-robust-part-search-call-accounting.md (interrupted; §12 implementation deferred)
---
# Closure K2: call-cost baseline of the deployed behaviour (#22, narrowed)

## Goal

Measure the number of Onshape provider calls of every dashboard action **as deployed** (plugin
0.3.0-rc.3, no behaviour change), and secure the measurement as offline tests. The numbers feed:

- the closure decision ADR-2026-10-26 (`docs/ADR.md`);
- the final presentation.

The rest of §12 (per-studio status, entry tolerance, oversize code, quota economy, log lines) is
**deferred**. Do not implement it.

## Context

- The project is closing (`docs/project-closure-2026-10-26.md`, #23). The Onshape plan allows 2,500
  API calls per year. One short dashboard session used 112 calls, and nobody can attribute them.
- Your previous session was interrupted in step 2 of
  `docs/prompts/2026-10-26-robust-part-search-call-accounting.md`. Its devcontainer died; the
  launcher now removes such stale containers. Three files are uncommitted in the working tree, and
  they are yours to resume:
  - `tests/fixtures/work-context-rest.mjs` (new shared fake REST harness);
  - `tests/rest-calls.test.mjs` (new measurement tests);
  - `tests/work-context.test.mjs` (moved helpers into the harness).

  Verify them before you build on them.
- Contract §12.6 lists the actions. §11 and §1–§8 describe the reads.

## Binding constraints and prohibitions

- **Tests and test fixtures only.** No change under `src/**`, `ui/**`, `docs/interface/**`,
  `docs/ADR.md` or `spec.md`. The measured behaviour must be the deployed one (`667f01c` source).
- No live Onshape calls. The fake REST counts every request.
- Do not touch `Containerfile`, `.devcontainer/`, `scripts/dev.sh`, `.claude/` or `deploy/`. No new
  dependencies.
- Work only on `feat/21-work-context-selection`. No branches, worktrees or stashes. Never push.

## Steps

1. Check branch and HEAD. Run `git status`, and confirm that only the three files above are yours.
   Record the baseline: `npm run typecheck`, `npm test`, `npx biome ci .`.
2. Finish the harness. For each action, measure the provider calls with a cold and with a warm
   browsing cache. List the route templates per action (`documents/d/{d}/w/{w}/currentmicroversion`
   and so on). The actions:
   - dashboard load of the Engineer cockpit: list the gateway methods the current
     `ui/control-ui.js` calls on page load and on opening the selector, and measure them; read the
     UI, but do not edit it;
   - `work-context-status`;
   - `work-context-catalog`;
   - document search page;
   - workspace list;
   - part search in the bound Primary with 1, 5 and 21 Part Studios;
   - part search in another document;
   - part preview;
   - studio preview;
   - adopt;
   - clear;
   - a part search that fails at studio k of N (today's behaviour), and its repetition
     ("Erneut laden").
3. Measure the main non-browsing paths the same way, once each:
   - cockpit status;
   - `onshape_status`;
   - `onshape_inspect`;
   - `onshape_render`;
   - goal propose / status / verify, where the plugin itself calls REST.

   If a path cannot be measured offline without production changes, say so.
4. Assert every measured count as an upper bound in `tests/rest-calls.test.mjs`. A future increase
   must then fail.
5. Commit the harness, the refactor and the tests in logical commits.

## Acceptance criteria and tests

| # | Criterion | Evidence |
|---|---|---|
| B1 | Call-cost table complete (cold/warm, route templates) for every action in steps 2–3 | report table |
| B2 | The upper bounds are asserted in tests and pass on the deployed code | test names |
| B3 | No production change; W1–W18 unchanged and green; typecheck, `npm test`, `biome ci` pass | checks table, `git diff --stat 667f01c -- src ui` empty |
| B4 | One paragraph per notable cost driver, e.g. full studio rescan on a new revision or no caching of failures | report |

## Branch and worktree rules

Commit on `feat/21-work-context-selection` only. Each commit has:

- author `Albert Kos <kickban3000@gmail.com>`;
- the trailers `Refs: edge-robot/clawonshape#22`, `Refs: edge-robot/clawonshape#23`,
  `Prompt: docs/prompts/2026-10-26-closure-call-cost-baseline.md`, `Agent: ts-plugin-dev` and
  `Co-Authored-By`.

Never push.

## Expected report / handoff format

Write `docs/prompts/2026-10-26-closure-call-cost-baseline.report.md` with frontmatter `status` and
`e2e-request: none`. Include:

- the checks table;
- B1–B4;
- the call-cost table;
- the cost drivers;
- the paths that could not be measured;
- changed files;
- the commit list.
