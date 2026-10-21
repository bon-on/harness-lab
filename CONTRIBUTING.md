# Contributing

Bug reports, stack fixtures, clearer rules, and smaller workflows are welcome. Start with an [issue](https://github.com/bon-on/harness-lab/issues) for changes to policy or architecture.

## Local setup

```bash
npm ci
npm test
```

Use Node.js 22 or newer. `.claude/skills` is a symlink to `skills/`, so Claude Code in this checkout loads the skills under development. Refresh any globally installed copies (for example `~/.claude/skills/<name>`) yourself after changing a skill; a project skill and a same-named global copy can both appear. `.claude/agents/code-reviewer.md` and its `examples/repo-kit` copy are generated from `skills/harness-review/SKILL.md`; after changing the skill, regenerate them with `init repo-kit` into an empty directory and copy the result (tests fail on drift). Tests build the CLI and exercise it in temporary directories without model calls or external services.

## Change workflow

1. Read [the shared workflow](harness/workflow.md), select a spec in `harness/specs/`, and read its linked ADRs and contract.
2. Add or update acceptance criteria before substantive behavior changes. Record architectural decisions in an ADR, including consequences; keep backlinks consistent.
3. Keep golden rules short and durable. For a new stack recommendation, add a representative fixture and test that it stays a recommendation until approved.
4. Test observable behavior, including failure exit codes. Preserve existing CLI commands and existing target-project files.
5. Update user-facing documentation when syntax or behavior changes.
6. Generate evidence, check it, and audit before submitting:

```bash
node dist/index.js verify . harness/verify.json --output out/evidence/latest
node dist/index.js check-evidence out/evidence/latest/checks.json .
node dist/index.js audit . --format text
git diff --check
```

A fresh checkout has no evidence bundle. Generate it before audit. `out/` and root-level `reports/` are local artifacts and are ignored. Do not commit credentials, personal paths, or raw execution logs. Example narrative reports under `examples/repo-kit/reports/` are placeholders, not attestations.

Describe the problem, final behavior, verification results, and any remaining limitations in your pull request. Do not equate a static audit or mock score with live-agent success.

## Harness maintenance

Review the harness every 30 days and after repeated failures or stack changes. Consolidate duplicate instructions, examine stale ADRs and unused packs, compare instruction size, and retain decision history. Update `harness/maintenance.json` only after a real review. Weekly CI surfaces audit findings; a passing default audit can still contain warnings, so inspect the job summary.

## License

Contributions are provided under the repository's [MIT license](LICENSE).
