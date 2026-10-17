# harness-lab

**Give Claude and Codex a project-specific workflow they can read, follow, and verify.**

harness-lab is a local TypeScript CLI that adds feature specs, architectural decision records (ADRs), golden rules, and verification evidence to a repository. Keep decisions in Git, make acceptance criteria explicit, and review the harness regularly so instructions stay useful and small.

[한국어 시작 가이드](docs/getting-started.ko.md) · [Command reference](docs/commands.md) · [Contributing](CONTRIBUTING.md)

> Early-stage toolkit. Local CLI behavior is tested; live Claude/Codex instruction compliance is not yet benchmarked. No model API key is required. This tool does not intercept every agent command.

## Install

Requirements: Git, Node.js 22 or newer, and npm. Commands below use a POSIX shell (macOS/Linux).

```bash
git clone https://github.com/bon-on/harness-lab.git
cd harness-lab
npm ci
npm run build
node dist/index.js --help
```

Use the CLI from this checkout. These instructions do not depend on an npm registry release or a global installation.

## Try it in a temporary project

Run from the harness-lab directory:

```bash
DEMO_REPO="$(mktemp -d)"
node dist/index.js init repo-kit --output "$DEMO_REPO"
node dist/index.js audit "$DEMO_REPO" --format text
node dist/index.js plan "$DEMO_REPO/harness/specs/feature-harness-apply.md" --format text
```

The audit reports a pending maintenance review. That is expected: scaffolding files is not a completed project review. Generated specs and narrative reports are examples, not proof that your application works.

## Apply it to your project

Still in the harness-lab directory, replace the path below with an existing repository:

```bash
PROJECT_REPO="/absolute/path/to/your-project"
node dist/index.js detect "$PROJECT_REPO" --format md
node dist/index.js init repo-kit --output "$PROJECT_REPO"
node dist/index.js audit "$PROJECT_REPO" --format text
```

Initialization **preserves existing files** and prints skipped paths. If your project already has `AGENTS.md` or `CLAUDE.md`, add a reference to `harness/workflow.md` yourself; skipped instructions are not merged automatically.

Before starting real work:

1. Edit `harness/rules/golden-rules.md` and `constraints.md` for your architecture, conventions, and test commands.
2. Review `suggestedPacks` in `harness/manifest.json`. Move approved IDs into `approvedPacks` and encode their guidance in the rules. Recommendations never become policy automatically.
3. Adapt the generated feature spec, ADR, and contract, or create new ones using `harness/templates/`. Keep IDs and cross-links consistent. Replace sample report references with actual evidence.
4. Create `harness/verify.json` using your project's real verification command (see below).
5. Commit the agent entry files and harness policy with your project. Keep generated evidence local or in CI artifacts.

Built-in recommendations cover Next.js, React, Kotlin Spring, and Kotlin Ktor. Python/FastAPI and dependency-free Node ESM/test-runner signals are also detected without automatically recommending a policy pack. Other stacks can use the same repo kit with manually authored constraints and checks; detection is not universal.

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

To try a skill without installing it, tell the agent to read the linked `SKILL.md` from your tool checkout. To install it, copy its directory into your environment's skill directory; keep a single maintained version when sharing it across agents. `harness-apply` handles adoption; `harness-develop` handles implementation. Neither grants permission to run production operations.

## Verify actual commands

Create this file in the **target project**, adapting the command and inputs to files that actually exist:

```json
{
  "command": ["npm", "test"],
  "inputs": ["src", "test", "harness", "package.json", "package-lock.json"],
  "timeoutMs": 120000
}
```

Save it as `harness/verify.json`. From the harness-lab checkout:

```bash
node dist/index.js verify "$PROJECT_REPO" "$PROJECT_REPO/harness/verify.json" \
  --output "$PROJECT_REPO/out/evidence/latest"
node dist/index.js check-evidence "$PROJECT_REPO/out/evidence/latest/checks.json" "$PROJECT_REPO"
node dist/index.js audit "$PROJECT_REPO" --format text
```

The command runs in the target repository. Config and output paths are resolved from your shell's working directory, so the examples use absolute paths. `verify` records exit status, timestamps, source hashes, and stdout/stderr hashes. It fails for command errors, timeout, or source changes during execution. `check-evidence` also rejects stale evidence (older than seven days), missing logs, and hash mismatches.

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
npm test
node dist/index.js verify . harness/verify.json --output out/evidence/latest
node dist/index.js check-evidence out/evidence/latest/checks.json .
node dist/index.js audit . --format text
```

`verify` runs `npm test` itself; the first command is useful when you only need a quick test run. A fresh clone has no execution evidence, so run verification before auditing this repository.

The older `run`, `maturity`, and `report` commands remain available for **mock evaluation**. They do not execute live agents; maturity includes self-declared evidence. See the [command reference](docs/commands.md).

## License

[MIT](LICENSE).
