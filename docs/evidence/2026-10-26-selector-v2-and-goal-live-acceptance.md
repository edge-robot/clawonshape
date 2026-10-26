# Live acceptance: selector v2, browsing and goal workflow (2026-10-26)

Issues: edge-robot/clawonshape#21 (work-context backend), #17 (selector UI), #18 (goal backend),
edge-robot/onshape-mcp#5 (server), edge-robot/clawake#40 (journal volume). Contracts
`work-context-1.1.0-draft`, `goal-1.2.0-draft`, server `1.2.0-draft`. Operator: onshape-architekt;
human acceptor: user. Previous evidence: `2026-10-22-work-context-live-acceptance.md` (WC1–WC3,
selector v1 rejected), `2026-10-21-goal-workflow-live-acceptance.md` (stage 2 deployed, G1–G7 not run).

## Deployment

| Item | Value |
|---|---|
| Plugin | 0.3.0-rc.3 @ `667f01c` (`feat/21-work-context-selection`: browsing backend + selector v2, merge `da9698e`), packed from `git archive` (227/227 tests in the archive), `sha256:41286054b3384b50589af9fd25c1bf17a3ff84c5463e9afd46cd61c51162c7be`, 207 files, Lead + Engineer |
| Server | unchanged: `localhost/clawonshape-mcp:cc67472-goal-grant-curl` @ `sha256:4e788a35…c45d`, stage-2 config (goal grant file, dispatch journal) |
| Pins | runtime pins overlay switched for both members; backup `pins-backups/20261023T072430Z-before-0.3.0-rc.3.json` |
| Clawake | `feat/40-goal-journal` @ `4b59c83`; `setup --execute` and `sync-plugins --execute` run by the user from the operator state directory |
| Status | Lead + Engineer `healthy`, `ready`, `pinned=installed=0.3.0-rc.3`, `loaded`, `enabled` |
| Agent model | Switched 2026-10-26 08:41Z from `openai/gpt-5.6-sol` to **`openai/gpt-5.6-terra`** on both members with `openclaw models set` (writes `agents.defaults.model.primary` in the runtime state volume; config hot reload applied, no restart). Not declared in the Clawake inventory; see finding F1. Unverified: whether existing sessions keep their previous model until they are reset. |
| API usage | The user noted the Onshape API usage before the run (value held by the user) |

## Findings

- **F0 (no defect): Lead "does not answer" in the Discord channel.** Guild messages are mention-gated
  by default in OpenClaw (`requireMention: true` in the live config). A message without `@clawcad`
  was skipped with `reason: no-mention` (2026-10-23 07:07Z). Address the Lead with `@clawcad`.
- **F1: the agent model is runtime state, not inventory.** Clawake neither declares nor reconciles
  `agents.defaults.model.primary`; a rebuilt state volume would fall back to the onboarding default.

- **F2: part search fails as a whole on a large document.** In `pib-kaos / Main` (user: the model is
  very large) `work-context-parts` returns `provider_protocol_error`. The plugin cannot tell which read
  or check failed: an R4 response above 4 MiB, a single part entry failing strict validation (name
  empty or above 200 characters, control characters, missing `bodyType`, part ID pattern) and invalid
  JSON all map to the same code, and nothing is logged. Contract gaps: one unreadable Part Studio
  fails the whole search (no per-studio status); one invalid entry fails the whole studio; oversize
  has no own code. Follow-up: contract change §11 (per-studio status, entry tolerance for browsing,
  `provider_response_too_large`, payload-free diagnostics) and a ts-plugin-dev prompt.
- **F3 (minor UX):** in the document list the reason line "Anderes Dokument · nur ansehen; keine
  Zielzuordnung." is cut off by the scroll box and repeated below the workspace card.

## Checks: selector v2 and browsing (user, Engineer dashboard)

| # | Check | Result |
|---|---|---|
| L1 | Selector opens; one "Schließen" at the bottom; layout steps document → workspace → part | **layout pass; part search fails on a large document (F2).** One bottom exit, steps 1–3, bound `wegwerf-document` marked "Zugeordnet", `pib-kaos` listed as "Nur ansehen" with its `Main` default workspace. Part search in `pib-kaos / Main` shows "Onshape-Antwort nicht lesbar" (`provider_protocol_error`). |
| L2 | Document search (≥ 2 characters, paged), bound document marked first; other documents "nur ansehen" (WC7) | pending |
| L3 | Workspace list with roles; read-only/protection fields plausible (WC8) | pending |
| L4 | Part search across Part Studios, grouped; Part Studio preview 128 px (WC9) | pending |
| L5 | Part preview; "Dieses Bauteil übernehmen" at the part; compact card; goal panel shows `target.focus` | pending |
| L6 | Reload/Escape; inaccessible document error (WC10, opportunistic) | pending |
| L7 | API usage after the selector steps (WC11) | pending |

## Checks: goal workflow (stage 2, on `openai/gpt-5.6-terra`)

| # | Check | Result |
|---|---|---|
| G1 | Goal capability `AVAILABLE` in the dashboard panel | pending |
| G2 | Discord goal to the Lead → `onshape_delegate_task` `workflow: "goal"` → Engineer `onshape_goal_propose` | pending |
| G3 | Dashboard review (full request) and "Verify Candidate" | pending |
| G4 | Two different feature changes in exactly one new Candidate, Primary unchanged, journal entries | pending |
| G5 | `onshape_goal_verify` and result with revision link in the original Discord channel (F4/S6) | pending |
| G6 | Negative: duplicate dispatch, scope denial, STOP and `goal-close` on a second mini goal | pending |
| G7 | CAD view loads only on click (S6) | pending |
