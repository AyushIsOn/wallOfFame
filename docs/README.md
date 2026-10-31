# Wall of Fame documentation

Start with the row that matches what you're doing.

| I want to… | Read |
|---|---|
| Run it on my machine | [Getting started](getting-started.md) |
| Manage students (teachers, staff) | [Admin guide](admin-guide.md) |
| Put it online | [Deployment](deployment.md) |
| Take over the project | [HANDOVER.md](../HANDOVER.md), then [Architecture](architecture.md) |
| Understand how it works | [Architecture](architecture.md) |
| Change something | [Recipes](recipes.md), [Code reference](code-reference.md), [Contributing](../CONTRIBUTING.md) |
| Fix a problem | [Troubleshooting](troubleshooting.md) |
| Write a college report or prepare for a viva | [Academic material](#academic-material) |

## All documents

**Learning**
- [Getting started](getting-started.md): install, run, tour, first import (about 10 minutes)

**How-to**
- [Admin guide](admin-guide.md): sign in, import sheets, photos, re-imports, editing; for non-developers
- [Deployment](deployment.md): Render step by step, n8n, updates, backups, custom domain, checklist
- [Recipes](recipes.md): remove sample data, add a field, accept a new header, tune the wall, and more
- [n8n setup](../n8n/README.md): the AI bio + tags workflow
- [Troubleshooting](troubleshooting.md): symptom → cause → fix, with the app's real messages

**Reference**
- [Configuration](configuration.md): every environment variable and wall tunable
- [API](api.md): every endpoint, with real requests and responses
- [Data model](data-model.md): the student object, database table, spreadsheet rules, import rules
- [Code reference](code-reference.md): every file and function, plus the invariants

**Background**
- [Architecture](architecture.md): system diagram, request flows, renderer, design decisions, glossary
- [Security and privacy](security.md): controls, known gaps, what's public
- [Roadmap](roadmap.md): known limitations and next steps

**Project**
- [README](../README.md) · [HANDOVER](../HANDOVER.md) · [CHANGELOG](../CHANGELOG.md) · [CONTRIBUTING](../CONTRIBUTING.md) · [AGENTS](../AGENTS.md) (for AI coding agents)

## Academic material

For the college project report and viva. These describe the project for
evaluators rather than maintainers.

- [Report prompt](academic/report-prompt.md): a prompt for writing the project report, with the facts corrected to match the code
- [Viva Q&A](academic/viva-qa.md): questions and answers on the design and code
- [Flowcharts](academic/flowcharts.md): diagrams of the built system, and of the original vision marked as not built

## Conventions in these docs

- File paths are relative to the repository root.
- Example output was captured from a running server, unless marked otherwise.
- "Production" means `DATABASE_URL` is set, `NODE_ENV=production`, or running on Render.
- Terms (About, bio, card, cell, tile, stride…) are defined in the
  [glossary](architecture.md#glossary).
- When code and docs disagree, the code is right. Fix the doc in the same pull request.
