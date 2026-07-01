# Wall of Fame — Q&A (How / What / Code)

Eight questions covering the architecture, rendering, data pipeline, and code of
this project. Use this to onboard, review, or interview-check the codebase.
Cross-references: [`PROJECT_OVERVIEW.md`](./PROJECT_OVERVIEW.md),
[`CONTEXT.md`](./CONTEXT.md), [`n8n/README.md`](./n8n/README.md).

---

### Q1. What is the Wall of Fame and what problem does it solve?

It's a college showcase of student achievements rendered as an **infinite,
discoverable WebGL wall** (photo + name + batch + 2–3 tags per tile), with a
click-through **profile** (bio, socials, certificate), a **list view**, and
**filters/search**. The problem it solves is data intake and scale: a teacher
uploads **one verified Excel sheet** (from a Google/Microsoft Form) and the site
auto-populates — including pulling photos from Drive/OneDrive links and using an
LLM to turn each student's raw "About" into a clean bio + tags. It's built to
keep working as ~20–25 students are added **every month**.

---

### Q2. How does the wall render thousands of photos without dying? (the core trick)

Two ideas working together — see `src/gl/wall.js`, `src/gl/textureCache.js`,
`src/gl/card.js`, `src/config.js`:

- **Virtualization:** only cells inside the viewport (plus a 1-cell margin) are
  drawn, using a **recycled pool** of ~120 quad meshes (`TILE_POOL`). As you pan,
  meshes are re-assigned to new cell IDs — the mesh count never grows with the
  number of students.
- **Texture streaming + LRU cache:** each visible student is composited into a
  single **card texture** (photo + name + year + tags) on demand and stored in an
  **LRU cache** (`CARD.cacheLimit` = 72 desktop / 56 mobile). When a card scrolls
  away and the cache is full, the least-recently-used texture is **disposed** to
  free GPU memory.

Net effect: GPU memory and network usage scale with the **viewport**, not with N.
Verified to 1,000+ tiles (peak ~108 live textures) via `?seed=N` stress mode.

---

### Q3. Why did the wall look blurry before, and how was it fixed?

Three separate causes, all addressed (PRs #5/#6/#9):

1. **Offscreen render target** — the barrel distortion was originally a
   full-screen post-process pass, which resampled the whole scene and softened
   everything. Fixed by rendering tiles **directly to screen** and moving the
   fisheye into the **vertex shader** (`src/shaders.js`), so geometry is distorted
   before rasterization — no resampling blur.
2. **Mipmaps on card textures** — Three.js generated mipmaps and sampled lower
   levels, blurring text/photos. Fixed by using `LinearFilter` with
   **`generateMipmaps = false`**.
3. **Soft grid lines & glow** — grid lines now use `fwidth`-based anti-aliasing in
   the fragment shader for crisp 1px edges, and the hover glow is a **flat,
   darkened, per-cell wash** (contained inside the cell box) rather than a soft
   circular halo.

> Note: the *sample* photos are intentionally motion-blurred stock art — that
> softness is the source content, not the renderer. Real photos render sharp.

---

### Q4. How does data flow from the database to the screen? (the store seam)

`src/store.js` is the **single source of truth**:

1. On load it normalizes the static `data.js` and paints immediately (instant
   first paint + offline fallback).
2. `store.load()` fetches `GET /api/students`; if it returns an array, it swaps
   `students`, rebuilds the `byId` map, recomputes filter options
   (`recomputeOptions()` derives departments/years from data), and notifies
   listeners so the wall + list re-render.
3. Views subscribe via `store.subscribe(fn)` (filtered-data changes) and
   `store.onData(fn)` (dataset swap). Filtering is centralized in `matches()`
   (category/department/year/search); search matches against
   `name + department + type + tags`.

Because everything reads from this one module, adding the whole backend only
required editing `store.js` — the renderer never knew.

---

### Q5. What's the admin + Excel import pipeline, and what format does the sheet need?

The admin (`admin.html` + `src/admin/`) is **Excel-first**: drag-drop an
`.xlsx`/`.csv`, download a template, and import all rows at once. Server side,
`server/excel.js` parses the first sheet (one student per row) with
**case-insensitive header aliases**:

| Field | Accepted headers |
|---|---|
| Name *(required)* | Name, Student Name, Full Name |
| Year | Year, Batch, Passing Year |
| Reg No | Reg No, Registration No, Roll No *(used to dedup on re-import)* |
| Department | Department, Dept, Branch |
| Type / Category | Type / Category (else derived from Type) |
| Duration / Stipend | Duration, Period / Stipend, Salary, Package |
| Bio | Bio, About, Description, Achievement |
| Tags | Tags, Skills (comma/semicolon separated) |
| LinkedIn / Website / Certificate | LinkedIn / Website, Portfolio / Certificate |

Import is **idempotent** for rows with a Reg No (upsert). Photos come from a
**Photo URL** column — Google Drive & OneDrive share links are normalized to
direct-download URLs, fetched, and resized. This requires the file be shared
"anyone with the link."

---

### Q6. What is the n8n workflow doing, and how do I set it up?

`n8n/enrich.workflow.json` is an **AI enrichment** webhook:
`Webhook (POST) → LLM → Format (Code) → Respond`.

- **Contract:** app sends `POST { "about": "<raw text>" }`; workflow returns
  `{ "bio": "I ...", "tags": ["AI","ML","DESIGN"] }`.
- The LLM (via **Groq** or **OpenRouter**, both OpenAI-compatible) rewrites the
  About into a **concise first-person bio (≤256 chars)** and picks **2–3 tags**.
  The system prompt + example + length limit live in the LLM node's JSON body.
- **Setup:** import the workflow → add a **Header Auth** credential
  (`Authorization: Bearer <key>`) → pick provider URL + model → activate → copy
  the production webhook URL → set `N8N_TAGS_WEBHOOK_URL` on Render.
- **Fallback:** if the webhook is unset or fails, the backend uses a local
  truncate-bio + keyword-tag extractor, so imports never break. n8n is **not**
  involved in photos.

---

### Q7. What does the backend API look like and how is it secured?

`server/index.js` (Express 5) serves the built site, the admin, and a JSON API;
`server/db.js` abstracts `pg` (prod) vs **PGlite** (local), runs the schema
migration, and seeds from `data.js`.

**Public:** `GET /api/health`, `GET /api/students`,
`GET /api/students/:id/image`, `GET /api/students/:id/thumb`.

**Admin (Bearer token):** `POST /api/admin/login` → token; CRUD on
`/api/admin/students[/:id]`; `POST /api/admin/students/:id/image` (multipart,
sharp resize → full+thumb WebP); `POST /api/admin/students/:id/tags`;
`POST /api/admin/enrich`; `POST /api/admin/import` (multipart Excel/CSV).

**Security:** `server/auth.js` issues an **HMAC-signed token** (12h TTL) from a
shared `ADMIN_PASSWORD`; invalid/expired → 401 (admin UI logs out). `:id` must be
a positive integer (else 404); bad image → 400; oversized → 413.

---

### Q8. How is the whole thing configured, deployed, and kept scalable?

- **Config:** `src/config.js` centralizes every renderer tunable (`WALL`, `FADE`,
  `LAYOUT`, `CARD`, `TILE_POOL`, `CATEGORIES`) so the shader code and the JS
  interaction code can't drift apart. `vite.config.js` builds two pages (wall +
  admin) and proxies `/api` in dev.
- **Deploy:** `render.yaml` is a Render **Blueprint** — one web service + managed
  Postgres, auto-wiring `DATABASE_URL`. First boot migrates + seeds. Env vars:
  `ADMIN_PASSWORD`, `TOKEN_SECRET`, optional `N8N_TAGS_WEBHOOK_URL`, `PGSSL`.
- **Scalability posture:** viewport-bounded rendering (Q2) handles the front end;
  the mobile path drops `CARD.size` to 512 and shrinks the cache. Current known
  ceiling is **image storage in Postgres** (`bytea`) — fine at college scale, but
  the planned upgrade is object storage (Cloudflare R2 / S3) + async batch import
  with progress for very large datasets.
