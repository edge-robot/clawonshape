# Clawake-managed MCP dashboard deployment — 2026-10-12

The operator authorized deployment of the corrected readiness adapter and explicit
Lead awareness of Clawake. Claw-Onshape **0.2.1** was installed on Mechanical
Engineer and Robotics Lead through the existing Clawake host lifecycle. Both
native operator dashboard status calls succeed, installed backend/UI hashes match
the build, and both gateways return `/ready` HTTP 200. Full configuration, plugin
settings, grants, Discord/A2A and native MCP declarations remain unchanged.
Visual browser acceptance and a fresh Lead conversation remain operator steps.

## Artifact and preparation

The package/manifest/lockfile patch version is 0.2.1; the public guide and role
templates are included in the archive. The prior 0.2.0 archive was retained.
The new archive SHA-256 is:

`8329e6d50e23bde702d363b70a523877a938b66e3876be31f215698feafe857d`

`npm test`: **74 passed, 0 failed, 0 skipped**. Typecheck, build and packaging pass.
Private predeployment backups capture both runtime configurations, the original
inventory and the Lead role. No private native MCP credential storage was copied.
Backup directories/logs are restricted and excluded from Git and the package.

Only the Claw-Onshape artifact path/checksum changed in the managed inventory.
All configured plugin settings/enabled flags were compared to both live runtimes
before application and matched. The side-effect-free Clawake plan was inspected
in memory: exactly two container Quadlets changed, each with only the old/new
Claw-Onshape archive mount lines. No runtime configuration artifact was planned.

## Managed application

Administrative commands were run on the owning host outside the Lead/Engineer
sandboxes. Existing inventory: `state/deployment/team.json`. This installation
uses the existing Clawake checkout's `.venv/bin/clawake` executable; no new
administration service or agent tools were created.

For each member, preview setup and plugin synchronization before application:

```sh
clawake validate --config state/deployment/team.json
clawake setup --config state/deployment/team.json --member clawcad-mechanical-engineer
clawake sync-plugins --config state/deployment/team.json --member clawcad-mechanical-engineer
```

After the authorized previews, the applied operations were:

```sh
clawake setup --config state/deployment/team.json --member clawcad-mechanical-engineer --execute
clawake sync-plugins --config state/deployment/team.json --member clawcad-mechanical-engineer --execute
clawake setup --config state/deployment/team.json --member clawcad-robotics-lead --execute
clawake sync-plugins --config state/deployment/team.json --member clawcad-robotics-lead --execute
```

The Engineer was installed and checked before changing Lead. Setup refreshed the
archive mount and performed the managed service restart; sync verified/installed
the inventory-pinned plugins and performed its managed restart. Existing unrelated
plugins were synchronized at their unchanged pinned checksums. There was no manual
production plugin/config replacement and no production tool grant was added.

## Runtime checks

Both runtimes remain OpenClaw **2026.9.9**. Their package, manifest, dashboard,
MCP/readiness/connection/tool backend, UI entry and packaged Lead guide/template
hashes match the reviewed build. Native operator `plugins.sessionAction` with
`status` returns the new capability summary and independent MCP metadata.
The installed UI has separate Onshape REST/MCP sections and an explicit blocked
mutation label. These are bundle/status checks, not a browser screenshot or a
fresh CAD/provider acceptance.

| Runtime | REST status | MCP status | Safety gates |
| --- | --- | --- | --- |
| Mechanical Engineer | `connected`; provider reads remain unverified by status | configured=true, enabled=false, stored grant=true, expiry 2026-10-09T14:52:55.598Z, expired=true, operator action=true, connection UNKNOWN | Discovery HISTORICAL; CAD mutation BLOCKED |
| Robotics Lead | `oauth_configuration_required`, consistent with delegate-only role | configured=false; enabled/OAuth metadata UNKNOWN | Discovery HISTORICAL; CAD mutation BLOCKED |

Lead does not need direct Onshape OAuth for its delegate-only product role.
The latest Engineer REST status is connected; this deployment performed no OAuth
flow or token refresh, and it did not establish a new live CAD read/render result.
No full Discord/PNG E2E, MCP discovery or MCP/CAD tool call was repeated.

Semantic configuration comparisons, including all tools/agent entries, channels,
A2A, MCP and plugin settings, are unchanged for both members. Response checks
found no token/client-secret/authorization-URL/credential-location fields. Agent
`onshape_status` still uses the REST-only lifecycle; no MCP metadata was added to
agent tool results. Browser/low-authority session testing is still pending; unit
coverage and identical installed code are not substituted for that test.

## Lead instruction update

`agents/agent-lead.md` and `deploy/roles/robotics-lead.md` now explain that Clawake
owns host deployment, checksum-pinned installation, configuration/grant
reconciliation and Quadlet/systemd lifecycle. Administrator actions happen on
the owning host outside both agent sandboxes. Dashboard admin authority does not
confer host execution access; rootless Clawake does not imply a need for sudo/root.

The Lead must explain inspection/backup, preview, explicit approval, managed
application and verification to users. It must preserve existing permissions and
never bypass sandbox restrictions, request secrets in chat, delegate administration
to another agent or claim an unverified success. Deployment approval does not
authorize OAuth, MCP enabling/discovery/grants or CAD mutation.

The active Lead AGENTS.md was updated by the supported native `agents.files.set`
operator API with `expectedHash`, then verified through `agents.files.get`.
The previous role is preserved as a complete prefix; only instructions were added.
No conversation was reset and no message was sent to Discord.

- Previous Lead role SHA-256: `d14f21f4ba4fa366b7767c3b3b87bc0dd3072e7de8b1a12228f4f5ac3a7e77b8`
- Active Lead role SHA-256: `95bdd38fd9465c989bbebc4b9a643f408f5341ad101f6ce80eea560937d7d670`

Stored role correctness does not prove that an already-retained Codex thread has
refreshed its startup instructions. A user-started `/new` may be needed; do not
silently reset conversations or use `/reset soft` as a guaranteed role refresh.

## Operator continuation

1. Open the Engineer dashboard at `http://localhost:19489`, reload the page and
   select Claw-Onshape. Verify separate Onshape REST and Onshape MCP sections,
   MCP Configured Yes / Disabled, OAuth UNKNOWN with expired stored metadata,
   Discovery HISTORICAL and **CAD mutation: BLOCKED**. Do not click MCP/native
   sign-in or enable the connector. Report any mismatch.
2. If the existing Lead conversation should use the new instructions immediately,
   start `/new` deliberately in its existing Discord context. Ask it how this
   deployment is managed; it should explain Clawake and host-side administrator
   actions outside the agent sandbox. This is instruction acceptance, not a CAD
   task or an authorization to execute administration.

Only after this dashboard acceptance should isolated native MCP OAuth onboarding
and authenticated read-only discovery be considered as a separate explicitly
approved task. Mutation remains blocked on all four existing execution contracts.

## Rollback boundary

The original private inventory and Lead role are backed up, and the original
0.2.0 archive is retained. If rollback is required, use the saved inventory and
archive checksum through Clawake preview/setup/sync, preserving all runtime
configuration/grants, and restore the role with the guarded native operator API.
Do not delete state, copy credential stores or overwrite generated config by hand.
Rollback is a new administrator action requiring approval; none was performed.

No commit was created. Existing unrelated repository changes were preserved.
