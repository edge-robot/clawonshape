import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir,readFile,writeFile,chmod,symlink,open} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {candidateAuthorization} from '../dist/candidate-authorization.js';
import {credentials} from '../dist/credentials.js';
import {parseConfig} from '../dist/config.js';
import {RestClient} from '../dist/rest.js';
import {candidateAttempts,CANDIDATE_MAX_BYTES,CANDIDATE_MAX_RECORDS} from '../dist/candidate-attempts.js';
import {connectionOwner} from '../dist/config.js';

// Files, bounds, locks and restart receipts are real. Provider calls and the
// native atomic writer (registered in foundation.test.mjs) are mocked, not live.
const D='a'.repeat(24),P='b'.repeat(24),W='c'.repeat(24),E='d'.repeat(24),M='e'.repeat(24),C='f'.repeat(24);
const binding={agentId:'engineer',requesterSenderId:'owner',messageChannel:'discord',agentAccountId:'default',connectionRef:'owner-rest',documentId:D,primaryWorkspaceId:P,workspaceId:W,elementId:E};
const input={sourceMicroversionId:M};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const root=await mkdtemp(path.join(tmpdir(),'onshape-workspace-preparation-'));
test.after(()=>rm(root,{recursive:true,force:true}));
const state=async()=>{const dir=await mkdtemp(path.join(root,'state-'));const store=await credentials(dir,binding.connectionRef,connectionOwner(binding));await store.save({accessToken:'access-DO-NOT-LOG',refreshToken:'refresh-DO-NOT-LOG',expiresAt:Date.now()+3600000,resource:'https://cad.onshape.com/api/',scopes:['OAuth2Read','OAuth2Write']});return dir;};
const readRecord=async(stateDir)=>{
  const dir=path.join(stateDir,'claw-onshape-candidate-attempts'),files=(await readdir(dir)).filter(f=>f.endsWith('.json'));
  assert.equal(files.length,1);const text=await readFile(path.join(dir,files[0]),'utf8');
  assert(Buffer.byteLength(text)<=CANDIDATE_MAX_BYTES);return {record:JSON.parse(text),text,file:path.join(dir,files[0])};
};
function provider(options={}){
  const calls=[];let posts=0;
  const fetcher=async(url,init)=>{
    calls.push({url,method:init.method});const p=new URL(url).pathname;
    if(init.method==='POST'){
      posts++;assert.equal(p,`/api/v10/documents/d/${D}/workspaces`);
      // Repository contract only: provider acceptance of v10 is a separate gate.
      const body=JSON.parse(init.body);
      assert.deepEqual(Object.keys(body).sort(),['microversionId','name']);
      assert.equal(body.microversionId,M);
      if(options.onPost)await options.onPost();
      if(options.mode==='timeout')throw new Error('socket-DO-NOT-LOG');
      if(options.mode==='malformed')return json({});
      if(options.mode==='json')return new Response('provider-DO-NOT-LOG',{headers:{'Content-Type':'application/json'}});
      if(options.mode==='content-type')return new Response('provider-DO-NOT-LOG',{headers:{'Content-Type':'text/plain'}});
      if(options.mode==='foreign')return json({id:C,documentId:'9'.repeat(24)});
      if(options.mode==='missing-document')return json({id:C});
      if(typeof options.mode==='number')return json({error:'provider-DO-NOT-LOG'},options.mode);
      return json({id:C,documentId:D});
    }
    if(p===`/api/v10/documents/${D}`)return json({id:D});
    if(p===`/api/v10/documents/d/${D}/workspaces`){
      if(posts&&options.verificationFailure)throw new Error('verification-DO-NOT-LOG');
      return json([{id:W,documentId:D},{id:P,documentId:D},
        options.missingCandidateDocument?{id:C}:{id:C,documentId:D}]);
    }
    if(p===`/api/v10/partstudios/d/${D}/w/${W}/e/${E}/features`)return json({sourceMicroversion:M,features:Array.from({length:options.featureCount??1},()=>({featureId:'feature-DO-NOT-RETURN'}))});
    if(p===`/api/v10/documents/d/${D}/m/${M}/elements`)return json([{id:E,elementType:'PARTSTUDIO'}]);
    if(p===`/api/v10/documents/d/${D}/w/${W}/currentmicroversion`)return json({microversion:M});
    if(p===`/api/v10/documents/d/${D}/w/${C}/currentmicroversion`)return json({microversion:options.candidateRevision??M});
    throw new Error('Unexpected provider route');
  };
  return {fetcher,calls,get posts(){return posts;}};
}
const client=(stateDir,p,warnings=[],b=binding)=>{const config=parseConfig({bindings:[b],engineerAgentId:b.agentId,liveReads:true,oauth:{clientId:'fixture',clientSecretFile:'/private/fixture',applicationPermissions:{canWriteDocuments:true}}});return new RestClient(async()=>'access-DO-NOT-LOG',p.fetcher,{stateDir,authorization:candidateAuthorization(()=>config,b,stateDir,()=>{}),warn:m=>warnings.push(m)});};

test('creation requires persistent state; malformed/uncertain POSTs remain fenced across restart and changed requests',async()=>{
  const noStore=provider();assert.equal((await new RestClient(async()=>'fixture',noStore.fetcher).prepareCandidateWorkspace(binding,input)).reason,'agent_policy_denied');assert.equal(noStore.calls.length,0);
  for(const mode of ['timeout','malformed','json','content-type',500,408,'foreign','missing-document']){
    const stateDir=await state(),p=provider({mode}),logs=[];
    const result=await client(stateDir,p,logs).prepareCandidateWorkspace(binding,input);
    assert.equal(result.status,'unknown');assert.equal(result.attemptStatus,'UNKNOWN');assert.equal(p.posts,1);
    const {record,text}=await readRecord(stateDir);assert.equal(record.status,'UNKNOWN');assert.equal(record.attemptId,result.attemptId);
    assert(!text.includes('DO-NOT-LOG'));assert(logs.some(m=>m.includes('candidate_outcome_unresolved')));
    const restarted=provider(),again=await client(stateDir,restarted,logs,{...binding,workspaceId:'8'.repeat(24)}).prepareCandidateWorkspace({...binding,workspaceId:'8'.repeat(24)},
      {...input,sourceMicroversionId:'9'.repeat(24),candidateWorkspaceName:'changed-name',replaceCompletedAttemptId:result.attemptId});
    assert.equal(again.attemptId,result.attemptId);assert.equal(again.status,'unknown');assert.equal(restarted.calls.length,0);
    const reconciliation=provider();assert.equal((await client(stateDir,reconciliation).reconcileCandidateWorkspace(binding,result.attemptId)).status,'unknown');assert.equal(reconciliation.calls.length,0);
    assert(logs.some(m=>m.includes('candidate_repeat_blocked')));
    for(const log of logs){assert(!log.includes('DO-NOT-LOG'));assert(!log.includes('\n'));assert.match(log,/^WARNING:/);}
    assert(Buffer.byteLength(JSON.stringify(result))<=CANDIDATE_MAX_BYTES);
  }
});

test('optional provider document fields cannot establish candidate membership or trigger another POST',async()=>{
  const existing=await state(),before=provider({missingCandidateDocument:true});
  await assert.rejects(client(existing,before).prepareCandidateWorkspace(binding,{...input,candidateWorkspaceId:C}),/workspace_not_in_document/);
  assert.equal(before.posts,0);
  const stateDir=await state(),p=provider({missingCandidateDocument:true});
  const result=await client(stateDir,p).prepareCandidateWorkspace(binding,input);
  assert.equal(result.status,'created_unverified');assert.equal(p.posts,1);
  assert.equal((await readRecord(stateDir)).record.status,'CREATED_UNVERIFIED');
  const restart=provider({missingCandidateDocument:true});
  assert.equal((await client(stateDir,restart).reconcileCandidateWorkspace(binding,result.attemptId)).status,'created_unverified');
  assert.equal(restart.posts,0);
  const recovered=provider();
  assert.equal((await client(stateDir,recovered).reconcileCandidateWorkspace(binding,result.attemptId)).status,'ok');
  assert.equal(recovered.posts,0);
});

test('POST cannot run until its UNKNOWN receipt is persisted; concurrent clients cannot duplicate creation',async()=>{
  const stateDir=await state();let release,arrived;
  const gate=new Promise(r=>{release=r;}),entered=new Promise(r=>{arrived=r;});
  const p=provider({onPost:async()=>{const {record}=await readRecord(stateDir);assert.equal(record.status,'UNKNOWN');arrived();await gate;}});
  const first=client(stateDir,p).prepareCandidateWorkspace(binding,input);
  await entered;
  const parallel=provider();
  try{await assert.rejects(client(stateDir,parallel).prepareCandidateWorkspace(binding,input),/candidate_preparation_busy/);assert.equal(parallel.calls.length,0);}finally{release();}
  assert.equal((await first).status,'ok');assert.equal(p.posts,1);
});

test('known candidate IDs survive verification failure and are reconciled by GET only',async()=>{
  const stateDir=await state(),p=provider({verificationFailure:true}),result=await client(stateDir,p).prepareCandidateWorkspace(binding,input);
  assert.equal(result.status,'created_unverified');assert.equal(result.candidateWorkspaceId,C);
  assert.equal((await readRecord(stateDir)).record.status,'CREATED_UNVERIFIED');
  const retry=provider();assert.equal((await client(stateDir,retry).prepareCandidateWorkspace(binding,input)).status,'created_unverified');assert.equal(retry.calls.length,0);
  const wrongRevision=provider({candidateRevision:'9'.repeat(24)});
  assert.equal((await client(stateDir,wrongRevision).reconcileCandidateWorkspace(binding,result.attemptId)).status,'created_unverified');assert.equal(wrongRevision.posts,0);
  const correct=provider();const reconciled=await client(stateDir,correct).reconcileCandidateWorkspace(binding,result.attemptId);
  assert.equal(reconciled.status,'ok');assert.equal(reconciled.created,false);assert.equal(reconciled.attemptId,result.attemptId);assert.equal(correct.posts,0);
  assert.equal((await readRecord(stateDir)).record.status,'VERIFIED');
});

test('receipt persistence failures prevent dispatch or retain the original restart fence',async()=>{
  const before=await state(),p=provider();
  const original=p.fetcher;
  p.fetcher=async(url,init)=>{
    const response=await original(url,init);
    if(new URL(url).pathname===`/api/v10/documents/d/${D}/w/${W}/currentmicroversion`){
      const slot=createHash('sha256').update(JSON.stringify([connectionOwner(binding),D])).digest('hex');
      await writeFile(path.join(before,'claw-onshape-candidate-attempts',slot+'.json'),'invalid',{mode:0o600});
    }
    return response;
  };
  await assert.rejects(client(before,p).prepareCandidateWorkspace(binding,input),/candidate_store_unavailable/);
  assert.equal(p.posts,0);

  const after=await state();let receiptFile;
  const successfulPost=provider({onPost:async()=>{
    receiptFile=(await readRecord(after)).file;await chmod(receiptFile,0o644);
  }});
  const result=await client(after,successfulPost).prepareCandidateWorkspace(binding,input);
  assert.equal(successfulPost.posts,1);assert.equal(result.status,'created_unverified');assert.equal(result.candidateWorkspaceId,C);
  await chmod(receiptFile,0o600);
  assert.equal((await readRecord(after)).record.status,'UNKNOWN');
  const restart=provider();assert.equal((await client(after,restart).prepareCandidateWorkspace(binding,input)).status,'unknown');assert.equal(restart.calls.length,0);
});

test('strict receipt sync errors prevent POST and retain the restart fence, including EPERM',async(t)=>{
  for(const code of ['EPERM','EIO']){
    const stateDir=await state(),probe=await open(path.join(stateDir,'probe'),'w',0o600);
    const prototype=Object.getPrototypeOf(probe),original=prototype.sync;await probe.close();
    let failures=0;
    const mock=t.mock.method(prototype,'sync',async function(){
      if((await this.stat()).isFile()){
        failures++;throw Object.assign(new Error('sync-error-DO-NOT-LOG'),{code});
      }
      return original.call(this);
    });
    const p=provider(),logs=[];
    try{
      await assert.rejects(client(stateDir,p,logs).prepareCandidateWorkspace(binding,input),/^Error: candidate_store_unavailable$/);
      assert.equal(failures,1);assert.equal(p.posts,0);
      assert.equal((await readRecord(stateDir)).record.status,'UNKNOWN');
    }finally{mock.mock.restore();}
    const restarted=provider();
    assert.equal((await client(stateDir,restarted,logs).prepareCandidateWorkspace(binding,input)).status,'unknown');
    assert.equal(restarted.calls.length,0);
    assert(logs.some(line=>line.includes('candidate_repeat_blocked')));
    assert(logs.every(line=>!line.includes('DO-NOT-LOG')));
  }
});

test('strict sync failure after a successful POST preserves a known candidate without a duplicate POST',async(t)=>{
  const stateDir=await state(),probe=await open(path.join(stateDir,'probe'),'w',0o600);
  const prototype=Object.getPrototypeOf(probe),original=prototype.sync;await probe.close();
  let syncs=0;
  const mock=t.mock.method(prototype,'sync',async function(){
    if((await this.stat()).isFile()&&++syncs>1)throw Object.assign(new Error('sync-error-DO-NOT-LOG'),{code:'EPERM'});
    return original.call(this);
  });
  const p=provider(),logs=[];let result;
  try{
    result=await client(stateDir,p,logs).prepareCandidateWorkspace(binding,input);
    assert.equal(result.status,'created_unverified');assert.equal(result.candidateWorkspaceId,C);
    assert.equal(p.posts,1);
    assert.equal((await readRecord(stateDir)).record.status,'CREATED_UNVERIFIED');
  }finally{mock.mock.restore();}
  const restarted=provider();
  assert.equal((await client(stateDir,restarted,logs).prepareCandidateWorkspace(binding,input)).status,'created_unverified');
  assert.equal(restarted.calls.length,0);
  const reconcile=provider();
  assert.equal((await client(stateDir,reconcile,logs).reconcileCandidateWorkspace(binding,result.attemptId)).status,'ok');
  assert.equal(reconcile.posts,0);
});

test('confirmed HTTP denials and conflicts are recorded without automatic retry',async()=>{
  for(const [status,code] of [[401,'reconnect_required'],[403,'provider_forbidden'],[404,'provider_not_found'],[409,'provider_conflict'],[429,'provider_rate_limited']]){
    const stateDir=await state(),p=provider({mode:status});
    await assert.rejects(client(stateDir,p).prepareCandidateWorkspace(binding,input),new RegExp(`^Error: ${code}$`));
    const {record}=await readRecord(stateDir);assert.equal(record.status,'REJECTED');assert.equal(record.code,code);assert.equal(p.posts,1);
    const retry=provider();const blocked=await client(stateDir,retry).prepareCandidateWorkspace(binding,input);
    assert.equal(blocked.status,'unavailable');assert.equal(blocked.reason,'candidate_previous_attempt');assert.equal(retry.calls.length,0);
  }
});

test('completed attempts are reused until their exact ID is explicitly acknowledged; results omit feature lists',async()=>{
  const stateDir=await state(),p=provider({featureCount:1000}),c=client(stateDir,p);
  const first=await c.prepareCandidateWorkspace(binding,input);assert.equal(first.status,'ok');assert.equal(first.created,true);
  assert.deepEqual(first.featureMetadata,{featureCount:1000});assert(!JSON.stringify(first).includes('featureIds'));
  assert(Buffer.byteLength(JSON.stringify(first))<=CANDIDATE_MAX_BYTES);
  const repeated=await c.prepareCandidateWorkspace(binding,input);assert.equal(repeated.created,false);assert.equal(repeated.attemptId,first.attemptId);assert.equal(p.posts,1);
  await assert.rejects(c.prepareCandidateWorkspace(binding,{...input,replaceCompletedAttemptId:randomUUID()}),/candidate_attempt_mismatch/);assert.equal(p.posts,1);
  const second=await c.prepareCandidateWorkspace(binding,{...input,replaceCompletedAttemptId:first.attemptId});assert.equal(second.created,true);assert.notEqual(second.attemptId,first.attemptId);assert.equal(p.posts,2);
  assert.equal((await readdir(path.join(stateDir,'claw-onshape-candidate-attempts'))).length,1);
});

function recordFor(b){
  const now=new Date().toISOString();return {schemaVersion:1,attemptId:randomUUID(),ownerHash:connectionOwner(b),documentId:b.documentId,primaryWorkspaceId:P,sourceWorkspaceId:W,sourceElementId:E,
    sourceMicroversionId:M,requestDigest:'1'.repeat(64),featureCount:1,status:'UNKNOWN',createdAt:now,updatedAt:now};
}
test('private receipt storage enforces capacity, bounded reads, strict schema and restart lock fencing',async()=>{
  const stateDir=await state();
  for(let i=0;i<CANDIDATE_MAX_RECORDS;i++){
    const b={...binding,documentId:i.toString(16).padStart(24,'0')},s=await candidateAttempts(stateDir,b);
    await s.exclusive(r=>r.save(recordFor(b)));
  }
  const fullBinding={...binding,documentId:'7'.repeat(24)},full=await candidateAttempts(stateDir,fullBinding);
  await assert.rejects(full.exclusive(r=>r.save(recordFor(fullBinding))),/candidate_store_full/);
  const dir=path.join(stateDir,'claw-onshape-candidate-attempts'),files=await readdir(dir);assert.equal(files.length,CANDIDATE_MAX_RECORDS);
  const total=(await Promise.all(files.map(f=>readFile(path.join(dir,f))))).reduce((n,b)=>n+b.length,0);assert(total<=CANDIDATE_MAX_BYTES*CANDIDATE_MAX_RECORDS);
  const b={...binding,documentId:'0'.repeat(24)},existing=await candidateAttempts(stateDir,b);
  await existing.exclusive(async r=>{const receipt=await r.read();await assert.rejects(r.save({...receipt,extra:'x'.repeat(4096)}),/candidate_store_unavailable/);await r.save({...receipt,updatedAt:new Date().toISOString()});});
  const filename=createHash('sha256').update(JSON.stringify([connectionOwner(b),b.documentId])).digest('hex')+'.json';
  const valid=await readFile(path.join(dir,filename));await writeFile(path.join(dir,filename),Buffer.alloc(CANDIDATE_MAX_BYTES+1,32));
  await assert.rejects(existing.exclusive(r=>r.read()),/candidate_store_unavailable/);await writeFile(path.join(dir,filename),valid);
  await chmod(path.join(dir,filename),0o644);await assert.rejects(existing.exclusive(r=>r.read()),/candidate_store_unavailable/);await chmod(path.join(dir,filename),0o600);
  await writeFile(path.join(dir,'.lock'),'stale',{mode:0o600});const p=provider();await assert.rejects(client(stateDir,p).prepareCandidateWorkspace(binding,input),/candidate_preparation_busy/);assert.equal(p.calls.length,0);
});

test('symlinked or unsafe receipt state is refused without provider writes',async()=>{
  const stateDir=await state(),target=await state();await symlink(target,path.join(stateDir,'claw-onshape-candidate-attempts'));
  const p=provider();await assert.rejects(client(stateDir,p).prepareCandidateWorkspace(binding,input),/candidate_store_unavailable/);assert.equal(p.calls.length,0);
  const unsafe=await state();await chmod(unsafe,0o755);const other=provider();await assert.rejects(client(unsafe,other).prepareCandidateWorkspace(binding,input),/candidate_store_unavailable/);assert.equal(other.calls.length,0);
});
