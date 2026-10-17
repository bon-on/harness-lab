# Agent Instructions

Follow this repository-local workflow for substantive work. The `harness-apply` skill is optional.

Startup sequence:
1. Read `harness/manifest.json`.
2. Select the active feature spec from `harness/specs/`.
3. Read `approvedPacks` from the manifest. If it is empty, treat `suggestedPacks` as recommendations only.
4. Read linked ADRs and contracts before making code changes.
5. Read `harness/rules/constraints.md` and `harness/rules/golden-rules.md`.
6. Map the user request to acceptance criteria and project-specific verification commands. Run checks before claiming completion; record argv, exit status and evidence. Static audit or mock scores do not prove execution.
7. Record architectural or cross-cutting changes in an ADR, including alternatives and consequences.
8. Review `harness/maintenance.json` every 30 days and after repeated failures or stack changes. Remove duplicate guidance, check stale ADRs and unused packs, compare instruction size, and add a regression check for recurring failures. Preserve decision history. Record reviewedAt and a nonempty summary only after review and verification.

Response contract:
- Include `References used`, `Constraints`, `Conflicts or gaps`, and `Escalation`.
- Escalate when required harness artifacts are missing or conflicting.
- State which approved or suggested profile packs were used.
