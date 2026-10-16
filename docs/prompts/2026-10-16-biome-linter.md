---
target-repo: edge-robot/clawonshape
branch: demo/gateway-native-read-20261014
worktree: /home/kaos/Projects/01_pib/02_sw/clawonshape   # devcontainer: /workspaces/clawonshape
issue: edge-robot/clawonshape#9
architecture-ref: clawonshape/docs/architecture.md   # tooling only; no architectural change
contract-version: 0.2.0-draft
foreign-repo-commit: c53d9c9dcda97da195a52ad223c431ae41100f98   # onshape-mcp, branch claw-onshape/external-token
status: issued
---
# Introduce Biome as linter and formatter

## Goal

Add Biome as the single linter and formatter for ClawOnshape. Configure rules that
machine-check the project constraints that today exist only as prose in your agent
definition. Finish with `npx biome ci` passing on the branch and wired into the
mandatory checks. This is the **dedicated Biome prompt** that your agent definition
mentions: whole-file reformatting is allowed here, and only here.

## Context

- Issue: edge-robot/clawonshape#9.
- Build: `scripts/build.mjs` strips types with `node:module` `stripTypeScriptTypes`
  (`mode: 'strip'`). Only erasable TypeScript compiles.
- `tsconfig.json`: `strict`, `NodeNext`, `allowImportingTsExtensions`; covers `src/**/*.ts` only.
- Linted surfaces: `src/*.ts` (plugin), `ui/control-ui.js` (dashboard bundle, browser),
  `scripts/*.mjs` (Node tooling), `tests/*.test.mjs` (node:test against `dist/`).
- MCP boundary from edge-robot/clawonshape#2: the plugin is not an MCP client.
- Biome docs: https://biomejs.dev/ (configuration reference, linter rules, `biome ci`).
  Use the configuration schema of the version you install as the source of truth for rule
  names and groups. Unknown rule names must fail the config, not be silently ignored.

## Binding constraints and prohibitions

- **Dependency:** the user has approved exactly one new dev dependency,
  `@biomejs/biome`, pinned to an exact version (no `^`/`~`). Use 2.5.x (latest at the
  time of writing: 2.5.15). `npm install --save-dev --save-exact @biomejs/biome@<version>`
  will ask the user for confirmation; that is expected. No other new dependencies; no
  runtime dependencies.
- **No behaviour changes.** Lint fixes must be semantically neutral. If a rule finding
  would require a behaviour change (e.g. a real floating promise, a real shadowing bug),
  do not fix it here: suppress it with a reason that starts with `TODO(#9):` and list it
  under *Out-of-scope findings*. Security-relevant findings (auth, token, approval,
  fail-closed paths) are always listed, never silently fixed.
- **Do not touch:** the contract (`docs/interface/`, `tests/contract/`), `spec.md`,
  `docs/ADR.md`, `docs/architecture*`, `.claude/`, `Containerfile`, `.devcontainer/`,
  `scripts/dev.sh`, `package.json` `peerDependencies`. Biome must **ignore** these paths
  where they contain lintable files (`tests/contract/**`, `docs/**`) so that `biome ci`
  never demands changes there.
- **Foreign working-tree changes:** the checkout contains uncommitted changes that are
  not yours (`.gitignore`, `.codex/`, `scripts/check-product-owner-permissions.py`,
  `scripts/onshape-product-owner.py`, `scripts/onshape-product-owner-shell`). Never
  stage, format, modify or commit them. Stage files explicitly by path; never use
  `git add -A` or `git add .`.
- Do not reformat or lint `dist/`, `node_modules/`, `state/`, `*.tgz`, `agents/**`,
  `skills/**` (Markdown/agent definitions), JSON fixtures under `tests/fixtures/` if
  formatting them would change test expectations (check byte-exact reads first).
- `openclaw.plugin.json` and `package.json` may be formatted only if the result is
  semantically identical; verify `npm pack --dry-run` content stays the same.

## Steps

1. **Preconditions** (per your workflow): branch, `tests/contract/VERSION` =
   `0.2.0-draft`, foreign repo HEAD = `c53d9c9…`. Record a baseline:
   `npm ci`, `npm run typecheck`, `npm test`, `npm run test:native-files`,
   `npm pack --dry-run` (save the file list for comparison).
2. **Install** `@biomejs/biome` exact-pinned. Run `npx biome init` only if useful; the
   final `biome.json` is hand-written and committed with `$schema` pointing to
   `./node_modules/@biomejs/biome/configuration_schema.json`.
3. **Configure `biome.json`:**
   - `vcs`: enabled, `clientKind: git`, `useIgnoreFile: true`.
   - `files.includes`: `src/**`, `ui/**`, `scripts/**/*.mjs`, `tests/**/*.mjs`,
     `*.json` at the root as far as safe; explicit negations for `tests/contract/**`,
     `docs/**`, `dist/**`, `state/**`.
   - **Formatter:** spaces, indent 2, `lineWidth: 120`, LF; JS/TS: single quotes,
     semicolons always, trailing commas `all`, `bracketSpacing: false` (matches the
     existing `{a,b}` import style as closely as possible; take the setting that produces
     the smaller diff and justify it in the report).
   - **Linter:** start from `recommended: true`, then set at least these to `error`
     (verify each name and group against the schema):
     - erasable TypeScript: `style/noEnum`, `suspicious/noConstEnum`,
       `style/noNamespace`, `style/noParameterProperties`;
     - typing discipline: `suspicious/noExplicitAny`, `suspicious/noImplicitAnyLet`,
       `suspicious/noEvolvingTypes`, `suspicious/noTsIgnore`,
       `style/noNonNullAssertion`;
     - imports: `style/useImportType`, `style/useExportType`,
       `style/useNodejsImportProtocol`, `correctness/noUnusedImports`,
       `correctness/noUnusedVariables`;
     - error handling and fail-closed: `suspicious/noEmptyBlockStatements`,
       `complexity/noUselessCatch`, `correctness/noUnsafeFinally`,
       `style/useThrowOnlyError`, `suspicious/useErrorMessage`,
       `suspicious/noDoubleEquals`, `security/noGlobalEval`;
     - general: `style/useConst`, `suspicious/noVar`, `style/useBlockStatements`,
       `style/noParameterAssign`.
   - **`style/noRestrictedImports`** (error) in `src/**`:
     - forbid `@modelcontextprotocol/*` and any other MCP client SDK, with the message
       "The plugin is not an MCP client (edge-robot/clawonshape#2).";
     - forbid `openclaw` root and any `openclaw/dist/**` path; only
       `openclaw/plugin-sdk/*` subpaths are allowed. Use the most precise mechanism the
       installed Biome supports (paths/patterns); if a pattern cannot express "allow only
       `openclaw/plugin-sdk/*`", document the gap in the report instead of guessing.
   - **`suspicious/noConsole`:** error in `src/**` (the plugin logs through the OpenClaw
     API); off in `scripts/**` and `tests/**`.
   - **Overrides:** `ui/**` is a browser bundle (globals `window`/`document`);
     `tests/**` and `scripts/**` may relax only what is clearly test/tooling-specific
     (e.g. `noNonNullAssertion` does not apply to `.mjs`). Every override gets a
     one-line reason in the report.
   - **Nursery / type-aware rules** (`noFloatingPromises`, `noMisusedPromises`): enable
     only if they work without extra setup in the installed version. Run them once and
     report the findings either way; if they cause noise, set them to `warn` and say why.
   - Do not enable rules whose only effect is mass churn without a safety or clarity
     benefit (e.g. `performance/noBarrelFile`, `performance/noNamespaceImport`); name
     any rule you deliberately leave off.
4. **Scripts in `package.json`:** `"lint": "biome lint ."`, `"format": "biome format --write ."`,
   `"check": "biome ci ."`. Do not hook Biome into `pretest` or `prepack`.
5. **Commit sequence** (each commit must pass `npm run typecheck` and `npm test`):
   1. `chore: 🔧 add Biome configuration and scripts` — `package.json`,
      `package-lock.json`, `biome.json`. No source changes.
   2. `style: 🎨 apply Biome formatting` — output of `npx biome format --write` **only**,
      no hand edits, no lint fixes.
   3. `chore: 🙈 ignore Biome formatting commit in blame` — add
      `.git-blame-ignore-revs` with the full SHA of commit 2 and a comment line.
   4. One or more `refactor: ♻️ fix Biome lint findings (<rule group>)` commits.
      Safe fixes (`--write`) and manual fixes may share a commit per rule group. Unsafe
      fixes (`--unsafe`) only after you have reviewed each hunk.
   5. `docs: 📖 report for biome-linter prompt` — the report and this prompt file
      (`docs/prompts/2026-10-16-biome-linter.md`, add it unchanged).
   All commits carry `Refs: edge-robot/clawonshape#9`,
   `Prompt: docs/prompts/2026-10-16-biome-linter.md`, `Agent: ts-plugin-dev`,
   `Co-Authored-By: …`.
6. **Suppressions:** `// biome-ignore <rule>: <reason>` only on the exact line; no
   file-wide or folder-wide ignores except the path exclusions listed above. Count all
   suppressions per rule and list them in the report.

## Acceptance criteria and tests

- `npx biome ci .` exits 0 on the final commit, with no warnings other than those listed
  and justified in the report.
- `npm ci`, `npm run typecheck`, `npm test`, `npm run test:native-files` pass with the
  same test count as the baseline.
- `npm pack --dry-run` lists the same files as the baseline (Biome config files must not
  enter the package).
- `biome.json` contains every rule named in step 3 with an explicit level, or the report
  says why a rule does not exist in the installed version.
- A deliberate probe proves the key rules fire: create a throwaway file (not
  committed) under `src/` with an `enum`, an `any`, an `@ts-ignore`, an empty `catch {}`,
  an `import … from '@modelcontextprotocol/sdk'` and an `import … from
  'openclaw/dist/x-abc123.js'`; paste the `biome lint` diagnostics summary into the
  report; delete the file.
- Commit 2 is format-only: `git show --stat <sha2>` is reported and
  `npm test` passes on it.
- `package.json` has exactly one new devDependency, exact-pinned; no runtime dependency.
- No changes to any path listed under *Do not touch* or to the foreign working-tree
  changes (`git status` before and after is in the report).

## Branch and worktree rules

- Work only on `demo/gateway-native-read-20261014` in `/workspaces/clawonshape`.
- Do not create branches or worktrees; do not switch branches; do not push.
- Hand the worktree back clean except for the foreign uncommitted changes that were
  already present at the start.

## Expected report / handoff format

Write `docs/prompts/2026-10-16-biome-linter.report.md` in the format from your agent
definition. Additionally include:

- the final `biome.json` rule table (rule → level → why);
- the formatter choice for `bracketSpacing` with the diff-size comparison;
- the probe diagnostics;
- the suppression list (rule → count → file:line → reason);
- nursery/type-aware findings;
- the baseline vs. final check results.

`e2e-request`: choose `recommended` unless a lint fix touched OAuth, token handoff,
approvals, bindings, authorization or fail-closed paths; in that case it is `required`
(see your agent definition). Print `E2E REQUIRED: docs/prompts/2026-10-16-biome-linter.md`
if so.
