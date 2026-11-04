# Evidence: runtime pins migration and Discord token SecretRef (2026-10-19)

Operator: onshape-architekt (main session), user-approved per step. No secrets, IDs or token
values appear in this file.

## 1. Clawake operator checkout

- `<workspace>/clawake`: `demo/gateway-native-read-20261014` @ `4da3957` → `feat/20-runtime-pins`
  @ `7e6e006`. Fast-forward; contains the demo line, P1 (#23), P2 (#5) and P3a (#20).
- Read-only proof before any change:
  - `validate`: ok;
  - `setup` preview: `0/2 member(s) changed`, both `none (unchanged, unit_active)`.

## 2. `deploy/team.json` → runtime pin overlay (Clawake ADR-004)

- `clawake pins init … --output ~/.config/clawake/clawonshape/pins.json` (preview, then
  `--execute`). The overlay was written with mode 0600 and 12 fields: 4 image fields and 2
  plugin fields per member.
- `deploy/team.json`:
  - added `"runtime_pins": "${HOME}/.config/clawake/clawonshape/pins.json"`;
  - removed the 12 listed fields;
  - JSON formatting is preserved (round-trip identical before the edit).
- Equivalence proof (read-only):
  - `validate` reports `runtime pins: … (2 members, 12 fields)`;
  - `pins show` shows all 12 fields as `[overlay]`;
  - `setup` preview: `0/2 member(s) changed`;
  - `sync-plugins` preview is identical to the pre-split preview. The Lead shows
    `install (ledger_missing)`, Engineer `skip`. The Lead entry is an expected one-time
    ledger bootstrap; it was not executed.

## 3. Discord bot token → SecretRef (prerequisite for Clawake ADR-005 adoption)

- `clawake stop` (preview, then `--execute`) for both members. `clawonshape-mcp` stayed up.
- The operator ran `state/deployment/discord-token-to-secretref.py --apply` in their own
  terminal. Backup: `state/backups/discord-secretref-20261019T135709Z/`; it contains the old
  token and stays private.
- Result, checked by key paths only:
  - Lead `channels.discord.token` = `{source: env, provider: default, id: DISCORD_BOT_TOKEN}`;
    `DISCORD_BOT_TOKEN` is present in the Lead env file (name only checked).
  - Engineer `channels.discord.token` is absent (Discord disabled there).
- `clawake restart` (preview, then `--execute`). Both `/readyz` returned `{"ready":true}` after
  about 75 s.
- `clawake status`:

  | Member | readiness | plugin `claw-onshape` |
  |---|---|---|
  | Lead | `ready` | pinned 0.2.10, installed 0.2.10, `loaded`, enabled |
  | Engineer | `ready` | pinned 0.2.10, installed 0.2.10, `loaded`, enabled |

- `openclaw channels status --json` (Lead, no `--probe`), Discord default account:
  `configured`, `running`, `connected`, `lifecycle=ready`, `lastError=null`.
- After the start, the token is still the SecretRef; OpenClaw did not rewrite it.

## Findings

- Lead log at startup: `channels.discord.dmPolicy="pairing"` without an allowlist warning. DM
  access is still the OpenClaw default. To be set by Clawake ADR-005 P4
  (`dm_policy`/`allow_from`, edge-robot/clawake#26, folds in #21).
- Lead log: `Message Content Intent is limited` (informational; the bot is in fewer than 100
  servers).
- Discord round trip after the restart: the user mentioned the bot in the team channel and the
  Lead answered (user confirmation, 2026-10-19).
