# Handover

Read this first if you are taking over Wall of Fame. It covers what state the
project is in, what you need access to, what can go wrong, and where to look
next. Written October 2026, after PR #32.

- [1. The project in brief](#1-the-project-in-brief)
- [2. Current state](#2-current-state)
- [3. Accounts and access](#3-accounts-and-access)
- [4. Risks and deadlines](#4-risks-and-deadlines)
- [5. Decisions waiting for an owner](#5-decisions-waiting-for-an-owner)
- [6. Your first day](#6-your-first-day)
- [7. Making changes safely](#7-making-changes-safely)
- [8. Map of the documentation](#8-map-of-the-documentation)

---

## 1. The project in brief

A public website for Manipal University Jaipur that shows student achievements
as an infinite, draggable WebGL wall, with profiles, a list view, filters and
search. Staff manage it from `/admin`, mainly by uploading the spreadsheet a
Google/Microsoft Form produces. The server imports the rows, downloads the
photos, and asks an n8n workflow (with an LLM) to turn each student's raw About
text into a short bio and tags.

It is **one Node.js service** (Express 5) that serves the site, the admin and a
JSON API, backed by **PostgreSQL** (PGlite locally). Hosting is **Render**.

| | |
|---|---|
| Repository | `AyushIsOn/wallOfFame` (public), default branch `main` |
| Owner | Ayush (GitHub `AyushIsOn`) |
| Started | September 2025; most work June–July 2026; hardening October 2026 |
| Size | About 2,750 lines of JavaScript, 2,150 lines of CSS; 6 runtime dependencies |

---

## 2. Current state

**Works and verified** (scripted API and headless-browser checks, a 5,000-student
stress test, and a replay of the getting-started tutorial; see
[CONTRIBUTING.md](CONTRIBUTING.md#verify-your-change)):

- The wall: rendering, drag, hover, click → profile, filters, search, list
  view, students without photos, loading and error states.
- The admin: sign-in (rate-limited), import with safe re-imports, add/edit/delete,
  photo upload, tag generation.
- Security hardening: XSS escaping, CSP, production refuses default passwords,
  clickjacking protection, no known-vulnerable dependencies (`npm audit`: 0).

**Not built** (from the original vision): certificate generation, email
notifications, analytics, per-user admin accounts. See [docs/roadmap.md](docs/roadmap.md).

**Not automated:** there is no test suite or CI. Changes are verified with the
checklist in [CONTRIBUTING.md](CONTRIBUTING.md#verify-your-change).

**Open work:** PR #32 (`fix/finish-hardening`) holds the October 2026 fixes and
this documentation. Merge it before starting new work. What changed is in
[CHANGELOG.md](CHANGELOG.md).

---

## 3. Accounts and access

Get these from the current owner before they leave:

| What | Why | Where it's configured |
|---|---|---|
| GitHub repository (admin or write) | Code, PRs; Render deploys from `main` | – |
| **Render** web service `wall-of-fame` | Deploys, logs, environment variables | Render dashboard |
| **Render PostgreSQL** database | All student data and photos | `DATABASE_URL` on the web service |
| `ADMIN_PASSWORD` | Admin sign-in | Render → Environment |
| **n8n** instance and the "Wall of Fame — Enrich" workflow | AI bios | `N8N_TAGS_WEBHOOK_URL` |
| **Groq** or **OpenRouter** API key | Used by the n8n workflow | n8n credential (Header Auth) |
| The college's submission form (if any) | Source of the spreadsheets; GET FEATURED link | `VITE_GET_FEATURED_URL` |
| Custom domain DNS (if any) | The public address | Render → Custom Domains |

Everything is configured through environment variables; nothing secret is in
the repository. Reference: [docs/configuration.md](docs/configuration.md).

---

## 4. Risks and deadlines

| Risk | Why it matters | What to do |
|---|---|---|
| **Free Render Postgres expires 30 days after creation**, then is deleted after a 14-day grace period | All students and photos would be lost | Check the database's creation date in Render **today**. Upgrade it or migrate ([deployment.md](docs/deployment.md#backups-and-the-free-tier)), and take a `pg_dump` backup. |
| **Sample students on the live site** | 25 stock photos with made-up names look like real students | Remove them ([recipes.md](docs/recipes.md#remove-the-sample-students)); set `SEED_SAMPLE_DATA=false` |
| **`ADMIN_PASSWORD` must be set in production** | Since PR #32, an unset password disables admin login rather than defaulting to `admin` | Make sure it's set on Render before deploying PR #32 |
| **Shared admin password** | Anyone who knows it is "the admin" | Rotate `ADMIN_PASSWORD` + `TOKEN_SECRET` when someone leaves ([recipes.md](docs/recipes.md#change-the-admin-password--sign-everyone-out)) |
| **Personal data is public** | Profiles and `GET /api/students` expose registration numbers, stipends, bios | Confirm consent and which fields to publish ([security.md](docs/security.md#privacy)) |
| **No automated tests** | Regressions are only caught by hand | Follow the checklist; tests + CI are roadmap item 1 |
| **Third-party site copy in the repo** | `phantom-land/` (11 MB) is a saved copy of phantom.land, the design reference, in a public repository | Decide whether to remove it ([roadmap.md](docs/roadmap.md#housekeeping)) |

---

## 5. Decisions waiting for an owner

1. **Database plan:** paid Render Postgres (recommended) or another host.
2. **Which fields are public:** keep or drop registration numbers and stipends.
3. **AI provider:** Groq free tier (about 30 requests/minute) or paid, which
   affects import speed for big sheets.
4. **Admin accounts:** stay with one shared password, or build per-user sign-in
   (for example with the college's Google/Microsoft accounts).
5. **`phantom-land/`:** keep, move to a private place, or delete.
6. **License:** add one (`package.json` says ISC, but there's no LICENSE file).

---

## 6. Your first day

1. **Run it:** [docs/getting-started.md](docs/getting-started.md) (about 10
   minutes, no database server needed).
2. **Understand it:** [docs/architecture.md](docs/architecture.md), especially
   [the WebGL wall](docs/architecture.md#the-webgl-wall) and
   [design decisions](docs/architecture.md#design-decisions).
3. **Learn the rules:** the [invariants](docs/code-reference.md#invariants), the
   things that must stay true when you change code.
4. **Check production:** open `/api/health`, sign in to `/admin`, check the
   database expiry date and the environment variables in Render.
5. **Merge PR #32** after the verification checklist passes.

---

## 7. Making changes safely

- Work on a branch and open a PR into `main`; Render deploys `main`
  automatically. Conventions: [CONTRIBUTING.md](CONTRIBUTING.md).
- Before merging, run the
  [verification checklist](CONTRIBUTING.md#verify-your-change).
- Update the docs in the same PR. [CONTRIBUTING.md](CONTRIBUTING.md#documentation)
  says which file covers what.
- Schema changes go in `migrate()` and must be idempotent (`IF NOT EXISTS`).
- Back up the database before risky changes or big imports.
- Rollback: Render → service → Events → earlier deploy → Rollback.

---

## 8. Map of the documentation

| Need | Document |
|---|---|
| Overview and quick start | [README.md](README.md) |
| Index of all docs | [docs/README.md](docs/README.md) |
| Run locally | [docs/getting-started.md](docs/getting-started.md) |
| Using the admin (for staff) | [docs/admin-guide.md](docs/admin-guide.md) |
| Deploy, back up, restore | [docs/deployment.md](docs/deployment.md) |
| All settings | [docs/configuration.md](docs/configuration.md) |
| API | [docs/api.md](docs/api.md) |
| How it works | [docs/architecture.md](docs/architecture.md) |
| Fields, database, import rules | [docs/data-model.md](docs/data-model.md) |
| Every file and function | [docs/code-reference.md](docs/code-reference.md) |
| How to make common changes | [docs/recipes.md](docs/recipes.md) |
| Problems | [docs/troubleshooting.md](docs/troubleshooting.md) |
| Security and privacy | [docs/security.md](docs/security.md) |
| What's next | [docs/roadmap.md](docs/roadmap.md) |
| History | [CHANGELOG.md](CHANGELOG.md) |
| AI setup | [n8n/README.md](n8n/README.md) |
| College report and viva | [docs/academic/](docs/academic/) |

This file replaces the earlier `HANDOVER.md` (a line-by-line code walkthrough,
now [docs/code-reference.md](docs/code-reference.md)), `CONTEXT.md`,
`PROJECT_OVERVIEW.md` and `DEPLOY.md`. Their content was checked against the
code and merged into the documents above; the originals are in the git history.
