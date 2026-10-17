---
id: portable-harness
title: Shared agent workflow and explicit maintenance reviews
status: accepted
related_specs:
  - verification
---
# Portable harness
## Context
Codex and Claude need discoverable entry instructions. Global skills are optional, and repeated initialization must preserve project policy.
## Decision
Generate AGENTS.md and CLAUDE.md pointing to harness/workflow.md. Keep project rules in the harness, use exclusive file creation, and report skipped files. Audit entry points and a repo-local maintenance.json review record. Review every 30 days and after repeated failures or stack changes; the audit reports overdue reviews but does not schedule background work.
## Consequences
Existing entry points require manual integration. File presence does not prove model compliance. Maintenance findings are warnings unless strict-block is selected. Never mark a review complete merely because files were generated.
