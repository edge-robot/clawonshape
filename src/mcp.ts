import {execFile} from 'node:child_process';
import {unknownMcpReadiness} from './readiness.ts';
import type {McpReadiness} from './readiness.ts';
export const MCP_URL='https://fs-mcp.labs.onshape.app/mcp';
export type Capability = {name:string; enabled:false; reason:'mcp_execution_disabled'};
export function filterCatalog(value:unknown):Capability[] {
  const v=value as {tools?:unknown;diagnostics?:unknown};
  if (!v || !Array.isArray(v.tools) || v.tools.length > 256 || !Array.isArray(v.diagnostics) || v.diagnostics.length ||
    v.tools.some(n => typeof n !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(n)) || new Set(v.tools).size !== v.tools.length) throw new Error('mcp_discovery_failed');
  return v.tools.map(name => ({name,enabled:false,reason:'mcp_execution_disabled'}));
}
export function rejectMcpCall(_name:string, _args:unknown):never {throw new Error('mcp_execution_disabled');}
// Operator-only metadata discovery through the verified native CLI, not internal imports.
export async function discover(serverName:string, run:(args:string[])=>Promise<string> = nativeProbe):Promise<Capability[]> {
  if (!/^[a-z][a-z0-9_-]{0,63}$/.test(serverName)) throw new Error('invalid_mcp_server');
  try {return filterCatalog(JSON.parse(await run(['mcp','probe',serverName,'--json'])));}
  catch {throw new Error('mcp_discovery_failed');}
}
async function nativeProbe(args:string[]):Promise<string> {
  return new Promise((resolve,reject) => execFile('openclaw',args,{timeout:20000,maxBuffer:1024*1024},(error,stdout) => {
    if (error) reject(new Error('mcp_discovery_failed')); else resolve(stdout);
  }));
}

const record=(v:unknown):v is Record<string,unknown>=>!!v && typeof v==='object' && !Array.isArray(v);
// Public CLI contract: https://docs.openclaw.ai/cli/mcp/json-output
// status classifies saved configuration without connecting (unlike probe).
// Ignore launch URLs, paths, other servers, diagnostics and all credential fields.
export function projectMcpStatus(value:unknown, now=Date.now()):McpReadiness {
  const result=unknownMcpReadiness();
  if(!record(value)||!Array.isArray(value.servers)||value.servers.length>256||
    value.servers.some(s=>!record(s)||typeof s.name!=='string')||
    new Set(value.servers.map(s=>s.name)).size!==value.servers.length)return result;
  const server=value.servers.find(s=>s.name==='onshape');
  if(!server){result.configured=false;return result;}
  // Native 2026.9.9 computes ok = enabled && transportResolved. A disabled
  // connector therefore has ok:false even when its saved configuration is valid.
  // Neither value proves a current connection; project the independent metadata.
  if(typeof server.configured!=='boolean'||typeof server.enabled!=='boolean'||typeof server.ok!=='boolean')return result;
  result.configured=server.configured;result.enabled=server.enabled;
  if(!server.configured||server.auth!=='oauth'||!record(server.authStatus))return result;
  const auth=server.authStatus;
  if(typeof auth.hasTokens!=='boolean'||typeof auth.requiresAuthorization!=='boolean')return result;
  result.oauth.storedGrant=auth.hasTokens;
  result.oauth.requiresOperatorAction=auth.requiresAuthorization;
  // Native "authorized" means saved tokens, not verified provider access.
  result.oauth.status=!auth.hasTokens?'DISCONNECTED':'UNKNOWN';
  result.oauth.reason=auth.hasTokens
    ?'A native grant is stored; token validity, renewal and provider reachability are unverified.'
    :'No native OAuth grant is stored.';
  if(auth.expiresAt!==undefined){
    if(typeof auth.expiresAt!=='number'||!Number.isSafeInteger(auth.expiresAt)||auth.expiresAt<=0||auth.expiresAt>8640000000000000){
      result.oauth=unknownMcpReadiness().oauth;return result;
    }
    result.oauth.expiresAt=new Date(auth.expiresAt).toISOString();
    result.oauth.expired=auth.expiresAt<=now;
    if(result.oauth.expired){
      result.oauth.requiresOperatorAction=true;
      result.oauth.reason='Stored grant expiry is in the past; native renewal is unverified. No refresh was attempted.';
    }
  }
  return result;
}
export async function mcpReadiness(run:(args:string[])=>Promise<string>=nativeStatus):Promise<McpReadiness> {
  try{
    const raw=await run(['mcp','status','--json']);
    if(Buffer.byteLength(raw)>1024*1024)return unknownMcpReadiness();
    return projectMcpStatus(JSON.parse(raw));
  }catch{return unknownMcpReadiness();}
}
async function nativeStatus(args:string[]):Promise<string> {
  // Native status exceeded five seconds on the pinned host during acceptance.
  return new Promise((resolve,reject)=>execFile('openclaw',args,{timeout:15000,maxBuffer:1024*1024},(error,stdout)=>{
    if(error)reject(new Error('native_mcp_status_unavailable'));else resolve(stdout);
  }));
}
