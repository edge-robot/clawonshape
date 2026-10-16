---
target-repo: edge-robot/clawonshape
branch: spike/plugin-command-approval
worktree: /home/kaos/Projects/01_pib/02_sw/clawonshape   # devcontainer: /workspaces/clawonshape
issue: edge-robot/clawonshape#13
architecture-ref: clawonshape/docs/ADR.md#adr-2026-10-16-proof-based-mutation-release-prepared-for-verifiable-presentations
contract-version: 0.4.0-draft   # unchanged
foreign-repo-commit: c53d9c9dcda97da195a52ad223c431ae41100f98   # onshape-mcp, unchanged
base-commit: e5f8784
follows: docs/prompts/2026-10-16-plugin-command-spike.md (report accepted)
status: issued
---
# Spike 2: fix the follow-up adapter lookup and expose the target shapes

## Goal

The first spike passed checks 1 and 2 live. Check 3 failed in the spike code itself, not in the
API, so it is still open. Fix the adapter lookup and make the conversation target shapes
observable, so that the next live run answers check 3.

## Context

- Live evidence: `docs/evidence/2026-10-16-plugin-command-spike.md`. Summary:
  - `ctx.channelId` is the **Discord channel id** (`1553026145803436056`), not the provider id.
  - `followUp()` called `api.runtime.channel.outbound.loadAdapter(ctx.channelId ?? ctx.channel)`.
    It got no adapter and logged `not_sent` / `outbound_adapter_unavailable`.
  - Fields present include `channel`, `to`, `from`, `messageThreadId`, `threadParentId`,
    `sessionTarget`. Their values are not known yet.
- Your report `docs/prompts/2026-10-16-plugin-command-spike.report.md` has the typings
  references, the open points on the `ctx.to` format and the durability notes.
- Code: `src/spike-command.ts` `followUp()` and `observe()`, plus `tests/spike-command.test.mjs`.

## Binding constraints and prohibitions

- All constraints of the first spike prompt still apply: spike only, Lead only, no approval
  semantics, no mutation, delegation, MCP, REST, credentials or tokens, no change outside the
  spike module, its tests and the version fields.
- New observable values in reply 1 and in the log line. These are the only additions allowed:
  - `channel`: only if it matches `^[a-z0-9_-]{1,32}$`, otherwise `null`. This is the provider
    id, for example `discord`.
  - `toShape` and `fromShape`: for each of `ctx.to` and `ctx.from`, this object:
    - `prefix`: the text before the first `:`, only if it matches `^[a-z_]{1,16}$`, otherwise
      `null`;
    - `segments`: the number of `:`-separated parts;
    - `endsWithChannelId`: boolean, whether the value ends with `ctx.channelId`;
    - `endsWithSenderId`: boolean, whether the value ends with `ctx.senderId`.

    Never output the raw `to` or `from` values.
  - `threadPresent`: boolean, whether `messageThreadId` is a non-empty string.
- Reply 1 must fit into one Discord message of at most 17 lines (finding S2):
  - a compact single-line JSON of `invocationId` and `values`;
  - the field list on one line;
  - no pretty printing.
- `followUp()` looks up the adapter with the provider id: `ctx.channel` (bounded as above).
  - If that is absent, log `not_sent` / `provider_unavailable`.
  - Keep the four existing reasons. Add `adapter_lookup_failed` for an exception thrown by
    `loadAdapter`.
  - Send only to `ctx.to` and never construct a target yourself. If the adapter rejects the
    target, the log reason `send_failed` is the answer we need.
- Never retry the follow-up.
- Version `0.2.11-spike.2` in `package.json`, `package-lock.json` and `openclaw.plugin.json`.

## Steps

1. Red: tests for the provider-id lookup, for `provider_unavailable` and
   `adapter_lookup_failed`, for the shape redaction (raw `to`/`from` never appear in reply or
   log), and for the 17-line bound of reply 1.
2. Green: change `observe()` and `followUp()`.
3. Run `npm test`, `npm run typecheck` and `npm run check`. Then build `npm pack` into your
   scratchpad, not into the repo.

## Acceptance criteria and tests

- All new and existing tests are green, and `npm run check` is clean.
- The report states the expected live observations for check 3, with each possible log reason
  mapped to its meaning.

## Branch and worktree rules

- Only `spike/plugin-command-approval` in `/workspaces/clawonshape`, on top of `e5f8784`.
  No other branches, no worktrees, no switching, no push. Leave foreign files untouched,
  including the untracked `docs/evidence/2026-10-16-plugin-command-spike.md`, which belongs to
  the architect.
- Commits with `Refs: edge-robot/clawonshape#13`,
  `Prompt: docs/prompts/2026-10-16-plugin-command-spike-2.md`, `Agent: ts-plugin-dev` and
  `Co-Authored-By: …`:
  1. `test: 🧪 spike follow-up provider lookup and target shapes`
  2. `fix: 🧪 spike follow-up uses the provider id and a compact reply`
  3. `docs: 📖 report for plugin-command-spike-2 prompt` (report + this prompt file)

## Expected report / handoff format

`docs/prompts/2026-10-16-plugin-command-spike-2.report.md`, in the same structure as the first
spike report. Include:
- a red→green table;
- the `npm pack` name and sha256;
- `e2e-request: required`.
