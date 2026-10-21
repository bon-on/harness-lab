import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repository = fileURLToPath(new URL('../', import.meta.url));

test('release tarball installs offline and runs independently without development dependencies', t => {
  const temporary = mkdtempSync(join(tmpdir(), 'harness-package-'));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const cache = join(temporary, 'fresh-cache');
  const prefix = join(temporary, 'installation');
  const consumer = join(temporary, 'consumer');
  mkdirSync(consumer);
  function execute(command, args, cwd = consumer, commandCache = cache) {
    const env = { ...process.env, npm_config_cache: commandCache, npm_config_update_notifier: 'false' };
    const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout: 60_000 });
    assert.equal(result.status, 0, `${command} ${args.join(' ')}\n${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
    return result.stdout;
  }

  // npm test already builds. Suppress prepack here to avoid rebuilding in parallel with other tests.
  const [packed] = JSON.parse(execute('npm', [
    'pack', '--json', '--ignore-scripts', '--offline', '--pack-destination', temporary,
  ], repository, join(temporary, 'pack-cache')));
  const files = packed.files.map(file => file.path);
  for (const expected of ['package.json', 'dist/index.js', 'dist/evidence.js', 'bin/harness-lab.mjs',
    'skills/harness-apply/SKILL.md', 'skills/harness-develop/SKILL.md', 'skills/harness-review/SKILL.md', 'README.md', 'LICENSE']) {
    assert.ok(files.includes(expected), `release is missing ${expected}`);
  }
  assert.ok(files.every(file => /^(dist\/|bin\/|skills\/|package\.json$|README(\.en)?\.md$|LICENSE$)/.test(file)),
    `unexpected release files: ${files.join(', ')}`);
  assert.equal(existsSync(cache), false, 'installation must start with a fresh cache');

  execute('npm', ['install', '--prefix', prefix, '--offline', '--ignore-scripts', '--no-audit', '--no-fund',
    '--package-lock=false', join(temporary, packed.filename)]);
  const installed = join(prefix, 'node_modules', '@bon-on', 'harness-lab');
  const metadata = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'));
  assert.equal(metadata.name, '@bon-on/harness-lab');
  assert.equal(metadata.version, '0.2.0');
  assert.equal(metadata.engines.node, '>=22');
  for (const script of ['preinstall', 'install', 'postinstall', 'prepare']) {
    assert.equal(metadata.scripts[script], undefined, `consumer lifecycle script ${script} must not require build tools`);
  }
  for (const dependency of ['typescript', 'tsx', '@types/node']) {
    assert.equal(existsSync(join(prefix, 'node_modules', dependency)), false);
  }
  for (const name of ['harness-lab', 'harness']) {
    const executable = join(prefix, 'node_modules', '.bin', name);
    assert.equal(execute(executable, ['--version']).trim(), '0.2.0');
    assert.match(execute(executable, ['--help']), /init/);
    const preview = JSON.parse(execute(executable, ['init', '--dry-run', '--format', 'json']));
    assert.equal(preview.applied, false);
    assert.deepEqual(readdirSync(consumer), []);
  }
  const executable = join(prefix, 'node_modules', '.bin', 'harness-lab');
  const initialized = JSON.parse(execute(executable, ['init', '--format', 'json']));
  assert.equal(initialized.applied, true);
  assert.match(readFileSync(join(consumer, '.claude/agents/code-reviewer.md'), 'utf8'), /# Harness Review/);
  const doctor = JSON.parse(execute(executable, ['doctor', '--format', 'json']));
  assert.equal(doctor.managed, true);
  const update = JSON.parse(execute(executable, ['update', '--format', 'json']));
  assert.equal(update.applied, false);
});
