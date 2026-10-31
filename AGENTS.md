# Agent guide

Instructions for AI coding agents working in this repository. Humans: see
[README.md](README.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

## Project

Wall of Fame: a public WebGL wall of student achievements plus an admin
dashboard, served by one Node.js/Express 5 service backed by PostgreSQL (PGlite
locally). Vanilla JS + Three.js frontend built with Vite; no UI framework.

Read before changing code:
- @HANDOVER.md: state, risks, open decisions
- @docs/architecture.md: how it works and why
- @docs/code-reference.md: every file and function, plus the **invariants**
- @package.json: scripts

## Commands

```bash
npm install                      # Node >= 20.12
npm run dev:server               # API + PGlite DB on :3000 (restart after server/ edits)
npm run dev                      # frontend on :5173, proxies /api to :3000
npm run build && npm start       # production-style on :3000
PGLITE_DIR=.data/scratch npm start   # throwaway database
```

There is no test runner. Verify with the checklist in
[CONTRIBUTING.md](CONTRIBUTING.md#verify-your-change). Don't start
long-running watchers in a non-interactive shell.

## Where things are

| Task | Files |
|---|---|
| Wall rendering, input | `src/gl/wall.js`, `src/shaders.js`, `src/config.js` |
| Tile content | `src/gl/card.js` |
| Data loading, filters | `src/store.js` |
| Profile, list, filters, search UI | `src/ui/*.js`, `index.html`, `styles.css` |
| Admin | `src/admin/admin.js`, `admin.html`, `src/admin/admin.css` |
| Routes, headers, import flow | `server/index.js` |
| Schema, DB engine | `server/db.js` (`migrate()`) |
| Queries, row ↔ object | `server/students.js` |
| Spreadsheet parsing | `server/excel.js` |
| Auth | `server/auth.js` |
| AI enrichment | `server/tags.js`, `n8n/enrich.workflow.json` |

## Rules

1. **Escape all data put into HTML** (`escapeHtml`, `textContent`, DOM nodes);
   pass links through `safeUrl`. Student data comes from spreadsheets and is untrusted.
2. **No inline `<script>` or `on…=` handlers**; the CSP (`server/index.js`) blocks them.
3. **Drawing and hit-testing share one mapping** (`cellIndex()`, `config.js`).
   Change the vertex warp and `cellCoordsAt()` together.
4. **Keep card textures mipmap-free.**
5. **Views read data only from `store`.**
6. **Schema changes:** additive and idempotent (`ADD COLUMN IF NOT EXISTS`) in `migrate()`.
7. **`server/env.js` stays the first import** of `server/index.js`.
8. **Never select photo bytes** in list queries.
9. **Re-imports must not destroy admin edits** (blank cells and unchanged
   About/Photo URL keep existing values).
10. **Secrets only in environment variables.** Never commit `.env`, `.data/` or
    real student data.
11. **Minimal dependencies;** ask before adding one.
12. **Update the docs in the same change** (mapping in
    [CONTRIBUTING.md](CONTRIBUTING.md#documentation)) and add a
    [CHANGELOG.md](CHANGELOG.md) entry.

## Style

Match the existing code: ES modules, 2-space indent, double quotes, semicolons,
small arrow-function helpers, a purpose comment at the top of each file,
comments that explain why. Use descriptive names, and give complex conditions a
named boolean. Branches `<type>/<desc>`; commits `<type>(<scope>): <summary>`.

## Scratch files

`_*.mjs` and `_*.png` at the repo root are gitignored; use them for one-off
scripts. `.data/` (local databases) is gitignored too.
