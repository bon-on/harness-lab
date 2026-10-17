---
id: publication
title: Publish a reusable project harness toolkit
status: active
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
- Public bon-on/harness-lab repository, English README, Korean onboarding, command reference, contribution guide and CI.
## Acceptance Criteria
- A clean checkout installs with npm ci, builds, verifies and audits without local state.
- Document setup, target-project adaptation, both agent entry points, evidence limitations and maintenance.
- Published files exclude machine-specific reports and runtime evidence.
- CI runs verification and audit on changes and weekly, exposing maintenance findings.
- Preserve existing CLI behavior and local work while publishing the integrated project.
## Constraints
- No npm registry publication or live model calls required.
- Keep generated evidence out of Git; regenerate in CI.
## Evidence
- npm test
- Clean export install, verify, audit and temporary-project walkthrough.
