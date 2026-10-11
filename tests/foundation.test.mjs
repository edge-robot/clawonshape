import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,chmod,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {registerHooks} from 'node:module';
import {parseConfig,bindingFor,validateTarget,connectionOwner} from '../dist/config.js';
import {Consent,AUTHORIZE_URL,TOKEN_URL,REDIRECT_URI,parseTokens} from '../dist/oauth.js';
import {RestClient} from '../dist/rest.js';
import {filterCatalog,discover,rejectMcpCall} from '../dist/mcp.js';
import {credentials,assertPrivateFile} from '../dist/credentials.js';
import plugin from '../dist/index.js';
import {connect} from '../dist/cli.js';

// Only the private-file SDK is mocked. This is NOT a native OpenClaw loader test.
globalThis.__nativeFiles=new Map();
globalThis.__nativeWrites=[];
registerHooks({
  resolve(specifier,context,next) {
    if(specifier==='openclaw/plugin-sdk/secret-file-runtime') return {url:'mock:safe-files',shortCircuit:true};
    return next(specifier,context);
  },
  load(url,context,next) {
    if(url==='mock:safe-files') return {format:'module',shortCircuit:true,source:`
      import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
      import path from 'node:path';
      export function readSecretFileSync(p) {return readFileSync(p,'utf8');}
      export async function writePrivateSecretFileAtomic(options) {
        globalThis.__nativeWrites.push(options);
        mkdirSync(path.dirname(options.filePath),{recursive:true,mode:0o700});
        writeFileSync(options.filePath,options.content,{mode:0o600});
      }
    `};
    return next(url,context);
  }
});
const D='a'.repeat(24),P='b'.repeat(24),W='c'.repeat(24),E='d'.repeat(24);
const binding={agentId:'mechanical-engineer',requesterSenderId:'owner-1',messageChannel:'discord',agentAccountId:'robotics',connectionRef:'owner-rest',documentId:D,primaryWorkspaceId:P,workspaceId:W};
const config=(extra={}) => ({bindings:[binding],liveReads:true,...extra});
const json=(v,status=200) => new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json'}});
const tokens=()=>({accessToken:'fixture-access-DO-NOT-LOG',refreshToken:'fixture-refresh-DO-NOT-LOG',expiresAt:Date.now()+3600000,resource:'https://cad.onshape.com/api/'});
const fixtureStore=async(root)=> {const store=await credentials(root,binding.connectionRef,connectionOwner(binding));await store.save(tokens());return store;};
const capture=(cfg=config()) => {
  let entry={enabled:true,config:cfg};const factories=[],cli=[];
  plugin.register({pluginConfig:cfg,registerTool:(factory,opts)=>factories.push({factory,opts}),registerCli:(f,opts)=>cli.push({f,opts}),runtime:{config:{current:()=>({plugins:{entries:{'claw-onshape':entry}}})},state:{resolveStateDir:()=>'/tmp/fixture-openclaw'}}});
  return {factories,cli,setEntry:v=>{entry=v;}};
};

test('package entry loads; manifest/optional tool/CLI metadata agree (mock registration)',async()=>{
  const pkg=JSON.parse(await readFile('package.json'));
  const manifest=JSON.parse(await readFile('openclaw.plugin.json'));
  assert.deepEqual(pkg.openclaw.extensions,['./dist/index.js']);
  assert.equal(pkg.peerDependencies.openclaw,'2026.9.9');
  assert.equal(plugin.id,manifest.id);
  const host=capture();assert.equal(host.factories.length,1);assert.equal(host.factories[0].opts.optional,true);
  assert.equal(host.factories[0].factory(binding).name,manifest.contracts.tools[0]);
  assert.equal(host.cli[0].opts.descriptors[0].name,manifest.cliCommands[0].name);
  assert.equal(manifest.enabledByDefault,false);
});
test('exact trusted user/agent/channel/account exposure and connection ownership',()=>{
  const factory=capture().factories[0].factory;
  for(const ctx of [{},{...binding,agentId:'robotics-lead'},{...binding,requesterSenderId:'other'},{...binding,messageChannel:'slack'},{...binding,agentAccountId:'other'}]) assert.equal(factory(ctx),null);
  assert.equal(bindingFor(parseConfig(config()),{...binding,sessionKey:'unrelated'}).documentId,D);
  assert.throws(()=>parseConfig(config({bindings:[binding,{...binding,requesterSenderId:'other'}]})),/connection_owner_conflict/);
});
test('strict config denies unknowns, invalid IDs, missing identity, duplicate bindings',()=>{
  for(const bad of [undefined,{},config({secret:'fixture-secret'}),config({liveReads:'true'}),config({bindings:[{...binding,documentId:'../escape'}]}),config({bindings:[{...binding,requesterSenderId:''}]}),config({bindings:[binding,binding]}),config({oauth:{clientId:'x',clientSecretFile:'relative'}})]) assert.throws(()=>parseConfig(bad));
  assert.deepEqual(parseConfig({bindings:[]}).bindings,[]);
  assert.equal(parseConfig({bindings:[]}).liveReads,false);
  const c=parseConfig(config());assert(Object.isFrozen(c.bindings[0]));
});
test('primary rejection, unrelated document/workspace denial, merge and writes disabled',()=>{
  validateTarget(binding,D,W);
  assert.throws(()=>validateTarget(binding,D,P,true),/protected_primary_workspace/);
  assert.throws(()=>validateTarget(binding,E,W,true),/target_denied/);
  assert.throws(()=>validateTarget(binding,D,E),/target_denied/);
  assert.throws(()=>validateTarget(binding,D,W,true),/writes_disabled/);
  // Reads of primary are allowed only when the operator selected it as active.
  validateTarget({...binding,workspaceId:P},D,P);
});
test('REST fixed GET paths and workspace membership; outputs exclude provider text',async()=>{
  const calls=[];const responses=[{id:D,name:tokens().accessToken},[{id:W},{id:P}],[{id:E,name:tokens().accessToken,access_token:'secret'}]];
  const client=new RestClient(async()=>tokens().accessToken,async(url,init)=>{calls.push({url,init});return json(responses.shift());});
  const result=await client.inspect(binding);
  assert.deepEqual(calls.map(c=>c.url),[`https://cad.onshape.com/api/v10/documents/${D}`,`https://cad.onshape.com/api/v10/documents/d/${D}/workspaces`,`https://cad.onshape.com/api/v10/documents/d/${D}/w/${W}/elements`]);
  for(const {init} of calls){assert.equal(init.method,'GET');assert.equal(init.redirect,'error');assert.equal(init.headers.Authorization,`Bearer ${tokens().accessToken}`);assert(init.signal);}
  assert.deepEqual(result,{documentId:D,workspaceId:W,elementIds:[E]});assert(!JSON.stringify(result).includes('fixture-access'));
});
test('REST rejects absent workspace before elements and wrong provider document',async()=>{
  let n=0;const client=new RestClient(async()=>'fixture',async()=>json(++n===1?{id:D}:[{id:P}]));
  await assert.rejects(client.inspect(binding),/workspace_not_in_document/);assert.equal(n,2);
  await assert.rejects(new RestClient(async()=>'fixture',async()=>json({id:E})).inspect(binding),/provider_protocol_error/);
});
test('REST failures are bounded, sanitized and never retried',async()=>{
  for(const [status,error] of [[401,'reconnect_required'],[403,'provider_forbidden'],[404,'provider_not_found'],[429,'provider_rate_limited'],[500,'provider_unavailable']]){
    let calls=0;await assert.rejects(new RestClient(async()=>'fixture',async()=>{calls++;return json({error:'fixture-access'},status);}).inspect(binding),new RegExp(`^Error: ${error}$`));assert.equal(calls,1);
  }
  for(const fetcher of [async()=>{throw Error('fixture-access');},async()=>new Response('fixture-access'),async()=>new Response('not-json',{headers:{'Content-Type':'application/json'}}),async()=>json('x'.repeat(1024*1024))]){
    await assert.rejects(new RestClient(async()=>'fixture',fetcher).inspect(binding),e=>!e.message.includes('fixture-access'));
  }
});
test('OAuth exact authorization and client_secret_post exchange; only REST resource',async()=>{
  let calls=0;const c=new Consent('fixture-client','fixture-client-secret',async(url,init)=>{
    calls++;assert.equal(url,TOKEN_URL);assert.equal(init.method,'POST');assert.equal(init.redirect,'error');
    assert.equal(init.headers['Content-Type'],'application/x-www-form-urlencoded');
    assert.deepEqual(Object.fromEntries(init.body),{grant_type:'authorization_code',code:'fixture-code',client_id:'fixture-client',client_secret:'fixture-client-secret',redirect_uri:REDIRECT_URI});
    return json({access_token:'fixture-access',refresh_token:'fixture-refresh',expires_in:3600,scope:'OAuth2Read',token_type:'Bearer'});
  });
  const u=new URL(c.authorizationUrl());assert.equal(u.origin+u.pathname,AUTHORIZE_URL);assert.equal(u.searchParams.get('scope'),'OAuth2Read');assert.equal(u.searchParams.get('redirect_uri'),REDIRECT_URI);
  const callback='/?'+new URLSearchParams({state:u.searchParams.get('state'),code:'fixture-code'});
  const t=await c.complete(callback,'localhost:8765');assert.equal(t.resource,'https://cad.onshape.com/api/');assert.equal(calls,1);
  await assert.rejects(c.complete(callback,'localhost:8765'),/oauth_callback_invalid/);assert.equal(calls,1);
});
test('OAuth wrong state/host/path/duplicates/expiry/cancellation rejected before fetch',async()=>{
  let calls=0;let now=0;const c=new Consent('client','secret',async()=>{calls++;return json({});},()=>now);
  const state=new URL(c.authorizationUrl()).searchParams.get('state');
  for(const [url,host] of [['/?state=wrong&code=x','localhost:8765'],[`/?state=${state}&state=${state}&code=x`,'localhost:8765'],[`/?state=${state}&code=x&code=y`,'localhost:8765'],[`/?state=${state}&code=x&extra=y`,'localhost:8765'],[`/other?state=${state}&code=x`,'localhost:8765'],[`/?state=${state}&code=x`,'attacker.invalid'],[`/?state=${state}&code=x#fragment`,'localhost:8765']]) await assert.rejects(c.complete(url,host),/oauth_callback_invalid/);
  assert.equal(calls,0);now=300000;await assert.rejects(c.complete(`/?state=${state}&code=x`,'localhost:8765'),/oauth_callback_invalid/);
  const d=new Consent('client','secret');d.cancel();await assert.rejects(d.complete('/?code=x','localhost:8765'));
});
test('OAuth denied consent consumes state, unsafe responses and errors never leak',async()=>{
  for(const response of [()=>json({access_token:'fixture-leak'}),()=>json({error:'fixture-leak'},401),()=>{throw Error('fixture-leak');}]){
    const c=new Consent('client','fixture-secret',async()=>response());const state=new URL(c.authorizationUrl()).searchParams.get('state');
    await assert.rejects(c.complete(`/?state=${state}&code=x`,'localhost:8765'),/^Error: oauth_reconnect_required$/);
    await assert.rejects(c.complete(`/?state=${state}&code=x`,'localhost:8765'),/oauth_callback_invalid/);
  }
  const c=new Consent('client','secret',async()=>assert.fail('no exchange'));const state=new URL(c.authorizationUrl()).searchParams.get('state');
  await assert.rejects(c.complete(`/?state=${state}&error=denied&error_description=fixture-leak`,'localhost:8765'),/^Error: oauth_consent_denied$/);
  await assert.rejects(c.complete(`/?state=${state}&code=x`,'localhost:8765'),/oauth_callback_invalid/);
  for(const extra of [{scope:'OAuth2Read OAuth2Write'},{token_type:'other'},{expires_in:Infinity},{access_token:'a\nb'}]) assert.throws(()=>parseTokens({access_token:'a',refresh_token:'b',expires_in:3600,...extra}),/oauth_response_invalid/);
});
test('MCP native discovery has no REST credentials, every catalog operation disabled',async()=>{
  const names=['create_feature_studio','create_geometry','edit_featurescript_notes','get_api_usage','get_featurescript','list_feature_studios','logout','put_featurescript','read_featurescript_notes','search_featurescript_documentation','set_api_allocation','test_feature','test_featurescript','whoami'];
  const caps=await discover('onshape',async(args)=>{assert.deepEqual(args,['mcp','probe','onshape','--json']);return JSON.stringify({tools:names,diagnostics:[]});});
  assert.equal(caps.length,14);assert(caps.every(t=>t.enabled===false));
  for(const name of [...names,'future_unknown_write']) assert.throws(()=>rejectMcpCall(name,{did:D,wid:P,approval:'human said yes'}),/mcp_execution_disabled/);
  for(const v of [{tools:names,diagnostics:[{message:'fixture-secret'}]},{tools:['bad secret name'],diagnostics:[]},{tools:['same','same'],diagnostics:[]},{}]) assert.throws(()=>filterCatalog(v),/^Error: mcp_discovery_failed$/);
  await assert.rejects(discover('../escape',async()=>assert.fail()),/invalid_mcp_server/);
  await assert.rejects(discover('onshape',async()=>{throw Error('fixture-secret');}),/^Error: mcp_discovery_failed$/);
});
test('credential SDK contract: private atomic storage, resource/expiry, disconnect and reconnect',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'clawonshape-'));
  try{
    const store=await fixtureStore(root);assert.equal(store.read().accessToken,tokens().accessToken);
    const write=globalThis.__nativeWrites.at(-1);assert.equal(write.rootDir,root);assert.equal(write.durable,'file');assert.equal(write.filePath,path.join(root,'claw-onshape','credentials','owner-rest.json'));
    await store.exclusive(()=>store.save(null));assert.throws(()=>store.read(),/^Error: reconnect_required$/);
    await store.exclusive(()=>store.save(tokens()));assert(store.read());
    await store.save({...tokens(),expiresAt:0});assert.throws(()=>store.read(),/reconnect_required/);
    await store.save({...tokens(),resource:'https://fs-mcp.labs.onshape.app/mcp'});assert.throws(()=>store.read(),/reconnect_required/);
    await assert.rejects(credentials(root,'../escape',connectionOwner(binding)),/invalid_connection/);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('connection lifecycle lock refuses overlapping connect/disconnect and releases after failure',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'clawonshape-'));try{
    const store=await credentials(root,'owner-rest',connectionOwner(binding));let release;let started;
    const ready=new Promise(resolve=>{started=resolve;});
    const pending=store.exclusive(async()=>{started();await new Promise(resolve=>{release=resolve;});});await ready;
    await assert.rejects(store.exclusive(()=>store.save(null)),/connection_busy_or_state_unavailable/);
    release();await pending;
    await assert.rejects(store.exclusive(async()=>{throw Error('synthetic');}),/synthetic/);
    await store.exclusive(()=>store.save(null));
  }finally{await rm(root,{recursive:true,force:true});}
});
test('private credential/app files reject relaxed modes, symlinks and public parent directories',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'clawonshape-'));const file=path.join(root,'secret');
  try{
    await writeFile(file,'fixture-secret',{mode:0o600});assertPrivateFile(file);
    await chmod(file,0o644);assert.throws(()=>assertPrivateFile(file),/private_file_required/);
    await chmod(file,0o600);const link=path.join(root,'link');await symlink(file,link);assert.throws(()=>assertPrivateFile(link),/private_file_required/);
    await chmod(root,0o755);assert.throws(()=>assertPrivateFile(file),/private_file_required/);
    await chmod(root,0o700);
    const store=await fixtureStore(root);const credential=path.join(root,'claw-onshape','credentials','owner-rest.json');
    await chmod(credential,0o644);assert.throws(()=>store.read(),/^Error: reconnect_required$/);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('credential owner binding survives config reload and rejects reassigned connection references',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'clawonshape-'));
  try{
    await fixtureStore(root);
    const another=await credentials(root,binding.connectionRef,connectionOwner({...binding,requesterSenderId:'different-owner'}));
    assert.throws(()=>another.read(),/^Error: reconnect_required$/);
    const restored=await credentials(root,binding.connectionRef,connectionOwner(binding));assert(restored.read());
  }finally{await rm(root,{recursive:true,force:true});}
});
test('mock listener binds loopback, and timeout drains in-flight exchange before releasing lifecycle',async(t)=>{
  t.mock.timers.enable({apis:['setTimeout']});
  let handler,releaseExchange,cancelled=false,closed=false,saved=false;
  const consent={authorizationUrl:()=>AUTHORIZE_URL,complete:()=>new Promise(resolve=>{releaseExchange=resolve;}),cancel:()=>{cancelled=true;}};
  const factory=fn=>{handler=fn;return {on(){},listen(port,host,ready){assert.equal(port,8765);assert.equal(host,'127.0.0.1');ready();},close(){closed=true;}};};
  const connection=connect(consent,async()=>{saved=true;},factory,()=>{});
  let settled=false;const outcome=connection.then(()=>{settled=true;return 'ok';},e=>{settled=true;return e.message;});
  const headers={};const res={setHeader(k,v){headers[k]=v;},writeHead(){return this;},end(){}};
  const request=handler({method:'GET',url:'/?state=fixture&code=fixture',headers:{host:'localhost:8765'}},res);
  t.mock.timers.tick(300000);await Promise.resolve();
  assert.equal(settled,false);assert(closed);assert(cancelled);
  releaseExchange(tokens());await request;
  assert.equal(await outcome,'oauth_connect_expired');assert.equal(saved,false);
  assert.equal(headers['Cache-Control'],'no-store');assert.equal(headers['Referrer-Policy'],'no-referrer');
});
test('tool execution rechecks authorization and arguments before credential/network access',async()=>{
  const host=capture();const tool=host.factories[0].factory(binding);
  assert.equal((await tool.execute('call',{workspaceId:P})).details.error,'invalid_arguments');
  host.setEntry({enabled:true,config:config({liveReads:false})});assert.equal((await tool.execute('call',{})).details.error,'live_reads_disabled');
  host.setEntry({enabled:true,config:config({bindings:[]})});assert.equal((await tool.execute('call',{})).details.error,'authorization_changed');
  host.setEntry({enabled:false,config:config()});assert.equal((await tool.execute('call',{})).details.error,'authorization_changed');
});
test('mock integration: registered authorized tool -> private credential -> REST, no token in result',async()=>{
  await fixtureStore('/tmp/fixture-openclaw');const host=capture();const tool=host.factories[0].factory({...binding,assertInvocationCurrent:()=>{}});
  const previous=globalThis.fetch;let n=0;globalThis.fetch=async()=>json([{id:D},[{id:W},{id:P}],[{id:E,name:tokens().accessToken}]][n++]);
  try{const result=await tool.execute('call',{});assert.deepEqual(result.details,{documentId:D,workspaceId:W,elementIds:[E]});assert(!JSON.stringify(result).includes('fixture-access'));assert.equal(n,3);}finally{globalThis.fetch=previous;}
});
test('mock integration: revocation during REST blocks final result',async()=>{
  await fixtureStore('/tmp/fixture-openclaw');const host=capture();const tool=host.factories[0].factory(binding);const previous=globalThis.fetch;let n=0;
  globalThis.fetch=async()=>{n++;if(n===3)host.setEntry({enabled:true,config:config({bindings:[]})});return json(n===1?{id:D}:n===2?[{id:W},{id:P}]:[{id:E}]);};
  try{assert.equal((await tool.execute('call',{})).details.error,'authorization_changed');}finally{globalThis.fetch=previous;}
});
