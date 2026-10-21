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

_In progress._
