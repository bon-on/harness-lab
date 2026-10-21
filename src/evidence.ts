import { readFileSync, writeFileSync, mkdirSync, readdirSync, lstatSync, openSync, closeSync, realpathSync, renameSync, rmSync } from 'node:fs';
import { resolve, relative, dirname, isAbsolute, join, sep, basename } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

type Config = { command: string[]; inputs: string[]; timeoutMs?: number };
const digest = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');
// A relative path leaves its base only through a whole `..` segment; names such as `..ev` stay inside.
const escapes = (rel: string) => rel === '..' || rel.startsWith(`..${sep}`) || rel.startsWith('../') || isAbsolute(rel);
function inside(root: string, name: string) {
  const target = resolve(root, name);
  const rel = relative(root, target);
  if (!rel || escapes(rel)) throw new Error(`Unsafe path: ${name}`);
  let current = root;
  for (const part of rel.split(/[\\/]/)) {
    current = join(current, part);
    if (lstatSync(current).isSymbolicLink()) throw new Error(`Symlink not allowed: ${name}`);
  }
  return target;
}
export function snapshot(root: string, inputs: string[]) {
  if (!Array.isArray(inputs) || !inputs.length) throw new Error('inputs must be nonempty');
  const files: Record<string, string> = {};
  function visit(name: string) {
    const target = inside(root, name);
    if (lstatSync(target).isDirectory()) for (const child of readdirSync(target).sort()) visit(join(name, child));
    else files[name] = digest(readFileSync(target));
  }
  for (const name of [...inputs].sort()) visit(name);
  if (!Object.keys(files).length) throw new Error('No source files in scope');
  return files;
}
const evidenceFiles = ['stdout.txt', 'stderr.txt', 'checks.json'];
const overlaps = (a: string, b: string) => [relative(a, b), relative(b, a)].some(rel => !escapes(rel));
// Resolve aliases (symlinks and letter case on case-insensitive disks) in the deepest existing ancestor
// so overlap is known before any directory is created.
function realTarget(path: string): string {
  try { return realpathSync.native(path); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || dirname(path) === path) throw error;
    return join(realTarget(dirname(path)), basename(path));
  }
}
// Evidence files are written to fresh temporary files and renamed into place, so an existing link is replaced, never followed.
function assertReplaceable(output: string) {
  for (const name of evidenceFiles) {
    let stat;
    try { stat = lstatSync(join(output, name)); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
    if (stat.isSymbolicLink()) throw new Error(`Symlink not allowed in evidence output: ${name}`);
    if (!stat.isFile()) throw new Error(`Unexpected file type in evidence output: ${name}`);
    if (stat.nlink > 1) throw new Error(`Hardlinked file not allowed in evidence output: ${name}`);
  }
}
const temporary = (output: string, name: string) => join(output, `.${name}.${randomUUID()}.tmp`);
export function collectEvidence(rootInput: string, configInput: string, outputInput: string) {
  const root = resolve(rootInput);
  const config: Config = JSON.parse(readFileSync(configInput, 'utf8'));
  if (!Array.isArray(config.command) || !config.command.length || !config.command.every(x => typeof x === 'string')) throw new Error('command must be an argv array');
  const timeout = config.timeoutMs ?? 120000;
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 3600000) throw new Error('timeoutMs must be 1..3600000');
  const before = snapshot(root, config.inputs);
  const output = resolve(outputInput);
  const realInputs = config.inputs.map(input => realpathSync.native(resolve(root, input)));
  if (realInputs.some(input => overlaps(input, realTarget(output)))) throw new Error('Evidence output must be outside input scope');
  mkdirSync(output, { recursive: true });
  const realOutput = realpathSync.native(output);
  if (realInputs.some(input => overlaps(input, realOutput))) throw new Error('Evidence output must be outside input scope');
  assertReplaceable(realOutput);
  const logs = { 'stdout.txt': temporary(realOutput, 'stdout.txt'), 'stderr.txt': temporary(realOutput, 'stderr.txt') };
  const startedAt = new Date().toISOString();
  let result;
  try {
    const stdout = openSync(logs['stdout.txt'], 'wx');
    const stderr = openSync(logs['stderr.txt'], 'wx');
    try { result = spawnSync(config.command[0], config.command.slice(1), { cwd: root, shell: false, timeout, killSignal: 'SIGKILL', stdio: ['ignore', stdout, stderr] }); }
    finally { closeSync(stdout); closeSync(stderr); }
    for (const [name, file] of Object.entries(logs)) renameSync(file, join(realOutput, name));
  } finally {
    for (const file of Object.values(logs)) rmSync(file, { force: true });
  }
  let after = {};
  let snapshotError: string | null = null;
  try { after = snapshot(root, config.inputs); } catch (error) { snapshotError = String(error); }
  const unchanged = JSON.stringify(before) === JSON.stringify(after);
  const evidence = {
    schemaVersion: 1, kind: 'command-execution', root, inputs: config.inputs,
    command: config.command, startedAt, finishedAt: new Date().toISOString(),
    nodeVersion: process.version, platform: process.platform, arch: process.arch,
    exitCode: result.status, signal: result.signal, error: result.error?.message ?? snapshotError,
    before, after, unchanged, passed: result.status === 0 && !result.error && !snapshotError && unchanged,
    logs: ['stdout.txt', 'stderr.txt'].map(file => ({ file, sha256: digest(readFileSync(join(realOutput, file))) })),
    notVerified: ['Meaningfulness of test assertions', 'Factual accuracy', 'Independent review', 'Production behavior'],
  };
  const checks = temporary(realOutput, 'checks.json');
  try {
    writeFileSync(checks, JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx' });
    renameSync(checks, join(realOutput, 'checks.json'));
  } finally { rmSync(checks, { force: true }); }
  return evidence;
}
export function checkEvidence(filename: string, rootInput: string, maxAgeMs = 7 * 86400000) {
  const issues: string[] = [];
  try {
    const data = JSON.parse(readFileSync(filename, 'utf8'));
    if (data.schemaVersion !== 1 || data.kind !== 'command-execution') throw new Error('Unsupported evidence schema');
    if (!Array.isArray(data.command) || !data.command.length) issues.push('missing-command');
    if (data.exitCode !== 0 || data.signal || data.error || data.passed !== true) issues.push('execution-failed');
    if (data.unchanged !== true || JSON.stringify(data.before) !== JSON.stringify(data.after)) issues.push('source-changed-during-run');
    const finish = Date.parse(data.finishedAt), start = Date.parse(data.startedAt);
    if (!Number.isFinite(start) || !Number.isFinite(finish) || finish < start || finish > Date.now() + 60000 || Date.now() - finish > maxAgeMs) issues.push('stale-or-invalid-time');
    if (JSON.stringify(snapshot(resolve(rootInput), data.inputs)) !== JSON.stringify(data.after)) issues.push('source-hash-mismatch');
    if (!Array.isArray(data.logs) || data.logs.length !== 2 || new Set(data.logs.map((x: {file:string}) => x.file)).size !== 2) throw new Error('Missing logs');
    for (const log of data.logs) {
      if (!['stdout.txt', 'stderr.txt'].includes(log.file)) throw new Error('Invalid log path');
      if (digest(readFileSync(inside(dirname(resolve(filename)), log.file))) !== log.sha256) issues.push('log-hash-mismatch');
    }
  } catch (error) { issues.push(String(error)); }
  return { valid: issues.length === 0, issues };
}
