# Project closure plan (2026-10-26)

Tracking issue: [edge-robot/clawonshape#23](https://github.com/edge-robot/clawonshape/issues/23).
Decision record: [ADR-2026-10-26](ADR.md#adr-2026-10-26-project-closure-onshape-rest-quota-and-large-models-limit-the-pib-use-case).
Coordinator: onshape-architekt (Claude). Human: the user (decisions, OK for push/PR/rollout,
presentation).

## Scope

- Secure the results:
  - every open change reviewed and committed;
  - branches pushed to `edge-robot/*`;
  - pull requests opened. The user merges.
- Document the delivered state and the limits:
  - pib models are not demonstrated;
  - the REST quota is a long-term show stopper.
- Clean up worktrees, branches and stale artifacts. One checkout per repo remains.
- Prepare the final presentation and one demo rehearsal on the Camera Mount Plate.
- **No new features, no new deployments.** The demo runs on the deployed state:
  - plugin 0.3.0-rc.3 @ `667f01c`;
  - server `cc67472-goal-grant-curl`;
  - Clawake `feat/40-goal-journal` @ `4b59c83`.

## State at the start (2026-10-26)

| Repo | Branch (local) | Pushed | Content |
|---|---|---|---|
| clawonshape | `feat/21-work-context-selection` | no (119 commits ahead of `origin/feat/native-plugin-foundation`) | contains `demo/gateway-native-read-20261014` and `feat/18-goal-authorization`: cockpit #17, goal #18, work context #21, selector v2, contracts, evidence |
| onshape-mcp | `feat/5-goal-grant` | no (contains `claw-onshape/external-token`) | goal grant + journal (#5), healthcheck (#4), spec adoption (#8) |
| clawake | `feat/40-goal-journal` (worktree `clawake-integrate`) | no | goal journal (#40); `fix/39-mcp-healthcmd` pushed but not merged into it |

Local-only leftovers:

- clawonshape `spike/plugin-command-approval`: unmerged spike, to be archived by a push;
- clawonshape `feat/18-goal-authorization`: contained in `feat/21`, delete after the push;
- clawake `feat/clawcad-services-v2`: awaits the user's decision.

## Work packages

### Claude team (bottom-up)

| ID | Owner | What | Gate |
|---|---|---|---|
| K1 | onshape-architekt | Review and commit sweep: onshape-mcp `spec.md` (#8), `dev.sh` in all repos, superseded P3a prompt | done 2026-10-26 |
| K2 | ts-plugin-dev | #22 narrowed: measure the call cost per dashboard action of the deployed behaviour; tests plus report; no behaviour change | report reviewed |
| K3 | rust-mcp-dev | Server handoff: full checks on `feat/5-goal-grant`, RUSTSEC #6 only if it is a patch-level bump, as-built handoff report | report reviewed |
| K4 | py-clawake-dev | Merge `fix/39-mcp-healthcmd` into `feat/40-goal-journal` with the 26 known test fixes; public-repo hygiene check; no deployment | report reviewed |
| K5 | onshape-architekt | Closure ADR; matrix; issue triage (final status comment on every open issue); push and PRs after the user's OK; cleanup; demo runbook; rehearsal with the user; memory | user OK for push/PR |

### Codex team (top-down)

| ID | Owner | What | Gate |
|---|---|---|---|
| X1 | Codex architect + product owner | Final presentation: storyline, slides, speaker notes, demo script from the user's view, fallback screenshots | needs K2 numbers, ADR-2026-10-26 and the rehearsal evidence |
| X2 | Codex architect | `spec.md` as-built status (#19): delivered, partial and not delivered, per requirement, with evidence links; pib journey marked not delivered with the blockers | architect review |

Codex rules unchanged:

- no writes to onshape-mcp, `docs/interface/**`, `docs/ADR.md`, `src/**` or `tests/**`;
- no commits: the architect commits after review;
- no GitHub writes;
- no live Onshape calls.

## Order

1. In parallel now: K2, K3, K4, X2. K5 prepares the ADR, the demo runbook and the triage.
2. Demo rehearsal (user + architect). This is also the open live acceptance:
   - L2–L6 on `wegwerf-document`;
   - G1–G7 on the Camera Mount Plate.

   Quota budget: at most **150** calls. The user reads the counter before and after each block.
   Evidence goes to `docs/evidence/2026-10-26-selector-v2-and-goal-live-acceptance.md`.
3. Reviews of K2, K3, K4 and X2. Commits.
4. User OK, then pushes and PRs:
   - clawonshape `feat/21-work-context-selection` → `feat/native-plugin-foundation`;
   - onshape-mcp `feat/5-goal-grant` → edge-robot `main`;
   - clawake `feat/40-goal-journal` → `main`.
5. X1 presentation with the final numbers and the rehearsal evidence.
6. Cleanup after the merges:
   - remove the `clawake-integrate` worktree;
   - delete merged branches;
   - remove old plugin packages except the rollback pair;
   - update the matrix to the final deployed row.

## Quota rule for the rest of the project

Remaining Onshape budget is about 1,700 calls for the plan year. Allowed consumers:

- the rehearsal (≤ 150);
- the live presentation (≤ 150);
- a reserve.

No other live Onshape use, and no part search in large documents.
