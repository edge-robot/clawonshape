---
target-repo: edge-robot/clawonshape
branch: spike/plugin-command-approval
worktree: /home/kaos/Projects/01_pib/02_sw/clawonshape   # devcontainer: /workspaces/clawonshape
issue: edge-robot/clawonshape#13
architecture-ref: clawonshape/docs/ADR.md#adr-2026-10-16-proof-based-mutation-release-prepared-for-verifiable-presentations
contract-version: 0.4.0-draft   # unchanged
foreign-repo-commit: c53d9c9dcda97da195a52ad223c431ae41100f98   # onshape-mcp, unchanged
base-commit: 54451c2
follows: docs/prompts/2026-10-16-plugin-command-spike-2.md (report accepted)
status: issued
---
# Spike 3: send the follow-up to the host-provided conversation target

## Goal

Check 3 is half answered. The Discord outbound adapter is reachable from the plugin command, but it
rejects the native slash target. Find out whether the conversation target in `ctx.from` works as a
send target. This is the last code spike before P3 of #11 decides between the command path and the
ADR fallback, a Lead tool with `toolContext.delivery.send`.

## Context

Live evidence is in `docs/evidence/2026-10-16-plugin-command-spike.md`, rows 3 and 3b.

- **Native slash invocation (16:17 CEST):** `channel` = `discord`. `toShape` = `{prefix: "slash",
  segments: 2, endsWithSenderId: true}`, which is the interaction user. `fromShape` = `{prefix:
  "discord", segments: 3, endsWithChannelId: true}`.
  - `loadAdapter('discord')` returned an adapter that has `sendText`.
  - `sendText({to: ctx.to, …})` threw: `send_failed`. Nothing was visible in the channel or as a DM.
- **Text command `@clawcad /clawcad_spike hello`:** not recognized as a plugin command. The message went
  to the LLM as normal text, and the Lead answered. So the text path is not usable. Only the native
  slash command reaches the handler.

## Binding constraints and prohibitions

- All constraints of the spike and spike-2 prompts still apply.
- `followUp()` sends to the **host-provided** values only, in this order, and stops at the first one
  that resolves:
  1. `ctx.from`, if its shape has prefix `discord` and ends with `ctx.channelId`;
  2. `ctx.to`, exactly as in spike 2.

  Never build or rewrite a target string, and never strip prefixes.
- The log line `claw_onshape.spike_follow_up` must name which source was used: `from` or `to`.
  - For `send_failed`, log only the error **class name** (`error.name`), bounded to 40 characters
    and matching `^[A-Za-z]+$`, otherwise `null`. Do not log the message or the stack.
  - It must name each source that was tried, together with its outcome.
- Never retry the same source. Trying `from` and then `to` once each is allowed and is not a retry.
- Version `0.2.11-spike.3` in `package.json`, `package-lock.json` and `openclaw.plugin.json`.
- Reply 1 stays as in spike 2.

## Steps

1. Red: tests for:
   - target selection: `from` preferred when it qualifies, `to` as the fallback;
   - per-source outcomes in the log;
   - the error-class bound;
   - that no target string is ever constructed. Assert that `sendText` receives exactly
     `ctx.from` or `ctx.to`.
2. Green.
3. Run `npm test`, `npm run typecheck` and `npm run check`. Build `npm pack` from
   `git archive <commit>` in your scratchpad, and report the sha256.

## Acceptance criteria and tests

- All tests are green and `npm run check` is clean.
- The report maps each possible live log result to its meaning for P3: `from` sent / `from` failed + `to`
  sent / both failed with error class.

## Branch and worktree rules

- Only `spike/plugin-command-approval` in `/workspaces/clawonshape`, on top of `54451c2`.
  No other branches, worktrees, switching or pushes. Leave foreign and architect files untouched.
- Commits with `Refs: edge-robot/clawonshape#13`,
  `Prompt: docs/prompts/2026-10-16-plugin-command-spike-3.md`, `Agent: ts-plugin-dev`,
  `Co-Authored-By: …`:
  1. `test: 🧪 spike follow-up target selection from the host conversation`
  2. `fix: 🧪 spike follow-up prefers the host-provided conversation target`
  3. `docs: 📖 report for plugin-command-spike-3 prompt` (report + this prompt file)

## Expected report / handoff format

`docs/prompts/2026-10-16-plugin-command-spike-3.report.md`, in the same structure as before, with a
red→green table, the package sha256 from `git archive` and `e2e-request: required`.
