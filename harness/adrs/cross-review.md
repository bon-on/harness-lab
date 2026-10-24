---
id: cross-review
title: Run the other model's CLI as a recorded read-only reviewer
status: accepted
related_specs:
  - cross-review
---
# Cross-model review
## Context
The `code-reviewer` agent gives an independent context but usually the same model family as the author, and its report is relayed as narrative. The user has both Claude Code and Codex CLIs logged in. Different models miss different defects, and harness-lab already turns command runs into checkable evidence.
## Decision
Add `harness-lab cross-review`, the first command that invokes a model. It runs the installed Codex or Claude CLI non-interactively in read-only mode with the packaged `harness-review` procedure and the diff, and stores prompt, review, logs and a `review.json` record whose integrity `check-evidence` validates like command evidence. The user chooses the reviewer explicitly; the workflow recommends the model that did not write the change. Nothing runs it implicitly.
## Alternatives
- Workflow guidance only: no new code, but leaves no record that the other model actually reviewed the current source.
- Provider APIs through SDKs: needs API keys and new dependencies; the CLIs reuse the user's existing logins and sandboxes.
- Built-in `codex exec review`: Codex-only and unaware of harness specs, ADRs and acceptance criteria.
- Automatic author detection from environment variables: unreliable across hosts; an explicit flag is clearer.
## Consequences
Each run spends the user's model quota and can take minutes. Read-only behavior relies on the reviewer CLI (Codex's OS sandbox; Claude limited to Read, Grep and Glob under `dontAsk`, because allowing git subcommands would let `git diff --output` write files) plus input hash comparison after the run. Claude therefore reads the full diff from `diff.patch` instead of running git. The reviewer can still read any file in the repository, including secrets, as an interactive session could. User configuration still loads: Codex MCP servers from `~/.codex/config.toml` (whose tools run outside its sandbox) and Claude hooks from user settings; harness-lab does not override them because that could also drop authentication or the user's own safeguards. The reviewer runs in its own process group so a timeout also stops processes it spawns (the installed `codex` is a Node wrapper around a native binary); this relies on POSIX process groups, so on Windows a timed-out reviewer may keep running. CLI flags may change between versions: argv is recorded and `--command` selects another executable. A review record is evidence that a review ran against specific source, not that its findings are correct; the coordinator still owns acceptance.
