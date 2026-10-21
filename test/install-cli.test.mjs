import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {installKit} from '../dist/lifecycle.js';
const cli = resolve('dist/index.js');
function fixture(t) {
 const root=mkdtempSync(join(tmpdir(),'harness-install-cli-'));
 t.after(()=>rmSync(root,{recursive:true,force:true}));return root;
}
const run=(cwd,...args)=>spawnSync(process.execPath,[cli,...args],{cwd,encoding:'utf8',timeout:10000});
const parse=r=>{assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);};
test('short init accepts options before positionals and previews without creating a target',t=>{
 const root=fixture(t), target=join(root,'new-project');
 const preview=parse(run(root,'init','--dry-run','--format','json',target));
 assert.equal(preview.applied,false);assert.ok(preview.entries.some(e=>e.status==='create'));
 assert.equal(existsSync(target),false);
 parse(run(root,'init',target,'--format','json'));
 assert.ok(existsSync(join(target,'.harness-lab/state.json')));
 const before=readFileSync(join(target,'.harness-lab/state.json'),'utf8');
 parse(run(target,'update','--format','json'));
 assert.equal(readFileSync(join(target,'.harness-lab/state.json'),'utf8'),before);
});
test('CLI update previews and applies tracked changes, preserving user files and guarding rollback',t=>{
 const root=fixture(t);
 writeFileSync(join(root,'AGENTS.md'),'existing project instructions');
 installKit(root,{'harness/workflow.md':'old workflow\n'},{version:'0.1.0',mode:'init',apply:true});
 const before=readFileSync(join(root,'.harness-lab/state.json'),'utf8');
 const preview=parse(run(root,'update','--format','json'));
 assert.ok(preview.entries.some(e=>e.path==='harness/workflow.md'&&e.status==='update'));
 assert.equal(readFileSync(join(root,'harness/workflow.md'),'utf8'),'old workflow\n');
 const result=parse(run(root,'update','--apply','--format','json'));
 assert.equal(result.applied,true);assert.ok(result.transactionId);
 assert.equal(readFileSync(join(root,'AGENTS.md'),'utf8'),'existing project instructions');
 const workflow=readFileSync(join(root,'harness/workflow.md'),'utf8');
 assert.notEqual(workflow,'old workflow\n');
 parse(run(root,'rollback',result.transactionId,'--format','json'));
 assert.equal(readFileSync(join(root,'harness/workflow.md'),'utf8'),workflow);
 writeFileSync(join(root,'harness/workflow.md'),'new user work');
 assert.equal(run(root,'rollback',result.transactionId,'--apply').status,1);
 assert.equal(readFileSync(join(root,'harness/workflow.md'),'utf8'),'new user work');
 writeFileSync(join(root,'harness/workflow.md'),workflow);
 parse(run(root,'rollback',result.transactionId,'--apply','--format','json'));
 assert.equal(readFileSync(join(root,'harness/workflow.md'),'utf8'),'old workflow\n');
 assert.equal(readFileSync(join(root,'.harness-lab/state.json'),'utf8'),before);
});
test('doctor explains setup and verify uses project defaults',t=>{
 const root=fixture(t);
 const absent=run(root,'doctor','--format','json');assert.equal(absent.status,1);
 assert.equal(JSON.parse(absent.stdout).findings[0].code,'manifest-missing');
 assert.deepEqual(readdirSync(root),[]);
 parse(run(root,'init','--format','json'));
 const doctor=parse(run(root,'doctor','--format','json'));
 assert.equal(doctor.managed,true);assert.ok(doctor.nextSteps.some(s=>s.includes('verify.json')));
 const missing=run(root,'verify');assert.equal(missing.status,1);assert.match(missing.stderr,/Verification config not found/);
 writeFileSync(join(root,'source.txt'),'source');
 writeFileSync(join(root,'harness/verify.json'),JSON.stringify({command:[process.execPath,'-e','console.log("ok")'],inputs:['source.txt','harness'],timeoutMs:1000}));
 assert.equal(parse(run(root,'verify')).passed,true);
 assert.equal(parse(run(root,'check-evidence','out/evidence/latest/checks.json','.')).valid,true);
});
test('invalid mutation options fail without writing project files',t=>{
 const root=fixture(t);
 for(const args of [['update','--aply'],['update','--apply','--dry-run'],['init','--apply'],['update','--output','out.json'],['init','--output']]) {
  assert.equal(run(root,...args).status,1,args.join(' '));assert.deepEqual(readdirSync(root),[]);
 }
});
test('doctor reports an existing mutation lock without removing it',t=>{
 const root=fixture(t);parse(run(root,'init','--format','json'));
 writeFileSync(join(root,'.harness-lab/lock'),'active transaction');
 const result=run(root,'doctor','--format','json');assert.equal(result.status,1);
 assert.ok(JSON.parse(result.stdout).findings.some(f=>f.code==='mutation-lock-present'));
 assert.equal(readFileSync(join(root,'.harness-lab/lock'),'utf8'),'active transaction');
});
