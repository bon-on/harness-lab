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
## Amendments
- 2026-10-21: Evidence output previously opened stdout.txt, stderr.txt and checks.json in place, so a symlink or hardlink there overwrote its target, including verified inputs. `verify` now refuses existing evidence files that are links or not regular files before running the command, writes each file to a fresh exclusive temporary file and renames it into place, and compares the real output directory with real input paths in both directions. Alternative considered: only rejecting links, rejected because a link created after the check would still be followed.
