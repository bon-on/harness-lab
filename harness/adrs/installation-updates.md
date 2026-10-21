---
id: installation-updates
title: Versioned package distribution and hash-based managed updates
status: accepted
related_specs:
  - installation-updates
---
# Installation and updates
## Context
Source-checkout distribution creates onboarding work. The existing create-only scaffolder protects user files but cannot safely evolve generated templates.
## Decision
Ship a built npm-compatible release tarball with CLI bins. This extends the source-checkout decision in publication; registry publication remains deferred. Track only tool-created files in .harness-lab/state.json with source hashes and tool version. Update is a read-only plan by default; applying may replace a tracked file only when its current hash matches its baseline. Preexisting, modified or deliberately deleted files remain user-owned. Retain local transaction backups and support hash-guarded rollback, including prior state. Resolve the explicitly selected root to its actual location, reject symlinks below it and hardlinked files, and serialize mutations with a lock. Retain retired template provenance without deleting project files.
## Alternatives
Blind overwrite loses policy; automatically adopting existing matching files obscures ownership; automatic text merges can alter policy semantics. A separate updater service is unnecessary for local files.
## Consequences
Users explicitly apply previews and resolve preserved files manually. Existing pre-provenance projects are not silently managed. Backups remain local; state may be versioned with the project. Upgrading the executable does not automatically update project files. Hashes establish drift, not authenticity or semantic correctness.
