---
prompt: docs/prompts/2026-10-16-plugin-command-spike-3.md
branch: spike/plugin-command-approval
commits: 53dbf8c..ceaa42c (plus the report commit)
status: done
contract-version: 0.4.0-draft
e2e-request: required
---
# Report: Spike 3: send the follow-up to the host-provided conversation target

## Summary

The follow-up (reply 2) now tries the host-provided conversation targets in a fixed order. Each target is
passed to `sendText` exactly as the host provided it. The code never builds, rewrites or strips a target.

| Order | Source | Used when | Otherwise |
|---|---|---|---|
| 1 | `ctx.from` | it is a bounded string (at most 128 characters), the provider is `discord`, its shape prefix is `discord`, and it ends with `ctx.channelId` | skipped with `not_qualified` |
| 2 | `ctx.to` | it is a bounded string, as in spike 2 | skipped with `conversation_target_unavailable` |

The follow-up stops at the first successful send. Each source is tried at most once. `from` followed by `to`
is a fallback, not a retry. A second timer or a repeat never happens; the test covers ten more timer periods.

The log line `claw_onshape.spike_follow_up` now has these fields:
- `outcome`: `sent` or `not_sent`.
- `source`: `from` or `to` when sent, otherwise `null`.
- `reason`: present only for `not_sent`.
- `attempts`: one entry per source, in order:
  - `{source, outcome: "sent"}`
  - `{source, outcome: "send_failed", errorClass}`
  - `{source, outcome: "skipped", reason}`

`errorClass` is the thrown value's `name` only if it matches `^[A-Za-z]{1,40}$`. In every other case it is
`null`, including non-objects, non-string names, empty or long names, names with digits, spaces or dashes,
and a throwing `name` getter. The log never contains the error message, the stack or a raw `to`/`from`
value; the tests check this for every scenario.

Top-level `reason` values: the spike-2 reasons are unchanged (`provider_unavailable`, `adapter_lookup_failed`,
`outbound_adapter_unavailable`, `send_text_unavailable`). In addition:
- `conversation_target_unavailable`: neither source was usable, so nothing was sent.
- `send_failed`: every usable source was tried once and failed.

Reply 1 is unchanged from spike 2. The version is `0.2.11-spike.3` in `package.json`, `package-lock.json`
(lines 3 and 9) and `openclaw.plugin.json`.

### Example log lines (format, not live)

The `from` value assumed here is `discord:channel:<channelId>`. The live run has shown only its shape: prefix
`discord`, 3 segments, ends with the channel id.

```text
{"event":"claw_onshape.spike_follow_up",…,"outcome":"sent","source":"from","attempts":[{"source":"from","outcome":"sent"}]}
{"event":"claw_onshape.spike_follow_up",…,"outcome":"sent","source":"to","attempts":[{"source":"from","outcome":"send_failed","errorClass":"DiscordAPIError"},{"source":"to","outcome":"sent"}]}
{"event":"claw_onshape.spike_follow_up",…,"outcome":"not_sent","source":null,"reason":"send_failed","attempts":[{"source":"from","outcome":"send_failed","errorClass":"Error"},{"source":"to","outcome":"send_failed","errorClass":"Error"}]}
```

## Live log result → meaning for P3 of #11

| Live log result | Meaning | Consequence for P3 |
|---|---|---|
| `sent`, `source: from`, visible in #clawcad (or in the thread) | The plugin command can post asynchronously and publicly into the invoking conversation, using only `ctx.from` as the host provided it. | The command path is viable. P3 can implement the approval as a native slash command with an asynchronous public result. The ADR fallback is not needed. |
| `sent`, `source: from`, but not visible, or visible only as a DM | `sendText` accepted `ctx.from`, but the target does not mean "this channel". | Treat it like `from` failed. The command path cannot reliably reach the channel; use the fallback. |
| `from` `send_failed` (class X), then `to` `sent` | `ctx.from` is not a send target. `ctx.to` (the `slash:` interaction user) worked this time, unlike spike 2. | Check where the message landed. A DM is not a public channel result, so the command path covers only the private reply. Record class X for P3. The fallback stays likely. |
| `not_sent`, `send_failed`, both with an error class | Neither host-provided value is a send target for the Discord adapter, and the plugin may not build its own. | The command path cannot deliver the asynchronous public result. P3 uses the ADR fallback: a Lead tool with `toolContext.delivery.send`. Record both classes as evidence. |
| `from` `skipped/not_qualified` | The live `from` no longer has the spike-2 shape (`discord` prefix, ends with the channel id). | Compare `fromShape` in reply 1 with evidence row 3b. P3 must not depend on a host field that is not stable. |
| `provider_unavailable`, `adapter_lookup_failed`, `outbound_adapter_unavailable` or `send_text_unavailable` | A regression against spike 2, where the adapter with `sendText` was reachable. | Investigate the deployment before deciding P3. |
| No `spike_follow_up` line after 120 s | The in-memory timer did not fire, for example after a gateway restart. | The command path needs durable scheduling or a synchronous design. This is a P3 risk in any case. |

## Changed files

`git diff --stat 54451c2..ceaa42c`, plus this report and the prompt in the report commit:

| File | Lines | Purpose |
|---|---|---|
| `src/spike-command.ts` | +77/−26 | ordered host-target selection (`qualifyingFrom`), per-attempt log, `errorClass` bound |
| `tests/spike-command.test.mjs` | +166/−1 | 5 new tests, 2 extended tests, `runFollowUp` helper |
| `package.json`, `package-lock.json`, `openclaw.plugin.json` | +4/−4 | version `0.2.11-spike.3` |
| `docs/prompts/2026-10-16-plugin-command-spike-3.md` | new | the prompt, committed as the prompt requires |
| `docs/prompts/2026-10-16-plugin-command-spike-3.report.md` | new | this report |

## Red → green

| Test | Red at `53dbf8c` (code of `54451c2`) | Green at `ceaa42c` |
|---|---|---|
| reply 2 looks up the adapter by provider id … (extended: `source`, `attempts`) | fail: `source` undefined | pass |
| reply 2 fails closed … (extended: `source: null`, last attempt with `errorClass`) | fail: `source` undefined | pass |
| reply 2 prefers a qualifying ctx.from and stops after it is sent | fail: `sendText` got `ctx.to` | pass |
| reply 2 falls back to ctx.to once when ctx.from fails, never retrying a source | fail: one call instead of two | pass |
| reply 2 logs both failures with bounded error classes only | fail: 1 call !== 2 | pass |
| error class is null unless it is a short alphabetic name | fail: `attempts` undefined | pass |
| ctx.from qualifies only with the discord prefix and the channel id at its end | fail: `source` undefined | pass |

In the first test commit, the helper `runFollowUp` enabled the mock timers on every call. That made two of
the new tests fail for a harness reason as well (`MockTimers is already enabled`). The fix commit corrects
the helper: it now enables the timers once per test context. I re-ran the corrected tests against the
`54451c2` source. All 7 fail on assertions, not on the harness: 5 pass, 7 fail.

Every `sendText` call in the new tests is checked with `params.to === ctx.from || params.to === ctx.to`
(strict identity). This proves that no target string is constructed.

## Checks

| Command | Result |
|---|---|
| `npm ci` | fail, baseline: `EUSAGE Missing: openclaw@2026.9.9 from lock file` (the peer is not in the lockfile; the architect's decision, unchanged) |
| `npm run typecheck` | pass |
| `npm test` | pass, 127/127 (122 + 5 new) |
| `npm run test:native-files` | fail, baseline: `native_private_file_sdk_unavailable` in the container |
| `npm run check` (`biome ci .`) | pass, 50 files, no findings |
| `npm pack` from `git archive ceaa42c`, built in the scratchpad | `edge-robot-claw-onshape-0.2.11-spike.3.tgz`, 112 files, **sha256 `90a5a265d2ce45ca56ade39f5e756a89d06968682fc43e9c680abfe54f4d0baf`**. No `state/`, `*.tgz` or `.env` in the package. |

The pack has 112 files instead of the 110 from spike 2. The extra two are the spike-2 prompt and report
under `docs/prompts/`, which were committed after `795cf78` and are part of `docs/`. The package is only in
the scratchpad, not in the repo and not under `state/`.

## Acceptance criteria

| Criterion | Status | Evidence |
|---|---|---|
| All tests green, `npm run check` clean | met | 127/127; `biome ci .` clean |
| Report maps each live log result to its meaning for P3 | met | the table *Live log result → meaning for P3 of #11* |
| `from` preferred if it qualifies, `to` as fallback, stop at the first success | met | tests *prefers a qualifying ctx.from …*, *falls back to ctx.to once …*, *qualifies only with …* |
| Log names the used source and every tried source with its outcome | met | `source` and `attempts`; asserted in all follow-up tests |
| `send_failed` logs only a bounded class name | met | test *error class is null unless …* (10 cases); no message, stack or `TOKEN-DO-NOT-LOG` in the log |
| No target string constructed; no retry of a source | met | identity check on every `sendText` call; each source at most once; no further calls after 10 more periods |
| Version `0.2.11-spike.3` | met | `package.json:3`, `package-lock.json:3,9`, `openclaw.plugin.json:4` |
| Reply 1 unchanged | met | the reply tests from spike 2 are unchanged and green |

## SDK usage

No new API. As in spike 2, the follow-up uses `api.runtime.channel.outbound.loadAdapter`
(`PluginRuntimeChannel`, `agent-harness-runtime-R8dTs5zl.d.ts:32166`) and `ChannelOutboundAdapter.sendText`
(`outbound.types-DjHzlueC.d.ts:303`). `sendText` is now called as `sendText.call(adapter, …)`, so a method
that relies on `this` keeps working after the function is read into a local.

## Contract deviations and change requests

None. The spike does not touch any contract channel.

## Live E2E request

- **Precondition:** deploy `claw-onshape` `0.2.11-spike.3` from `git archive ceaa42c` with sha256 `90a5a265…4d0baf`
  on the **Lead gateway only**. The Engineer gateway stays on 0.2.10.
- **Steps:**
  1. Run the native slash command `/clawcad_spike hello` in #clawcad. The text form does not reach the
     handler (evidence row 3b). Note `fromShape` and `toShape` from reply 1.
  2. Wait at least 120 s. Record the `claw_onshape.spike_follow_up` line (`outcome`, `source`, `reason`,
     `attempts`) and where `clawcad_spike follow-up <invocationId>` appears: in #clawcad publicly, in a
     thread, as a DM, or nowhere.
  3. Optional: repeat in a thread (`threadPresent: true`).
- **Expected:** one of the rows in the table *Live log result → meaning for P3 of #11*. The hoped-for result
  is `sent` with `source: from` and the message publicly visible in #clawcad.

## Open points and risks

- **The `from` value is not known.** The test fixture assumes `discord:channel:<channelId>`; only the shape is
  known live. The qualification rule only checks the prefix and the suffix, so other middle segments also
  qualify.
- **`threadId` is sent unchanged with both sources**, as in spike 2. With `from` naming the parent channel, a
  thread invocation may post in the thread or in the parent channel; step 3 shows which.
- **A send to `to` can land in a DM.** If `from` fails, the fallback to `to` (the interaction user) may
  succeed as a DM. That is a host-provided target, not a constructed one, but it is not the public result
  P3 needs.
- **The timer is in memory** (unchanged). A gateway restart within 120 s loses the follow-up.
- **`senderIsOwner` is `null`** live (unchanged, see spike 1).

## Out-of-scope findings

None new. The `npm ci` lockfile gap and the native-files failure remain the known baselines.
