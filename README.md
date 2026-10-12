# Claw-Onshape

Focused native TypeScript plugin for **OpenClaw 2026.9.9**. The current product increment is Discord → Robotics Lead → signed A2A delegation → Mechanical Engineer → Onshape REST inspection and pinned PNG rendering. CAD mutation remains disabled. Deployment and configuration reconciliation belong to Clawake.

**Acceptance:** The real Discord → Lead → A2A → Engineer → REST → pinned PNG → Discord journey passed on October 11. 31 offline tests and the exact host SDK typecheck pass. See [product status](docs/product-mvp-status.md) for native deployment, OAuth and Discord acceptance; offline checks do not establish live provider success.

The Engineer dashboard has a native Claw-Onshape page with Connect, Status and Disconnect actions. Provision the application secret with `node scripts/provision-oauth-secret.mjs` (hidden input), then use the page at `http://localhost:19489`. Register callback `http://localhost:19489/plugins/claw-onshape/oauth/callback`. Secrets stay in private files; the public client ID and secret-file path belong to operator configuration. CLI and dashboard share one lifecycle implementation.

The same page separates **Onshape REST** capabilities from operator-only
**Onshape MCP** readiness. Native saved status is read without connecting;
missing signals are UNKNOWN, discovery is HISTORICAL, and **CAD mutation: BLOCKED**
remains explicit. No MCP connection or grant controls are added. See the
[dashboard readiness contract](docs/mcp-dashboard-readiness.md).


## Agent instructions

[Mechanical Engineer](agents/mechanical-engineer.md) explains the role, tool use,
and actual dashboard/OAuth onboarding steps. The [Lead A2A contract](agents/agent-lead.md)
covers delegation, authorization, result format, image delivery and failures.
Storing these documents does not automatically load them into active OpenClaw roles.
Write repository documentation and code comments in English.

## Install and configure

Use Node 24+ and the pinned OpenClaw host. In an environment with dependency access:

```sh
npm install --cache /tmp/clawonshape-npm-cache
npm run typecheck
npm test
npm pack --cache /tmp/clawonshape-npm-cache
openclaw plugins install ./edge-robot-claw-onshape-0.2.0.tgz
```

Clawake can manage the same archive, configuration and restarts through its existing facilities. Install through one discovery location and inspect `openclaw plugins info claw-onshape --json` for loading, duplicate-discovery and provenance diagnostics; a package checksum does not resolve native trust. `npm run test:host` checks the installed plugin without invoking Onshape.

Configure `plugins.allow` to include `claw-onshape`, enable `plugins.entries.claw-onshape`, and set its `config` below. All IDs are examples. Obtain exact trusted sender/channel/account values from the existing OpenClaw channel setup, not from an agent's claims. For an initial loader check use `{"bindings":[],"liveReads":false}`.

```json
{
  "bindings": [{
    "agentId": "mechanical-engineer",
    "requesterSenderId": "YOUR_AUTHENTICATED_CHANNEL_SENDER_ID",
    "messageChannel": "discord",
    "agentAccountId": "YOUR_OPENCLAW_CHANNEL_ACCOUNT_ID",
    "connectionRef": "owner-rest",
    "documentId": "aaaaaaaaaaaaaaaaaaaaaaaa",
    "primaryWorkspaceId": "bbbbbbbbbbbbbbbbbbbbbbbb",
    "workspaceId": "bbbbbbbbbbbbbbbbbbbbbbbb",
    "elementId": "cccccccccccccccccccccccc",
    "discordChannelId": "123456789012345678"
  }],
  "liveReads": false,
  "oauth": {
    "clientId": "YOUR_REGISTERED_APPLICATION_ID",
    "clientSecretFile": "/absolute/private/path/onshape-client-secret",
    "applicationPermissions": {
      "canDeleteDocumentsAndWorkspaces": false,
      "canRequestPurchases": false,
      "canShareAndUnshareDocuments": false,
      "canReadProfileInformation": false
    }
  }
}
```

Grant `onshape_inspect`, `onshape_status` and `onshape_render` only to the authorized Engineer agent using OpenClaw's existing per-agent `tools.alsoAllow` configuration. Other identities receive no plugin tool even if granted by mistake. Missing trusted requester fields fail closed, including unbound A2A turns: Robotics Lead delegation needs a verified propagated user identity before this tool can work. The product increment adds a bounded signed A2A context tied to an existing Engineer binding; see ADR-011. Native A2A peer authentication alone is insufficient.

Native configuration schema/UI hints expose context preferences. Select document and primary workspace by setting their Onshape IDs; active workspace initially equals primary for read-only inspection. An operator may later select an existing experimental workspace in the same document. Rendering is supported by `onshape_render` at the configured `elementId`; agent branch creation and merge remain unavailable; the primary never changes automatically. Agent CAD writes remain disabled, including writes to experimental workspaces.
An internal REST contract helper now prepares or validates a candidate workspace from an exact source microversion, but it is not exposed as an agent tool and does not enable CAD mutation.

## Connect and disconnect

Register **your own** confidential OAuth application in Onshape individual/company Developer Settings. Enable `OAuth2Read` (and `OAuth2Write` only if you intentionally need REST lifecycle writes) and register the exact callback `http://localhost:8765`. Privately provision its client secret as an owner-only regular file (0600, private directory). No shared application secret is distributed. See the [official OAuth requirements](https://onshape-public.github.io/docs/auth/oauth/).

Run these commands on the operator-controlled OpenClaw host:

```sh
openclaw onshape connect owner-rest --live
openclaw onshape connect owner-rest --live --rest-write
openclaw onshape status owner-rest
openclaw onshape disconnect owner-rest
```

Connect prints a browser authorization URL and starts a temporary five-minute loopback listener on `127.0.0.1:8765`. It validates Host/path, random single-use state, expiry and token response before native atomic secret-file storage. It does not launch a dashboard/server service. Container/remote hosts need browser localhost routing to this exact listener; IPv6-only localhost and arbitrary redirect URLs are unsupported. OAuth2Read consent does not verify canonical account identity; status says so.
`--rest-write` is an explicit operator consent step and requires a trusted `canWriteDocuments:true` application attestation. Existing read-only connections are not silently upgraded. This flag does not enable an agent write tool. Omitted application permission fields mean unknown; record the four known disabled permissions explicitly as shown above. See [OAuth capability contract](docs/oauth-capabilities.md) for the matrix, scope evidence and internal candidate authorization.

Enable `liveReads:true` only after authorizing real GET requests. Each inspection makes three requests: document, workspace list, elements. Rendering adds feature-revision capture, pinned element verification and a pinned shaded-view GET. No provider call runs on startup, registration, status or automated tests. Tokens stay in OpenClaw's state root under `claw-onshape/credentials/<connectionRef>.json`, using native private-file helpers; target/preferences live in host configuration. Private files are **not encrypted or OS-keyring backed**. This onboarding targets Linux with an existing private, operator-owned state root; processes with the same UID/root remain trusted. Do not grant the CAD agent shell/file access to credential state; use existing host isolation and least-privilege tool policy.

Near-expiry reads use shared serialized OAuth refresh. Failed/uncertain renewal and provider 401 require reconnect; successful provider-expired renewal and token rotation still need live acceptance. A failed reconnect invalidates previous access. Disconnect clears local credentials but does not revoke the provider grant; revoke it through Onshape settings when needed. A connect/disconnect lock prevents successful disconnect followed by a pending callback restoring access. Overlapping lifecycle operations fail busy. After a process crash, inspect and remove the `.claw-onshape-<connectionRef>.lock` file only once that process is stopped; there is no automatic stale-lock takeover.

## Separate MCP foundation

REST tokens are never supplied to MCP. OpenClaw owns MCP OAuth and metadata probing. This plugin provides **operator-only discovery**, with every discovered operation classified disabled; there is no agent MCP call/proxy tool. The native probe returns projected names, not input schemas, so it cannot prove safe target restrictions. Historical schemas and all 14 observed tools are reviewed in [migration-map.md](docs/migration-map.md).

For explicit metadata investigation, use a **separate operator OpenClaw profile without agent turns**, with a native server such as:

```json
{
  "mcp": {"servers": {"onshape": {
    "enabled": true,
    "url": "https://fs-mcp.labs.onshape.app/mcp",
    "transport": "streamable-http",
    "auth": "oauth",
    "oauth": {"scope": "OAuth2Read"}
  }}}
}
```

After explicitly authorizing native MCP login, use `openclaw mcp login onshape`, then `openclaw onshape mcp-discover onshape --live` in that profile. Do not enable this unrestricted native server in an agent runtime: native MCP tools are an independent host surface and bypass this plugin's REST restrictions. The plugin does not install that config, grant its tools, or claim to guard external MCP configurations. Keep hosted MCP disabled in the deployed Mechanical Engineer runtime for MVP. No official MCP SDK dependency is needed for this discovery-only native path.

## Limits and evidence

[Migration research](docs/migration-map.md) includes exact branch/source/test references, historical live versus mock evidence, endpoints and unresolved contracts. [Architecture](docs/architecture.md) explains the boundaries; [validation](docs/validation.md) records checks and acceptance gaps.

The October 11 review records [current runtime diagnostics](docs/diagnostics-2026-10-11.md),
[native OAuth/REST blockers](docs/onshape-live-validation.md),
[control/data-plane design](docs/architecture/control-data-plane.md),
[architectural decisions](docs/ADR.md), and the [CAD mutation MVP plan](docs/plans/cad-mutation-mvp.md).
CAD execution remains disabled; historical ClawCAD acceptance is not native
Claw-Onshape live acceptance.

See [spec.md](spec.md) for implemented and missing features and [ADR review](docs/adr-review-2026-10-11.md) for corrected decisions. Native onboarding and the actual Discord read/render journey pass. Refresh is implemented; fresh-grant exchange passed, while provider-expired recovery/rotation remains partial. Broader dashboard provisioning, canonical account association, multi-user onboarding and all CAD mutation/promotion capabilities remain missing or deferred.

The [REST foundation review](docs/rest-foundation-review.md) records the current
candidate/OAuth acceptance gaps and real SDK evidence. The
[all-package E2E checklist](docs/rest-foundation-e2e.md) defines the next validation.
`npm run test:native-files` checks the real private-file SDK using small synthetic
temporary files; unavailable runtime imports fail explicitly. It makes no
provider requests and is separate from the mocked offline suite.

Engineer grants: `onshape_status`, `onshape_inspect`, `onshape_render`. Lead grant: `onshape_delegate_render`. All are optional and independently enforce native role/requester context. Rendering pins the shaded view to the inspected microversion. HMAC delegation keys and the narrow shared PNG mount are managed through the private Clawake deployment inventory; raw MCP execution remains disabled.
