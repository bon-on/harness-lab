import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, existsSync, chmodSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const cli = resolve('dist/index.js');
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
const git = (root, ...args) => assert.equal(spawnSync('git', ['-C', root, '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args]).status, 0);

// A fake reviewer CLI: reads the prompt from stdin, optionally writes the review to Codex's -o file.
function fakeReviewer(dir, name, body) {
  const file = join(dir, name);
  writeFileSync(file, `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
const prompt = fs.readFileSync(0, 'utf8');
const out = args.includes('-o') ? args[args.indexOf('-o') + 1] : null;
const emit = text => out ? (fs.writeFileSync(out, text), console.log('{"event":"done"}')) : process.stdout.write(text);
${body}
`);
  chmodSync(file, 0o755);
  return file;
}

function project(t, { gitRepo = true, change = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'harness-cross-'));
  const tools = mkdtempSync(join(tmpdir(), 'harness-cross-tools-'));
  t.after(() => { rmSync(root, { recursive: true, force: true }); rmSync(tools, { recursive: true, force: true }); });
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src/a.js'), 'export const a = 1;\n');
  writeFileSync(join(root, '.gitignore'), 'out/\n');
  if (gitRepo) { git(root, 'init', '-q'); git(root, 'add', '.'); git(root, 'commit', '-qm', 'base'); }
  if (change) { writeFileSync(join(root, 'src/a.js'), 'export const a = 2;\n'); writeFileSync(join(root, 'src/new.js'), 'export const b = 3;\n'); }
  return { root, tools };
}
const record = root => JSON.parse(readFileSync(join(root, 'out/reviews/latest/review.json'), 'utf8'));

test('codex cross-review records a read-only run that check-evidence accepts', t => {
  const { root, tools } = project(t);
  const codex = fakeReviewer(tools, 'codex', `emit(prompt.split('\\n')[0] + '\\nFindings: none\\nVerdict: approve\\n');`);
  const result = run('cross-review', root, '--reviewer', 'codex', '--command', codex, '--spec', 'harness/specs/x.md');
  assert.equal(result.status, 0, result.stderr + result.stdout);
  const review = record(root);
  assert.equal(review.kind, 'cross-review');
  assert.equal(review.reviewer, 'codex');
  assert.equal(review.verdict, 'approve');
  assert.equal(review.passed, true);
  assert.deepEqual(review.target.files, ['src/a.js', 'src/new.js']);
  assert.deepEqual(review.command.slice(1, 4), ['exec', '--sandbox', 'read-only']);
  assert.ok(review.command.includes('--ephemeral') && review.command.at(-1) === '-');
  assert.equal(review.command[review.command.indexOf('-C') + 1], review.root);
  assert.match(readFileSync(join(root, 'out/reviews/latest/review.md'), 'utf8'), /^# Cross-model review request/);
  assert.match(readFileSync(join(root, 'out/reviews/latest/stdout.txt'), 'utf8'), /"event":"done"/);
  const prompt = readFileSync(join(root, 'out/reviews/latest/prompt.md'), 'utf8');
  for (const text of ['You are Codex', 'a different AI model', 'Governing spec: harness/specs/x.md', '- src/new.js', '## Verify each finding', '+export const a = 2;', 'untracked file: src/new.js']) {
    assert.ok(prompt.includes(text), `prompt must include ${text}`);
  }
  assert.equal(run('check-evidence', join(root, 'out/reviews/latest/review.json'), root).status, 0);
  writeFileSync(join(root, 'src/a.js'), 'export const a = 4;\n');
  const stale = run('check-evidence', join(root, 'out/reviews/latest/review.json'), root);
  assert.equal(stale.status, 1);
  assert.match(stale.stdout, /source-hash-mismatch/);
});

test('claude cross-review reports request changes and findings, and check-evidence flags them', t => {
  const { root, tools } = project(t);
  const claude = fakeReviewer(tools, 'claude', `emit('1. [High] src/a.js:1 - wrong\\n2. [Low] src/a.js:1 - nit\\n**Verdict:** request changes\\n');`);
  const result = run('cross-review', root, '--reviewer', 'claude', '--command', claude, '--model', 'opus');
  assert.equal(result.status, 1);
  const review = record(root);
  assert.equal(review.passed, true);
  assert.equal(review.verdict, 'request changes');
  assert.deepEqual(review.findings, { critical: 0, high: 1, medium: 0, low: 1 });
  for (const flag of ['-p', '--no-session-persistence', '--strict-mcp-config', 'dontAsk']) assert.ok(review.command.includes(flag), flag);
  // Even "read-only" git subcommands can write files (git diff --output), so Claude gets no Bash at all.
  assert.equal(review.command[review.command.indexOf('--tools') + 1], 'Read,Grep,Glob');
  assert.equal(review.command[review.command.indexOf('--allowedTools') + 1], 'Read,Grep,Glob');
  assert.ok(!review.command.includes('--add-dir'), 'the default output is inside the repository');
  assert.match(readFileSync(join(root, 'out/reviews/latest/diff.patch'), 'utf8'), /\+export const a = 2;/);
  assert.equal(review.command[review.command.indexOf('--model') + 1], 'opus');
  const checked = run('check-evidence', join(root, 'out/reviews/latest/review.json'), root);
  assert.equal(checked.status, 1);
  assert.match(checked.stdout, /review-requested-changes/);
});

test('a reviewer that edits sources, fails, times out or says nothing does not pass', t => {
  const cases = [
    ['edits', `fs.writeFileSync('src/a.js', 'tampered'); emit('Verdict: approve');`, /"unchanged": false/],
    ['fails', `process.stderr.write('usage limit reached'); process.exit(3);`, /Reviewer exited with 3: usage limit reached/],
    ['silent', ``, /Reviewer returned no review/],
    ['slow', `setTimeout(() => emit('Verdict: approve'), 10000);`, /Reviewer timed out after 1500 ms/],
  ];
  for (const [name, body, expected] of cases) {
    const { root, tools } = project(t);
    const result = run('cross-review', root, '--reviewer', 'codex', '--command', fakeReviewer(tools, 'codex', body), '--timeout-ms', '1500');
    assert.equal(result.status, 1, name);
    assert.match(result.stdout, expected, name);
    assert.equal(record(root).passed, false, name);
    assert.equal(run('check-evidence', join(root, 'out/reviews/latest/review.json'), root).status, 1, name);
  }
  const { root } = project(t);
  const missing = run('cross-review', root, '--reviewer', 'claude', '--command', join(root, 'no-such-claude'));
  assert.equal(missing.status, 1);
  assert.match(missing.stdout, /not found; install the Claude CLI or pass --command/);
});

test('a timeout also stops processes the reviewer spawned', t => {
  const { root, tools } = project(t);
  const marker = join(tools, 'grandchild-survived');
  const wrapper = fakeReviewer(tools, 'codex', `require('node:child_process').spawn(process.execPath, ['-e', 'setTimeout(() => require("node:fs").writeFileSync(${JSON.stringify(marker)}, "x"), 2500)'], { stdio: 'ignore' }); setTimeout(() => {}, 10000);`);
  const result = run('cross-review', root, '--reviewer', 'codex', '--command', wrapper, '--timeout-ms', '800');
  assert.equal(result.status, 1);
  assert.match(result.stdout, /timed out/);
  spawnSync(process.execPath, ['-e', 'setTimeout(() => {}, 3000)']);
  assert.equal(existsSync(marker), false, 'the grandchild must be killed with the reviewer');
});

test('verdicts: missing or template verdicts fail, and tampered bundles are rejected', t => {
  for (const [name, text] of [['missing', '1. [Critical] src/a.js:1 - cut off'], ['template', 'Verdict: approve | approve with comments | request changes'], ['heading', '## Verdict\\n\\nApprove only after fixing #1'], ['listed', 'Verdict: approve, approve with comments or request changes'], ['conditional', 'Verdict: approve only after fixing the High findings']]) {
    const { root, tools } = project(t);
    const result = run('cross-review', root, '--reviewer', 'claude', '--command', fakeReviewer(tools, 'claude', `emit(${JSON.stringify(text)});`));
    assert.equal(result.status, 1, name);
    assert.equal(record(root).verdict, null, name);
    const checked = run('check-evidence', join(root, 'out/reviews/latest/review.json'), root);
    assert.equal(checked.status, 1, name);
    assert.match(checked.stdout, /review-verdict-missing/, name);
  }
  const { root, tools } = project(t);
  assert.equal(run('cross-review', root, '--reviewer', 'claude', '--command', fakeReviewer(tools, 'claude', `emit('Review\\n> **Verdict:** Approve with comments.');`)).status, 0);
  assert.equal(record(root).verdict, 'approve with comments');
  assert.equal(run('cross-review', root, '--reviewer', 'claude', '--command', fakeReviewer(tools, 'claude', "emit('Verdict: `request changes`');")).status, 1);
  assert.equal(record(root).verdict, 'request changes', 'backticks around the verdict are ignored');
  writeFileSync(join(root, 'out/reviews/latest/review.md'), 'Verdict: approve');
  const tampered = run('check-evidence', join(root, 'out/reviews/latest/review.json'), root);
  assert.equal(tampered.status, 1);
  assert.match(tampered.stdout, /log-hash-mismatch/);
});

test('large diffs are truncated in the prompt but kept whole in diff.patch, and fences outlast backticks', t => {
  const { root, tools } = project(t);
  writeFileSync(join(root, 'src/a.js'), 'const s = `````;\n' + 'x'.repeat(250_000) + '\n');
  const codex = fakeReviewer(tools, 'codex', `emit('Verdict: approve');`);
  assert.equal(run('cross-review', root, '--reviewer', 'codex', '--command', codex).status, 0);
  const prompt = readFileSync(join(root, 'out/reviews/latest/prompt.md'), 'utf8');
  assert.equal(record(root).target.diffTruncated, true);
  assert.match(prompt, /diff truncated; read the full diff in .*out\/reviews\/latest\/diff\.patch/);
  assert.match(prompt, /^``````diff$/m, 'the fence must be longer than the five backticks in the diff');
  assert.ok(readFileSync(join(root, 'out/reviews/latest/diff.patch'), 'utf8').length > 250_000);
});

test('repeated runs do not review their own output when out/ is not ignored', t => {
  const { root, tools } = project(t);
  rmSync(join(root, '.gitignore'));
  const codex = fakeReviewer(tools, 'codex', `emit('Verdict: approve');`);
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = run('cross-review', root, '--reviewer', 'codex', '--command', codex);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(record(root).target.files.every(file => !file.startsWith('out/')), record(root).target.files.join(', '));
  }
});

test('dry-run prints the prompt and argv without calling the reviewer or writing files', t => {
  const { root, tools } = project(t);
  const marker = join(tools, 'called');
  const codex = fakeReviewer(tools, 'codex', `fs.writeFileSync(${JSON.stringify(marker)}, 'x'); emit('Verdict: approve');`);
  const result = run('cross-review', root, '--reviewer', 'codex', '--command', codex, '--dry-run');
  assert.equal(result.status, 0, result.stderr);
  const preview = JSON.parse(result.stdout);
  assert.equal(preview.dryRun, true);
  assert.match(preview.prompt, /# Cross-model review request/);
  assert.equal(preview.command[0], codex);
  assert.equal(existsSync(marker), false);
  assert.equal(existsSync(join(root, 'out')), false);
});

test('targets: arguments, empty diffs, non-Git projects and paths are validated before any call', t => {
  const { root, tools } = project(t);
  const marker = join(tools, 'called');
  const codex = fakeReviewer(tools, 'codex', `fs.writeFileSync(${JSON.stringify(marker)}, 'x'); emit('Verdict: approve');`);
  for (const [args, message] of [
    [[], /requires --reviewer/],
    [['--reviewer', 'gemini'], /Invalid --reviewer value/],
    [['--reviewer', 'codex', '--force'], /Unknown option: --force/],
    [['--reviewer', 'codex', '--base'], /Missing value for --base/],
    [['--reviewer', 'codex', '--timeout-ms', '0'], /--timeout-ms must be/],
    [['--reviewer', 'codex', '--base', 'no-such-ref'], /Unknown --base revision/],
    [['--reviewer', 'codex', '--path', '../outside.js'], /Unsafe path/],
    [['--reviewer', 'codex', '--path', 'src/missing.js'], /Nothing to review: no changes against HEAD in the listed paths/],
  ]) {
    const result = run('cross-review', root, ...args, '--command', codex);
    assert.notEqual(result.status, 0, args.join(' '));
    assert.match(result.stderr, message, args.join(' '));
  }
  const clean = project(t, { change: false });
  assert.match(run('cross-review', clean.root, '--reviewer', 'codex', '--command', codex).stderr, /Nothing to review/);
  const plain = project(t, { gitRepo: false, change: false });
  assert.match(run('cross-review', plain.root, '--reviewer', 'codex', '--command', codex).stderr, /Not a Git repository/);
  assert.equal(existsSync(marker), false, 'validation failures must not call the reviewer');

  const scoped = run('cross-review', root, '--reviewer', 'codex', '--command', codex, '--path', 'src/new.js');
  assert.equal(scoped.status, 0, scoped.stderr);
  assert.deepEqual(record(root).target.files, ['src/new.js']);
  const listed = run('cross-review', plain.root, '--reviewer', 'codex', '--command', codex, '--path', 'src/a.js');
  assert.equal(listed.status, 0, listed.stderr);
  assert.deepEqual(record(plain.root).target.files, ['src/a.js']);
  assert.equal(run('cross-review', plain.root, '--reviewer', 'codex', '--command', codex, '--path', join(plain.root, 'src/a.js')).status, 0);
  assert.deepEqual(record(plain.root).target.files, ['src/a.js'], 'absolute paths are stored relative to the repository');
  assert.equal(record(plain.root).target.base, null);
});

test('review output refuses links and input overlap like verify', t => {
  const { root, tools } = project(t);
  const codex = fakeReviewer(tools, 'codex', `emit('Verdict: approve');`);
  mkdirSync(join(root, 'out/reviews/latest'), { recursive: true });
  symlinkSync('../../../src/a.js', join(root, 'out/reviews/latest/review.md'));
  const linked = run('cross-review', root, '--reviewer', 'codex', '--command', codex);
  assert.notEqual(linked.status, 0);
  assert.match(linked.stderr, /Symlink not allowed in evidence output/);
  assert.equal(readFileSync(join(root, 'src/a.js'), 'utf8'), 'export const a = 2;\n');
  mkdirSync(join(root, 'harness'));
  writeFileSync(join(root, 'harness/verify.json'), JSON.stringify({ command: ['true'], inputs: ['src'] }));
  const inside = run('cross-review', root, '--reviewer', 'codex', '--command', codex, '--output', join(root, 'src/review'));
  assert.notEqual(inside.status, 0);
  assert.match(inside.stderr, /outside input scope/);
  assert.equal(existsSync(join(root, 'src/review')), false);
});

test('targets: non-ASCII and newline file names are tracked as real paths', t => {
  const { root, tools } = project(t, { change: false });
  writeFileSync(join(root, 'src/한글.js'), 'export const k = 1;\n');
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'korean');
  writeFileSync(join(root, 'src/한글.js'), 'export const k = 2;\n');
  writeFileSync(join(root, 'src/새 파일.js'), 'export const n = 1;\n');
  writeFileSync(join(root, 'src/line\nbreak.js'), 'export const l = 1;\n');
  const result = run('cross-review', root, '--reviewer', 'claude', '--command', fakeReviewer(tools, 'claude', `emit('Verdict: approve');`));
  assert.equal(result.status, 0, result.stderr);
  const files = ['src/line\nbreak.js', 'src/새 파일.js', 'src/한글.js'];
  assert.deepEqual(record(root).target.files, files);
  for (const file of files) assert.ok(record(root).inputs.includes(file), file);
  writeFileSync(join(root, 'src/한글.js'), 'export const k = 3;\n');
  assert.match(run('check-evidence', join(root, 'out/reviews/latest/review.json'), root).stdout, /source-hash-mismatch/);
});

test('targets: deletion-only changes are reviewed and must stay deleted', t => {
  for (const args of [[], ['--path', 'src/a.js']]) {
    const { root, tools } = project(t, { change: false });
    rmSync(join(root, 'src/a.js'));
    const result = run('cross-review', root, '--reviewer', 'claude', ...args, '--command', fakeReviewer(tools, 'claude', `emit('Verdict: approve');`));
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(record(root).inputs, []);
    assert.deepEqual(record(root).absent, ['src/a.js']);
    assert.match(readFileSync(join(root, 'out/reviews/latest/diff.patch'), 'utf8'), /deleted file/);
    const evidence = join(root, 'out/reviews/latest/review.json');
    assert.equal(run('check-evidence', evidence, root).status, 0);
    writeFileSync(join(root, 'src/a.js'), 'back\n');
    assert.match(run('check-evidence', evidence, root).stdout, /source-hash-mismatch/);
  }
  const configured = project(t, { change: false });
  mkdirSync(join(configured.root, 'harness'));
  writeFileSync(join(configured.root, 'harness/verify.json'), JSON.stringify({ command: ['true'], inputs: ['src'] }));
  git(configured.root, 'add', '.'); git(configured.root, 'commit', '-qm', 'config');
  rmSync(join(configured.root, 'src/a.js'));
  const emptied = run('cross-review', configured.root, '--reviewer', 'claude', '--command', fakeReviewer(configured.tools, 'claude', `emit('Verdict: approve');`));
  assert.equal(emptied.status, 0, emptied.stderr);
  assert.deepEqual(record(configured.root).absent, ['src/a.js']);
  assert.equal(run('check-evidence', join(configured.root, 'out/reviews/latest/review.json'), configured.root).status, 0);
  const direct = project(t, { change: false });
  mkdirSync(join(direct.root, 'harness'));
  mkdirSync(join(direct.root, 'docs'));
  writeFileSync(join(direct.root, 'docs/x.md'), 'doc\n');
  writeFileSync(join(direct.root, 'harness/verify.json'), JSON.stringify({ command: ['true'], inputs: ['./src/a.js', 'docs', 'harness'] }));
  git(direct.root, 'add', '.'); git(direct.root, 'commit', '-qm', 'config');
  rmSync(join(direct.root, 'src/a.js'));
  rmSync(join(direct.root, 'docs'), { recursive: true });
  const deletedInput = run('cross-review', direct.root, '--reviewer', 'claude', '--command', fakeReviewer(direct.tools, 'claude', `emit('Verdict: approve');`));
  assert.equal(deletedInput.status, 0, deletedInput.stderr);
  assert.deepEqual([record(direct.root).inputs, record(direct.root).absent], [['harness'], ['docs/x.md', 'src/a.js']]);
  writeFileSync(join(direct.root, 'src/a.js'), 'back\n');
  assert.match(run('check-evidence', join(direct.root, 'out/reviews/latest/review.json'), direct.root).stdout, /source-hash-mismatch/);
  const { root } = project(t, { change: false });
  assert.match(run('cross-review', root, '--reviewer', 'claude', '--path', '../outside.js', '--dry-run').stderr, /Unsafe path/);
  const plain = project(t, { gitRepo: false, change: false });
  assert.match(run('cross-review', plain.root, '--reviewer', 'claude', '--path', 'src/missing.js', '--dry-run').stderr, /Review path not found/);
});

test('targets: renames track the old path and a subdirectory root uses its own paths', t => {
  const { root, tools } = project(t, { change: false });
  git(root, 'mv', 'src/a.js', 'src/renamed.js');
  const reviewer = fakeReviewer(tools, 'claude', `emit('Verdict: approve');`);
  assert.equal(run('cross-review', root, '--reviewer', 'claude', '--command', reviewer).status, 0);
  assert.deepEqual(record(root).target.files, ['src/a.js', 'src/renamed.js']);
  assert.deepEqual(record(root).absent, ['src/a.js']);
  const evidence = join(root, 'out/reviews/latest/review.json');
  writeFileSync(join(root, 'src/a.js'), 'export const a = 1;\n');
  assert.match(run('check-evidence', evidence, root).stdout, /source-hash-mismatch/);

  const sub = project(t, { change: false });
  writeFileSync(join(sub.root, 'src/a.js'), 'export const a = 2;\n');
  writeFileSync(join(sub.root, 'top.js'), 'outside the subdirectory\n');
  const src = join(sub.root, 'src');
  const result = run('cross-review', src, '--reviewer', 'claude', '--command', reviewer, '--output', join(sub.root, 'out/sub'));
  assert.equal(result.status, 0, result.stderr);
  const subRecord = JSON.parse(readFileSync(join(sub.root, 'out/sub/review.json'), 'utf8'));
  assert.deepEqual(subRecord.target.files, ['a.js']);
  assert.deepEqual(subRecord.inputs, ['a.js']);
  assert.deepEqual(subRecord.absent, []);
  writeFileSync(join(sub.root, 'src/a.js'), 'export const a = 3;\n');
  assert.match(run('check-evidence', join(sub.root, 'out/sub/review.json'), src).stdout, /source-hash-mismatch/);
});

test('targets: listed paths are literal, and the bundle never overwrites tracked edits', t => {
  const { root, tools } = project(t);
  const reviewer = fakeReviewer(tools, 'claude', `emit('Verdict: approve.');`);
  for (const path of ['src/*', ':!src/a.js']) {
    assert.match(run('cross-review', root, '--reviewer', 'claude', '--path', path, '--command', reviewer).stderr, /Nothing to review/, path);
  }
  mkdirSync(join(root, 'reports'));
  writeFileSync(join(root, 'reports/review.md'), 'old bundle\n');
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'tracked bundle');
  rmSync(join(root, 'reports/review.md'));
  writeFileSync(join(root, 'src/a.js'), 'export const a = 3;\n');
  assert.match(run('cross-review', root, '--reviewer', 'claude', '--output', join(root, 'reports'), '--command', reviewer).stderr, /outside input scope/);
  writeFileSync(join(root, 'reports/review.md'), 'old bundle, edited\n');
  for (const output of ['reports', 'src', '.']) {
    assert.match(run('cross-review', root, '--reviewer', 'claude', '--output', join(root, output), '--command', reviewer).stderr, /outside input scope/, output);
  }
  assert.match(run('cross-review', root, '--reviewer', 'claude', '--path', 'src/a.js', '--output', join(root, 'reports'), '--command', reviewer).stderr, /uncommitted changes to tracked files/, 'scoped review');
  const sub = run('cross-review', join(root, 'src'), '--reviewer', 'claude', '--output', join(root, 'reports'), '--command', reviewer);
  assert.match(sub.stderr, /uncommitted changes to tracked files/, 'subdirectory root with a sibling output');
  writeFileSync(join(root, 'reports/review.md'), 'staged\n');
  git(root, 'add', 'reports/review.md');
  writeFileSync(join(root, 'reports/review.md'), 'old bundle\n');
  assert.match(run('cross-review', root, '--reviewer', 'claude', '--path', 'src/a.js', '--output', join(root, 'reports'), '--command', reviewer).stderr, /uncommitted changes to tracked files/, 'staged change cancelled in the working tree');
  git(root, 'reset', '-q', 'reports/review.md');
  writeFileSync(join(root, 'reports/review.md'), 'old bundle, edited\n');
  const other = project(t, { change: false });
  const plainDir = mkdtempSync(join(tmpdir(), 'harness-cross-plain-'));
  t.after(() => rmSync(plainDir, { recursive: true, force: true }));
  writeFileSync(join(plainDir, 'a.js'), 'x\n');
  writeFileSync(join(other.root, 'src/a.js'), 'edited in another repository\n');
  const foreign = run('cross-review', plainDir, '--reviewer', 'claude', '--path', 'a.js', '--output', join(other.root, 'src'), '--command', reviewer);
  assert.match(foreign.stderr, /uncommitted changes to tracked files/, 'output inside another repository');
  assert.equal(readFileSync(join(root, 'reports/review.md'), 'utf8'), 'old bundle, edited\n', 'a tracked edit is never overwritten');
  assert.equal(existsSync(join(root, 'reports/review.json')), false);
});

test('targets: a dangling symlink target is rejected before the model runs', t => {
  const { root, tools } = project(t, { change: false });
  rmSync(join(root, 'src/a.js'));
  symlinkSync('missing', join(root, 'src/a.js'));
  const marker = join(tools, 'called');
  const result = run('cross-review', root, '--reviewer', 'claude', '--command', fakeReviewer(tools, 'claude', `fs.writeFileSync(${JSON.stringify(marker)}, 'x'); emit('Verdict: approve');`));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Symlink not allowed/);
  assert.equal(existsSync(marker), false);
});

test('targets: the diff ignores textconv drivers, and a directory replaced by a file is reviewable', t => {
  const { root, tools } = project(t);
  writeFileSync(join(root, '.gitattributes'), '*.js diff=broken\n');
  git(root, 'config', 'diff.broken.textconv', 'false');
  const reviewer = fakeReviewer(tools, 'claude', `emit('Verdict: approve');`);
  const result = run('cross-review', root, '--reviewer', 'claude', '--command', reviewer);
  assert.equal(result.status, 0, result.stderr);
  assert.match(readFileSync(join(root, 'out/reviews/latest/diff.patch'), 'utf8'), /\+export const a = 2;/);

  const replaced = project(t, { change: false });
  mkdirSync(join(replaced.root, 'src/config'));
  writeFileSync(join(replaced.root, 'src/config/settings.js'), 'x\n');
  git(replaced.root, 'add', '.'); git(replaced.root, 'commit', '-qm', 'dir');
  rmSync(join(replaced.root, 'src/config'), { recursive: true });
  writeFileSync(join(replaced.root, 'src/config'), 'now a file\n');
  for (const args of [[], ['--path', 'src/config/settings.js']]) {
    const out = run('cross-review', replaced.root, '--reviewer', 'claude', ...args, '--command', reviewer);
    assert.equal(out.status, 0, out.stderr);
    assert.ok(record(replaced.root).absent.includes('src/config/settings.js'));
  }
  assert.equal(run('check-evidence', join(replaced.root, 'out/reviews/latest/review.json'), replaced.root).status, 0);
});

test('targets: a failing git diff stops the run before the reviewer is called', t => {
  const { root, tools } = project(t);
  // Name-only diffs compare object ids; the patch needs the base blob, so removing it makes only the patch fail.
  const blob = spawnSync('git', ['-C', root, 'rev-parse', 'HEAD:src/a.js'], { encoding: 'utf8' }).stdout.trim();
  rmSync(join(root, '.git/objects', blob.slice(0, 2), blob.slice(2)), { force: true });
  const marker = join(tools, 'called');
  const result = run('cross-review', root, '--reviewer', 'claude', '--command', fakeReviewer(tools, 'claude', `fs.writeFileSync(${JSON.stringify(marker)}, 'x'); emit('Verdict: approve');`));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /git diff failed/);
  assert.equal(existsSync(marker), false);
});

test('failures: the error line is reported even when the CLI prints a summary after it', t => {
  const { root, tools } = project(t);
  const codex = fakeReviewer(tools, 'codex', `process.stderr.write('ERROR: usage limit reached\\ntokens used\\n48,695\\n'); process.exit(1);`);
  const result = run('cross-review', root, '--reviewer', 'codex', '--command', codex);
  assert.equal(result.status, 1);
  assert.equal(record(root).error, 'Reviewer exited with 1: ERROR: usage limit reached');
});
