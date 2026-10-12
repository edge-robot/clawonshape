# Product read/render MVP — 2026-10-11

Product result: **PASS — single-owner read/render journey**. Native dashboard consent, signed A2A and pinned REST PNG delivery to Discord are live-accepted. Provider-expired refresh/rotation reliability remains a documented follow-up; this is not general multi-user or mutation acceptance. No CAD modification or MCP execution is included.

| Journey component | Status | Evidence / outstanding acceptance |
| --- | --- | --- |
| Discord entry | PASS | Fresh /new acknowledged; real request selected onshape_delegate_render |
| A2A | PASS | Autonomous real bridge/Engineer probes verify both signed failures and signed PNG results |
| Mechanical Engineer | PASS | Native onshape_render invoked with verified A2A context and current OAuth connection |
| Dashboard onboarding | PASS | Native Connect and authorization link completed; private connection persistence verified |
| OAuth | PARTIAL | Current consent/connection and fresh-grant live refresh POST pass; expired-grant HTTP-200 invalid response remains unexplained; rotation not verified |
| REST | PASS | Current autonomous native REST read/render returned a verified PNG after successful provider refresh |
| Camera Mount Plate target | PASS | Explicit did 8b63eacf80efca72049f8017 / wid 1e76fac0ddca3ed10ecc9f28 / eid 7768b96c15d71e78cdbdd7d9; live microversion b83ee0a0efcda65537780ef8 |
| Pinned render | PASS | Current 800×800 / 42,710-byte PNG, source revision and SHA-256 verified by Lead |
| Discord response | PASS | Actual 19:01 UTC request returned delivered:true; user confirmed receiving the image |

## OAuth/capability repository checkpoint (2026-10-12)

This checkpoint is offline repository evidence; it has not been deployed and adds
no live write acceptance to the October 11 read/render result above.

- Read consent remains the default. Explicit read+write consent requires trusted
  application-write confirmation and never upgrades an existing connection silently.
- Status exposes a compact capability summary bounded to 2 KiB, with availability,
  reasons and guidance. Missing application attestations remain unknown; the four
  known disabled permissions must be recorded explicitly as false by the operator.
- Scope mismatch, invalid stored grants and scope expansion during refresh fail
  closed. Legacy scope-less records migrate to read only.
- Candidate preparation uses exact-source verification, bounded persistent attempt
  receipts and a trusted host authorization adapter. Claimed authorization and
  target overrides are rejected; current authority/token/consent are rechecked
  before POST. No candidate agent tool is registered.
- Agent MCP mutation, immutable-version creation, deletion, sharing, purchases and
  profile access remain unavailable. REST OAuth cannot establish MCP authority.

See [OAuth capability contract](oauth-capabilities.md),
[candidate receipt limits](candidate-preparation-receipts.md) and the translated
[Engineer](../agents/mechanical-engineer.md)/[Lead](../agents/agent-lead.md) contracts.

## MCP dashboard readiness checkpoint (2026-10-12)

**Implemented and tested offline; native deployment acceptance pending.** The
existing page has independent Onshape REST and Onshape MCP sections. The operator
status action reports only allowlisted native saved configuration/grant metadata,
optional expiry and required-action state. Missing/invalid/unavailable native
signals remain UNKNOWN. Stored authorization never proves a connected provider.
ClawCAD discovery remains HISTORICAL; no authenticated discovery was performed.
CAD mutation remains BLOCKED on containment, revision enforcement, guarded native
invocation and Part Studio contract. No MCP OAuth flow, token refresh, tool call,
settings change or agent grant was added. Future consent uses native operator
onboarding. The next dependency is disabled-connector read-only native acceptance.
See [operator dashboard readiness](mcp-dashboard-readiness.md).

## Provisioning already completed / user continuation

The operator already provisioned the private secret and completed dashboard consent. Do not provision again. The command used was:

```bash
node scripts/provision-oauth-secret.mjs
```

Enter the application secret only at the hidden prompt. The file is
`state/deployment/oauth/client-secret`, private 0600 under a private directory,
excluded by `state/` in Git. This is persistent host storage rather than the old
logout-sensitive `$XDG_RUNTIME_DIR` store. Clawake mounts its directory read-only
into Engineer at `/run/claw-onshape-oauth`; Lead must not receive that mount.
The command never overwrites an existing file. Rotation requires a deliberate
operator replacement of the private file and reconnection; not a UI config value.

After deployment/activation, open the Mechanical Engineer dashboard at
`http://localhost:19489`, choose **Claw-Onshape**, then **Connect Onshape** and
the authorization link. Approve Read consent; return and refresh status. The
app callback must remain exactly
`http://localhost:19489/plugins/claw-onshape/oauth/callback`, which the operator
has confirmed registering. Dashboard actions use the current authenticated
OpenClaw connection; no gateway token is embedded in the plugin UI.

The fresh native Discord session is already active; do not reset again. Current connection and autonomous Lead→Engineer PNG tests pass. The real Discord request has passed; no additional acceptance retry or reset is required.
Until that real result arrives, report this journey as unaccepted.

## Authority and deployment boundary

Discord identity is obtained from native Lead tool context and exact sender,
channel delivery target and account binding. Native A2A authenticates peer `lead`,
channel `a2a`, account `default`; it does not preserve Discord identity. A short-lived
signed context ties that peer's isolated session to an exact existing authorized
Engineer binding. The agent cannot mint or alter it through text. Replays permit
only the same bounded read capability within five minutes; no mutation authority.
Engineer results carry a signature so a model-rewritten response cannot invent
provider metadata. Lead receives no REST token or direct CAD tool.

Dashboard administrator authority can connect a configured owner connection.
It is not evidence that the dashboard caller is the Discord owner. This MVP is
operator-assisted onboarding for one configured owner, not arbitrary multi-user
self-service. A future identity association must be verified before expanding it.

Existing provenance/duplicate discovery warnings are tracked separately; they
do not justify bypassing requester policy or replacing native product acceptance.

## Verification

`npm test`: 29 tests pass, including 10 focused product tests. Provider/host transports
are mocked except filesystem checks. `npm run typecheck` passes against the exact
2026.9.9 npm SDK declarations and pinned TypeScript 5.9.3. The runtime-only
secret-file subpath has no published declarations; a narrow local declaration
mirrors its previously inspected native implementation. Browser rendering and
native agent/provider execution are separate acceptance checks, not certified by
this typecheck.

## Native deployment continuation

Clawake installed the integrity-pinned 0.2.0 archive on both agents and reconciled only the new read/render grants. Engineer runtime inspection reports loaded, four optional factories, one callback HTTP route and the native Control UI entry. The live `plugins.sessionAction` status action returned `disconnected` with product guidance; application configuration and private secret mount therefore pass readiness checks. This does not establish token exchange or provider reads.

The first Engineer restart failed because the read-only parent artifact mount had no child mountpoint. An explicitly approved empty `clawcad/state/demo/artifacts/claw-onshape` directory was created; Clawake restart and subsequent installation succeeded. No ClawCAD source or existing artifacts were changed. Lead retains read-only artifact access and receives no REST application-secret mount. Duplicate discovery/provenance-invalid remain observable and non-blocking for this native status check.

Operator confirmed masked private provisioning. ADR-012 records the requested future dashboard onboarding of Discord and Onshape application configuration together; dashboard secret submission and Discord provisioning are proposals, not implemented capabilities.

## Historical host-policy blocker (fixed)

The installed host's `agent-tools.policy-CTwQOYjx.mjs:resolveEffectiveToolPolicy` retains independent global and agent policies; `tool-policy-pipeline-BhdrHJWh.mjs` filters at both steps. Engineer's global allowlist has only historical ClawCAD tools. Clawake's current reconciliation (`gateway_config.py`) adds agent alsoAllow only. Adding prompt guidance does not grant a tool excluded by host policy. Native A2A attempts returned the historical operator-session-unavailable report; `onshape_delegate_render` rejected the unsigned result. No real Discord acceptance is claimed.

[The exact focused Clawake proposal](plans/clawake-tool-policy-remediation.md) adds explicit managed global grants without changing denies, per-agent scope, identity checks or CAD write policy. The operator approved the implementation; Clawake applied it and native signed render probes now pass. Generated runtime config was not manually edited.

### Approved remediation and native A2A result

The operator explicitly approved the cross-repository Clawake change. Model/reconciler/CLI/tests were updated; 48 focused tests and Ruff pass. Clawake applied explicit global grants to both runtimes and preserved existing denies. Two subsequent native A2A operator probes succeeded with signed `status:ok`, `code:ready`, the expected microversion and private PNG paths. These exercise the real Engineer turn and native tool, but do not impersonate a Discord user or count as Discord acceptance.

A static before_prompt_build guidance hook was experimentally blocked by the host's conversation-access permission. It was not needed for the successful round-trip and was removed rather than requesting broader access. Existing native tool descriptions and task instructions provide guidance.

## First real Discord attempt and routing correction

The authorized user sent “Show me the current Camera Mount Plate.” and reported the Lead's 15:39 response: delegated render returned an invalid A2A result; no image attached. This is a genuine failed product attempt, not successful E2E. The existing Lead AGENTS.md mandates the historical `clawcad_delegate_render` for this exact wording.

Clawake now mounts focused active product AGENTS.md documents from this repository's ignored deployment state read-only in both containers. They direct current reads to onshape_delegate_render/onshape_render, preserve role and authority boundaries, guide onboarding and forbid unverified images/retries/mutation. Original ClawCAD source files are untouched. A fresh real-user request after managed restart is required.

## Outstanding external acceptance action

Send a new real request in #clawcad after the routing deployment and report the image/result. If the existing CLI-backed conversation retains historical instructions, native `/reset soft` preserves the transcript, drops reused backend session IDs and reruns startup (installed `/app/docs/tools/slash-commands.md`); then request the plate again. No automatic redispatch was performed. Until an actual successful Discord attachment is confirmed, product status remains PARTIAL.

### Second real attempt / retained backend session evidence

At 16:01 the user again received the historical invalid-A2A failure. The native Lead Codex backend transcript (rollout started 13:38:43 UTC) records `openclaw__clawcad_delegate_render` at 14:01:23 UTC, confirming actual historical tool selection in the reused backend session. The operator was instructed to use native `/reset soft` and retry; this preserves the transcript and refreshes backend startup. No completed Discord image is claimed. Versioned focused role instruction templates are in `deploy/roles/robotics-lead.md` and `deploy/roles/mechanical-engineer.md`; private deployment copies are the currently mounted adapters.

### Native role-file correction after reset test

The user sent `/reset soft` in the correct Discord #clawcad channel and received startup acknowledgement. At 16:07 a new request still invoked the historical delegate in the original Codex backend rollout. The prepared developer instruction snapshot still contained old AGENTS.md, although `agents.files.get` and direct container reads showed the new nested-mounted file. Therefore the earlier claim that a soft reset alone would refresh routing was insufficient; the precise overlay/snapshot interaction is not proven.

Clawake removed the nested AGENTS.md mounts. Original runtime files were backed up privately, and the supported native `agents.files.get/set` API updated AGENTS.md in the underlying deployed workspaces with expectedHash checks and get-after-set verification. No generated JSON configuration or ClawCAD source file was edited. Lead role hash: `d14f21f4ba4fa366b7767c3b3b87bc0dd3072e7de8b1a12228f4f5ac3a7e77b8`; Engineer role hash: `94b0c57b79a09a89eb7460657c805991f4f225b69cd327533497d1269b4c7882`. Operator adapter: `scripts/apply-runtime-role.mjs`; versioned source: `deploy/roles`. A new real Discord request is pending; no further reset was requested.

### 16:29 Discord failure — frozen native Codex workspace snapshot confirmed

The fresh user request again failed and invoked `openclaw__clawcad_delegate_render` at 14:29:10 UTC. The developer instruction record at 14:29:06 UTC still contained the historical ClawCAD role. The actual runtime AGENTS.md and a fresh native `resolveBootstrapFilesForRun` invocation both returned the new Claw-Onshape role. Thus the failed request did not test the new delegate.

Installed OpenClaw 2026.9.9 source proves the mechanism: `extensions/codex/src/app-server/run-attempt-context.ts:163–164` supplies `startupBinding.agentWorkspaceDeveloperInstructions`; `attempt-workspace-context.ts:167` prefers that captured value over newly prepared instructions. `run-attempt.workspace-snapshot.test.ts` explicitly tests that initial instructions remain frozen on resume after AGENTS.md changes. This is intentional host behavior, not evidence of an OAuth, REST or signature failure. Earlier recommendations that `/reset soft` would refresh this native thread were insufficient.

The installed slash-command documentation defines `/new` as archiving the current session and starting a fresh one. Next acceptance action: the authorized user starts `/new` in Discord #clawcad, then requests the plate. This has not yet been validated. No session database or provider binding was edited, and no CAD was modified. Product remains PARTIAL until real Discord image delivery succeeds.

### Fresh-session 17:11 result — actual connection-lifecycle and A2A error defect

The fresh Lead native rollout `rollout-2026-10-11T15-11-10-01a12b84-8ecf-7731-9460-d7fa57dd561e.jsonl` invoked onshape_delegate_render at 15:11:14 UTC. Engineer rollout `rollout-2026-10-11T15-11-16-01a12b84-a6ab-7cf3-a9a5-485261b0f11e.jsonl` exposed onshape_render/onshape_status and returned the reconnect-required message at 15:11:22 UTC. This proves authenticated A2A arrival and tool authorization, not a missing grant. The prior stale-role issue was resolved by a fresh session; it does not explain this failure.

Root cause of the misleading Lead response: delegated render error content and status content emitted only human-readable text while signed metadata lived in tool details. Native model tool transport presented that text, so Engineer could not forward a verifiable signed JSON result. Lead rejected the unsigned final answer under a generic delegation_denied code. Fix: status and render failures now include the complete signed JSON in text content; invalid final results have a distinct delegation_result_invalid code. No identity check or tool grant was relaxed.

OAuth expiry was separately confirmed from private store metadata: expiredAt 1791728818289; refresh credential present. Shared authorization.ts now refreshes under the same private exclusive lock, validates read scope/resource response, checks current authorization before persistence, and atomically stores rotated credentials. As in historical ClawCAD OAuthExchange/OperatorOAuthAuth, denial is persisted before an uncertain refresh exchange to prevent replay after crash or timeout. The first live renewal was unsuccessful; its exact provider-versus-parser cause was not captured by the initial generic mapping and must not be invented. Additional codes now distinguish rejected renewal from invalid token response. No old token was restored.

Direct operator Lead→Engineer probe after gateway readiness (Engineer native rollout 15:41:17 UTC) completed in 18,289 ms and passed result signature verification, returning code disconnected and native dashboard onboarding guidance. This tests the real bridge and Engineer turn without sending anything to Discord. It confirms the error-path fix, not a current image render. Initial probe before gateways were ready returned provider_transport_error without a task; after readiness the above test succeeded. Current blocker is renewed browser consent, then autonomous Lead→Engineer PNG acceptance. No more /new or /reset is required for this correction.

Validation: 31 focused/offline tests pass; exact-host SDK typecheck and git diff --check pass. Tests cover expired refresh, rotation, private lock/denial-before-exchange, rejected/malformed response, authorization revocation, and signed errors/status surviving text-only tool transport. Final archive digest: sha256:381839f47ed2f0b41d41dec735519e9a00799dd8b0bfbbe3e3e9558b243f6545. Deployment is Clawake-owned.

Final installed-archive autonomous Lead probe also passed native A2A result signature verification and returned status unavailable/code reconnect_required. Native dashboard status independently returned disconnected. This establishes correct signed forwarding of the actual render failure, without another Discord request.

### Renewal report follow-up

After the operator reported connected, live native dashboard status still returned authorization_in_progress, and the private credential store returned disconnected. The autonomous Lead→Engineer probe completed in 18,223 ms, verified the signed result, and forwarded authorization_in_progress accurately. No PNG was requested with missing credentials. Callback completion is not yet established; do not record the operator message alone as live connection acceptance.

### Renewed consent: autonomous live render passed; refresh response validation defect

After the operator completed the authorization link, the private connection status returned connected. Autonomous Lead→A2A→Engineer→REST returned status ok/code ready in 30,285 ms. Lead verified the signed result, shared PNG and SHA-256: microversion b83ee0a0efcda65537780ef8; PNG 42,710 bytes, 800×800; sha256 3475c98025ecc2b6abc31eba18db48888843e4fa8570422cc0ab8f048f2e5c26; file /workspace/artifacts/claw-onshape/fdbface696237dc8be6ff7d5c273d03e.png. Engineer native rollout started 16:09:02 UTC; no Discord delivery was performed by this operator probe.

A subsequent actual near/after-expiry renewal POST returned HTTP 200 application/json but parseTokens rejected it (oauth_refresh_response_invalid). Thus current evidence points to a token response validation defect, not failed peer/user delegation authority. The first planned forced-renewal probe did not exchange a token because its initial non-expired read failed; the subsequent normal expired-token probe produced the actual HTTP-200 result. Current local connection was closed before exchange as designed; live refresh success is not claimed.

An operator-only diagnosis intended to preserve the response privately subsequently failed because its bare SDK import from /tmp could not resolve after the exchange. This was an avoidable diagnostic-script error, acknowledged to the operator. The SDK import and private write are now preflighted using the installed absolute SDK path before any exchange. No token was printed, restored from historical ClawCAD, or committed. The next response will be preserved in a 0600 native private diagnostic file solely for validated recovery and removed afterward. Additional browser consent is required to continue diagnosing the parser without bypassing it.

### Current recovered connection and autonomous render acceptance

After completed renewed consent, native Lead→Engineer render returned a verified 800×800 PNG in 30,285 ms (recorded above). A later targeted refresh probe preflighted the native SDK import/private write before exchange, forced the local refresh branch for a fresh valid grant, and executed a real POST to Onshape. Safe field diagnostics: HTTP 200; valid access/refresh strings, integer expiry and Bearer type; scope exactly OAuth2Read. Connection persistence succeeded. Returned expires_in was 3572 seconds; both access and refresh values were unchanged. This is live fresh-grant endpoint acceptance with a forced local expiry condition, not observed rotation or proof of successful provider-expired renewal. The prior actual expired-token HTTP-200 validation failure was not reproduced or fully explained. Do not assume the parser was wrong or claim expired-grant recovery passed.

Temporary 0600 native renewal-diagnostic.json was validated and removed. No response/token values were printed or committed. After this refresh, a new autonomous Lead→A2A→Engineer→REST test passed in 16,242 ms: status ok/code ready; microversion b83ee0a0efcda65537780ef8; private file /workspace/artifacts/claw-onshape/519b9453277641b963f7c821b1b4afdf.png; 42,710-byte PNG; sha256 3475c98025ecc2b6abc31eba18db48888843e4fa8570422cc0ab8f048f2e5c26. Lead verified the result signature and private PNG. No Discord send was performed by these operator probes. One real ordinary request is now pending to validate final attachment delivery; reset is unnecessary.

## Final Discord E2E acceptance

The authorized user requested the current plate at 19:01:23 UTC in #clawcad. Lead's active native rollout invoked onshape_delegate_render at 19:01:27 UTC. At 19:01:42 UTC its result contained status ok/code ready, delivered:true, microversion b83ee0a0efcda65537780ef8, /workspace/artifacts/claw-onshape/0b212c7c8914a116eba44d97ffc65c6a.png and sha256 3475c98025ecc2b6abc31eba18db48888843e4fa8570422cc0ab8f048f2e5c26. The plugin sets delivered:true only after awaited native originating delivery succeeds. Lead returned the document/workspace link and revision at 19:01:46 UTC. The real user confirmed (translated from German): “Yes, it worked.” Thus Discord→Lead→A2A→Engineer→native REST→verified pinned PNG→Discord passes. No CAD change occurred. Earlier sections are historical investigation evidence, superseded by this final acceptance where stated.


## MCP dashboard deployment — 2026-10-12

The corrected readiness integration was installed as Claw-Onshape 0.2.1 through
Clawake on Engineer and Lead. Backend/UI hashes match the build, both gateways
are ready, operator-native status returns independent MCP metadata, and full
configuration/grants remain unchanged. Engineer reports REST connected; status
performs no provider read and this is no new read/render acceptance. MCP remains
disabled, native grant metadata is expired, connectivity UNKNOWN, discovery
HISTORICAL and mutation BLOCKED. Visual browser acceptance remains pending.
The Lead contract/template and active native AGENTS.md now explain Clawake host
administration outside the agent sandbox, without adding tool grants. Retained
Codex conversations may need an operator-started /new. No OAuth, authenticated
MCP discovery, CAD calls or Discord delivery was initiated. See
[deployment and remaining operator steps](clawake-mcp-dashboard-deployment-2026-10-12.md).

## Self-hosted MCP deployment checkpoint — 2026-10-12

Claw-Onshape 0.2.2 is installed in Engineer; Lead retains its existing version and
read/render configuration. Clawake manages the pinned separate local MCP service,
private network, non-root isolation, health and restart. Claw-Onshape publishes
access-only credentials and remains the only refresh owner. The operator renewed
Read consent; liveness and credential readiness are HTTP 200. Native operator
Discovery passes for five provider tools plus two native resource helpers. Saved
production MCP points locally and remains disabled; agent grants, bindings, A2A
and Discord configuration are preserved.

Independent REST observation at 18:08:07 UTC confirms Camera Mount Plate
plateWidth = 50 mm, feature state OK and microversion b83ee0a0efcda65537780ef8;
a pinned render and feature baseline are preserved. This is REST acceptance,
not native MCP auth/document/feature invocation acceptance. No new Discord journey,
Candidate creation or CAD write is claimed. Full native schemas and a supported
owner-bound plugin invocation interface remain blocked. Mutation is BLOCKED.
See [the integration report](self-hosted-mcp-integration-2026-10-12.md).
