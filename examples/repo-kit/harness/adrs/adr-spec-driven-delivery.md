---
id: adr-spec-driven-delivery
title: Make feature specs and ADRs the top AI source of truth
status: accepted
related_specs:
  - feature-harness-apply
---

# ADR: Make feature specs and ADRs the top AI source of truth

## Context
General prompts and repo-wide rules are too weak to keep AI work aligned on non-trivial changes.

## Decision
Use feature specs as the first source of truth for active work and ADRs as the architectural source of truth. Keep repo rules as shared policy, not task-level intent.

## Consequences
- Agents can explain which requirements and decisions they are following.
- Review becomes easier because intent and architecture are versioned.
- Missing or conflicting documents become explicit escalation points.
