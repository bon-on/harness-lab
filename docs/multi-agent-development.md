# Requirement-driven development

Use [harness-apply](../skills/harness-apply/SKILL.md) to adopt or inspect repository policy. Use [harness-develop](../skills/harness-develop/SKILL.md) to implement a requirement through that policy. These are instructions for a capable host agent, not a standalone agent runner.

## Request

```text
Use harness-develop to implement <requirement> in <project>.
Analyze requirements and relevant project decisions, delegate independent work,
and verify the integrated result against acceptance criteria.
```

The coordinator records a compact requirement-to-check map and task dependencies. Each worker gets a project root, resolvable policy paths, one exclusive write scope, agreed interfaces, acceptance criteria and required checks. Shared files have one owner. Integration and final evidence belong to the coordinator.

Parallelism is useful when tasks can proceed independently. A small coupled change, unavailable tool capacity, or a host restriction may require sequential execution. The agent must state that fallback rather than claim delegation occurred. Git worktrees are optional; non-Git projects need file ownership and preserved originals or isolated copies.

## Adoption lessons

Testing existing local projects exposed gaps that now have concrete responses:

| Gap | Response |
| --- | --- |
| Python or dependency-free Node was reported as unknown | Detect Python/FastAPI and Node ESM/test-runner signals without inventing approved packs |
| Existing AGENTS instructions were preserved but disconnected | Audit warns when an entry point lacks a shared workflow reference |
| Old command evidence looked like completed work | Regenerate evidence after integration and check source/log hashes and age |
| Missing harness caused adoption to stop immediately | Bootstrap inspected project-specific artifacts within the requested scope |
| A handwritten minimal manifest was incompatible with audit | Use the bootstrap reference and validate with the actual CLI when available |
| Workers interpreted abbreviated paths from different working directories | Supply the project root and path base explicitly |
| Operational scripts were tempting default checks | Select reviewed offline tests and record their limited coverage |

Keep actual project details and logs private. Public tests use synthetic fixtures; structural audit success does not certify live application behavior or model compliance.

## Verification boundaries

A synthetic forward test exercised real coordinator/worker delegation, independent module implementation and integrated checks. It exposed bootstrap and path-context gaps, which were corrected in the skill. This is evidence for the tested workflow, not a broad benchmark across models or projects.

Use project-native tests and the shared evidence CLI for each real implementation. Do not publish a worker's self-report as proof, silently approve profile recommendations, or use a successful unit test as permission to restart services or perform production operations.
