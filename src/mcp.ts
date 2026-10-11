import {execFile} from 'node:child_process';
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
