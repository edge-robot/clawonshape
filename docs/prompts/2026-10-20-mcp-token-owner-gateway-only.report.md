---
prompt: docs/prompts/2026-10-20-mcp-token-owner-gateway-only.md
branch: demo/gateway-native-read-20261014
commits: a043d1b..HEAD (a043d1b, 06bddb8 + the commit that adds this report)
status: done
contract-version: 0.4.0-draft
e2e-request: required
---
# Report: Only the gateway runtime owns the MCP token handoff (#16)

## Summary

- **Owner is a gateway service.** The MCP token owner now runs as a plugin service
  (`api.registerService`, id `onshape-mcp-access-owner`). The service is registered only
  when `api.registrationMode === 'full'`.
  - It no longer starts in `register()`.
  - It is no longer tied to `api.lifecycle.registerRuntimeLifecycle`, whose `dispose` the
    CLI's inspection load triggers. That was the root cause of #16.
  - The initial sync, the 15 s re-sync and null-on-stop happen only in the gateway.
- **Visible failures.** The two `TODO(#9)` swallows (initial and periodic sync) are
  replaced by one bounded log line through `api.logger.warn`:
  `mcp_credential_unavailable code=<code>`. It is rate-limited to one line per code change.
- **A second write path, found while checking constraint 2.**
  - `onshape connect` and `onshape disconnect` opened the credential store with the
    `localMcp` handoff directory. `credentials().save()` then published the token or `null`
    to `access-token.json` directly from the CLI process.
  - The CLI now opens the store without a handoff directory.
  - After a CLI disconnect, the gateway's next sync publishes `null` (≤ 15 s), as
    constraint 2 allows.
  - After a CLI connect, the gateway's next sync publishes the new token.
- I could not read issue #16, because the container has no GitHub credentials. The
  prompt's description of the defect is the basis for this work.

Preconditions:
- Branch `demo/gateway-native-read-20261014`, HEAD was `6a1c60f`.
- `tests/contract/VERSION` = `0.4.0-draft`.
- onshape-mcp is at `acceacd9e8de79e2fd58857bc414149863da9c0e`.

## Registration-mode evidence

The evidence comes from the installed `openclaw@2026.9.9` `dist/`, by source reading
only. I ran no probe, because running `openclaw` is forbidden for this agent.

1. **CLI path:** `dist/cli/run-main.js:1108`
   - It calls `registerPluginCliCommandsFromValidatedConfig(program, void 0, void 0, {mode: "lazy", primary, …})`.
   - No `loaderOptions`, and therefore no `runtimeSideEffects`.
2. **Command execution:** `dist/cli-registry-loader-Bvr86ccd.mjs:233-251`
   (`loadPluginCliCommandRegistryWithContext`).
   - It loads through `acquirePluginRegistryForInspection(options)` or
     `loadPluginRegistryHandle(options)`, with `channelPluginLoadIntent: "full"` (l. 247).
   - `acquirePluginRegistryForInspection` sets `activate: false`
     (`dist/loader-runtime-load-DpgEqnzx.mjs:6168-6173`).
   - `loadPluginRegistryHandle` also sets `activate: false` (`dist/loader-DpAS3szV.mjs:6-10`).
3. **Mode resolution:**
   - `dist/active-runtime-registry-BuQ2FSB4.mjs:216-217`:
     `shouldActivate = options.mode !== "cli-metadata" && options.activate !== false` gives
     `false`, so `runtimeSideEffects = options.runtimeSideEffects ?? shouldActivate` gives
     `false`.
   - `dist/loader-runtime-load-DpgEqnzx.mjs:842`:
     `createRegistrationPlan(params.runtimeSideEffects ? "full" : "discovery")` gives
     **`"discovery"`**. The `setup-runtime` branch (l. 835) applies only to channel
     plugins, and `openclaw.plugin.json` declares no `channels`.
   - `api.registrationMode` is set from the plan (l. 1224).
4. **Retirement of the CLI instance:** `dist/loader-runtime-load-DpgEqnzx.mjs:6183`.
   - The inspection resources call `instance.dispose()` on retire.
   - That is the path that ran the old runtime-lifecycle `dispose` and wrote `null`.
5. **Gateway path:** `dist/server-plugins-CzOpf53P.mjs:498-501`.
   - `loadOpenClawPlugins({…, activate: false, runtimeSideEffects: true, …})` gives
     **`"full"`**.
6. **Services start only in the gateway.** `startPluginServices` is called from:
   - `dist/server-startup-post-attach-CsYAFanV.mjs:783`
   - `dist/server-plugin-reload-BeiD3aB3.mjs:684`
   - `dist/server-plugin-reload-BeiD3aB3.mjs:812`
   - `dist/agent-via-gateway-MB8SBICx.mjs:122`. This is the only non-server caller. It
     filters to `ONE_SHOT_DIAGNOSTICS_SERVICE_IDS` (l. 116), so it never starts plugin
     services like ours.
   - `docs/plugins/sdk-runtime.md:137`: on replacement the gateway "stops services …
     and disposes the old instance".
7. **Docs:** `docs/plugins/sdk-entrypoints/registration-mode.md`.
   - It describes `"full"` as normal gateway startup.
   - It says to skip "sockets, workers, clients, and services" in `"discovery"`.

## Chosen mechanism and why

I chose **`api.registerService({id, start, stop})`, registered only when
`api.registrationMode === 'full'`**.
- Services are started and stopped only by the gateway (evidence 6), which makes them the
  primary mechanism.
- The mode gate is defence in depth. The docs tell plugins not to register services
  outside `"full"`, and it keeps every non-gateway load completely inert.
- The service's `stop` is the gateway equivalent of contract §3 "plugin `dispose`". It
  runs on gateway shutdown and on plugin replacement or reload (evidence 6), and it
  writes `null`.

APIs used:

| API | Type, file |
|---|---|
| `OpenClawPluginApi.registerService` | `(service: OpenClawPluginService$1) => void`, `node_modules/openclaw/dist/agent-harness-runtime-R8dTs5zl.d.ts:23578` |
| `OpenClawPluginService$1` | `{id, reload?, start(ctx), stop?(ctx)}`, `agent-harness-runtime-R8dTs5zl.d.ts:23162` |
| `OpenClawPluginApi.registrationMode` | `PluginRegistrationMode`, `agent-harness-runtime-R8dTs5zl.d.ts:23515` (union at l. 23188) |
| `api.logger.warn` | `PluginLogger$1.warn`, `agent-harness-runtime-R8dTs5zl.d.ts:4886` (already in use) |

All of these are reached through `openclaw/plugin-sdk/core` (`OpenClawPluginApi`); I added
no new imports.

## Log line format

```
mcp_credential_unavailable code=<code>
```

- `<code>` is `userError(cause).code` from `src/readiness.ts`.
  - It is the underlying failure mapped onto the existing status-model codes.
  - Unknown errors become `onshape_unavailable`, so I added no new codes.
- The line is a single line. It never contains a token, a path or a stack.
- One line per code change:
  - The same code on later syncs is not logged again.
  - A successful sync resets the limiter, so a later failure is logged again.
- A logger that throws is ignored, and its error text is dropped.
- Example (from the test): `mcp_credential_unavailable code=reconnect_required`.
- The public sync error is still `mcp_credential_unavailable`. The underlying cause is
  only carried internally, in `McpCredentialUnavailable.underlying`.
- Status and readiness reporting is unchanged; I added no new field.

## Changed files

```
 src/cli.ts                     |   9 +-
 src/index.ts                   |  27 +++-
 src/mcp-token-owner.ts         |  55 ++++++--
 tests/mcp-token-owner.test.mjs | 296 +++++++++++++++++++++++++++++++++++
```

| File | Purpose |
|---|---|
| `src/index.ts` | registers the owner as a gateway service, only in `full` mode; removes the lifecycle registration and the swallowed initial sync |
| `src/mcp-token-owner.ts` | `start()` (timer plus initial sync), the `warn` callback, the rate-limited report replacing both swallows, the internal cause wrapper, `MCP_TOKEN_SYNC_INTERVAL_MS` |
| `src/cli.ts` | CLI credential store without a handoff directory, so no CLI write to `access-token.json` |
| `tests/mcp-token-owner.test.mjs` | new: 5 tests (see below) |
| `docs/prompts/2026-10-20-mcp-token-owner-gateway-only{,.report}.md` | prompt, committed unchanged, and this report |

Unchanged:
- the contract §3 semantics in the gateway (15 000 ms re-sync, null on refresh failure,
  null on stop);
- the lock usage (`store.exclusive`);
- `publishMcpCredential` validation;
- the `connected` reporting.

## Checks

| Command | Baseline (6a1c60f) | After |
|---|---|---|
| `npm ci` | pass | pass |
| `npm run typecheck` | pass | pass |
| `npm test` | pass: 115 tests, 115 pass, 0 fail | pass: **120** tests, 120 pass, 0 fail (115 + 5 new). Also 10 consecutive green runs |
| `npm run check` (`biome ci .`) | pass: 48 files, no fixes | pass: 49 files, no fixes |
| `npm run test:native-files` | exit 0, `PASS` | exit 0, `PASS` |
| `npm pack --dry-run` | see the note | file list unchanged by this task (`diff` empty after the code commits); no `state/`, `*.tgz` or `.env` |

Note on `npm pack`: the list contains untracked user files under `docs/product/`. See
*Out-of-scope findings*.

## Tests (before, then after)

The new tests are in `tests/mcp-token-owner.test.mjs`:

1. `CLI-style plugin loads never start the MCP token owner or revoke access-token.json`
   - Modes: `discovery`, `cli-metadata`, `tool-discovery`, `setup-runtime`, `setup-only`
     and an absent mode.
   - Checks: no service, no owner lifecycle, and `access-token.json` is unchanged after
     every registered lifecycle `dispose`/`cleanup`.
2. `gateway load publishes through the registered service and writes null when the service stops`
   - `full` mode: registration alone does nothing.
   - `start` publishes the token: exactly three keys, no refresh token.
   - `stop` writes `null`.
3. `periodic sync failures log one bounded line per code change and never the token`
   - Exactly one line on the first failure, and nothing more on 3 identical periodic
     failures.
   - A different code gives a second line.
   - No line contains a token, a path or a newline.
4. `a recovered sync resets the rate limit and a failing logger does not stop the owner`
5. `onshape status and disconnect CLI commands never write access-token.json; the gateway revokes`
   - CLI status and disconnect leave the handoff unchanged.
   - The gateway owner's next sync publishes `null`.

Failing first, checked against the old sources:
- With the old `src/index.ts` and `src/mcp-token-owner.ts`, the file fails at import
  because the constant is missing.
- With only the constant added, tests 1–4 fail:
  - test 1: `no owner lifecycle in mode discovery`;
  - test 2: no service is registered;
  - tests 3 and 4: `owner.start is not a function`.
- With the old `src/cli.ts`, test 5 fails.

## Mutation results

| Mutation | Result |
|---|---|
| M1a: remove the `registrationMode === 'full'` gate (service also registered in non-gateway loads) | test 1 **fails** |
| M1b: start the owner unconditionally again in `register()` with the old runtime-lifecycle `dispose` | tests 1 and 2 **fail** |
| M2: restore the swallow (`sync().then(…, () => {})`) | tests 3 and 4 **fail** |
| M3: remove the rate limit (`if (code === lastFailure) return;`) | test 3 **fails** |
| M4: old `src/cli.ts` (store with handoff directory) | test 5 **fails** |

I restored all sources after each mutation; `git diff` matched the intended change.

## Acceptance criteria

| Criterion | Status | Evidence |
|---|---|---|
| ci, typecheck, test, check, native-files and pack all pass | met | Checks table |
| test count = baseline + new tests | met | 115 + 5 = 120 |
| mutations: unconditional start → CLI test fails | met | M1a, M1b |
| mutations: swallowed `.catch` → logging test fails | met | M2 |
| mutations: no rate limit → repeat test fails | met | M3 |
| `git show --stat` of each commit lists only allowed paths | met | `a043d1b`: `src/index.ts`, `src/mcp-token-owner.ts`, `tests/mcp-token-owner.test.mjs`. `06bddb8`: `src/cli.ts`, `tests/mcp-token-owner.test.mjs`. Report commit: the prompt and the report |

## Contract deviations and change requests

None blocking. One optional wording clarification for contract §3 *Revocation*, non-breaking:

```diff
-| Revocation | The plugin writes `null` on refresh failure, on disconnect and on plugin `dispose`. |
+| Revocation | The plugin's gateway runtime writes `null` on refresh failure, on disconnect (at the latest at its next 15 000 ms re-sync when the disconnect happened in a CLI process) and when the gateway stops the plugin service. |
```

- Why: it records #16. Short-lived CLI loads are never the writer, and CLI-initiated
  disconnects are revoked with up to 15 s latency.
- Impact on onshape-mcp: none. The reader semantics are unchanged.

## Live E2E request

- **Preconditions:** a plugin build from this branch (HEAD after the report commit) rolled
  out to the Engineer, with `localMcp` configured for `owner-rest` and a connected grant.
- **Check 1:** sample `access-token.json` once per second, and meanwhile run
  `openclaw onshape status owner-rest` in the Engineer several times.
  - Expected: the file never becomes `null`, and the token is unchanged apart from normal
    rotation.
- **Check 2:** run `openclaw onshape disconnect owner-rest`, or use the dashboard
  disconnect.
  - Expected: `access-token.json` becomes `null` within ≤ 15 s. The dashboard path is
    immediate, because it runs in the gateway.
- **Check 3:** reconnect with `openclaw onshape connect owner-rest --live`.
  - Expected: the token appears within ≤ 15 s, published by the gateway, not by the CLI.
- **Check 4:** cause a sync failure, for example with an expired grant and no refresh
  possible.
  - Expected: the gateway log shows exactly one `mcp_credential_unavailable code=<code>`
    line and no repeat every 15 s.
- **Check 5:** restart or stop the gateway.
  - Expected: `null` is written on service stop.

## Open points and risks

1. **CLI connect and disconnect take up to 15 s to reach the handoff.** This is accepted
   by constraint 2. The dashboard connect and disconnect still publish immediately,
   because they run in the gateway.
2. **Service stop and runtime-lifecycle dispose.** I rely on the documented gateway
   behaviour (`sdk-runtime.md:137`): services are stopped on replacement, reload and
   shutdown. Please verify the null-on-stop live (E2E check 5).
3. **Possible recheck of other lifecycle registrations.** `src/dashboard.ts:220` also
   registers a runtime lifecycle (`onshape-consent`, `lifecycle.cancel`) in every load.
   - It does not touch the handoff, so I left it alone.
   - It cancels pending consents of *that* instance only. I see no cross-process effect,
     but the architect may want it checked with the same lens.
4. **Tests 1–4 were written in the same session as the implementation.** Their
   failing-first status was shown against the old sources, as described under *Tests*.

## Out-of-scope findings

- **`package.json` `files` includes `docs`.** `npm pack` therefore picks up untracked
  working-tree files such as `docs/product/*.json` (GitHub dumps) and
  `docs/prompts/2026-10-20-approval-v2-writer.md`. Packaging must happen from a clean
  checkout, or the `files` list must be narrowed. That is the architect's decision; I
  changed nothing.
- `tests/foundation.test.mjs`, the agent memory and the secret-file mock assumed a
  types-only `node_modules/openclaw`. With the full package installed (#15) the mock still
  works, but its rationale is outdated.

## Commits

- `a043d1b` fix: 🔐 only the gateway service owns the MCP token handoff
- `06bddb8` fix: 🔐 onshape CLI commands never write the MCP token handoff
- report commit: docs: 📖 report for mcp-token-owner-gateway-only prompt

All commits carry:
```
Refs: edge-robot/clawonshape#16
Prompt: docs/prompts/2026-10-20-mcp-token-owner-gateway-only.md
Agent: ts-plugin-dev
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
