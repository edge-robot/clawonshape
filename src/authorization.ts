import type {credentials} from './credentials.ts';
import type {Tokens} from './oauth.ts';
import type {OAuthScope} from './oauth.ts';
import {OAUTH_SCOPE_READ} from './oauth.ts';
import {parseTokens,TOKEN_URL} from './oauth.ts';
import {privateSecret} from './credentials.ts';
import type {Config} from './config.ts';
import {jsonRequest} from './http.ts';

// Same private store/lock as consent and disconnect. Never retry an uncertain
// refresh: persist denial before exchange so a crash cannot replay a rotated token.
export async function accessToken(store:Awaited<ReturnType<typeof credentials>>,oauth:Config['oauth'],guard:()=>void,fetcher:typeof fetch=fetch):Promise<string>{
  guard();
  if(oauth?.applicationPermissions?.canReadDocuments===false)throw new Error('app_permission_read_disabled');
  const readToken=(tokens:Tokens)=>{if(!tokens.scopes.includes(OAUTH_SCOPE_READ))throw new Error('oauth_read_scope_missing');return tokens.accessToken;};
  if(store.status()==='connected')return readToken(store.read());
  return store.exclusive(async()=>{
    guard();
    if(store.status()==='connected')return readToken(store.read());
    const previous=store.read(true);
    readToken(previous);
    if(!oauth)throw new Error('oauth_configuration_required');
    const clientSecret=await privateSecret(oauth.clientSecretFile);
    guard();await store.save(null);
    try{
      const value=await jsonRequest(fetcher,TOKEN_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:previous.refreshToken,client_id:oauth.clientId,client_secret:clientSecret})});
      const requiredScopes:readonly OAuthScope[]=(previous.scopes?.length?previous.scopes:[OAUTH_SCOPE_READ]);
      let tokens:Tokens;try{tokens=parseTokens(value,Date.now(),requiredScopes,'refresh');}catch{throw new Error('oauth_refresh_response_invalid');}
      guard();await store.save(tokens);return readToken(tokens);
    }catch(e){
      if(e instanceof Error&&['authorization_changed','oauth_refresh_response_invalid'].includes(e.message))throw e;
      if(e instanceof Error&&e.message==='reconnect_required')throw new Error('oauth_refresh_rejected');
      throw new Error('reconnect_required');
    }
  });
}
// CLI listener and dashboard callback are adapters around this same lifecycle.
export async function authorizeConnection(store:Awaited<ReturnType<typeof credentials>>,guard:()=>void,
  transport:(save:(tokens:Tokens)=>Promise<void>)=>Promise<void>):Promise<void>{
  await store.exclusive(async()=>{
    guard();await store.save(null);
    await transport(async tokens=>{guard();await store.save(tokens);});
  });
}
