# Bootstrap a harness-lab compatible project

Read this only when creating a new harness, not when the project already defines one. Prefer an available harness-lab checkout's `init repo-kit` after checking its usage; inspect and adapt its examples. If no CLI is available, use the shape below instead of inventing a different manifest schema. Record that CLI audit is unexecuted until the tool becomes available.

## Manifest

Create `harness/manifest.json`, using the inspected project name:

```json
{
  "version": "1",
  "repoName": "project-name",
  "policyMode": "warn-block-critical",
  "sourcePriority": ["feature spec", "related adr", "repo constraints", "golden rules", "general repo context"],
  "approvedPacks": [],
  "suggestedPacks": [],
  "paths": {
    "rulesDir": "harness/rules",
    "specsDir": "harness/specs",
    "adrsDir": "harness/adrs",
    "contractsDir": "harness/contracts",
    "templatesDir": "harness/templates",
    "reportsDir": "out/evidence"
  },
  "requiredFiles": ["AGENTS.md", "CLAUDE.md", "harness/workflow.md", "harness/rules/constraints.md", "harness/rules/golden-rules.md", "harness/maintenance.json"]
}
```

## Minimum project artifacts

- Preserve existing `AGENTS.md` and `CLAUDE.md`; add a reference to `harness/workflow.md` (an `@harness/workflow.md` import in `CLAUDE.md`). Keep project-specific instructions in `harness/project.md` so managed files stay template-identical, and run `adopt` when the CLI is available. Put shared development policy in the workflow and task-specific details in the spec.
- Write inspected project constraints and durable golden rules in the paths declared above. Do not approve a recommended pack implicitly.
- A feature spec has frontmatter `id`, `title`, `status`, `related_adrs`, `related_contracts`, and sections `## Problem`, `## Scope`, `## Acceptance Criteria`, `## Constraints`, `## Evidence`. Acceptance criteria use `- ` bullet lines with observable outcomes.
- An ADR has frontmatter `id`, `title`, `status`, `related_specs`, and sections `## Context`, `## Decision`, `## Consequences`. Record the actual decision and tradeoffs.
- A contract has frontmatter `id`, `title`, `related_specs`, `evidence_files`, and sections `## Goal`, `## Done Criteria`, `## Verification`, `## Evidence References`. Done criteria use `- ` bullet lines, just like spec acceptance criteria.
- Link artifacts by matching their IDs and include backlinks. Use unquoted scalar IDs and block lists in frontmatter, as supported by the CLI's simple parser; avoid assuming arbitrary YAML syntax is supported.
- Start `harness/maintenance.json` with `{"reviewedAt":null,"summary":""}`. Complete it only after actual review and verification; pending-review warnings are honest.

Example frontmatter list:

```yaml
related_adrs:
  - task-design
related_contracts:
  - task-delivery
```

## Verification and completion

Create `harness/verify.json` with the actual argv, existing source/harness inputs and timeout. Keep generated evidence outside those inputs, normally `out/evidence/latest`. When the tool is available, run `verify`, `check-evidence`, and `audit` on the final project using the resolved CLI path. Contracts should reference the resulting `out/evidence/latest/checks.json`.

If the tool is unavailable, execute the project checks and record their exact results, but distinguish that record from the shared `checks.json` schema. Do not label custom JSON as harness-lab validated evidence. Report the unavailable audit as a gap. Never fabricate reports or update evidence hashes to obtain a passing result.
