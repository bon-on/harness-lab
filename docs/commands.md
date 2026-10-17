# Command reference

Run `npm ci` and `npm run build` in the harness-lab checkout first. All examples invoke `node dist/index.js` from that directory. Use absolute paths when working with another repository.

| Command | Purpose | Example |
| --- | --- | --- |
| `detect <repo>` | Detect stack signals and recommend packs | `node dist/index.js detect examples/detect/nextjs-app --format md` |
| `init repo-kit --output <repo>` | Create missing harness files; preserve existing files | `node dist/index.js init repo-kit --output /path/to/project` |
| `audit <repo-or-manifest>` | Check rules, links, evidence, and maintenance | `node dist/index.js audit /path/to/project --format json` |
| `plan <spec.md>` | Summarize requirements and linked decisions | `node dist/index.js plan /path/to/project/harness/specs/my-feature.md --format text` |
| `verify <repo> <config.json> --output <dir>` | Run a command and collect execution evidence | `node dist/index.js verify . harness/verify.json --output out/evidence/latest` |
| `check-evidence <checks.json> <repo>` | Validate stored evidence against current source | `node dist/index.js check-evidence out/evidence/latest/checks.json .` |
| `init engineering --output <file>` | Generate a legacy evaluation spec | `node dist/index.js init engineering --output /tmp/harness-eval.json` |
| `run <eval.json>` | Evaluate supplied mock outputs | `node dist/index.js run examples/coding-assistant.json --format json` |
| `maturity <eval.json>` | Assess declared harness maturity | `node dist/index.js maturity examples/coding-assistant.json` |
| `report <eval.json>` | Produce a mock evaluation report | `node dist/index.js report examples/coding-assistant.json --format md --output out/mock-report.md` |

Reporting commands accept `--format text`, `json`, or `md`, and optional `--output <file>`. `verify` and `check-evidence` print JSON; `verify --output` names a directory, not a report file. Initialization writes scaffold files. Inspect `--help` for syntax.

## Verification config

- `command`: nonempty argv array, e.g. `["npm", "test"]`. Shell syntax such as `&&` or pipes is not interpreted. For multiple checks, create a project script and invoke that script.
- `inputs`: nonempty list of existing repo-relative files/directories. Changes, additions, and deletions in this scope invalidate stored evidence. Symlinks and paths outside the repo are rejected. Include the verification config and relevant rules; exclude build output, evidence output, dependencies, and secrets.
- `timeoutMs`: integer from 1 to 3,600,000; default 120,000.

The output directory contains `checks.json`, `stdout.txt`, and `stderr.txt`. Reusing a directory replaces the previous bundle. Use different directories if you need history. The checker has a seven-day evidence age limit.

## Exit codes and automation

`verify` and `check-evidence` return 1 on failure, 0 on success. Audit returns 1 when policy blocks its findings; `advisory` does not bypass malformed input errors. Read the findings even when exit status is 0. The plan command summarizes blockers; do not use it as a substitute for audit or execution checks.

Run verification before audit when a contract references generated `checks.json`. CI must regenerate evidence after checkout instead of committing a machine-specific bundle. This repo's workflow runs on pushes, pull requests, manual dispatch, and weekly; maintenance warnings are surfaced in the job summary.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| `dist/index.js` not found | Run `npm ci` then `npm run build` in the tool checkout |
| Existing agent instructions were skipped | Add a reference to `harness/workflow.md` in those files and review integration |
| Missing manifest | Initialize a repo kit in the correct target path |
| Missing linked ADR or contract | Match frontmatter IDs and update both forward links and `related_specs` backlinks |
| Verification cannot find an input | Adapt `inputs` to actual project paths; optional nonexistent directories are not ignored |
| Source changed during verification | Keep generated files out of scope; use check-only lint/format commands or run formatters before verification |
| Evidence stale or hashes differ | Rerun meaningful verification against the current source; do not edit hashes |
| Maintenance warning on a new kit | Complete the project review, then record timestamp and summary |
| Detected packs differ from manifest | Review stack changes and update recommendations/approved rules deliberately |

## Known boundaries

Audits check structure and selected content, not the semantic truth of documentation. Existing agent entry points must reference `harness/workflow.md`; an unlinked preserved file is reported as `agent-workflow-unlinked`. Agent entry checks establish presence, not that the model followed instructions. Profile detection supports a fixed set of signals. Live-agent benchmarks and automatic instruction cleanup are not implemented. The evidence checker detects accidental drift and tampering against recorded hashes, not a malicious party rewriting the entire bundle.
