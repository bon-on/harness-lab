---
id: installation-updates
title: Install and update delivery
related_specs:
  - installation-updates
evidence_files:
  - out/evidence/latest/checks.json
---
# Install and update delivery
## Goal
Make the toolkit installable and project updates reviewable and recoverable.
## Done Criteria
- Packed CLI runs independently, safe update and rollback regressions pass, and existing commands retain behavior.
- Documentation distinguishes package upgrades, project changes and registry availability.
## Verification
- npm test including lifecycle and packed installation tests.
- Shared verify, check-evidence and audit on the final tree.
## Evidence References
- out/evidence/latest/checks.json
