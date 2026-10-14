import test from 'node:test';
import assert from 'node:assert/strict';
import {parseConfig} from '../dist/config.js';
import {authorizationSnapshot,matchesAuthorizationSnapshot,sameAuthorizationConfig,sameBinding,sameOAuth,sameDelegation,sameAuthorizedBinding} from '../dist/authorization-snapshot.js';

const binding={agentId:'engineer',requesterSenderId:'owner',messageChannel:'discord',agentAccountId:'default',connectionRef:'owner-rest',documentId:'a'.repeat(24),primaryWorkspaceId:'b'.repeat(24),workspaceId:'c'.repeat(24),elementId:'d'.repeat(24)};
const other={...binding,requesterSenderId:'second-owner',connectionRef:'second-rest'};
const config=()=>parseConfig({bindings:[binding,other],liveReads:true,engineerAgentId:'engineer',
  oauth:{clientId:'fixture',clientSecretFile:'/private/fixture',applicationPermissions:{canReadDocuments:true,canWriteDocuments:true,canDeleteDocumentsAndWorkspaces:false}},
  delegation:{leadAgentId:'lead-agent',engineerAgentId:'engineer',peerSenderId:'lead',accountId:'default',keyFile:'/private/key'},localMcp:{connectionRef:'owner-rest',credentialDirectory:'/private/handoff'}});
const reverse=value=>Object.fromEntries(Object.entries(value).reverse());

test('field snapshots accept equivalent property/binding order and optional absence',()=>{
  const initial=config(),reordered={...reverse(initial),bindings:[reverse(other),reverse(binding)],oauth:{...reverse(initial.oauth),applicationPermissions:reverse(initial.oauth.applicationPermissions)},delegation:reverse(initial.delegation),localMcp:reverse(initial.localMcp)};
  assert(sameAuthorizationConfig(initial,reordered));assert(matchesAuthorizationSnapshot(reordered,authorizationSnapshot(initial)));
  assert(sameBinding(binding,{...reverse(binding),discordChannelId:undefined}));
  assert(sameOAuth(initial.oauth,{...reverse(initial.oauth),dashboardRedirectUri:undefined,applicationPermissions:{...reverse(initial.oauth.applicationPermissions),canShareAndUnshareDocuments:undefined}}));
  assert(sameDelegation(initial.delegation,{...reverse(initial.delegation),transportTokenFile:undefined}));
  assert(sameAuthorizedBinding({binding,contextId:'signed-context'},{binding:reverse(binding),contextId:'signed-context'}));
  assert(!sameAuthorizedBinding({binding,contextId:'signed-context'},{binding,contextId:'different-context'}));
  // Explicit and implicit effective Engineer IDs have the same meaning.
  const {engineerAgentId,...implicit}=initial;assert(sameAuthorizationConfig(initial,implicit));
});
test('every security-relevant field change invalidates a captured snapshot',()=>{
  const initial=config(),snapshot=authorizationSnapshot(initial);
  const changes=[
    c=>{c.liveReads=false;},c=>{c.engineerAgentId='other-engineer';},c=>{c.bindings.pop();},
    ...Object.keys(binding).map(field=>c=>{c.bindings[0][field]=['documentId','primaryWorkspaceId','workspaceId','elementId'].includes(field)?'e'.repeat(24):field==='messageChannel'?'a2a':'changed';}),
    c=>{c.bindings[0].discordChannelId='123456789012345678';},
    c=>{c.oauth.clientId='other';},c=>{c.oauth.clientSecretFile='/private/other';},
    c=>{c.oauth.dashboardRedirectUri='http://localhost:19489/plugins/claw-onshape/oauth/callback';},
    ...['canReadDocuments','canWriteDocuments','canDeleteDocumentsAndWorkspaces','canRequestPurchases','canShareAndUnshareDocuments','canReadProfileInformation'].map(field=>c=>{c.oauth.applicationPermissions[field]=!c.oauth.applicationPermissions[field];}),
    ...['leadAgentId','engineerAgentId','peerSenderId','accountId'].map(field=>c=>{c.delegation[field]='other';}),
    c=>{c.delegation.keyFile='/private/other';},c=>{c.delegation.transportTokenFile='/private/transport';},
    c=>{c.localMcp.connectionRef='second-rest';},c=>{c.localMcp.credentialDirectory='/private/other';},
  ];
  for(const change of changes){const updated=structuredClone(initial);change(updated);assert(!matchesAuthorizationSnapshot(updated,snapshot));}
  const missing=config();assert(!sameOAuth(missing.oauth,{...missing.oauth,applicationPermissions:{canWriteDocuments:true}}));
});
test('snapshot is independent of mutable inputs and rejects malformed/accessor/symbol values',()=>{
  const raw=structuredClone(config()),snapshot=authorizationSnapshot(raw);raw.bindings[0].workspaceId='e'.repeat(24);
  assert(!matchesAuthorizationSnapshot(raw,snapshot));assert(Object.isFrozen(snapshot.bindings));assert(Object.isFrozen(snapshot.bindings[0]));
  let accesses=0;
  const accessor=structuredClone(config());Object.defineProperty(accessor.oauth.applicationPermissions,'canWriteDocuments',{enumerable:true,get(){accesses++;return true;}});
  const sparse=structuredClone(config());delete sparse.bindings[0];
  const symbol=structuredClone(config());symbol[Symbol('authority')]=true;
  const inherited=Object.assign(Object.create({authority:true}),structuredClone(config()));
  for(const invalid of [accessor,sparse,symbol,inherited,{...config(),liveReads:'true'},{...config(),oauth:null},{...config(),unexpected:true}])assert(!sameAuthorizationConfig(config(),invalid));
  assert.equal(accesses,0);
  assert(!sameBinding(binding,{...binding,elementId:null}));assert(!sameOAuth(config().oauth,{...config().oauth,applicationPermissions:{canWriteDocuments:1}}));
});
