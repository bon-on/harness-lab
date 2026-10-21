import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { installKit, rollbackKit, resolveKitRoot } from '../dist/lifecycle.js';
const fixtures = (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-lifecycle-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
};
const install = (root, files, mode = 'init', apply = true, version = '1') => installKit(root, files, { mode, apply, version });
const read = (root, p) => fs.readFileSync(path.join(root, p), 'utf8');
const put = (root, p, text) => { fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true }); fs.writeFileSync(path.join(root, p), text); };
const statuses = result => Object.fromEntries(result.entries.map(e => [e.path, e.status]));
test('upgrade is previewed, tracked baseline advances, and rollback restores content and state', t => {
  const root = fixtures(t);
  install(root, { 'a.md': 'one', 'nested/b.md': 'b' });
  const oldState = read(root, '.harness-lab/state.json');
  assert.equal(install(root, { 'a.md': 'two', 'nested/b.md': 'b' }, 'update', false, '2').applied, false);
  assert.equal(read(root, 'a.md'), 'one');
  assert.equal(read(root, '.harness-lab/state.json'), oldState);
  const result = install(root, { 'a.md': 'two', 'nested/b.md': 'b' }, 'update', true, '2');
  assert.equal(result.applied, true);
  assert.equal(read(root, 'a.md'), 'two');
  assert.equal(rollbackKit(root, result.transactionId, ['a.md', 'nested/b.md'], false).applied, false);
  assert.equal(read(root, 'a.md'), 'two');
  rollbackKit(root, result.transactionId, ['a.md', 'nested/b.md'], true);
  assert.equal(read(root, 'a.md'), 'one');
  assert.equal(read(root, '.harness-lab/state.json'), oldState);
});
test('local edits, unmanaged files and deleted tracked files remain protected across updates', t => {
  const root = fixtures(t);
  put(root, 'unmanaged', 'mine');
  install(root, { edited: 'original', deleted: 'original', unmanaged: 'generated' });
  const baseline = JSON.parse(read(root, '.harness-lab/state.json'));
  put(root, 'edited', 'local'); fs.unlinkSync(path.join(root, 'deleted'));
  const result = install(root, { edited: 'new', deleted: 'new', unmanaged: 'new', fresh: 'new' }, 'update', true, '2');
  assert.deepEqual(statuses(result), { edited: 'modified', deleted: 'deleted', unmanaged: 'unmanaged', fresh: 'create' });
  assert.equal(read(root, 'edited'), 'local'); assert.equal(read(root, 'unmanaged'), 'mine');
  assert.equal(fs.existsSync(path.join(root, 'deleted')), false);
  const state = JSON.parse(read(root, '.harness-lab/state.json'));
  assert.equal(state.files.edited, baseline.files.edited); assert.equal(state.files.deleted, baseline.files.deleted);
  assert.equal(Object.hasOwn(state.files, 'unmanaged'), false);
  const again = install(root, { edited: 'new', deleted: 'new', unmanaged: 'new', fresh: 'new' }, 'update');
  assert.equal(again.applied, false);
});
test('repeated init preserves tracked files and does not reset their baseline', t => {
  const root = fixtures(t);
  install(root, { a: 'first' });
  const before = read(root, '.harness-lab/state.json');
  install(root, { a: 'changed template' });
  assert.equal(read(root, 'a'), 'first'); assert.equal(read(root, '.harness-lab/state.json'), before);
  assert.equal(statuses(install(root, { a: 'changed template' }, 'update', false)).a, 'update');
});
test('preview does not create a missing target or metadata', t => {
  const root = path.join(fixtures(t), 'absent');
  assert.equal(install(root, { a: 'one' }, 'update', false).entries[0].status, 'create');
  assert.equal(fs.existsSync(root), false);
});
test('rollback refuses local file or state divergence before restoring any file', t => {
  const root = fixtures(t);
  install(root, { a: '1', b: '1' });
  const result = install(root, { a: '2', b: '2' }, 'update');
  put(root, 'b', 'local');
  assert.throws(() => rollbackKit(root, result.transactionId, ['a', 'b'], true), /Rollback refused/);
  assert.equal(read(root, 'a'), '2'); assert.equal(read(root, 'b'), 'local');
  put(root, 'b', '2'); put(root, '.harness-lab/state.json', read(root, '.harness-lab/state.json') + ' ');
  assert.throws(() => rollbackKit(root, result.transactionId, ['a', 'b'], true), /current state differs/);
  assert.equal(read(root, 'a'), '2');
});
test('init rollback removes only created files and restores absent state', t => {
  const root = fixtures(t); put(root, 'existing', 'mine');
  const result = install(root, { existing: 'tool', fresh: 'tool' });
  rollbackKit(root, result.transactionId, ['existing', 'fresh'], true);
  assert.equal(read(root, 'existing'), 'mine');
  assert.equal(fs.existsSync(path.join(root, 'fresh')), false);
  assert.equal(fs.existsSync(path.join(root, '.harness-lab/state.json')), false);
});
test('malformed state, unauthorized paths and path traversal are rejected', t => {
  const root = fixtures(t);
  for (const p of ['../outside', '/absolute', 'a/../b', '.harness-lab/state.json', 'a\\b']) {
    assert.throws(() => install(root, { [p]: 'x' }), /Unsafe managed path/);
  }
  for (const state of [{}, { schemaVersion: 1, version: '1', files: { a: 'bad' } }, { schemaVersion: 1, version: '1', files: { '../outside': 'a'.repeat(64) } }]) {
    put(root, '.harness-lab/state.json', JSON.stringify(state));
    assert.throws(() => install(root, { a: 'x' }), /Invalid harness state|Unsafe managed path/);
    assert.equal(fs.existsSync(path.join(root, 'a')), false);
  }
});
test('symlinks, dangling symlinks, metadata links and same-path directories are rejected', t => {
  for (const mode of ['target', 'dangling', 'metadata', 'directory', 'parent', 'backup']) {
    const root = fixtures(t), outside = fixtures(t);
    put(outside, 'sentinel', 'safe');
    if (mode === 'target') fs.symlinkSync(path.join(outside, 'sentinel'), path.join(root, 'a'));
    if (mode === 'dangling') fs.symlinkSync(path.join(outside, 'absent'), path.join(root, 'a'));
    if (mode === 'metadata') fs.symlinkSync(outside, path.join(root, '.harness-lab'));
    if (mode === 'directory') fs.mkdirSync(path.join(root, 'a'));
    if (mode === 'parent') fs.symlinkSync(outside, path.join(root, 'nested'));
    if (mode === 'backup') { fs.mkdirSync(path.join(root, '.harness-lab')); fs.symlinkSync(outside, path.join(root, '.harness-lab/backups')); }
    assert.throws(() => install(root, { a: 'x', 'nested/b': 'y' }), /Symlink|Unexpected file type/);
    assert.equal(read(outside, 'sentinel'), 'safe');
    assert.equal(fs.existsSync(path.join(outside, 'absent')), false);
  }
});
test('lock rejects competing mutations and is released when planning under lock fails', t => {
  const root = fixtures(t); put(root, '.harness-lab/lock', 'another process');
  assert.throws(() => install(root, { a: 'x' }), /holds the lock/);
  assert.equal(read(root, '.harness-lab/lock'), 'another process');
  assert.equal(fs.existsSync(path.join(root, 'a')), false);
  fs.unlinkSync(path.join(root, '.harness-lab/lock'));
  install(root, { a: 'x' });
  assert.equal(fs.existsSync(path.join(root, '.harness-lab/lock')), false);
});
test('rollback validates transaction metadata and transaction path', t => {
  const root = fixtures(t);
  const result = install(root, { a: 'x' });
  const p = `.harness-lab/backups/${result.transactionId}/transaction.json`;
  const original = JSON.parse(read(root, p));
  assert.throws(() => rollbackKit(root, '../outside', ['a'], true), /Invalid transaction ID/);
  for (const tx of [{}, { ...original, changes: [{ path: '../escape', before: null, after: 'x' }] }, { ...original, changes: [{ path: 'a', before: null, after: 'tampered' }] }]) {
    put(root, p, JSON.stringify(tx));
    assert.throws(() => rollbackKit(root, result.transactionId, ['a'], true), /Invalid transaction|Unsafe managed path|Inconsistent transaction/);
    assert.equal(read(root, 'a'), 'x');
  }
});
test('an interrupted write restores earlier files and state and releases the lock',t=>{
 const root=fixtures(t);install(root,{a:'before-a',b:'before-b'});
 const beforeState=read(root,'.harness-lab/state.json');
 const original=fs.writeFileSync;let injected=false;
 fs.writeFileSync=function(file,...args){
  if(String(file)===path.join(fs.realpathSync(root),'b')&&!injected){injected=true;throw new Error('simulated write failure');}
  return original.call(this,file,...args);
 };
 try{assert.throws(()=>install(root,{a:'after-a',b:'after-b'},'update'),/Original file contents and state restored/);}
 finally{fs.writeFileSync=original;}
 assert.equal(read(root,'a'),'before-a');assert.equal(read(root,'b'),'before-b');
 assert.equal(read(root,'.harness-lab/state.json'),beforeState);
 assert.equal(fs.existsSync(path.join(root,'.harness-lab/lock')),false);
});

test('explicit root aliases resolve to one canonical repository, with nested links still refused',t=>{
 const base=fixtures(t),actual=fixtures(t);
 fs.symlinkSync(actual,path.join(base,'alias'));
 const alias=path.join(base,'alias','project');
 assert.equal(resolveKitRoot(alias),path.join(fs.realpathSync(actual),'project'));
 install(alias,{a:'one'});
 assert.equal(read(path.join(actual,'project'),'a'),'one');
 fs.symlinkSync(base,path.join(actual,'project','nested'));
 assert.throws(()=>install(alias,{a:'one','nested/b':'bad'},'update'),/Symlink/);
 assert.equal(fs.existsSync(path.join(base,'b')),false);
});
test('hardlinked managed files and metadata cannot mutate an external inode',t=>{
 for(const relative of ['a','.harness-lab/state.json']){
  const root=fixtures(t),outside=fixtures(t);install(root,{a:'one'});
  const contents=read(root,relative);
  fs.linkSync(path.join(root,relative),path.join(outside,'linked'));
  assert.throws(()=>install(root,{a:'two'},'update'),/Hardlinked/);
  assert.equal(read(outside,'linked'),contents);
 }
});
test('retired templates retain provenance and user content across newer releases',t=>{
 const root=fixtures(t);install(root,{a:'one',retired:'keep'});
 const before=read(root,'.harness-lab/state.json');
 const result=install(root,{a:'two'},'update',true,'2');
 assert.equal(statuses(result).retired,'retired');assert.equal(read(root,'retired'),'keep');
 rollbackKit(root,result.transactionId,['a'],true);
 assert.equal(read(root,'.harness-lab/state.json'),before);assert.equal(read(root,'retired'),'keep');
});
