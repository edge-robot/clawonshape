# Claw-Onshape

Claw-Onshape is a native OpenClaw 2026.9.9 plugin for reading and rendering Onshape CAD context. The accepted path today is read-only: Discord → Robotics Lead → signed A2A → Mechanical Engineer → Onshape REST → pinned PNG delivery.

Current status:

- Read/render flow is accepted for one configured owner.
- Isolated native MCP feature reads pass; production MCP and CAD mutation remain disabled.
- Candidate preparation exists as an internal REST control-plane helper, with no agent creation tool.
- Deployment and configuration reconciliation are owned by Clawake.
- Native dashboard and CLI share the same OAuth connection lifecycle.

Start here:

- [Native MCP read acceptance](docs/native-mcp-engineer-readonly-2026-10-13.md) — latest Engineer test and remaining lifecycle gap
- [docs/product-mvp-status.md](docs/product-mvp-status.md) — current product acceptance and known gaps
- [agents/mechanical-engineer.md](agents/mechanical-engineer.md) — engineer role and onboarding
- [agents/agent-lead.md](agents/agent-lead.md) — A2A and delegation contract
- [docs/mcp-dashboard-readiness.md](docs/mcp-dashboard-readiness.md) — dashboard and MCP status
- [spec.md](spec.md) — broader product specification

## What is enabled right now

- `onshape_status`: connection readiness and capability summary
- `onshape_inspect`: configured document/workspace/element inspection
- `onshape_render`: pinned PNG render of the configured Part Studio element
- signed native A2A delegation from Lead to Engineer
- private OAuth secret handling and local connection storage

## What is explicitly not enabled

- CAD writes, workspace mutation, branch creation, merge, publish, or print
- production MCP access or dynamic FeatureScript work
- arbitrary user/self-service multi-user onboarding
- any bypass of the trusted requester and binding checks

## Quick install

Use Node 24+ and the pinned OpenClaw host.

```sh
npm install --cache /tmp/clawonshape-npm-cache
npm run typecheck
npm test
npm pack --cache /tmp/clawonshape-npm-cache
openclaw plugins install ./edge-robot-claw-onshape-0.2.2.tgz
```

Validate the installed plugin with:

```sh
openclaw plugins info claw-onshape --json
```

## Required configuration

Set `plugins.allow` to include `claw-onshape`, enable `plugins.entries.claw-onshape`, and provide a config like this:

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

Rules:

- Use trusted sender/channel/account values from the running OpenClaw setup; never infer them from prompt text.
- `liveReads` is false until real Onshape GET requests are authorized.
- `onshape_status`, `onshape_inspect` and `onshape_render` must stay restricted to the authorized Engineer agent.
- Missing requester fields fail closed; unbound A2A turns are rejected.
- The configured document/workspace/element IDs are host-owned; agents do not supply them.

## OAuth and dashboard onboarding

The dashboard page is at `http://localhost:19489` and the callback is:

```text
http://localhost:19489/plugins/claw-onshape/oauth/callback
```

Operator steps:

1. Register a confidential Onshape app and configure its callback.
2. Provision the private secret with:

```sh
node scripts/provision-oauth-secret.mjs
```

3. Open the native Claw-Onshape page, connect the configured owner connection, and complete Onshape consent.
4. Refresh status and verify the connection is actually active.

CLI equivalents:

```sh
openclaw onshape connect owner-rest --live
openclaw onshape connect owner-rest --live --rest-write
openclaw onshape status owner-rest
openclaw onshape disconnect owner-rest
```

Important constraints:

- `--rest-write` is an explicit operator consent and does not enable agent mutation.
- OAuth credentials stay in the private native store. The MCP service receives only access-token metadata through its restricted read-only mount; agents receive no token values.
- Failed or uncertain renewal and provider 401s require reconnect.
- Disconnect clears local credentials; it does not revoke the provider grant.

## Agent boundaries

Use the right role for the right job:

- Lead agent: coordinates user intent, delegates through native A2A, verifies signed results, and returns the final Discord response.
- Mechanical Engineer: owns CAD inspection, interpretation, and onboarding guidance.

No role is allowed to invent a mutation path, candidate workspace write path, or MCP execution path.

## Safe operating principles

- Treat Onshape as the authoritative CAD source.
- Verify the configured binding before invoking any tool.
- Keep OAuth app permissions and agent policy separate.
- Preserve the exact target IDs, source microversion, and PNG hash during render validation.
- If status says `UNKNOWN`, do not assume authorization or capability.

## Key files

- [src/](src/) — plugin implementation
- [docs/product-mvp-status.md](docs/product-mvp-status.md) — acceptance checkpoint
- [docs/oauth-capabilities.md](docs/oauth-capabilities.md) — OAuth and permission matrix
- [docs/mcp-dashboard-readiness.md](docs/mcp-dashboard-readiness.md) — dashboard and MCP readiness
- [agents/mechanical-engineer.md](agents/mechanical-engineer.md) — engineer instructions
- [agents/agent-lead.md](agents/agent-lead.md) — lead contract
- [spec.md](spec.md) — product specification
