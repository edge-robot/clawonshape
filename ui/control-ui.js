// Prebuilt, self-contained browser entry. Uses OpenClaw's native session-action transport.
export default {
  id:'claw-onshape',
  activate(host){
    host.ui.registerNavigation({id:'onshape',label:'Claw-Onshape',page:{id:'onshape'},icon:'link'});
    host.ui.registerPage({id:'onshape',label:'Claw-Onshape',mount(container,context){
      const section=document.createElement('section'),heading=document.createElement('h1'),description=document.createElement('p');
      heading.textContent='Connect Onshape';description.textContent='Connect the configured Onshape account, then ask in #clawcad to show the Camera Mount Plate.';
      const select=document.createElement('select');select.setAttribute('aria-label','Configured Onshape connection');
      const output=document.createElement('p');output.setAttribute('role','status');output.setAttribute('aria-live','polite');
      const diagnostic=document.createElement('small');const link=document.createElement('a');link.textContent='Continue to Onshape authorization';link.target='_blank';link.rel='noopener noreferrer';link.hidden=true;
      const connect=document.createElement('button'),refresh=document.createElement('button'),disconnect=document.createElement('button');
      connect.textContent='Connect Onshape';refresh.textContent='Refresh status';disconnect.textContent='Disconnect Onshape';
      const note=document.createElement('p');note.textContent='Connection actions require dashboard administrator access. Application secrets are provisioned privately by the operator. Disconnect removes the local connection; revoke the grant in Onshape settings if needed.';
      const restHeading=document.createElement('h2');restHeading.textContent='Onshape REST';
      const restCapabilities=document.createElement('p');
      const mcpSection=document.createElement('section'),mcpHeading=document.createElement('h2'),mcpOutput=document.createElement('div');
      mcpHeading.textContent='Onshape MCP';mcpOutput.setAttribute('aria-live','polite');
      const renderMcp=(mcp)=>{
        mcpOutput.replaceChildren();
        const line=(text)=>{const p=document.createElement('p');p.textContent=text;mcpOutput.append(p);};
        const flag=(value)=>value===true?'Yes':value===false?'No':'UNKNOWN';
        line(`Provider: onshape · Configured: ${flag(mcp?.configured)} · Native integration: ${mcp?.enabled===true?'Enabled':mcp?.enabled===false?'Disabled':'UNKNOWN'}`);
        line(`Native OAuth: ${mcp?.oauth?.status??'UNKNOWN'} · Stored grant: ${flag(mcp?.oauth?.storedGrant)}`);
        line(`Expiry: ${mcp?.oauth?.expiresAt??'UNKNOWN'}${mcp?.oauth?.expired?' (expired)':''} · Requires operator action: ${flag(mcp?.oauth?.requiresOperatorAction)}`);
        line(mcp?.oauth?.reason??'Native status has not been loaded.');
        line(`Discovery: ${mcp?.discovery?.status??'UNKNOWN'}. ${mcp?.discovery?.reason??'No current authenticated discovery is verified.'}`);
        line('CAD mutation: BLOCKED');
        const blockers=document.createElement('ul');for(const text of mcp?.mutation?.blockers??['Unverified Candidate Workspace containment','Missing atomic revision enforcement','Unverified guarded native MCP invocation','Unverified Part Studio mutation contract']){const li=document.createElement('li');li.textContent=text;blockers.append(li);}mcpOutput.append(blockers);
        line(mcp?.operatorAction??'Inspect native OpenClaw MCP Settings/status. Keep production MCP disabled.');
      };
      renderMcp();mcpSection.append(mcpHeading,mcpOutput);
      let timer,disposed=false,busy=false,generation=0;
      const invoke=async(actionId)=>{
        const g=++generation;busy=true;connect.disabled=disconnect.disabled=refresh.disabled=true;
        try{const wire=await context.host.request('plugins.sessionAction',{pluginId:'claw-onshape',actionId,payload:select.value?{connectionRef:select.value}:{}});
          if(disposed||context.signal.aborted||g!==generation)return;
          if(!wire?.ok||!wire.result)throw new Error();const result=wire.result;
          output.textContent=result.message;diagnostic.textContent=`Status: ${result.code}`;
          if(actionId==='status'){
            renderMcp(result.mcp);
            const capability=(name)=>{const c=result.capabilities?.[name];return c?`${c.availability} (${c.reason})`:'UNKNOWN';};
            restCapabilities.textContent=`Read capability: ${capability('read_document')} · Candidate Workspace capability: ${capability('create_candidate_workspace')}`;
          }
          if(result.connections){const value=select.value;select.replaceChildren();for(const ref of result.connections){const option=document.createElement('option');option.value=option.textContent=ref;select.append(option);}if(result.connections.includes(value))select.value=value;}
          if(result.authorizationUrl){const u=new URL(result.authorizationUrl);if(u.origin!=='https://oauth.onshape.com'||u.pathname!=='/oauth/authorize')throw new Error();link.href=u.href;link.hidden=false;}
          if(result.code!=='authorization_in_progress'){link.hidden=true;link.removeAttribute('href');}
          clearTimeout(timer);if(result.code==='authorization_in_progress')timer=setTimeout(()=>invoke('status'),2000);
          connect.disabled=!select.value||['not_configured','oauth_configuration_required','authorization_in_progress','dashboard_callback_required'].includes(result.code);
          disconnect.disabled=!select.value||result.code==='authorization_in_progress';
        }catch{if(!disposed){output.textContent='Claw-Onshape could not load its connection status. Check dashboard access and retry.';diagnostic.textContent='Status: plugin_unavailable';connect.disabled=disconnect.disabled=true;if(actionId==='status'){renderMcp();restCapabilities.textContent='Read capability: UNKNOWN · Candidate Workspace capability: UNKNOWN';}}}
        finally{busy=false;if(!disposed)refresh.disabled=false;}
      };
      connect.onclick=()=>invoke('connect');disconnect.onclick=()=>invoke('disconnect');refresh.onclick=()=>invoke('status');select.onchange=()=>{if(!busy)invoke('status');};
      section.append(heading,description,restHeading,select,output,diagnostic,restCapabilities,connect,refresh,disconnect,link,note,mcpSection);container.append(section);invoke('status');
      return {dispose(){disposed=true;generation++;clearTimeout(timer);section.remove();}};
    }});
  }
};
