# Candidate dashboard authorization repair — 2026-10-15

The native `candidate-prepare` session action passed a configured Discord binding
as an agent identity into the candidate authorization adapter. Production bindings
include a Discord channel restriction. Dashboard operator actions have no Discord
delivery context, so this path rejected legitimate operator preparation as
`agent_policy_denied`.

Version 0.2.8 introduces a separate internal operator adapter, selected only by the
native dashboard handler. It rechecks actual operator.admin authority, the configured
binding and semantic authorization snapshot, OAuth scopes, application permissions
and token identity through final dispatch. Existing A2A contexts cannot acquire
Candidate-creation authority. No agent identity is fabricated for the dashboard.

An integration test invokes the real dashboard handler with a Discord-channel-bound
target: operator.read is denied before IO; operator.admin with read/write OAuth
creates one verified Candidate; repetition reuses it without another POST.
Typecheck and all 93 tests pass. Deployment uses previewed Clawake setup and native
plugin synchronization on the existing Lead and Engineer. MCP image/policy remain
unchanged; the earlier mutation-receipt hardening is included in this release.

The pre-deployment native runtime reported `oauthWrite:false`, no mutation proposals
and Primary as the assigned target. Candidate preparation still requires explicit
read/write consent. A successful native live Candidate creation is not claimed
until its returned workspace and baseline have been verified.

Live post-deployment verification: both installed plugins report 0.2.8 and the
Gateways passed readiness. The actual native `candidate-prepare` action now returns
`oauth_write_scope_missing` instead of `agent_policy_denied`, matching the observed
`oauthWrite:false`. No workspace was created and no feature was modified. Human
read/write consent is the next required step. Private evidence is retained in
`state/deployment/candidate-dashboard-fix-runtime.json`.
