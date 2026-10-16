---
target-repo: edge-robot/clawonshape
branch: spike/plugin-command-approval
worktree: /home/kaos/Projects/01_pib/02_sw/clawonshape   # devcontainer: /workspaces/clawonshape
issue: edge-robot/clawonshape#13
architecture-ref: clawonshape/docs/ADR.md#adr-2026-10-16-proof-based-mutation-release-prepared-for-verifiable-presentations
contract-version: 0.4.0-draft   # unchanged; this spike touches no contract element
foreign-repo-commit: c53d9c9dcda97da195a52ad223c431ae41100f98   # onshape-mcp, unchanged
base-commit: 6bbc5e5
status: issued
---
# Spike: plugin command for a one-step Discord approval

## Goal

Find out, with throwaway code, whether an OpenClaw plugin command (`api.registerCommand`) can carry
the one-step approval of ADR-2026-10-16 in Discord. The architect deploys your build to the
robotics-lead gateway and runs the live checks. Your job is a minimal, observable command plus
tests and a precise list of what still has to be confirmed live.

The three spike checks (issue #13):

1. The command is visible and invocable in Discord #clawcad for the Lead (native slash command or
   text command; record which).
2. The handler context carries a populated, provider-stable `senderId` plus channel/account
   identity, with no LLM involvement.
3. The handler can return at once and post a second, asynchronous message to the same
   conversation later (≥ 120 s later, longer than the 90 s dynamic tool timeout, finding M13).

## Context

- ADR `docs/ADR.md` → "ADR-2026-10-16: Proof-based mutation release …" (Accepted), section on the
  approval command and its fallback (a Lead tool with the same pure verification core).
- Epic edge-robot/clawonshape#11, spike issue edge-robot/clawonshape#13.
- Evidence (read-only): `docs/evidence/2026-10-16-mutation-path-acceptance.md` R7 (baseline that
  passed), M13 (delegation timeout), M22 (Discord `users` allowlist missing for the Lead channel),
  M23 (approval does not trigger execution).
- OpenClaw docs bundled with the deployed runtime (2026.9.9; read them, they match the installed
  SDK better than the website): `docs/plugins/sdk-overview/tools-and-commands.md`,
  `docs/plugins/sdk-overview/host-hooks.md`, `docs/plugins/hooks/tool-policy.md` (example
  `registerCommand` with `requireAuth: true`, `ctx.agentId`, `continueAgent`), and
  `docs/tools/slash-commands.md`. Documented so far: commands bypass the LLM; results can set
  `text`, `continueAgent: true` or `suppressReply: true`; `requireAuth: true` reuses the
  channel's sender admission; owner-admitted commands get `senderIsOwner` and
  `assertOwnerCurrent`; Discord native commands support `descriptionLocalizations`.
  **Not documented / unverified:** the full handler context type, whether an async follow-up
  message API exists for commands (tools have `toolContext.delivery?.send`), and whether the
  manifest must declare commands (it declares tools under `contracts.tools`). Find out from the
  SDK typings/runtime available to you; if you cannot, say so — do not guess.
- Code: `src/index.ts` (plugin entry, tool registrations), `openclaw.plugin.json` (manifest),
  `src/config.ts` (`bindings`, `connectionOwner`), `src/delegation.ts`.

## Binding constraints and prohibitions

- Spike only. **No** approval semantics, nonce, proof, payload hash, mutation, delegation,
  MCP call, REST call, credential or token access in the command.
- Register the command **only** when the plugin runs for the Lead (`engineerAgentId` config
  present / the Lead role as the plugin already distinguishes it). On the Engineer it must not
  exist.
- Name: `clawcad_spike` (Discord-safe). `requireAuth: true`. Arguments optional free text,
  echoed back length-bounded (≤ 200 chars).
- Reply 1 (synchronous): the list of context **field names** present, plus only these values:
  `senderId`, channel id, account id, agent id, `senderIsOwner`, whether
  `assertOwnerCurrent` is a function, the command surface (native/text) if exposed. No other
  values, no message bodies, no tokens.
- Reply 2 (asynchronous, only if an API for it exists): after 120 s, post
  `clawcad_spike follow-up <invocation id>` to the same conversation. If no such API exists,
  implement nothing and report that check 3 needs the fallback design.
- Log one bounded diagnostic line per invocation with the same redacted fields.
- Do not change existing tools, the contract, fixtures, `deploy/`, the dashboard or skills.
- Version: `0.2.11-spike.1` in `package.json` and `openclaw.plugin.json` so the build cannot be
  mistaken for a release.
- No new `any`, casts or `biome-ignore` without a one-line justification in the report.

## Steps

1. Read the bundled docs listed above and the SDK typings for `registerCommand` and its
   handler context; write down the exact type (or "not available").
2. Add a failing test (`tests/`) that loads the plugin with a fake `api`, asserts the command is
   registered for the Lead only, and that reply 1 contains exactly the allowed fields (redaction
   test with a context that carries extra secret-looking fields).
3. Implement the command in a separate module `src/spike-command.ts`, wired from `src/index.ts`
   behind the Lead check. Declare it in the manifest only if the SDK requires it.
4. If an async follow-up API exists: test it with a fake timer, then implement reply 2.
5. Run `npm test` and `npm run check`; `npm pack` must succeed.

## Acceptance criteria and tests

- Tests: Lead-only registration, redaction of reply 1 and the log line, argument bound,
  reply 2 scheduling (if implemented). All existing tests stay green; `npm run check` clean.
- Report lists, per spike check, what the code does and what the architect must observe live.

## Branch and worktree rules

- Only branch `spike/plugin-command-approval` in `/workspaces/clawonshape`, on top of `6bbc5e5`.
  No other branches, no worktrees, no switching, no push. The branch is not merged; P3 of #11
  re-implements on the result.
- Leave the foreign uncommitted files in the working tree untouched (`.gitignore`,
  `deploy/team.json`, `docs/evidence/…`, `docs/interface/onshape-mcp.md`, `.codex/`,
  `docs/product/`, `scripts/*product-owner*`). Stage only your own files.
- Commits with `Refs: edge-robot/clawonshape#13`,
  `Prompt: docs/prompts/2026-10-16-plugin-command-spike.md`, `Agent: ts-plugin-dev`,
  `Co-Authored-By: …`:
  1. `test: 🧪 spike command registration and redaction`
  2. `feat: 🧪 clawcad_spike plugin command (spike, not for release)`
  3. `docs: 📖 report for plugin-command-spike prompt` (report + this prompt file)
- The worktree is returned when the report is committed.

## Expected report / handoff format

`docs/prompts/2026-10-16-plugin-command-spike.report.md` per your agent definition, plus:

- the handler context type as found (source file/line in the SDK, or "not available");
- per spike check: implemented / not possible in code, and the exact live observation needed;
- whether commands need a manifest entry;
- red→green table; `npm pack` file name and sha256;
- `e2e-request: required` (the spike is only answered by the live test).
