import { readFileSync, existsSync, rmSync, realpathSync, lstatSync } from 'node:fs';
import { resolve, join, relative, dirname, sep } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { digest, escapes, inside, realTarget, reviewState, prepareOutput, writeAtomic, temporary } from './evidence.js';

export type Reviewer = 'codex' | 'claude';
export type CrossReviewOptions = {
  reviewer: Reviewer; base?: string; paths: string[]; spec?: string; model?: string;
  command?: string; timeoutMs: number; output?: string; dryRun: boolean;
};

const reviewers: Record<Reviewer, string> = { codex: 'Codex', claude: 'Claude' };
const bundleFiles = ['prompt.md', 'diff.patch', 'review.md', 'stdout.txt', 'stderr.txt', 'review.json'];
const diffLimit = 200_000;
const verdicts = ['approve with comments', 'request changes', 'approve'];

export function parseCrossReviewArgs(argv: string[]) {
  const options: CrossReviewOptions = { reviewer: undefined as unknown as Reviewer, paths: [], timeoutMs: 1_200_000, dryRun: false };
  const positionals: string[] = [];
  const valued = ['--reviewer', '--base', '--path', '--spec', '--model', '--command', '--timeout-ms', '--output'];
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (flag === '--dry-run') { options.dryRun = true; continue; }
    if (!valued.includes(flag)) {
      if (flag.startsWith('-')) throw new Error(`Unknown option: ${flag}`);
      positionals.push(flag);
      continue;
    }
    const value = argv[++index];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    if (flag === '--reviewer') {
      if (value !== 'codex' && value !== 'claude') throw new Error(`Invalid --reviewer value: ${value} (use codex or claude)`);
      options.reviewer = value;
    } else if (flag === '--path') options.paths.push(value);
    else if (flag === '--timeout-ms') {
      const timeout = Number(value);
      if (!Number.isInteger(timeout) || timeout < 1 || timeout > 3_600_000) throw new Error('--timeout-ms must be 1..3600000');
      options.timeoutMs = timeout;
    } else if (flag === '--base') options.base = value;
    else if (flag === '--spec') options.spec = value;
    else if (flag === '--model') options.model = value;
    else if (flag === '--command') options.command = value;
    else options.output = value;
  }
  if (!options.reviewer) throw new Error('cross-review requires --reviewer codex|claude');
  if (positionals.length > 1) throw new Error('cross-review [repo] --reviewer codex|claude [options]');
  return { root: resolve(positionals[0] ?? '.'), options };
}

// Codex is confined by its read-only OS sandbox. Claude gets only file-reading tools: even "read-only" git
// subcommands can write files (for example `git diff --output=<file>`), so it reads the diff from the bundle instead.
// `output` is the bundle directory when it lies outside the repository and Claude needs it added to read diff.patch.
export function reviewerArgv(reviewer: Reviewer, executable: string, root: string, output: string | null, model: string | undefined, lastMessage: string) {
  if (reviewer === 'codex') {
    return [executable, 'exec', '--sandbox', 'read-only', '--ephemeral', '--skip-git-repo-check', '--color', 'never',
      '-C', root, ...(model ? ['-m', model] : []), '-o', lastMessage, '-'];
  }
  return [executable, '-p', '--output-format', 'text', '--no-session-persistence', '--strict-mcp-config',
    '--permission-mode', 'dontAsk', '--tools', 'Read,Grep,Glob', '--allowedTools', 'Read,Grep,Glob',
    ...(output ? ['--add-dir', output] : []), ...(model ? ['--model', model] : [])];
}

// Listed paths are literal file names, never globs or magic pathspecs such as `:!src`.
// Read-only Git: no optional index refresh (dry runs write nothing) and no fsmonitor hook from the repository config.
const runGit = (root: string, args: string[]) =>
  spawnSync('git', ['-C', root, '-c', 'core.fsmonitor=false', ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: { ...process.env, GIT_LITERAL_PATHSPECS: '1', GIT_OPTIONAL_LOCKS: '0' } });
function git(root: string, args: string[]) {
  const result = runGit(root, args);
  return result.status === 0 ? result.stdout : null;
}

// The target listing and the diff must be complete, so a failure stops the run before the reviewer is called.
function gitRequired(root: string, args: string[]) {
  const result = runGit(root, args);
  if (result.status !== 0) throw new Error(`git ${args[0]} failed: ${(result.error?.message ?? result.stderr).trim().split('\n').at(-1)}`);
  return result.stdout;
}

// Writing the bundle would lose uncommitted edits to tracked files in the output, whichever repository holds it and
// whatever --path selects, so check from the output's deepest existing directory. Status lists staged and unstaged
// changes, including ones that cancel out against HEAD, and works on an unborn branch.
function guardOutput(output: string) {
  let existing = realTarget(output);
  while (!existsSync(existing)) existing = dirname(existing);
  if (!lstatSync(existing).isDirectory()) existing = dirname(existing);
  if (git(existing, ['rev-parse', '--is-inside-work-tree'])?.trim() !== 'true') return;
  const scope = relative(existing, realTarget(output)) || '.';
  if (gitRequired(existing, ['status', '--porcelain', '-z', '--untracked-files=no', '--', scope])) {
    throw new Error('Evidence output contains uncommitted changes to tracked files');
  }
}

// Resolve what to review: listed paths, or the Git diff against base plus untracked files outside the review output.
function reviewTarget(root: string, options: CrossReviewOptions, output: string) {
  const isGit = git(root, ['rev-parse', '--is-inside-work-tree'])?.trim() === 'true';
  if (!isGit && !options.paths.length) throw new Error(`Not a Git repository: ${root}. Pass --path for each file to review.`);
  // In Git a listed path may be a deleted file; it still has to stay inside the repository.
  const paths = options.paths.map(path => {
    try { return relative(root, inside(root, path)); } catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
      if (!isGit) throw new Error(`Review path not found: ${path}`);
      const rel = relative(root, resolve(root, path));
      if (!rel || escapes(rel)) throw new Error(`Unsafe path: ${path}`);
      return rel;
    }
  });
  if (!isGit) return { description: `files ${paths.join(', ')}`, base: null, baseCommit: null, head: null, files: paths, diff: '' };
  const base = options.base ?? 'HEAD';
  const baseCommit = git(root, ['rev-parse', '--verify', '--quiet', `${base}^{commit}`])?.trim();
  if (!baseCommit) throw new Error(`Unknown --base revision: ${base}`);
  const scope = paths.length ? ['--', ...paths] : [];
  // NUL-delimited names are unquoted, so non-ASCII names and names with newlines map to real paths. `--relative` keeps
  // names relative to a root below the Git top level (as `ls-files` already is), and `--no-renames` lists a renamed
  // file's old path too, so it is tracked as absent.
  const tracked = gitRequired(root, ['diff', '-z', '--name-only', '--no-renames', '--relative', baseCommit, ...scope]);
  const untracked = gitRequired(root, ['ls-files', '-z', '--others', '--exclude-standard', ...scope]);
  // Untracked files inside the output are earlier bundles; a tracked change there would be overwritten, so refuse it.
  const realOutput = realTarget(output);
  const insideOutput = (file: string) => !escapes(relative(realOutput, realTarget(resolve(root, file))));
  const untrackedFiles = untracked.split('\0').filter(file => file && !insideOutput(file));
  const trackedFiles = tracked.split('\0').filter(Boolean);
  if (trackedFiles.some(insideOutput)) throw new Error('Evidence output must be outside input scope');
  const files = [...new Set([...trackedFiles, ...untrackedFiles])].sort();
  if (!files.length) throw new Error(`Nothing to review: no changes against ${base}${paths.length ? ' in the listed paths' : ''}`);
  // Raw content only: a textconv driver could fail or hide the real change.
  let diff = gitRequired(root, ['diff', '--no-color', '--no-ext-diff', '--no-textconv', '--relative', baseCommit, ...scope]);
  for (const file of untrackedFiles) diff += `\n--- untracked file: ${file} (read it in full)\n`;
  const scopeText = paths.length ? ` limited to ${paths.join(', ')}` : '';
  return { description: `working tree against ${base} (${baseCommit}) including untracked files${scopeText}`, base, baseCommit, head: git(root, ['rev-parse', 'HEAD'])?.trim() ?? null, files, diff };
}

function fence(text: string) {
  const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map(match => match[0].length));
  return '`'.repeat(longest + 1);
}

function reviewProcedure() {
  const skill = readFileSync(new URL('../skills/harness-review/SKILL.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const frontmatter = /^---\n[\s\S]*?\n---\n+/;
  if (!frontmatter.test(skill)) throw new Error('skills/harness-review/SKILL.md is missing frontmatter');
  return skill.replace(frontmatter, '').trim();
}

function buildPrompt(root: string, options: CrossReviewOptions, target: ReturnType<typeof reviewTarget>, diffFile: string) {
  const truncated = target.diff.length > diffLimit;
  const diff = truncated ? `${target.diff.slice(0, diffLimit)}\n... diff truncated; read the full diff in ${diffFile} ...\n` : target.diff;
  const marker = fence(diff);
  const access = options.reviewer === 'claude'
    ? 'You have only file-reading tools (Read, Grep, Glob); you cannot run commands.'
    : 'Only read files and use read-only commands such as `git diff`, `git log` and `git show`.';
  return `# Cross-model review request

You are ${reviewers[options.reviewer]}, reviewing a change that a different AI model wrote. Act as the independent reviewer described below.
You run non-interactively: do not ask questions, do not edit, create or delete files, and do not run project checks. ${access}
The coordinator's verification evidence covers execution, so report \`Checks run: none (read-only cross-review)\`.
End with the report format below. The last line must be \`Verdict: \` followed by exactly one of approve, approve with comments or request changes.

Repository root: ${root}
Review target: ${target.description}
Full diff file: ${target.diff ? diffFile : 'none (review the listed files in full)'}
Governing spec: ${options.spec ?? 'select the spec whose Scope covers the change from harness/specs/, if the repository has a harness'}
Changed files:
${target.files.map(file => `- ${file}`).join('\n')}

## Review procedure

${reviewProcedure()}
${target.diff ? `
## Diff${truncated ? ' (truncated)' : ''}

${marker}diff
${diff}${diff.endsWith('\n') ? '' : '\n'}${marker}
` : ''}`;
}

function reviewInputs(root: string, files: string[]) {
  const config = join(root, 'harness/verify.json');
  const configured: string[] = existsSync(config) ? JSON.parse(readFileSync(config, 'utf8')).inputs ?? [] : [];
  // lstat, not existsSync: a dangling symlink is present (and rejected as an input), not deleted.
  const present = files.filter(file => { try { lstatSync(join(root, file)); return true; } catch { return false; } });
  const absent = files.filter(file => !present.includes(file));
  // A configured input the change deletes (a file, or a directory whose files are all deleted) is tracked through
  // `absent`; other missing configured inputs still fail.
  const deleted = (input: string) => {
    const name = relative(root, resolve(root, input)).split(sep).join('/');
    return !existsSync(join(root, input)) && absent.some(file => file === name || file.startsWith(`${name}/`));
  };
  const kept = configured.filter(input => !deleted(input));
  return { inputs: [...new Set([...kept, ...present])].sort(), absent };
}

// The last `Verdict:` line decides and must name exactly one verdict, ignoring Markdown emphasis and a final period;
// a copied template listing several options or a conditional approval is not a verdict.
export function lastVerdict(review: string) {
  const line = [...review.matchAll(/^[ \t>*_#-]*verdict\b[ \t*_:]*(.*)$/gim)].at(-1)?.[1];
  const verdict = line?.replace(/[`*_]/g, '').trim().replace(/\.$/, '').trim().toLowerCase();
  return verdicts.find(candidate => candidate === verdict) ?? null;
}

export function countFindings(review: string) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const match of review.matchAll(/\[(Critical|High|Medium|Low)\]/g)) counts[match[1].toLowerCase() as keyof typeof counts]++;
  return counts;
}

type RunResult = { status: number | null; signal: NodeJS.Signals | null; error: Error | null; stdout: Buffer; stderr: Buffer };

// Run the reviewer in its own process group so a timeout or interrupt also stops the processes it spawns
// (the installed `codex` is a Node wrapper around a native binary).
function runReviewer(command: string[], prompt: string, cwd: string, timeoutMs: number): Promise<RunResult> {
  return new Promise(done => {
    const child = spawn(command[0], command.slice(1), { cwd, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout: Buffer[] = [], stderr: Buffer[] = [];
    let timedOut = false;
    const killGroup = () => { try { process.kill(-child.pid!, 'SIGKILL'); } catch { /* already gone */ } };
    const interrupt = () => { killGroup(); process.exit(130); };
    const timer = setTimeout(() => { timedOut = true; killGroup(); }, timeoutMs);
    process.once('SIGINT', interrupt).once('SIGTERM', interrupt);
    const finish = (result: Omit<RunResult, 'stdout' | 'stderr'>) => {
      clearTimeout(timer);
      process.off('SIGINT', interrupt).off('SIGTERM', interrupt);
      done({ ...result, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) });
    };
    child.stdout.on('data', chunk => stdout.push(chunk));
    child.stderr.on('data', chunk => stderr.push(chunk));
    child.on('error', error => finish({ status: null, signal: null, error }));
    child.on('close', (status, signal) => {
      if (!timedOut) killGroup();
      finish({ status, signal, error: timedOut ? new Error(`Reviewer timed out after ${timeoutMs} ms`) : null });
    });
    child.stdin.on('error', () => { /* reviewer exited before reading the prompt */ });
    child.stdin.end(prompt);
  });
}

export async function crossReview(root: string, options: CrossReviewOptions) {
  const outputDir = resolve(options.output ?? join(root, 'out/reviews/latest'));
  const target = reviewTarget(root, options, outputDir);
  guardOutput(outputDir);
  const executable = options.command ?? options.reviewer;
  const diffFile = join(outputDir, 'diff.patch');
  const addDir = escapes(relative(realpathSync.native(root), realTarget(outputDir))) ? outputDir : null;
  if (options.dryRun) {
    const prompt = buildPrompt(root, options, target, diffFile);
    return { dryRun: true, reviewer: options.reviewer, command: reviewerArgv(options.reviewer, executable, root, addDir, options.model, '<last-message-file>'), target: { ...target, diff: undefined }, prompt };
  }
  const { inputs, absent } = reviewInputs(root, target.files);
  const before = reviewState(root, inputs, absent);
  const output = prepareOutput(root, inputs, outputDir, bundleFiles);
  const prompt = buildPrompt(root, options, target, join(output, 'diff.patch'));
  writeAtomic(output, 'prompt.md', prompt);
  writeAtomic(output, 'diff.patch', target.diff);
  const lastMessage = temporary(output, 'last-message.md');
  const command = reviewerArgv(options.reviewer, executable, root, addDir, options.model, lastMessage);
  const startedAt = new Date().toISOString();
  let result: RunResult, review = '';
  try {
    result = await runReviewer(command, prompt, root, options.timeoutMs);
    review = options.reviewer === 'codex' ? (existsSync(lastMessage) ? readFileSync(lastMessage, 'utf8') : '') : result.stdout.toString('utf8');
  } finally { rmSync(lastMessage, { force: true }); }
  writeAtomic(output, 'review.md', review);
  writeAtomic(output, 'stdout.txt', options.reviewer === 'codex' ? result.stdout : '');
  writeAtomic(output, 'stderr.txt', result.stderr);
  let after = {};
  let snapshotError: string | null = null;
  try { after = reviewState(root, inputs, absent); } catch (error) { snapshotError = String(error); }
  const unchanged = JSON.stringify(before) === JSON.stringify(after);
  // Prefer the last error line: CLIs such as codex print a usage summary after the error.
  const stderrLines = result.stderr.toString('utf8').trim().split('\n');
  const stderrTail = ([...stderrLines].reverse().find(line => /error/i.test(line)) ?? stderrLines.at(-1))?.slice(0, 500);
  const error = result.error ? (result.error as NodeJS.ErrnoException).code === 'ENOENT'
    ? `${executable} not found; install the ${reviewers[options.reviewer]} CLI or pass --command` : result.error.message
    : result.status !== 0 ? `Reviewer exited with ${result.status ?? result.signal}${stderrTail ? `: ${stderrTail}` : ''}`
    : snapshotError ?? (review.trim() ? null : 'Reviewer returned no review');
  const record = {
    schemaVersion: 1, kind: 'cross-review', reviewer: options.reviewer, model: options.model ?? null, root, command,
    target: { description: target.description, base: target.base, head: target.head, files: target.files, diffSha256: digest(target.diff), diffTruncated: target.diff.length > diffLimit },
    spec: options.spec ?? null, inputs, absent, before, after, unchanged, startedAt, finishedAt: new Date().toISOString(),
    exitCode: result.status, signal: result.signal, error, verdict: lastVerdict(review), findings: countFindings(review),
    passed: result.status === 0 && !error && unchanged,
    logs: bundleFiles.filter(file => file !== 'review.json').map(file => ({ file, sha256: digest(readFileSync(join(output, file))) })),
    notVerified: ['Correctness of the findings', 'Completeness of the review', 'Execution of project checks'],
  };
  writeAtomic(output, 'review.json', JSON.stringify(record, null, 2) + '\n');
  return { ...record, output };
}
