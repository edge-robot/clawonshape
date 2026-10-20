---
target-repo: edge-robot/clawonshape
branch: demo/gateway-native-read-20261014
worktree: /home/kaos/Projects/01_pib/02_sw/clawonshape   # devcontainer: /workspaces/clawonshape
issue: edge-robot/clawonshape#15
architecture-ref: clawonshape/docs/architecture.md   # tooling only; no architectural change
contract-version: 0.4.0-draft
foreign-repo-commit: acceacd   # onshape-mcp, branch claw-onshape/external-token
base-commit: 2ac80f8
status: done
---
# Make `npm ci` reproducible: lock OpenClaw as an exact devDependency

## Goal

Fix edge-robot/clawonshape#15. After this task a clean checkout must pass
`npm ci && npm run typecheck && npm test && npm run check` without any hand-placed
`node_modules/openclaw` and without `--legacy-peer-deps`.

## Context

- Read issue #15. It records the architect's decision. Do not choose a different option.
- `package.json`:
  - `peerDependencies: {"openclaw": "2026.9.9"}`;
  - devDependencies: `@biomejs/biome`, `@types/node`, `typescript`.
- `package-lock.json` has no `openclaw` entry, so `npm ci` fails with `EUSAGE`.
- The plugin imports OpenClaw **types only**: `import type … from 'openclaw/plugin-sdk/core'`
  in `src/index.ts`, `src/cli.ts` and `src/dashboard.ts`.
- `docs/prompts/2026-10-16-biome-linter.report.md` → *Open points* 1 describes the
  workaround in use today.
- `openclaw@2026.9.9` on npm is large: about 390 MB unpacked, with 66 direct dependencies.

## Binding constraints and prohibitions

1. **The decision.**
   - Add `"openclaw": "2026.9.9"` (exact, no range) to `devDependencies`.
   - Keep `peerDependencies.openclaw` exactly as it is.
   - Regenerate `package-lock.json` with a plain `npm install`, without
     `--legacy-peer-deps` and without `--force`.
2. **Forbidden:**
   - an `.npmrc` containing `legacy-peer-deps`;
   - `peerDependenciesMeta`;
   - `overrides`;
   - version ranges;
   - changes to other dependency versions, unless npm forces them. If npm forces one, list
     it in the report.
3. **Lifecycle scripts.** If OpenClaw's install scripts fail in the container, stop.
   Report `status: blocked` with the exact error. Do not fall back to
   `--ignore-scripts`, `.npmrc` tricks or any other option on your own.
4. **Package content.** The `npm pack --dry-run` file list must not change, apart from
   this prompt and its report under `docs/prompts/`. OpenClaw must never be bundled.
5. **Scope.**
   - Change only `package.json` and `package-lock.json`, plus this prompt and its report.
   - Never touch `src/`, `tests/`, `docs/interface/`, `tests/contract/`, `spec.md`,
     `docs/ADR.md`, `deploy/`, `.claude/`, `Containerfile`, `.devcontainer/` or
     `scripts/dev.sh`.
6. **Foreign working-tree changes.** The checkout contains uncommitted changes that are
   not yours, for example:
   - `.gitignore`, `deploy/team.json`, `docs/interface/onshape-mcp.md`,
     `docs/prompts/2026-10-19-team-onboarding.md`;
   - `.codex/`, `docs/product/`, `result.json`, `scripts/*product-owner*`.

   Leave all of them untouched and never stage them. Stage files only by explicit path;
   never use `git add -A`, `git add .` or `git commit -a`.

## Steps

1. Check the preconditions:
   - the branch is `demo/gateway-native-read-20261014`;
   - HEAD is `2ac80f8`, or a descendant that contains only foreign commits; report it if
     so.
2. Record the baseline:
   - `npm ci` (expected: `EUSAGE`);
   - `npm run typecheck`, `npm test` (record the count), `npm run check`;
   - `npm pack --dry-run` file list, saved to a scratch file outside the repo.
3. Delete `node_modules` (it is local and untracked). Apply the decision and run
   `npm install`.
4. From a clean state, run `rm -rf node_modules && npm ci`, then `npm run typecheck`,
   `npm test`, `npm run check` and `npm run test:native-files`.
   - `test:native-files` may still fail with `native_private_file_sdk_unavailable`. Record
     whether it changed now that the full OpenClaw package is installed. Do not fix it.
5. Run `npm pack --dry-run` again and `diff` the file list against the baseline.
6. Commit `package.json` and `package-lock.json` with `Refs: edge-robot/clawonshape#15`.
7. Commit this prompt unchanged together with the report.

## Acceptance criteria and tests

- [ ] `rm -rf node_modules && npm ci` passes without flags.
- [ ] `npm run typecheck`, `npm test` and `npm run check` pass, and the test count equals
      the baseline.
- [ ] `package-lock.json` has `node_modules/openclaw` at version `2026.9.9`.
- [ ] `peerDependencies` is unchanged.
- [ ] The `npm pack --dry-run` diff contains only the files under `docs/prompts/`.
- [ ] No foreign file is staged or committed: `git show --stat` for each commit.

## Branch and worktree rules

- Commit only to `demo/gateway-native-read-20261014` in this checkout.
- No push, no rebase, no new branches or worktrees.
- After the commits, `git status` shows only the foreign changes listed above.

## Expected report / handoff format

`docs/prompts/2026-10-20-npm-ci-openclaw-lock.report.md` in the agent-definition format
(frontmatter with `status`, `contract-version`, `e2e-request`), containing:

- the checks table, baseline vs. after;
- the npm and node versions;
- the lockfile size delta and the count of added packages;
- any dependency npm forced to change;
- the `npm pack --dry-run` diff;
- the `test:native-files` result before and after;
- the commit list with trailers.

Set `e2e-request: none`, because tooling has no runtime effect. The architect confirms that
the next `npm pack` artifact is unchanged.
