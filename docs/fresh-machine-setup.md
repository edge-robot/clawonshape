# Fresh-machine setup

Bring up the robotics team on a new Linux machine from the three GitHub repositories:

- `clawonshape-mcp`: the Onshape MCP server;
- `clawcad-robotics-lead`: answers in Discord;
- `clawcad-mechanical-engineer`: works in Onshape.

All three run as rootless Podman Quadlets under systemd `--user`.

The guided long form with Discord troubleshooting is
[prompts/2026-10-19-team-onboarding.md](prompts/2026-10-19-team-onboarding.md). It can be run by the
operator agent `.claude/agents/team-onboarding-agent.md`. Its version pins are outdated; **the pins
below win.**

Conventions:

- `<ws>` is the workspace directory holding the three checkouts side by side.
- `<inv>` is `<ws>/clawonshape/deploy/team.json`.
- `clawake` stands for `uv run --project <ws>/clawake clawake`.
- Run every `--execute` command from `~/.local/state/clawake/clawonshape/` (`install -d -m 0700`
  it first). Clawake writes its backups into `.backups/` of the current directory
  (edge-robot/clawake#38).
- Always run the preview (without `--execute`) first and read it.

## Pins

Use the newest row of the compatibility matrix
([interface/onshape-mcp.md §9](interface/onshape-mcp.md#9-versioning-and-compatibility)) that is
marked accepted or candidate. As of 2026-11-04:

| Item | Pin |
|---|---|
| OpenClaw image | `ghcr.io/openclaw/openclaw:2026.10.10` @ `sha256:1e5ee6c7d02d5b5f64f9cf26a30c7ef7d4ec292f0d25fa590f4b7e103e8bf799` |
| ClawOnshape plugin | `0.3.0-rc.4` @ `826617e` (`main` after edge-robot/clawonshape#27) |
| onshape-mcp | commit `cc67472e3dd05d178bce4736c5f158abe6e4df3e`, image built by `deploy/onshape-mcp/build.sh` |
| Clawake | `main` after edge-robot/clawake#41; until it is merged, branch `closure/39-40-goal-journal-healthcmd` |

Rebuilt images and tarballs get new digests on a new machine. Record your own values in
`pins.json` and `service.json`; never deploy an unpinned artifact.

## 0. Preflight

- systemd user session with lingering: `loginctl enable-linger "$USER"`.
- Rootless Podman: `podman info --format '{{.Host.Security.Rootless}}'` returns `true`.
- Tools: `git`, `uv`, Node ≥ 24.16 with npm, `openssl`, `curl`.
- At least 15 GB free for the images and the Rust build.
- Free ports `19389` (Lead) and `19489` (Engineer dashboard).
- No existing `clawcad-*` or `clawonshape-mcp` containers.

Accounts you need:

- a Discord server and a bot application
  ([OpenClaw Discord setup](https://docs.openclaw.ai/channels/discord/setup));
- an Onshape account with an OAuth application (confidential client). Its callback is
  `http://localhost:19489/plugins/claw-onshape/oauth/callback`;
- a model provider account for the agents. The deployed team uses OpenAI/Codex.

## 1. Checkouts

```sh
mkdir -p <ws> && cd <ws>
git clone https://github.com/edge-robot/clawonshape.git
git clone https://github.com/edge-robot/onshape-mcp.git
git clone https://github.com/edge-robot/clawake.git
git -C clawake switch closure/39-40-goal-journal-healthcmd   # until clawake#41 is merged
uv sync --project clawake
```

## 2. Artifacts

```sh
# MCP image (Rust build in Podman, 10–20 min). The script prints the binary sha256 and the image id.
CLAW_ONSHAPE_BUILD_DIR=<ws>/clawonshape/state/build/onshape-mcp \
  bash <ws>/clawonshape/deploy/onshape-mcp/build.sh
podman image inspect --format '{{.Digest}}' localhost/clawonshape-mcp:cc67472-goal-grant-curl

# Plugin, packed from a clean export of the checked-out commit
c=$(git -C <ws>/clawonshape rev-parse --short HEAD); b=<ws>/clawonshape/state/build/plugin-$c
mkdir -p "$b" <ws>/clawonshape/state/packages
git -C <ws>/clawonshape archive HEAD | tar -x -C "$b"
npm ci --ignore-scripts --prefix "$b" && npm test --prefix "$b"
(cd "$b" && npm pack --pack-destination <ws>/clawonshape/state/packages)
sha256sum <ws>/clawonshape/state/packages/edge-robot-claw-onshape-*.tgz

# OpenClaw
podman pull ghcr.io/openclaw/openclaw:2026.10.10@sha256:1e5ee6c7d02d5b5f64f9cf26a30c7ef7d4ec292f0d25fa590f4b7e103e8bf799
```

## 3. Local configuration

No file in this step is versioned. Create directories with `install -d -m 0700` and files with
mode `0600`.

**Site values** live in `~/.config/clawake/clawonshape/site.json`. They hold Discord IDs; turn on
Discord Developer Mode to copy them:

```json
{"version": 1, "cluster": "clawonshape", "values": {
  "discord.guild": "<server id>",
  "discord.lead_channel": "<team channel id>",
  "discord.requester": "<your user id>",
  "discord.approvers": ["<your user id>"],
  "discord.dm_allow": ["<your user id>"]}}
```

**Runtime pins** live in `~/.config/clawake/clawonshape/pins.json`. Use the same structure for both
members `clawcad-robotics-lead` and `clawcad-mechanical-engineer`:

```json
{"version": 1, "cluster": "clawonshape", "members": {
  "clawcad-robotics-lead": {
    "image": {"tag": "2026.10.10", "digest": "sha256:1e5ee6c7…f799",
              "known_good_tag": "2026.10.10", "known_good_digest": "sha256:1e5ee6c7…f799"},
    "plugins": {"claw-onshape": {
      "artifact_path": "<ws>/clawonshape/state/packages/edge-robot-claw-onshape-0.3.0-rc.4.tgz",
      "sha256": "sha256:<sha256sum of the tgz>"}}},
  "clawcad-mechanical-engineer": { … same … }}}
```

Check it with `clawake pins show -c <inv>`: every pin is `[overlay]`.

**Secrets** go under `<ws>/clawonshape/state/secrets/`, which is git-ignored. Generate the values
straight into the files and never echo them:

```sh
umask 077; d=<ws>/clawonshape/state/secrets
mkdir -p "$d/delegation" "$d/oauth/connections" "$d/onshape-mcp/mutation-approvals"
a=$(openssl rand -hex 32); b=$(openssl rand -hex 32)
for r in robotics-lead mechanical-engineer; do
  printf 'OPENCLAW_GATEWAY_TOKEN=%s\nA2A_LEAD_TO_MECHANICAL=%s\nA2A_MECHANICAL_TO_LEAD=%s\n' \
    "$(openssl rand -hex 32)" "$a" "$b" > "$d/$r.env"
done
openssl rand -hex 32 > "$d/delegation/key"; unset a b
read -rsp 'Discord bot token: ' t && printf 'DISCORD_BOT_TOKEN=%s\n' "$t" >> "$d/robotics-lead.env"; unset t
```

For the **Onshape OAuth client secret**, run `node <ws>/clawonshape/scripts/provision-oauth-secret.mjs`.
It prompts for the secret without echo and writes `state/deployment/oauth/client-secret`. Then move
that file to the path the inventory mounts:
`mv state/deployment/oauth/client-secret state/secrets/oauth/client-secret`.

**Onshape target.** `deploy/team.json` binds the agents to the Camera Mount Plate document of the
original installation. Its bindings use the literal `documentId`, `primaryWorkspaceId`,
`workspaceId` and `elementId`. With another Onshape account, replace them in your local copy.
They are not yet site values (ADR-2026-10-19).

**MCP service.** Copy `deploy/onshape-mcp/config.example.toml` to
`state/deployment/onshape-mcp/config.toml` and `deploy/onshape-mcp/service.example.json` to
`state/deployment/onshape-mcp/service.json`, then fill in the placeholders:

- the image digest from step 2;
- absolute paths, without `~`;
- the Onshape IDs, which must match the bindings.

Finally run `clawake validate -c <inv>`. It must report 2 members, 12 pin fields and 5 site values.

## 4. Start the team

```sh
clawake onshape-mcp -c <ws>/clawonshape/state/deployment/onshape-mcp/service.json            # preview
clawake onshape-mcp -c <ws>/clawonshape/state/deployment/onshape-mcp/service.json --execute
clawake setup -c <inv>          # preview, then --execute
clawake sync-plugins -c <inv>   # preview, then --execute
clawake status -c <inv>         # both members readiness=ready, claw-onshape loaded
```

**Model login.** Run `clawake onboard-member -c <inv> -m <member>` with `--execute`, once per
member. The OpenClaw onboarding TUI opens; skip its channel setup there. Then set the model
explicitly in each member. The model is runtime state and not part of the inventory:

```sh
podman exec <member> openclaw models set openai/gpt-5.6-terra
```

## 5. Discord and Onshape

- Invite the bot to the server with access to the team channel. Then check
  `podman logs clawcad-robotics-lead | grep discord`: it must show `Discord bot check resolved`.
- Open `http://localhost:19489` and go to **Claw-Onshape → Verbindung & technische Details →
  Onshape verbinden**. Complete the consent.
  `podman exec clawcad-mechanical-engineer openclaw onshape status owner-rest` must then report
  `"connected": true`.

## 6. End-to-end check

In the team channel, write `@clawcad Welche Bohrungen hat die Camera Mount Plate? Bitte mit Bild.`

Expected result: the Lead posts a PNG and a summary of the four holes. The path is Discord → Lead →
signed A2A → Engineer → Onshape → reply. It costs about 10–20 Onshape API calls. The Onshape plan
allows 2,500 calls per year, so count them.

## Known gaps

- Onshape document IDs are literal in `deploy/team.json` (see step 3).
- The agent model is not in the inventory (step 4).
- OAuth refresh can fail and then requires a reconnect (edge-robot/clawonshape#24).
- On OpenClaw 2026.10.10, a delegated inspection can exceed the Lead's 90 s tool timeout.
  The Engineer finishes, but the Lead reports a timeout. See edge-robot/clawonshape#28.
