# Duplicate plugin discovery — 2026-10-11

Verified read-only against both deployed OpenClaw 2026.9.9 containers.
No configuration, mounts, plugin installations or credentials were changed.

## Cause

Clawake's `templates/quadlet/openclaw.container.j2:26-28` mounts the whole
`workspace_path` at `/workspace` and its `.openclaw` child separately at
`/home/node/.openclaw`. Thus the installed extension is reachable through both
`/workspace/.openclaw/extensions/claw-onshape` and
`/home/node/.openclaw/extensions/claw-onshape`.

These are two names for the same directory, not two installation copies:

| Container | Directory device/inode at both paths |
| --- | --- |
| clawcad-mechanical-engineer | 58 / 2025072 |
| clawcad-robotics-lead | 58 / 2074650 |

Engineer's `dist/index.js` additionally has device/inode 58 / 2025079 at both
paths. `fs.realpathSync` returns distinct path strings: bind mounts are not
symlinks and do not canonicalize to one pathname.

## Runtime mechanism

Installed runtime files, inspected directly inside the Engineer container:

- `/app/dist/roots-Bd2Thqaj.mjs:9`, `resolvePluginSourceRoots`: returns a global
  extension root and a workspace root `<workspace>/.openclaw/extensions`.
- `/app/dist/discovery-Bi7H4pnb.mjs:1233`, `discoverOpenClawPlugins`: scans
  workspace candidates and combines them with shared global candidates.
- Same file, `createPluginScanner` at line 770 and `finish` at line 1071:
  deduplication keys use resolved/realpath strings, not filesystem device/inode
  identity. Both bind-mount paths therefore survive deduplication.
- `/app/dist/manifest-registry-build-vohx2tGx.mjs:807`: emits the duplicate-ID
  warning when registry candidates have the same plugin ID. Observed winner is
  the global installation; the workspace candidate is overridden.

The runtime reports `loaded`, with one duplicate diagnostic for Claw-Onshape
in each container. The warning does not demonstrate two register executions.
It is independent of Claw-Onshape's own tool registration logic and can affect
other globally installed plugins exposed by the same nested mount arrangement.

## Implication for remediation

Deleting either plugin path would delete the same underlying installation.
A clean structural remedy must keep the global extension directory outside
the workspace discovery root, or use a verified native discovery control.
Changing explicit load paths alone does not remove automatic workspace discovery.
No such remedy has been applied in this diagnosis.

`provenance-invalid` is also present, but its cause was not investigated here.
This diagnosis does not establish that correcting duplicate discovery will
correct provenance validation.
