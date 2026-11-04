# Evidence: Discord channel adoption on the live cluster (2026-10-20)

- **Scope:** Clawake ADR-005 / P4.
  - edge-robot/clawake#26: Clawake renders and owns `channels.discord`.
  - edge-robot/clawake#21 (M22): Discord user allowlist and approver set for the Lead channel.
- **Operator:** onshape-architekt (main session), with the user's approval.
- **Redactions:** Discord IDs appear as `<id>`; host paths as `~`; no secrets.

## Deployed combination

| Item | Value |
|---|---|
| Clawake operator checkout | `main` @ `85079c8` (detached; PR #33 + #35) |
| Inventory | `clawonshape/deploy/team.json`. Adds `site_values`, the Lead `openclaw.discord` block with `readiness.channels: true`, the Engineer block `{"enabled": false}`, and the bindings `${site:discord.requester}` and `${site:discord.lead_channel}` |
| Site values | `~/.config/clawake/clawonshape/site.json` (0600): 5 values (`discord.guild`, `discord.lead_channel`, `discord.requester`, `discord.approvers`, `discord.dm_allow`); `discord.application_id` deliberately omitted |
| Runtime pins | `~/.config/clawake/clawonshape/pins.json` (2 members, 12 fields), unchanged |
| Plugin / OpenClaw | claw-onshape 0.2.10 on both members; OpenClaw 2026.9.9 |

## Step 5: adoption

`setup --adopt discord-channel --execute`, run by the user from `~/.local/state/clawake/clawonshape/`. The auto-mode classifier blocked the architect from running it.

- The preview (12:0x UTC) was identical to the reviewed preview of 2026-10-19:
  - **Lead:** keys only added: `allowFrom`, `configWrites`, `dmPolicy`, the channel's `users` and `requireMention`.
  - **Engineer:** `groupPolicy` and `guilds` removed.
- Backups (new names and modes from clawake#29/#34):
  ```
  drwx------ .backups
  -rw------- clawcad-mechanical-engineer-20261020T121219.073277Z.tar.gz  (128.5 MB)
  -rw------- clawcad-robotics-lead-20261020T121151.605466Z.tar.gz        (136.0 MB)
  ```
  They are the rollback target and stay until the next accepted rollout.
- Result:
  ```
  member                       action   result  readiness  ready_s
  clawcad-robotics-lead        restart  ok      ready      79
  clawcad-mechanical-engineer  restart  ok      ready      86
  ```

## Step 6: status

```
- clawcad-robotics-lead [product_owner] state=healthy rc=0 readiness=ready
  plugin: claw-onshape pinned=0.2.10 installed=0.2.10 status=loaded enabled=yes
- clawcad-mechanical-engineer [developer] state=healthy rc=0 readiness=ready
  plugin: claw-onshape pinned=0.2.10 installed=0.2.10 status=loaded enabled=yes
```

Lead log: `[discord] [default] starting provider`, then `client initialized as <id>`, then `Discord bot probe resolved @clawcad`.

## Step 7: steady state

| Check | Result |
|---|---|
| `validate` | exit 0; `site values: … (5 values, 8 references)`; **no** `pending adoption` line; 0 artifact changes |
| `setup` preview | `0/2 member(s) changed` |
| `rollout` preview | 0 plugin pin changes. Lead plugin `install (ledger_missing)`: the known one-time plugin ledger backfill, not related to the adoption |
| Lead `openclaw.json` key paths (values not read) | `channels.discord`: `enabled`, `token{source,provider,id}` (env SecretRef), `groupPolicy=allowlist`, `dmPolicy=allowlist`, `allowFrom[1]`, `configWrites=false`, `guilds.<id>.requireMention`, `guilds.<id>.channels.<id>.{enabled,users[1]}` |
| Engineer `openclaw.json` | `channels.discord = {"enabled": false}` |
| Lead `openclaw.json` unchanged after the Discord tests | mtime 2026-10-20 14:12:40 +0200 (the adoption write) |

## Step 8: Discord tests

| Test | Result |
|---|---|
| 1. Approver mentions `@clawcad` in the Lead channel | **pass**: the user received a reply; the Lead log shows an agent turn with `sessionKey=agent:clawcad-robotics-lead:discord:channel:<id>` |
| 2. A non-allowlisted user gets no reply (#21 negative) | **open**: no second Discord account available on 2026-10-20 |
| 3. `/config set` is refused | **pass, stronger than expected**: `/config` is not offered at all. `commands.config` is unset; per OpenClaw docs (https://docs.openclaw.ai/tools/slash-commands) it defaults to `false`, and `/config` is owner-only. No command owner (`commands.ownerAllowFrom`) is configured. `channels.discord.configWrites=false` blocks channel-initiated config writes in addition |

## Findings

- **F1** (edge-robot/clawake#37): The OpenClaw doctor warns `openclaw.json contains plaintext secret-bearing config`. By key path this is `gateway.auth.token`, a 64-character literal; values were not read. It predates the adoption and is not part of `channels.discord`. Owner: Clawake (runtime config / gateway auth).
- **F2** (edge-robot/clawake#38): `clawake setup` writes `.backups/` relative to the current directory. Operators must choose the directory deliberately. Here it is `~/.local/state/clawake/clawonshape/`, outside any checkout. Candidate for a documented default or a `--backup-dir` option (Clawake).

## Open

- The #21 negative test (non-allowlisted account) is still to be done before closing #21.
- The ADR-005 open point (a pairing approval leaves `channels.discord` unchanged) is still unverified live. `dmPolicy` is now `allowlist`, so pairing is not in use.
