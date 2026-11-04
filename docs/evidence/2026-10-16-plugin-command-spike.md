# Live evidence: plugin command spike (2026-10-16)

Issue: edge-robot/clawonshape#13 · Prompt: `docs/prompts/2026-10-16-plugin-command-spike.md` ·
ADR: `docs/ADR.md#adr-2026-10-16-proof-based-mutation-release-prepared-for-verifiable-presentations`

## Deployment

| Item | Value |
|---|---|
| Lead gateway | spike.1 15:25 → spike.2 16:05 CEST (backup `state/backups/plugin-spike2-20261016T160143`; setup restarted both members again, sync-plugins succeeded first time after waiting for `[gateway] ready`). Initially `claw-onshape` 0.2.11-spike.1 @ `64d2daa` (branch `spike/plugin-command-approval`), package built from `git archive 64d2daa`, `sha256:a9f88b19fdec73b51459758edde176e0f70886c851616572f9cc608e8f967859` |
| Engineer gateway | `claw-onshape` 0.2.10 (unchanged, accepted row of §9) |
| OpenClaw | 2026.9.9 |
| Backup | `state/backups/plugin-spike-20261016T151451` (inventory + both `openclaw.json`) |
| Clawake | `validate` → `setup` preview (1/2 member changed: Lead plugin mount) → `--execute` → `sync-plugins` preview → `--execute` (1st run failed on the Lead, see C1) → 2nd `--execute` ok; Lead ready 15:25:12 CEST |

## Spike checks

| # | Check | Result |
|---|---|---|
| 1 | Command visible and invocable in Discord #clawcad | **pass (native slash command)**: `/clawcad_spike` appears in the @clawcad slash menu only after a Discord client reload (cached command list). Reply is ephemeral (`slashCommand.ephemeral` default) and was split into three messages (`maxLinesPerMessage` 17). Not tested: text form, non-allowlisted user, absence on the Engineer bot. |
| 2 | Populated, provider-stable `senderId` plus channel/account identity, no LLM | **pass**: invocation `68d65cce-3ae4-42d2-b528-bf45c89da177` 15:30:23 CEST. `senderId` `<approver-discord-id>` (= binding `requesterSenderId`), `channelId` `1553026145803436056` (#clawcad, the Discord channel id, not the provider id), `accountId` `default`, `agentId` `clawcad-robotics-lead`. `senderIsOwner` `null`, `assertOwnerCurrent` absent. Context fields: `accountId, agentId, args, channel, channelId, commandBody, config, detachConversationBinding, diagnosticsSessions, from, gatewayClientScopes, getCurrentConversationBinding, isAuthorizedSender, messageThreadId, requestConversationBinding, runtimeContext, senderId, sessionFile, sessionId, sessionKey, sessionTarget, threadParentId, to`. No agent turn in the Lead log after the invocation. Stability across invocations not yet tested. |
| 3 | Asynchronous second message ≥ 120 s later | **fail (spike code defect, API unproven)**: 15:32:23 `claw_onshape.spike_follow_up` `not_sent` / `outbound_adapter_unavailable`. The spike called `loadAdapter(ctx.channelId ?? ctx.channel)`; `channelId` is the Discord channel id, so no adapter matched. Next: spike.2 with the provider id. |
| 3b | spike.2 (0.2.11-spike.2 @ `795cf78`, `sha256:99429bc0…5762`, Lead only, deployed 16:05 CEST): asynchronous second message via provider id | **fail on target, API reachable**: invocation `db2224b6-5bc5-4aa9-b545-e787aa44a317` 16:17 CEST (native slash). `channel` `discord`; `toShape` `{prefix: slash, segments: 2, endsWithSenderId: true}` (the interaction user, not the channel); `fromShape` `{prefix: discord, segments: 3, endsWithChannelId: true}`. 16:19:27 `spike_follow_up` `not_sent` / `send_failed`: `loadAdapter('discord')` returned an adapter with `sendText`, which rejected `ctx.to`. Operator confirmed: nothing visible, neither in #clawcad nor as DM. `senderId` identical to the first invocation (check 2 stable). Conclusion: for native slash invocations `ctx.to` is not a channel send target; the conversation target is carried in `ctx.from`. Open: text-command invocation, and sending to the host-provided `ctx.from`. |
| 3c | spike.3 (0.2.11-spike.3 @ `ceaa42c`, `sha256:90a5a265…4d0baf`, Lead only, deployed 16:44 CEST): follow-up to the host-provided conversation target `ctx.from`, fallback `ctx.to` | **pass**: invocation `5fde0dba-c6b1-4f52-b7c5-e39f317b41ad` 16:47:33 CEST (native slash). 16:49:35 `spike_follow_up` `outcome: sent`, `source: from`, attempts `[{from: sent}]` (no fallback needed). Operator confirmed `clawcad_spike follow-up 5fde0dba-…` visible in #clawcad at 16:49 (public, not ephemeral). |
| — | Text command `@clawcad /clawcad_spike hello` (16:29 CEST) | **not a command path**: guild messages are mention-gated; with the mention the text is not parsed as a plugin command and goes to the LLM (Lead answered as if a skill named "spike" was invoked). Only the native slash command reaches the handler. |

## Conclusion

All three ADR spike checks pass with the **native slash command**: the command is visible (after a client reload), the handler receives a stable `senderId` plus channel/account/agent identity without an LLM turn, and an asynchronous public result can be posted later through `api.runtime.channel.outbound.loadAdapter(ctx.channel)` → `sendText` with `to: ctx.from` (the host-provided conversation target). `ctx.to` (`slash:<user>`) is not a valid send target. The in-memory timer is not durable (lost on gateway restart) — P3 must persist pending results. The ADR fallback (Lead tool) is not needed.

## Findings

| ID | Severity | Finding | Owner | Tracking |
|---|---|---|---|---|
| S1 | low | Plugin slash commands appear in Discord only after a client reload; operators must be told (runbook) when a new command ships. | ClawOnshape docs | #11 P3 |
| S2 | medium | Reply 1 is ephemeral and split by `maxLinesPerMessage`. An approval reply must be short (≤ 17 lines) and the requester-visible result must be posted non-ephemerally (check 3). | ClawOnshape | #11 P3 |
| S3 | medium | Text commands do not reach plugin commands in mention-gated guild channels; the approval UX must use the native slash command, and the Lead prompt should not treat `/<name>` text as a skill call. | ClawOnshape | #11 P3 |
| S4 | medium | The follow-up uses an in-memory timer; a gateway restart (e.g. every Clawake rollout) silently drops pending results. P3 needs a durable pending-result record and replay on start. | ClawOnshape | #11 P3 |
| C1 | medium | `clawake setup --execute` restarted the unchanged Engineer member although the plan listed 1/2 members changed. `sync-plugins --execute` ran right after the restart, hit `ECONNREFUSED` on the Lead gateway, continued with the Engineer (reinstall + restart) and needed a second run. No readiness wait, no abort on failure. | Clawake | [edge-robot/clawake#5 comment](https://github.com/edge-robot/clawake/issues/5#issuecomment-6216673558) |
