---
id: cross-review
title: Cross-model review with recorded evidence
status: active
related_adrs:
  - cross-review
  - code-review
  - evidence
related_contracts:
  - cross-review
required_evidence:
  - cli-tests
---
# Cross-model review
## Problem
The independent reviewer runs on the same model family that wrote the change, and its report is a narrative the author relays. Users who have both Claude Code and Codex installed cannot get the other model's review as a reproducible, checkable record.
## Scope
- In scope: a `harness-lab cross-review` command that runs the Codex or Claude CLI as a read-only reviewer with the packaged `harness-review` procedure, records the run as evidence, and lets `check-evidence` validate it; workflow, docs and tests.
- Out of scope: other providers (Gemini, local models), model API keys, automatic author detection, applying fixes, making cross-review mandatory for every project.
## Acceptance Criteria
- AC1 `harness-lab cross-review [repo] --reviewer codex|claude` accepts `--base <ref>`, repeatable `--path <file>`, `--spec <file>`, `--model <name>`, `--command <executable>`, `--timeout-ms <n>`, `--output <dir>` and `--dry-run`. `--reviewer` is required; unknown options and invalid values fail before any model call.
- AC2 The target is the Git diff against `--base` (default `HEAD`) including untracked files, or the listed `--path` files. Without Git, `--path` is required and listed files must exist; in Git a listed path may be a deleted file and is matched literally, never as a glob or pathspec. Renames list both the old and the new path. File names are read NUL-delimited, so non-ASCII names and names with newlines are real paths. An empty target fails without calling a model. Paths must stay inside the repository.
- AC3 The prompt contains the packaged `harness-review` procedure, the repository root, the exact target, the governing spec when given, the changed file list and the diff, fenced longer than any backtick run in it and truncated beyond 200,000 characters with a pointer to the full `diff.patch`. It tells the reviewer it is reviewing another model's change, that it must not edit files or run project checks, and to end with a single `Verdict:` line.
- AC4 Codex runs as `codex exec --sandbox read-only --ephemeral --skip-git-repo-check --color never -C <repo> -o <file> -`; Claude runs as `claude -p --output-format text --no-session-persistence --strict-mcp-config --permission-mode dontAsk --tools Read,Grep,Glob` with only those tools allowed (no Bash: git subcommands such as `git diff --output` can write files), plus `--add-dir <output>` when the bundle lies outside the repository. The prompt goes through stdin, no shell is used, and a timeout or interrupt kills the reviewer's whole process group.
- AC5 The output directory (default `out/reviews/latest`) receives `prompt.md`, `diff.patch` (written before the reviewer starts), `review.md`, `stdout.txt`, `stderr.txt` and `review.json`. `review.json` records reviewer, argv, target, base and head, diff hash, inputs with before/after hashes, times, exit status, verdict, finding counts by severity and log hashes. Outputs use the same link, hardlink and input-overlap refusals as `verify`.
- AC6 The run fails (exit 1, `passed: false`) when the CLI is missing, exits non-zero, times out, returns no review, or changes any input during the review. Inputs are `harness/verify.json` inputs when present plus the existing target files; deleted target files are recorded as `absent` and must stay deleted, so a deletion-only change can be reviewed without other inputs. Untracked files inside the output directory are never targets, and a tracked change inside it, or any uncommitted change to a tracked file there regardless of `--path`, is refused before the model runs. The last `Verdict` line must name exactly one verdict (Markdown emphasis and a final period are ignored); a missing verdict, a line listing several verdicts, a conditional approval, or `request changes` exits 1.
- AC7 `check-evidence` validates cross-review bundles: schema, execution, unchanged inputs, age, current source hashes (including that `absent` targets are still deleted) and log hashes, and reports `review-verdict-missing` or `review-requested-changes`.
- AC8 `--dry-run` prints the argv, target and prompt as JSON, writes nothing and calls no model.
- AC9 The shared workflow names `harness-lab cross-review` with the other model's reviewer as an additional review that complements, not replaces, the independent review when both CLIs are available; docs explain cost, read-only limits and evidence.
## Constraints
- Tests call no model: they use fake reviewer executables through `--command`.
- Reuse the evidence module's path safety; keep one source for the review procedure.
- Invoking the command spends the user's model quota; nothing runs it implicitly.
## Evidence
- npm test (test/cross-review.test.mjs) through harness verify.
- Unverified offline: real CLI flag compatibility and model adherence; record a manual run when available.
