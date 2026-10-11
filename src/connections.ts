import type {IncomingMessage,ServerResponse} from 'node:http';
import type {Config,Binding} from './config.ts';
import {connectionOwner} from './config.ts';
import {credentials,privateSecret,assertPrivateFile} from './credentials.ts';
import {Consent} from './oauth.ts';
import type {Tokens} from './oauth.ts';
import {authorizeConnection} from './authorization.ts';
import {state,userError} from './readiness.ts';

export const CALLBACK_PATH='/plugins/claw-onshape/oauth/callback';
type Attempt={consent:Consent;finish:(error?:Error)=>void;accepting:boolean;closing:boolean;callbacks:number;assertCurrent:()=>void;save?:(tokens:Tokens)=>Promise<void>;ref:string};
// One per plugin registration. Private-file locking also excludes CLI attempts.
export function connectionLifecycle(current:()=>Config,stateDir:()=>string,origins:()=>readonly string[],fetcher:typeof fetch=fetch){
  const pending=new Map<string,Attempt>();
  const works=new Map<string,Promise<void>>();
  const outcomes=new Map<string,ReturnType<typeof userError>>();
  const selected=(name:string)=>{const c=current(),bs=c.bindings.filter(b=>b.connectionRef===name);if(!bs.length)throw new Error('not_configured');return {config:c,binding:bs[0]};};
  const unchanged=(b:Binding,c:Config)=>{const n=selected(b.connectionRef);if(JSON.stringify(n.binding)!==JSON.stringify(b)||JSON.stringify(n.config.oauth)!==JSON.stringify(c.oauth))throw new Error('authorization_changed');};
  const status=async(name?:string)=>{
    const c=current();if(!c.bindings.length)return state('not_configured');
    if(!c.oauth)return state('oauth_configuration_required');
    try{assertPrivateFile(c.oauth.clientSecretFile);}catch{return state('oauth_configuration_required');}
    if(!name)return state('disconnected');
    const {binding:b}=selected(name);
    if(pending.has(name))return state('authorization_in_progress');
    const s=await credentials(stateDir(),name,connectionOwner(b));
    const code=s.status();
    if(code==='unavailable')return state('credential_store_unavailable');
    if(code==='expired')return state('reconnect_required');
    if(code==='disconnected')return outcomes.get(name)??state('disconnected');
    if(!b.elementId)return state('target_missing');
    if(!c.liveReads)return state('live_reads_disabled');
    return state('connected'); // Provider accessibility is proven only by inspect/render.
  };
  const start=async(name:string)=>{
    const {config:c,binding:b}=selected(name);
    if(!c.oauth)throw new Error('oauth_configuration_required');
    const redirect=c.oauth.dashboardRedirectUri;
    if(!redirect||!origins().includes(new URL(redirect).origin))throw new Error('dashboard_callback_required');
    if(pending.size)throw new Error('connection_busy_or_state_unavailable');
    let clientSecret:string;try{clientSecret=await privateSecret(c.oauth.clientSecretFile);}catch{throw new Error('oauth_configuration_required');}
    const store=await credentials(stateDir(),name,connectionOwner(b));
    if(pending.size)throw new Error('connection_busy_or_state_unavailable');
    let publish!:(v:{authorizationUrl:string;code:string;message:string})=>void,fail!:(e:Error)=>void;
    const started=new Promise<{authorizationUrl:string;code:string;message:string}>((r,j)=>{publish=r;fail=j;});
    // Set a reservation before awaiting lock acquisition; no secret goes in status.
    const consent=new Consent(c.oauth.clientId,clientSecret,fetcher,Date.now,redirect);
    let attempt:Attempt;
    let terminalError:Error|undefined;
    const done=new Promise<void>((resolve,reject)=>{attempt={consent,accepting:false,closing:false,callbacks:0,assertCurrent:()=>unchanged(b,c),ref:name,finish:e=>{
      if(!attempt.closing){attempt.closing=true;terminalError=e;consent.cancel();}
      if(!attempt.callbacks){terminalError?reject(terminalError):resolve();}
    }};});
    // Attach a rejection consumer before any early cancellation can occur.
    void done.catch(()=>{});
    pending.set(name,attempt!);
    const work=authorizeConnection(store,()=>unchanged(b,c),async save=>{
      attempt!.save=save;outcomes.delete(name);
      const timer=setTimeout(()=>attempt!.finish(new Error('oauth_connect_expired')),300000);
      try{attempt!.accepting=true;publish({...state('authorization_in_progress'),authorizationUrl:consent.authorizationUrl()});await done;}
      finally{clearTimeout(timer);}
    }).catch(e=>{outcomes.set(name,userError(e));fail(new Error(userError(e).code));})
      .finally(()=>{if(pending.get(name)===attempt)pending.delete(name);works.delete(name);});
    works.set(name,work);
    return started;
  };
  const callback=async(req:IncomingMessage,res:ServerResponse)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Type','text/plain; charset=utf-8');
    if(req.method!=='GET'){res.writeHead(405).end('GET required');return;}
    // State chooses the attempt, not a caller-supplied connection reference.
    let a:Attempt|undefined;
    try{const raw=req.url??'';const u=new URL(raw,'http://localhost');const received=u.searchParams.get('state');
      a=[...pending.values()].find(x=>new URL(x.consent.authorizationUrl()).searchParams.get('state')===received && !!received);
      if(!a||!a.accepting||a.closing){a=undefined;throw new Error();}a.accepting=false;a.callbacks++;a.assertCurrent();
      const tokens=await a.consent.complete(raw,req.headers.host??'');
      a.assertCurrent();
      // Complete may settle after timeout; the expired consent must not save tokens.
      if(a.closing)throw new Error('oauth_connect_expired');
      if(!a.save)throw new Error('oauth_connect_expired');await a.save(tokens);
      a.finish();res.end('Onshape connected. Return to the Mechanical Engineer dashboard, refresh status, and retry your request.');
    }catch{a?.finish(new Error('oauth_reconnect_required'));res.writeHead(400).end('Authorization could not be completed. Return to the dashboard and choose Connect Onshape again.');}
    finally{if(a){a.callbacks--;if(a.closing)a.finish();await works.get(a.ref);}}
  };
  const disconnect=async(name:string)=>{if(pending.has(name))throw new Error('connection_busy_or_state_unavailable');const {binding:b}=selected(name);const store=await credentials(stateDir(),name,connectionOwner(b));await store.exclusive(()=>store.save(null));outcomes.delete(name);return state('disconnected');};
  return {status,start,callback,disconnect,cancel:async()=>{for(const a of pending.values())a.finish(new Error('oauth_connect_expired'));await Promise.all(works.values());}};
}
