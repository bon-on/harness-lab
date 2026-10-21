---
name: harness-apply
description: Apply harness engineering to a software repo by reading the repo harness manifest, feature specs, ADRs, and rules first; use this when the user wants spec-driven, ADR-aware AI development or wants to bootstrap and enforce repo-native harness engineering.
---

# Harness Apply

Use this skill when the user wants to apply harness engineering to a repo, or when work should be guided by repo-native specs, ADRs, and explicit rules instead of ad-hoc prompting.

## Workflow

1. Locate the harness manifest.
   - Prefer `harness/manifest.json` from the repo root.
   - If missing and adoption is requested, inspect existing instructions, source, build/test scripts and operational constraints, then bootstrap the minimal project-specific harness within current permissions. Do not stop merely because the artifact you were asked to create is absent.
   - Resolve the tool checkout explicitly before using `node <tool-root>/dist/index.js init repo-kit --output <repo>`. Build it if needed. The target project need not contain this CLI or Git metadata.
   - Preserve existing files; integrate the shared workflow into both agent entry points rather than assuming skipped files were merged. Adapt generated examples to real requirements and safe checks.
   - Keep the project updatable. `AGENTS.md`, `CLAUDE.md`, `harness/workflow.md`, `harness/templates/*` and `.claude/agents/code-reviewer.md` are tool-managed: leave them identical to the template. Put project-specific instructions in `harness/project.md`, or in rules, specs and ADRs. When an existing project's managed files contain project content, move that content first, preserving its meaning, then restore the template text.
   - For a project without `.harness-lab/state.json` (hand-built or set up by an earlier harness-apply run), run `node <tool-root>/dist/index.js adopt <repo>` to preview, then `adopt <repo> --apply` once the remaining unmanaged files are intentionally project-owned. Afterwards `update` can refresh managed files. Back up files first when the project has no version control. Replace managed files that are symlinks (for example `CLAUDE.md` linked to `AGENTS.md`) with the template files; adopt refuses symlinked kit paths.
2. Read the manifest and obey its source priority.
   - Default priority is `feature spec -> related adr -> constraints -> golden rules -> general repo context`.
   - Do not replace a repo decision with generic advice.
   - Read `approvedPacks` first. If `approvedPacks` is empty, `suggestedPacks` are recommendations only and must not silently become source of truth.
3. Identify the governing feature spec.
   - If the user names a spec, use that file.
   - Otherwise match the request to each spec's Scope in `harness/specs/` and say which one you selected; read overlapping specs as secondary. `maintained` specs are implemented regression baselines and remain selectable; ask when several fit equally. When adoption or a new feature requires a missing spec, author it from the inspected repository and user requirements; ask only about material unresolved requirements.
4. Read linked ADRs before proposing design or code changes.
   - If a linked ADR is missing or conflicts with the spec, escalate rather than guessing.
5. Read shared rules.
   - Always load `harness/rules/golden-rules.md`.
   - Always load `harness/rules/constraints.md`.
   - If an approved profile pack exists, apply its stack-specific guidance while reading the rules.
   - If only suggested packs exist, call them out as recommendations and ask for approval before treating them as durable project policy.
6. Verify adoption and route development.
   - Choose meaningful offline or isolated checks from inspected code; do not use operational commands as generic tests. Keep credentials, live state and generated caches out of evidence inputs.
   - Generate current execution evidence, check it, then audit. A preexisting bundle or a narrative report is not proof of this change. Report command failures and untested behavior without inventing results.
   - For implementation requests, use `harness-develop` if available, or apply its core approach directly: requirement/check mapping, independent tasks with exclusive file ownership, dependency order, coordinator integration and final checks. No new orchestration runtime is required.
   - Review maintenance status and record completed reviews honestly. Never advance a timestamp merely to silence audit.
7. Produce harness-aware output.
   - State the spec, ADRs, rules, and approved/suggested packs you used.
   - State missing artifacts or conflicts.
   - Block completion when critical requirements or acceptance criteria are missing.

## Required Output Contract

Every substantive response should include these fields in plain language:

- `References used`: list the spec, ADR, and rule files you followed
- `Applied packs`: list approved packs used, or suggested packs treated as non-authoritative recommendations
- `Constraints`: list the repo constraints that affected the work
- `Conflicts or gaps`: list missing or conflicting harness artifacts
- `Escalation`: say whether escalation is required

## Blocking Rules

Treat these as blockers to declaring adoption/development complete. Resolve missing artifacts within the authorized task before escalating:

- no `harness/manifest.json`
- no selected feature spec for non-trivial work
- feature spec missing acceptance criteria
- linked ADR declared but missing
- repo state contradicts spec or ADR and the correct source is unclear
- approved pack exists but the rule files do not encode the pack-specific guidance needed for the task

Non-blocking drift should still be called out with a concrete fix path.

## Useful Commands

Run from the resolved harness-lab checkout; these paths are not relative to the target project.

- `node dist/index.js audit <repo-or-manifest> --format md`
- `node dist/index.js plan <feature-spec.md> --format text`
- `node dist/index.js init repo-kit --output <repo>`

## Notes

- Prefer repo-native Markdown and JSON artifacts over long prompt-only instructions.
- Keep implementation plans narrow and directly tied to the selected feature spec.
- For stack-sensitive work, prefer project-approved pack guidance over generic framework knowledge.
- If the repo has no harness kit yet, scaffold first, then continue with spec-driven work.
