# Repo Kit Reference

## Core Files

- `harness/manifest.json`: machine-readable source priority, required paths, enforcement mode
- `approvedPacks`: human-approved stack-specific overlays
- `suggestedPacks`: detected recommendations that are not yet durable policy
- `harness/rules/golden-rules.md`: durable high-level operating principles
- `harness/rules/constraints.md`: repo-specific technical and process constraints
- `harness/specs/*.md`: feature-level source of truth for active work
- `harness/adrs/*.md`: architectural decisions linked from specs

## Intended Precedence

1. Active feature spec
2. Related ADRs
3. Repo constraints
4. Golden rules
5. General repo context

Pack handling rule:

- `approvedPacks` are part of the repo's operating model
- `suggestedPacks` are recommendations only until a human approves them

## Audit Expectations

- Manifest exists and parses
- Repository signals and manifest profile fields are consistent
- Required rule and template files exist
- At least one feature spec exists
- Feature specs contain `Problem`, `Acceptance Criteria`, and machine-readable links to ADRs
- ADRs contain `Context` and `Decision`

## Response Discipline

- Cite the exact files used
- State which approved or suggested packs affected the answer
- Surface missing links explicitly
- Escalate conflicts instead of resolving them silently
