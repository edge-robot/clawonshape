> Current result (2026-10-11): native dashboard OAuth, REST pinned render and real Discord read/render delivery PASS. Provider-expired refresh/rotation remains PARTIAL. Earlier investigation below is historical; final acceptance is at the end.

# Claw-Onshape live validation — 2026-10-11

## Initial product-first continuation (historical)

The user has now explicitly selected
`https://cad.onshape.com/documents/8b63eacf80efca72049f8017/w/1e76fac0ddca3ed10ecc9f28/e/7768b96c15d71e78cdbdd7d9`.
Target ambiguity is resolved by user configuration; provider membership, type,
geometry and current microversion remain unverified. For the read-only MVP the
selected workspace is conservatively protected; it is not asserted to be the
document's actual primary without provider evidence.

Operator supplied a public client ID and confirmed registering the dashboard
callback `http://localhost:19489/plugins/claw-onshape/oauth/callback`. The old
ClawCAD `$XDG_RUNTIME_DIR` secret is reported gone. A new masked provisioning
command writes persistent private host storage; no old credential/token was read.
Public client ID/private path are held in Git-excluded deployment inventory, not
in this report. Browser consent and native provider reads have not yet occurred.

Version 0.2.0 adds native dashboard Connect/Status/Disconnect, shared CLI/UI OAuth
lifecycle, signed requester-associated A2A and GET-only pinned rendering. Offline
acceptance: 28 tests pass, TypeScript passes against exact 2026.9.9 public types
with narrow source-derived declarations for the runtime-only secret-file export.
REST renders use current features' `sourceMicroversion`, inspect the exact Part
Studio at that immutable reference, then request shadedviews at the same reference.
Both historical flat and documented nested Base64 shapes are handled; PNG CRC,
dimensions and bounded inflation are checked. No live PNG is claimed.

See [current product status](product-mvp-status.md) for deployment and user actions.
The earlier preflight below records the baseline, not the updated app provisioning.

## Result: OAuth BLOCKED; REST NOT TESTED

Fresh Engineer configuration has no `oauth`, no bindings, `liveReads:false`.
Lead is likewise unconfigured. Native commands executed in the Engineer:

```text
openclaw onshape connect owner-rest --live
=> exit 1, oauth_configuration_required
openclaw onshape status owner-rest
=> connected:false, accountBinding:not_verified,
   refresh:not_implemented, writes:false
```

No listener opened, authorization URL generated, browser consent completed,
token exchanged or CAD REST request sent. Status catches credential/connection
errors, so `connected:false` does not distinguish unknown binding from expired
credentials. It is not a provider identity check. Disconnect was not run against
an absent connection. Registered application, client ID, secret file and callback
routing are unverified for this plugin. Old ClawCAD tokens were not accessed.

Native `openclaw onshape mcp-discover onshape --live` was also attempted:
exit 1, `mcp_configuration_required`, consistent with the disabled server.
No provider catalog was returned and no server/grants were enabled.

## Evidence classification

| Behavior | Claw-Onshape evidence |
| --- | --- |
| Native plugin/CLI loading | Verified current runtime |
| Confidential application authorization-code exchange | Implemented, mocked tests |
| Loopback callback `127.0.0.1:8765`, redirect `http://localhost:8765` | Source + mock listener; real socket/routing not tested |
| OAuth2Read, single-use state, callback host/path validation | Mock tests pass |
| Token persistence/private files | Mock SDK + filesystem tests; native SDK present |
| Expiration / 401 | Reconnect required in implementation; mocked |
| Disconnect | Local invalidation under lock, mocked; provider revocation manual |
| Refresh | Not implemented |
| Document/workspaces/elements membership | Three fixed GETs implemented; mocked only |
| Requester/agent/channel/account binding | Exact trusted context, mocked only |
| Error sanitization/output restrictions | Mocked; identifiers only, no raw provider text |
| Mechanical Engineer A2A requester propagation | Not tested live; missing identity denies |
| Native OAuth/read/render acceptance | Not established |

## Target ambiguity — do not substitute historical targets

ClawCAD reference branch `feat/mechanical-engineer-plugin` at
`6d8313267e86fca31f271b821d7fbbf940b9b0c1` records two different contexts:

| Context | document | workspace/reference | Part Studio |
| --- | --- | --- | --- |
| Historical read/render sandbox | `067951db80e782995dff7998` | workspace `28515cfc6145ce553856aee4`; version `cc95087c2925cc5ac7dfa17e` | `f00ce3bbf370d3f7580c1775` |
| Later approved write-test URL | `8b63eacf80efca72049f8017` | workspace `1e76fac0ddca3ed10ecc9f28` | `7768b96c15d71e78cdbdd7d9` |

Sources: `docs/implementation/readonly-discord-demo.md`,
`onshape-oauth-acceptance.md`, `openclaw-mcp-cad-write.md`. The second document
explicitly says its historical preflight was empty and no fresh BEFORE was
captured. Neither URL establishes current primary/active workspace membership.
Actual current authorized did, primary wid, active wid and Part Studio eid remain
**unresolved**, not guessed. Current Camera Mount Plate accessibility is unknown.

Historical OAuth read acceptance on October 7 captured sandbox microversion
`e6b87b42f1fd50200082e737`, one `clawcadMountPlate`, quantities 80×50×4 mm,
4 mm holes, spacing 60×30 mm, and an 800×800 pinned PNG, 42,710 bytes,
SHA-256 `3475c98025ecc2b6abc31eba18db48888843e4fa8570422cc0ab8f048f2e5c26`.
This is useful provider-contract evidence, not a current model inspection or
permission to modify that sandbox. Do not assume a `width` parameter exists now.

## Exact next operator actions

1. Select the intended existing Camera Mount Plate URL and trusted Discord
   requester/channel/account binding. Verify primary workspace rather than using
   a supplied mutable URL as proof of primary status.
2. Register/confirm an operator/company confidential Onshape OAuth application
   with callback exactly `http://localhost:8765` and Read permission. Provision
   its secret privately (0600 file, private owned parents); never paste it into
   chat, config, environment, shell arguments or commits.
3. Through Clawake's inventory and reconciliation, configure Engineer
   `oauth.clientId`, `oauth.clientSecretFile`, the exact `owner-rest` binding and
   authorized optional-tool grant. Keep Lead without mutation grants. Enable
   read access only for this binding. No generated runtime JSON edits.
4. Establish a loopback-only route from the operator browser's localhost:8765 to
   the container listener. Current container port publishing/routing was not
   verified; do not assume container loopback is host loopback or expose the
   callback publicly. Document the selected Clawake-owned routing mechanism.
5. Run `openclaw onshape connect owner-rest --live` inside Engineer, keep it
   running, open its printed URL in the routed browser, consent within five
   minutes, then run `openclaw onshape status owner-rest`. No current URL exists.
6. Invoke `onshape_inspect` in a directly authenticated authorized Engineer turn.
   Record membership and element IDs; then test delegated identity separately.
   Never infer requester identity from delegation text. If A2A fails, retain the
   direct-path acceptance and record delegation denial independently.
7. Exercise live expiry/reconnect/local disconnect only on this new native
   connection; manually revoke the Onshape grant if provider revocation is needed.

The plugin currently returns only element IDs, not element types or feature
parameters. Part Studio resolution and feature/microversion inspection need a
bounded REST increment before model and render acceptance. REST owns all future
render/report work. Reuse ClawCAD `render_current`, `shaded_path` contracts and
tests, including flat/nested Base64 responses; do not copy its operator service.

The [official OAuth guide](https://onshape-public.github.io/docs/auth/oauth/)
was checked during this task: app registration, bearer REST access, expiring
access tokens and rotating refresh tokens are documented. Claw-Onshape chooses
reconnection for now; this is a deliberate narrower implementation.

### Native product provisioning check

Operator confirmed private secret provisioning using the masked helper. File metadata was checked without displaying contents (owner-only 0600). Clawake mounted the directory read-only into Engineer and installed 0.2.0. Live gateway `plugins.sessionAction` for `claw-onshape/status` and `owner-rest` returned `disconnected`, not `oauth_configuration_required`. Browser consent is requested through the native Mechanical Engineer dashboard. No live OAuth success, Onshape GET or rendered PNG is claimed at this checkpoint.

### Live OAuth and REST acceptance — product continuation

The operator used the native Mechanical Engineer Claw-Onshape dashboard, completed browser consent and reported connected. A subsequent live authenticated `plugins.sessionAction/status` returned `connected`. No old ClawCAD tokens were copied.

A GET-only operator probe ran the installed Claw-Onshape `RestClient.render` with its own persisted credential store: document access, workspace membership, configured PARTSTUDIO discovery, feature revision capture, pinned element membership and pinned shaded view all succeeded. This is native Claw-Onshape provider acceptance, separate from agent/Discord acceptance.

- Document: `8b63eacf80efca72049f8017`
- Selected workspace: `1e76fac0ddca3ed10ecc9f28`
- Part Studio: `7768b96c15d71e78cdbdd7d9`
- Source/render microversion: `b83ee0a0efcda65537780ef8`
- Features observed: 1; no parameter names inferred.
- PNG: 800 × 800, 42,710 bytes; signature/CRC/inflate validation passed.
- SHA-256: `3475c98025ecc2b6abc31eba18db48888843e4fa8570422cc0ab8f048f2e5c26`
- Private evidence: `state/deployment/artifacts/2bc495e2abc3c730551ca7e01a82d137.png`.

Visual inspection shows a rectangular plate with four holes. No CAD modification occurred. Actual primary workspace identity remains unverified; the selected workspace remains conservatively protected by configuration.

First operator A2A probe reached Engineer but returned historical `clawcad_render_current` output with no valid delegation proof; the new delegate correctly rejected it. Native prompt guidance was added to select Claw-Onshape. Global host tools.allow currently names only historical tools; effective availability and real Discord delivery remain under investigation.

### Native Engineer A2A read/render acceptance

Following explicit approval and Clawake global-grant reconciliation, two operator-issued native A2A tasks succeeded. Engineer invoked Claw-Onshape rendering with the signed task context. Lead's actual delegate adapter verified the complete signed result: status ok/ready, configured document/workspace/element and microversion `b83ee0a0efcda65537780ef8`. Generated private files include `9dc2e3503790cac79da1d75204d733ea.png` and `b11e2723b31017a11691ba00146dbc20.png`. These are native agent/provider acceptance; Discord requester admission/delivery is still a separate pending real-user test.

### Native role-file correction after reset test

The user sent `/reset soft` in the correct Discord #clawcad channel and received startup acknowledgement. At 16:07 a new request still invoked the historical delegate in the original Codex backend rollout. The prepared developer instruction snapshot still contained old AGENTS.md, although `agents.files.get` and direct container reads showed the new nested-mounted file. Therefore the earlier claim that a soft reset alone would refresh routing was insufficient; the precise overlay/snapshot interaction is not proven.

Clawake removed the nested AGENTS.md mounts. Original runtime files were backed up privately, and the supported native `agents.files.get/set` API updated AGENTS.md in the underlying deployed workspaces with expectedHash checks and get-after-set verification. No generated JSON configuration or ClawCAD source file was edited. Lead role hash: `d14f21f4ba4fa366b7767c3b3b87bc0dd3072e7de8b1a12228f4f5ac3a7e77b8`; Engineer role hash: `94b0c57b79a09a89eb7460657c805991f4f225b69cd327533497d1269b4c7882`. Operator adapter: `scripts/apply-runtime-role.mjs`; versioned source: `deploy/roles`. A new real Discord request is pending; no further reset was requested.

### Latest Discord acceptance blocker (16:29 local)

The real request again selected historical `clawcad_delegate_render`; no verified Discord image was delivered. Installed Codex adapter source and its workspace-snapshot test establish that saved `agentWorkspaceDeveloperInstructions` override updated AGENTS.md on thread resume. Fresh native bootstrap reads the new role correctly. `/reset soft` retained the old native rollout in this case. A fresh `/new` session is the documented next acceptance action; its result is pending. Live Claw-Onshape OAuth, pinned REST render and operator native signed A2A probe successes remain distinct from Discord acceptance.

### 17:11 fresh-session / direct A2A diagnosis

The new Discord session invoked onshape_delegate_render and reached the Engineer. Native Engineer logs exposed and invoked onshape_render/onshape_status; their actual result was reconnect-required, not insufficient user grants. OAuth metadata independently showed expiry and an existing refresh credential. Signed failure metadata was absent from text-only tool transport, producing an unsigned A2A answer and a misleading delegation_denied response. Status and render errors now put signed JSON in text content, and malformed final A2A results use delegation_result_invalid. Shared serialized OAuth refresh was added using ClawCAD's denial-before-uncertain-exchange pattern. Its first live attempt was unsuccessful; precise provider/parser cause was not captured, so renewal success is not claimed. The credential store remains closed; fresh browser consent is required.

After deployment, an autonomous direct operator Lead→Engineer test completed in 18,289 ms and verified a signed disconnected response from the real native bridge and Engineer turn. No Discord send, identity impersonation or CAD write occurred. Historical successful PNG acceptance remains historical. Current connected/render acceptance is pending renewed consent. 31 tests, SDK typecheck and whitespace checks pass. See product-mvp-status.md for exact rollout evidence and final archive digest.

Final installed build autonomous Lead probe: signedResultVerified true, status unavailable, code reconnect_required. Native dashboard status: disconnected. Thus current A2A authorization and signed error transport pass; current OAuth/render acceptance still requires renewed browser consent.

### Renewal report follow-up

After the operator reported connected, live native dashboard status still returned authorization_in_progress, and the private credential store returned disconnected. The autonomous Lead→Engineer probe completed in 18,223 ms, verified the signed result, and forwarded authorization_in_progress accurately. No PNG was requested with missing credentials. Callback completion is not yet established; do not record the operator message alone as live connection acceptance.

### Renewed consent: autonomous live render passed; refresh response validation defect

After the operator completed the authorization link, the private connection status returned connected. Autonomous Lead→A2A→Engineer→REST returned status ok/code ready in 30,285 ms. Lead verified the signed result, shared PNG and SHA-256: microversion b83ee0a0efcda65537780ef8; PNG 42,710 bytes, 800×800; sha256 3475c98025ecc2b6abc31eba18db48888843e4fa8570422cc0ab8f048f2e5c26; file /workspace/artifacts/claw-onshape/fdbface696237dc8be6ff7d5c273d03e.png. Engineer native rollout started 16:09:02 UTC; no Discord delivery was performed by this operator probe.

A subsequent actual near/after-expiry renewal POST returned HTTP 200 application/json but parseTokens rejected it (oauth_refresh_response_invalid). Thus current evidence points to a token response validation defect, not failed peer/user delegation authority. The first planned forced-renewal probe did not exchange a token because its initial non-expired read failed; the subsequent normal expired-token probe produced the actual HTTP-200 result. Current local connection was closed before exchange as designed; live refresh success is not claimed.

An operator-only diagnosis intended to preserve the response privately subsequently failed because its bare SDK import from /tmp could not resolve after the exchange. This was an avoidable diagnostic-script error, acknowledged to the operator. The SDK import and private write are now preflighted using the installed absolute SDK path before any exchange. No token was printed, restored from historical ClawCAD, or committed. The next response will be preserved in a 0600 native private diagnostic file solely for validated recovery and removed afterward. Additional browser consent is required to continue diagnosing the parser without bypassing it.

### Current recovered state / post-refresh native A2A PNG

Current consent/connection pass. A targeted fresh-grant refresh test forced the local refresh branch but sent a real Onshape POST: HTTP 200, strict token validation passed, persisted connected. Returned expires_in 3572; token values unchanged. Rotation and successful provider-expired renewal are not established; the previous expired-token HTTP-200 validation failure remains unexplained. The temporary private response was removed after validation, without token output. Subsequent autonomous Lead→A2A→Engineer→REST render completed in 16,242 ms: signed result verified; status ok/code ready; pinned microversion b83ee0a0efcda65537780ef8; 42,710-byte / 800×800 PNG at /workspace/artifacts/claw-onshape/519b9453277641b963f7c821b1b4afdf.png; sha256 3475c98025ecc2b6abc31eba18db48888843e4fa8570422cc0ab8f048f2e5c26. No Discord send or CAD change occurred. Ordinary real Discord request is the remaining image-delivery acceptance.

## Final actual Discord acceptance

At 19:01 UTC the real authorized Discord request selected onshape_delegate_render, reached Engineer, rendered microversion b83ee0a0efcda65537780ef8 and returned delivered:true with the verified PNG. Lead's final reply included stable Onshape URL and revision. User explicitly confirmed image receipt. Full read/render user journey PASS; no mutation or generalized multi-user onboarding acceptance is claimed. See product-mvp-status.md for exact timestamps/artifact/hash and refresh reliability limits.
