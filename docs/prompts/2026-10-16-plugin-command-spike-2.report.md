---
prompt: docs/prompts/2026-10-16-plugin-command-spike-2.md
branch: spike/plugin-command-approval
commits: f0b0ad2..795cf78 (plus the report commit)
status: done
contract-version: 0.4.0-draft
e2e-request: required
---
# Report: Spike 2: fix the follow-up adapter lookup and expose the target shapes

## Summary

The live defect from spike 1 is fixed. The follow-up now looks up the outbound adapter by the **provider id**
`ctx.channel`, accepted only if it matches `^[a-z0-9_-]{1,32}$`. It no longer uses `ctx.channelId`, which is
the Discord channel id. There are two new fail-closed reasons:
- `provider_unavailable`: `ctx.channel` is absent or invalid.
- `adapter_lookup_failed`: `loadAdapter` throws.

The four existing reasons are unchanged. The follow-up still sends only to `ctx.to`, never builds a target
itself and never retries.

Reply 1 and the log line contain these new values, and nothing else new:

| Value | Content |
|---|---|
| `channel` | the provider id, or `null` |
| `toShape`, `fromShape` | `{prefix, segments, endsWithChannelId, endsWithSenderId}`, or `null` if the value is absent or not a string. The raw `to`/`from` values never appear. |
| `threadPresent` | whether `messageThreadId` is a non-empty string |

Reply 1 is now compact (finding S2). It has six lines:
- the header;
- a fenced block with one single-line JSON of `invocationId` and `values`;
- the field list on one line, bounded to 700 characters;
- the echo;
- the closing fence.

It stays within 17 lines and 2000 characters even with 80 long context keys and a 500-character argument.

The version is `0.2.11-spike.2` in `package.json`, `package-lock.json` and `openclaw.plugin.json`. Nothing
outside the spike module, its tests and the version fields was changed. The foreign files, including
`docs/evidence/2026-10-16-plugin-command-spike.md`, are untouched.

### Example reply 1

Rendered from `dist/` with the live values from the evidence. The `to`/`from` values are **guessed**
(`slash:<user>`, `discord:<user>`) to show the format; the live run supplies the real shapes.

````
clawcad_spike dfe3c989-493f-44ca-bb22-b99226661ec2
```text
{"invocationId":"dfe3c989-…","values":{"senderId":"1382988369553915990","channelId":"1553026145803436056","channel":"discord","accountId":"default","agentId":"clawcad-robotics-lead","senderIsOwner":null,"assertOwnerCurrentIsFunction":false,"surface":null,"toShape":{"prefix":"slash","segments":2,"endsWithChannelId":false,"endsWithSenderId":true},"fromShape":{"prefix":"discord","segments":2,"endsWithChannelId":false,"endsWithSenderId":true},"threadPresent":false}}
fields: accountId,agentId,args,channel,channelId,commandBody,config,detachConversationBinding,diagnosticsSessions,from,gatewayClientScopes,getCurrentConversationBinding,isAuthorizedSender,messageThreadId,requestConversationBinding,runtimeContext,senderId,sessionFile,sessionId,sessionKey,sessionTarget,threadParentId,to
args: hello
```
````

That is 6 lines and 887 characters.

## SDK findings

These are unchanged from the first spike report. Relevant here:

| API | Location (`node_modules/openclaw/dist/`) |
|---|---|
| `PluginRuntimeChannel.outbound.loadAdapter(id: ChannelId)` | `agent-harness-runtime-R8dTs5zl.d.ts:32166`, `:32038` |
| `ChannelId` | `channel-id.types-CjcGKHk0.d.ts:11`: `ChatChannelId \| (string & {})`, the channel **plugin** id such as `discord` |
| `ChannelOutboundAdapter.sendText(ctx)` | `outbound.types-DjHzlueC.d.ts:303`; params `channel-core-5mS6rc1E.d.ts:9203` |

No new API is used.

## Spike check 3: expected live observations

Each follow-up attempt writes exactly one `claw_onshape.spike_follow_up` line with `invocationId` and
`outcome`, plus `reason` when the outcome is `not_sent`. Read each outcome together with the `toShape` of the
same invocation from reply 1 or the `spike_command_invoked` line.

| Log | Meaning | Consequence for P3 |
|---|---|---|
| `outcome: sent` | The Discord adapter was found and `sendText` resolved for `ctx.to`. Then check **where** `clawcad_spike follow-up <id>` appeared: (a) in #clawcad, visible to everyone → the API works; (b) as a DM to the requester; (c) not visible at all, which would mean the adapter accepted but delivered nowhere. | (a) passes check 3. With (b), `ctx.to` is the requester rather than the conversation; compare `toShape`. If P3 needs a channel post, it must use a host-provided channel target, not one it builds itself. (c) is a host or adapter finding. |
| `not_sent` / `provider_unavailable` | `ctx.channel` is absent or not a provider id. Reply 1 then shows `channel: null`. | Unexpected: spike 1 showed `channel` present. The provider must come from elsewhere, for example the binding's `messageChannel`. |
| `not_sent` / `adapter_lookup_failed` | `loadAdapter('discord')` threw. Not available for this plugin, or a runtime error. | The runtime outbound API is unusable from a non-bundled plugin command. Use the fallback design. |
| `not_sent` / `outbound_adapter_unavailable` | `loadAdapter('discord')` returned `undefined`. No outbound adapter is registered under the provider id, or it is hidden from this plugin. | Same as above. Spike 1 hit this reason only because of the channel-id defect. |
| `not_sent` / `send_text_unavailable` | The adapter exists but has no `sendText`. | Text sends need another adapter method, such as `sendPayload`. Out of scope for this spike. |
| `not_sent` / `conversation_target_unavailable` | `ctx.to` is absent, empty or longer than 128 characters. `toShape` is `null`. | Commands give no target. Use the fallback design. |
| `not_sent` / `send_failed` | `sendText` threw. The adapter **rejected the target** or the send. The error text is deliberately not logged. | This is the answer the prompt asks for: `ctx.to` in its observed shape (`toShape`) is not a valid send target. P3 needs a host-provided target. |
| no `spike_follow_up` line at all | No attempt: gateway restart within 120 s, or the timer never fired. | Durability finding. An approval path must not depend on an in-memory timer. |

**Other observations for the same run:**
- `toShape` for slash vs. text invocation. Is the prefix `channel`, `slash`, `discord` or something else?
  Does it end with the channel id or the sender id?
- `threadPresent`, when invoked inside a thread.
- `channel` should be `discord`.

## Changed files

`git diff --stat e5f8784..795cf78`:

| File | Lines | Purpose |
|---|---|---|
| `src/spike-command.ts` | +80/−10 approx. | `providerId`, `targetShape`, new `Observation` values, adapter lookup by provider id with `provider_unavailable`/`adapter_lookup_failed`, `compactReply` |
| `tests/spike-command.test.mjs` | rewritten, 7 tests | live-shaped context (`channelId` = Discord channel id, `channel` = `discord`, `to`/`from` with prefixes), shape redaction, compact reply bound, provider lookup, all six fail-closed reasons |
| `package.json`, `package-lock.json`, `openclaw.plugin.json` | 1–2 lines each | `0.2.11-spike.2` |

## Checks

| Command | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm test` | pass: 122 tests, 122 pass, 0 fail. The base at `e5f8784` had 121; the spike file now has 7 tests instead of 6. |
| `npm run check` (`biome ci .`) | pass: 50 files, no errors, no warnings |
| `npm ci` | not rerun. In this container it fails as in every baseline: `EUSAGE`, because the lockfile lacks the `openclaw` peer. |
| `npm run test:native-files` | not rerun. It is unchanged and unavailable in the container (`native_private_file_sdk_unavailable`). |
| `npm pack --pack-destination <scratchpad>`, worktree | `edge-robot-claw-onshape-0.2.11-spike.2.tgz`, 116 files, sha256 `49cc3983e8e32826f121d97dca0e6f2ffaf029c65579d8086094ca5ec56311a1`. This includes untracked foreign files under `docs/`, so it is not reproducible. |
| `npm pack` from `git archive 795cf78`, scratchpad | `edge-robot-claw-onshape-0.2.11-spike.2.tgz`, 110 files, sha256 `99429bc0bf277d3207d47a4ee209fc99af00de54ec0b189e4e43b7add8b05762`. Contains `dist/spike-command.js` with the new reasons, and no `state/`, `.env` or `*.tgz`. This matches how the spike 1 package was built (from `git archive`), so it should be reproducible. |

Both tarballs exist only in the session scratchpad. No package was written to the repo or `state/`.

### Red → green

| Test (`tests/spike-command.test.mjs`) | Red at `f0b0ad2` | Green at |
|---|---|---|
| clawcad_spike is registered only on the gateway that hosts the Lead agent | green, unchanged regression guard | n/a |
| reply 1 is compact and with the log line carries only field names, allowed values and shapes | `reply 1 has 41 lines` | `795cf78` |
| target shapes never carry raw values and mask unexpected prefixes | `reply 1 has 41 lines` | `795cf78` |
| missing or non-string context values are reported as null, never echoed raw | `reply 1 has 25 lines` | `795cf78` |
| arguments and the field list are bounded and cannot break the reply | `reply 1 has 41 lines` | `795cf78` |
| reply 2 looks up the adapter by provider id and is posted once 120 s later | `reply 1 has 41 lines`. The reply parse runs first; the lookup assertion `adapters == ['discord']` follows it. | `795cf78` |
| reply 2 fails closed with one logged reason per missing piece or failure | `actual: [['sent', undefined]]`, `expected: [['not_sent', 'provider_unavailable']]` (the old lookup used `channelId` and sent) | `795cf78` |

## Acceptance criteria

- **All new and existing tests are green, and `npm run check` is clean: met.** See *Checks*.
- **The report states the expected live observations for check 3, each log reason mapped to its meaning:
  met.** See the table above.
- **The prompt constraints are met.**
  - The only new values are `channel`, `toShape`, `fromShape` and `threadPresent`.
  - Raw `to`/`from` never appear in the reply or the log. This is tested with the values themselves and with
    secret markers inside them.
  - Reply 1 has at most 17 lines.
  - The lookup uses `ctx.channel`.
  - `provider_unavailable` and `adapter_lookup_failed` are added; the other four reasons are kept.
  - The follow-up sends only to `ctx.to` and never retries.
- **No new `any`, casts or `biome-ignore`.**
  - There is one new `catch` around `loadAdapter`, mapping to `adapter_lookup_failed` with a comment. The
    lookup error text is not logged.
  - The type of `adapter` is derived from the API type with `Awaited<ReturnType<…loadAdapter>>`. This is not
    a cast.

## Contract deviations and change requests

None. The spike touches no contract element.

## Live E2E request

**Preconditions:**
- Deploy `0.2.11-spike.2` from `795cf78`, preferably from `git archive` (sha256 above), to the
  **robotics-lead** gateway only.
- The plugin config is unchanged, and M22 (the `users` allowlist) is as in spike 1.
- A Discord client reload may be needed (S1). The command name is unchanged, so the cached entry may
  already work.

**Steps:**
1. In #clawcad run `/clawcad_spike hello` as a native slash command.
   - Note `toShape`, `fromShape`, `channel` and `threadPresent` from reply 1.
   - Expected: reply 1 arrives as **one** ephemeral message.
2. Optionally run it again inside a thread, and once in the text form if text commands are enabled.
3. Wait at least 120 s and record:
   - the `claw_onshape.spike_follow_up` log line (outcome and reason);
   - whether, and where, `clawcad_spike follow-up <invocationId>` appeared: channel (non-ephemeral), DM or
     nowhere.
4. Interpret the result with the check 3 table above.

**Expected result:** the outcome is `sent` with a visible follow-up in #clawcad, or one `not_sent` reason that
decides between the runtime outbound path and the ADR fallback for P3.

## Open points and risks

- **Unknown target shape for slash commands.** If `ctx.to` addresses the interaction or the user (for
  example a `slash:` prefix that ends with the sender id), `sent` may produce a DM instead of a channel
  post. The prompt forbids building the target, so this run can only observe it.
- **`threadId`.** It is passed as `ctx.messageThreadId ?? null`. `threadPresent` reports only non-empty
  strings; a numeric thread id would be passed on but reported as `false`.
- **Durability and unbounded timers.** Both are unchanged from spike 1 and are acceptable for the spike only.
- **Field-list truncation.** The field list is cut at 700 characters with `,…`. The live context
  (23 fields, about 330 characters) is far below that.

## Out-of-scope findings

None new. The spike 1 findings remain:
- the manifest version drift on the release line;
- `npm pack` includes untracked `docs/` files;
- `npm ci` fails with `EUSAGE`.
