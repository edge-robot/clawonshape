# MCP dashboard runtime acceptance — 2026-10-12

**Current verdict: managed deployment and native status PASS; visual browser acceptance pending.**
The initial BLOCKED verdict below is historical. See the later
[Clawake deployment record](clawake-mcp-dashboard-deployment-2026-10-12.md). The later adapter
correction and native in-memory validation are recorded in the follow-up below;
the initial inspection evidence remains unchanged. Inspection completed against the real OpenClaw 2026.9.9
runtimes. The running Claw-Onshape 0.2.0 archive predates the readiness increment;
the new REST/MCP sections are not deployed. Separately, projecting the actual
native disabled-server record through the working-tree implementation **FAILS**
the configuration/disabled-state acceptance criterion. No feature code, runtime
configuration, grants, credentials, deployment settings or production files were
changed by this acceptance task. No restart, OAuth, refresh, discovery, MCP tool
call, CAD call or Discord/A2A turn was performed. No commit was made.

Evidence collected on October 12, 2026; final fingerprint comparison completed
by 11:49 UTC. Existing unrelated working-tree changes were preserved. Native CLI
output was buffered privately and only allowlisted observations were displayed;
this report contains no tokens, auth URLs or credential locations.

## Runtime and deployment identity

Both managed Podman containers were running before inspection and remain running.
Both identify OpenClaw **2026.9.9**, Node **v24.21.0**, and enabled/loaded
Claw-Onshape **0.2.0**. The shared immutable image digest is:

`sha256:7f10d5cc975a90b65192eaa099454fe33ce8ce2390806c61c65cd868e9ef730d`

The selected plugin installation is `/home/node/.openclaw/extensions/claw-onshape`,
with entry `dist/index.js` and dashboard entry `dist/control-ui/product/index.js`.
The installation at `/workspace/.openclaw/extensions/claw-onshape` is an alias of
the same device/inode within each runtime, rather than an independently installed
copy. Both native plugin inspections report `loaded`, `provenance-invalid` and
one warning. The alias/provenance conditions were already documented in
[October 11 diagnostics](diagnostics-2026-10-11.md); no trust improvement or new
trust acceptance is claimed.

Both mounted deployment archives have SHA-256:

`381839f47ed2f0b41d41dec735519e9a00799dd8b0bfbbe3e3e9558b243f6545`

This matches the earlier accepted read/render archive, not the new working tree.
Local HEAD is `42f41b3a03880b4596ff8684f95933ccb1751d06` with uncommitted changes.
Version 0.2.0 alone cannot distinguish the earlier installation from this increment.
Both runtime installations have identical inspected package/manifest/backend/UI
hashes; all inspected hashes differ from the local built artifacts.

| File | Installed SHA-256 (both runtimes) | Working-tree build SHA-256 |
| --- | --- | --- |
| `package.json` | `c92751eae9fe8fbeb8e82e1d9a175723b18a9e459d3d529159a8c04111f075f1` | `ba294e327b9cf3928f159f527a534f947a156428d9f7be50e771c2d093e68fb0` |
| `openclaw.plugin.json` | `605d7535c96b7a7f4679badbc81700936aef229f6e693b959df038c4fa3011d1` | `7bba23c3fd1c20eda9070dd1ee4b71d0736448f13e759def2cfecfb71b1862b5` |
| `dist/dashboard.js` | `e99b88ce761a913aab0c7796c52c129b9f02fd9fda1d973f20a60290f3712319` | `55d2cc277ca1142cb945b2ff73a1c9045a12d932a33682eebfa205040fd3afff` |
| `dist/mcp.js` | `9e10b805bcc7a320e8f8e87e65a50ab529dd21edcd5d56badb8281fbc0a7516c` | `8dc44cda80ce52c706834996e5e6a9d0ebab3ca24db13f981f7add2946764e0d` |
| `dist/readiness.js` | `ec81a920b1458b2cf6c11bb7d3c328779c59da29c77a4d28e05ef4220f0e6e15` | `c023356f213b2e7c22c9f89d7989b1f5fb310657e5ba8563cdc7c03f554e269c` |
| `dist/control-ui/product/index.js` | `2fe5b7d04e77b9742b658be9de6b73768af23493a63d80f0bf1c93fab67010b7` | `72f8296227a98352983aea195ec4da7af27292ed188cf3c6898fb5df0540bcce` |

## Baseline fingerprints and production grants

The following SHA-256 fingerprints were taken before native MCP/dashboard status
checks and compared after inspection. Full configuration hashes include Discord,
A2A, plugin bindings, native MCP declarations and policies without disclosing their
contents. The grants fingerprint covers serialized tools and agent entries.
No configuration/grant/target/plugin/archive fingerprint changed in either runtime.

| Runtime | Configuration SHA-256 (before = after) | Tools/agent-entry SHA-256 (before = after) |
| --- | --- | --- |
| `clawcad-mechanical-engineer` | `b21d3e2fdc2c5fa5eeac6291554dd0f06e3fc144d4bb04b93a42038c0275e695` | `1afc9c4a079018a00286a7bc9494b1085287f6a366bdb036239ff93f888b6113` |
| `clawcad-robotics-lead` | `cb5ff86a202b66a125b4acfd7fbb7b3b2754f9bc04513569e4ad88324d07ad28` | `774544d5819e85e125e4625c8c4ef072a864671f2f726c9c5034fd69a22318a0` |

Engineer remains enabled with `liveReads:true` and one binding. Lead remains enabled
with `liveReads:false` and one binding, delegating reads to Engineer. Both configured
target fingerprints are unchanged:

`d9f7820d557fdca66d7e8677a7810db8f6453842d6031645273590243b28fe0f`

| Runtime | Global allow | Agent alsoAllow |
| --- | --- | --- |
| `clawcad-mechanical-engineer` | `clawcad_render_current`, `clawcad_explore_cad`, `onshape_status`, `onshape_inspect`, `onshape_render` | `clawcad_render_current`, `clawcad_explore_cad`, `clawcad_prepare_inspection`, `clawcad_compare_inspections`, `onshape_inspect`, `onshape_status`, `onshape_render` |
| `clawcad-robotics-lead` | `message`, `clawcad_delegate_render`, `clawcad_delegate_exploration`, `onshape_delegate_render` | `message`, `clawcad_delegate_render`, `clawcad_delegate_exploration`, `onshape_delegate_render` |

Both retain profile `coding` and deny `exec`, `process`, `read`, `write`, `edit`,
`apply_patch`, `browser`, `web_fetch`, `web_search`, `sessions_spawn`, and `gateway`.
No native Onshape MCP tool grant appears in these production policies, and none
was added. Existing historical ClawCAD grants were preserved without invocation.
Engineer has exactly one configured native MCP server (`onshape`, OAuth, shared
identity, Streamable HTTP, disabled); Lead has no native MCP servers. These
configuration states are identical before and after inspection. The plugin
readiness integration adds no server registration in the working-tree source.

## Native status observations and side-effect verification

The documented `openclaw mcp status --json` exists and exits zero in both runtimes.
The native response envelope contains `path` and `servers`; `path`, launch details
and all unrelated OAuth metadata were discarded from displayed/report evidence.

Engineer returned the following allowlisted native record:

```json
{
  "name": "onshape",
  "configured": true,
  "enabled": false,
  "ok": false,
  "transport": "streamable-http",
  "auth": "oauth",
  "authStatus": {
    "state": "authorized",
    "hasTokens": true,
    "requiresAuthorization": false,
    "expiresAt": 1791557575598
  }
}
```

Expiry is October 9, 2026 at 14:52:55.598 UTC, already in the past. Native
`authorized` is a saved-token presence label, not proof of current validity or
provider access. Native `requiresAuthorization:false` does not prove renewal is
possible. A correct dashboard should show stored grant, expired metadata,
operator action required and current OAuth connection UNKNOWN, with mutation
still BLOCKED. Lead's valid empty server list projects configured=false.

Installed public source inspected read-only:

- `mcp-cli-Dt7GFrqd.mjs`: status loads configuration, builds entries and writes
  projected JSON. `ok` is computed as `enabled && Boolean(resolved)`.
- `mcp-config-Bg046Zf5.mjs`: listing reads the source configuration snapshot;
  mutation functions are separate and are not dispatched by status.
- `mcp-oauth-BxoraIn0.mjs`: status delegates to the prepared/read-only store and
  projects metadata; it does not call access-token resolution or refresh.
- `mcp-oauth-store-BdQs9xoR.mjs`: read-only status uses an existing-state read,
  explicitly without creating/repairing the database; projection tests saved
  presence and expiry only.

These files were reviewed as source, not imported as a runtime workaround. Native
credentials were accessed only by OpenClaw's supported status command; no private
credential files/database were inspected, copied, hashed or reverse-engineered.
The selected status path does not create an MCP runtime, connect, probe, initiate
or complete OAuth, refresh, call tools or write native configuration/grants.
Configuration/grant fingerprints confirm no changes. No packet capture was run;
absence of network/OAuth effects is supported by the inspected dispatch/read-only
code, rather than inferred merely from a successful command or disabled state.

## Projection defect and timeout observation

**FAIL: disabled configuration cannot be represented accurately by current code.**
`src/mcp.ts:36` requires `server.ok === true` before assigning configuration,
enabled state or OAuth metadata. Native 2026.9.9 deliberately emits `ok:false`
for a valid disabled connector. Feeding the actual allowlisted record above into
the existing built `projectMcpStatus` yields:

```json
{
  "configured": null,
  "enabled": null,
  "oauth": {
    "status": "UNKNOWN",
    "storedGrant": null,
    "requiresOperatorAction": null
  },
  "discovery": { "status": "HISTORICAL" },
  "mutation": { "status": "BLOCKED" }
}
```

The safe UNKNOWN fallback prevents optimistic authorization, but does not satisfy
accurate configured/disabled reporting. The mocked disabled-server fixture in
`tests/mcp-readiness.test.mjs` sets `ok:true`, unlike native output, explaining why
the previous 72 passing tests missed this contract mismatch. No code was changed
in this runtime-validation task.

Engineer native status took **5,554 ms** and Lead status took **4,641 ms** in the
observed invocations. `src/mcp.ts:69` sets a **5,000 ms** timeout. Engineer's observed
command duration exceeds that budget, adding an availability concern even after
the schema defect is corrected. This is one measurement per runtime, not a
latency distribution or a claim that every future invocation must time out.
The production five-second adapter itself is not deployed and was not executed.

## Dashboard and regression observations

Native operator-authorized gateway CLI requests used only
`plugins.sessionAction` with plugin `claw-onshape`, action `status`, empty payload.
The existing native operator credential was not printed or copied. This exercises
an authenticated operator RPC connection, not the user's existing browser session.
No browser automation/session attachment was available in this environment;
visual rendering and browser-specific negative authorization checks remain pending.

| Check | Engineer | Lead |
| --- | --- | --- |
| Local gateway `/health` | HTTP 200 | HTTP 200 |
| Local gateway `/ready` | HTTP 200 | HTTP 200 |
| Operator dashboard status | `reconnect_required` | `oauth_configuration_required` |
| Configured connection count | 1 | 1 |
| MCP metadata in deployed dashboard response | Absent | Absent |
| REST capability matrix in deployed response | Absent | Absent |
| New REST/MCP headings and blocked label in installed UI bundle | Absent | Absent |
| New native status integration in installed backend | Absent | Absent |

REST connection selection remains configured and unchanged. Engineer currently
requires REST renewal; this is the baseline state of the earlier deployment, not
evidence of a regression caused by an increment that is not installed. Lead has
no direct REST OAuth application, consistent with its delegate-only role. Current
REST read/render provider availability cannot be accepted from these status checks.
No automatic renewal, consent, REST probe or full Discord/PNG E2E was attempted.

Both loaded gateways and configured role tool grants remain intact. Full
configuration equality establishes unchanged Discord/A2A settings, target binding,
permissions and MCP declarations. This supports host/configuration regression
checks, not proof of a fresh successful Lead/Engineer conversational turn.

## Security checks and acceptance matrix

No token values, refresh tokens, authorization codes, client information, auth URLs
or credential locations were included in displayed metadata or this report.
New metadata remains operator-only in working-tree source: dashboard checks
`operator.read`, while agent `onshape_status` calls the REST-only lifecycle.
Runtime enforcement of that new integration cannot be accepted until it is deployed.
No grants/settings/native credentials were changed. Historical discovery and
blocked mutation survive the local projection, but are not yet displayed by the
production bundle. No new MCP credential-management endpoint or control was used.

| Acceptance criterion | Result |
| --- | --- |
| OpenClaw 2026.9.9 | PASS on both runtimes |
| Correct new Claw-Onshape source identity | BLOCKED: 0.2.0 label matches, source/build hashes do not |
| Separate REST/MCP dashboard render | BLOCKED: readiness bundle absent; browser session untested |
| Native projection matches disabled runtime state | FAIL in working-tree projection: `ok:false` is rejected |
| No secret leakage in inspection/report | PASS for observed allowlisted outputs; new deployed UI untested |
| MCP remains disabled | PASS; Engineer disabled, Lead absent, unchanged |
| Discovery HISTORICAL | PASS in local projection; production display BLOCKED |
| Mutation BLOCKED | PASS in local projection; production display BLOCKED |
| Production grants unchanged | PASS, before/after fingerprints equal |
| No REST configuration/readiness regression | Configuration preserved; baseline renewal required, live provider availability unverified |

Previous implementation validation reported 72 tests passing, typecheck/build and
diff checks passing. Those are offline results, not native acceptance; this run did
not repeat them or reinterpret them as a successful runtime integration. Only this
acceptance report was added to the repository by this task.

## Remaining blockers and deployment authorization boundary

1. Correct the demonstrated native disabled-status contract mismatch before
   deployment; add the actual `ok:false` record as a regression fixture.
2. Validate an adequate bounded status timeout on the pinned host; the observed
   Engineer invocation exceeded five seconds.
3. The running archive must then be replaced through approved Clawake management;
   both backend and browser bundle need matching source fingerprints. No manual
   production file replacement is permitted or was attempted.
4. An accessible operator browser session is needed for visual REST/MCP acceptance
   and runtime access checks after installation. Current REST renewal remains a
   separate operator action, outside this task's no-OAuth scope.
5. Existing provenance-invalid/alias-discovery conditions remain documented;
   no new trust acceptance or duplicate-free claim is made.

The required later deployment action is: package the corrected build as a new
checksum-pinned archive; update only the Claw-Onshape artifact/checksum in the
existing Clawake inventory with all grants/config preserved; run managed setup if
its archive mount changes; then run `clawake sync-plugins --config
state/deployment/team.json --member clawcad-mechanical-engineer --execute` and the
corresponding Lead command, using Clawake's managed restart/health verification.
These inventory/install/restart changes require explicit operator authorization
under this task. They were not proposed for execution with the known broken build,
and no authorization to perform them was inferred from prior deployment history.
No deployment setting, installation or restart was changed while reporting BLOCKED.

## Exactly one next task

**Correct the fixed-provider status adapter against the native 2026.9.9 disabled
record, including a regression fixture and a host-validated bounded timeout.**
This is the smallest prerequisite to safe deployment acceptance. Isolated native
MCP OAuth onboarding and authenticated read-only discovery must remain deferred
until dashboard acceptance passes and the operator explicitly approves that work.


## Follow-up — corrected adapter and bounded native execution

After the operator authorized the smallest adapter correction, `src/mcp.ts` was
updated to accept boolean `ok:false` as valid native metadata. Configuration and
enabled state are independent of the native transport-summary flag; no CONNECTED
claim is added. Missing or non-boolean `ok` still fails closed. The native command
now has a 15,000 ms timeout, retaining its 1 MiB output bound, fixed arguments,
sanitized failure behavior and read-only status command.

`tests/fixtures/native-mcp-status-2026.9.9.json` contains only the allowlisted native
disabled-server record from the initial inspection. Regression tests now verify
configured=true, enabled=false, stored grant=true, expired timestamp and required
operator action, with OAuth UNKNOWN, discovery HISTORICAL and mutation BLOCKED.
Other mocked disabled records now use native `ok:false` semantics. Tests also cover
malformed flags, incomplete OAuth metadata and enabled/unresolved transport without
claiming authorization.

The exact newly built adapter and its readiness dependency were loaded as in-memory
JavaScript modules through Podman stdin, with built-in Node imports unchanged.
Its default `mcpReadiness()` executed the real `openclaw mcp status --json` via the
15-second `execFile` path. No plugin files were installed/replaced and no service
was restarted. Execution was gated on the production Onshape connector remaining
disabled (or absent). No private credential-store inspection was performed.

Validated built `dist/mcp.js` SHA-256:

`c29e3caec47b66a1707e0c6358c30ab047167c5e33adefb95de6b4f519d13502`

| Runtime | OpenClaw | Adapter duration | Observed projection |
| --- | --- | --- | --- |
| Mechanical Engineer | 2026.9.9 | 5,517 ms | configured=true, enabled=false, stored grant=true, expired=true, operator action=true, OAuth UNKNOWN |
| Robotics Lead | 2026.9.9 | 4,748 ms | configured=false, enabled/OAuth metadata UNKNOWN |

Both completed inside the 15-second budget. This validates the bound on the
observed pinned hosts, not an unlimited latency guarantee. A future timeout still
returns sanitized UNKNOWN without a retry or provider connection.

Both results retain discovery HISTORICAL and mutation BLOCKED. Engineer expiry
remains `2026-10-09T14:52:55.598Z`; no renewal was attempted. Full configuration
hashes equal the original before/after fingerprints above. The tools/agent-entry
fingerprints also match that baseline; installed adapter hashes were checked
before/after and remain unchanged. No native settings, credentials, grants, OAuth
flow, discovery or tool calls were changed/initiated by this correction.

Validation: `npm test` **74 passed, 0 failed, 0 skipped**, including two new native
contract tests; `npm run typecheck` PASS; explicit build and pretest build PASS;
`git diff --check` PASS. Existing unrelated changes were preserved; no commit.

The original adapter contract failure is resolved, and the timeout was validated
with the exact default adapter path. **Full dashboard verdict remains BLOCKED**:
the corrected backend/UI is still not installed, browser rendering and runtime
operator-scope checks remain pending, REST baseline requires renewal, and existing
provenance/alias diagnostics remain. The next dependency is explicit authorization
for the corrected archive's Clawake-managed deployment and subsequent dashboard
acceptance, preserving all production configuration/grants. Native MCP OAuth and
authenticated discovery remain deferred.


## Follow-up — authorized Clawake deployment and Lead administrator guidance

The operator authorized deployment and asked for explicit Lead awareness of
Clawake. Version 0.2.1 is now installed through Clawake on both members, with
matching backend/UI hashes and ready gateways. Full configuration/grants,
Discord/A2A and MCP state remain unchanged. Engineer native dashboard status
reports REST connected and MCP configured/disabled/stored-expired/UNKNOWN;
Lead remains delegate-only with no native MCP provider. Both report HISTORICAL
discovery and BLOCKED mutation. The active Lead role now explains host-side
Clawake administrator actions outside the agent sandbox, verified by native
hash-guarded role update/get. No conversation reset, OAuth, MCP discovery or
CAD execution occurred. [Exact deployment/checks and operator continuation](clawake-mcp-dashboard-deployment-2026-10-12.md).

The installation/source blocker is resolved. Visual browser acceptance and
runtime low-authority access testing remain pending; no full dashboard PASS is
claimed from CLI/bundle evidence. Existing provenance/alias warnings remain.
