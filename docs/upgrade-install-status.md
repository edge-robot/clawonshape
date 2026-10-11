# Requested upgrade and installation — 2026-10-09

## Executed on 2026-10-11

Host escalation became available and `podman ps` succeeded. Both existing members
were upgraded through Clawake to OpenClaw **2026.9.9 (bcfc888)**, with registry
tag/manifest comparison and immutable digest
`sha256:7f10d5cc975a90b65192eaa099454fe33ce8ce2390806c61c65cd868e9ef730d`.
Clawake created config and runtime backups for each member before migration.
Backups are in private `state/deployment/.backups/` with files restricted to 0600.
The original ClawCAD inventory and application source were not edited; the
existing runtime configuration and Quadlets were reconciled by Clawake.

Clawake `sync-plugins --execute` installed checksum-pinned Claw-Onshape 0.1.0 in
both containers and preserved existing plugins. Actual native
`openclaw plugins info claw-onshape --runtime --json` reports **loaded** in both.
Both host health endpoints returned HTTP 200 after the final plugin restarts.
Final Clawake validation reports two members and zero artifact changes.

Connection configuration remains `bindings: [], liveReads: false`. No global
`onshape_inspect` grant was added. Engineer's existing native Onshape MCP server
remains disabled; Lead has no MCP servers. No provider operations, browser
consent, token forwarding or CAD writes were performed. Authorized agent
exposure and execution restrictions remain covered by the 19 passing offline
tests; an authenticated live agent/provider turn has not been demonstrated.

Both native loader reports include **provenance-invalid** and one duplicate
plugin warning: `/workspace/.openclaw` and `/home/node/.openclaw` expose the same
extension through the existing workspace/state mount arrangement. Loading
succeeds, but these diagnostics remain unresolved. The 2026.9.9 image has Node
v24.21.0 and the private-file SDK; the diagnostic cannot resolve a local
TypeScript compiler from its working directory. No native typecheck is claimed.

The diagnostic timeout was increased from 30 to 120 seconds after native plugin
inspection exceeded the earlier timeout. Failed inspection now reports
`inspectionAvailable: false` rather than claiming the plugin is absent.
The sections below record the earlier blocked preparation, not current status.

User authorized upgrading both Robotics Lead and Mechanical Engineer to OpenClaw 2026.9.9, installing Claw-Onshape in both, and testing integration. No provider write is authorized by this request.

## Completed preparation

- Existing Quadlets inspected read-only: both declare `ghcr.io/openclaw/openclaw:2026.9.4@sha256:cc596b846506a5f4cfcee111394a2725f375f01cca2ebb492a161fd1b747f101`.
- Existing `clawcad-plugin/state/plugin/team.json` matches relevant role/plugin mount ownership. Original source inventory and Clawake/ClawCAD files are unchanged.
- A private inventory copy is prepared at `state/deployment/team.json`, with the current image pins and all existing plugins/policies preserved. It adds the local checksum-pinned Claw-Onshape archive to both members. Plugin config is `bindings:[], liveReads:false` for an initial loader test; no new provider or agent tool grant is installed.
- Clawake validation passes: two members, two artifact changes. Setup and plugin synchronization previews were run without `--execute`.

## Not executed

Upgrade, live installation, restart and runtime tests are blocked. `podman ps` cannot access its runtime bookkeeping because `/run/user/1000` is mounted read-only in this Codex sandbox; user systemd bus access is denied. Current session policy forbids sandbox escalation. Expanding the project writable root did not change these host access restrictions.

Clawake requires an immutable registry-verified digest for a version change. The 2026.9.9 image digest has not been obtained; the old digest must never be relabeled as the new version. The private prepared inventory deliberately retains 2026.9.4 until the upgrade command can verify and apply the new image.

## Continuation with host access

Use the prepared inventory in existing Clawake upgrade operations, one member at a time, with `--to 2026.9.9 --digest <verified-new-image-digest>` and normal backup/health checks. After both upgrades, run setup and sync-plugins for each member through Clawake. Verify `openclaw plugins info claw-onshape --runtime --json` in both containers, then confirm requester-scoped Engineer exposure and Lead exclusion before enabling any REST access.

The user's permission is already sufficient for these operations; another confirmation is not needed. Execution requires a session with host Podman/systemd/network access. Live REST acceptance additionally needs the operator-owned Onshape application and selected authenticated requester/document/workspace configuration. No historical REST tokens are copied, and MCP write tools/merge stay disabled.
