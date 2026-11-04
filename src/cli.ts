import {sameAuthorizationConfig} from './authorization-snapshot.ts';
import {connect} from './oauth-listener.ts';
export {connect} from './oauth-listener.ts';
import {Consent} from './oauth.ts';
import type {OAuthScope} from './oauth.ts';
import {OAUTH_SCOPE_READ, OAUTH_SCOPE_WRITE} from './oauth.ts';
import {credentials, privateSecret} from './credentials.ts';
import {discover, MCP_URL} from './mcp.ts';
import type {OpenClawPluginApi} from 'openclaw/plugin-sdk/core';
import {connectionOwner} from './config.ts';
import type {Config} from './config.ts';
import {parseConfig} from './config.ts';
import {capabilitySummary} from './capabilities.ts';
import {authorizeConnection} from './authorization.ts';
export function registerCli(api: OpenClawPluginApi, config: Config): void {
  api.registerCli(
    ({program}) => {
      const root = program.command('onshape').description('Operator Onshape connection management');
      const selected = (name: string) => {
        const b = config.bindings.find((b) => b.connectionRef === name);
        if (!b) {
          throw new Error('unknown_connection');
        }
        // No handoff directory: CLI processes never publish or revoke access-token.json (edge-robot/clawonshape#16).
        // The gateway's token owner publishes a new grant, or null after disconnect, at its next sync (≤ 15 s).
        return credentials(api.runtime.state.resolveStateDir(), name, connectionOwner(b));
      };
      root.command('status <connection>').action(async (name: string) => {
        let connected = false,
          grantedScopes: readonly string[] | undefined;
        try {
          const store = await selected(name);
          grantedScopes = store.read(true).scopes;
          store.read();
          connected = true;
        } catch {
          // An unreadable credential store is reported as not connected (fail closed).
        }
        const binding = config.bindings.find((b) => b.connectionRef === name);
        process.stdout.write(
          `${JSON.stringify({
            connected,
            accountBinding: 'not_verified',
            refresh: 'implemented',
            grantedScopes,
            capabilities: capabilitySummary({config, binding, connected, grantedScopes}),
          })}\n`,
        );
      });
      root.command('disconnect <connection>').action(async (name: string) => {
        const store = await selected(name);
        await store.exclusive(() => store.save(null));
        process.stdout.write('Disconnected locally. Revoke the grant in Onshape settings if needed.\n');
      });
      root
        .command('connect <connection>')
        .option('--live', 'Authorize browser consent and token exchange', false)
        .option('--rest-write', 'Request explicit REST write scope (OAuth2Write) in addition to read', false)
        .action(async (name: string, opts: {live?: boolean; restWrite?: boolean}) => {
          if (!opts.live) {
            throw new Error('explicit_live_authorization_required');
          }
          if (!config.oauth) {
            throw new Error('oauth_configuration_required');
          }
          if (opts.restWrite && config.oauth.applicationPermissions.canWriteDocuments !== true) {
            throw new Error(
              config.oauth.applicationPermissions.canWriteDocuments === false
                ? 'app_permission_write_disabled'
                : 'app_permission_write_unknown',
            );
          }
          const store = await selected(name);
          const clientSecret = await privateSecret(config.oauth.clientSecretFile);
          // Invalidate old access before starting consent. Failed reconnect leaves no usable connection.
          const guard = () => {
            const entry = api.runtime.config.current().plugins?.entries?.['claw-onshape'];
            if (entry?.enabled !== true) {
              throw new Error('authorization_changed');
            }
            const c = parseConfig(entry.config);
            if (!sameAuthorizationConfig(c, config)) {
              throw new Error('authorization_changed');
            }
          };
          const requestedScopes: OAuthScope[] = [OAUTH_SCOPE_READ];
          if (opts.restWrite) {
            requestedScopes.push(OAUTH_SCOPE_WRITE);
          }
          await authorizeConnection(store, guard, (save) =>
            connect(
              // biome-ignore lint/style/noNonNullAssertion: TODO(#9): invariant not provable locally; replace with an explicit fail-closed check
              new Consent(config.oauth!.clientId, clientSecret, fetch, Date.now, undefined, requestedScopes),
              save,
            ),
          );
        });
      root
        .command('mcp-discover <server>')
        .option('--live', 'Authorize native MCP metadata requests', false)
        .action(async (name: string, opts: {live?: boolean}) => {
          if (!opts.live) {
            throw new Error('explicit_live_authorization_required');
          }
          const cfg = api.runtime.config.current();
          const server = cfg.mcp?.servers?.[name];
          if (server?.url !== MCP_URL || server.auth === 'oauth' || server.enabled === false) {
            throw new Error('mcp_configuration_required');
          }
          process.stdout.write(`${JSON.stringify(await discover(name))}\n`);
        });
    },
    {descriptors: [{name: 'onshape', description: 'Manage Onshape connections', hasSubcommands: true}]},
  );
}
