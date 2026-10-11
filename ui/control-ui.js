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
      let timer,disposed=false,busy=false,generation=0;
      const invoke=async(actionId)=>{
        const g=++generation;busy=true;connect.disabled=disconnect.disabled=refresh.disabled=true;
        try{const wire=await context.host.request('plugins.sessionAction',{pluginId:'claw-onshape',actionId,payload:select.value?{connectionRef:select.value}:{}});
          if(disposed||context.signal.aborted||g!==generation)return;
          if(!wire?.ok||!wire.result)throw new Error();const result=wire.result;
          output.textContent=result.message;diagnostic.textContent=`Status: ${result.code}`;
          if(result.connections){const value=select.value;select.replaceChildren();for(const ref of result.connections){const option=document.createElement('option');option.value=option.textContent=ref;select.append(option);}if(result.connections.includes(value))select.value=value;}
          if(result.authorizationUrl){const u=new URL(result.authorizationUrl);if(u.origin!=='https://oauth.onshape.com'||u.pathname!=='/oauth/authorize')throw new Error();link.href=u.href;link.hidden=false;}
          if(result.code!=='authorization_in_progress'){link.hidden=true;link.removeAttribute('href');}
          clearTimeout(timer);if(result.code==='authorization_in_progress')timer=setTimeout(()=>invoke('status'),2000);
          connect.disabled=!select.value||['not_configured','oauth_configuration_required','authorization_in_progress','dashboard_callback_required'].includes(result.code);
          disconnect.disabled=!select.value||result.code==='authorization_in_progress';
        }catch{if(!disposed){output.textContent='Claw-Onshape could not load its connection status. Check dashboard access and retry.';diagnostic.textContent='Status: plugin_unavailable';connect.disabled=disconnect.disabled=true;}}
        finally{busy=false;if(!disposed)refresh.disabled=false;}
      };
      connect.onclick=()=>invoke('connect');disconnect.onclick=()=>invoke('disconnect');refresh.onclick=()=>invoke('status');select.onchange=()=>{if(!busy)invoke('status');};
      section.append(heading,description,select,output,diagnostic,connect,refresh,disconnect,link,note);container.append(section);invoke('status');
      return {dispose(){disposed=true;generation++;clearTimeout(timer);section.remove();}};
    }});
  }
};
