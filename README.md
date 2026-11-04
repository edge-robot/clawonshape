# Claw-Onshape

Claw-Onshape is a native [OpenClaw](https://docs.openclaw.ai/) plugin that connects a small
OpenClaw agent team to [Onshape](https://www.onshape.com/) CAD. A **Robotics Lead** takes
requests in Discord and delegates them over signed A2A to a **Mechanical Engineer**, which reads,
renders and (within approved goals) edits Onshape Part Studios through the self-hosted
[onshape-mcp](https://github.com/edge-robot/onshape-mcp) server.

- **[spec.md](spec.md)** is the normative product specification.
- **[docs/README.md](docs/README.md)** is the documentation index (normative docs vs. history).
- Status: project closed on 2026-10-26 with the Camera Mount Plate workflow as the delivered demo
  ([ADR-2026-10-26](docs/ADR.md), [closure plan](docs/project-closure-2026-10-26.md)).

## The stack

Three repositories, checked out side by side in one workspace directory (`<workspace>`):

| Repository | Role |
|---|---|
| [edge-robot/clawonshape](https://github.com/edge-robot/clawonshape) (this repo) | OpenClaw plugin, agent roles and workspaces, team inventory `deploy/team.json`, interface contract |
| [edge-robot/onshape-mcp](https://github.com/edge-robot/onshape-mcp) | MCP server for Onshape (fork of [altendky/onshape-mcp](https://github.com/altendky/onshape-mcp)); built into the `clawonshape-mcp` image |
| [edge-robot/clawake](https://github.com/edge-robot/clawake) | Deployment and lifecycle manager: renders Podman Quadlets, installs plugins, restarts, upgrades |

Supported version combinations are listed in the compatibility matrix,
[docs/interface/onshape-mcp.md §9](docs/interface/onshape-mcp.md#9-versioning-and-compatibility).
Deploy only a row marked **accepted**.

## Getting started from a fresh checkout

Prerequisites: Linux with systemd user services and lingering, rootless Podman, `git`, `uv`,
Node ≥ 24.16, `openssl`; a Discord bot and server; an Onshape account with a registered OAuth app
and a model provider account for the agents.

```sh
mkdir -p <workspace> && cd <workspace>
git clone https://github.com/edge-robot/clawonshape.git
git clone https://github.com/edge-robot/onshape-mcp.git
git clone https://github.com/edge-robot/clawake.git
uv sync --project clawake
uv run --project clawake clawake validate -c clawonshape/deploy/team.json
```

`deploy/team.json` contains no host paths: Clawake resolves `${CLAWAKE_PROJECT_ROOT}` to this
checkout. Machine-specific values live outside the repositories:

| File | Content |
|---|---|
| `~/.config/clawake/clawonshape/site.json` (0600) | Discord guild/channel/user IDs, Onshape document IDs (`${site:…}` references) |
| `~/.config/clawake/clawonshape/pins.json` (0600) | image digests and plugin tarball checksums (Clawake runtime pins) |
| `clawonshape/state/` (git-ignored) | secrets, OAuth connections, runtime state, built packages |

The full guided procedure, from preflight to the first end-to-end Discord request, is the
onboarding runbook [docs/prompts/2026-10-19-team-onboarding.md](docs/prompts/2026-10-19-team-onboarding.md),
executed by the operator agent [.claude/agents/team-onboarding-agent.md](.claude/agents/team-onboarding-agent.md).
Use the version pins of the accepted matrix row, not the ones quoted in the runbook. In short:

1. Build the MCP image (`deploy/onshape-mcp/build.sh`) and pack the plugin from a clean
   `git archive` (`npm ci && npm test && npm pack`).
2. Write `site.json`, `pins.json` and the secrets under `state/secrets/`.
3. `clawake onshape-mcp`, `clawake setup`, `clawake sync-plugins`: always preview first, then
   `--execute`.
4. Connect Onshape through the plugin dashboard (see *OAuth and dashboard onboarding* below).
5. Mention the Lead in the team's Discord channel.

## Develop the plugin

```sh
npm ci
npm run typecheck
npm test
npx biome ci .
npm pack
```

The plugin is developed against the OpenClaw version in `devDependencies` and accepts the
`peerDependencies` range.

## What is explicitly not enabled

- unapproved CAD writes, writes to the protected Primary workspace, merge, publish, or print
- unapproved MCP writes or dynamic FeatureScript work
- arbitrary self-service multi-user onboarding
- any bypass of the trusted requester and binding checks

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

## License

Apache License 2.0, see [LICENSE](LICENSE). onshape-mcp is dual-licensed MIT OR Apache-2.0;
Clawake is MIT-licensed.
