---
id: contract-harness-apply-foundation
title: Foundation contract for harness apply repo kit
status: active
related_specs:
  - feature-harness-apply
evidence_files:
  - reports/repo-kit-audit-report.md
  - reports/repo-kit-plan-report.md
  - reports/harness-apply-skill-note.md
---

# Contract: Foundation contract for harness apply repo kit

## Goal
Create the minimum repo-native harness workflow needed for spec-driven and ADR-aware AI development.

## Scope
- Add the repo kit structure, templates, and example documents.
- Add the harness apply skill and make it cite the files it uses.
- Add audit and planning commands that enforce critical harness requirements.

## Done Criteria
- The repo kit can be scaffolded into a target repo.
- The example feature spec links to both an ADR and a contract.
- Audit reports missing required harness files, missing linked artifacts, and broken local links.
- Planning output tells the agent to read the linked contract before implementation.

## Verification
- Run `npm run build`.
- Run `npm run audit`.
- Run `npm run plan`.

## Evidence References
- reports/repo-kit-audit-report.md
- reports/repo-kit-plan-report.md
- reports/harness-apply-skill-note.md
