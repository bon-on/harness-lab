# harness-lab

**Give Claude and Codex a project-specific workflow they can read, follow, and verify.**

harness-lab is a local TypeScript CLI that adds feature specs, architectural decision records (ADRs), golden rules, and verification evidence to a repository. Keep decisions in Git, make acceptance criteria explicit, and review the harness regularly so instructions stay useful and small.

[한국어 시작 가이드](docs/getting-started.ko.md) · [Command reference](docs/commands.md) · [Contributing](CONTRIBUTING.md)

> Early-stage toolkit. Local CLI behavior is tested; live Claude/Codex instruction compliance is not yet benchmarked. No model API key is required. This tool does not intercept every agent command.

## Install

Requirements: Node.js 22 or newer and npm. Commands below use a POSIX shell (macOS/Linux).

Install the built **v0.2.0** release; no source checkout or build is needed:

```bash
npm install --global 'https://github.com/bon-on/harness-lab/releases/download/v0.2.0/bon-on-harness-lab-0.2.0.tgz'
harness-lab --version
harness-lab --help
```

The package is distributed through GitHub Releases, **not the npm registry**. Bare `npx @bon-on/harness-lab` is not an installation route. For a project-local installation or contributor setup, see [installation and updates](docs/installation-updates.md).

## Apply it to your project

Run from your existing project's directory:

```bash
harness-lab init --dry-run
harness-lab init
harness-lab doctor
harness-lab audit . --format text
```

Initialization creates missing files and **preserves existing files**. If your project already has `AGENTS.md` or `CLAUDE.md`, add a reference to `harness/workflow.md` yourself; skipped instructions are not merged automatically. You can pass a project path to `init` or `doctor` instead of changing directories.

A new kit's pending maintenance review is expected: scaffolding is not a completed project review. Generated specs and narrative reports are examples, not proof that your application works.

Before starting real work:

1. Adapt `harness/rules/golden-rules.md` and `constraints.md` to your project.
2. Review `suggestedPacks` in `harness/manifest.json`. Move approved IDs into `approvedPacks` and encode their guidance in the rules. Recommendations never become policy automatically.
3. Adapt the generated feature spec, ADR, and contract, or create new ones using `harness/templates/`. Keep IDs and cross-links consistent and replace sample evidence.
4. Create `harness/verify.json` using your project's real verification command (see below).
5. Commit the agent entry files, harness policy, and `.harness-lab/state.json`. Add `out/`, `.harness-lab/backups/`, and `.harness-lab/lock` to your project's `.gitignore`.

Built-in recommendations cover Next.js, React, Kotlin Spring, and Kotlin Ktor. Python/FastAPI and dependency-free Node ESM/test-runner signals are also detected without automatically recommending a policy pack. Other stacks can use manually authored constraints and checks.

## Update safely

Upgrading the CLI and updating a project's templates are separate actions. Install a chosen version's release tarball to upgrade the executable; it does not change project files. Then, in the target project:

```bash
harness-lab update              # read-only preview
harness-lab update --apply      # apply eligible changes and save a local backup
harness-lab rollback <transaction-id>          # read-only preview
harness-lab rollback <transaction-id> --apply  # restore if nothing changed since apply
```

Updates preserve existing unmanaged files and local edits or deletions. Only tool-created files are tracked. Projects initialized before tracking was introduced are not automatically adopted. Review the plan and handle preserved files manually. See [update ownership, backups, and recovery](docs/installation-updates.md).

## Use with Claude or Codex

Open your target project in your agent. `AGENTS.md` and `CLAUDE.md` both direct it to the same repository-local `harness/workflow.md`. A globally installed skill is not required.

Example request:

```text
Implement the feature in harness/specs/my-feature.md.
Read the manifest, linked ADRs and contract, and shared rules first.
Map the acceptance criteria to checks, implement the change, and run verification.
Report the references used, applied packs, constraints, evidence, and unresolved gaps.
Do not claim completion when required checks fail.
```

Source priority is **feature spec → related ADR → constraints → golden rules → general context**. Conflicting decisions must be surfaced rather than silently replaced. An optional [harness-apply skill](skills/harness-apply/SKILL.md) and [reference](skills/harness-apply/references/repo-kit.md) are included for environments that support skill installation.

## Develop from requirements with multiple agents

Use the optional [harness-develop skill](skills/harness-develop/SKILL.md) when you want implementation, rather than policy setup alone. It analyzes requirements, maps each acceptance criterion to a check, assigns independent work with exclusive file ownership, and requires the coordinator to integrate and verify the final result.

```text
Use harness-develop to implement <requirements> in this project.
Read the project harness first, split independent work across available agents,
and report acceptance coverage and integrated verification evidence.
```

See the [workflow and adoption lessons](docs/multi-agent-development.md) for ownership rules and tested boundaries.

The skill uses the host's available agent tools. It does not launch agents by itself or require a new service. If delegation is unavailable or the task is tightly coupled, it explains the single-agent fallback. Projects without Git use explicit write ownership and isolated copies where needed; worktrees are not assumed.

The CLI package includes skill files as assets; installing or upgrading it does not install or update skills in your agent host. To try a skill without installing it, tell the agent to read the linked `SKILL.md` from your tool checkout. To install it, copy its directory into your environment's skill directory; keep a single maintained version when sharing it across agents. `harness-apply` handles adoption; `harness-develop` handles implementation. Neither grants permission to run production operations.

## Verify actual commands

Create this file in the **target project**, adapting the command and inputs to files that actually exist:

```json
{
  "command": ["npm", "test"],
  "inputs": ["src", "test", "harness", "package.json", "package-lock.json"],
  "timeoutMs": 120000
}
```

Save it as `harness/verify.json`. From the target project:

```bash
harness-lab verify
harness-lab check-evidence out/evidence/latest/checks.json .
harness-lab audit . --format text
```

The command runs in the target repository. By default, `verify` uses the target project's `harness/verify.json` and writes `out/evidence/latest` there. Explicit config and `--output` paths resolve from your shell's working directory. `verify` records exit status, timestamps, source hashes, and stdout/stderr hashes. It fails for command errors, timeout, or source changes during execution. `check-evidence` also rejects stale evidence (older than seven days), missing logs, and hash mismatches.

To make audit validate the bundle, add `out/evidence/latest/checks.json` to the relevant contract's `evidence_files` list. Plain Markdown reports are checked for presence only. Add `out/` to your project's `.gitignore`; this repository already ignores its local output.

Only execute trusted verification configs: the command runs with your permissions, without a shell. Keep secrets and generated output out of `inputs`, and inspect logs before sharing them. The timeout limits the direct process, not its whole subprocess tree. Hashes are not signatures, and a zero exit code cannot establish that assertions meaningfully cover the request.

## Keep the harness small

Review every **30 days**, and after repeated failures or stack changes:

- Merge duplicate instructions; keep agent entry points short.
- Review stale specs and ADRs, preserving decision history.
- Remove unused pack guidance and record why.
- Compare instruction size and add regression checks for recurring failures.
- Run verification and audit after changes.

After a real review, update `harness/maintenance.json` with an ISO timestamp in `reviewedAt` and a nonempty `summary`. New kits intentionally leave these pending. Audit warns when the record is missing, invalid, or older than 30 days.

| Policy mode | Audit behavior |
| --- | --- |
| `warn-block-critical` (default) | Warnings are reported; critical findings fail |
| `strict-block` | Warnings and critical findings fail |
| `advisory` | Findings are reported without blocking |

Missing or malformed manifests fail in every mode. Audits run when invoked; the CLI does not install a scheduler. This repository includes [CI and weekly audit checks](.github/workflows/ci.yml), which other repositories must adapt to their own test commands and evidence scope.

## Repository map

| Path | Purpose |
| --- | --- |
| `src/` | CLI, stack detection, static audit, command evidence |
| `test/` | CLI regression tests with isolated temporary projects |
| `harness/` | This project's specs, ADRs, rules, and verification config |
| `examples/repo-kit/` | Example project artifacts; narrative evidence is illustrative |
| `examples/detect/` | Stack detection fixtures |
| `skills/harness-apply/` | Optional skill instructions |
| `docs/` | Usage and command reference |

## Develop and verify this repository

```bash
git clone https://github.com/bon-on/harness-lab.git
cd harness-lab
npm ci
npm test
node dist/index.js verify . harness/verify.json --output out/evidence/latest
node dist/index.js check-evidence out/evidence/latest/checks.json .
node dist/index.js audit . --format text
```

`verify` runs `npm test` itself; the first command is useful when you only need a quick test run. A fresh clone has no execution evidence, so run verification before auditing this repository.

The older `run`, `maturity`, and `report` commands remain available for **mock evaluation**. They do not execute live agents; maturity includes self-declared evidence. See the [command reference](docs/commands.md).

## License

[MIT](LICENSE).
