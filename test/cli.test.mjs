import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,mkdirSync,symlinkSync,existsSync,readdirSync,linkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const cli=resolve('dist/index.js');
const run=(...args)=>spawnSync(process.execPath,[cli,...args],{encoding:'utf8'});
function fixture(t){const root=mkdtempSync(join(tmpdir(),'harness-cli-'));t.after(()=>rmSync(root,{recursive:true,force:true}));writeFileSync(join(root,'source.txt'),'original');return root;}
function collect(root,code='console.log("verified")'){
 const config=join(root,'config.json');writeFileSync(config,JSON.stringify({command:[process.execPath,'-e',code],inputs:['source.txt'],timeoutMs:2000}));
 return run('verify',root,config,'--output',join(root,'evidence'));
}
test('collector and checker accept real successful evidence',t=>{const root=fixture(t);assert.equal(collect(root).status,0);assert.equal(run('check-evidence',join(root,'evidence/checks.json'),root).status,0);});
test('failed command persists evidence and fails CLI',t=>{const root=fixture(t);assert.equal(collect(root,'process.exit(7)').status,1);const e=JSON.parse(readFileSync(join(root,'evidence/checks.json')));assert.equal(e.exitCode,7);assert.equal(run('check-evidence',join(root,'evidence/checks.json'),root).status,1);});
test('reject changed source, tampered logs and stale evidence',t=>{const root=fixture(t);collect(root);writeFileSync(join(root,'source.txt'),'changed');assert.equal(run('check-evidence',join(root,'evidence/checks.json'),root).status,1);collect(root);writeFileSync(join(root,'evidence/stdout.txt'),'tampered');assert.equal(run('check-evidence',join(root,'evidence/checks.json'),root).status,1);collect(root);const file=join(root,'evidence/checks.json');const e=JSON.parse(readFileSync(file));e.startedAt=e.finishedAt='2000-01-01T00:00:00Z';writeFileSync(file,JSON.stringify(e));assert.equal(run('check-evidence',file,root).status,1);});
test('evidence output never writes through links or into aliased input scope',t=>{
 for(const [name,link] of [['stdout.txt','symlink'],['checks.json','symlink'],['stderr.txt','hardlink']]){
  const root=fixture(t);writeFileSync(join(root,'source.txt'),'KEEP THIS SOURCE');mkdirSync(join(root,'evidence'));
  if(link==='symlink')symlinkSync('../source.txt',join(root,'evidence',name));else linkSync(join(root,'source.txt'),join(root,'evidence',name));
  const r=collect(root,'console.log("test output")');
  assert.notEqual(r.status,0,`${link} ${name} must be refused`);assert.match(r.stderr,/not allowed in evidence output/);
  assert.equal(readFileSync(join(root,'source.txt'),'utf8'),'KEEP THIS SOURCE');
 }
 const root=fixture(t);mkdirSync(join(root,'src'));writeFileSync(join(root,'src/a.txt'),'KEEP');symlinkSync('src',join(root,'alias'));
 const config=join(root,'config.json');writeFileSync(config,JSON.stringify({command:[process.execPath,'-e','console.log(1)'],inputs:['src'],timeoutMs:2000}));
 for(const output of ['alias','alias/ev','src/..ev']){
  const r=run('verify',root,config,'--output',join(root,output));
  assert.notEqual(r.status,0,output);assert.match(r.stderr,/outside input scope/);
  assert.deepEqual(readdirSync(join(root,'src')),['a.txt'],`${output} must not create files in input scope`);
 }
 mkdirSync(join(root,'src/..keep'));writeFileSync(join(root,'src/..keep/stdout.txt'),'IMPORTANT');
 const keep=run('verify',root,config,'--output',join(root,'src/..keep'));
 assert.notEqual(keep.status,0);assert.match(keep.stderr,/outside input scope/);
 if(existsSync(join(root,'SRC'))){
  writeFileSync(join(root,'src/stdout.txt'),'IMPORTANT');
  for(const output of ['SRC','SRC/ev']){
   const r=run('verify',root,config,'--output',join(root,output));
   assert.notEqual(r.status,0,output);assert.match(r.stderr,/outside input scope/);
  }
  assert.equal(readFileSync(join(root,'src/stdout.txt'),'utf8'),'IMPORTANT');
  assert.deepEqual(readdirSync(join(root,'src')).sort(),['..keep','a.txt','stdout.txt']);
 }
 assert.equal(readFileSync(join(root,'src/..keep/stdout.txt'),'utf8'),'IMPORTANT');
 const ok=fixture(t);assert.equal(collect(ok).status,0);assert.equal(collect(ok).status,0);
 assert.deepEqual(readdirSync(join(ok,'evidence')).sort(),['checks.json','stderr.txt','stdout.txt']);
 assert.equal(run('check-evidence',join(ok,'evidence/checks.json'),ok).status,0);
});
test('changes during execution fail verification',t=>{const root=fixture(t);assert.equal(collect(root,'require("fs").writeFileSync("source.txt","changed")').status,1);});
test('missing logs and unsupported schemas fail closed',t=>{const root=fixture(t);collect(root);const file=join(root,'evidence/checks.json');rmSync(join(root,'evidence/stderr.txt'));assert.equal(run('check-evidence',file,root).status,1);collect(root);writeFileSync(file,'{"schemaVersion":99}');assert.equal(run('check-evidence',file,root).status,1);});
test('timed out commands persist failure evidence',t=>{const root=fixture(t);const config=join(root,'config.json');writeFileSync(config,JSON.stringify({command:[process.execPath,'-e','setInterval(()=>{},1000)'],inputs:['source.txt'],timeoutMs:100}));assert.equal(run('verify',root,config,'--output',join(root,'evidence')).status,1);const e=JSON.parse(readFileSync(join(root,'evidence/checks.json')));assert.equal(e.passed,false);assert.ok(e.error);});
test('strict audit promotes warnings to blocking',t=>{const root=fixture(t);run('init','repo-kit','--output',root);const file=join(root,'harness/manifest.json');const m=JSON.parse(readFileSync(file));m.policyMode='strict-block';writeFileSync(file,JSON.stringify(m));writeFileSync(join(root,'harness/specs/warn.md'),'---\nid: warn\ntitle: Warn\n---\n## Problem\nTest\n## Acceptance Criteria\n- works\n');assert.equal(run('audit',root,'--format','json').status,1);});
test('audit blocking and advisory exit codes',t=>{const root=fixture(t);assert.equal(run('init','repo-kit','--output',root).status,0);const file=join(root,'harness/manifest.json');const m=JSON.parse(readFileSync(file));m.requiredFiles.push('missing.txt');writeFileSync(file,JSON.stringify(m));assert.equal(run('audit',root,'--format','json').status,1);m.policyMode='advisory';writeFileSync(file,JSON.stringify(m));assert.equal(run('audit',root,'--format','json').status,0);});
test('mock mode is explicit',()=>{const r=run('run','examples/coding-assistant.json','--format','json');assert.equal(r.status,0);assert.equal(JSON.parse(r.stdout).agentExecuted,false);assert.match(r.stderr,/MOCK/);});
test('audit rejects referenced tampered execution evidence',t=>{const root=fixture(t);run('init','repo-kit','--output',root);collect(root);mkdirSync(join(root,'harness/contracts'),{recursive:true});writeFileSync(join(root,'harness/contracts/check.md'),'---\nid: check\ntitle: Check\nevidence_files:\n  - evidence/checks.json\n---\n## Goal\nCheck\n## Done Criteria\n- success\n## Verification\nCheck\n## Evidence References\nLog\n');writeFileSync(join(root,'evidence/stdout.txt'),'tampered');const r=run('audit',root,'--format','json');assert.equal(r.status,1);assert.ok(JSON.parse(r.stdout).findings.some(x=>x.code==='execution-evidence-invalid'));});
test('both agents share a local workflow and initialization preserves policy',t=>{
 const root=fixture(t);
 assert.equal(run('init','repo-kit','--output',root).status,0);
 for(const name of ['AGENTS.md','CLAUDE.md']) assert.match(readFileSync(join(root,name),'utf8'),/harness\/workflow.md/);
 assert.match(readFileSync(join(root,'CLAUDE.md'),'utf8'),/^@harness\/workflow\.md$/m);
 assert.match(readFileSync(join(root,'harness/workflow.md'),'utf8'),/skill is optional/);
 assert.match(readFileSync(join(root,'harness/workflow.md'),'utf8'),/whose Scope covers the request.*`maintained`.*ask the user/s);
 writeFileSync(join(root,'AGENTS.md'),'project policy');
 const manifest=join(root,'harness/manifest.json');const original=readFileSync(manifest,'utf8');
 const r=run('init','repo-kit','--output',root);
 assert.equal(r.status,0);assert.match(r.stdout,/Preserved existing files/);
 assert.equal(readFileSync(join(root,'AGENTS.md'),'utf8'),'project policy');
 assert.equal(readFileSync(manifest,'utf8'),original);
});
test('audit checks agent entry points and maintenance lifecycle',t=>{
 const root=fixture(t);run('init','repo-kit','--output',root);
 const findings=()=>JSON.parse(run('audit',root,'--format','json').stdout).findings;
 assert.ok(findings().some(x=>x.code==='maintenance-review-required'));
 const file=join(root,'harness/maintenance.json');
 writeFileSync(file,JSON.stringify({reviewedAt:new Date().toISOString(),summary:'Reviewed duplicate rules and verification.'}));
 assert.ok(!findings().some(x=>x.code.startsWith('maintenance-')));
 writeFileSync(file,JSON.stringify({reviewedAt:'2000-01-01T00:00:00Z',summary:'Old review'}));
 assert.ok(findings().some(x=>x.code==='maintenance-overdue'));
 writeFileSync(file,'{');assert.ok(findings().some(x=>x.code==='maintenance-review-required'));
 rmSync(join(root,'CLAUDE.md'));assert.ok(findings().some(x=>x.code==='agent-entry-missing'));
});
test('detected project packs stay recommendations until approved',t=>{
 const root=fixture(t);writeFileSync(join(root,'package.json'),JSON.stringify({dependencies:{next:'15.0.0',react:'19.0.0'}}));
 assert.equal(run('init','repo-kit','--output',root).status,0);
 const m=JSON.parse(readFileSync(join(root,'harness/manifest.json')));
 assert.ok(m.suggestedPacks.length>0);assert.deepEqual(m.approvedPacks,[]);
 assert.match(readFileSync(join(root,'harness/rules/golden-rules.md'),'utf8'),/require human approval/);
});
test('detects Python and dependency-free Node signals without approving packs',t=>{
 const python=fixture(t);
 writeFileSync(join(python,'pyproject.toml'),'[project]\nname = "offline-service"\ndependencies = ["fastapi>=0.100", "pytest>=8"]\n');
 const p=JSON.parse(run('detect',python,'--format','json').stdout);
 assert.match(p.stackSummary,/Python/);assert.ok(p.signals.some(x=>x.detail==='FastAPI'));
 assert.deepEqual(p.suggestedPacks,[]);
 const node=fixture(t);
 writeFileSync(join(node,'package.json'),JSON.stringify({type:'module',engines:{node:'>=20'},scripts:{test:'node --test'}}));
 const n=JSON.parse(run('detect',node,'--format','json').stdout);
 assert.match(n.stackSummary,/Node.js/);assert.ok(n.signals.some(x=>x.detail==='Node.js test runner'));
 assert.deepEqual(n.suggestedPacks,[]);
});
test('preserved existing entry policies require explicit shared workflow integration',t=>{
 const root=fixture(t);writeFileSync(join(root,'AGENTS.md'),'Preserve running jobs.');
 run('init','repo-kit','--output',root);
 const audit=()=>JSON.parse(run('audit',root,'--format','json').stdout);
 assert.ok(audit().findings.some(x=>x.code==='agent-workflow-unlinked'));
 writeFileSync(join(root,'AGENTS.md'),'Preserve running jobs.\nRead harness/workflow.md.\n');
 assert.ok(!audit().findings.some(x=>x.code==='agent-workflow-unlinked'));
});
test('init generates a read-only code-reviewer agent from the review skill',t=>{
 const root=fixture(t);assert.equal(run('init','repo-kit','--output',root).status,0);
 const agent=readFileSync(join(root,'.claude/agents/code-reviewer.md'),'utf8');
 const front=agent.match(/^---\n([\s\S]*?)\n---\n/)[1];
 assert.match(front,/^name: code-reviewer$/m);assert.match(front,/^model: opus$/m);
 const tools=front.match(/^tools: (.*)$/m)[1].split(/,\s*/);
 assert.deepEqual(tools,['Read','Grep','Glob','Bash']);
 const skill=readFileSync('skills/harness-review/SKILL.md','utf8').replace(/^---\n[\s\S]*?\n---\n+/,'');
 assert.ok(agent.endsWith(skill));
 assert.equal((agent.match(/^name: /gm)||[]).length,1);
 for(const copy of ['.claude/agents/code-reviewer.md','examples/repo-kit/.claude/agents/code-reviewer.md']) assert.equal(readFileSync(copy,'utf8'),agent,`${copy} drifted from the generated agent`);
 const workflow=readFileSync(join(root,'harness/workflow.md'),'utf8');
 assert.match(workflow,/independent read-only review.*`code-reviewer`.*`harness-review`/);
 assert.equal(workflow,readFileSync('examples/repo-kit/harness/workflow.md','utf8'));
 writeFileSync(join(root,'.claude/agents/code-reviewer.md'),'local reviewer');
 assert.equal(run('init','repo-kit','--output',root).status,0);
 assert.equal(readFileSync(join(root,'.claude/agents/code-reviewer.md'),'utf8'),'local reviewer');
});
test('code-reviewer agent respects existing files and symlinked agent directories',t=>{
 const own=fixture(t);mkdirSync(join(own,'.claude/agents'),{recursive:true});writeFileSync(join(own,'.claude/agents/code-reviewer.md'),'team reviewer');
 const first=JSON.parse(run('init',own,'--format','json').stdout);
 assert.equal(first.entries.find(e=>e.path==='.claude/agents/code-reviewer.md').status,'unmanaged');
 assert.equal(readFileSync(join(own,'.claude/agents/code-reviewer.md'),'utf8'),'team reviewer');
 const blocked=fixture(t);writeFileSync(join(blocked,'.claude'),'not a directory');
 const b=run('init',blocked);assert.notEqual(b.status,0);assert.match(b.stderr,/Unexpected file type/);
 const linked=fixture(t);const shared=fixture(t);mkdirSync(join(linked,'.claude'));symlinkSync(shared,join(linked,'.claude/agents'));
 const r=run('init',linked,'--format','json');
 assert.equal(r.status,0,r.stderr);const init=JSON.parse(r.stdout);
 assert.equal(init.entries.find(e=>e.path==='.claude/agents/code-reviewer.md').status,'skipped');
 const back=run('rollback',init.transactionId,linked,'--apply');
 assert.equal(back.status,0,back.stderr);assert.ok(!existsSync(join(linked,'harness/workflow.md')));
 assert.equal(run('init',linked).status,0);
 assert.ok(existsSync(join(linked,'harness/workflow.md')));
 assert.deepEqual(readdirSync(shared),['source.txt']);
 rmSync(join(linked,'.claude/agents'));
 assert.equal(run('update',linked,'--apply').status,0);
 assert.match(readFileSync(join(linked,'.claude/agents/code-reviewer.md'),'utf8'),/# Harness Review/);
});
test('Claude entry point must import the shared workflow',t=>{
 const root=fixture(t);run('init','repo-kit','--output',root);
 const codes=()=>JSON.parse(run('audit',root,'--format','json').stdout).findings.map(x=>x.code);
 assert.ok(!codes().includes('claude-workflow-not-imported'));
 writeFileSync(join(root,'CLAUDE.md'),'Read [the workflow](harness/workflow.md).\n');
 assert.ok(codes().includes('claude-workflow-not-imported'));
 writeFileSync(join(root,'CLAUDE.md'),'Keep local notes.\nSee @./harness/workflow.md for policy.\n');
 assert.ok(!codes().includes('claude-workflow-not-imported'));
});
