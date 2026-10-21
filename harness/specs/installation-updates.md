---
id: installation-updates
title: Installable CLI and non-destructive project updates
status: active
related_adrs:
  - installation-updates
related_contracts:
  - installation-updates
required_evidence:
  - cli-regressions
  - packed-install-smoke
---
# Installation and updates
## Problem
Users must clone and build the toolkit, and repeated initialization cannot distinguish generated files from local project changes when templates evolve.
## Scope
- Distribute a built npm-compatible tarball with an executable CLI.
- Add short init, update preview/apply, and guarded rollback commands while preserving legacy commands.
- Record provenance only for generated files created by this tool; preserve existing project files.
## Acceptance Criteria
- A packed release installs and runs from another directory without a tool checkout, dev dependencies, or registry requests.
- init without a subcommand targets the current project; init repo-kit --output remains compatible.
- Update defaults to a read-only preview; --apply changes only missing new files or tracked files whose contents match the recorded baseline.
- Locally modified, deleted, and preexisting untracked files are preserved and clearly reported; no implicit adoption of old files.
- Updates save originals and state in local transaction backups; rollback previews by default and refuses to overwrite post-update edits.
- Malformed state, traversal, symlinks inside the canonical target, hardlinked files and overlapping mutations fail without altering unrelated files; explicit root aliases resolve consistently.
- Tool upgrade and project-template update are documented as separate actions with versioned install commands.
- CLI and package integration tests exercise success and failure behavior.
## Constraints
- No npm registry publication or namespace ownership assumed. Release tarballs provide an immediately usable install route.
- No updates to previously adopted private projects or global agent skills in this task.
- Preserve existing CLI behavior and project decisions; no force overwrite flag.
## Evidence
- npm test
- npm pack and isolated package installation smoke tests
