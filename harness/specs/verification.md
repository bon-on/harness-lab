---
id: verification
title: Execution evidence and reliable CLI gates
status: active
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
- Label mock evaluation distinctly from executed regression evidence.
- CLI tests cover failures and successes; preserve existing user edits.
- Generate Codex and Claude entry points that share one repository-local workflow without requiring a globally installed skill.
- Reinitialization preserves existing project files and reports skipped paths.
- Audit reports missing agent entry points and missing, invalid or overdue maintenance reviews.
- Maintenance reviews record simplification, verification and improvement decisions every 30 days.
## Evidence
- npm test
## Constraints
- No paid model calls or user data mutations in tests.
