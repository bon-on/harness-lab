---
id: installation-updates
title: Installable CLI and non-destructive project updates
status: maintained
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
- Let projects set up by hand or by harness-apply opt in to updates: keep project-specific instructions in project-owned `harness/project.md` and record provenance for template-identical files through an explicit `adopt` command.
## Acceptance Criteria
- A packed release installs and runs from another directory without a tool checkout, dev dependencies, or registry requests.
- init without a subcommand targets the current project; init repo-kit --output remains compatible.
- Update defaults to a read-only preview; --apply changes only missing new files or tracked files whose contents match the recorded baseline.
- Locally modified, deleted, and preexisting untracked files are preserved and clearly reported; no implicit adoption of old files.
- Updates save originals and state in local transaction backups; rollback previews by default and refuses to overwrite post-update edits.
- Malformed state, traversal, symlinks inside the canonical target, hardlinked files and overlapping mutations fail without altering unrelated files; explicit root aliases resolve consistently.
- Tool upgrade and project-template update are documented as separate actions with versioned install commands.
- CLI and package integration tests exercise success and failure behavior.
- The kit separates tool-managed files (agent entry points, workflow, templates, reviewer agent) from project-owned `harness/project.md`, which the workflow and both entry points load.
- `adopt` previews by default; with --apply it records baselines only for existing kit files identical to the current template, creates missing kit files, and reports customized files as unmanaged without changing them. It is a rollback-able transaction; rollback releases provenance without changing file contents.
- After adoption, `update --apply` replaces adopted files whose contents still match their baseline.
- harness-apply moves project-specific content out of managed files into `harness/project.md` (or rules, specs, ADRs), restores the template text, and runs `adopt`.
## Constraints
- No npm registry publication or namespace ownership assumed. Release tarballs provide an immediately usable install route.
- No updates to previously adopted private projects or global agent skills in this task; applying adoption to them is a separate, authorized step.
- Preserve existing CLI behavior and project decisions; no force overwrite flag.
## Evidence
- npm test
- npm pack and isolated package installation smoke tests
