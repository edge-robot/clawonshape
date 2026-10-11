import type {AnyAgentTool,OpenClawPluginApi,OpenClawPluginToolContext} from 'openclaw/plugin-sdk/core';
import {bindingFor,parseConfig,connectionOwner} from './config.ts';
import {RestClient} from './rest.ts';
import {credentials} from './credentials.ts';
import {registerCli} from './cli.ts';
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
    api.registerTool((ctx:OpenClawPluginToolContext) => {
      const initial=bindingFor(config,ctx);if(!initial) return null;
      return {
        name:'onshape_inspect',label:'Inspect active Onshape workspace',
        description:'Read document/workspace membership and element identifiers for your configured Onshape context.',
        // Native runtime accepts JSON Schema. The SDK types carry TypeBox metadata
        // which this dependency-free, empty object schema does not need at runtime.
        parameters:{type:'object',properties:{},additionalProperties:false} as AnyAgentTool['parameters'],
        async execute(_callId:string,params:unknown) {
          const guard=() => {
            ctx.assertInvocationCurrent?.();
            const c=current();const b=bindingFor(c,ctx);
            if(!b || JSON.stringify(b)!==JSON.stringify(initial)) throw new Error('authorization_changed');
            if(!c.liveReads) throw new Error('live_reads_disabled');
            return b;
          };
          try {
            if(!params || typeof params!=='object' || Array.isArray(params) || Object.keys(params).length) throw new Error('invalid_arguments');
            const b=guard();
            const store=await credentials(api.runtime.state.resolveStateDir(),b.connectionRef,connectionOwner(b));
            let usedToken:string | undefined;
            const client=new RestClient(async() => {guard();usedToken=store.read().accessToken;return usedToken;});
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
            const allowed=['authorization_changed','live_reads_disabled','invalid_arguments','reconnect_required','provider_forbidden','provider_not_found','provider_rate_limited','provider_unavailable','provider_protocol_error','provider_transport_error','workspace_not_in_document'];
            const code=e instanceof Error && allowed.includes(e.message)?e.message:'onshape_unavailable';
            return {content:[{type:'text' as const,text:JSON.stringify({error:code})}],details:{error:code},isError:true};
          }
        }
      };
    },{optional:true});
  }
};
