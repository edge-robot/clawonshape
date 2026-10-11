# Validation record

Environment: 2026-10-09, Node 26.8.2 / npm 11.19.1. Shell DNS unavailable; no OpenClaw executable, TypeScript compiler or installed host SDK present.

| Check | Result | Evidence boundary |
| --- | --- | --- |
| `npm run build` | PASS | Native Node TypeScript stripping to JS, syntax/transpilation only, not a typecheck |
| `npm test` | PASS, 19 focused tests | Node tests import compiled package, mocked SDK file helper/listener and synthetic fetch/native probe fixtures |
| `npm pack --cache /tmp/clawonshape-npm-cache` | PASS | Installable archive includes entry, imported JS modules, manifest, README and research docs; no installation or runtime trust acceptance |
| `npm run typecheck` | NOT RUN successfully: tsc absent | Must install dev dependencies and exact host SDK, then run before deployment |
| `npm run test:host` / native OpenClaw loading | UNAVAILABLE (executable absent) | Source contract inspected; no local host. Script uses `plugins info --runtime --json` after operator installation |
| Live Onshape OAuth, REST, MCP | NOT RUN | No provider operations authorized or attempted in validation |

Tests cover manifest/package metadata, compiled entry import, optional agent exposure, trusted identity isolation, credential owner binding across reloads, duplicate/invalid config, live config revocation, provider workspace membership, constructed REST GET paths, bounded sanitized errors, OAuth state/path/Host/duplicate query/expiry/replay/denial/code exchange, resource separation, reconnect/expiry/disconnect, exclusive lifecycle locking, private file mode/symlink/parent checks, callback timeout draining, all historical/unknown MCP calls denied, catalog filtering and absence of tokens from tool results.

The private-file SDK is mocked: tests inspect the call contract and validate the plugin's own file guards/lifecycle lock on temporary filesystem state. They do not certify native SDK atomicity, host loader behavior, real callback sockets or native OAuth/MCP authentication. Host SDK source and `src/infra/secret-file.test.ts` were inspected: symlink rejection is an explicit read option, and private atomic writes create owner-only files/directories. The plugin supplies that option and separately checks ownership, modes, hardlinks, private parents and canonical paths. Same-UID/root processes remain trusted; this is not a complete hostile-process filesystem boundary. No production secrets were read.

ClawCAD historical provider acceptance is listed separately in migration-map.md. It is not live acceptance of this package. Native OpenClaw hook traversal and external MCP configurations are not protected by mock adapter tests. The deployed agent must leave hosted MCP disabled. REST writes and merge have no exposed execution path.
