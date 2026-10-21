---
name: harness-develop
description: Implement software requirements using repository harness policy, requirement-to-check mapping, and dependency-aware multi-agent development with coordinator-owned integration and verification. Use when asked to develop a feature or fix through a harness or coordinated agents; use harness-apply for policy adoption alone.
---

# Harness Develop

Turn the requested change into verified implementation. Use available native agent capabilities in Claude or Codex; this skill requires neither a particular provider nor an orchestration service.

## Establish project context

- Inspect the target repository, working-tree changes, applicable agent instructions, build/test scripts and relevant code before choosing a design or commands. Preserve existing user changes and project policies.
- Read `harness/manifest.json`, the relevant feature spec, linked ADRs/contracts, constraints, golden rules, `harness/project.md` and approved pack guidance. Respect repository paths and source priority within higher-priority instructions. Suggested packs remain recommendations. An installed `harness-apply` can help with this reading, but is not required.
- If harness artifacts are absent, read [the bootstrap reference](references/bootstrap.md) for compatible manifest and artifact shapes, then inspect the project and create the minimal project-specific spec, rules and decision records needed for this task within the user's scope and filesystem permissions. Reuse existing policy rather than replacing it with generic templates. If scaffolding is available, check its actual usage first and preserve existing files. Do not assume a global CLI or a `dist/` directory exists.
- Resolve missing artifacts from repository evidence when possible. Ask only when a material requirement, conflicting policy or permission cannot be resolved; continue independent work while waiting. Do not invent approval of a disputed architectural decision. If harness creation is outside scope or blocked, state that limit and continue only work whose requirements and applicable policy are clear.

## Map requirements and plan

Record a compact plan in the repository's usual planning location, or in the conversation for a small change. Include:

| Requirement / acceptance criterion | Implementation task | Dependencies | Write owner and files | Verification |
| --- | --- | --- | --- | --- |
| Observable requested behavior | Concrete deliverable | Prerequisites or none | One owner per file | Relevant command or observable check |

- Separate required behavior from assumptions and exclusions. Each requested behavior needs a check, including meaningful negative cases where applicable; avoid tests that merely restate implementation.
- Select checks from the inspected stack and project rules. Identify commands that require external services, paid calls, production access or credentials before running them; task delegation does not grant those permissions. Use safe local substitutes where useful and report their coverage limits.
- Record architectural or cross-cutting decisions in linked ADRs before dependent implementation, following local conventions. Agree shared interfaces before splitting their consumers.
- Consult the repository's maintenance policy. When a review is due or repeated failures justify one, remove duplicated guidance, inspect stale decisions and unused packs, and capture a focused improvement with regression coverage. Preserve decision history; update review metadata only after the review and verification actually occur.

## Delegate according to dependencies

This workflow calls for delegated work when authorized agent tools are available and the plan contains independent tasks. Check the actual environment and higher-priority restrictions first. Use its native spawn/task/message/wait mechanisms, not invented tool names or a newly installed runtime. If delegation is unavailable, prohibited, or would only split tightly coupled trivial work, execute the same plan in one agent and state why.

- The coordinator owns the plan, shared interfaces, integration and final evidence. Choose worker count from independent ready tasks and available capacity, not a fixed quota. Dependency-bound tasks wait for their prerequisites.
- Give each implementation worker exclusive write ownership of explicit files or directories. Assign shared files, dependency manifests, generated outputs and integration glue to one owner; serialize overlapping edits. Shared-workspace tools do not provide isolation automatically. Read-only reviewers must not edit implementation files.
- State the absolute project root and the base for every relative path in each worker brief; do not assume a worker shares the coordinator's working directory. Each worker brief includes the requested outcome and acceptance criteria, relevant policy/spec/ADR paths, dependencies and agreed interfaces, allowed write paths, forbidden side effects, required checks, and the expected return: changed files, behavior delivered, exact checks/results, and unresolved issues. Workers may not expand their write scope or delegate overlapping work without coordinator reassignment.
- Monitor results and dependencies. Resolve interface changes centrally and notify affected workers before resuming dependent work. On failure or conflicting writes, stop the affected work, inspect the actual state and reassign deliberately; preserve user changes. Do not repeatedly retry a blocked operation or broaden permissions to force progress.

## Integrate and verify

- Inspect the workers' actual diffs and outputs against ownership and acceptance criteria. A worker saying “done” or “tests pass” is not completion evidence. Check for unintended edits and reconcile shared interfaces before integration.
- Run the required checks on the final integrated tree, plus relevant interaction or failure cases that isolated workers could miss. Before claiming completion, delegate an independent read-only review of the integrated change: the `code-reviewer` agent in Claude, or an agent following the `harness-review` skill elsewhere. Give it the target, base, spec, acceptance criteria and any project rules on where checks may run. Fix Critical and High findings and re-review the fixes, or record a justification; report remaining Medium and Low findings. Without a separate agent, run the skill yourself as a distinct pass and state the fallback. A trivial change, such as a typo or comment, may skip review with a stated reason. The coordinator still owns the acceptance decision. Rerun affected checks after corrections, rather than relying on earlier worker results.
- Record command argv, working directory, exit status and relevant output/evidence location using the repository's evidence convention. Include source identity or hashes where that convention requires them. Keep secrets and private project data out of published evidence.
- When using harness-lab, run its available `verify`, `check-evidence`, and `audit` commands with the resolved CLI path. A handwritten manifest or custom evidence file is not implicitly compatible; report an unavailable CLI audit as unexecuted.
- Distinguish executed checks from static audits, mocks and untested runtime behavior. A missing dependency, unavailable service or failing required check remains an explicit verification gap; do not claim full completion while required acceptance checks remain unmet.

## Report delivery

Summarize the delivered behavior, acceptance coverage, integrated verification and remaining limits. Include the repository's response contract and identify references used, approved packs used (or none), constraints, conflicts or gaps, and any escalation. State whether work was delegated or performed in one agent and why. Keep task-specific details in project artifacts rather than growing this skill with unrelated project rules.
