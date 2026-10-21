---
id: publication
title: Publish a reusable project harness toolkit
status: maintained
related_adrs:
  - publication
related_contracts:
  - publication
required_evidence:
  - cli-tests
  - fresh-checkout-smoke
---
# Publication
## Problem
Local paths and scattered instructions make the toolkit difficult for other developers to adopt.
## Scope
- Public bon-on/harness-lab repository, English and Korean READMEs, Korean onboarding, command reference, contribution guide and CI.
- Position Claude Code as the primary agent and Codex as a compatible agent that follows the same workflow.
## Acceptance Criteria
- A clean checkout installs with npm ci, builds, verifies and audits without local state.
- Document setup, target-project adaptation, both agent entry points, evidence limitations and maintenance.
- README.md and README.ko.md cover the same sections, link to each other, and show a diagram of the files `init` creates and the agent work loop that matches the generated kit.
- Claude Code usage (entry import, code-reviewer agent, skill installation) comes first; Codex instructions state what differs.
- Published files exclude machine-specific reports and runtime evidence.
- CI runs verification and audit on changes and weekly, exposing maintenance findings.
- Preserve existing CLI behavior and local work while publishing the integrated project.
## Constraints
- No npm registry publication or live model calls required.
- Keep generated evidence out of Git; regenerate in CI.
## Evidence
- npm test
- Clean export install, verify, audit and temporary-project walkthrough.
