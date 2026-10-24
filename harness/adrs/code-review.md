---
id: code-review
title: Skill-sourced independent reviewer with a generated Claude agent
status: accepted
related_specs:
  - code-review
  - cross-review
---
# Code review
## Context
Claude Code supports subagent definitions in `.claude/agents/` with their own tools and model; Codex has skills but no equivalent agent file. Built-in review commands are host-specific and do not read harness specs, ADRs or acceptance criteria.
## Decision
Define the review procedure once in `skills/harness-review/SKILL.md`. Generate `.claude/agents/code-reviewer.md` from the packaged skill body with read-only tools (Read, Grep, Glob, Bash) and `model: opus`, and include it in the `init` kit. Codex and other hosts run the skill in a separate agent. The workflow and harness-develop require an independent review before completion; the coordinator still owns acceptance.
## Alternatives
- Maintain the procedure separately in the agent file and the skill: rejected because the copies drift.
- Rely on the host's built-in review command: rejected because it is host-specific and not harness-aware.
- Keep review optional: rejected because self-review missed defects that an independent pass catches.
## Consequences
Target projects receive a new managed file; edited copies are preserved by `update`. The agent is an optional kit path: when the file, `.claude` or `.claude/agents` is a symlink, init and update report that file alone as `skipped`, and rollback tolerates the link unless the transaction recorded that file so shared agent directories keep working, while required paths behind symlinks still refuse the whole kit. The generator normalizes CRLF and fails if the skill lacks frontmatter. Bash access means read-only behavior is enforced by instruction, not by the tool list. Review adds model cost to every non-trivial change; trivial changes may skip with a stated reason. A review report is input to the coordinator, not completion evidence.
