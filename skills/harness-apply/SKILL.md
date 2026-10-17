---
name: harness-apply
description: Apply harness engineering to a software repo by reading the repo harness manifest, feature specs, ADRs, and rules first; use this when the user wants spec-driven, ADR-aware AI development or wants to bootstrap and enforce repo-native harness engineering.
---

# Harness Apply

Use this skill when the user wants to apply harness engineering to a repo, or when work should be guided by repo-native specs, ADRs, and explicit rules instead of ad-hoc prompting.

## Workflow

1. Locate the harness manifest.
   - Prefer `harness/manifest.json` from the repo root.
   - If missing, report that the repo is not harness-ready and suggest scaffolding with `node dist/index.js init repo-kit --output <repo>`.
2. Read the manifest and obey its source priority.
   - Default priority is `feature spec -> related adr -> constraints -> golden rules -> general repo context`.
   - Do not replace a repo decision with generic advice.
   - Read `approvedPacks` first. If `approvedPacks` is empty, `suggestedPacks` are recommendations only and must not silently become source of truth.
3. Identify the active feature spec.
   - If the user names a spec, use that file.
   - Otherwise search `harness/specs/` for the most relevant spec and say which one you selected.
4. Read linked ADRs before proposing design or code changes.
   - If a linked ADR is missing or conflicts with the spec, escalate rather than guessing.
5. Read shared rules.
   - Always load `harness/rules/golden-rules.md`.
   - Always load `harness/rules/constraints.md`.
   - If an approved profile pack exists, apply its stack-specific guidance while reading the rules.
   - If only suggested packs exist, call them out as recommendations and ask for approval before treating them as durable project policy.
6. Produce harness-aware output.
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

Treat these as blocking by default:

- no `harness/manifest.json`
- no active feature spec for non-trivial work
- feature spec missing acceptance criteria
- linked ADR declared but missing
- repo state contradicts spec or ADR and the correct source is unclear
- approved pack exists but the rule files do not encode the pack-specific guidance needed for the task

Non-blocking drift should still be called out with a concrete fix path.

## Useful Commands

- `node dist/index.js audit <repo-or-manifest> --format md`
- `node dist/index.js plan <feature-spec.md> --format text`
- `node dist/index.js init repo-kit --output <repo>`

## Notes

- Prefer repo-native Markdown and JSON artifacts over long prompt-only instructions.
- Keep implementation plans narrow and directly tied to the active feature spec.
- For stack-sensitive work, prefer project-approved pack guidance over generic framework knowledge.
- If the repo has no harness kit yet, scaffold first, then continue with spec-driven work.
