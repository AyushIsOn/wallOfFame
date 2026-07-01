# Wall of Fame — Project Overview, Progress & Roadmap

> A detailed running log of **what this project is**, **what we built**, **what's
> planned**, and **the current status**. For the deep architecture reference see
> [`CONTEXT.md`](./CONTEXT.md); for deploy steps see [`DEPLOY.md`](./DEPLOY.md);
> for the n8n LLM setup see [`n8n/README.md`](./n8n/README.md). This file is the
> "where are we / where are we going" map.

---

## 1. The product in one paragraph

A college **Wall of Fame**: a discoverable, **infinite WebGL wall** of student
achievements. Each tile shows a photo, name, batch/year and 2–3 tags. Clicking a
tile opens a **profile** (about/bio, socials, certificate). There is also a
**list view** with **filters** (category / department / year) and **search**.
Students are managed in a separate **admin dashboard** backed by a database,
with **Excel/CSV import**, **per-student image upload**, and **AI enrichment**
(an n8n + LLM workflow that rewrites the raw "About" text into a concise
first-person bio and generates tags).

**Design language:** dark theme, monospace type (IBM Plex Mono / At Hauss Mono),
glassmorphism accents, and a barrel/fisheye infinite grid — inspired by
phantom.land.

**Primary goals (from the owner, a designer):**
1. Pixel-sharp rendering — crisp grid lines, contained per-cell hover glow, white
   name text, symmetric tile layout.
2. Light and fast to load; production-ready; no bugs.
3. **Scalable** — must comfortably display hundreds of students over time
   (~20–25 new students *every month*), not just the ~25 samples.

---

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Vanilla JS + **Vite** + **Three.js** | No framework = lightest possible WebGL wall, full control over the renderer |
| Backend | **Node + Express 5** | One service serves the wall, the admin, and the JSON API |
| Database | **PostgreSQL** (prod) / **PGlite** (local) | Same SQL; PGlite is in-process so local dev needs zero setup |
| Images | **sharp** | Server-side resize → full + thumbnail WebP, stored in Postgres as `bytea` |
| Import | **xlsx** | Parse Excel/CSV from Google/Microsoft Forms exports |
| AI enrichment | **n8n** + LLM (Groq / OpenRouter) | Rewrites About → bio + tags; OpenAI-compatible, swappable |
| Hosting | **Render** (Web Service + managed Postgres) | One-click `render.yaml` blueprint |

---

## 3. How the rendering works (the core engineering)

The wall is **virtualized + single-pass**, which is what makes it both scale and
stay sharp:

- **Virtualized streaming:** only the cells in view are drawn, using a small
  recycled pool of subdivided quads (`TILE_POOL = 120`). Each visible student's
  photo+text is composited into **one card texture** built lazily and held in an
  **LRU cache** (`src/gl/textureCache.js`), then disposed when it scrolls off.
  GPU memory and network are bounded by the **viewport**, not by the total
  number of students — verified to 1,000+ tiles with a peak of ~108 live
  textures.
- **Single-pass / sharp:** tiles render **directly to the screen** (no offscreen
  render target — that was the original blur culprit). The barrel/fisheye
  distortion is applied **per-vertex** in the vertex shader (`src/shaders.js`).
  Grid lines and hover glow are computed in the fragment shader. Card textures
  use `LinearFilter` with **mipmaps disabled**.
- **Hover glow:** each photo's **dominant color** is computed once at load
  (`src/gl/card.js` → `averageColor`) and used as a flat, darkened wash that
  fills the cell (contained per-cell, not a circular halo).
- **Thumbnails:** the wall loads small `/thumbs/*.webp` (or
  `/api/students/:id/thumb`); the profile uses the full image
  (`student.thumbnail || student.image`).

Tunables live in `src/config.js`: `WALL` (cellSize, distortionK, lerp), `FADE`
(edge fade), `LAYOUT` (symmetric title/tags bands), `CARD` (768 desktop / 512
mobile, cache limit), `TILE_POOL`, `CATEGORIES`.

---

## 4. Data flow — the single seam

`src/store.js` is the **single source of truth**. It paints instantly from the
static `data.js` (offline / first paint), then `load()` fetches `/api/students`
and swaps in the live dataset; filters rebuild and the wall + list re-render.
Adding the entire backend only required touching this one file. API records come
back already in the frontend shape:

```
{ id, name, year, regNo, department, type, category, duration, stipend, bio,
  tags: [], socials: { linkedin, website }, certificate, image, thumbnail }
```

`?seed=N` in the URL is a **stress-test mode** that replicates the sample data to
N synthetic tiles (skips the API) — used to prove scalability.

---

## 5. The admin + data pipeline

The college's real workflow: a teacher sends an Excel sheet to students, students
fill in their info, the teacher verifies/cleans it, then uploads **one sheet**.

1. **Excel-first admin** (`admin.html` + `src/admin/`): drag-drop an `.xlsx`/`.csv`,
   download a template, import all rows at once. Only `Name` is required; headers
   are matched by case-insensitive **aliases** (e.g. `Batch`→Year, `About`→Bio).
   Re-import is **idempotent** for rows that have a Reg No (it upserts).
2. **Photos:** pulled from a **Photo URL** column (Forms put Google Drive /
   OneDrive links there). The backend normalizes those share links to
   direct-download URLs and fetches + resizes them. Requires the file be shared
   "anyone with the link."
3. **AI enrichment (n8n):** during import, each row's About is POSTed to the n8n
   webhook, which returns a polished **first-person bio (≤256 chars)** + **2–3
   tags**. If the webhook is unset/down, a local truncate+keyword fallback keeps
   imports working.

---

## 6. What we've built so far (PR history — all merged to `main`)

| PR | Title | Status |
|----|-------|--------|
| #1 | Refactor static prototype into `src/` modules; fix filters/search/profile; trim load | ✅ merged |
| #2 | Virtualized, texture-streaming wall (scales to thousands) + thumbnail pipeline | ✅ merged |
| #3, #4 | Hover glow + visual fixes | ✅ merged (superseded) |
| #5, #6 | Sharpen wall: disable mipmaps, fisheye in vertex shader, crisp grid lines, flat in-cell glow | ✅ merged |
| #7 | Admin dashboard + Express/Postgres backend + Excel import + image upload + n8n tags + Render config | ✅ merged |
| #8 | Card layout tuning (symmetric title/tags bands) | ✅ merged |
| #9 | Crisp-wall re-apply + Render free-tier DB fix (set `DATABASE_URL` manually) | ✅ merged |
| #10 | Excel-first admin: prominent upload, template, photo-URL import (Drive normalization) | ✅ merged |
| #11 | Admin UI redesign (phantom-inspired) | ✅ merged |
| #12 | n8n enrichment workflow: About → first-person bio + tags; OneDrive link support | ✅ merged |

**`main` now contains all of the above (HEAD = merge of #12).**

---

## 7. In progress (not yet merged)

**List view redesign + filter/search bug fixes** (branch `feat/list-and-filters`):
- Redesign the **list view** to phantom's "All projects" layout — big "All
  projects" heading + grey "N projects" count, grouped by **year**, each row =
  title · tag pills · org/department, thin separators, row hover.
  (`src/ui/listView.js` rewritten.)
- **Bugs found via headless exploration that still need fixing:**
  1. **Search "×" bug:** closing the search overlay hides it but doesn't clear
     the query → results stay filtered with no visible search bar (a hidden
     stuck filter). Fix: `close()` must also clear input + `store.setSearch("")`.
  2. **Dead category options:** category pills come from the fixed `CATEGORIES`
     list, but real data only has a few categories → clicking e.g. "sports"
     returns 0 results. Fix: derive categories from live data (like
     department/year already are).

---

## 8. Known limitations (by design, not bugs)

- Excel rows **without** a Reg No can't dedup → re-import creates duplicates.
- Bulk import with n8n tagging is **sequential** (slow for thousands at once).
- A custom `Type` (e.g. "HACKATHON") becomes category `hackathon` while the
  filter pill is `hackathons` (plural) — minor naming drift.
- Images live in Postgres (`bytea`) — fine at college scale; move to object
  storage (R2 / S3) for very large datasets.
- Auth is a single shared admin password (no per-user accounts).

---

## 9. Roadmap / next steps

- Finish & merge the **list-view redesign + filter/search fixes** (Section 7).
- **Photo matching in import** (e.g. a Reg-No-named photo zip → auto-attach), or
  an authenticated Drive/OneDrive n8n workflow for locked-down M365 orgs.
- **Object storage** for images at scale; **batch/async** import with progress.
- Per-user admin accounts / audit log; reordering; draft vs published.
- Integrate **liquid-glass** UI components (kept in `liquid-glass/` for later).

---

## 10. Running it locally

```bash
npm install
cp .env.example .env          # leave DATABASE_URL empty -> uses PGlite

npm run dev:server            # API + in-process DB at http://localhost:3000
npm run dev                   # frontend hot reload at http://localhost:5173 (proxies /api)

# production-style (one server serving the built site):
npm run build && npm start    # http://localhost:3000  and  /admin

npm run thumbs                # regenerate sample thumbnails after adding img*.jpeg
```

---

## 11. Deploying on Render

1. Push to GitHub → Render **New → Blueprint** (`render.yaml`) → creates the web
   service + managed Postgres (auto-wires `DATABASE_URL`).
2. Set `ADMIN_PASSWORD` (and optional `N8N_TAGS_WEBHOOK_URL`) in the dashboard.
3. Deploy → first boot creates the schema and seeds the sample students → open
   `/admin`.

> Free Render Postgres expires ~90 days — upgrade for permanence. See
> `DEPLOY.md` for the full guide.
