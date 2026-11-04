# Workspace/state migration — 2026-10-14

The current two-agent deployment uses `deploy/team.json` as its single inventory.
The legacy local inventory filenames under `state/deployment/` link to that file;
there is no second independently editable self-hosted variant. Agent/container IDs
remain `clawcad-robotics-lead` and `clawcad-mechanical-engineer` to preserve A2A,
trusted bindings, Workshop ownership and historical session keys.

## Sources and private data

| Purpose | Host location relative to ClawOnshape | Container location |
| --- | --- | --- |
| Lead workspace | agents/robotics-lead/workspace | /workspace |
| Engineer workspace | agents/mechanical-engineer/workspace | /workspace |
| Role definition | agents/<role>/definition | /team-definition (read only) |
| Runtime state | state/openclaw/<role> | /home/node/.openclaw |
| Agent environment | state/secrets/<role>.env | Quadlet EnvironmentFile |
| Delegation key | state/secrets/delegation | /run/claw-onshape-delegation (read only) |
| OAuth application secret | state/secrets/oauth | /run/claw-onshape-oauth (read only) |
| Native Onshape connection records | state/secrets/oauth/connections | /home/node/.openclaw/claw-onshape/credentials (Engineer writes) |
| External MCP token | state/secrets/onshape-mcp | /run/onshape-credentials (Engineer writes, MCP reads) |
| Verified render artifacts | state/artifacts | /workspace/artifacts/claw-onshape |
| Pinned plugin archives | state/packages | /opt/clawake/plugins/claw-onshape.tgz (read only) |

Operating instructions are the actual workspace `AGENTS.md`. Deployment roles are
`definition/ROLE.md`. Old agent/role documents are compatibility links rather than
independent instruction sources. Full supporting contracts and their referenced
knowledge are available inside each mounted workspace. Existing active instructions
and private memory files were copied, then contradictory old routing/MCP guidance
was corrected. Missing persona/identity/user/memory files received small explicit
initial contents; existing files were not overwritten with templates.

OpenClaw 2026.9.9 remains pinned. Full native state, SQLite histories, provider
credentials, Workshop proposals and installed edited skills were copied offline.
Native OAuth connection records were separately relocated offline into
`state/secrets/oauth/connections`. A nested bind preserves Claw-Onshape's existing
private SDK container path and sole credential ownership. The current grant was
privately backed up before relocation and survived the managed restart; a fresh
Gateway-owned native skill read afterwards succeeded without renewed consent. No refresh token
is exposed to MCP. The external handoff has mode 0600 and contains only access token,
expiry and scopes. A successful fresh dashboard authorization after migration has
`OAuth2Read`; this migration grants no CAD mutation permission.

Clawake's optional absolute `state_path` drives container/volume mounts, runtime
configuration, plugin ownership ledger, backup sources, browser cache and upgrade
Doctor mounts. Missing `state_path` retains `workspace_path/.openclaw`. Shared
runtime directories and unsafe explicit state paths are rejected. `stop` and
`onshape-mcp --action stop` preview by default and retain definitions/data.

## Editable Workshop skills

The three Engineer skills remain active exclusively in native private Workshop
state. They are visible at `http://localhost:19489/skills/workshop`. Package `skills/`
contains delivery templates. Reviewed exports under
`agents/mechanical-engineer/exports/workshop-skills/` are outside the active
workspace and never registered as a competing skill source.

From the parent repository directory, preview an export:

```bash
node clawonshape/scripts/workshop-skills.mjs export \
  --agent clawcad-mechanical-engineer --container clawcad-mechanical-engineer \
  --directory clawonshape/agents/mechanical-engineer/exports/workshop-skills
```

`--execute` writes the reviewed export and hash manifest. Differing existing export
files are preserved for review, rather than silently replaced. The deployed three
skills have no supporting files. Resource-bearing native entries fail closed when
this deployed API cannot supply a complete resource export; no filesystem read is
substituted for an unavailable native resource API.

Import uses the same command with `import`. Preview displays current/proposed
hashes. `--execute` creates a native proposal and applies only its exact revision.
An existing differing skill additionally requires `--expected-current-sha256 HASH`;
a concurrent installed-content change prevents application. Existing customizations
are never overwritten by initial provisioning. Workshop proposals remain the
normal user editing workflow.

## Backup, cleanup and acceptance

All three managed services were stopped through previewed Clawake operations.
A private complete archive was created with ownership, mode, ACL and xattr metadata,
then checked by reading the archive. Its manifest records byte size and SHA-256.
Workspace/state/secret copies were verified with an independent rsync checksum
comparison before edits. Nested Git repositories and runtime trees were excluded
from workspace copies, and old demo artifacts remain in the private backup.

The native OpenClaw uninstall command removed `clawcad-readonly-demo` from both
agents and `clawcad` from Engineer. It leaves explicit `enabled:false` tombstones;
these are not installed or loaded plugins. Their extension directories and install/
load records are absent. All six old optional tool names were removed from agent
and global policy. Old demo artifact and `/run/clawcad-demo` mounts were removed.
Runtime audit proves no active mount, env path or package path uses the old repos.

Claw-Onshape 0.2.5 is deployed from `state/packages`, pinned to SHA-256
`286d8253a03ad8821bd8a5ca313b466075dc10f4e329a31720953955870ea4c3`.
Its package allowlist excludes live workspaces, exports, private state and secrets.
The MCP fork/image pin and read-only target/write policy are unchanged.

Technical evidence after dashboard reauthorization:

- Lead and Engineer readiness: HTTP 200; MCP health and readiness: HTTP 200.
- Exactly the existing Lead, Engineer and `clawonshape-mcp` containers run, each
  owned by its corresponding user systemd service/Quadlet.
- Engineer Gateway run `7900fed0-5a69-4fa2-bb6f-ffd05648d004` completed cleanly,
  using native Workshop/auth/explain/api-call tools, returning width `50 mm`, feature
  `F37MrGsqQOiSdYi_0`, evaluation `OK`, microversion `b83ee0a0efcda65537780ef8`.
- Signed A2A inspection `3bb58558-c953-4888-a6c7-322b4119ebf8` completed with an
  independent REST match. A separate fresh render returned a validated 42,710-byte
  PNG at the same microversion. These operator adapter checks do not alone prove
  fresh Discord ingress or Lead model tool selection.
- All three installed Workshop skill hashes match the pre-migration native exports;
  a fresh browser session shows all three skills on the connected Workshop page.
- Clawake: 261 tests and Ruff pass. ClawOnshape: 85 tests and typecheck pass.

The first post-migration read found the external token unavailable. It is retained
as failed evidence; it is not counted as a successful live read. The operator's
new dashboard authorization restored the handoff and the successful reads above.

Fresh Discord acceptance completed: human input `1559907988398153731`,
PNG reply `1559908114743164938`, and final measured reply `1559908313129558057`.
Native Lead history records `onshape_delegate_render` and `onshape_delegate_inspect`.
Authenticated A2A task `1302e919-01ac-488b-b24f-a1f859d9f6c7` completed with one
signed result; its Engineer transcript records native auth/explain/api-call and
`onshape_verify_feature_read`. These transcripts/results are retained privately.

After acceptance, the entire original `clawcad/state/demo` directory was moved
intact into the private ClawOnshape migration backup as `legacy-deployment`. No
workspace/history/artifact files were deleted. No installed current Quadlet
references either old repository path. The complete offline archive also remains. No historical conversations are rewritten. Nothing has been committed or
pushed. Git-ignore checks cover state, user memory, credentials and env/key files;
reviewed role/persona/instruction files and skill exports are the intended Git data.

## Hole-diameter question: current product boundary

The existing Lead inspection tool accepts an empty object and dispatches a fixed
plateWidth task. Its independent observation verifier likewise admits only
plateWidth, feature ID/state and microversion. The installed Engineer inspection
skill already supports hole parameter reads, but this domain request cannot pass
through that fixed Lead contract. Skills alone cannot change a registered tool's
argument schema or signed result verifier. A bounded generic read request/result
contract would let Engineer skills select and interpret parameters while the
control plane retains identity, target, revision and evidence verification.

A fresh Engineer Gateway run after the final credential relocation,
`f263ca09-1336-43d9-8bb5-8ab4876d9dc5`, used native skill_workshop, auth, explain and
api_call. It returned `holeDiameter = 4 mm` for `F37MrGsqQOiSdYi_0`, state `OK`,
microversion `b83ee0a0efcda65537780ef8`. This is parameter evidence and does not
prove every geometric opening's diameter. No read-contract extension or CAD
mutation was performed in this migration.

Overall migration/base read-only demo: PASS. The additional hole question through
Discord remains unsupported by the existing width-specific delegation contract.
For the live demo paste: “Inspect the current Camera Mount Plate in Onshape.
Delegate to Mechanical Engineer, report current plateWidth, feature state and
microversion from fresh native MCP data, and show the current image. Do not modify
the CAD model.” If Discord is unavailable, use the existing authenticated
Lead-side delegation adapter as the operator fallback; this preserves the Engineer
Gateway, native MCP, real Onshape and signed independent verification path.

The MCP implementation pin remains `612de76266efedc6b1f7fcc1fafe3063837ae8da`; image
`localhost/clawonshape-mcp:612de76-external-token-v3` at digest
`sha256:51fff34f3180a2c2bf5ede12f89c3b88e8290640696b54131fd3c1b21c51cde6`.
The binary SHA-256 remains
`3afe162c304ef4bd2cfa10e4ee3d00b718ae5644ce35d94c72815e365986a26e`.
The previously stale temporary MCP instance/service was already removed through
Clawake teardown; this migration replaces the two existing agent Quadlets rather
than creating competing containers. Current service ownership is each matching
user unit: `clawcad-robotics-lead.service`, `clawcad-mechanical-engineer.service`,
`clawonshape-mcp.service`, generated from the owning user's Quadlet directory.

Final acceptance after OAuth store relocation and legacy deployment retirement:
A2A inspection `e86cede9-d5a2-4e91-b4d0-354b429b77a4` again completed with
`independent_rest_match` and the same live width/state/microversion. Both agents
and MCP still pass readiness, the Clawake setup preview has zero changes, and
the temporary MCP service is `not-found/inactive`. The deployed MCP binary hash
was read directly and matches the pin above.

Operator fallback command from the parent workspace:

```bash
podman exec -i clawcad-robotics-lead node --input-type=module \
  < clawonshape/state/deployment/a2a-native-read.mjs
```

This existing local diagnostic invokes the installed signed Lead delegation
adapter and the normal Engineer Gateway/native MCP path. It prints the verified
read result without sending Discord messages or changing CAD.
