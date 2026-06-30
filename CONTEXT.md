# Wall of Fame — Project Context

A living reference for the project: what it is, how it's built, how to run/deploy
it, what's been done, and what's next. Read this first when picking the project
back up (or starting a new chat).

---

## 1. What it is

A college "Wall of Fame": a discoverable, infinite **WebGL wall** of student
achievements (photo, name, batch/year, 2–3 tags). Clicking a tile opens a
profile (about, socials, certificate). There's also a **list view** and
**filters** (category / department / year + search). Students are managed
through an **admin dashboard** backed by a database, with **Excel/CSV import**,
**image upload**, and **n8n/LLM tag generation**.

Design language: dark theme, monospace type (IBM Plex Mono / At Hauss Mono),
glassmorphism, barrel/fisheye infinite grid (inspired by phantom.land).

---

## 2. Tech stack

- **Frontend:** vanilla JS + Vite + Three.js (no framework — lightest option for
  the WebGL wall).
- **Backend:** Node + Express 5 (one service serves the wall, the admin, and the
  API).
- **Database:** PostgreSQL in production (`pg`); **PGlite** (in-process Postgres,
  same SQL) locally so it runs with zero setup.
- **Images:** `sharp` (server-side resize → full + thumbnail, stored in Postgres
  as `bytea`). `scripts/thumbs.mjs` also pre-generates thumbnails for the static
  sample images.
- **Hosting:** Render (Web Service + managed Postgres) via `render.yaml`.

---

## 3. Repository structure

```
index.html              Wall page (entry)
admin.html              Admin page (entry)
styles.css              Wall styles
data.js                 Static sample data (instant render + offline fallback + DB seed)
vite.config.js          Multi-page build (wall + admin) + /api dev proxy
render.yaml             Render blueprint (web service + Postgres)
.env.example            Env template
DEPLOY.md               Deploy + admin usage guide
scripts/thumbs.mjs      Generate thumbnails for static sample images (npm run thumbs)

src/                    Frontend
  config.js             Wall constants (cell size, distortion, fade, card size/cache, categories)
  store.js              SINGLE SOURCE OF TRUTH: fetches /api/students, fallback to data.js
  shaders.js            Tile vertex (fisheye) + fragment (image+grid+glow+fade) shaders
  main.js               Wires store -> wall + list + filters + search + profile
  gl/
    wall.js             Virtualized renderer (tile pool, streaming, hover, click)
    card.js             Draws a student "card" (photo+title+tags) + dominant-color extraction
    textureCache.js     LRU cache of card textures (lazy load, evict)
  ui/
    filters.js          Filter pills (derived from data; rebuild on live load)
    search.js           Search overlay
    listView.js         List view (click -> profile)
    viewToggle.js       Wall <-> list toggle
    profileOverlay.js   Profile modal (filter-aware "next", certificate)

server/                 Backend
  index.js              Express app: serves dist + admin + API; error handling
  db.js                 pg/PGlite abstraction; schema migrate; seed from data.js
  students.js           Student queries + row->frontend-shape mapping
  auth.js               Admin login (ADMIN_PASSWORD) -> HMAC bearer token
  images.js             sharp resize -> { full, thumb } webp buffers
  excel.js              Excel/CSV parsing (flexible header aliases)
  tags.js               Tag generation (n8n webhook or local keyword fallback)

public/                 Static assets
  fonts/  (woff2 only)  IBM Plex Mono, At Hauss Mono, Klim
  images/back.svg
  img1..25.jpeg         Sample photos (intentionally motion-blurred stock art)
  thumbs/img*.webp      Pre-generated wall thumbnails for the samples
```

> Note: the sample photos are deliberately blurry artistic shots — that softness
> is the *source content*, not the renderer. Real student photos render sharp.

---

## 4. How the rendering works (important)

The wall is **virtualized + single-pass**, which is what makes it scale and stay
sharp:

- **Virtualized:** only the cells in view are drawn (a small recycled pool of
  subdivided quads). Each visible student's photo+text is a **card texture**
  built lazily and kept in an **LRU cache** (`textureCache.js`), then disposed
  when it scrolls away. GPU memory + network are bounded by the viewport, not by
  total student count (verified to 1,000+ with peak ~108 live textures).
- **Single-pass / sharp:** tiles render **directly to the screen** (no offscreen
  buffer). The barrel/fisheye distortion is applied **per-vertex**
  (`shaders.js` vertex shader). Grid lines and the hover glow are drawn in the
  **fragment shader**. Card textures use `LinearFilter` with **no mipmaps**
  (mipmaps were the cause of an earlier blur).
- **Hover glow:** each photo's **dominant color** is computed once at load
  (`card.js averageColor`) and used as a flat, darkened wash that fills the cell
  (contained per-cell; not circular).
- **Thumbnails:** the wall loads small `/thumbs/*.webp` (or `/api/students/:id/thumb`);
  the profile uses the full image. `student.thumbnail || student.image`.

Key tunable constants live in `src/config.js`:
`WALL` (cellSize, distortionK, dragZoom, lerpFactor), `FADE`, `LAYOUT`
(title/tags bands), `CARD` (size 768 desktop / 512 mobile, cacheLimit),
`TILE_POOL`, `CATEGORIES`. Glow strength/fade are in `shaders.js`
(`uHover * 0.55`) and `gl/wall.js` (`uGrid` alpha, `HOVER_LERP`).

---

## 5. Data flow / the store seam

`src/store.js` is the single source of truth. It renders instantly from the
static `data.js`, then `load()` fetches `/api/students` and swaps in the live
dataset (filters rebuild, wall + list re-render). Adding the backend required
changing only this file. The API returns records already in the frontend shape:

```
{ id, name, year, regNo, department, type, category, duration, stipend, bio,
  tags: [], socials: { linkedin, website }, certificate, image, thumbnail }
```

`?seed=N` is a stress-test mode (replicates sample data to N tiles with distinct
image URLs; skips the API).

---

## 6. API reference

Public:
- `GET /api/health` → `{ ok: true }`
- `GET /api/students` → array of students
- `GET /api/students/:id/image` · `GET /api/students/:id/thumb` → image bytes

Admin (Bearer token from login):
- `POST /api/admin/login` `{ password }` → `{ token }`
- `POST /api/admin/students` (create) · `PUT /api/admin/students/:id` (update) ·
  `DELETE /api/admin/students/:id`
- `POST /api/admin/students/:id/image` (multipart `image`) → resize + store
- `POST /api/admin/students/:id/tags` `{ about? }` → `{ tags }`
- `POST /api/admin/import` (multipart `file`) → `{ imported, updated, total }`
  (idempotent for rows with a Reg No)

Auth: HMAC-signed token, 12h TTL. Invalid/expired → 401 (admin UI logs out).
`:id` must be a positive integer (else 404). Bad image → 400; oversized → 413.

---

## 7. Excel / CSV format

First sheet, one student per row. **Only `Name` is required.** Headers are
case-insensitive with aliases:

| Field | Accepted headers |
|---|---|
| Name | Name, Student Name, Full Name |
| Year | Year, Batch, Passing Year |
| Reg No | Reg No, Registration No, Roll No (used to dedup on re-import) |
| Department | Department, Dept, Branch |
| Type | Type |
| Category | Category (else derived from Type) |
| Duration | Duration, Period |
| Stipend | Stipend, Salary, Package |
| Bio | Bio, About, Description, Achievement (auto-tagged if Tags empty) |
| Tags | Tags, Skills (comma/semicolon separated) |
| LinkedIn / Website / Certificate | LinkedIn / Website, Portfolio / Certificate |

Photos are uploaded per-student in the admin after import.

---

## 8. Local development

```bash
npm install
cp .env.example .env          # DATABASE_URL stays empty -> PGlite

# API + DB (in-process PGlite, persisted to ./.data/pg):
npm run dev:server            # http://localhost:3000

# Frontend with hot reload (proxies /api to :3000):
npm run dev                   # http://localhost:5173

# Or production-style (one server serving the built site):
npm run build && npm start    # http://localhost:3000  and  /admin

npm run thumbs                # regenerate sample thumbnails after adding img*.jpeg
```

---

## 9. Deploy on Render

1. Push to GitHub → Render **New → Blueprint** (uses `render.yaml`): creates the
   web service + managed Postgres (auto-wires `DATABASE_URL`).
2. Set `ADMIN_PASSWORD` (and optional `N8N_TAGS_WEBHOOK_URL`) in the dashboard.
3. Deploy → first boot creates the schema and seeds the sample students.
   Open `/admin`.

Env vars: `PORT`, `DATABASE_URL`, `PGSSL` (set `false` if SSL is rejected),
`ADMIN_PASSWORD`, `TOKEN_SECRET` (generated by Render), `N8N_TAGS_WEBHOOK_URL`,
`PGLITE_DIR` (local only). Free Render Postgres expires ~90 days — upgrade for
permanence. See `DEPLOY.md` for the full guide.

### n8n tag webhook
Set `N8N_TAGS_WEBHOOK_URL` to a webhook that receives `POST { about }` and
returns `{ tags: ["AI","ML","DESIGN"] }`. If unset/failing, a local keyword
extractor is used.

---

## 10. Testing approach (how it was verified)

All verification was done headless in-sandbox (no manual clicking):
- **API suite** (PGlite): health, seeded data, auth (reject/accept), protected
  routes, CRUD, tag generation, image upload + webp thumbnail, Excel import.
- **Edge suite:** non-numeric id, malformed/oversized image, upload to missing
  student, duplicate import, year parsing, empty-name rows, delete-all.
- **Browser (Playwright/Chromium via swiftshader):** wall renders + calls the
  API with zero console errors; admin login loads rows; rendering screenshots
  for sharpness/glow.

To run browser tests in this sandbox, Chromium needs `nss`/`nspr` system libs
(extracted via `dnf repoquery --location` + `rpm2cpio` into a dir on
`LD_LIBRARY_PATH`). Test scripts are scratch (`_*.mjs`, gitignored).

---

## 11. PR / branch history

- **#1 (merged):** Refactor static prototype into modules; fix filters/search/
  profile; trim load (fonts/junk).
- **#2 (merged):** Virtualized, texture-streaming wall (scales to thousands) +
  thumbnail pipeline.
- **#3, #4 (merged):** Hover glow + visual fixes — superseded by #6.
- **#6 (open):** Sharpen wall (disable mipmaps, fisheye in vertex shader, crisp
  grid lines, flat darker in-cell hover glow). **Merge this.**
- **#7 (open):** Admin dashboard + Express/Postgres backend + Excel import +
  image upload + n8n tags + Render config + edge-case hardening. **Merge after #6.**

`main` currently has the merged virtualization but an earlier (blurry) renderer;
**#6 fixes that on `main`**, then **#7** adds the backend.

> The PR tool auto-appends a Kiro attribution footer to PR descriptions; delete
> it manually on GitHub if unwanted.

---

## 12. Known limitations (by design, not bugs)

- Excel rows **without** a Reg No can't dedup → re-import creates duplicates.
- Bulk import with n8n tagging is **sequential** (slow for thousands at once).
- A custom `Type` (e.g. "HACKATHON") becomes category `hackathon`, while the
  filter pill is `hackathons` (plural) — minor naming drift.
- Images are stored in Postgres (`bytea`) — fine at college scale; move to
  object storage (Cloudflare R2 / S3) for very large datasets.
- Auth is a single shared admin password (no per-user accounts).

---

## 13. Next steps / roadmap

- Build the **n8n workflow** itself (LLM picks 2–3 tags from the About text) to
  feed `N8N_TAGS_WEBHOOK_URL`.
- **Photo matching in Excel import** (e.g. a Reg-No-named photo zip → auto-attach).
- **Object storage** for images at scale; batch/async import with progress.
- Per-user admin accounts / audit log; reordering students; draft vs published.
- Liquid-glass UI components (kept in `liquid-glass/` for future use).
