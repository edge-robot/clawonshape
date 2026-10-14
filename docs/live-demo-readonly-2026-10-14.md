# Live native MCP demo acceptance — 2026-10-14

**PASS.** The real authorized Discord user requested a current Camera Mount Plate
inspection. Robotics Lead chose `onshape_delegate_inspect`, Mechanical Engineer
performed live native MCP calls in its running Gateway, Claw-Onshape independently
verified the observation through REST, Lead verified the signed same-task result,
and the final answer was observed in Discord. No CAD write was attempted.

This supersedes the production-disabled / Gateway-unaccepted checkpoint in the
October 13 native read report. The previous one-shot CLI cleanup failure is avoided
by using the normal Gateway lifecycle; no OpenClaw runtime or MCP client was added.

## Deployment and cleanup

Initial checkouts were clean:

| Repository | Initial branch | HEAD |
| --- | --- | --- |
| edge-robot/clawonshape | feat/native-plugin-foundation | a0e1a78 |
| edge-robot/clawake | fix/14-discord-message-grants | 9b152b6 |
| edge-robot/onshape-mcp | claw-onshape/external-token | 1da60fc |

Claw-Onshape and Clawake changes are on local
`demo/gateway-native-read-20261014` branches. The MCP checkout is unchanged.

The actual runtime ownership was established using Podman labels, mounts,
inventories and systemd `SourcePath`, rather than inferred from container names.
The working agent deployment still intentionally mounts its persistent workspaces
from the existing ClawCAD checkout. No workspace migration was performed.

| Classification | Container | Service |
| --- | --- | --- |
| CURRENT DEMO | clawcad-robotics-lead | clawcad-robotics-lead.service |
| CURRENT DEMO | clawcad-mechanical-engineer | clawcad-mechanical-engineer.service |
| CURRENT DEMO | clawonshape-mcp | clawonshape-mcp.service |
| STALE PROJECT | clawonshape-mcp-sprint-20261012 | clawonshape-mcp-sprint-20261012.service |

Clawake teardown was previewed and applied using the stale sprint's own inventory.
It stopped/removed the ephemeral container and removed its container/network/volume
Quadlet definitions. The resulting service is `LoadState=not-found`, inactive,
`Restart=no`. Persistent workspace/state and credentials were preserved.

Eight historical Rust build/test containers were already exited and remain exited:
clawonshape-mcp-build, clawonshape-mcp-test-2, clawonshape-mcp-regression,
clawonshape-mcp-regression-2, clawonshape-mcp-strip,
clawonshape-mcp-filesystem-guard-tests, clawonshape-mcp-final-build,
onshape-integration-build-20261013. They are STALE PROJECT artifacts, not active
MCP runtimes. No unrelated host service was changed and no UNKNOWN resource was
mutated. Final rootless Podman inventory contains exactly the three running demo
containers; remaining installed project Quadlets own only those services and their
two networks/state-volume definitions.

All three services are Clawake-managed user systemd services generated from
`~/.config/containers/systemd/<container>.container`. Lead/Engineer restart
policy is `always`; MCP is `on-failure`. Lead/Engineer remain OpenClaw 2026.9.9
(bcfc888), image digest
`sha256:7f10d5cc975a90b65192eaa099454fe33ce8ce2390806c61c65cd868e9ef730d`.

## Narrow changes

Claw-Onshape 0.2.3 adds two optional tools beside the unchanged render path:

- `onshape_delegate_inspect`: the existing authenticated A2A and signed-result
  adapter with a fixed native-read inspection task, not generic RPC passthrough.
- `onshape_verify_feature_read`: independent exact-target REST verification of
  the native observation's revision, feature ID, plateWidth expression and state.
  It neither invokes MCP nor performs CAD mutation.

The same trusted requester/agent/channel binding, signed delegation context,
invocation-current checks and result signature checks apply. Lead remains
delegate-only; Engineer receives no Discord delivery grant.

Clawake now accepts an explicit `onshape_mcp_enabled` flag (default false), valid
only with the existing managed connector. The current inventory enables only the
Engineer connector, filtered to auth status, explanation, schema and API call.
Exact tool names are granted globally and to that named Engineer through existing
Clawake reconciliation. No shell, file, browser or spawning grants were added.
The server's exact document/workspace/element read policy is unchanged; mutation
configuration remains absent. Lead gets only the additional inspection delegate.

Both private inventories were updated consistently and both runtime configs/roles
were backed up. Setup and sync previews were inspected before application.
Setup changed only the plugin archive mounts and the Engineer's MCP enabled/filter
fields/ownership ledger. Plugin sync installed the checksum-pinned artifacts and
reconciled the listed grants. Startup offline-maintenance briefly rejected early
sync attempts; they succeeded after the Gateways completed startup. No database
lock bypass or manual state repair was used. Roles were updated via native
`agents.files.get/set` with expected hashes and verified readback. The human
deliberately started `/new` before the Discord acceptance.

Installed plugin archive SHA-256:
`84083577696c97d6874ff58c82254a631558fc5a7b80bdea9e69ea4af9162baa`.
Claw-Onshape typecheck and **81 tests** pass; Clawake **255 tests** and focused
Ruff checks pass. A final setup preview reports zero artifact changes.

## MCP pin, health and credentials

Running fork revision: `612de76266efedc6b1f7fcc1fafe3063837ae8da` from
edge-robot/onshape-mcp, branch claw-onshape/external-token. The newer checkout HEAD
contains documentation changes and does not replace the deployment pin.

Image: `localhost/clawonshape-mcp:612de76-external-token-v3` at
`sha256:51fff34f3180a2c2bf5ede12f89c3b88e8290640696b54131fd3c1b21c51cde6`.
Running binary SHA-256:
`3afe162c304ef4bd2cfa10e4ee3d00b718ae5644ce35d94c72815e365986a26e`.

Final checks: Lead `/ready` 200; Engineer `/ready` 200; MCP `/health` and
`/health/ready` 200. Discord probe succeeds; configured channel permission audit
passes; A2A is configured and connected. Both agents' model access is established
by completed real turns. Native MCP discovery returns the four filtered tools
without diagnostics.

Claw-Onshape remains the sole OAuth/refresh owner. Engineer mounts the protected
handoff directory read/write; MCP mounts it read-only. File mode is 0600; fields
are only accessToken, expiresAt and scopes. The current scope is OAuth2Read;
there is no published refresh token. Successful live feature GETs prove usability.
MCP has no host-published port, runs as 1000:1000 with a read-only filesystem and
retains its existing private network/hardening. No competing MCP is running.

## Runtime evidence

Gateway-owned isolated Engineer read:

- Run `654184ea-9244-4378-b49b-30466e6d9814` completed with status ok and CLI exit 0.
- Terminal receipt records successful native auth-status, explanation and API-call
  tools, zero tool failures, no aborted run.
- Native Codex transcript records real tool arguments/results and task completion.
- Live response: feature F37MrGsqQOiSdYi_0, plateWidth **50 mm**, status **OK**,
  microversion b83ee0a0efcda65537780ef8.

Installed Lead adapter A2A probe:

- Task `3c11fcbb-8347-4ed0-83fa-acf6e2a0f64f`, TASK_STATE_COMPLETED.
- Engineer native calls plus independent REST match; signed result verified and
  returned to the Lead adapter. Observed at 07:28:22.515Z.
- This operator probe establishes the fallback; Lead model choice is established
  separately by the real Discord test below.

Real Discord end-to-end:

- Human input `1559830756791160843`, 07:30:32.673Z, marker DEMO-20261014-A.
- Lead's native transcript invokes onshape_delegate_inspect.
- A2A task `6b6a91b9-7ee4-4fc8-8166-84ba3a9de81b`, TASK_STATE_COMPLETED.
- Engineer's fresh transcript invokes native auth status, explain,
  getPartStudioFeatures, then onshape_verify_feature_read.
- Fresh independent match at 07:30:56.726Z; result signature accepted by Lead.
- Lead receives width **50 mm**, feature F37MrGsqQOiSdYi_0, status **OK**,
  microversion b83ee0a0efcda65537780ef8 and completes its turn.
- [Actual Discord reply](https://discord.com/channels/1475244093541191822/1553026145803436056/1559830901922205696)
  `1559830901922205696`, observed via Discord REST at 07:31:07.275Z.
  Approximate request-to-answer duration: 35 seconds.

Raw private acceptance evidence is under
`state/deployment/demo-evidence-20261014/`: native calls/completions, both
same-task A2A GetTask results, both agents' Discord-run tool transcripts, actual
Discord input/output messages and final runtime snapshot. Credentials are excluded.
Private predeployment backups are under `state/deployment/backups/demo-20261014/`.

## Live demo and fallback

Paste into #clawcad (the existing fresh session is ready):

```text
<@1486345334094430289> Inspect the current Camera Mount Plate in Onshape. Delegate the CAD inspection to the Mechanical Engineer using onshape_delegate_inspect. Determine the current plate width and report the current feature state and microversion from a fresh native MCP read. Do not modify the CAD model.
```

Validated host fallback if Discord fails:

```sh
cd /home/kaos/Projects/01_pib/02_sw
podman exec -i clawcad-robotics-lead node --input-type=module < clawonshape/state/deployment/a2a-native-read.mjs
```

This invokes the already installed Lead delegation adapter as an operator, uses
the existing authenticated signed A2A path and requires a verified native Engineer
read. It prints sanitized target/result/task metadata. It is not a replacement
Discord-ingress claim or a second MCP client.

Mutation stretch was not attempted: OAuth2Write, an authorized Candidate and exact
approval/attempt constraints are not currently satisfied. Primary remains
read-only; no Candidate, CAD write, version, export or promotion was performed.
