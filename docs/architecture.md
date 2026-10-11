# Architecture

Claw-Onshape 0.2.0 is a native OpenClaw 2026.9.9 plugin. The real Discord → Lead →
A2A → Engineer → REST → pinned PNG → Discord read/render slice is accepted.
See [specification](../spec.md), [decisions](ADR.md) and
[control/data-plane design](architecture/control-data-plane.md) for future scope.

Four optional v2 tool factories enforce native role/requester context. Lead has
only onshape_delegate_render; Engineer has status, inspection and rendering.
Host configuration chooses the document/workspace/Part Studio; agents supply no
URLs or target IDs. Execution rechecks current configuration, invocation authority
and private credentials before requests and result delivery.

Native A2A authenticates the peer, but does not forward Discord requester identity.
A Lead tool admitted for the exact trusted Discord sender/channel/account signs
an expiring context tied to the configured Engineer binding. Engineer verifies
peer/account/session/context before exposing reads and signs JSON results,
including status and errors in the text-only A2A result channel. Lead verifies
signature, exact target, microversion, private artifact path and PNG SHA-256 before
using originating native Discord delivery. No identity is inferred from text.

REST is the control/reporting plane. Inspection uses three fixed GETs; rendering
uses six fixed GETs including feature sourceMicroversion and pinned element/view
checks. HTTP responses are bounded, redirects rejected and failures sanitized.
PNG validation and private artifact handling are native; no screenshot service.
Rendering is not dimensional engineering verification.

One OAuth implementation serves CLI and native Control UI adapters. The dashboard
uses authenticated session actions: operator.read status, operator.admin connection
changes. Its public callback validates one-use state and exact Host/path/redirect.
Connect starts consent; users must follow the displayed authorization link.
Operator application provisioning and user consent remain separate. Dashboard
operator authority is not verified Discord identity; this MVP has one configured owner.

Private native credential files bind connection ownership. Consent, refresh and
disconnect share an exclusive lock; callbacks drain before lock release. Renewal
persists denial before an uncertain exchange and validates before saving tokens.
Fresh-grant exchange passed live; successful provider-expired renewal/rotation is
not established. Invalid/uncertain outcomes require reconnect. Files are not
keyring-backed/encrypted; same-UID/root processes remain trusted. No credentials
are returned to agents or stored in ordinary UI-visible config.

Clawake owns installation, private mounts, explicit global and per-agent grants,
configuration reconciliation and restarts. Native Agent Files get/set with
expectedHash updates deployed roles. A native Codex thread retains its first role
snapshot; a deliberate /new session activates a changed role. No generated JSON
or internal session databases are edited by the plugin.

MCP is the future contained CAD data plane. Current implementation provides only
explicit operator metadata discovery; all execution remains disabled. External
native MCP config is an independent authority surface and must stay disabled in
agent runtimes. Current provider schemas/containment/revision contracts need proof
before implementing dynamic FeatureScript execution.

Onshape remains authoritative. REST candidate workspace/version/concurrency gates,
geometry verification and before/after reporting are future capabilities. Primary
writes, all CAD mutation, merge and printing are disabled. No standalone service,
database, broker, workflow engine, duplicate revision history or extra agent.
