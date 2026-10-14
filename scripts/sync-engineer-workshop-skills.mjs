// Run inside the managed Engineer container. Native Workshop APIs own all writes.
// Existing customized skills are preserved; this is initial provisioning, not a
// second skill editor or a MCP execution adapter.
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const execute=process.argv.includes('--execute');
const agentId='clawcad-mechanical-engineer';
const names=['onshape-inspect-features','onshape-edit-feature-parameters','onshape-verify-candidate'];
const call=(method,params)=>JSON.parse(execFileSync('openclaw',['gateway','call',method,'--params',JSON.stringify(params),'--json','--timeout','30000'],{encoding:'utf8',timeout:45000,maxBuffer:4*1024*1024}));
const hash=value=>createHash('sha256').update(value).digest('hex');
const body=value=>value.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/,'').trim();
const installed=call('skills.proposals.list',{agentId}).installedSkills;
if(!Array.isArray(installed))throw new Error('Native Workshop inventory unavailable');
for(const name of names){
  const content=readFileSync(new URL(`../skills/${name}/SKILL.md`,import.meta.url),'utf8');
  const description=/^description: (.+)$/m.exec(content)?.[1];
  if(!description||Buffer.byteLength(description)>160||!content.startsWith(`---\nname: ${name}\n`))throw new Error('Invalid packaged skill or unsupported Workshop description length');
  if(installed.some(s=>s.name===name)){
    const current=call('skills.workshop.read',{agentId,name});
    console.log(JSON.stringify({name,action:'preserve_editable_skill',sourceSha256:hash(content),installedSha256:hash(current.content)}));
    continue;
  }
  console.log(JSON.stringify({name,action:execute?'create_and_apply':'preview_create',sourceSha256:hash(content)}));
  if(!execute)continue;
  const proposal=call('skills.proposals.create',{agentId,name,description,content,
    goal:'Engineer domain workflow using native Onshape MCP with control-plane authorization and verification.',
    evidence:'Operator-requested editable Workshop skill; source reviewed in Claw-Onshape. No CAD execution is authorized by installation.'});
  if(!proposal.record?.id||!proposal.revisionHash)throw new Error('Native Workshop proposal contract unavailable');
  const applied=call('skills.proposals.apply',{agentId,proposalId:proposal.record.id,expectedRevisionHash:proposal.revisionHash});
  if(applied.record?.status!=='applied')throw new Error('Native Workshop skill application failed');
  const current=call('skills.workshop.read',{agentId,name});
  if(current.name!==name||body(current.content)!==body(content))throw new Error('Native Workshop readback failed');
  console.log(JSON.stringify({name,proposalId:proposal.record.id,status:'applied',installedSha256:hash(current.content)}));
}
