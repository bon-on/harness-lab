---
id: evidence
title: Separate static audit and execution evidence
status: accepted
related_specs:
  - verification
---
# Evidence
## Context
Mock outputs and document presence cannot certify runtime behavior.
## Decision
Retain mock evaluation; add argv-based bounded command execution and local evidence checking. Audit structured checks.json evidence referenced by contracts.
## Consequences
Hashes are not signatures or independent review. Callers choose meaningful checks; command success does not guarantee product acceptance.
