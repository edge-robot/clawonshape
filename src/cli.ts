import {createServer} from 'node:http';
import {Consent} from './oauth.ts';
import {credentials,assertPrivateFile} from './credentials.ts';
import {discover,MCP_URL} from './mcp.ts';
import type {OpenClawPluginApi} from 'openclaw/plugin-sdk/core';
import {connectionOwner} from './config.ts';
import type {Config} from './config.ts';
export async function connect(consent:Consent, save:(tokens:Awaited<ReturnType<Consent['complete']>>)=>Promise<void>,
  serverFactory:typeof createServer=createServer, publish:(url:string)=>void=url=>process.stdout.write(`Open this URL in your browser:\n${url}\n`)):Promise<void> {
  let timer:ReturnType<typeof setTimeout>;
  await new Promise<void>((resolve,reject) => {
    let finishing=false,settled=false,pending=0;let failure:Error | undefined;
    const finish=(error?:Error) => {
      if(!finishing){finishing=true;failure=error;clearTimeout(timer);consent.cancel();server.close();}
      // Keep the lifecycle lock until every admitted callback finishes. A timeout
      // must not release it while an atomic credential save can still complete.
      if(pending || settled) return;
      settled=true;if(failure) reject(failure);else resolve();
    };
    const server=serverFactory(async(req,res) => {
      res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
      if (req.method !== 'GET') {res.writeHead(405).end('GET required');return;}
      if(finishing){res.writeHead(410).end('Reconnect from the CLI.');return;}
      pending++;
      try {
        const tokens=await consent.complete(req.url ?? '',req.headers.host ?? '');
        if(finishing) throw new Error('oauth_connect_expired');
        await save(tokens);res.end('Connected. Close this tab.');finish();
      }
      catch {res.writeHead(400).end('Connection failed. Reconnect from the CLI.');finish(new Error('oauth_reconnect_required'));}
      finally{pending--;if(finishing)finish();}
    });
    server.on('error',() => finish(new Error('oauth_listener_unavailable')));
    server.listen(8765,'127.0.0.1',() => publish(consent.authorizationUrl()));
    timer=setTimeout(() => finish(new Error('oauth_connect_expired')),300000);
  });
}
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
      const native=await import('openclaw/plugin-sdk/secret-file-runtime');
      let clientSecret:string;
      try{assertPrivateFile(config.oauth.clientSecretFile);clientSecret=native.readSecretFileSync(config.oauth.clientSecretFile,'Onshape app secret',{rejectSymlink:true}).trim();}catch{throw new Error('client_secret_unavailable');}
      if(!clientSecret || /\s/.test(clientSecret)) throw new Error('client_secret_unavailable');
      // Invalidate old access before starting consent. Failed reconnect leaves no usable connection.
      await store.exclusive(async() => {
        await store.save(null);
        await connect(new Consent(config.oauth!.clientId,clientSecret),tokens => store.save(tokens));
      });
    });
    root.command('mcp-discover <server>').option('--live','Authorize native MCP metadata requests',false).action(async(name:string,opts:{live?:boolean}) => {
      if(!opts.live) throw new Error('explicit_live_authorization_required');
      const cfg=api.runtime.config.current();const server=cfg.mcp?.servers?.[name];
      if(server?.url!==MCP_URL || server.auth!=='oauth' || server.enabled===false) throw new Error('mcp_configuration_required');
      process.stdout.write(JSON.stringify(await discover(name))+'\n');
    });
  },{descriptors:[{name:'onshape',description:'Manage Onshape connections',hasSubcommands:true}]});
}
