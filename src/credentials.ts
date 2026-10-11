import path from 'node:path';
import {open,lstat,realpath,unlink} from 'node:fs/promises';
import {lstatSync,realpathSync} from 'node:fs';
import {ref} from './config.ts';
import type {Tokens} from './oauth.ts';
export function assertPrivateFile(filePath:string):void {
  const file=lstatSync(filePath),dir=lstatSync(path.dirname(filePath));
  if(!path.isAbsolute(filePath) || !file.isFile() || file.isSymbolicLink() || file.nlink!==1 || file.uid!==process.getuid?.() ||
    (file.mode & 0o077) || !dir.isDirectory() || dir.isSymbolicLink() || dir.uid!==process.getuid?.() || (dir.mode & 0o077) ||
    realpathSync(filePath)!==filePath) throw new Error('private_file_required');
}
export async function privateSecret(filePath:string):Promise<string> {
  try{assertPrivateFile(filePath);const native=await import('openclaw/plugin-sdk/secret-file-runtime');
    const value=native.readSecretFileSync(filePath,'Claw-Onshape private secret',{rejectSymlink:true}).trim();
    if(!value||value.length>8192||/\s/.test(value))throw new Error();return value;
  }catch{throw new Error('private_secret_unavailable');}
}
// Native host helpers own permission, symlink and atomic-file handling.
export async function credentials(stateDir:string, connectionRef:string, owner:string) {
  if (!ref(connectionRef) || !path.isAbsolute(stateDir) || !/^[a-f0-9]{64}$/.test(owner)) throw new Error('invalid_connection');
  const filePath=path.join(stateDir,'claw-onshape','credentials',`${connectionRef}.json`);
  const native=await import('openclaw/plugin-sdk/secret-file-runtime');
  const exclusive=async <T>(action:()=>Promise<T>):Promise<T> => {
    // Hold through an entire consent attempt; disconnect never reports success while
    // an outstanding callback could subsequently restore the connection.
    const lockPath=path.join(stateDir,`.claw-onshape-${connectionRef}.lock`);
    let lock;
    try {
      const root=await lstat(stateDir);
      if(!root.isDirectory() || root.isSymbolicLink() || (root.mode & 0o077) || root.uid !== process.getuid?.() || await realpath(stateDir)!==stateDir) throw new Error();
      lock=await open(lockPath,'wx',0o600);
    } catch {throw new Error('connection_busy_or_state_unavailable');}
    try{return await action();}finally{await lock.close();await unlink(lockPath);}
  };
  return {
    exclusive,
    async save(tokens:Tokens | null):Promise<void> {
      try {await native.writePrivateSecretFileAtomic({rootDir:stateDir,filePath,content:JSON.stringify({owner,tokens}),durable:'file'});}
      catch {throw new Error('credential_store_unavailable');}
    },
    status(): 'disconnected'|'expired'|'connected'|'unavailable' {
      try{assertPrivateFile(filePath);const r=JSON.parse(native.readSecretFileSync(filePath,'Onshape connection',{rejectSymlink:true}));
        if(r.owner!==owner)return 'unavailable';if(r.tokens===null)return 'disconnected';
        if(r.tokens?.resource!=='https://cad.onshape.com/api/'||typeof r.tokens?.accessToken!=='string'||!r.tokens.accessToken||/\s/.test(r.tokens.accessToken)||!Number.isFinite(r.tokens.expiresAt))return 'unavailable';
        return r.tokens.expiresAt<=Date.now()+30000?'expired':'connected';
      }catch(e){try{lstatSync(filePath);return 'unavailable';}catch{return 'disconnected';}}
    },
    read(allowExpired=false):Tokens {
      try {
        assertPrivateFile(filePath);
        const record=JSON.parse(native.readSecretFileSync(filePath,'Onshape connection',{rejectSymlink:true})) as {owner:string;tokens:Tokens};
        if(record.owner!==owner) throw new Error();
        const t=record.tokens;
        if (!t || t.resource !== 'https://cad.onshape.com/api/' || typeof t.accessToken !== 'string' || !t.accessToken || /\s/.test(t.accessToken) ||
          typeof t.refreshToken !== 'string' || !t.refreshToken || /\s/.test(t.refreshToken) ||
          !Number.isFinite(t.expiresAt) || (!allowExpired && t.expiresAt <= Date.now()+30000)) throw new Error();
        return t;
      } catch {throw new Error('reconnect_required');}
    }
  };
}
