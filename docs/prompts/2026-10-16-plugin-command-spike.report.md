---
prompt: docs/prompts/2026-10-16-plugin-command-spike.md
branch: spike/plugin-command-approval
commits: ed15983..64d2daa (plus the report commit)
status: done
contract-version: 0.4.0-draft
e2e-request: required
---
# Report: Spike: plugin command for a one-step Discord approval

## Summary

`clawcad_spike` is implemented as a throwaway plugin command in `src/spike-command.ts` and wired from
`src/index.ts`.

- **Registration:** only when this gateway hosts the configured Lead agent. `requireAuth: true`,
  `acceptsArgs: true`.
- **Reply 1** (synchronous): the context field **names**, and values for only `senderId`, `channelId`,
  `accountId`, `agentId`, `senderIsOwner`, `assertOwnerCurrentIsFunction` and `surface`. `surface` is
  always `null`, because the SDK does not expose a native/text marker. The arguments are echoed sanitized
  and bounded to 200 characters.
- **Reply 2** (asynchronous, after 120 s): posted once through the typed runtime API
  `api.runtime.channel.outbound.loadAdapter(channelId)` → `adapter.sendText({cfg, to, text, accountId,
  threadId})`. Every missing piece and every send failure fails closed: a logged `not_sent` with a
  reason, never a retry.
- **Logging:** one bounded diagnostic line per invocation and one per follow-up attempt.
- **Version:** `0.2.11-spike.1` in `package.json`, `package-lock.json` and `openclaw.plugin.json`.

There are no approval semantics and no mutation, delegation, MCP, REST, credential or token access.
Existing tools, the contract, fixtures, `deploy/`, the dashboard and skills are unchanged.

**Main finding for the architect:**
- The command handler context has **no** async delivery capability. Tools get
  `OpenClawPluginToolDelivery.send`; commands get nothing comparable.
- Check 3 therefore depends on `api.runtime.channel.outbound` working for this non-bundled plugin and on
  `ctx.to` being a valid Discord target. Neither can be proven offline.
- The bundled OpenClaw docs named in the prompt are not in the container: `node_modules/openclaw` holds
  only the `.d.ts` files. Everything below comes from the typings.

## SDK findings (openclaw 2026.9.9 typings)

All paths are relative to `node_modules/openclaw/dist/`. `openclaw/plugin-sdk/core` re-exports these types
publicly (`plugin-sdk/core.d.ts`).

| Item | Location | Finding |
|---|---|---|
| `OpenClawPluginApi.registerCommand` | `agent-harness-runtime-R8dTs5zl.d.ts:23626` | `(command: OpenClawPluginCommandDefinition) => void`; no return value, no error contract |
| `OpenClawPluginCommandDefinition` | `agent-harness-runtime-R8dTs5zl.d.ts:22267–22319` | `name`, `nativeNames?`, `nativeProgressMessages?`, `description`, `descriptionLocalizations?`, `channels?`, `agentPromptGuidance?`, `acceptsArgs?`, `clientPresentation?`, `requireAuth?` (default **true**), `requiredScopes?`, `exposeSenderIsOwner?` ("whether a **trusted bundled** handler needs owner status"), `ownership?`, `handler` |
| **Handler context `PluginCommandContext`** | `agent-harness-runtime-R8dTs5zl.d.ts:22178–22250` | see the list below the table |
| `PluginCommandResult` | `agent-harness-runtime-R8dTs5zl.d.ts:22251–22256` | `ReplyPayload & {continueAgent?, suppressReply?}` |
| Tool delivery (for comparison) | `agent-harness-runtime-R8dTs5zl.d.ts:23209–23215` | `OpenClawPluginToolDelivery.send({text?, mediaUrl?})`, for tools only |
| `api.runtime.channel.outbound.loadAdapter` | `agent-harness-runtime-R8dTs5zl.d.ts:32165–32166`, `:32038` | `(id: ChannelId) => Promise<ChannelOutboundAdapter \| undefined>`; not deprecated |
| `ChannelOutboundAdapter.sendText` | `outbound.types-DjHzlueC.d.ts:303`; params `channel-core-5mS6rc1E.d.ts:9203–9231` | `sendText(ctx)`, where `ctx` has `cfg`, `to`, `text`, `accountId?`, `threadId?`, `replyToId?`, `silent?`, `signal?` and internal fields |
| `scheduleSessionTurn` | `agent-harness-runtime-R8dTs5zl.d.ts:23462`, `:23729` | schedules an **agent turn** (LLM) through Cron. "Bundled plugins only; workspace plugins receive undefined." Not used. |
| `api.config.agents` | `types.openclaw-B-tbtohD.d.ts:8071–8077` | `entries?: Record<agentId, …>`, `list?: AgentConfig[]` |
| Manifest activation | `config-contracts-LN7GOWFb.d.ts:10973–10997` | `activation.onCommands?` is load-planning metadata only. The plugin already has `onStartup: true`. |
| Manifest `commandAliases` | `config-contracts-LN7GOWFb.d.ts:11254–11258` | only for config diagnostics before runtime load |

`PluginCommandContext` fields:

| Group | Fields |
|---|---|
| Sender | `senderId?`, `isAuthorizedSender`, `senderIsOwner?`, `assertOwnerCurrent?` |
| Channel and conversation | `channel` (surface string), `channelId?`, `from?`, `to?`, `accountId?`, `messageThreadId?`, `threadParentId?` |
| Session | `agentId?`, `sessionKey?`, `sessionId?`, `sessionTarget?`, `sessionFile?` (deprecated) |
| Command | `args?`, `commandBody` |
| Host | `config`, `gatewayClientScopes?` |
| Diagnostics | `diagnosticsSessions?`, `diagnosticsUploadApproved?`, `diagnosticsPreviewOnly?`, `diagnosticsPrivateRouted?` |
| Runtime and binding | `runtimeContext?`, `requestConversationBinding`, `detachConversationBinding`, `getCurrentConversationBinding` |

The context has no native/text surface field and no `delivery`/`send`.

**Do commands need a manifest entry?** Not according to the typings. The manifest has no command contract
equivalent to `contracts.tools`, and `commandAliases` and `activation.onCommands` are optional metadata, so
none was added. Whether the Discord native slash-command sync picks up plugin commands registered in
`register()` is a live question (check 1).

## Spike checks

| # | Check | In code | What the architect must observe live |
|---|---|---|---|
| 1 | Visible and invocable in Discord #clawcad for the Lead, as a native slash command or a text command | **Implemented.** `registerCommand({name: 'clawcad_spike', requireAuth: true, acceptsArgs: true, …})`. No `nativeNames`, no `channels` restriction. Registered only on the Lead gateway. | (a) Is `/clawcad_spike` offered in the Discord slash menu? Record native vs text. (b) Does the text form `/clawcad_spike hello` in a message work? (c) A non-admitted user (outside the M22 `users` allowlist) gets no reply 1. (d) The command does **not** exist on the Engineer gateway or bot. |
| 2 | Context has a populated, provider-stable `senderId` plus channel and account identity, without the LLM | **Implemented.** Reply 1 contains the sorted list of all context field names and the allowed values. The same data goes into the log line `claw_onshape.spike_command_invoked`. The handler is synchronous and makes no LLM call. | (a) `values.senderId` equals the Discord user id `1382988369553915990`, and is the same across two invocations and across slash vs text. (b) `channelId`, `accountId` and `agentId` (expected `clawcad-robotics-lead`) are populated. (c) `senderIsOwner` and `assertOwnerCurrentIsFunction` (expected `null`/`false` unless the host grants owner status to non-bundled plugins). (d) Whether `fields` contains `to`, `from`, `sessionKey`, `messageThreadId`; check 3 depends on `to`. (e) No agent turn is started: no Lead LLM reply and no tool calls in the session log. |
| 3 | Return at once and post a second message to the same conversation ≥ 120 s later | **Implemented on an API whose runtime availability is unproven.** `setTimeout(120 s, unref)`, then `loadAdapter(channelId ?? channel)` → `sendText({cfg: ctx.config, to: ctx.to, text: 'clawcad_spike follow-up <id>', accountId, threadId: messageThreadId})`. Never retried. | (a) After 120 s, `clawcad_spike follow-up <invocationId>` appears in the same #clawcad conversation, or thread if invoked in one. (b) The log line `claw_onshape.spike_follow_up` has `outcome: sent`, or `not_sent` with one of `outbound_adapter_unavailable`, `send_text_unavailable`, `conversation_target_unavailable`, `send_failed`. (c) Exactly one follow-up per invocation. (d) A gateway restart within the 120 s loses the follow-up, because the in-memory timer is not durable. |

If check 3 shows `not_sent`, commands have no usable follow-up path for this plugin. P3 then needs the ADR
fallback design (a Lead tool with `toolContext.delivery?.send`, or a different async channel).

### Lead-only registration (deviation from the prompt's hint)

The prompt suggests "`engineerAgentId` config present" as the Lead check. That cannot distinguish the
gateways: in `deploy/team.json` both the robotics-lead and the mechanical-engineer gateways carry the same
plugin config, including `engineerAgentId` and `delegation`. At registration time the plugin has no agent
context. It only distinguishes the Lead per invocation, through `leadBinding`, by
`ctx.agentId === delegation.leadAgentId`.

The command is therefore registered only if `delegation.leadAgentId` is configured **and** this gateway's
host config lists that agent in `api.config.agents.entries` or `api.config.agents.list`. See `hostsLeadAgent`
at `src/spike-command.ts:16`.

**Live check:** the Engineer gateway's `agents` must not contain `clawcad-robotics-lead`. If it does, the
command would appear there too. Check 1(d) covers this.

## Changed files

`git diff --stat 6bbc5e5..HEAD`, without the report commit:

| File | Lines | Purpose |
|---|---|---|
| `src/spike-command.ts` | +147 | new spike module: Lead gate, observation and redaction, echo sanitizer, follow-up, registration |
| `src/index.ts` | +3 | import, and `registerSpikeCommand(api, config)` after `registerCli` |
| `tests/spike-command.test.mjs` | +288 | registration, redaction, value typing, argument bound, follow-up scheduling and fail-closed reasons |
| `package.json`, `package-lock.json`, `openclaw.plugin.json` | 1–2 lines each | version `0.2.11-spike.1`. The manifest was at `0.2.8` before, not at `0.2.10`; see Out-of-scope findings. |

## Checks

| Command | Result |
|---|---|
| `npm ci` | **fail**, same as the baseline: `EUSAGE`, because the lockfile lacks the `openclaw` peer. `node_modules/openclaw` was backed up first and is still present. |
| `npm run typecheck` | pass |
| `npm test` | pass: 121 tests, 121 pass, 0 fail. The baseline at `6bbc5e5` had 115; this adds 6. |
| `npm run test:native-files` | **fail**, same as the baseline: `native_private_file_sdk_unavailable` (no native SDK in the container) |
| `npm run check` (`biome ci .`) | pass: 50 files, no errors, no warnings |
| `npm pack --pack-destination <scratchpad>` | pass. `edge-robot-claw-onshape-0.2.11-spike.1.tgz`, 113 files, sha256 `39486f1172869ea0ed2d98a6ef287544426f3901fa255ff46e5523fa873933a6`. No `state/`, `.env` or `*.tgz`. |

**Packaging notes:**
- The tarball was built only in the session scratchpad, not in the repo or `state/packages`. It is not a
  release artifact and was not handed over. Build the deployable spike package yourself.
- The sha256 is **not reproducible from the commits alone**. The tarball includes untracked or modified
  foreign files under `docs/`: `docs/product/*` and `docs/evidence/2026-10-16-mutation-path-acceptance.md`.
  A build from a clean checkout of `64d2daa` will differ.

### Red → green

| Test (`tests/spike-command.test.mjs`) | Red at `ed15983` | Green at |
|---|---|---|
| clawcad_spike is registered only on the gateway that hosts the Lead agent | `actual: 0, expected: 1` (no command registered) | `64d2daa` |
| reply 1 and the log line carry only field names and the allowed values | `TypeError: Cannot read properties of undefined (reading 'handler')` | `64d2daa` |
| missing or non-string context values are reported as null, never echoed raw | same TypeError | `64d2daa` |
| arguments are echoed bounded to 200 characters and cannot break the reply | same TypeError | `64d2daa` |
| reply 2 is posted once to the same conversation 120 s later (fake timers, `t.mock.timers`) | same TypeError | `64d2daa` |
| reply 2 fails closed with a logged reason when no adapter, target or send is available | same TypeError | `64d2daa` |

## Acceptance criteria

- **Tests: met.**
  - Lead-only registration; Engineer, no agents and no delegation all yield no command.
  - Redaction of reply 1 and the log line, against a context carrying nine secret-looking values in
    `config`, `sessionKey`, `sessionId`, `commandBody`, `from`, `to`, `gatewayClientScopes`,
    `diagnosticsSessions` and an extra `token` field.
  - The argument bound.
  - Reply 2 scheduling: not before 119 999 ms, once at 120 000 ms, never again. Plus its four fail-closed
    reasons.
- **All existing tests stay green and `npm run check` is clean: met.**
- **The report lists, per spike check, what the code does and what to observe live: met.** See *Spike checks*.
- **No new `any`, casts or `biome-ignore`: met.**
  - None added.
  - The Biome rule `noControlCharactersInRegex` was satisfied by `/[\p{Cc}`]/gu`, not by a suppression.
  - There is one new empty `catch` in `log()`, with a comment: diagnostics are best effort, and logger
    failure must not change the reply.
  - There is one `catch` in `followUp()` that maps any send error to `send_failed`. This keeps provider
    error text out of the log; it is not a security check.

**New OpenClaw APIs used:**

| API | Location |
|---|---|
| `api.registerCommand` with `OpenClawPluginCommandDefinition` | `agent-harness-runtime-R8dTs5zl.d.ts:23626`, `:22267` |
| `PluginCommandContext` and `PluginCommandResult`, imported from `openclaw/plugin-sdk/core` | `agent-harness-runtime-R8dTs5zl.d.ts:22178`, `:22251` |
| `api.runtime.channel.outbound.loadAdapter` | `agent-harness-runtime-R8dTs5zl.d.ts:32166` |
| `ChannelOutboundAdapter.sendText` | `outbound.types-DjHzlueC.d.ts:303` |
| `api.config.agents` (read only) | `types.openclaw-B-tbtohD.d.ts:8071` |

None of these is marked deprecated.

## Contract deviations and change requests

None. The spike touches no contract element.

## Live E2E request

**Preconditions:**
- Deploy a package built from `spike/plugin-command-approval` at `64d2daa` or later, version
  `0.2.11-spike.1`, to the **robotics-lead** gateway only, with the plugin config unchanged.
- The Discord `users` allowlist for the Lead channel is set (M22). Otherwise `requireAuth` rejects the owner.
- Optional, for the negative check: deploy the same package to the Engineer gateway as well, or confirm
  that its `agents` do not list the Lead.

**Steps:**
1. In #clawcad, type `/`. Is `clawcad_spike` offered? Run it once as a slash command with argument `hello`.
2. Send `/clawcad_spike hello` as plain text, if the text-command path is enabled.
3. Run it as a user who is not allowlisted. **Expected:** no reply 1.
4. Wait at least 120 s after each successful invocation. **Expected:** one `clawcad_spike follow-up <id>`
   message in the same conversation.
5. Collect the gateway log lines `claw_onshape.spike_command_invoked` and `claw_onshape.spike_follow_up`.

**Expected result:**
- Reply 1 shows a JSON block with `invocationId`, `fields`, `values` and `args`.
  - `values.senderId` is the stable Discord user id.
  - `values.agentId` is `clawcad-robotics-lead`.
  - `surface` is `null`.
- No LLM turn is started.
- The follow-up logs `outcome: sent`. If it logs `not_sent` with a reason, check 3 needs the fallback design.

## Open points and risks

- **senderIsOwner.** `exposeSenderIsOwner` is documented for trusted bundled handlers only, so it was
  **not** set. The typings do not say whether setting it on an external plugin is ignored, recorded as a
  registration diagnostic, or would drop the command. Expect `senderIsOwner: null` and
  `assertOwnerCurrentIsFunction: false` unless the host populates them anyway. If P3 needs owner status, a
  spike.2 with the flag is the next step.
- **Follow-up target.** It uses `ctx.to`, the raw "To" value. Whether that is in the form the Discord
  adapter's `sendText` accepts (for example `channel:<id>`), and whether it is set for native interactions,
  is unknown. Its value is deliberately not shown in reply 1, by the prompt's redaction rule; only its
  presence in `fields` is.
- **Durability.** The follow-up timer is in memory and `unref()`ed. A restart within 120 s silently loses
  it, apart from the absent log line. P3 must not build approval on this without a durable queue.
- **Unbounded timers.** Each admitted invocation schedules one timer. This is acceptable for a spike behind
  `requireAuth`; P3 needs a bound.
- **Registration errors are invisible.** `registerCommand` returns `void`. If the host rejects the command,
  for example over the name or a native-command sync limit, the plugin cannot see it. Check 1 answers this.
- **Branch status.** The branch is not for merge, as the prompt states. The spike module and version must
  not reach `main`.

## Out-of-scope findings

- `openclaw.plugin.json:4` was at `0.2.8` while `package.json` was at `0.2.10` (commit `6bbc5e5` bumped only
  `package.json`). The manifest version lagged for at least two releases. It is set to `0.2.11-spike.1` here,
  but the release branch still has the drift.
- `package.json` `files` includes all of `docs/`. `npm pack` picks up untracked foreign files, as in the
  previous reports.
- `package-lock.json` lacks the `openclaw` peer, so `npm ci` fails with `EUSAGE`. This is unchanged.
