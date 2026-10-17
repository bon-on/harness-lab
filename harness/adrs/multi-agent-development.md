---
id: multi-agent-development
title: Coordinator-owned requirements and verification with scoped workers
status: accepted
related_specs:
  - multi-agent-development
---
# Multi-agent development
## Context
A reusable development skill must adapt to each project and coordinate parallel work without treating spawned agents as independent proof of correctness.
## Decision
Keep harness-apply focused on reading and applying repository policy. Add harness-develop to translate user requirements into acceptance criteria and a dependency-aware task plan. Use environment-native agent tools with explicit file ownership, shared interface decisions and bounded worker outputs. The coordinator owns integration, acceptance coverage and final verification. Preserve existing project instructions during adoption and use offline checks for sensitive applications.
## Consequences
No new orchestrator service is required. Parallelism depends on independent work and available tools; conflicting writes are serialized. Local project reviews stay ignored and reusable tests use synthetic fixtures. A skill describes behavior rather than guaranteeing that all agents obey it.
