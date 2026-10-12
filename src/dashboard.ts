import type {OpenClawPluginApi} from 'openclaw/plugin-sdk/core';
import type {Config} from './config.ts';
import {connectionLifecycle,CALLBACK_PATH} from './connections.ts';
import {userError} from './readiness.ts';
import {mcpReadiness,localMcpReadiness} from './mcp.ts';
export function registerDashboard(api:OpenClawPluginApi,current:()=>Config,readMcp:typeof mcpReadiness=mcpReadiness){
  const lifecycle=connectionLifecycle(current,()=>api.runtime.state.resolveStateDir(),()=>api.runtime.config.current().gateway?.controlUi?.allowedOrigins??[]);
  const controls=api.session.controls;
  for(const actionId of ['status','connect','disconnect'] as const){
    controls.registerSessionAction({id:actionId,description:`Claw-Onshape ${actionId}`,requiredScopes:[actionId==='status'?'operator.read':'operator.admin'],
      schema:{type:'object',additionalProperties:false,properties:{connectionRef:{type:'string',pattern:'^[a-z][a-z0-9_-]{0,63}$'},requestRestWriteAccess:{type:'boolean'}}},
      async handler(action){
        try{
          // Dashboard authority is operator scope, NOT a claim of Discord identity.
          if(!action.client?.scopes.includes(actionId==='status'?'operator.read':'operator.admin'))throw new Error('authorization_changed');
          const input=action.payload as {connectionRef?:string}|undefined;
          if(input?.connectionRef!==undefined&&!current().bindings.some(b=>b.connectionRef===input.connectionRef))throw new Error('not_configured');
          const connections=[...new Set(current().bindings.map(b=>b.connectionRef))];
          const name=input?.connectionRef??(connections.length===1?connections[0]:undefined);
          if(actionId==='status'){
            const native=await readMcp(),local=current().localMcp;
            const mcp=local?await localMcpReadiness(native,local):native;
            let rest;try{rest=await lifecycle.status(name);}catch(e){rest=userError(e);}
            return {ok:true,result:{...rest,connections,mcp}};
          }
          if(!name)throw new Error('not_configured');
          return {ok:true,result:actionId==='connect'
            ?await lifecycle.start(name,{requestRestWriteAccess:!!(action.payload as {requestRestWriteAccess?:boolean}|undefined)?.requestRestWriteAccess})
            :await lifecycle.disconnect(name)};
        }catch(e){return {ok:true,result:userError(e)};}
      }});
  }
  api.registerHttpRoute({path:CALLBACK_PATH,match:'exact',auth:'plugin',handler:lifecycle.callback});
  api.lifecycle.registerRuntimeLifecycle({id:'onshape-consent',dispose:lifecycle.cancel,cleanup:lifecycle.cancel});
  return lifecycle;
}
