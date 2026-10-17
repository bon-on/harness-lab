import { readFileSync, writeFileSync, mkdirSync, readdirSync, lstatSync, openSync, closeSync } from 'node:fs';
import { resolve, relative, dirname, isAbsolute, join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

type Config = { command: string[]; inputs: string[]; timeoutMs?: number };
const digest = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');
function inside(root: string, name: string) {
  const target = resolve(root, name);
  const rel = relative(root, target);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error(`Unsafe path: ${name}`);
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
export function collectEvidence(rootInput: string, configInput: string, outputInput: string) {
  const root = resolve(rootInput);
  const config: Config = JSON.parse(readFileSync(configInput, 'utf8'));
  if (!Array.isArray(config.command) || !config.command.length || !config.command.every(x => typeof x === 'string')) throw new Error('command must be an argv array');
  const timeout = config.timeoutMs ?? 120000;
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 3600000) throw new Error('timeoutMs must be 1..3600000');
  const before = snapshot(root, config.inputs);
  const output = resolve(outputInput);
  if (config.inputs.some(input => { const rel = relative(resolve(root, input), output); return !rel || (!rel.startsWith('..') && !isAbsolute(rel)); })) throw new Error('Evidence output must be outside input scope');
  mkdirSync(output, { recursive: true });
  const stdout = openSync(join(output, 'stdout.txt'), 'w');
  const stderr = openSync(join(output, 'stderr.txt'), 'w');
  const startedAt = new Date().toISOString();
  let result;
  try { result = spawnSync(config.command[0], config.command.slice(1), { cwd: root, shell: false, timeout, killSignal: 'SIGKILL', stdio: ['ignore', stdout, stderr] }); }
  finally { closeSync(stdout); closeSync(stderr); }
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
    logs: ['stdout.txt', 'stderr.txt'].map(file => ({ file, sha256: digest(readFileSync(join(output, file))) })),
    notVerified: ['Meaningfulness of test assertions', 'Factual accuracy', 'Independent review', 'Production behavior'],
  };
  writeFileSync(join(output, 'checks.json'), JSON.stringify(evidence, null, 2) + '\n');
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
