---
id: publication
title: Publish source checkout with generated CI evidence
status: accepted
related_specs:
  - publication
---
# Publication
## Context
The toolkit needs a reproducible public entry point without relying on the author's filesystem or global agent setup.
## Decision
Publish source to bon-on/harness-lab. Document a clone, npm ci, build workflow with Node.js 22 or newer; defer npm registry distribution. Keep English primary documentation and Korean onboarding. Exclude local reports and execution evidence from Git, regenerate evidence in CI, and run a weekly audit with findings in the job summary.
## Consequences
Users maintain a tool checkout and pass explicit target paths. CI tests supported Node versions. Default audit can pass with maintenance warnings; maintainers must inspect the summary. Documentation and CI are included in the evidence scope.
## Amendments
- 2026-10-21: Claude Code is the primary agent; Codex is supported through the same repository-local workflow. Documentation leads with Claude-specific features (CLAUDE.md import, `.claude/agents/code-reviewer.md`, `.claude/skills`) and lists Codex differences separately. Shared policy stays in `harness/workflow.md`, so Codex compatibility does not fork the rules. A Korean README mirrors the English one; the structure diagram ships as language-specific SVGs under `docs/images/` that follow the viewer's OS or browser color scheme (GitHub renders README images without its own theme setting). Alternative considered: Claude-only support, rejected because AGENTS.md costs one line and keeps existing Codex users working. Consequence: the two READMEs must be updated together.
