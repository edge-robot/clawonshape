---
target-repo: edge-robot/clawonshape
branch: demo/gateway-native-read-20261014
worktree: <workspace>/clawonshape   # devcontainer: /workspaces/clawonshape
issue: edge-robot/clawonshape#16
architecture-ref: clawonshape/docs/interface/onshape-mcp.md#3-channel-b-credential-handoff-access-tokenjson
contract-version: 0.4.0-draft
foreign-repo-commit: acceacd   # onshape-mcp, branch claw-onshape/external-token
base-commit: 6a1c60f
status: done
---
# Only the gateway runtime owns the MCP token handoff (#16)

## Goal

Fix edge-robot/clawonshape#16.

**The defect.** `src/index.ts` starts `mcpTokenOwner` in every plugin load that has
`config.localMcp` set. It registers `owner.dispose` as runtime lifecycle `dispose` and
`cleanup`, and `dispose` publishes `null` to `access-token.json`.

**Observed live.** Running `openclaw onshape status owner-rest` in the Engineer container
replaced a valid token with `null`. The gateway's next periodic sync restored it, up to
15 s later.

**After this task:**
- only the long-running gateway runtime publishes or revokes `access-token.json`;
- periodic sync failures become visible, with a code and no token data.

## Context

- Read the issue first.
- Code:
  - `src/index.ts` lines ~37–47: owner start, lifecycle registration, swallowed initial
    sync;
  - `src/mcp-token-owner.ts`: the 15 s timer with its swallowed `.catch`, `sync`, and
    `dispose` → `publishMcpCredential(…, null)`;
  - `src/mcp-credentials.ts`;
  - `src/cli.ts`: the `onshape` commands.
- Contract §3 (read-only): the plugin writes `null` "on refresh failure, on disconnect and
  on plugin `dispose`", and re-syncs every 15 000 ms. Keep exactly these semantics for the
  **gateway** instance.
- OpenClaw 2026.9.9 is now installed in `node_modules/openclaw` (clawonshape#15). It
  documents:
  - `api.registrationMode` (`full`, `discovery`, `tool-discovery`, `setup-only`,
    `setup-runtime`, `cli-metadata`);
  - long-lived services via `api.registerService({id, start, stop})`.
- Read these docs:
  - `node_modules/openclaw/docs/plugins/sdk-entrypoints/registration-mode.md`;
  - `node_modules/openclaw/docs/plugins/sdk-runtime.md`;
  - `node_modules/openclaw/docs/plugins/sdk-overview.md`.
- **Unverified:** in which registration mode an `openclaw <plugin-cli-command>` invocation
  loads the plugin. Determine it from the installed OpenClaw `dist/` sources, or with a
  harmless local probe that logs `api.registrationMode` inside the devcontainer.
  Cite the evidence (file and line, or probe output) in the report.

## Binding constraints and prohibitions

1. **Gateway-only ownership.**
   - Start the token owner, including its timer, the initial sync and the `null`-on-dispose
     behaviour, only in the gateway runtime.
   - Prefer `api.registerService` (start/stop) if the docs and the dist sources confirm
     that services run only in the gateway. Otherwise gate on the registration mode that
     the gateway uses (`full`) **and** exclude the CLI load you identified.
   - State in the report which mechanism you chose and why.
2. **CLI never writes the handoff file.** No `onshape` CLI command (`status`, `connect`,
   `disconnect`, `mcp-discover`) publishes to `access-token.json` or revokes it, either
   directly or through lifecycle cleanup.
   - Exception: `disconnect`. The gateway notices the disconnect at its next sync and then
     publishes `null` itself. That is ≤ 15 s, which is acceptable.
3. **Visible failures without secrets.** Replace the two `TODO(#9)` swallows (initial sync
   and periodic sync) with a bounded log line through the plugin logger (`api.logger`, or
   whatever the plugin already uses).
   - The line contains only `mcp_credential_unavailable` plus the underlying error **code**.
     Never a token, a path with an ID, or a stack.
   - Rate-limit it: log once per code change, not every 15 s.
   - Status and readiness reporting stays as it is. Do not add a new status field.
4. **Unchanged:**
   - the contract §3 semantics in the gateway;
   - the lock usage;
   - `publishMcpCredential` validation;
   - the `connected` reporting.
5. **Scope.**
   - Allowed: `src/index.ts`, `src/mcp-token-owner.ts`, `src/cli.ts` (only if needed),
     `tests/*.test.mjs`, the prompt and its report.
   - Not allowed: `docs/interface/`, `tests/contract/`, `spec.md`, `docs/ADR.md`,
     `deploy/`, `.claude/`, `Containerfile`, `.devcontainer/`, `scripts/dev.sh`,
     `package.json`.
   - No new dependencies.
6. **User-owned working-tree files.** Never stage these, and leave them untouched:
   `.gitignore`, `.codex/`, `docs/product/`, `docs/reviews/`, `scripts/*product-owner*`,
   `scripts/product-owner-bin/`, `scripts/__pycache__/`, `result.json`.
   - The architect's untracked draft `docs/prompts/2026-10-20-approval-v2-writer.md` is not
     yours either.
   - Stage only explicit paths. Never use `git add -A`, `git add .` or `git commit -a`.

## Steps

1. Check the preconditions:
   - the branch is `demo/gateway-native-read-20261014` and HEAD is `6a1c60f`;
   - `npm ci` passes;
   - record the baseline: `npm test` count, `npm run check`, `npm run test:native-files`.
2. Establish the registration mode of the CLI invocation and record the evidence.
3. Write the failing tests first:
   - a CLI-style load (the mode you identified) does not start the owner, and its
     lifecycle cleanup does not write `access-token.json` (use a temp directory and the
     existing secret-file mock pattern);
   - a gateway load still syncs, publishes the token and writes `null` on dispose;
   - a periodic sync failure logs exactly one line with the code, and a repeated identical
     failure logs nothing more;
   - no log line contains the token.
4. Implement, run the checks, and commit with `Refs: edge-robot/clawonshape#16`.
5. Write the report.

## Acceptance criteria and tests

- [ ] `npm ci`, `npm run typecheck`, `npm test`, `npm run check`, `npm run test:native-files`
      and `npm pack --dry-run` all pass.
- [ ] The test count is the baseline plus the new tests.
- [ ] Mutation checks; each must make a test fail:
  - start the owner unconditionally again → the CLI test fails;
  - restore the swallowed `.catch(() => {})` → the logging test fails;
  - remove the rate limit → the repeat test fails.
- [ ] `git show --stat` of each commit lists only allowed paths.

## Branch and worktree rules

Commit only to `demo/gateway-native-read-20261014` in this checkout. No push, no rebase,
and no other branches or worktrees. Commit this prompt unchanged together with the report.
Afterwards `git status` shows only the user-owned files and the architect's draft.

## Expected report / handoff format

Write `docs/prompts/2026-10-20-mcp-token-owner-gateway-only.report.md` in the
agent-definition format. Include:

- the registration-mode evidence;
- the chosen mechanism;
- the checks table (baseline vs. after);
- tests before and after;
- the mutation results;
- the exact log line format;
- the commit list with trailers.

Set `e2e-request: required`. The architect will:
1. roll out the plugin to the Engineer;
2. run `openclaw onshape status owner-rest` in the Engineer while sampling
   `access-token.json` once per second: it must never become `null`;
3. check that a disconnect still yields `null` within 15 s.
