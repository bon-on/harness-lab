# Installation, upgrades, and recovery

Requirements: Node.js 22 or newer and npm. Examples use a POSIX shell. No model API key is needed.

## Install a built release

The npm-compatible package is named `@bon-on/harness-lab`, but it is distributed as a versioned GitHub Release asset. It is **not published to the npm registry**; do not use bare `npx @bon-on/harness-lab`.

```bash
npm install --global 'https://github.com/bon-on/harness-lab/releases/download/v0.2.0/bon-on-harness-lab-0.2.0.tgz'
harness-lab --version
harness-lab --help
```

This installs built code and assets without cloning or building the tool. Both `harness-lab` and the compatibility alias `harness` invoke the CLI.

To pin the tool in an existing npm project instead:

```bash
npm install --save-dev 'https://github.com/bon-on/harness-lab/releases/download/v0.2.0/bon-on-harness-lab-0.2.0.tgz'
npx --no-install harness-lab --version
npx --no-install harness-lab init --dry-run
```

Commit `package.json` and the lockfile; teammates can use `npm ci`. For the remaining examples, replace `harness-lab` with `npx --no-install harness-lab` when using a local installation.

The package includes optional skill files, but installing or upgrading the CLI does not copy skills into Claude or Codex. Repo-local `AGENTS.md` and `CLAUDE.md` work without a global skill. Manage any separately installed skill copies deliberately.

## Initialize a project

Run inside your target project, or supply its path after `init`:

```bash
harness-lab init --dry-run
harness-lab init
harness-lab doctor
```

The preview does not write files. Initialization creates missing files and preserves existing ones. The selected repository root is resolved to its actual filesystem location before planning; the CLI reports that path. Symlinks inside managed paths and hardlinked files are rejected. Customize the generated rules, specs and ADRs, and create a project-specific verification config using the [getting-started guide](getting-started.ko.md). If existing agent entry files were preserved, link them to `harness/workflow.md` manually.

Commit `.harness-lab/state.json` alongside project policy. This file records which files the tool created and their baseline hashes. Add these local artifacts to your project's `.gitignore` yourself:

```gitignore
.harness-lab/backups/
.harness-lab/lock
out/
```

Do not ignore all of `.harness-lab/` if you intend to share tracking state with teammates. Backups are local and are not a substitute for Git history.

## Upgrade the executable, then review project templates

Install the chosen release's versioned tarball using the same global or local command as above. Check `harness-lab --version` afterward. This changes the executable only. The CLI does not fetch newer versions or automatically rewrite your projects.

Inside each project, run:

```bash
harness-lab update
harness-lab update --apply
```

`update` is a read-only plan comparing this installed version's templates against the project. `--apply` saves a local transaction backup before applying eligible changes. Keep the transaction ID reported by the command if you may need to undo it.

| Project file | Update behavior |
| --- | --- |
| New template path that does not yet exist | Create and track it |
| Tracked file matching its recorded baseline | Replace it if the installed template changed |
| Tracked file edited locally | Preserve and report it |
| Tracked file deleted locally | Preserve the deletion and report it |
| Existing file without tracking provenance | Preserve it as unmanaged |
| Previously tracked template removed from this release | Preserve the file and its provenance as retired |

There is no force overwrite or automatic merge. Updating can apply eligible files while preserving other files; review the complete plan. A preserved file may need a manual comparison with the installed template to incorporate useful improvements. Changing policy for your project is expected and should not be discarded to make a template update pass.

Projects initialized before provenance tracking was introduced retain their existing files as unmanaged. Neither `init` nor `update` silently adopts them, even if their contents resemble a template. Missing new template files can still be created and tracked. Do not delete project policy just to obtain tracking.

After changes, run your project's verification and audit:

```bash
harness-lab doctor
harness-lab verify
harness-lab check-evidence out/evidence/latest/checks.json .
harness-lab audit . --format text
```

`verify` requires your project's real `harness/verify.json`; generated sample reports are not execution evidence.

## Roll back an applied update

Use the transaction ID returned by `update --apply`:

```bash
harness-lab rollback <transaction-id>
harness-lab rollback <transaction-id> --apply
```

Replace `<transaction-id>` with the actual ID; the first command previews without writing. A successful rollback restores saved originals and the prior tracking state and removes files that transaction created.

Rollback refuses to overwrite affected files or state changed since the update. Preserve newer work and inspect `.harness-lab/backups/` if a restore is refused; resolve the difference deliberately instead of modifying tracking hashes. A transaction's backup must remain available on the machine where you restore it. A teammate who has only committed state does not have your local backup. If a later release no longer recognizes a path in an older transaction, use the matching older executable to review that rollback.

Caught write errors attempt to restore original contents and state. A killed process or machine failure can leave a lock or partial changes; inspect backups and confirm no update is running before recovery. `doctor` reports an existing mutation lock. The updater is not a filesystem-wide atomic transaction or a security sandbox.

## Contributor installation

Use a source checkout when changing harness-lab itself:

```bash
git clone https://github.com/bon-on/harness-lab.git
cd harness-lab
npm ci
npm run build
node dist/index.js --version
npm test
```

The legacy `node dist/index.js init repo-kit --output /path/to/project` remains supported. See [the command reference](commands.md) for complete usage.
