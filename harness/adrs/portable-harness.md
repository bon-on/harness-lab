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
## Amendments
- 2026-10-21: Claude Code auto-loads CLAUDE.md but does not follow Markdown links, so the generated CLAUDE.md uses an `@harness/workflow.md` import and audit reports `claude-workflow-not-imported` otherwise. AGENTS.md keeps a plain reference because Codex has no import syntax. Alternative considered: inlining the workflow into CLAUDE.md, rejected because it duplicates shared policy. Managed projects with an unmodified CLAUDE.md receive the new template through `update`; edited files are preserved.
- 2026-10-21: Several specs can be open at once, so the workflow selects the spec whose Scope covers the request instead of "the active spec". Spec status moves `draft` -> `active` -> `maintained`; maintained specs stay selectable as regression baselines. When no spec fits, agents write one before coding; ties go to the user. Alternative considered: a manifest `activeSpec` field, rejected because it goes stale across parallel work and branches. Audit does not yet validate status values.
