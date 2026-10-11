import {connect} from './oauth-listener.ts';
export {connect} from './oauth-listener.ts';
import {Consent} from './oauth.ts';
import {credentials,privateSecret} from './credentials.ts';
import {discover,MCP_URL} from './mcp.ts';
import type {OpenClawPluginApi} from 'openclaw/plugin-sdk/core';
import {connectionOwner} from './config.ts';
import type {Config} from './config.ts';
import {parseConfig} from './config.ts';
import {authorizeConnection} from './authorization.ts';
export function registerCli(api:OpenClawPluginApi, config:Config):void {
  api.registerCli(({program}) => {
    const root=program.command('onshape').description('Operator Onshape connection management');
    const selected=(name:string) => {
      const b=config.bindings.find(b => b.connectionRef===name);if(!b) throw new Error('unknown_connection');
      return credentials(api.runtime.state.resolveStateDir(),name,connectionOwner(b));
    };
    root.command('status <connection>').action(async(name:string) => {
      let connected=false;try{(await selected(name)).read();connected=true;}catch{}
      process.stdout.write(JSON.stringify({connected,accountBinding:'not_verified',refresh:'not_implemented',writes:false})+'\n');
    });
    root.command('disconnect <connection>').action(async(name:string) => {
      const store=await selected(name);await store.exclusive(() => store.save(null));process.stdout.write('Disconnected locally. Revoke the grant in Onshape settings if needed.\n');
    });
    root.command('connect <connection>').option('--live','Authorize browser consent and token exchange',false).action(async(name:string,opts:{live?:boolean}) => {
      if(!opts.live) throw new Error('explicit_live_authorization_required');
      if(!config.oauth) throw new Error('oauth_configuration_required');
      const store=await selected(name);
      const clientSecret=await privateSecret(config.oauth.clientSecretFile);
      // Invalidate old access before starting consent. Failed reconnect leaves no usable connection.
      const guard=()=>{const entry=api.runtime.config.current().plugins?.entries?.['claw-onshape'];if(entry?.enabled!==true)throw new Error('authorization_changed');const c=parseConfig(entry.config);if(JSON.stringify(c)!==JSON.stringify(config))throw new Error('authorization_changed');};
      await authorizeConnection(store,guard,save=>connect(new Consent(config.oauth!.clientId,clientSecret),save));
    });
    root.command('mcp-discover <server>').option('--live','Authorize native MCP metadata requests',false).action(async(name:string,opts:{live?:boolean}) => {
      if(!opts.live) throw new Error('explicit_live_authorization_required');
      const cfg=api.runtime.config.current();const server=cfg.mcp?.servers?.[name];
      if(server?.url!==MCP_URL || server.auth!=='oauth' || server.enabled===false) throw new Error('mcp_configuration_required');
      process.stdout.write(JSON.stringify(await discover(name))+'\n');
    });
  },{descriptors:[{name:'onshape',description:'Manage Onshape connections',hasSubcommands:true}]});
}
