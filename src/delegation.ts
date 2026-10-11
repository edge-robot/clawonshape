import {createHash,createHmac,randomBytes,timingSafeEqual,randomUUID} from 'node:crypto';
import type {Config,Binding,Identity} from './config.ts';
import {bindingFor,channelMatches} from './config.ts';
import {privateSecret} from './credentials.ts';
import {assertPrivateFile} from './credentials.ts';
import {readFileSync} from 'node:fs';
import {jsonRequest} from './http.ts';

const ENDPOINT='http://clawcad-mechanical-engineer:18789/a2a/v1';
export const bindingDigest=(b:Binding)=>createHash('sha256').update(JSON.stringify(b)).digest('hex').slice(0,32);
const mac=(key:string,payload:string)=>createHmac('sha256',Buffer.from(key,'hex')).update(payload).digest('hex');
export async function delegationKey(c:Config){if(!c.delegation)throw new Error('delegation_denied');const key=await privateSecret(c.delegation.keyFile);if(!/^[a-f0-9]{64}$/.test(key))throw new Error('delegation_denied');return key;}
export function delegationKeySync(c:Config){if(!c.delegation)throw new Error('delegation_denied');assertPrivateFile(c.delegation.keyFile);const key=readFileSync(c.delegation.keyFile,'utf8').trim();if(!/^[a-f0-9]{64}$/.test(key))throw new Error('delegation_denied');return key;}
export function mintContext(b:Binding,key:string,now=Date.now()){
  if(!/^[a-f0-9]{64}$/.test(key))throw new Error('delegation_denied');
  const prefix=`cos1-${Math.floor((now+300000)/1000).toString(16).padStart(8,'0')}-${randomBytes(8).toString('hex')}-${bindingDigest(b)}`;
  return `${prefix}-${mac(key,prefix)}`; // exactly 128 lowercase characters, native A2A limit
}
export function verifyContext(c:Config,ctx:Identity,key:string,now=Date.now()):{binding:Binding;contextId:string}|undefined{
  const d=c.delegation;
  if(!d||ctx.agentId!==d.engineerAgentId||ctx.messageChannel!=='a2a'||ctx.requesterSenderId!==d.peerSenderId||ctx.agentAccountId!==d.accountId||!ctx.sessionKey)return;
  const prefix=`agent:${d.engineerAgentId}:a2a:${d.accountId}:direct:${d.peerSenderId}:`;
  if(!ctx.sessionKey.startsWith(prefix))return;
  const contextId=ctx.sessionKey.slice(prefix.length);
  const m=/^(cos1-([a-f0-9]{8})-[a-f0-9]{16}-([a-f0-9]{32}))-([a-f0-9]{64})$/.exec(contextId);
  if(!m||! /^[a-f0-9]{64}$/.test(key))return;
  const expiry=parseInt(m[2],16)*1000;if(expiry<=now||expiry>now+301000)return;
  if(!timingSafeEqual(Buffer.from(m[4],'hex'),Buffer.from(mac(key,m[1]),'hex')))return;
  const binding=c.bindings.find(b=>b.agentId===d.engineerAgentId && bindingDigest(b)===m[3]);
  return binding?{binding,contextId}:undefined;
}
export function authorizedBinding(c:Config,ctx:Identity):{binding:Binding;contextId?:string}|undefined{
  const direct=bindingFor(c,ctx);if(direct)return {binding:direct};
  if(!c.delegation||ctx.messageChannel!=='a2a')return;
  try{return verifyContext(c,ctx,delegationKeySync(c));}catch{return;}
}
export function leadBinding(c:Config,ctx:Identity):Binding|undefined{
  const d=c.delegation;if(!d||ctx.agentId!==d.leadAgentId||ctx.messageChannel!=='discord')return;
  return c.bindings.find(b=>b.agentId===d.engineerAgentId&&b.requesterSenderId===ctx.requesterSenderId&&b.messageChannel===ctx.messageChannel&&b.agentAccountId===ctx.agentAccountId&&channelMatches(b,ctx));
}
export function signResult(value:object,contextId:string,key:string){return mac(key,`${contextId}\n${JSON.stringify(value,Object.keys(value).sort())}`);}
export function verifyResult(value:object,contextId:string,key:string,proof:unknown){return typeof proof==='string' && /^[a-f0-9]{64}$/.test(proof)&&timingSafeEqual(Buffer.from(proof,'hex'),Buffer.from(signResult(value,contextId,key),'hex'));}
// Fixed A2A operation, not a generic RPC passthrough. Secrets never enter agent text.
export async function delegateRender(c:Config,b:Binding,guard:()=>void,fetcher:typeof fetch=fetch,wait=(ms:number)=>new Promise(r=>setTimeout(r,ms))){
  if(!c.delegation)throw new Error('delegation_denied');
  const key=await delegationKey(c),token=c.delegation.transportTokenFile?await privateSecret(c.delegation.transportTokenFile):process.env.A2A_LEAD_TO_MECHANICAL,contextId=mintContext(b,key);
  if(!token||/\s/.test(token))throw new Error('delegation_denied');
  const rpc=async(method:string,params:object)=>{guard();const r=await jsonRequest(fetcher,ENDPOINT,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:randomUUID(),method,params})}) as {error?:unknown;result?:{task?:unknown}};
    if(r.error)throw new Error('delegation_denied');return (r.result?.task??r.result) as {id?:string;contextId?:string;status?:{state?:string};artifacts?:{parts?:{text?:unknown}[]}[]};};
  let task=await rpc('SendMessage',{configuration:{returnImmediately:true},message:{messageId:randomUUID(),contextId,role:'ROLE_USER',parts:[{text:'Use onshape_render to show the configured Camera Mount Plate. If unavailable, use onshape_status. Return the complete tool details as one plain JSON object in your final A2A answer, including delegationProof when present. Do not send a message or start another task.'}]}});
  if(!task?.id||task.contextId!==contextId)throw new Error('delegation_denied');const taskId=task.id;
  for(let n=0;n<45&&['TASK_STATE_WORKING','TASK_STATE_SUBMITTED'].includes(task.status?.state??'');n++){await wait(2000);task=await rpc('GetTask',{id:taskId});if(task?.id!==taskId||task.contextId!==contextId)throw new Error('delegation_denied');}
  guard();if(task.status?.state!=='TASK_STATE_COMPLETED')throw new Error('provider_unavailable');
  const parts=task.artifacts?.flatMap(a=>a.parts??[])??[];
  if(parts.length!==1||typeof parts[0].text!=='string'||parts[0].text.length>16000)throw new Error('delegation_result_invalid');
  let report:Record<string,unknown>;try{report=JSON.parse(parts[0].text);}catch{throw new Error('delegation_result_invalid');}
  if(!report||typeof report!=='object'||Array.isArray(report))throw new Error('delegation_result_invalid');
  const {delegationProof,...details}=report;if(!verifyResult(details,contextId,key,delegationProof))throw new Error('delegation_result_invalid');
  return details;
}
