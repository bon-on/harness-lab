---
id: verification
title: Execution evidence and reliable CLI gates
status: maintained
related_adrs:
  - evidence
  - portable-harness
related_contracts:
  - verification
required_evidence:
  - cli-tests
---
# Verification
## Problem
Document presence and mock scores do not prove execution success.
## Scope
- Local CLI verification, evidence checks and manifest interoperability.
## Acceptance Criteria
- Critical audit findings return nonzero except in advisory mode.
- Collect argv, timestamps, exit status, output hashes and source hashes without a shell.
- Check failed commands, changed source, missing or tampered logs and evidence age.
- Evidence output never writes through symlinks or hardlinks and never overlaps input scope, including through path aliases.
- Label mock evaluation distinctly from executed regression evidence.
- CLI tests cover failures and successes; preserve existing user edits.
- Generate Codex and Claude entry points that share one repository-local workflow without requiring a globally installed skill.
- The Claude entry point imports the workflow with `@harness/workflow.md`; audit warns when CLAUDE.md only links it.
- Reinitialization preserves existing project files and reports skipped paths.
- Audit reports missing agent entry points and missing, invalid or overdue maintenance reviews.
- Maintenance reviews record simplification, verification and improvement decisions every 30 days.
## Evidence
- npm test
## Constraints
- No paid model calls or user data mutations in tests.
