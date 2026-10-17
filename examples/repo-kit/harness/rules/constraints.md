# Constraints

- Default policy mode: warn on drift, block critical gaps.
- Every feature change needs a feature spec in `harness/specs/`.
- Architectural or cross-cutting decisions need an ADR in `harness/adrs/`.
- AI responses must cite the spec, ADR, and rule files they used.
- If the repo state contradicts the spec or ADR, escalate instead of guessing.
