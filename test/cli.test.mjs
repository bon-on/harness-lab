import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,mkdirSync} from 'node:fs';
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
 assert.match(readFileSync(join(root,'harness/workflow.md'),'utf8'),/skill is optional/);
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
