# harness-lab

[한국어](README.md) · **English**

**Give Claude Code a project-specific workflow it can read, follow, and verify, and keep Codex on the same rules.**

harness-lab is a local TypeScript CLI that adds feature specs, architectural decision records (ADRs), golden rules, an independent code reviewer, and verification evidence to a repository. Claude Code is the primary agent; Codex follows the same repository-local workflow. Keep decisions in Git, make acceptance criteria explicit, and review the harness regularly so instructions stay useful and small.

![Files harness-lab init adds and how an agent works with them](docs/images/harness-structure.svg)

[Korean getting started](docs/getting-started.ko.md) · [Command reference](docs/commands.md) · [Contributing](CONTRIBUTING.md)

> Early-stage toolkit. Local CLI behavior is tested; live Claude/Codex instruction compliance is not yet benchmarked. No model API key is required. This tool does not intercept every agent command.

## What changes when you apply it

| Without a harness | With harness-lab |
| --- | --- |
| You re-explain project rules and forbidden actions every session. | `CLAUDE.md` imports `harness/workflow.md` and `harness/project.md`, so the rules load at session start. |
| What to build lives only in the conversation. | The agent selects a feature spec by its Scope and maps each acceptance criterion to a check. |
| "Done" says nothing about whether tests actually ran. | `verify` records the real command's exit status, source hashes and log hashes; `check-evidence` rejects stale evidence or evidence whose sources changed afterwards. |
| The agent reviews its own code in the context that wrote it. | A read-only `code-reviewer` agent reviews against the spec and ADRs. Critical and High findings are fixed and re-reviewed. |
| The reasons behind design decisions disappear with the chat. | ADRs record alternatives and consequences, and Git preserves their history. |
| Operational scripts or live service calls can be run as if they were tests. | Forbidden commands and safety boundaries in `constraints.md` and `project.md` are checked during implementation and review. |
| Claude and Codex instructions are maintained separately. | `CLAUDE.md` and `AGENTS.md` share the same workflow. |
| Instructions keep growing, and template improvements are copied by hand. | Audit checks the 30-day review record, and `update` refreshes only unmodified managed files, with backups and rollback. |

**Results from real adoption.** Applying it to two existing personal projects (a Node service and a Python tool), filling empty acceptance criteria with tests found:

- a status command that failed with `ReferenceError` because an argument was not passed;
- a unit test that called the real operational CLI instead of a fake.

Independent review also caught that diagnostic code could stretch a cycle past 100 seconds when errors repeated, and it was fixed before release. These cases show what the tool surfaces; they are not a benchmark of its effect.

**Where do I start?**

| Situation | Start with |
| --- | --- |
| Project without a harness | `harness-lab init --dry-run` → `harness-lab init` |
| Project with a hand-written or harness-apply harness | `harness-lab adopt` → `harness-lab adopt --apply` |
| Project already initialized by harness-lab | `harness-lab update` → `harness-lab update --apply` |

In every case, `harness-lab doctor` then tells you what to do next. `adopt` is not in a release yet; see the unreleased-changes note under [Install](#install).

## Install

Requirements: Node.js 22 or newer and npm. Commands below use a POSIX shell (macOS/Linux).

Install the built **v0.2.0** release; no source checkout or build is needed:

```bash
npm install --global 'https://github.com/bon-on/harness-lab/releases/download/v0.2.0/bon-on-harness-lab-0.2.0.tgz'
harness-lab --version
harness-lab --help
```

The package is distributed through GitHub Releases, **not the npm registry**. Bare `npx @bon-on/harness-lab` is not an installation route. For a project-local installation or contributor setup, see [installation and updates](docs/installation-updates.md).

> **Unreleased changes.** v0.2.0 generates a `CLAUDE.md` that links the workflow instead of importing it, and it does not include `harness/project.md`, the `adopt` command, the `code-reviewer` agent, the `harness-review` skill, or scope-based spec selection described below. Until the next release, use them from a source checkout: build it as in [Develop and verify this repository](#develop-and-verify-this-repository), then run `node <checkout>/bin/harness-lab.mjs init` in a new project. A project already initialized with v0.2.0 should run `update` to preview and `update --apply` instead; `init` keeps existing files.

## Apply it to your project

Run from your existing project's directory:

```bash
harness-lab init --dry-run
harness-lab init
harness-lab doctor
harness-lab audit . --format text
```

Initialization creates missing files and **preserves existing files**. If your project already has `AGENTS.md` or `CLAUDE.md`, add a reference to `harness/workflow.md` yourself (in `CLAUDE.md`, use the `@harness/workflow.md` import so Claude Code loads it automatically); skipped instructions are not merged automatically. You can pass a project path to `init` or `doctor` instead of changing directories.

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

Updates preserve existing unmanaged files and local edits or deletions. Only tool-created or explicitly adopted files are tracked. Keep project-specific instructions in `harness/project.md` (and in rules, specs, and ADRs) so the managed entry points, workflow, templates, and reviewer stay template-identical and updatable.

A project whose harness was written by hand or by harness-apply has no tracking yet. Adopt it explicitly:

```bash
harness-lab adopt              # read-only preview: adopted, create, or unmanaged per file
harness-lab adopt --apply      # track template-identical files and create missing ones
```

`adopt` never changes existing files and never adds the sample spec, ADR, contract, or reports. Files that differ from the template stay unmanaged: move their project-specific content into `harness/project.md`, restore the template text, and run `adopt` again. Adoption can be rolled back like an update. See [update ownership, backups, and recovery](docs/installation-updates.md).

## Use with Claude Code

Open your target project in Claude Code. `CLAUDE.md` imports `@harness/workflow.md` and `@harness/project.md`, so the shared workflow and project-specific instructions load at session start. `.claude/agents/code-reviewer.md` adds the independent reviewer. A globally installed skill is not required.

Example request:

```text
Implement the feature in harness/specs/my-feature.md.
Read the manifest, linked ADRs and contract, and shared rules first.
Map the acceptance criteria to checks, implement the change, and run verification.
Report the references used, applied packs, constraints, evidence, and unresolved gaps.
Do not claim completion when required checks fail.
```

Source priority is **feature spec → related ADR → constraints → golden rules → general context**. Conflicting decisions must be surfaced rather than silently replaced. The agent selects the spec whose Scope covers the request; `maintained` specs remain regression baselines. An optional [harness-apply skill](skills/harness-apply/SKILL.md) and [reference](skills/harness-apply/references/repo-kit.md) are included for adoption.

## Develop from requirements with multiple agents

Use the optional [harness-develop skill](skills/harness-develop/SKILL.md) when you want implementation, rather than policy setup alone. It analyzes requirements, maps each acceptance criterion to a check, assigns independent work with exclusive file ownership, and requires the coordinator to integrate and verify the final result.

```text
Use harness-develop to implement <requirements> in this project.
Read the project harness first, split independent work across available agents,
and report acceptance coverage and integrated verification evidence.
```

See the [workflow and adoption lessons](docs/multi-agent-development.md) for ownership rules and tested boundaries.

The skill uses the host's available agent tools. It does not launch agents by itself or require a new service. If delegation is unavailable or the task is tightly coupled, it explains the single-agent fallback. Projects without Git use explicit write ownership and isolated copies where needed; worktrees are not assumed.

The CLI package includes skill files as assets; installing or upgrading it does not install or update skills in your agent host. To try a skill without installing it, tell the agent to read the linked `SKILL.md` from your tool checkout. To install it for Claude Code, copy its directory into `~/.claude/skills/` (all projects) or `.claude/skills/` (one project); for Codex, use its skill directory. Keep a single maintained version when sharing it across agents. `harness-apply` handles adoption, `harness-develop` handles implementation, and `harness-review` handles independent review. None grants permission to run production operations.

## Review changes independently

`init` creates `.claude/agents/code-reviewer.md`, a read-only Claude reviewer that runs on Opus. It follows the [harness-review skill](skills/harness-review/SKILL.md): it reads the governing spec, ADRs and rules, reads changed files in full with their callers and tests, and reports verified findings ranked Critical to Low with file:line, a failure scenario, a suggested fix, acceptance coverage and a verdict. In Codex or other hosts, run the skill in a separate agent.

The shared workflow and harness-develop require this review before implementation is declared complete. Critical and High findings must be fixed and re-reviewed or justified. You can also ask for it directly:

```text
Use the code-reviewer agent to review my working-tree changes against harness/specs/my-feature.md.
```

The agent file is generated from the skill. `update` refreshes an unmodified generated copy and preserves unmanaged or locally edited ones. If `.claude` or `.claude/agents` is a symlink, only this file is skipped. Its Bash access means read-only behavior depends on the instructions, not on a tool restriction.

## Codex compatibility

Codex reads `AGENTS.md`, which points to the same `harness/workflow.md`. The rules, specs, and verification commands are shared; only these differ:

- `AGENTS.md` references the workflow instead of importing it, because Codex has no import syntax.
- Codex does not read `.claude/agents/`. For the required review, run the [harness-review skill](skills/harness-review/SKILL.md) in a separate Codex agent.
- Install skills into Codex's own skill directory if you want them available by name.

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
| `skills/` | `harness-apply`, `harness-develop`, and `harness-review` skills |
| `.claude/` | Generated `code-reviewer` agent and a `skills` link for local development |
| `examples/repo-kit/` | Example project artifacts; narrative evidence is illustrative |
| `examples/detect/` | Stack detection fixtures |
| `docs/` | Usage, command reference, and the structure diagram |

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
