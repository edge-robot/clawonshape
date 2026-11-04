---
prompt: docs/prompts/2026-10-16-biome-linter.md
branch: demo/gateway-native-read-20261014
commits: 6ddcf3b..f986d7b
status: done
contract-version: 0.2.0-draft
e2e-request: required
---
# Report: Introduce Biome as linter and formatter

## Summary

Biome 2.5.15 is now the single linter and formatter (exact-pinned dev dependency, hand-written
`biome.json`, `lint`/`format`/`check` scripts). `npx biome ci .` exits 0 on the final commit
with no warnings. The required rules are enabled at `error`, including `noRestrictedImports`
for the MCP and OpenClaw import boundary and the type-aware nursery rules `noFloatingPromises`
and `noMisusedPromises`. Every lint commit is behaviour-neutral:

- `src/` and `scripts/` were verified AST-equivalent to the previous revision. The checker
  removes comments, unwraps single-statement blocks and ignores whitespace. It was
  negative-tested: an injected `void` is detected.
- The type-annotation commit was verified by comparing `stripTypeScriptTypes` output.
- The only expression-level changes outside `src/`/`scripts/` are three `void` markers on
  intentionally unawaited promises (`ui/control-ui.js` ×2, one test).

Findings that would need a behaviour change carry `TODO(#9)` suppressions and are listed below.
Several of them are in token-handoff and authorization paths.

The commit range covers code and config. The report commit
(`docs: 📖 report for biome-linter prompt`) follows it.

## Changed files

`git diff --stat f49b76d..f986d7b`: 49 files changed, 9968 insertions(+), 3069 deletions(-).

| File(s) | Purpose |
|---|---|
| `biome.json` | new: Biome configuration (formatter, rules, overrides, file scope) |
| `package.json` | `@biomejs/biome` 2.5.15 devDependency (exact) and `lint`/`format`/`check` scripts. npm re-sorted `devDependencies` alphabetically |
| `package-lock.json` | Biome and its platform CLI packages only (`--legacy-peer-deps`, see Open points) |
| `.git-blame-ignore-revs` | new: ignores the bulk formatting commit `2587b48` |
| `src/*.ts` (23) | formatting; braces; type annotations; template literals; documented empty blocks; line-exact suppressions |
| `ui/control-ui.js` | formatting; braces; two `void invoke('status')`; two suppressions |
| `scripts/*.mjs` (9) | formatting; braces; template literals; documented empty catches; unused catch binding removed |
| `tests/*.test.mjs` (10) | formatting; braces; template literals; `useConst`; one `void lifecycle.cancel()` |
| `openclaw.plugin.json`, `tsconfig.json` | formatting only. `JSON.parse` result is identical to before |

Untouched, as required: `docs/interface/`, `tests/contract/`, `spec.md`, `docs/ADR.md`,
`docs/architecture*`, `.claude/`, `Containerfile`, `.devcontainer/`, `scripts/dev.sh`,
`peerDependencies`, and all foreign working-tree changes.

## Checks

| Command | Baseline (before) | Final |
|---|---|---|
| `npm ci` | **fail**: `EUSAGE`, lock file out of sync (`Missing: openclaw@2026.9.9 …`) | **fail**: same error, pre-existing (see Open points). `npm ci --legacy-peer-deps` → pass |
| `npm run typecheck` | pass | pass |
| `npm test` | pass: 93 tests, 93 pass, 0 fail | pass: 93 tests, 93 pass, 0 fail |
| `npm run test:native-files` | exit 1, `UNAVAILABLE` / `native_private_file_sdk_unavailable` (no native SDK in the container) | identical |
| `npm pack --dry-run` | 100 files | 100 files, identical list (`diff` empty); no `biome.json`, `.git-blame-ignore-revs`, `*.tgz`, `state/`, `.env` |
| `npx biome ci .` (`npm run check`) | n/a | pass: 47 files checked, 0 errors, 0 warnings, 0 infos |

Every lint commit passed `npm run typecheck` and `npm test` (93/93) before it was committed.
That includes the format-only commit `2587b48`.

## Acceptance criteria

| Criterion | Status | Evidence |
|---|---|---|
| `npx biome ci .` exits 0, no unlisted warnings | met | `ci_exit=0`, "Checked 47 files … No fixes applied." |
| ci/typecheck/test/native-files same as baseline | met | see Checks: `npm ci` and `test:native-files` fail exactly as in the baseline, 93/93 tests |
| `npm pack --dry-run` same file list | met | `diff pack-before pack-after` empty (100 files) |
| every rule from step 3 in `biome.json` with explicit level | met | rule table below; all names checked against `configuration_schema.json` 2.5.15 |
| probe proves key rules fire | met | Probe section below; probe files deleted |
| commit 2 is format-only, tests pass on it | met | `git show --stat 2587b48`: 45 files, +8737/−3028; tests 93/93; JSON parse-identical |
| exactly one new devDependency, exact-pinned, no runtime dependency | met | `"@biomejs/biome": "2.5.15"`; no `dependencies` field |
| no change to protected paths or foreign changes; `git status` before/after | met | Before and after are identical: ` M .gitignore`, `?? .codex/`, `?? docs/prompts/`, `?? scripts/check-product-owner-permissions.py`, `?? scripts/onshape-product-owner-shell`, `?? scripts/onshape-product-owner.py`. The prompt file and this report are committed afterwards. |
| unknown rule names fail the config | met | a temporary `"noBogusRuleXyz"` gave `× Found an unknown key`, exit 1 |

### Final `biome.json` rule table

`linter.rules.preset: "recommended"` is the base. The older `recommended: true` key is
deprecated in 2.5.15.

| Rule | Level | Why |
|---|---|---|
| `style/noEnum`, `suspicious/noConstEnum`, `style/noNamespace`, `style/noParameterProperties` | error | erasable TypeScript only (`stripTypeScriptTypes` build) |
| `suspicious/noExplicitAny`, `suspicious/noImplicitAnyLet`, `suspicious/noEvolvingTypes`, `suspicious/noTsIgnore`, `style/noNonNullAssertion` | error | typing discipline: `unknown` plus explicit checks, no `@ts-ignore` |
| `style/useImportType`, `style/useExportType`, `style/useNodejsImportProtocol`, `correctness/noUnusedImports`, `correctness/noUnusedVariables` | error | import hygiene; type imports are erased cleanly |
| `suspicious/noEmptyBlockStatements`, `complexity/noUselessCatch`, `correctness/noUnsafeFinally`, `style/useThrowOnlyError`, `suspicious/useErrorMessage`, `suspicious/noDoubleEquals`, `security/noGlobalEval` | error | fail-closed error handling; a swallowed error must carry a comment |
| `style/useConst`, `suspicious/noVar`, `style/useBlockStatements`, `style/noParameterAssign` | error | general clarity |
| `nursery/noFloatingPromises`, `nursery/noMisusedPromises` | error | work without extra setup in 2.5.15. 4 findings, no noise (see below) |
| `style/noRestrictedImports` | off globally, **error** in `src/**` | MCP boundary (#2) and OpenClaw public-SDK-only rule. Only the plugin source is affected |
| `suspicious/noConsole` | off globally, **error** in `src/**` | the plugin should log through OpenClaw. `scripts/` and `tests/` are CLI and test tooling that print JSON to stdout |
| `performance/noBarrelFile`, `performance/noNamespaceImport` | off (explicit) | mass churn with no safety or clarity benefit |
| `assist` (organizeImports) | disabled | would reorder every import block, churn only |

`noRestrictedImports` in `src/**`:
- `paths.openclaw`: forbids the package root.
- pattern group `["@modelcontextprotocol/**", "*mcp*sdk*", "@*mcp*/**", "*mcp-client*"]`
  with the message "The plugin is not an MCP client (edge-robot/clawonshape#2)."
- pattern group `["openclaw/**", "!openclaw/plugin-sdk/*"]` with a public-SDK-only message.

Gitignore-style negation expresses "allow only `openclaw/plugin-sdk/*`" exactly. Single-level
`openclaw/plugin-sdk/core` passes. `openclaw/plugin-sdk/core/internal` and
`openclaw/dist/x-abc123.js` are rejected. This holds for static imports and for dynamic
`import()`. There is no gap to document. The MCP group is name-based, so an MCP SDK published
under an unrelated name would not be caught.

### Overrides (one-line reasons)

- `src/**`: `noRestrictedImports` and `noConsole` at error. These rules are plugin-runtime
  constraints and do not apply to tooling.
- `tests/**`: `suspicious/noEmptyBlockStatements` off. The 67 findings were all
  intentional no-op test doubles (`registerHttpRoute: () => {}`, consent callbacks and similar).
- No `ui/**` override is needed. No enabled rule depends on browser globals
  (`noUndeclaredVariables` is not in the preset).
- No `.mjs` override for `noNonNullAssertion`. The rule only applies to TypeScript syntax.

### Formatter: `bracketSpacing`

Measured on scratch copies of the full lint scope:

| `bracketSpacing` | diff |
|---|---|
| `false` (chosen) | 46 files, +8741 / −3042 |
| `true` | 46 files, +8934 / −3191 |

`false` produces the smaller diff and keeps the existing `{a,b}` import and object style.
Other settings follow the prompt: spaces, indent 2, `lineWidth` 120, LF, single quotes,
semicolons always, trailing commas `all`.

### Probe diagnostics

These temporary files under `src/` were deleted afterwards:

- `src/zz-biome-probe.ts`: `enum`, `any`, `@ts-ignore`, empty `catch {}`, MCP SDK import,
  hashed `openclaw/dist` import, plus extra cases.
- `src/zz-biome-probe2.ts`: dynamic `import()` cases.

```
src/zz-biome-probe.ts:1:22 lint/style/noRestrictedImports     (import … from '@modelcontextprotocol/sdk')
src/zz-biome-probe.ts:2:24 lint/style/noRestrictedImports     (import … from 'openclaw/dist/x-abc123.js')
src/zz-biome-probe.ts:3:20 lint/style/noRestrictedImports     (import … from 'openclaw')
src/zz-biome-probe.ts:4:20 lint/style/noRestrictedImports     (import … from 'openclaw/plugin-sdk/core/internal')
src/zz-biome-probe.ts:6:1  lint/style/noEnum
src/zz-biome-probe.ts:7:26 lint/suspicious/noExplicitAny
src/zz-biome-probe.ts:8:6  lint/suspicious/noTsIgnore
src/zz-biome-probe.ts:10:40 lint/suspicious/noEmptyBlockStatements
src/zz-biome-probe.ts:11:3 lint/suspicious/noConsole
src/zz-biome-probe.ts:12:3 lint/nursery/noFloatingPromises
Found 10 errors.   (import type … from 'openclaw/plugin-sdk/core' on line 5: no diagnostic)

src/zz-biome-probe2.ts:1:31 lint/style/noRestrictedImports    (await import('openclaw/dist/x-abc123.js'))
src/zz-biome-probe2.ts:3:31 lint/style/noRestrictedImports    (await import('@modelcontextprotocol/sdk/client/index.js'))
Found 2 errors.    (await import('openclaw/plugin-sdk/secret-file-runtime') on line 2: no diagnostic)
```

### Suppressions (52 total; 16 carry `TODO(#9)`)

Line numbers point at the `biome-ignore` comment line on the final commit.

| Rule | Count | Locations | Reason |
|---|---|---|---|
| `suspicious/useErrorMessage` | 22 | `src/render.ts:22,33,39,45,60,66,71,81,87,92,99,104`; `src/credentials.ts:35,64,152,170`; `src/connections.ts:232`; `src/mcp-credentials.ts:17`; `ui/control-ui.js:107,136` | local sentinel; the enclosing binding-less `catch` discards the message and maps it to a coded error |
| `suspicious/useErrorMessage` | (incl. above) | `src/mcp.ts:159,177` | local sentinel; the enclosing catch only inspects `code` |
| `style/noNonNullAssertion` | 9 | `src/connections.ts:178,184,187,190` | `attempt` is assigned synchronously by the Promise executor |
| | | `src/candidate-authorization.ts:172,174` | `validate()` denies the request when `initialBinding` is missing |
| | | `src/index.ts:262,402` | narrowed by the `initial?.contextId` guard at factory creation; the narrowing is lost in the closure |
| | | `src/oauth.ts:164` | the `secret(p.get('code'))` check above rejects a missing code |
| `style/noNonNullAssertion` | 7 | `src/cli.ts:95`; `src/delegation.ts:237,239`; `src/mutation-workflow.ts:162`; `src/rest.ts:665,774,920` | **TODO(#9)**: invariant not provable locally; replace with an explicit fail-closed check |
| `suspicious/noConsole` | 6 | `src/candidate-attempts.ts:301`; `src/delegation.ts:210,252,411`; `src/rest.ts:546,565` | **TODO(#9)**: route through the OpenClaw plugin logger (behaviour change) |
| `suspicious/noEmptyBlockStatements` | 3 | `src/index.ts:45`, `src/mcp-token-owner.ts:53` | **TODO(#9)**: initial or periodic MCP credential sync failure swallowed without log or status |
| | | `src/index.ts:114` | **TODO(#9)**: failure to clear the stale grant is swallowed; the original error is rethrown |
| `complexity/useOptionalChain` | 3 | `src/connections.ts:229`, `src/credentials.ts:157`, `src/delegation.ts:139` | the explicit `!x \|\|` null guard keeps fail-closed validation readable. The fix would be equivalent, but I did not rewrite security validators |
| `suspicious/noControlCharactersInRegex` | 1 | `src/config.ts:49` | intentionally rejects control characters in identifiers |
| `nursery/noMisusedPromises` | 1 | `src/mcp-token-owner.ts:15` | checks whether a sync is in flight, not the Promise result |

Nine more empty blocks in `src/` and `scripts/` got an explanatory comment instead of a
suppression: `src/cli.ts` (status catch), `src/connections.ts` (scopes catch and the
`done.catch` rejection consumer), `src/index.ts` ×2 (best-effort signing of error results),
`src/mcp-token-owner.ts` (`dispose`), `scripts/host-diagnostics.mjs` ×2 and
`scripts/provision-candidate-mcp.mjs`.

### Nursery / type-aware findings

- `noFloatingPromises` had 3 findings:
  - `ui/control-ui.js` `invoke('status')` ×2: `invoke` catches every error internally, so
    I marked both `void`.
  - `tests/product.test.mjs` `lifecycle.cancel()`: deliberately not awaited, because it
    waits for the pending work that the test resolves next. Marked `void`.
- `noMisusedPromises` had 1 finding, a false positive (`if (active)` presence check).
  Suppressed with a reason.
- Both rules stay at `error`. They needed no extra setup and caused no noise.

## Contract deviations and change requests

None. No contract file, fixture or fixture copy was read for modification or changed. Biome
force-ignores `tests/contract` and `docs` (`!!` patterns).

## Live E2E request

Required because lint commits touched files on the OAuth, token-handoff, approval and
authorization paths. The changes there are braces, comments, type annotations, template
literals (for example the `oauth.ts` redirect-path check), `import type` in
`oauth-listener.ts`, and a removed unused catch binding in `credentials.ts`. All were verified
AST-equivalent, but by the agreed rule this still requires a live run.

- Plugin: `@edge-robot/claw-onshape` 0.2.8 built from `f986d7b` or later. Use the same
  OpenClaw config flags as the current demo (`localMcp` configured, live reads enabled).
- Verify:
  - OAuth connect and status in the dashboard.
  - `access-token.json` is published and rotated, and is `null` after disconnect.
  - A read tool and the Candidate preparation flow work.
  - The propose → approve → reconcile flow writes and resets `approved-update.json`.
  - Readiness shows `UNKNOWN`/unavailable when `/health` is down.
- Expected: behaviour identical to the pre-Biome build. No new log lines, error codes or
  status values.

## Open points and risks

1. **`npm ci` was already failing before this task.**
   - Cause: `package-lock.json` never contained the peer `openclaw@2026.9.9`, and npm ≥ 7
     auto-installs peers.
   - Local setup: `node_modules/openclaw` in the devcontainer holds only the type package
     (20 MB, no dependencies) and is not recorded in the hidden lockfile. Any `npm install` or
     `npm ci` prunes it.
   - What I did: installed Biome with `--legacy-peer-deps` so that the lockfile diff contains
     Biome only, not the whole OpenClaw dependency tree, and restored `node_modules/openclaw`
     from a backup.
   - Decision for the architect: either add `"peerDependenciesMeta": {"openclaw": {"optional": true}}`
     or an `.npmrc` with `legacy-peer-deps=true`, or lock the peer in the lockfile. All
     three touch packaging or peer policy, so I did not do any of them.
2. **`test:native-files` exits 1** (`native_private_file_sdk_unavailable`) both before and
   after. The container has no native OpenClaw secret-file runtime.
3. `docs/` is part of the package `files`, so this report and the prompt appear in the
   `.tgz` once committed. That was already the case for `docs/prompts/` and is unchanged.
4. `biome.json` refers to `$schema` in `./node_modules/…`. Editors without installed
   `node_modules` show no schema help. CLI validation does not depend on it.
5. The MCP-SDK import pattern is name-based (see the rule table).

## Out-of-scope findings

None of these were fixed. Each is marked `TODO(#9)` in the code.

- `src/mcp-token-owner.ts:53` and `src/index.ts:45`: MCP credential sync failures are
  swallowed (`.catch(() => {})`) with no log and no status.
  - Inside `sync()` (`src/mcp-token-owner.ts:41-44`) a failure publishes `null` and throws
    `mcp_credential_unavailable`.
  - If `publishMcpCredential(…, null)` itself throws, the previously published access token
    can stay in `access-token.json`, and nothing surfaces it.
  - This is token handoff and fail-closed relevant. Readiness may still show the old token as
    available until it expires.
- `src/index.ts:114`: after `reconnect_required`, the best-effort `store.save(null)` failure
  is swallowed.
  - The tool call still fails, because the original error is rethrown.
  - But the stale grant remains, and nothing records that it does.
- `src/candidate-attempts.ts:301`, `src/delegation.ts:210,252,411`, `src/rest.ts:546,565`:
  audit warnings default to `console.warn` instead of the OpenClaw plugin logger.
- Non-null assertions without a local proof:
  - `src/cli.ts:95` (`config.oauth!`)
  - `src/delegation.ts:237,239` (`c.delegation!`), in the audit-event path
  - `src/mutation-workflow.ts:162` (`binding.elementId!`), in the approval proposal record
  - `src/rest.ts:665,774,920` (`elementId!`, `candidateWorkspaceId!`)

  If an invariant breaks, these produce `undefined` fields instead of a coded fail-closed
  error.
