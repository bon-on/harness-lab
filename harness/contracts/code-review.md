---
id: code-review
title: Independent reviewer delivery
related_specs:
  - code-review
evidence_files:
  - out/evidence/latest/checks.json
---
# Code review
## Goal
Ship a harness-aware read-only reviewer for Claude and Codex and require it before completion.
## Done Criteria
- The skill, generated agent, workflow and harness-develop changes satisfy the code-review spec.
- CLI tests cover agent generation, preservation, drift and workflow routing.
## Verification
- Run CLI regression tests and a reviewer forward test on a synthetic fixture with planted defects.
## Evidence References
- out/evidence/latest/checks.json
- The forward test result is summarized in the delivery report.
