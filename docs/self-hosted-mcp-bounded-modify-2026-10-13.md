# Bounded MCP integration — 2026-10-13

**BLOCKED — native runtime contract insufficient.** Generic execution policy is
implemented, tested and deployed with writes disabled. The operator authenticated
through Mechanical Engineer’s Claw-Onshape plugin at port 19489. Credential
handoff and fresh independent REST inspection/render now pass. No Candidate,
CAD mutation, version or export was attempted.

## A. Rust fork delta

Fork implementation `ff8b6d8`, security/upstream docs `116bce6`, upstream base
`f78ddc48`. Optional typed target scope, read/modify ceiling, exact operation and
feature binding, workspace exclusions, mandatory provider CAS fields. Additive
single-attempt HTTP constructor disables retry/redirect; ambiguous dispatched
writes return structured UNKNOWN/no retry/reconcile. No new crate or workflow
engine. All new commits are local; none pushed or merged.

## B. Rust quality

Pinned Rust 1.99.0: fmt/check PASS; Clippy `--locked --workspace --all-targets
--all-features -- -D warnings` PASS; workspace and all-features suites each
**605 passed**. This is the actual current checkout count, not the handoff’s
historical 697. Tests cover policy parsing/default deny, wrong targets, operation,
feature, Primary exclusion, CAS preservation, external token expiry/rotation,
refresh isolation, pre-I/O rejection, UNKNOWN error and real HTTP redirect denial.
Typed `PolicyError` and Result propagation; no new production unwrap/expect/panic.
Pure admission in core, provider/file effects in I/O; larger auth state boxed.

## C. Upstream suitability

Generic target/revision admission, external credentials, HTTP retry controls,
UNKNOWN error contract and binary schema regression are upstream candidates.
Existing non-external authentication defaults remain intact. Detailed boundaries:
[upstream delta](onshape-mcp-upstream-delta.md). Deployment patches are separate.

## D. Issue #1 alignment

[Issue #1](https://github.com/edge-robot/clawonshape/issues/1) remains the forward
contract. Inspection, feature reads and evidence use REST control-plane services.
Assigned-workspace and stale-baseline execution guards are in MCP; parameter
mutation is implemented but not live accepted. FeatureScript/create/delete remain
denied pending their own audited contracts. Workflow, review and release stay in
Claw-Onshape; typed scope is a future VC/VP seam. [Skill matrix](self-hosted-mcp-feature-matrix.md)
and ADR-018 updated.

## E. MCP contract

**Superseded checkpoint:** the later [native Engineer read test](native-mcp-engineer-readonly-2026-10-13.md)
proves native explain/schema and authenticated feature invocation without an
OpenClaw change or plugin MCP handle. Preserve the following as earlier evidence.

Actual binary stdio tools/list exposes all five external-mode input schemas;
explain/updatePartStudioFeature and schema/BTFeatureDefinitionCall-1406 PASS.
OutputSchema is optional; dynamic API results do not advertise one. No schema
mirror or extra schema-export tool is added. Native discovery PASS (seven names).
OpenClaw 2026.9.9’s probe maps tools to names (`mcp-cli-Dt7GFrqd.mjs:319`);
public harness materialization needs lifecycle-owner scheduler authority.
Full native schemas, explain/schema and provider invocation are **unaccepted**.
No private hashed imports, scheduler injection, runtime upgrade or custom client.

## F. Target enforcement

Admission occurs immediately before external provider execution, including raw
api_call. Exact document/workspace/element, finite operation allowlist, optional
feature, excluded workspace IDs, scope and write ceiling apply. Unknown config
fails closed. Exclusion must contain the operator-resolved Primary ID; the server
cannot infer Primary by name. Deployed mutation config is absent: all writes denied,
including Primary. There is no Candidate write authority yet.

## G. Revision enforcement

Audited POST updatePartStudioFeature uses
`/partstudios/d/{did}/w/{wid}/e/{eid}/features/featureid/{fid}` with request
BTFeatureDefinitionCall-1406 and response BTFeatureDefinitionResponse-1617.
Exact configured sourceMicroversion and boolean rejectMicroversionSkew:true are
mandatory and preserved. Provider v16 handles comparison, not local pre-read/CAS.
A fresh independent **v16 GET passes**, with serializationVersion **1.2.23**;
v10 GET reports **1.2.21** at the same revision. Preserve the fresh candidate
payload from the correct API version; do not reuse the v10 serialization.
Live POST compatibility/skew rejection remain UNKNOWN. No retries; transport,
408, redirects and 5xx after dispatch are UNKNOWN. Provider CAS can bound replay
after a revision-changing write; durable exact approval/attempt receipts remain
control-plane work before production mutation.

## H. Credential model and operator login

Port **19491** is the isolated native test runtime, with no Claw-Onshape plugin.
Use **http://localhost:19489/plugins** for Mechanical Engineer’s plugin.

Dashboard consent → private Claw-Onshape OAuth store → atomic access-only file
→ MCP read-only mount. Both containers mount the same host credential directory
at `/run/onshape-credentials`; Engineer rw, MCP ro. File mode 0600, directory 0700,
UID 1000. File fields are only accessToken/expiresAt/scopes. Access token and expiry
were compared to the OAuth owner and match. Refresh token is never handed off.
Claw-Onshape owns refresh under its existing lock; maintenance sync runs every
15 seconds. MCP reloads the file per dispatch, checks 30-second expiry margin and
never performs OAuth/refresh/401 replay. Current grant is **OAuth2Read only**;
a later approved write needs provider write consent as an additional gate.
Before login: disconnected/readiness 503; after login: connected/readiness 200.

## I. Control/Data Plane integrity

REST regressions and fresh inspection/render PASS; CAD modification remains MCP
only. Claw-Onshape still refuses MCP invocation while native acceptance is missing.
No second unrestricted REST CAD writer or MCP abstraction is introduced. Approval,
review and release are separate from mutation.

## J. Runtime validation

Clawake applied pinned fork image
`sha256:26c18e8d20a331d37b284174e33161c044c06fe657644f6e18f42082a255b46a`.
Running binary SHA-256
`85c1b22802dcc5c51e97bc75a334230a1a3c83e25c0107bc6258447de019acc7` matches
built artifact. Non-root 1000:1000, read-only root, private network, no public port,
read-only credential mount and existing hardening retained. Service status,
health 200, readiness 200, native discovery PASS. Production connector remains
**enabled:false**. Claw-Onshape **78/78**, typecheck PASS; Clawake **254/254**.
No Clawake source changes. Unrelated working-tree changes preserved.
Build recipe pins the fork directly; historical patch is not re-applied. Until
publication set CLAW_ONSHAPE_SOURCE_REPOSITORY to the local fork checkout.

## K. Live demo

**BLOCKED — architecture/runtime contract insufficient.** At
2026-10-13T14:27:43.503Z, independent REST inspection verified document
8b63eacf80efca72049f8017, Primary 1e76fac0ddca3ed10ecc9f28, Part Studio
7768b96c15d71e78cdbdd7d9, feature F37MrGsqQOiSdYi_0, plateWidth **50 mm**,
feature status OK, microversion b83ee0a0efcda65537780ef8. Parameter is
`feature.parameters[parameterId=plateWidth].expression` (current array index 1).
Primary microversion after reads/render is unchanged. Pinned 800×800 render,
42,710 bytes, SHA-256
3475c98025ecc2b6abc31eba18db48888843e4fa8570422cc0ab8f048f2e5c26;
private artifact `state/deployment/artifacts/self-hosted-mcp-before-20261013/before.png`.
This image is evidence, not a dimensional geometry test. No mutation approval
requested; no Candidate prepared while prerequisite native acceptance is blocked.
See [machine-readable evidence](evidence/self-hosted-mcp-bounded-modify-2026-10-13.json).

## L. Exactly one next task

The earlier proposed plugin handle is unnecessary for native agent invocation.
The next task is now [Gateway-owned read-only lifecycle acceptance](native-mcp-engineer-readonly-2026-10-13.md),
following the successful native feature read and the separate CLI cleanup failure.
