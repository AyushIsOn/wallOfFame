# Wall of Fame — Deployment & Admin Guide

A single Node service serves three things:

- **The wall** (`/`) — the public WebGL wall + list view.
- **The admin** (`/admin`) — password-protected dashboard to manage students.
- **The API** (`/api/*`) — student data + images, consumed by both.

Data lives in **PostgreSQL**. Images are stored in the database (resized to a
capped full image + a square thumbnail), so no separate file storage is needed.

---

## Deploy on Render (recommended)

> **Render's free tier allows only ONE free PostgreSQL database per account.**
> So the blueprint does **not** auto-create a database (that caused the
> "cannot have more than one active free tier database" error). You point the
> app at a database you create or reuse.

1. Push this repo to GitHub.
2. **Create / reuse a PostgreSQL** in Render:
   - If you have no free Postgres yet: **New → PostgreSQL** (free plan).
   - If you already have one (the free limit), you can reuse it.
   - Copy its **Internal Database URL**.
3. In Render: **New → Blueprint**, point it at the repo. `render.yaml` creates
   the **Web Service** (`wall-of-fame`).
4. In the service's **Environment** settings, set:
   - `DATABASE_URL` — paste the Internal Database URL from step 2.
   - `ADMIN_PASSWORD` — the admin login password.
   - (`TOKEN_SECRET` is generated for you.)
   - `N8N_TAGS_WEBHOOK_URL` — optional (see below).
5. Deploy. On first boot the schema is created and seeded with the sample
   students. Open `/admin` to manage them.

> If `DATABASE_URL` is left unset the server falls back to PGlite on the local
> (ephemeral) disk — fine for a quick look, but data resets on every deploy, so
> always set `DATABASE_URL` for a real deployment.
>
> Free Postgres on Render expires after ~90 days; upgrade the database plan for
> a permanent instance.

---

## Local development

```bash
npm install
cp .env.example .env        # set ADMIN_PASSWORD etc. (DATABASE_URL stays empty)

# Terminal 1 — API + DB (uses in-process PGlite, no Postgres needed):
npm run dev:server

# Terminal 2 — frontend with hot reload (proxies /api to the server):
npm run dev
```

Or run it the way production does (one server serving the built site):

```bash
npm run build && npm start      # http://localhost:3000  and  /admin
```

With `DATABASE_URL` empty, the server uses **PGlite** (an in-process Postgres)
persisted to `./.data/pg` — identical SQL to production Postgres.

---

## Admin usage

- **Add / edit / delete** students individually.
- **Upload a photo** per student — it's auto-resized and thumbnailed.
- **Generate tags** from the About/Bio text (uses n8n if configured, otherwise a
  built-in keyword extractor).
- **Import Excel/CSV** — bulk-create students from a sheet.

### Excel/CSV columns

Headers are matched case-insensitively with common aliases. Recognised fields:

`Name`, `Year` (or `Batch`), `Reg No`, `Department` (or `Branch`), `Type`,
`Category`, `Duration`, `Stipend`, `Bio` (or `About` / `Description`),
`Tags` (comma-separated), `LinkedIn`, `Website`, `Certificate`.

Only `Name` is required. Rows without tags are auto-tagged from the Bio on import.
Photos are uploaded per-student in the admin after import.

---

## n8n tag generation (optional)

Set `N8N_TAGS_WEBHOOK_URL` to a webhook that:

- receives `POST { "about": "<bio text>" }`
- returns `{ "tags": ["AI", "ML", "DESIGN"] }` (2–3 tags)

Your n8n workflow can call an LLM to pick the most relevant tags. If the webhook
is unset or fails, the server falls back to local keyword extraction.

---

## Environment variables

| Variable | Purpose |
|---|---|
| `PORT` | Server port (Render sets this). |
| `DATABASE_URL` | Postgres connection string. Empty → local PGlite. |
| `PGSSL` | Set `false` if your Postgres connection rejects SSL. |
| `ADMIN_PASSWORD` | Admin login password. |
| `TOKEN_SECRET` | Secret for signing admin tokens. |
| `N8N_TAGS_WEBHOOK_URL` | Optional n8n webhook for tag generation. |
