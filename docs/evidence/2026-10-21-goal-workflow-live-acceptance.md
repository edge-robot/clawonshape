# Live acceptance: goal workflow (2026-10-21)

Issues: edge-robot/clawonshape#17 (cockpit UI), #18 (goal backend), edge-robot/onshape-mcp#5 (server),
edge-robot/clawake#40 (journal volume). ADR-2026-10-21. Operator: onshape-architekt; human acceptor: user.

## Stage 1: plugin 0.3.0-rc.1, server unchanged (goal path unavailable)

| Item | Value |
|---|---|
| Plugin | 0.3.0-rc.1 @ `578bc9b` (`feat/18-goal-authorization`), packed from `git archive` (199/199 tests in the archive), `sha256:688f3192a6f2d7fb6c435a587e0adc9e24317bf6f8ed1c627e9f1c80956062d1`, 177 files, Lead + Engineer |
| Server | unchanged: `acceacd-approval-v2-expand-curl` @ `sha256:d98a11dc…0eb8` |
| Pins | runtime pins overlay switched for both members; backup `pins-backups/*-before-0.3.0-rc.1.json` |
| Replaced | off-matrix Engineer preview `0.2.10-cockpit-cc7b0dd28a3d` (deployed 2026-10-20 17:29–20:58 outside the compatibility matrix, pins overlay edited, four pin backups) |
| Commands (user) | `clawake setup --execute` (both restart ok, ready 74 s / 62 s, `plugin_version_mismatch` as expected before sync), `clawake sync-plugins --execute` (both `install`, `ready` 68 s / 60 s) |
| Status check | `clawake status`: both `healthy`, `ready`, `pinned=installed=0.3.0-rc.1`, `loaded`, `enabled`; no plugin errors in the logs since restart; extension contains `skills/onshape-goal-iteration` |

Pre-existing finding: Onshape connection `owner-rest` was disconnected since 2026-10-21 08:16 (credential
record rewritten then, `mcp_credential_unavailable code=reconnect_required`), before this rollout. The
user reconnected it in the dashboard (step 1). An OpenClaw automation reported 3+ consecutive failures,
likely during the disconnected period (to re-check).

| # | Check (user, dashboard) | Result |
|---|---|---|
| S1 | Reconnect `owner-rest` (read + write) | pass |
| S2 | Workspace view: document/workspace/Part Studio names, tool status, next step | pass |
| S3 | CAD: goal panel truthfully unavailable | pass: "Goal authorization is not available: it is disabled here or the MCP server does not support it." |
| S4 | Operator actions present and collapsed | pass |
| S5 | 3D Print blocked truthfully; overall behaviour | pass ("everything behaves as wanted; goal acceptance missing, as expected") |
| S6 | F4 revision link opens the exact microversion; CAD view loads only on click | not separately confirmed; moved to stage 2 |

Stage 1 verdict: **accepted** (UI), matrix row → accepted for stage 1.

## Stage 2: goal path live

| Item | Value |
|---|---|
| Server | `localhost/clawonshape-mcp:cc67472-goal-grant-curl` @ `sha256:4e788a35…c45d` (`feat/5-goal-grant` @ `cc67472`; distroless build `sha256:0dd5ec35…acfcf`, binary sha256 `4dca4cde…07a2cf`, wrapped for the curl `HealthCmd`) |
| Server config (operator state, not versioned) | `goal_grant_file = /run/onshape-credentials/mutation-approvals/goal-grant.json`, `dispatch_journal_dir = /var/lib/onshape-mcp/journal`; static mutation pins (workspace, feature, expected microversion) removed; backup `config.toml.*.before-goal` |
| Service (operator state) | image tag and digest switched; `dispatch_journal_directory` set (host dir mode 0700); backup kept next to `service.json` |
| Clawake | `feat/40-goal-journal` @ `4b59c83` (`clawake onshape-mcp --action apply --execute`, run by the user) |
| Plugin | unchanged 0.3.0-rc.1 @ `578bc9b`; `deploy/team.json`: Engineer `goals.enabled` + `approvalDirectory`, five goal tools granted to the Engineer, `onshape_goal_status`/`onshape_goal_stop` to the Lead; `clawake sync-plugins --execute` (user) |

| # | Check | Result |
|---|---|---|
| D1 | `GET /capabilities` | pass: `{"contractVersion":"1.1.0","mutationAuthorities":["approval-v2","goal-grant-v1"]}` |
| D2 | `GET /health/ready` (token published) | pass: 200 |
| D3 | Journal directory owner/mode, mounted rw | pass: operator UID, 0700 |
| D4 | No goal grant before confirmation | pass: `mutation-approvals/` holds only the empty approval file |
| D5 | `clawake status` | pass: Lead + Engineer `healthy`, `ready`, 0.3.0-rc.1 `loaded`; only the known "1 automation has failed 3+ runs" notice |

### Not run (aborted 2026-10-21)

The user aborted the acceptance before the Discord flow to switch the agent model of Lead and Engineer
(the current OpenAI-based model consumes scarce capacity). The following remain open and must be run
**on the new model**, because the goal flow depends on agent behaviour:

- G1 goal plugin capability `AVAILABLE` in the dashboard panel;
- G2 Discord goal to the Lead → `onshape_delegate_task` `workflow: "goal"` → Engineer `onshape_goal_propose`;
- G3 dashboard review (full request) and "Verify Candidate" (D1 interim decision source);
- G4 two different feature changes in exactly one new Candidate, Primary unchanged, journal entries;
- G5 `onshape_goal_verify` and result with revision link in the original Discord channel (incl. F4/S6);
- G6 negative: duplicate dispatch, scope denial, STOP and `goal-close` on a second mini goal;
- G7 CAD view loads only on click (S6).

Stage 2 verdict: **deployed, not accepted**. The matrix row stays "deployed, acceptance pending".
Known side effect while this configuration is live: legacy v1 approvals are not admissible (no static
pins). Rollback: previous matrix row (image `d98a11dc…` + `config.toml.*.before-goal`, plugin config
without `goals`).
