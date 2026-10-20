import {authorizationSnapshot, matchesAuthorizationSnapshot} from './authorization-snapshot.ts';
import type {Config} from './config.ts';
import {connectionOwner} from './config.ts';
import {credentials} from './credentials.ts';
import {accessToken} from './authorization.ts';
import {publishMcpCredential} from './mcp-credentials.ts';
import {userError} from './readiness.ts';
// Keeps the public code mcp_credential_unavailable while carrying the underlying cause for the log code only.
class McpCredentialUnavailable extends Error {
  readonly underlying: unknown;
  constructor(underlying: unknown) {
    super('mcp_credential_unavailable');
    this.underlying = underlying;
  }
}
export const MCP_TOKEN_SYNC_INTERVAL_MS = 15000;
// Operator-configured maintenance reuses the existing private refresh lock.
// Only the gateway service may create this owner (edge-robot/clawonshape#16): start() runs the initial sync and the
// periodic re-sync, and dispose() publishes null. `warn` receives one bounded line per failure-code change.
export function mcpTokenOwner(current: () => Config, stateDir: () => string, warn: (message: string) => void) {
  let stopped = false,
    active: Promise<void> | undefined,
    timer: ReturnType<typeof setInterval> | undefined,
    lastFailure: string | undefined;
  const sync = (): Promise<void> => {
    if (stopped) {
      return Promise.resolve();
    }
    // biome-ignore lint/nursery/noMisusedPromises: checks whether a sync is in flight, not the Promise result
    if (active) {
      return active;
    }
    active = (async () => {
      const config = current(),
        snapshot = authorizationSnapshot(config),
        m = config.localMcp;
      if (!m) {
        return;
      }
      const b = config.bindings.find((b) => b.connectionRef === m.connectionRef);
      if (!b) {
        throw new Error('invalid_configuration');
      }
      const guard = () => {
        if (stopped || !matchesAuthorizationSnapshot(current(), snapshot)) {
          throw new Error('authorization_changed');
        }
      };
      const store = await credentials(stateDir(), b.connectionRef, connectionOwner(b), m.credentialDirectory);
      try {
        await accessToken(store, config.oauth, guard);
        await store.exclusive(async () => {
          guard();
          await publishMcpCredential(m.credentialDirectory, store.read());
          guard();
        });
      } catch (error) {
        await publishMcpCredential(m.credentialDirectory, null);
        throw new McpCredentialUnavailable(error);
      }
    })().finally(() => {
      active = undefined;
    });
    return active;
  };
  // Status and readiness stay the reporting channel; this only makes failures visible in the gateway log.
  const report = (error: unknown) => {
    const cause = error instanceof McpCredentialUnavailable ? error.underlying : error;
    const code = userError(cause).code;
    if (code === lastFailure) {
      return;
    }
    lastFailure = code;
    try {
      warn(`mcp_credential_unavailable code=${code}`);
    } catch {
      // Diagnostics are best effort; a failing logger must not stop the owner or leak its own error text.
    }
  };
  const run = () =>
    sync().then(() => {
      lastFailure = undefined;
    }, report);
  return {
    sync,
    start: () => {
      if (stopped || timer) {
        return;
      }
      timer = setInterval(() => {
        void run();
      }, MCP_TOKEN_SYNC_INTERVAL_MS);
      timer.unref();
      void run();
    },
    dispose: async () => {
      stopped = true;
      clearInterval(timer);
      await active?.catch(() => {
        // The null publication below is the authoritative cleanup.
      });
      const m = current().localMcp;
      if (m) {
        await publishMcpCredential(m.credentialDirectory, null);
      }
    },
  };
}
