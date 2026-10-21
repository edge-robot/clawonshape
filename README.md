# Claw-Onshape

Claw-Onshape is a native OpenClaw 2026.9.9 plugin for reading and rendering Onshape CAD context. The accepted inspection path is Discord → Robotics Lead → signed A2A → Mechanical Engineer → native Onshape MCP. Claw-Onshape owns credentials and independently verifies feature observations; the existing REST render path delivers pinned PNGs.

Current status:

- Read/render flow is accepted for one configured owner.
- Gateway-owned native MCP feature reads pass, including hole diameter inspection. Candidate mutation is implemented but has not yet passed live write acceptance; the deployed target remains read-only.
- The Engineering Cockpit is a read-only overview and review page. A separate, collapsed Operator actions section preserves the existing guarded `mutation-approve`, `mutation-reconcile` and `candidate-prepare` actions until Discord approval proofs ship (P3b, #11). Engineer performs approved feature updates through native MCP; no agent creation tool is granted.
- The native cockpit now has Workspace, CAD and 3D Print views in the working tree. Current labels load through guarded, GET-only workspace metadata independently of PNGs. Goal iteration and automated print preparation remain blocked; browser/live acceptance is open.
- Deployment and configuration reconciliation are owned by Clawake.
- Native dashboard and CLI share the same OAuth connection lifecycle.

Start here:

- [Engineering Cockpit](docs/engineering-cockpit.md) — workspace, Candidate selection, CAD views, evidence and next steps

- [Live read evidence](docs/dashboard-connection-fix-2026-10-14.md) — Gateway-owned hole inspection and request-policy repair
- [docs/product-mvp-status.md](docs/product-mvp-status.md) — current product acceptance and known gaps
- [agents/mechanical-engineer/workspace/AGENTS.md](agents/mechanical-engineer/workspace/AGENTS.md) — engineer role and onboarding
- [agents/robotics-lead/workspace/AGENTS.md](agents/robotics-lead/workspace/AGENTS.md) — A2A and delegation contract
- [docs/mcp-dashboard-readiness.md](docs/mcp-dashboard-readiness.md) — dashboard and MCP status
- [spec.md](spec.md) — broader product specification

## What is enabled right now

- `onshape_status`: connection readiness and capability summary
- `onshape_inspect`: configured document/workspace/element inspection
- `onshape_render`: pinned PNG render of the configured Part Studio element
- signed native A2A delegation from Lead to Engineer
- private OAuth secret handling and local connection storage

## What is explicitly not enabled

- unapproved CAD writes, writes to protected Primary, merge, publish, or print
- unapproved MCP writes or dynamic FeatureScript work
- arbitrary user/self-service multi-user onboarding
- any bypass of the trusted requester and binding checks

## Quick install

Use Node 24+ and the pinned OpenClaw host.

```sh
npm install --cache /tmp/clawonshape-npm-cache
npm run typecheck
npm test
npm pack --cache /tmp/clawonshape-npm-cache
openclaw plugins install ./edge-robot-claw-onshape-0.2.7.tgz
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

3. Open the native Claw-Onshape page → **Verbindung & technische Details** → **Onshape verbinden**, and complete Onshape consent.
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
- [agents/mechanical-engineer/workspace/AGENTS.md](agents/mechanical-engineer/workspace/AGENTS.md) — engineer instructions
- [agents/robotics-lead/workspace/AGENTS.md](agents/robotics-lead/workspace/AGENTS.md) — lead contract
- [spec.md](spec.md) — product specification

## Current self-hosted deployment layout

Use `deploy/team.json` as the canonical Clawake inventory. The actual agent
workspaces are `agents/<role>/workspace`; deployment definitions are
`agents/<role>/definition/ROLE.md`. Runtime state, credentials, packages and
unreviewed artifacts remain in ignored `state/`. Agent IDs remain unchanged during
migration. The three Engineer Workshop skills stay editable through the native
Workshop UI; their reviewed exports are outside the active workspace.

See [workspace/state migration](docs/workspace-state-migration-2026-10-14.md) for
paths, preview/apply commands, native skill export/import, backups and acceptance.

See [free engineering tasks and Candidate execution](docs/free-engineering-tasks-2026-10-14.md) for the implemented native write workflow and its acceptance limits.
