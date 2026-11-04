# Host integration access check — 2026-10-09

The session workspace was expanded to `<workspace>`. Clawake source, its Python environment and the historical inventory are now accessible. This did not grant access to the rootless container runtime or user systemd bus.

Observed from this Codex session:

- `podman ps` fails while attempting housekeeping under `/run/user/1000/libpod`: read-only filesystem; listing containers cannot complete.
- `systemctl --user list-units ...` fails to connect to the user bus: Operation not permitted.
- Host `openclaw` and `tsc` commands are still absent; npm registry DNS resolution still unavailable.
- Read-only inspection of `clawcad-plugin/state/plugin/team.json` shows the Engineer and Lead inventory pinned to OpenClaw **2026.9.4**, not the researched **2026.9.9**. This is inventory evidence, not verification of a running container version.
- No deployment, plugin installation, restart, upgrade, credential migration or Onshape call was performed. No ClawCAD or Clawake file was changed.

Run the prepared diagnostic from a normal host terminal:

```sh
cd <workspace>
node clawonshape/scripts/host-diagnostics.mjs clawcad-mechanical-engineer
```

It reports runtime access, actual OpenClaw version, compiler/native private-file SDK availability and existing Claw-Onshape loading status. It suppresses raw errors and does not read credentials or invoke provider operations. It does not install the plugin. A version difference requires an explicit compatibility check before choosing installation versus a host upgrade; no automatic upgrade is proposed.

After runtime access is available, use existing Clawake facilities with a Claw-Onshape-owned inventory copy for a scoped installation preview. Begin with empty bindings and liveReads=false, verify native loading, then supply operator-owned OAuth application credentials and exact requester/context bindings. REST reads may be tested under the user's request to test the live integration; CAD writes/merge remain disabled. Existing ClawCAD REST credentials must not be copied or forwarded into MCP.
