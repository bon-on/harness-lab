# harness-lab

A toy project for **harness engineering** practice.

It helps you compare prompt harness variants for coding-assistant style tasks without needing any external model API.

## Why this is a good toy project

If you want to get better at AI-assisted development, it is useful to move beyond "prompting" into **harness design**:

- system / developer / user prompt layering
- repeatable eval cases
- output scoring rules
- variant comparison
- choosing prompts based on task quality, not vibes

This project gives you a tiny local lab for that workflow.

## What it does

- load a JSON harness spec
- render prompt variants
- evaluate mock outputs against checks
- rank variants by score
- show a winner per test case

## Quick start

```bash
npm install
npm run dev
```

Or build and run:

```bash
npm run build
npm start
```

## Example output

You will see:

- each test case
- each harness variant
- score breakdown
- winner per case
- preview of the winning prompt

## File structure

```text
src/index.ts                     CLI entrypoint
examples/coding-assistant.json   sample harness + eval cases
```

## Suggested next improvements

Good next steps if you want to evolve this into a more serious project:

1. Add YAML support
2. Add real LLM provider adapters
3. Save run history to SQLite
4. Export markdown reports
5. Add pairwise diff views for outputs
6. Add rubric checks like JSON shape, tone, or citation policy

## Why I recommend this project for you

You said you do backend, frontend, and data engineering work. This kind of project is nice because it sits at the intersection of:

- developer tooling
- evaluation systems
- prompt architecture
- automation mindset

It is also directly useful if you want to get better at working with tools like Codex, Claude Code, or agent-based workflows.
