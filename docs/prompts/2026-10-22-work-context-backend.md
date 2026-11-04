---
target-repo: edge-robot/clawonshape
branch: feat/21-work-context-selection
worktree: <workspace>/clawonshape (container: /workspaces/clawonshape)
issue: edge-robot/clawonshape#21
architecture-ref: clawonshape/docs/ADR.md#adr-2026-10-21-task-scoped-onshape-workspace-and-part-selection
contract-version: work-context-1.0.0-draft; goal-1.2.0-draft; server contract 1.2.0-draft (unchanged)
foreign-repo-commit: cc67472   # onshape-mcp feat/5-goal-grant (read-only mount); no server change needed
base-commit: ae7a05f
status: done   # accepted 2026-10-22 (report f9bb176); CR-1–CR-8 recorded in work-context.md
---
# Work-context selection backend, increment 1 (#21)

## Goal

Implement the backend of `docs/interface/work-context.md` (`work-context-1.0.0-draft`):

- the per-binding selection record (§3);
- the dashboard gateway methods `work-context-catalog`, `work-context-preview`,
  `work-context-status`, `work-context-adopt` and `work-context-clear` (§4);
- adoption with interlock, CAS and late-reply fencing (§5);
- the normalized views `Catalog` and `WorkContextView` (§6), including `workContext` in the
  Engineer's `onshape_status`;
- the goal hand-off `scope.focus` (§7, goal-workflow `goal-1.2.0-draft`).

All tests are local with recorded/mocked REST responses. No live CAD, no MCP change.

## Context

- Normative: `docs/interface/work-context.md` (all sections, tests W1–W11) and
  `docs/interface/goal-workflow.md` §2, §9 and the `goal-1.2.0-draft` changelog entry.
- ADR: `docs/ADR.md` → "ADR-2026-10-21: Task-scoped Onshape workspace and part selection",
  section "Review outcome and increment 1" (decisions I1–I5).
- Product: `spec.md` → "Select an Onshape work context" (S1–S9); mockups in
  `docs/product/onshape-selection-2026-10-21/` (reference only).
- Fixtures: `docs/interface/work-context-fixtures/` (read them in place; they are not copied to
  `tests/contract/`). The server fixture tree `docs/interface/fixtures/` and `tests/contract/` are
  unchanged at `1.2.0-draft`.
- Existing code to build on:
  - `src/dashboard.ts`: `workspace-context` action (guard, binding resolution, credential path) and
    `registerGoalActions` (scope handling, response shape);
  - `src/rest.ts`: `RestClient`, `inspectSnapshot`, `workspaceContext`, `render` (shadedviews and PNG
    decoding), `currentMicroversion`, `validatedDisplayNames`;
  - `src/goal-store.ts`, `src/goal-service.ts`: store lock (`exclusive`), exclusivity checks, propose;
  - `src/goal-scope.ts`: canonical JSON and `goalHash`;
  - `src/candidate-attempts.ts`, `src/mutation-workflow.ts`: receipts and attempts for the interlock.
- Onshape OpenAPI facts (checked by the architect 2026-10-22): `getPartsWMVE`
  `GET /parts/d/{did}/{wvm}/{wvmid}/e/{eid}` returns an array of part metadata with `partId`, `name`,
  `bodyType`, `isHidden`, `isMesh`, `isFlattenedBody`, `microversionId`; `withThumbnails` is not
  supported for microversions. `getConfiguration` is `GET /elements/d/{did}/{wvm}/{wvmid}/e/{eid}/configuration`.

## Binding constraints and prohibitions

- Contract-first. **Do not edit** `docs/interface/**`, `tests/contract/**` (except
  `tests/contract.test.mjs`), `docs/ADR.md` or `spec.md`. On a contract problem, stop, set
  `status: blocked` and write a change request (CR-n) in the report.
- **File ownership:** the Codex top-down team owns `ui/**`, `docs/engineering-cockpit.md`,
  `scripts/test-cockpit-browser.mjs` and `docs/product/**`; it works in parallel in a separate
  worktree on `feat/21-selection-ui`. Do not edit those files. You own `src/**`, `tests/**`
  (except `tests/cockpit*`), `openclaw.plugin.json`, `package.json`.
- Read-only provider access only (REST GET R1–R5 of §2). No `idtranslations`, no POST, no MCP call.
  Adoption never creates a Candidate, goal, proposal, approval or grant and never changes the
  binding, OAuth state or MCP target (test W3 must prove the absence of these files).
- Do not weaken existing guards, scopes, the goal exclusivity rules or the legacy actions. The goal
  scope without `focus` MUST hash exactly as before (`fixtures/goal-workflow/goal-hash/vector.json`).
- Adoption, clear, `goal-confirm` and `onshape_goal_propose` share one store lock (§5.1); do not
  introduce a second, independent lock that could interleave with goal confirmation.
- No new runtime dependencies. Use `node:crypto` for hashes.
- Do not touch `Containerfile`, `.devcontainer/`, `scripts/dev.sh`, `.claude/` or `deploy/`.
- Work only on `feat/21-work-context-selection` in `/workspaces/clawonshape`. No new branches,
  worktrees or stashes. Never push.

## Steps

1. Verify branch, HEAD (`base-commit` or later) and that `docs/interface/work-context.md` says
   `work-context-1.0.0-draft`. Record the baseline: `npm run typecheck`, `npm test` (count),
   `npx biome ci .`.
2. `src/work-context.ts` (pure where possible): `bindingKey` (test vector
   `binding-key.json`), part eligibility rules (§1), catalog projection from R1–R4 responses
   (sort and limits, §2/§6.1), revalidation table (§5.2), `WorkContextView` projection (§6.2).
3. `src/work-context-store.ts`: durable record per binding key in the private state directory
   (pattern of `goal-store.ts`), atomic replace, monotonic `selectionRevision`, reload after restart.
   Use the existing goal store lock for adopt/clear (§5.1).
4. `src/rest.ts`: add the read methods for R2–R5 with the existing size limits and validation;
   R2–R5 always at the `m/{mv}` of the same request's R1, and the R1 recheck after R4.
5. Dashboard actions in `src/dashboard.ts` (§4) with the existing binding resolution and
   authorization-snapshot guard, scopes as in §4, strict input keys, and the response shapes of §6.
   Implement the adoption order of §5 exactly, including the guard re-check after the reads (step 7)
   and the CAS under the lock (step 8).
6. Interlock (§5.1) from the goal store, the payload receipts, the approval v2 state and the
   candidate attempts; unreadable state fails closed with `goal_state_invalid`.
7. Engineer `onshape_status`: add `workContext: WorkContextView | null`. Lead output unchanged.
8. Goal hand-off (§7): `onshape_goal_propose` adds `scope.focus` only for a `valid` selection,
   re-reads R4 at `baseMicroversion`, fails with `selection_part_missing` or the
   invalid/unverified reason; `GoalView.target.focus` (`null` without focus). Update the Engineer
   skill `skills/onshape-goal-iteration/SKILL.md` with one short paragraph: the focus is intent, the
   conditions stay feature-based, and the Engineer reports effects on other parts of the studio.
9. Tests W1–W11 (§9) using the fixtures in `docs/interface/work-context-fixtures/` and recorded REST
   responses under `tests/fixtures/work-context/` (synthetic IDs only). Add the work-context codes to
   the code-coverage test pattern (W11) without weakening the existing ones.
10. Verify WC3 offline as far as possible (the partId alphabet in the OpenAPI schema or examples);
    report the evidence. WC1, WC2 remain for the live E2E.

## Acceptance criteria and tests

| # | Criterion | Evidence |
|---|---|---|
| A1 | Catalog equals `catalog.json` from recorded responses; same-name parts distinct; other Part Studios unenumerated with `element_not_provisioned`; configured studio → `configuration_unsupported` | W1 |
| A2 | Revision change during catalog or adoption → `selection_observation_stale`, no write | W2, W4 |
| A3 | Adopt happy path and every rejection of W4; previous record unchanged on failure | W3, W4 |
| A4 | Interlock for every non-terminal goal state and every unresolved legacy/Candidate condition; allowed after `goal-close` | W5 |
| A5 | CAS: one of two concurrent adopts wins; adopt vs. `goal-confirm` serialized | W6, W7 |
| A6 | Restart/reload and revalidation table of §5.2; changed binding sees no selection | W8, W9 |
| A7 | `focus` hand-off and `goalHash` vector; goals without focus hash as before | W10 + T1 unchanged |
| A8 | No provider write, Candidate, goal, proposal, approval or grant from catalog, preview, status, adopt or clear | W3 file-absence assertions + mocked REST method log (GET only) |
| A9 | All emitted codes listed | W11 |
| A10 | typecheck, `npm test`, `biome ci` pass; no change to legacy test counts except additions | checks table |

## Branch and worktree rules

Commit on `feat/21-work-context-selection` only, in small logical commits with the trailers
`Refs: edge-robot/clawonshape#21`, `Prompt: docs/prompts/2026-10-22-work-context-backend.md`,
`Agent: ts-plugin-dev` and `Co-Authored-By`. Author `Albert Kos <kickban3000@gmail.com>`. Never push.
The worktree is returned with the report; the UI team merges your branch later via the architect.

## Expected report / handoff format

`docs/prompts/2026-10-22-work-context-backend.report.md` in the agent-definition format
(frontmatter `status`, `contract-version: work-context-1.0.0-draft`, `e2e-request: required`).
It must contain:

- the checks table (baseline vs. after);
- A1–A10 with evidence and the W1–W11 test names;
- WC3 findings; any assumption about WC1/WC2 used in code;
- the list of changed files;
- CRs, if any (contract deviations must match the diff);
- notes for the UI consumer: final action names, inputs, and any field the views add or leave `null`;
- the commit list with trailers.
