---
id: code-review
title: Independent code review before completion
status: maintained
related_adrs:
  - code-review
related_contracts:
  - code-review
required_evidence:
  - cli-tests
  - skill-forward-test
---
# Code review
## Problem
Implementation agents review their own work, and harness-develop treats an independent review as optional. Changes can be declared complete with unverified bugs, missing tests or policy violations.
## Scope
- A provider-neutral `harness-review` skill that defines a thorough, read-only review procedure and report format.
- A Claude `code-reviewer` agent generated from that skill, shipped in this repository and created by `init` in target projects.
- Mandatory review in the shared workflow and harness-develop before implementation is declared complete.
## Acceptance Criteria
- The skill determines an explicit review target and base, loads the governing spec, ADRs and rules, reads changed files in full with their callers and tests, and covers correctness, compatibility, security, requirements, tests, docs and simplicity.
- Findings are verified against concrete code with a failure scenario or violated criterion, ranked Critical/High/Medium/Low, and reported with file:line, suggested fix, acceptance coverage and a verdict. A clean review states what was examined.
- The reviewer does not edit, stage, commit or push, and runs only safe local checks.
- `init` generates `.claude/agents/code-reviewer.md` from the packaged skill with read-only tools and the `opus` model; existing files are preserved and the repository copy matches the generated template.
- The workflow and harness-develop require an independent review before completion; Critical and High findings are fixed and re-reviewed or explicitly justified; skips and single-agent fallbacks are stated.
- A forward test of the reviewer on a synthetic change with planted defects reports them.
## Constraints
- Tests make no model calls; the forward test uses a synthetic local fixture.
- Keep one source for the review procedure.
## Evidence
- npm test
- Reviewer forward test on a synthetic fixture.
