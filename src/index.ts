import type {AnyAgentTool,OpenClawPluginApi,OpenClawPluginToolContext} from 'openclaw/plugin-sdk/core';
import {parseConfig,connectionOwner,id} from './config.ts';
import {RestClient} from './rest.ts';
import {credentials} from './credentials.ts';
import {registerCli} from './cli.ts';
import {registerDashboard} from './dashboard.ts';
import {state,userError} from './readiness.ts';
import {authorizedBinding,leadBinding,delegateRender,delegationKeySync,signResult} from './delegation.ts';
import {saveRender,readRender,imageHash} from './render.ts';
import {accessToken} from './authorization.ts';
export default {
  id:'claw-onshape',name:'Claw-Onshape',
  register(api:OpenClawPluginApi) {
    const config=parseConfig(api.pluginConfig);
    const current=() => {
      const entry=api.runtime.config.current().plugins?.entries?.['claw-onshape'];
      if(entry?.enabled!==true) throw new Error('authorization_changed');
      return parseConfig(entry.config);
    };
    registerCli(api,config);
    const lifecycle=registerDashboard(api,current);
    api.registerTool({contextVersion:2,create:(ctx:OpenClawPluginToolContext<2>) => {
      const initial=authorizedBinding(config,ctx)?.binding;if(!initial) return null;
      return {
        name:'onshape_inspect',label:'Inspect active Onshape workspace',
        description:'Read document/workspace membership and element identifiers for your configured Onshape context.',
        // Native runtime accepts JSON Schema. The SDK types carry TypeBox metadata
        // which this dependency-free, empty object schema does not need at runtime.
        parameters:{type:'object',properties:{},additionalProperties:false} as AnyAgentTool['parameters'],
        async execute(_callId:string,params:unknown) {
          const guard=() => {
            ctx.assertInvocationCurrent?.();
            const c=current();const b=authorizedBinding(c,ctx)?.binding;
            if(!b || JSON.stringify(b)!==JSON.stringify(initial)) throw new Error('authorization_changed');
            if(!c.liveReads) throw new Error('live_reads_disabled');
            return b;
          };
          try {
            if(!params || typeof params!=='object' || Array.isArray(params) || Object.keys(params).length) throw new Error('invalid_arguments');
            const b=guard();
            const store=await credentials(api.runtime.state.resolveStateDir(),b.connectionRef,connectionOwner(b));
            let usedToken:string | undefined;
            const oauth=current().oauth;
            const tokenGuard=()=>{guard();if(JSON.stringify(current().oauth)!==JSON.stringify(oauth))throw new Error('authorization_changed');};
            const client=new RestClient(async() => {usedToken=await accessToken(store,oauth,tokenGuard);return usedToken;});
            let result;
            try{result=await client.inspect(b);}catch(e){
              if(e instanceof Error && e.message==='reconnect_required' && usedToken) {
                try{await store.exclusive(async() => {if(store.read().accessToken===usedToken) await store.save(null);});}catch{}
              }
              throw e;
            }
            guard();
            if(store.read().accessToken!==usedToken) throw new Error('authorization_changed');
            return {content:[{type:'text' as const,text:JSON.stringify(result)}],details:result};
          } catch(e) {
            const result=userError(e);
            return {content:[{type:'text' as const,text:result.message}],details:{error:result.code,...result},isError:true};
          }
        }
      };
    }},{optional:true});
    const emptySchema={type:'object',properties:{},additionalProperties:false} as AnyAgentTool['parameters'];
    const noArgs=(params:unknown)=>{if(!params||typeof params!=='object'||Array.isArray(params)||Object.keys(params).length)throw new Error('invalid_arguments');};
    const signedDetails=(ctx:OpenClawPluginToolContext,details:Record<string,unknown>)=>{
      const c=current(),auth=authorizedBinding(c,ctx);
      return auth?.contextId?{...details,delegationProof:signResult(details,auth.contextId,delegationKeySync(c))}:details;
    };
    api.registerTool({contextVersion:2,create:(ctx:OpenClawPluginToolContext<2>)=>{
      const auth=authorizedBinding(config,ctx);
      const engineer=config.engineerAgentId??config.delegation?.engineerAgentId??'clawcad-mechanical-engineer';
      if(!auth && (ctx.agentId!==engineer||config.bindings.length))return null;
      return {name:'onshape_status',label:'Claw-Onshape readiness',description:'Explain connection readiness and native dashboard onboarding without reading CAD or exposing credentials.',parameters:emptySchema,
        async execute(_id:string,params:unknown){
          try{noArgs(params);ctx.assertInvocationCurrent?.();const c=current();const selected=authorizedBinding(c,ctx);
            if(auth && (!selected||JSON.stringify(auth)!==JSON.stringify(selected)))throw new Error('authorization_changed');
            const details=signedDetails(ctx,await lifecycle.status(selected?.binding.connectionRef));
            return {content:[{type:'text' as const,text:JSON.stringify(details)}],details};
          }catch(e){const details=userError(e);return {content:[{type:'text' as const,text:details.message}],details,isError:true};}
        }};
    }},{optional:true});
    api.registerTool({contextVersion:2,create:(ctx:OpenClawPluginToolContext<2>)=>{
      const initial=authorizedBinding(config,ctx);if(!initial)return null;
      return {name:'onshape_render',label:'Show Camera Mount Plate',description:'Inspect the configured Camera Mount Plate and return its current Onshape PNG view pinned to the inspected microversion. No CAD writes.',parameters:emptySchema,
        async execute(_id:string,params:unknown){
          const guard=()=>{ctx.assertInvocationCurrent?.();const c=current(),a=authorizedBinding(c,ctx);if(!a||JSON.stringify(a)!==JSON.stringify(initial))throw new Error('authorization_changed');if(!c.liveReads)throw new Error('live_reads_disabled');return a.binding;};
          try{noArgs(params);const b=guard(),store=await credentials(api.runtime.state.resolveStateDir(),b.connectionRef,connectionOwner(b));
            const oauth=current().oauth;
            const tokenGuard=()=>{guard();if(JSON.stringify(current().oauth)!==JSON.stringify(oauth))throw new Error('authorization_changed');};
            let usedToken:string|undefined;const client=new RestClient(async()=>{usedToken=await accessToken(store,oauth,tokenGuard);return usedToken;});
            const {bytes,metadata}=await client.render(b);guard();if(store.read().accessToken!==usedToken)throw new Error('authorization_changed');
            if(!ctx.workspaceDir)throw new Error('credential_store_unavailable');const filePath=await saveRender(ctx.workspaceDir,bytes);
            guard();if(store.read().accessToken!==usedToken)throw new Error('authorization_changed');
            const details=signedDetails(ctx,{...metadata,filePath,sha256:imageHash(bytes),bytes:bytes.length});
            return {content:[{type:'text' as const,text:JSON.stringify(details)},{type:'image' as const,data:bytes.toString('base64'),mimeType:'image/png'}],details};
          }catch(e){const explanation=userError(e);let details:Record<string,unknown>={status:'unavailable',...explanation};
            try{details=signedDetails(ctx,details);}catch{}return {content:[{type:'text' as const,text:JSON.stringify(details)}],details,isError:true};}
        }};
    }},{optional:true});
    api.registerTool({contextVersion:2,create:(ctx:OpenClawPluginToolContext<2>)=>{
      const b=leadBinding(config,ctx);if(!b)return null;
      return {name:'onshape_delegate_render',label:'Ask Mechanical Engineer for Camera Mount Plate',description:'Delegate a configured, requester-authorized read/render task to the Mechanical Engineer over native A2A. Lead receives no Onshape credential or direct CAD capability.',parameters:emptySchema,
        async execute(_id:string,params:unknown){
          const guard=()=>{ctx.assertInvocationCurrent?.();const c=current();if(JSON.stringify(leadBinding(c,ctx))!==JSON.stringify(b)||JSON.stringify(c.delegation)!==JSON.stringify(config.delegation))throw new Error('authorization_changed');};
          try{noArgs(params);guard();const details=await delegateRender(current(),b,guard);guard();
            if(details.status!=='ok')return {content:[{type:'text' as const,text:typeof details.message==='string'?details.message:'The Mechanical Engineer could not load the Camera Mount Plate.'}],details,isError:true};
            if(details.documentId!==b.documentId||details.workspaceId!==b.workspaceId||details.elementId!==b.elementId||!id(details.microversionId)||typeof details.filePath!=='string'||typeof details.sha256!=='string'||!ctx.workspaceDir)throw new Error('delegation_denied');
            const bytes=await readRender(ctx.workspaceDir,details.filePath,details.sha256);guard();
            if(ctx.delivery){await ctx.delivery.send({text:`Camera Mount Plate — current inspected revision ${details.microversionId}. ${details.onshapeUrl}`,mediaUrl:details.filePath});guard();details.delivered=true;}
            return {content:[{type:'text' as const,text:JSON.stringify(details)},{type:'image' as const,data:bytes.toString('base64'),mimeType:'image/png'}],details};
          }catch(e){const details=userError(e);return {content:[{type:'text' as const,text:details.message}],details,isError:true};}
        }};
    }},{optional:true});
  }
};
