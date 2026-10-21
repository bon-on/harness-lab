---
id: multi-agent-development
title: Apply real-project harnesses and coordinate requirement-driven development
status: maintained
related_adrs:
  - multi-agent-development
related_contracts:
  - multi-agent-development
required_evidence:
  - cli-tests
  - adoption-reviews
  - skill-forward-test
---
# Multi-agent development
## Problem
Scaffold-only examples do not demonstrate adoption in existing projects, and harness-apply does not define coordinated implementation from user requirements.
## Scope
- Inspect and apply harness policy in two authorized local projects while preserving their existing instructions.
- Add a reusable harness-develop skill for requirement analysis, dependency-aware delegation, integration and verification.
- Correct demonstrated harness interoperability issues and test regressions using synthetic fixtures.
## Acceptance Criteria
- Project-specific specs, ADRs, constraints and safe verification commands reflect inspected repository evidence.
- Existing policies and user changes remain intact; no production operations, paid API calls or private data become test inputs or published fixtures.
- The development skill maps requirements to acceptance checks, assigns disjoint write ownership and dependencies, and requires coordinator integration plus verification.
- Parallel work uses available authorized agents; a single-agent fallback is explicit when no delegate is available. Agent self-reports are not completion evidence.
- An independent forward test exercises the skill on a synthetic local feature task.
- Document discovered gaps and distinguish applied files, passing checks, environment blockers and untested runtime behavior.
## Constraints
- Filesystem permissions still apply to target projects and skill installation.
- Keep private project details in ignored local reports; use synthetic public regression fixtures.
- Do not introduce a new execution runtime when existing agent tools suffice.
## Evidence
- npm test
- Local adoption reports and independent skill test.
