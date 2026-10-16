import {authorizationSnapshot, matchesAuthorizationSnapshot} from './authorization-snapshot.ts';
import type {Config} from './config.ts';
import {connectionOwner} from './config.ts';
import {credentials} from './credentials.ts';
import {accessToken} from './authorization.ts';
import {publishMcpCredential} from './mcp-credentials.ts';
// Operator-configured maintenance reuses the existing private refresh lock.
export function mcpTokenOwner(current: () => Config, stateDir: () => string) {
  let stopped = false,
    active: Promise<void> | undefined;
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
      } catch {
        await publishMcpCredential(m.credentialDirectory, null);
        throw new Error('mcp_credential_unavailable');
      }
    })().finally(() => {
      active = undefined;
    });
    return active;
  };
  const timer = setInterval(() => {
    // biome-ignore lint/suspicious/noEmptyBlockStatements: TODO(#9): periodic MCP credential sync failure is swallowed without log or status
    void sync().catch(() => {});
  }, 15000);
  timer.unref();
  return {
    sync,
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
