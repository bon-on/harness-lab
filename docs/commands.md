# Command reference

Install the [built release](installation-updates.md) first. Examples below use `harness-lab`; `harness` is an alias. From a source checkout, `npm ci` and `npm run build` make `node dist/index.js` equivalent.

| Command | Purpose | Example |
| --- | --- | --- |
| `--version` | Print installed CLI version | `harness-lab --version` |
| `detect <repo>` | Detect stack signals and recommend packs | `harness-lab detect . --format md` |
| `init [repo] [--dry-run]` | Create missing harness files; default repo is current directory | `harness-lab init --dry-run` |
| `adopt [repo] [--apply]` | Track an existing harness's template-identical files so `update` can refresh them | `harness-lab adopt --apply` |
| `update [repo] [--apply]` | Preview template changes; apply explicitly | `harness-lab update --apply` |
| `rollback <transaction-id> [repo] [--apply]` | Preview or apply a guarded restore | `harness-lab rollback <transaction-id> --apply` |
| `doctor [repo]` | Read-only project diagnostics; default repo is current directory | `harness-lab doctor` |
| `audit <repo-or-manifest>` | Check rules, links, evidence, and maintenance | `harness-lab audit . --format json` |
| `plan <spec.md>` | Summarize requirements and linked decisions | `harness-lab plan harness/specs/my-feature.md --format text` |
| `verify [repo] [config.json]` | Run a command and collect execution evidence | `harness-lab verify` |
| `check-evidence <checks.json> <repo>` | Validate stored evidence against current source | `harness-lab check-evidence out/evidence/latest/checks.json .` |
| `cross-review [repo] --reviewer codex\|claude` | Run the other model's CLI as a read-only reviewer and record the result | `harness-lab cross-review --reviewer codex` |
| `init repo-kit --output <repo>` | Legacy create-missing-files syntax | `harness-lab init repo-kit --output /path/to/project` |
| `init engineering --output <file>` | Generate a legacy evaluation spec | `harness-lab init engineering --output /tmp/harness-eval.json` |
| `run <eval.json>` | Evaluate supplied mock outputs | `harness-lab run examples/coding-assistant.json --format json` |
| `maturity <eval.json>` | Assess declared harness maturity | `harness-lab maturity examples/coding-assistant.json` |
| `report <eval.json>` | Produce a mock evaluation report | `harness-lab report examples/coding-assistant.json --format md --output out/mock-report.md` |

`update` and `rollback` do not write unless `--apply` is present. `init --dry-run` also previews without writing. Read [ownership and recovery rules](installation-updates.md) before applying updates.

`init`, `update`, `rollback`, and `doctor` accept `--format text`, `json`, or `md`. Update, rollback and doctor reject `--output` to keep their previews read-only. Existing report commands (`detect`, `audit`, `plan`, `run`, `maturity`, `report`) also accept these formats and optional `--output <file>`. `verify` and `check-evidence` print JSON. `verify --output` names a directory, not a report file. Inspect `--help` for syntax.

`verify` defaults to the current repository, its `harness/verify.json`, and its `out/evidence/latest` directory. Explicit config and output paths are resolved from your shell's working directory. The legacy invocation remains supported:

```bash
harness-lab verify /path/to/project /path/to/project/harness/verify.json \
  --output /path/to/project/out/evidence/latest
```

## Verification config

- `command`: nonempty argv array, e.g. `["npm", "test"]`. Shell syntax such as `&&` or pipes is not interpreted. For multiple checks, create a project script and invoke that script.
- `inputs`: nonempty list of existing repo-relative files/directories. Changes, additions, and deletions in this scope invalidate stored evidence. Symlinks and paths outside the repo are rejected. Include the verification config and relevant rules; exclude build output, evidence output, dependencies, and secrets. The evidence output directory must neither lie inside an input nor contain one, after resolving symlinks; for example, `--output .` with `src` as an input is refused. Existing `stdout.txt`, `stderr.txt`, or `checks.json` entries that are symlinks or hardlinks are refused before the command runs.
- `timeoutMs`: integer from 1 to 3,600,000; default 120,000.

The output directory contains `checks.json`, `stdout.txt`, and `stderr.txt`. Reusing a directory replaces the previous bundle. Use different directories if you need history. The checker has a seven-day evidence age limit.

## Cross-review

`cross-review` calls a model; nothing else in harness-lab does. Options:

- `--reviewer codex|claude` (required): the CLI that reviews. Pick the model that did not write the change.
- `--base <ref>`: diff base, default `HEAD`; untracked files are included. `--path <file>` (repeatable) limits the target, and is required without Git.
- `--spec <file>`: governing spec named in the prompt.
- `--model <name>`, `--command <executable>`: model and executable passed to the CLI; use `--command` when the CLI is not on `PATH`.
- `--timeout-ms <n>`: default 1,200,000. `--output <directory>`: default `out/reviews/latest`.
- `--dry-run`: print argv, target and prompt as JSON; writes nothing.

The bundle holds `prompt.md`, `diff.patch`, `review.md`, `stdout.txt`, `stderr.txt` and `review.json`. Claude gets only Read, Grep and Glob and reads the diff from `diff.patch`; Codex runs in its read-only sandbox. A timeout kills the reviewer's process group. Inputs are the `harness/verify.json` inputs plus the existing target files; deleted target files are recorded as `absent` and must stay deleted. Output must lie outside the inputs. The last `Verdict:` line must name exactly one verdict. `check-evidence out/reviews/latest/review.json .` validates the bundle against its recorded inputs only (later changes to other files are not detected) and reports `review-verdict-missing` or `review-requested-changes`. The diff in the prompt is truncated at 200,000 characters.

## Exit codes and automation

`verify`, `check-evidence` and `cross-review` return 1 on failure, 0 on success; `cross-review` also returns 1 when the verdict is missing or `request changes`. `doctor` returns 1 for missing setup, a mutation lock, or blocking audit findings. A successful update may preserve files requiring manual review; inspect its entries even when exit status is 0. Audit returns 1 when policy blocks its findings; `advisory` does not bypass malformed input errors. Read the findings even when exit status is 0. The plan command summarizes blockers; do not use it as a substitute for audit or execution checks.

Run verification before audit when a contract references generated `checks.json`. CI must regenerate evidence after checkout instead of committing a machine-specific bundle. This repo's workflow runs on pushes, pull requests, manual dispatch, and weekly; maintenance warnings are surfaced in the job summary.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| `harness-lab` not found | Check the npm global bin directory is on your PATH, or use a project-local installation with `npx --no-install harness-lab` |
| Update preserves an existing file | The file is unmanaged or locally changed/deleted; compare and integrate deliberately. Re-running init does not adopt it |
| Rollback refuses a change | A file or state changed since the update; inspect the transaction backup and preserve newer work |
| `dist/index.js` not found | Run `npm ci` then `npm run build` in the tool checkout |
| Existing agent instructions were skipped | Add a reference to `harness/workflow.md` in those files (`@harness/workflow.md` in `CLAUDE.md`) and review integration |
| Missing manifest | Initialize a repo kit in the correct target path |
| Missing linked ADR or contract | Match frontmatter IDs and update both forward links and `related_specs` backlinks |
| Verification cannot find an input | Adapt `inputs` to actual project paths; optional nonexistent directories are not ignored |
| Source changed during verification | Keep generated files out of scope; use check-only lint/format commands or run formatters before verification |
| Evidence stale or hashes differ | Rerun meaningful verification against the current source; do not edit hashes |
| Maintenance warning on a new kit | Complete the project review, then record timestamp and summary |
| Detected packs differ from manifest | Review stack changes and update recommendations/approved rules deliberately |

## Known boundaries

Audits check structure and selected content, not the semantic truth of documentation. Existing agent entry points must reference `harness/workflow.md`; an unlinked preserved file is reported as `agent-workflow-unlinked`. A `CLAUDE.md` that mentions the workflow without an `@harness/workflow.md` import is reported as `claude-workflow-not-imported`, because Claude Code does not follow plain links. Agent entry checks establish presence, not that the model followed instructions. Profile detection supports a fixed set of signals. Live-agent benchmarks and automatic instruction cleanup are not implemented. The evidence checker detects accidental drift and tampering against recorded hashes, not a malicious party rewriting the entire bundle.
