# Evidence: live E2E of the onshape-mcp expand build, contract 1.0.0-draft (2026-10-20)

- **Scope:** migration step 3 (*live E2E*) for the server *expand* step of contract 1.0.0-draft (§9):
  - edge-robot/clawonshape#14 (P1), epic #11;
  - edge-robot/onshape-mcp#2 (G2).
- **Operator:** onshape-architekt with the user. The user ran every `--execute` himself, because the auto-mode classifier blocks the architect.
- **Redactions:** Onshape IDs appear as prefixes or `<hex24>`; no secrets.

## Deployed combination (matrix §9, row 1.0.0-draft `-curl`)

| Item | Value |
|---|---|
| onshape-mcp image | `localhost/clawonshape-mcp:acceacd-approval-v2-expand-curl` @ `sha256:d98a11dc…0eb8`, revision `acceacd`, binary sha256 `a5a57f30…704685f` |
| Plugin | claw-onshape 0.2.10 @ `6bbc5e5` (writes approval v1) on both members |
| OpenClaw | 2026.9.9 |
| Clawake | `main` @ `85079c8` |
| MCP config | unchanged schema. Static pins `workspace_id`, `feature_id` and `expected_microversion` are still set (expand compatibility); `mutation_approval_file` is present |

## Incident during the first rollout (before the accepted run)

The first rollout used the distroless runtime build `acceacd-approval-v2-expand` (`sha256:b720bbbb…`).

- **Failure:** The Clawake quadlet health check is `curl --fail …/health` with `HealthOnFailure=kill`. The distroless image has no `curl`. systemd therefore killed the service about every 60 s; the counter reached 97 restarts.
- **Effects on the agents:**
  - the Engineer's native MCP client saw closed sessions and `getaddrinfo EAI_AGAIN clawonshape-mcp`;
  - the first proposal attempt (12:51 UTC) produced no proposal. No write happened, and no receipt was created.
  - The Engineer model also hit an OpenAI rate limit with 8 retries. The user decided to ignore that for now.
- **Why it was missed:** `onshape-mcp --action apply --execute` reported success, and `/health` answered 200 between kills.
- **Fix:**
  - The accepted binary was copied unchanged out of the distroless image.
  - It was wrapped in `deploy/onshape-mcp/Dockerfile` (Debian slim with `curl`), giving tag `-curl`.
  - In an isolated test with a dummy config and a `null` token, the container was `healthy` and `/health/ready` returned 503.
  - Live: 0 restarts over 2 min and `healthy`, then stable for the whole run.
- **Follow-ups:**
  - edge-robot/onshape-mcp#4: a `healthcheck` subcommand, plus a SIGTERM finding;
  - edge-robot/clawake#39: a per-image `HealthCmd`, an image preflight, and a post-apply `healthy` wait.

## Steps

| # | Step | Result |
|---|---|---|
| E1 | `clawake onshape-mcp --action apply --execute` with the `-curl` image | **pass**: health `healthy`, `NRestarts` 0, `/health/ready` 200 from the Engineer, token handoff present with Read and Write |
| E2 | Read regression on the new server. `@clawcad` status at 12:49 UTC (on the first image) and again after the fix | **pass**: `connected`, and `getPartStudioFeatures` answered with `BTFeatureListResponse` through `onshape__onshape_api_call` |
| E3 | Proposal via Discord: `plateThickness` 5 mm → 4 mm on the Candidate | **pass**: `fa2e74ca-103a-421e-a4e8-90c31dc9538d` is `PROPOSED` (14:48:11Z). Feature `F37MrGsqQOiSdYi_0`, baseline `4dea7ccf…` (post-R7 Candidate), Primary `b83ee0a0…`. The Lead relayed the ID without a timeout |
| E4 | `provision-candidate-mcp.mjs --candidate <ws> --proposal fa2e74ca… --execute` | **pass**, exit 0. MCP pins: feature `F37MrGsqQOiSdYi_0`, `expected_microversion` `4dea7ccf…`, target = Candidate. `setup` 0/2. The Lead plugin was reinstalled once to backfill the ledger (`install (ledger_missing)`, 0.2.10, ready after 79 s). MCP restarted and `healthy` |
| E5 | Dashboard Approve, then execution request in Discord | **pass**: approved 15:07:10Z, `expiresAt` + 300 s; the approval file is v1 |
| E6 | Engineer: `onshape_mutation_context` → exactly one `onshape__onshape_api_call` → `onshape_reconcile_update` | **pass**: context `ok` 15:07:58Z; **one** `updatePartStudioFeature` 15:08:02Z; reconcile `VERIFIED` 15:08:11Z with `resultMicroversion` `2c7f8d14…`; the approval file is reset to `null`. A fresh feature read followed for verification |
| E7 | Replay: the same approval restored (239 s validity left) and the identical `apiCall` sent once over MCP from the Engineer container in the same server process | **pass**: JSON-RPC error `{"code":-32600,"message":"mutation_approval_consumed"}` at 15:08:11Z. The approval file was reset to `null` right after. Any second dispatch would also have failed at Onshape because of the revision CAS (`rejectMicroversionSkew`) |

E7 method: an architect script (session scratchpad) copied the approval file when it appeared and waited for the plugin's terminal `null` reset. It then wrote the snapshot back atomically (0600, same directory), made a single `tools/call onshape_api_call` with path params taken from the pinned config and the snapshot body, and wrote `null` again. The user approved this fault injection beforehand.

## Not covered

- Optional §8.8 negative: a server started without `mutation_approval_file` exits with `target_configuration_invalid`. It is covered by the server tests; not run live.
- The Primary was not re-read independently in Onshape. Reconcile rule 1 observed it unchanged (`VERIFIED`).
- v2 claims and claimed reads need the P3 plugin (the migrate step).

## Result

Row 1.0.0-draft `acceacd-approval-v2-expand-curl` + plugin 0.2.10 is **accepted**. Rollback target: row 0.4.0-draft (`f27613e-external-token-v4`, image retained; `service.json` backup in `~/.local/state/clawake/clawonshape/mcp-backups/`).

Next: P3a (`docs/prompts/2026-10-20-approval-v2-writer.md`, plugin writes v2).
