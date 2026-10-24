---
id: cross-review
title: Cross-model review delivery
related_specs:
  - cross-review
evidence_files:
  - out/evidence/latest/checks.json
---
# Cross-model review
## Goal
Let a project record a review by the model that did not write the change.
## Done Criteria
- The cross-review spec's acceptance criteria are implemented and covered by CLI tests with fake reviewer executables.
## Verification
- npm test through harness verify.
## Evidence References
- out/evidence/latest/checks.json
