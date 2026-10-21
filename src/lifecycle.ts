import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

type Status = 'create' | 'update' | 'unchanged' | 'modified' | 'unmanaged' | 'deleted' | 'retired' | 'skipped' | 'adopted';
type State = { schemaVersion: 1; version: string; files: Record<string, string> };
type Change = { path: string; before: string | null; after: string | null };
type Transaction = { schemaVersion: 1; id: string; beforeState: string | null; afterState: string; changes: Change[] };
export type KitResult = { version: string; applied: boolean; entries: { path: string; status: Status }[]; transactionId?: string };
const META = '.harness-lab';
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function validPath(p: string): void {
  if (!p || path.isAbsolute(p) || p.includes('\\') || p.includes('\0') || p.split('/').some(s => !s || s === '.' || s === '..') || p === META || p.startsWith(`${META}/`)) throw new Error(`Unsafe managed path: ${p}`);
}
// Resolve the explicitly selected root once, including platform aliases (/tmp on macOS).
// All subsequent containment checks and mutations use this actual repository path.
export function resolveKitRoot(rootInput: string): string {
  let ancestor = path.resolve(rootInput);
  const missing: string[] = [];
  while (true) {
    try { fs.lstatSync(ancestor); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      missing.unshift(path.basename(ancestor));
      const parent = path.dirname(ancestor);
      if (parent === ancestor) throw new Error('Cannot resolve repository root');
      ancestor = parent;
    }
  }
  return path.join(fs.realpathSync(ancestor), ...missing);
}
function safe(root: string, relative: string, directory = false): string {
  const parts = relative ? relative.split('/') : [];
  let current = root;
  for (let i = -1; i < parts.length; i++) {
    if (i >= 0) current = path.join(current, parts[i]);
    let stat: fs.Stats;
    try { stat = fs.lstatSync(current); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') continue; throw e; }
    if (stat.isSymbolicLink()) throw new Error(`Symlink is not allowed: ${current}`);
    const wantDirectory = i < parts.length - 1 || directory || i === -1;
    if (wantDirectory ? !stat.isDirectory() : !stat.isFile()) throw new Error(`Unexpected file type: ${current}`);
    if (!wantDirectory && stat.nlink > 1) throw new Error(`Hardlinked file is not allowed: ${current}`);
  }
  return current;
}
function read(root: string, relative: string): string | null {
  const file = safe(root, relative);
  try { return fs.readFileSync(file, 'utf8'); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e; }
}
function parseState(raw: string | null): State | null {
  if (raw === null) return null;
  const state: unknown = JSON.parse(raw);
  if (!object(state) || state.schemaVersion !== 1 || typeof state.version !== 'string' || !state.version || !object(state.files)) throw new Error('Invalid harness state');
  for (const [p, digest] of Object.entries(state.files)) {
    validPath(p);
    if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) throw new Error(`Invalid harness state entry: ${p}`);
  }
  return state as State;
}
// Optional kit files whose path includes a symlink are skipped instead of refusing the whole kit.
function linked(root: string, relative: string): boolean {
  let current = root;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    try { if (fs.lstatSync(current).isSymbolicLink()) return true; } catch (e) { if (['ENOENT', 'ENOTDIR'].includes((e as NodeJS.ErrnoException).code ?? '')) return false; throw e; }
  }
  return false;
}
function preflight(root: string, allowed: Set<string>, optional: Set<string> = new Set()): void {
  safe(root, '', true);
  safe(root, META, true);
  safe(root, `${META}/backups`, true);
  safe(root, `${META}/lock`);
  safe(root, `${META}/state.json`);
  for (const p of allowed) { validPath(p); if (!(optional.has(p) && linked(root, p))) safe(root, p); }
}
function write(root: string, relative: string, content: string | null): void {
  const target = safe(root, relative);
  if (content === null) { if (fs.existsSync(target)) fs.unlinkSync(target); return; }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, { flag: 'w' });
}
function locked<T>(root: string, action: () => T): T {
  safe(root, META, true);
  fs.mkdirSync(path.join(root, META), { recursive: true });
  const lock = safe(root, `${META}/lock`);
  let fd: number;
  try { fd = fs.openSync(lock, 'wx'); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('Another harness mutation holds the lock'); throw e; }
  try { return action(); } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}
function mutate(root: string, changes: Change[], beforeState: string | null, afterState: string | null): void {
  const touched: Change[] = [];
  try {
    for (const change of changes) { touched.push(change); write(root, change.path, change.after); }
    write(root, `${META}/state.json`, afterState);
  } catch (error) {
    const failures: string[] = [];
    for (const change of touched.reverse()) { try { write(root, change.path, change.before); } catch { failures.push(change.path); } }
    try { write(root, `${META}/state.json`, beforeState); } catch { failures.push(`${META}/state.json`); }
    throw new Error(`Mutation failed: ${String(error)}. ${failures.length ? `Recovery incomplete; inspect backup and paths: ${failures.join(', ')}` : 'Original file contents and state restored.'}`);
  }
}
export function installKit(rootInput: string, files: Record<string, string>, options: { version: string; mode: 'init' | 'update' | 'adopt'; apply: boolean; optional?: string[]; initOnly?: string[] }): KitResult {
  const root = resolveKitRoot(rootInput);
  const allowed = new Set(Object.keys(files));
  const optional = new Set(options.optional ?? []);
  const initOnly = new Set(options.initOnly ?? []);
  if (!options.version || !['init', 'update', 'adopt'].includes(options.mode)) throw new Error('Invalid install options');
  for (const content of Object.values(files)) if (typeof content !== 'string') throw new Error('Template contents must be strings');
  const plan = () => {
    preflight(root, allowed, optional);
    const raw = read(root, `${META}/state.json`);
    const state = parseState(raw);
    const next: State = { schemaVersion: 1, version: options.version, files: Object.assign(Object.create(null), state?.files) };
    const entries: KitResult['entries'] = [];
    const changes: Change[] = [];
    for (const [p, content] of Object.entries(files)) {
      if (optional.has(p) && linked(root, p)) { entries.push({ path: p, status: 'skipped' }); continue; }
      const current = read(root, p);
      const baseline = state && Object.hasOwn(state.files, p) ? state.files[p] : undefined;
      // Sample files are created by init only; update and adopt never add them to an existing project.
      if (!baseline && current === null && initOnly.has(p) && options.mode !== 'init') continue;
      let status: Status;
      if (baseline) status = current === null ? 'deleted' : hash(current) !== baseline ? 'modified' : current === content ? 'unchanged' : options.mode === 'update' ? 'update' : 'unchanged';
      else status = current === null ? 'create' : options.mode === 'adopt' && current === content ? 'adopted' : 'unmanaged';
      entries.push({ path: p, status });
      // Adoption records a baseline without changing content (before === after).
      if (status === 'create' || status === 'update' || status === 'adopted') { changes.push({ path: p, before: current, after: content }); next.files[p] = hash(content); }
    }
    for (const p of Object.keys(state?.files ?? {})) if (!allowed.has(p)) entries.push({ path: p, status: 'retired' });
    return { raw, next, entries, changes };
  };
  const initial = plan();
  if (!options.apply) return { version: options.version, applied: false, entries: initial.entries };
  return locked(root, () => {
    const { raw, next, entries, changes } = plan();
    if (!changes.length) return { version: options.version, applied: false, entries };
    const id = randomUUID();
    const afterState = JSON.stringify(next, null, 2) + '\n';
    const transaction: Transaction = { schemaVersion: 1, id, beforeState: raw, afterState, changes };
    const backup = `${META}/backups/${id}`;
    safe(root, backup, true);
    fs.mkdirSync(path.join(root, backup), { recursive: true });
    fs.writeFileSync(safe(root, `${backup}/transaction.json`), JSON.stringify(transaction, null, 2) + '\n', { flag: 'wx' });
    mutate(root, changes, raw, afterState);
    return { version: options.version, applied: true, entries, transactionId: id };
  });
}
export function rollbackKit(rootInput: string, id: string, allowedPaths: string[], apply: boolean, optionalPaths: string[] = []): KitResult {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid transaction ID');
  const root = resolveKitRoot(rootInput);
  const allowed = new Set(allowedPaths);
  const optional = new Set(optionalPaths);
  const plan = () => {
    preflight(root, allowed, optional);
    const raw = read(root, `${META}/backups/${id}/transaction.json`);
    if (raw === null) throw new Error('Transaction not found');
    const tx: unknown = JSON.parse(raw);
    if (!object(tx) || tx.schemaVersion !== 1 || tx.id !== id || !(tx.beforeState === null || typeof tx.beforeState === 'string') || typeof tx.afterState !== 'string' || !Array.isArray(tx.changes) || !tx.changes.length) throw new Error('Invalid transaction metadata');
    const before = parseState(tx.beforeState);
    const after = parseState(tx.afterState)!;
    const seen = new Set<string>();
    for (const change of tx.changes) {
      if (!object(change) || typeof change.path !== 'string' || !(change.before === null || typeof change.before === 'string') || typeof change.after !== 'string') throw new Error('Invalid transaction change');
      validPath(change.path);
      const adoption = change.before === change.after && !before?.files[change.path];
      if (!allowed.has(change.path) || seen.has(change.path) || after.files[change.path] !== hash(change.after) || (change.before !== null && !adoption && before?.files[change.path] !== hash(change.before)) || (change.before === null && before?.files[change.path])) throw new Error('Inconsistent transaction change');
      seen.add(change.path);
      if (read(root, change.path) !== change.after) throw new Error(`Rollback refused: changed file ${change.path}`);
    }
    for (const p of new Set([...Object.keys(before?.files ?? {}), ...Object.keys(after.files)])) {
      if (!seen.has(p) && before?.files[p] !== after.files[p]) throw new Error('Transaction changed state outside recorded files');
    }
    if (read(root, `${META}/state.json`) !== tx.afterState) throw new Error('Rollback refused: current state differs from transaction');
    return { tx: tx as Transaction, version: before?.version ?? after.version };
  };
  const initial = plan();
  const result = (tx: Transaction, version: string, applied: boolean): KitResult => ({ version, applied, transactionId: id, entries: tx.changes.map(c => ({ path: c.path, status: c.before === null ? 'deleted' : c.before === c.after ? 'unmanaged' : 'update' })) });
  if (!apply) return result(initial.tx, initial.version, false);
  return locked(root, () => {
    const { tx, version } = plan();
    mutate(root, tx.changes.map(c => ({ path: c.path, before: c.after, after: c.before })), tx.afterState, tx.beforeState);
    return result(tx, version, true);
  });
}
