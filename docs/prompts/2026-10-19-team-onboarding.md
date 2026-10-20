---
target-repo: edge-robot/clawonshape
branch: none (operational runbook; writes only git-ignored state and one evidence file)
worktree: <workspace>/clawonshape (main checkout on the fresh machine)
issue: pending — draft "Fresh-machine onboarding of the robotics team" (not yet filed); related edge-robot/clawake#26 (ADR-005)
architecture-ref: clawonshape/docs/architecture.md, clawake/docs/architecture.md, clawonshape/docs/interface/onshape-mcp.md#9-versioning-and-compatibility
contract-version: 0.4.0-draft (accepted row)
foreign-repo-commit: clawake 85079c8, onshape-mcp f27613e
agent: team-onboarding-agent (clawonshape/.claude/agents/team-onboarding-agent.md)
status: draft
---
# Bring up the robotics team on a fresh machine

## Goal

Starting from a machine that has nothing except Linux, an internet connection and the
operator's accounts, end with:

- `clawonshape-mcp`, `clawcad-robotics-lead` and `clawcad-mechanical-engineer` running as
  rootless Podman Quadlets under systemd `--user`;
- every member `ready` (gateway `/readyz` 200, pinned plugin loaded);
- the Robotics Lead answering in exactly one Discord channel, only to allowed users;
- the Mechanical Engineer connected to Onshape through the ClawOnshape dashboard;
- one verified end-to-end Discord request (Lead → signed A2A → Engineer → Onshape → reply);
- an evidence file without secrets or IDs.

The operator should experience this as a short, guided conversation. The Discord bot setup is
the part most operators have never done before; it gets the most care (Phase 5).

## Context

Normative documents (read before acting, in this order):

1. `clawonshape/docs/interface/onshape-mcp.md` §9: the compatibility matrix. Only the
   row marked **accepted** may be deployed.
2. `clawake/docs/architecture.md`, `clawake/docs/manual.md`, `clawake/docs/ADR.md` (if it
   exists on the checked-out ref): lifecycle commands, readiness model (ADR-003).
3. `clawonshape/README.md` sections *Required configuration* and *OAuth and dashboard
   onboarding*, `clawonshape/docs/workspace-state-migration-2026-10-14.md` (paths of
   `agents/`, `state/` and mounts).
4. OpenClaw Discord docs: https://docs.openclaw.ai/channels/discord/setup and
   https://docs.openclaw.ai/channels/discord/access-control. Re-fetch them; do not rely
   on the summary in Phase 5 if the docs changed.

Component ownership:

- **Clawake**: inventory, Quadlets, restarts, plugin sync, readiness.
- **ClawOnshape**: plugin, Onshape OAuth, bindings, dashboard.
- **onshape-mcp**: MCP server image.
- **OpenClaw**: agent runtime, Discord channel, pairing.

### Pinned versions (maintained by onshape-architekt; do not change)

| Item | Pin | How to verify |
|---|---|---|
| Contract row | 0.4.0-draft, status **accepted** 2026-10-16 | `docs/interface/onshape-mcp.md` §9 |
| OpenClaw image | `ghcr.io/openclaw/openclaw:2026.9.9` @ `sha256:7f10d5cc975a90b65192eaa099454fe33ce8ce2390806c61c65cd868e9ef730d` | `podman image inspect --format '{{.Digest}}'` |
| onshape-mcp source | `edge-robot/onshape-mcp` commit `f27613e7854de1b4c8de2438c8f6c87761259cd5` (branch `claw-onshape/external-token`) | `git -C onshape-mcp cat-file -e f27613e^{commit}` |
| onshape-mcp image | built by `clawonshape/deploy/onshape-mcp/build.sh`, tag `localhost/clawonshape-mcp:f27613e-external-token-v4`; reference binary sha256 `28d3bdbc02939f33ad99da1435589735804481ab1dc7b8545462b5289c4ffb64` (`deploy/onshape-mcp/upstream.json`) | compare binary sha256; a different image digest on a new machine is expected and is a **finding**, not a failure (G11) |
| ClawOnshape plugin | 0.2.10 @ `6bbc5e5`, tarball sha256 `e98648b9c8c2649e21dd5a289e039e60b3a4bbf7c88b6319e51a4da34433e03b` | `sha256sum` of the packed `.tgz`; a mismatch is a finding (npm pack reproducibility is unverified) |
| Clawake | `edge-robot/clawake` `main` @ `85079c8` (PR #33 + #35: demo line, runtime pins, `rollout`, Discord + site values, #32 `validate` fix, backup hardening #28–#31/#34); check out detached: `git -C clawake switch --detach 85079c8` | `git -C clawake rev-parse --short HEAD` = `85079c8` |

Clawake is being reworked right now (`clawake/docs/ADR.md`):

| Stage | What it adds |
|---|---|
| ADR-003 P1 / P2 | readiness in `status`; targeted restarts; readiness-gated `sync-plugins` |
| ADR-004 P3a | private runtime pin overlay `runtime_pins` |
| P3b | one-step `clawake rollout` |
| ADR-005 P4 | `channels.discord` rendered from the inventory, with private `site_values` and `${site:<name>}` references |

Until onshape-architekt changes the Clawake pin above, use the pinned ref. Do not check out
feature branches yourself. Detect what the pinned ref offers and pick the matching path:

| Capability | Detection (read-only) | Path when present | Path when absent |
|---|---|---|---|
| rollout (P3b) | `clawake --help` lists `rollout` | Phase 4 rollout | Phase 4 classic |
| runtime pins (P3a) | `clawake --help` lists `pins` | Phase 3 step 2b | Phase 3 step 2a |
| Discord rendering (P4) | `clawake setup --help` shows `--adopt` **and** `clawake/docs/ADR.md` has ADR-005 | Phase 3 step 1b and Phase 5 D7b | Phase 5 D7a (interim) |

Never run `clawake upgrade --execute` on a JSON inventory without `runtime_pins`.
On older refs it rewrites the image object as YAML and breaks the file (edge-robot/clawake#27).

### Known blockers (2026-10-19; check each one in Phase 0 and report it, do not work around it)

| # | Blocker | Effect on this runbook |
|---|---|---|
| B1 | Plugin commit `6bbc5e5` and the current `clawonshape` demo line are not pushed | Phase 1 stops if `6bbc5e5` is not reachable; ask the operator to get the commit pushed |
| B2 | `deploy/team.json` contains absolute paths and site IDs of the original machine (clawake#19, #20). Planned fix: `runtime_pins` (ADR-004), `site_values` + `${site:…}` (Clawake ADR-005, ClawOnshape ADR-2026-10-19, proposed) | Phase 3 generates a local inventory; never edit `deploy/team.json` |
| B3 | Discord channel config is not provisioned by Clawake. Fix: ADR-005 P4 (edge-robot/clawake#26) | D7b once P4 is on the pinned ref, otherwise interim D7a (`openclaw config patch` with a SecretRef token) |
| B4 | No `users` allowlist on the Lead channel (clawake#21, folded into #26) | D7a/D7b add it; the approver is the operator's Discord user |
| B5 | MCP `service.json` / `config.toml` are not versioned | Phase 3 creates them from `deploy/onshape-mcp/config.example.toml` |
| B6 | `provision-oauth-secret.mjs` target path vs. inventory mount path may differ | Phase 6 checks that the inventory's `clientSecretFile` source exists before restarting |
| B7 | No script creates A2A tokens, gateway tokens or the delegation key | Phase 3 generates them with the recipe below |
| B9 | Engineer and `clawonshape-mcp` must run as the same host UID (G7, clawake#16) | Phase 0 records `id -u`; everything runs as that one user |

## Binding constraints and prohibitions

- Follow `team-onboarding-agent.md`: one step per message, secrets never in chat, preview
  before every `--execute`, and an explicit yes per `--execute`.
- Never edit versioned files in any of the three repos. Allowed writes:
  - `clawonshape/state/**` (git-ignored);
  - the evidence file `clawonshape/docs/evidence/<date>-fresh-machine-onboarding.md`;
  - `~/.config/containers/systemd/` and `~/.config/systemd/user/`, but only through Clawake.
- Never commit, push, create branches or worktrees. Never write to `edge-robot/clawake`
  issues: the repo is public. Collect findings in the evidence file instead.
- Never read secret file contents. Check presence with `test -s` and env var names with
  `cut -d= -f1`.
- Do not continue past a failed acceptance check of a phase. Report it with the most likely
  cause and the owning component.

## Steps

Use `<ws>` for the workspace root that holds the three checkouts as siblings:
`<ws>/clawake`, `<ws>/clawonshape`, `<ws>/onshape-mcp`. Use `<inv>` for the local inventory
created in Phase 3: `<ws>/clawonshape/state/deployment/team.local.json`.

Overview for the operator (show it once, at the start):

> 0 Prüfen · 1 Checkouts · 2 Bauen · 3 Lokale Konfiguration · 4 Team starten ·
> 5 Discord · 6 Onshape verbinden · 7 Ende-zu-Ende-Test · 8 Abschluss

### Phase 0: preflight (read-only)

Check and show the results as one table (ok / missing / finding):

- Linux with systemd; `loginctl show-user "$USER" -p Linger` is `yes`. If not, the operator
  runs `loginctl enable-linger "$USER"` themselves; explain that this keeps the team running
  after logout.
- `podman --version` (rootless, `podman info --format '{{.Host.Security.Rootless}}'` is
  `true`), `systemctl --user is-system-running` (`running` or `degraded`).
- `git`, `uv`, `node` ≥ 24, `npm`, `openssl`, `sha256sum`, `curl`.
- `id -u` (record it, B9). Free ports `19389`, `19489` (`ss -ltn`).
- Disk space: at least 10 GB free in the Podman storage and in `<ws>` (Rust build).
- Existing state: `podman ps -a --format '{{.Names}}'` shows no `clawcad-*` or
  `clawonshape-mcp`. If they exist, stop: this is not a fresh machine. Ask whether to
  re-onboard; never tear anything down without an explicit request.

Acceptance: every row is ok, or the operator has accepted the finding.

### Phase 1: checkouts

1. If the three checkouts are missing, show the clone commands and let the operator run them
   (they may need their own GitHub credentials):
   ```sh
   git clone https://github.com/edge-robot/clawake.git <ws>/clawake
   git clone https://github.com/edge-robot/clawonshape.git <ws>/clawonshape
   git clone https://github.com/edge-robot/onshape-mcp.git <ws>/onshape-mcp
   ```
2. Check out the pins (detached is fine): Clawake `4da3957`, onshape-mcp `f27613e`.
   For clawonshape, use the branch the operator was told to use. If they have no
   instruction, use `demo/gateway-native-read-20261014`. Then verify
   `git -C <ws>/clawonshape cat-file -e 6bbc5e5^{commit}`. On failure, stop with blocker B1.
3. `uv sync --project <ws>/clawake` and `uv run --project <ws>/clawake clawake --help`.
   Record the available commands. Note in particular whether `rollout` exists and whether
   `status` reports readiness.

Acceptance: all pins resolve; `git status --short` is clean in all three checkouts.

### Phase 2: build artifacts (start in the background, continue with Phase 3 and Phase 5 steps D1–D5 meanwhile)

1. MCP image:
   ```sh
   CLAW_ONSHAPE_BUILD_DIR=<ws>/clawonshape/state/build/onshape-mcp \
   CLAW_ONSHAPE_SOURCE_REPOSITORY=<ws>/onshape-mcp \
   bash <ws>/clawonshape/deploy/onshape-mcp/build.sh
   ```
   The build directory must be empty; the script runs fmt, clippy and the tests first. When
   done, compare `sha256sum state/build/onshape-mcp/image/onshape-mcp` with the reference
   binary sha256, and record the local image digest.
2. Plugin, from a temporary export of the pinned commit so the checkout stays clean:
   ```sh
   mkdir -p <ws>/clawonshape/state/build/plugin-6bbc5e5
   git -C <ws>/clawonshape archive 6bbc5e5 | tar -x -C <ws>/clawonshape/state/build/plugin-6bbc5e5
   npm ci --prefix <ws>/clawonshape/state/build/plugin-6bbc5e5
   npm test --prefix <ws>/clawonshape/state/build/plugin-6bbc5e5
   npm pack --prefix <ws>/clawonshape/state/build/plugin-6bbc5e5 --pack-destination <ws>/clawonshape/state/packages
   ```
   Compare the tarball sha256 with the pin. On a mismatch, record a finding and use the
   local sha256 in the inventory. Never deploy an unpinned version.
3. `podman pull ghcr.io/openclaw/openclaw@sha256:7f10d5cc975a90b65192eaa099454fe33ce8ce2390806c61c65cd868e9ef730d`.

Acceptance: image present, binary sha256 recorded, plugin `.tgz` present with its sha256
recorded, OpenClaw digest equal to the pin.

### Phase 3: local configuration (no secrets in chat)

1. **Collect the site values**, one question at a time (rules in the agent file). The
   Discord values come from Phase 5 steps D1–D5. You may run those steps now and fill in the
   inventory afterwards.

   | Value | Used in | Format |
   |---|---|---|
   | Discord server (guild) ID | channel config | 17–20 digits |
   | Discord channel ID for the team | channel config, plugin binding `discordChannelId` | 17–20 digits |
   | Operator's Discord user ID | `users` allowlist, binding `requesterSenderId` | 17–20 digits |
   | Discord application ID | channel config `applicationId`, invite link | 17–20 digits |
   | Onshape document / workspace / element ID (Part Studio) | binding, MCP `config.toml` | 24 hex chars each, from the Onshape URL `…/documents/<d>/w/<w>/e/<e>` |
   | Onshape OAuth client ID | Engineer plugin `oauth.clientId` | as shown by the Onshape developer portal |

   The operator can paste the whole Onshape URL; split it yourself and confirm the three IDs.

   **1b (only with Discord rendering, P4):** write the values into the private site values
   file `~/.config/clawake/clawonshape/site-values.json`. Create the directory with
   `install -d -m 0700`, and give the file mode `0600`. It lives outside every checkout and
   never holds secrets. Format (Clawake ADR-005):
   `{"version": 1, "cluster": "<cluster.name>", "values": {…}}`. Use the names from
   ClawOnshape ADR-2026-10-19:
   - `discord.guild`, `discord.lead_channel`, `discord.requester` (strings);
   - `discord.approvers` and `discord.dm_allow` (lists, normally just the operator);
   - `discord.application_id` (string);
   - `onshape.document`, `onshape.workspace`, `onshape.element` (strings).

   If `deploy/team.json` on the checked-out ref already references `${site:…}`, use the
   names it references; they win over this list. `discord.requester` must also appear in
   `discord.approvers`. Clawake cannot check that, so you check it.
2. **Generate the local inventory** `<inv>` from `deploy/team.json` with a small script in
   your scratch directory (not in the repo):
   - replace the original workspace prefix in every path with `<ws>`;
   - replace literal site IDs with the step 1 values, unless the file already uses
     `${site:…}` (1b). In that case set `site_values` to the 1b file;
   - keep agent IDs, roles, grants, mounts and ports unchanged.

   Plugin and image pins:
   - **2a (no `pins` command):** set the plugin `artifact_path` and `sha256` in `<inv>` to
     the Phase 2 results; keep the image pins.
   - **2b (`pins` available):** if `deploy/team.json` declares `runtime_pins`, create that
     overlay at `~/.config/clawake/clawonshape/pins.json` (mode `0600`), with the image
     pins from *Pinned versions* and the Phase 2 plugin results. Point `runtime_pins` in
     `<inv>` to it. Verify with `clawake pins show -c <inv>`: every pin is `[overlay]`.

   Afterwards, `grep -c` must find no path of the original machine, and `validate` must pass:
   `uv run --project <ws>/clawake clawake validate -c <inv>`.
   Show the operator only a diff summary (counts of replaced paths and IDs), not the IDs.
3. **Generate the internal secrets** (B7). They never leave the machine and nobody needs to
   see them. For each member env file `state/secrets/<role>.env` (`robotics-lead`,
   `mechanical-engineer`), mode `0600`, the names are `OPENCLAW_GATEWAY_TOKEN` (one value per
   member), `A2A_LEAD_TO_MECHANICAL` and `A2A_MECHANICAL_TO_LEAD`. The two A2A values must be
   identical in both files. Recipe (values are generated into shell variables and written
   straight to the files; never echo them):
   ```sh
   umask 077; d=<ws>/clawonshape/state/secrets; mkdir -p "$d/delegation"
   a=$(openssl rand -hex 32); b=$(openssl rand -hex 32)
   for r in robotics-lead mechanical-engineer; do
     printf 'OPENCLAW_GATEWAY_TOKEN=%s\nA2A_LEAD_TO_MECHANICAL=%s\nA2A_MECHANICAL_TO_LEAD=%s\n' \
       "$(openssl rand -hex 32)" "$a" "$b" > "$d/$r.env"
   done
   openssl rand -hex 32 > "$d/delegation/key"; unset a b
   ```
   Refuse to overwrite existing files. Check them with `test -s` and `cut -d= -f1`.
   **Unverified:** the delegation key format the plugin expects. Before running, read the key
   loader in `src/` at `6bbc5e5`, and adapt the recipe if it expects something else.
4. **MCP service** (B5): create `state/deployment/onshape-mcp/config.toml` (mode `0600`) from
   `deploy/onshape-mcp/config.example.toml` with the Onshape IDs from step 1. Create
   `state/deployment/onshape-mcp/service.json` with the keys `name`, `network`, `image`,
   `credential_directory`, `config_file`, `quadlet_root`, `client_container`; their meaning is
   in `clawake onshape-mcp --help` and `clawake/src/clawake/` at the pinned ref. Create the
   empty directories `state/secrets/onshape-mcp`, `state/secrets/oauth/connections` and
   `state/artifacts`, mode `0700`.

Acceptance: `validate` passes on `<inv>`; every mounted source path exists; every secret
file exists with mode `0600`; nothing secret was printed.

### Phase 4: start the team

Detect the path from Phase 1, step 3.

- **If `clawake rollout` exists:** `uv run --project <ws>/clawake clawake rollout -c <inv>`
  (preview). Summarise it for the operator. After their yes, run it with `--execute`.
- **Otherwise:**
  1. MCP service: `clawake onshape-mcp -c state/deployment/onshape-mcp/service.json`
     (preview, yes, `--execute`).
  2. `clawake setup -c <inv>` (preview, yes, `--execute`).
  3. `clawake sync-plugins -c <inv>` (preview, yes, `--execute`). If it fails with
     `ECONNREFUSED`, the gateway is still starting: wait until `curl -fsS
     http://127.0.0.1:<port>/readyz` returns 200, then run it again (known issue
     clawake#5, fixed by ADR-003 P2).
- Then run `clawake status -c <inv>`. Also run `curl -fsS http://127.0.0.1:19389/readyz` and
  `curl -fsS http://127.0.0.1:19489/readyz`. Both must return `{"ready":true}`.
- Check the plugin: `podman exec <member> openclaw plugins list --json`. `claw-onshape` must
  show `enabled` and `loaded`, with version `0.2.10`.
- Model provider login: if the agents have no model provider credentials yet, run
  `clawake onboard-member -c <inv> -m <member>` (preview, yes, `--execute`). It opens
  OpenClaw's onboarding TUI in the operator's terminal; the operator enters the provider
  credentials there, never in this chat. When the TUI offers channel setup, the operator
  skips it, because Discord follows in Phase 5. `onboard-member` does not pass
  `--skip-channels` itself. **Unverified:** whether the TUI keeps the
  Clawake-owned fields; the next `setup` preview must show no drift-guard stop (ADR-001).

Acceptance: three containers running, both gateways ready, plugin loaded in both members.

### Phase 5: Discord (the guided part)

Total: 9 steps. Present them as `Schritt N von 9`. The Lead is the only member with Discord;
the Engineer stays without Discord (`channels.discord.enabled: false`).

**D1 – Developer Mode.** Discord → **User Settings → Advanced → Developer Mode** on.
Why: only then can you copy IDs by right-clicking. (On mobile: **App Settings → Advanced**.)

**D2 – Server and channel.** Ask whether there is a server and a channel for the team
already. If not, explain how to create a private text channel, e.g. `#robotics-team`.
Then ask for the **Server ID** (right-click the server icon → **Copy Server ID**). Validate
it. Then ask for the **Channel ID** (right-click the channel → **Copy Channel ID**). Validate
it and check that it differs from the Server ID.

**D3 – Your user ID.** Right-click your own name → **Copy User ID**. Why: only this user
may give the team orders (allowlist and approver).

**D4 – Create the bot.** https://discord.com/developers/applications → **New
Application** → name e.g. `Robotics Lead` → **Create**. On **General Information**, copy
the **Application ID** and paste it here. Then in the sidebar choose **Bot**:
- set the **Username**;
- under **Privileged Gateway Intents**, switch on **Message Content Intent** and
  **Server Members Intent**, then **Save Changes**.

Why: without Message Content the bot receives the message but sees no text.

**D5 – Invite the bot.** Build the invite link yourself and give it to the operator:
`https://discord.com/oauth2/authorize?client_id=<APPLICATION_ID>&scope=bot+applications.commands&permissions=117824`.
`117824` = View Channels, Send Messages, Embed Links, Attach Files, Read Message History and
Add Reactions. The operator opens it, chooses the server and clicks **Authorize**. If the
team channel is private, they also add the bot to the channel: channel settings →
**Permissions** → **Add members or roles**.

Offer the alternative: **OAuth2 → URL Generator** in the portal with the same scopes and
permissions. If the operator wants threads, add **Send Messages in Threads**.

**D6 – Hand over the token (in the operator's terminal, not here).**
**Bot → Reset Token → Yes, do it! → Copy.** Then the operator runs this in their own
terminal (input is hidden; the token lands only in the Lead's env file):
```sh
f=<ws>/clawonshape/state/secrets/robotics-lead.env
grep -q '^DISCORD_BOT_TOKEN=' "$f" && echo "already set, nothing written" || {
  read -rsp 'Discord bot token (hidden): ' t; echo
  printf 'DISCORD_BOT_TOKEN=%s\n' "$t" >> "$f"; unset t; echo stored; }
```
Then check with `cut -d= -f1 <file>` that the name is present. If the token was pasted into
the chat by mistake: do not repeat it, ask the operator to reset it again and repeat D6.

**D7 – Configure the channel (preview first).** Two paths, chosen by the capability table
in *Pinned versions*. In both, the Engineer gets no Discord channel and no token.

Explain `requireMention` in either path: the bot answers only when you write
`@Robotics Lead …`. This is the safe default; the operator may switch it off later.

**D7b – Clawake renders the channel (P4 / ADR-005; preferred).**
1. Check that the site values file (Phase 3, 1b) contains the D2–D4 values; validate the IDs
   again.
2. Check that the Lead's `openclaw.discord` block in `<inv>` references them: `enabled:
   true`, `token_env: DISCORD_BOT_TOKEN`, `dm_policy: allowlist`, `group_policy: allowlist`,
   the guild/channel with `require_mention: true`, and `users` from `discord.approvers`.
   The Engineer has `enabled: false` or no block.
3. Run `clawake validate -c <inv>`. It must show `site values: … (N values, M references)`, and it must exit 0. On a fresh machine it must show no `pending adoption` line; such a line means an old hand-written block exists (see 4). Then run the `clawake setup -c <inv>` preview. It must list
   `channels/discord` for the Lead, with IDs shown as `<id>`.
4. On a fresh machine there is no hand-written block, so no adoption is needed. If the
   preview asks for `--adopt discord-channel`, an old block exists: stop and explain. On
   re-onboarding, `setup` refuses while that block holds a plaintext token. Moving the
   token is the operator's step; follow the instruction `setup` prints.
5. After the operator's yes, run `--execute`. Acceptance: `clawake status -c <inv>` with
   `readiness.channels` reports the Discord account `ready`.

**D7a – Interim without P4.** Write a JSON5 patch into
`state/deployment/discord.patch.json5`. It contains no secret, only the SecretRef to the env
var. Fill the shape from the docs (`/channels/discord/setup`, `/access-control`) with the
D2–D4 values:
- `channels.discord.enabled: true`;
- `token` as SecretRef `{source: "env", provider: "default", id: "DISCORD_BOT_TOKEN"}`;
- `applicationId`;
- `dmPolicy: "allowlist"` with `allowFrom: [<user>]`;
- `groupPolicy: "allowlist"`;
- `guilds.<guild>.users: [<user>]`;
- `guilds.<guild>.channels.<channel>: {enabled: true, requireMention: true}`.

Copy the patch into the container, then run
`podman exec clawcad-robotics-lead openclaw config patch --file <in-container path> --dry-run`
and show the summary. After the operator's yes, run it without `--dry-run`. Then restart only
the Lead through Clawake (`clawake restart -c <inv> -m clawcad-robotics-lead` or the
equivalent on the pinned ref; preview, yes, `--execute`). The env file is read only at
container start.

Before patching, check that the Clawake ownership ledger does not own `channels/discord`
(ADR-001). If it does, stop and report. D7a is a hand-written block. A later move to P4
needs the one-time `--adopt discord-channel`; record that in the evidence file.

**D8 – Is the bot online?** After `/readyz` is 200, run
`podman exec clawcad-robotics-lead openclaw channels status --json`. Show only the discord
account state: running or not, last error. The operator should also see the bot as online in
the member list. Ask them to write `@Robotics Lead hallo` in the team channel.

**D9 – Check the plugin binding.** The Lead and Engineer plugin bindings
(`requesterSenderId`, `discordChannelId`, `agentAccountId`) must match D2/D3 and the account
ID shown in D8. **Unverified:** whether `agentAccountId` is `default` for a single-bot setup;
read it from the D8 output, never guess it. Fix `<inv>`, then run `setup` again
(preview, yes, `--execute`).

#### Discord troubleshooting (give the first matching cause only)

| Symptom | Most likely cause | Fix |
|---|---|---|
| Bot offline in the member list | token missing or wrong, or Lead not restarted after D6 | D8 output `lastError`; repeat D6 (reset token), restart the Lead |
| Bot online, no reaction | message without `@mention` while `requireMention: true` | write `@Robotics Lead …` |
| Bot online, no reaction even with mention | **Message Content Intent** off, or user/channel not in the allowlist | portal D4; compare IDs from D2/D3 with the patch |
| `Missing Access` / `50001` in the logs | bot cannot see the private channel | D5: add the bot to the channel |
| Bot answers in DM with a pairing code | DM policy is still `pairing` | check D7 `dmPolicy`; or `openclaw pairing approve discord <CODE>` inside the Lead container |
| Answer arrives without an image | **Attach Files** permission missing | D5 link with `117824` or channel permission |
| Lead answers, but says it is not authorised for Onshape | binding mismatch | D9 |

Acceptance: the bot is online; one mention in the team channel gets a reply from the Lead; a
message from a user not in the allowlist gets no reply (operator may test with a second
account; otherwise record "not tested").

### Phase 6: connect Onshape (ClawOnshape-owned; operator does consent in the browser)

1. Onshape developer portal (https://dev-portal.onshape.com) → **OAuth applications** →
   create a confidential app. Redirect URI:
   `http://localhost:19489/plugins/claw-onshape/oauth/callback`. Permissions: read documents
   and write documents only (no delete, no share, no purchase, no profile). Copy the
   **client ID** into the conversation; it is not secret. The **client secret** goes in via
   the operator's terminal only:
   `node <ws>/clawonshape/scripts/provision-oauth-secret.mjs` (hidden input).
2. B6: check with `test -s` that the source path of the Engineer's `clientSecretFile` mount
   exists. If the script wrote somewhere else, stop. Report the mismatch to the operator and
   ask them to copy the file to the mount source (`install -m 600`) themselves; do not move
   secrets on your own initiative.
3. Re-run `setup` if `<inv>` changed (preview, yes, `--execute`).
4. The operator opens `http://localhost:19489` → Claw-Onshape page → **Connect** for
   `owner-rest` → completes the Onshape consent.
5. Verify: `podman exec clawcad-mechanical-engineer openclaw onshape status owner-rest`
   must show the connection active, with read scope. Show only status fields.

Acceptance: `owner-rest` active; `state/secrets/onshape-mcp/access-token.json` exists
(`test -s`, do not read it); `clawonshape-mcp` is healthy.

### Phase 7: end-to-end test in Discord

Ask the operator to write in the team channel:
`@Robotics Lead Bitte zeig mir ein Render des konfigurierten Part Studios.`
Expected: the Lead delegates to the Engineer and replies with a PNG and a short description.
While it runs, follow `clawake logs -c <inv>` (or `podman logs --since 5m <member>`) and
report progress in at most one line per stage: received, delegated, Engineer answered,
reply sent.

Second test (read-only): `@Robotics Lead Welche Features hat das Part Studio?`

Acceptance: both replies arrive in the team channel; no tool call outside the read path; no
error in the Lead or Engineer logs for these turns.

### Phase 8: finish

1. Run `clawake status -c <inv>` one last time.
2. Write the evidence file `docs/evidence/<YYYY-MM-DD>-fresh-machine-onboarding.md`
   (English). It contains:
   - the date;
   - the pins actually used;
   - local image digest and binary sha256;
   - plugin sha256;
   - the Clawake command path used (`rollout` or classic);
   - per phase: pass, fail or finding, with the time spent;
   - the Discord steps where the operator hesitated or asked back (UX feedback);
   - the findings with owner (Clawake / ClawOnshape / onshape-mcp / OpenClaw).

   It contains **no** IDs, tokens, host paths or user names; use `<ws>`, `<guild>`, `<user>`.
3. Leave the file uncommitted and tell the operator to hand it to onshape-architekt.

## Acceptance criteria and tests

- [ ] Phase 0–8 acceptance checks passed or recorded as accepted findings.
- [ ] Both gateways return `/readyz` 200; `claw-onshape` 0.2.10 loaded on both members.
- [ ] Discord: bot online, mention answered, non-allowlisted user ignored (or "not tested").
- [ ] Onshape `owner-rest` active; render and feature answers received in Discord.
- [ ] No secret, ID or host path in chat transcripts you produced, in the evidence file, or
      in any versioned file. `git status --short` shows only the new evidence file in
      `clawonshape` and nothing in `clawake` and `onshape-mcp`.
- [ ] Every `--execute` was preceded by a preview and an explicit operator yes.

## Branch and worktree rules

- Do not create branches, worktrees, commits or pushes. Checkouts stay on the pins from
  Phase 1.
- The only new tracked-path file is the evidence file. It remains uncommitted for review.
- Build outputs go to `clawonshape/state/build/` (git-ignored). Scratch scripts go to your
  own scratch directory.

## Expected report / handoff format

```markdown
status: done | blocked | partial
e2e-request: done (Phase 7) | not reached
pins: clawake <sha>, clawonshape <sha>, onshape-mcp <sha>, plugin <sha256>, mcp-image <digest>, openclaw <digest>
clawake-path: rollout | classic
phases: 0 ✔ 1 ✔ 2 ✔ 3 ✔ 4 ✔ 5 ✔ 6 ✔ 7 ✔ 8 ✔   (✘ with one-line cause)
discord-ux: <steps with hesitation or questions, one line each>
findings:
  - [owner] <finding> (blocker id if known)
evidence: docs/evidence/<file>.md
```
