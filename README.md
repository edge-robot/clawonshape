# Claw-Onshape

Minimal native TypeScript OpenClaw plugin foundation, researched against **OpenClaw 2026.9.9**. One optional tool, `onshape_inspect`, reads the configured document, verifies active/primary workspace membership, and returns element identifiers. No service, database, broker, CAD catalog, new agents or Clawake changes.

**Acceptance is offline only:** build, mocked registration/OAuth/REST/MCP tests and packaging pass. Native OpenClaw loading, SDK typechecking and live provider onboarding have not been run in this environment. This is a reviewable foundation, not a demonstrated one-click connection.

## Install and configure

Use Node 24+ and the pinned OpenClaw host. In an environment with dependency access:

```sh
npm install --cache /tmp/clawonshape-npm-cache
npm run typecheck
npm test
npm pack --cache /tmp/clawonshape-npm-cache
openclaw plugins install ./edge-robot-claw-onshape-0.1.0.tgz
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
    "workspaceId": "bbbbbbbbbbbbbbbbbbbbbbbb"
  }],
  "liveReads": false,
  "oauth": {
    "clientId": "YOUR_REGISTERED_APPLICATION_ID",
    "clientSecretFile": "/absolute/private/path/onshape-client-secret"
  }
}
```

Grant only `onshape_inspect` to the authorized agent using OpenClaw's existing per-agent `tools.alsoAllow` configuration. Other identities receive no plugin tool even if granted by mistake. Missing trusted requester fields fail closed, including unbound A2A turns: Robotics Lead delegation needs a verified propagated user identity before this tool can work. No new A2A bridge is provided.

Native configuration schema/UI hints expose context preferences. Select document and primary workspace by setting their Onshape IDs; active workspace initially equals primary for read-only inspection. An operator may later select an existing experimental workspace in the same document. Branch creation, rendering and merge are deferred; primary never changes automatically. Every write is disabled, including writes to experimental workspaces.

## Connect and disconnect

Register **your own** confidential OAuth application in Onshape individual/company Developer Settings. Enable `OAuth2Read` and register the exact callback `http://localhost:8765`. Privately provision its client secret as an owner-only regular file (0600, private directory). No shared application secret is distributed. See the [official OAuth requirements](https://onshape-public.github.io/docs/auth/oauth/).

Run these commands on the operator-controlled OpenClaw host:

```sh
openclaw onshape connect owner-rest --live
openclaw onshape status owner-rest
openclaw onshape disconnect owner-rest
```

Connect prints a browser authorization URL and starts a temporary five-minute loopback listener on `127.0.0.1:8765`. It validates Host/path, random single-use state, expiry and token response before native atomic secret-file storage. It does not launch a dashboard/server service. Container/remote hosts need browser localhost routing to this exact listener; IPv6-only localhost and arbitrary redirect URLs are unsupported. OAuth2Read consent does not verify canonical account identity; status says so.

Enable `liveReads:true` only after authorizing real GET requests. Each inspection makes three requests: document, workspace list, elements. No provider call runs on startup, registration, status or automated tests. Tokens stay in OpenClaw's state root under `claw-onshape/credentials/<connectionRef>.json`, using native private-file helpers; target/preferences live in host configuration. Private files are **not encrypted or OS-keyring backed**. This onboarding targets Linux with an existing private, operator-owned state root; processes with the same UID/root remain trusted. Do not grant the CAD agent shell/file access to credential state; use existing host isolation and least-privilege tool policy.

Expiry and provider 401 require reconnect. Refresh is not implemented; a failed reconnect invalidates previous access. Disconnect clears local credentials but does not revoke the provider grant; revoke it through Onshape settings when needed. A connect/disconnect lock prevents successful disconnect followed by a pending callback restoring access. Overlapping lifecycle operations fail busy. After a process crash, inspect and remove the `.claw-onshape-<connectionRef>.lock` file only once that process is stopped; there is no automatic stale-lock takeover.

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

Unresolved: actual host load/typecheck, live Onshape exchange/read acceptance, canonical account binding, automatic refresh, secure broad public distribution, native Connect/dashboard UX, target-aware MCP calls, branch creation/rendering, and authenticated promotion authority. Merge remains disabled; natural-language approval cannot authorize it. OpenClaw APIs are experimental, so compatibility beyond the researched host is not claimed.
