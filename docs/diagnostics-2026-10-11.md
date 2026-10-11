# Native plugin diagnostics — 2026-10-11

Branch: `feat/native-plugin-foundation`. Initial inspection was read-only. Later approved remediation/deployment is recorded
below; no CAD state was changed. Current 0.2.0 read/render deployment and real
Discord delivery pass; provenance/duplicate diagnostics remain non-blocking.

## Initial runtime evidence (before product implementation)

| Observation | Mechanical Engineer | Robotics Lead |
| --- | --- | --- |
| Container | `clawcad-mechanical-engineer` | `clawcad-robotics-lead` |
| Running | Yes, Podman reports up | Yes, Podman reports up |
| OpenClaw / Node | 2026.9.9 / v24.21.0 | 2026.9.9 / v24.21.0 |
| Claw-Onshape | 0.1.0, loaded, imported | 0.1.0, loaded |
| Trust | provenance-invalid | provenance-invalid |
| Diagnostics | One duplicate-ID warning | One duplicate-ID warning |
| Plugin binding count / live reads | 0 / false | 0 / false |
| OAuth application configured | No | No |
| Native MCP | onshape, OAuth, disabled | No servers |
| Private-file SDK / local compiler | Available / absent | Available / absent |

Engineer full native inspection reports one optional factory (`names: []`),
contract `onshape_inspect`, CLI `onshape`, no hooks, services, routes or MCP servers.
An empty factory-name list is not proof of absent registration: this plugin uses
an identity-dependent factory. With zero bindings it returns null for every
agent. Neither runtime's global allow list contains `onshape_inspect` or native
Onshape MCP tools. Engineer retains `clawcad_render_current` and
`clawcad_explore_cad`; Lead retains `message`, `clawcad_delegate_render`,
`clawcad_delegate_exploration`. These historical tools are separate from this
plugin. No grants were changed. No authenticated agent/Discord turn was run;
running containers and successful CLI commands do not certify agent health.

## Duplicate discovery: CONFIRMED NON-BLOCKING for inspected loader

Fresh stat results confirm the same directory under both discovery roots:

| Container | device/inode, both paths |
| --- | --- |
| Engineer | 58 / 2025072 |
| Lead | 58 / 2074650 |

Paths: `/workspace/.openclaw/extensions/claw-onshape` and
`/home/node/.openclaw/extensions/claw-onshape`. See
[discovery mechanism](plugin-discovery-diagnosis.md): nested bind mounts survive
realpath-based deduplication. Native inspection explicitly says the workspace
candidate is overridden by the global candidate. It shows one selected plugin
and one optional factory, not two selected registrations. No duplicate exposed
tools are observed; agent execution remains untested.

Fresh `agents.entries` and `clawake-managed-plugin-runtime.json` inspection
agrees in both runtimes: Engineer `alsoAllow` contains the four existing ClawCAD
tools (`clawcad_render_current`, `clawcad_explore_cad`,
`clawcad_prepare_inspection`, `clawcad_compare_inspections`); Lead `alsoAllow`
contains `message` and the two delegation tools. Neither contains
`onshape_inspect` or native MCP tools. The managed marker is version 1.
`ensure_plugin_runtime_config` removes previously managed grants, merges the
current inventory grants and atomically records ownership. No reconciliation was
executed in this task; no current inventory drift/zero-change claim is made.

Deleting either path deletes the same installation. No deletion is safe here.
Clawake `templates/quadlet/openclaw.container.j2` mounts the workspace and its
`.openclaw` child at both roots. Proposed structural change: add a separately
configured state directory outside the workspace; migrate existing private state
with backup/ownership preservation; mount that at `/home/node/.openclaw`; remove
the old workspace extension discovery path only after validating migration.
Update Clawake state-path consumers and template tests together. Preserve agent
workspace content, credentials and rollback. This is a cross-repository proposal,
not a change made here. Explicit plugin load paths alone do not fix scanning.

## Provenance: CONFIRMED NON-BLOCKING for loading; trust acceptance BLOCKED

Do not equate loaded with trusted. Engineer native report identifies the registry
as `/home/node/.openclaw/state/openclaw.sqlite`, install source `archive`, source
`/opt/clawake/plugins/claw-onshape.tgz`, install path matching the global root,
version 0.1.0, and an accepted surface containing only `onshape_inspect` and
`onshape`. The record exists even though `plugins.installs` is absent in JSON
configuration: installation records moved to native registry storage.

Inspected `/app/dist/installed-plugin-record-match-C0WqJ8ST.mjs`,
`resolvePluginTrust`: bundled, path origins, missing records, path mismatch and
trusted official installations have separate branches. An archive record that
reaches the final fallback gets `provenance-invalid`. Thus this result is not
evidence of a corrupt archive or duplicate discovery causing invalid provenance.
The selected global archive is evaluated separately from the overridden workspace
candidate. No official trust status should be fabricated for this private package.

Both installations match all 14 regular files in the mounted archive byte for
byte, including package/manifest/dist metadata. Engineer mounted archive SHA-256:
`a0c5e604149552dad681e30c35fa931399feaddfc1a0a9bedb1c72a2b8d90f78`.
This certifies current archive/install agreement, not registry publisher trust.
Clawake `services/plugins.py:verify_plugin,_verify_mounted_artifact,sync_plugin`
checks archive hashes and invokes native install with capability acceptance;
this is distinct from OpenClaw's provenance classification.

Proposed Clawake change: report native trust reason after archive installation,
alongside archive checksum and accepted surface, with an explicit private-archive
policy. Investigate a supported native local/archive trust mechanism before
altering packaging. Pinned npm is not automatically official provenance. Do not
edit SQLite, invent provenance metadata, suppress warnings or reinstall blindly.

## Commands and acceptance boundaries

- `podman ps --format '{{.Names}} {{.Status}}'`: both running. Sandbox attempt
  failed on read-only `/run/user/1000`; approved host execution succeeded.
- `node scripts/host-diagnostics.mjs <container>` for both: loaded, version and
  trust results above. Approved read-only host execution.
- `podman exec ... openclaw plugins info claw-onshape --runtime --json`:
  Engineer full registry/install/factory evidence.
- Node `statSync` and projected non-secret config inspection in each container;
  `tar -tzf` / `tar -xOzf` byte comparison through Node, 14/14 in each.
- Installed native provenance and MCP call-route source inspected read-only.
- `npm test`: build and 19/19 offline tests pass. No new implementation fix was
  justified; tests use mocked host/provider contracts.
- `npm run typecheck`: BLOCKED, `tsc` absent; no typecheck claimed.

No credentials were read or printed. No mutation surface or extra grant was
added. Loader operation is confirmed; live agent continuity, requester-scoped
tool catalog and end-to-end duplicate-call behavior still require authenticated
runtime acceptance. No issue is classified FIXED in this task.

## Product increment deployment

Clawake setup/sync-plugins/restart applied archive 0.2.0 on Engineer and Lead. Existing grants were retained; Engineer gained optional onshape_status/onshape_inspect/onshape_render, Lead gained only onshape_delegate_render. Engineer runtime inspection: loaded, four optional factory registrations, one callback route, native Control UI entry. Live scoped dashboard status invocation succeeds. Duplicate warning and provenance-invalid persist; loading is not provenance acceptance. No REST writes or MCP execution were enabled.

The first restart hit an OCI read-only parent mountpoint error. Creating only the approved empty child directory in the existing artifact mount and retrying through Clawake fixed startup. Secret mounts are Engineer-only; shared signing key is private, and new PNG artifact mount is writable Engineer/read-only Lead. Tests: 29 pass; native SDK typecheck passes.

### Product policy/role corrections

The operator explicitly authorized a focused Clawake change. `global_tool_allow` is now validated and reconciled alongside per-agent grants, preserving existing denies and unrelated entries. 48 focused Clawake tests and lint pass. Clawake applied the exact new read-only names and restarted both runtimes; signed native A2A renders then passed twice.

The first real Discord attempt failed because pre-existing Lead AGENTS.md explicitly directs the same request to the old ClawCAD delegate. Focused read-only AGENTS.md mounts are now supplied through Clawake from this repository's private deployment state; original ClawCAD documents were not edited. The unused, host-blocked conversation hook experiment was removed. Final source: 29 tests and exact SDK typecheck pass. OAuth remained connected after managed restarts.

### Native role-file correction after reset test

The user sent `/reset soft` in the correct Discord #clawcad channel and received startup acknowledgement. At 16:07 a new request still invoked the historical delegate in the original Codex backend rollout. The prepared developer instruction snapshot still contained old AGENTS.md, although `agents.files.get` and direct container reads showed the new nested-mounted file. Therefore the earlier claim that a soft reset alone would refresh routing was insufficient; the precise overlay/snapshot interaction is not proven.

Clawake removed the nested AGENTS.md mounts. Original runtime files were backed up privately, and the supported native `agents.files.get/set` API updated AGENTS.md in the underlying deployed workspaces with expectedHash checks and get-after-set verification. No generated JSON configuration or ClawCAD source file was edited. Lead role hash: `d14f21f4ba4fa366b7767c3b3b87bc0dd3072e7de8b1a12228f4f5ac3a7e77b8`; Engineer role hash: `94b0c57b79a09a89eb7460657c805991f4f225b69cd327533497d1269b4c7882`. Operator adapter: `scripts/apply-runtime-role.mjs`; versioned source: `deploy/roles`. A new real Discord request is pending; no further reset was requested.

### Latest Discord acceptance blocker (16:29 local)

The real request again selected historical `clawcad_delegate_render`; no verified Discord image was delivered. Installed Codex adapter source and its workspace-snapshot test establish that saved `agentWorkspaceDeveloperInstructions` override updated AGENTS.md on thread resume. Fresh native bootstrap reads the new role correctly. `/reset soft` retained the old native rollout in this case. A fresh `/new` session is the documented next acceptance action; its result is pending. Live Claw-Onshape OAuth, pinned REST render and operator native signed A2A probe successes remain distinct from Discord acceptance.

### 17:11 fresh-session / direct A2A diagnosis

The new Discord session invoked onshape_delegate_render and reached the Engineer. Native Engineer logs exposed and invoked onshape_render/onshape_status; their actual result was reconnect-required, not insufficient user grants. OAuth metadata independently showed expiry and an existing refresh credential. Signed failure metadata was absent from text-only tool transport, producing an unsigned A2A answer and a misleading delegation_denied response. Status and render errors now put signed JSON in text content, and malformed final A2A results use delegation_result_invalid. Shared serialized OAuth refresh was added using ClawCAD's denial-before-uncertain-exchange pattern. Its first live attempt was unsuccessful; precise provider/parser cause was not captured, so renewal success is not claimed. The credential store remains closed; fresh browser consent is required.

After deployment, an autonomous direct operator Lead→Engineer test completed in 18,289 ms and verified a signed disconnected response from the real native bridge and Engineer turn. No Discord send, identity impersonation or CAD write occurred. Historical successful PNG acceptance remains historical. Current connected/render acceptance is pending renewed consent. 31 tests, SDK typecheck and whitespace checks pass. See product-mvp-status.md for exact rollout evidence and final archive digest.

### Current recovered state / post-refresh native A2A PNG

Current consent/connection pass. A targeted fresh-grant refresh test forced the local refresh branch but sent a real Onshape POST: HTTP 200, strict token validation passed, persisted connected. Returned expires_in 3572; token values unchanged. Rotation and successful provider-expired renewal are not established; the previous expired-token HTTP-200 validation failure remains unexplained. The temporary private response was removed after validation, without token output. Subsequent autonomous Lead→A2A→Engineer→REST render completed in 16,242 ms: signed result verified; status ok/code ready; pinned microversion b83ee0a0efcda65537780ef8; 42,710-byte / 800×800 PNG at /workspace/artifacts/claw-onshape/519b9453277641b963f7c821b1b4afdf.png; sha256 3475c98025ecc2b6abc31eba18db48888843e4fa8570422cc0ab8f048f2e5c26. No Discord send or CAD change occurred. Ordinary real Discord request is the remaining image-delivery acceptance.

## Final product acceptance

Real Discord read/render journey passed at 19:01 UTC; user confirmed the image. Explicit global grants, current native role routing and signed A2A result transport now work. Duplicate discovery and provenance-invalid remain non-blocking diagnostics, not FIXED. OAuth expiry/rotation reliability is a separate follow-up; no CAD write or broader privilege was enabled.
