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
