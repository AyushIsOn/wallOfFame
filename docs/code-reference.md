# Code reference

A file-by-file guide to the codebase: what each file does, its main functions,
and what to watch out for when editing it. For how the pieces fit together, read
[architecture.md](architecture.md) first. The code is the source of truth; if
this page disagrees with it, fix this page.

- [Repository layout](#repository-layout)
- [Frontend core](#frontend-core): `config.js`, `store.js`, `main.js`, `shaders.js`
- [The wall renderer](#the-wall-renderer): `gl/wall.js`, `gl/card.js`, `gl/textureCache.js`
- [UI modules](#ui-modules): `ui/*.js`
- [Admin](#admin): `admin/admin.js`, `admin/admin.css`
- [Server](#server): `server/*.js`
- [Pages, data and tooling](#pages-data-and-tooling)
- [Invariants](#invariants): things that must stay true

---

## Repository layout

```text
wallOfFame/
├── index.html              Wall page (markup the JS fills in)
├── admin.html              Admin dashboard page
├── styles.css              All wall, list and profile styles
├── data.js                 25 sample students (seed, dev fallback, stress test)
├── vite.config.js          Two-page build; /api proxy for dev
├── render.yaml             Render blueprint (one web service)
├── package.json            Scripts and dependencies (Node >= 20.12)
├── .env.example            Every environment variable, commented
├── src/
│   ├── config.js           Shared tunables (wall geometry, layout, cache sizes)
│   ├── store.js            Single source of truth: data + filters
│   ├── main.js             Wall page entry: wires store → views
│   ├── shaders.js          GLSL vertex (fisheye) + fragment (glow, grid, fade)
│   ├── gl/
│   │   ├── wall.js         Virtualised WebGL wall + input handling
│   │   ├── card.js         Draws one student card on a canvas
│   │   └── textureCache.js LRU cache of card textures
│   ├── ui/
│   │   ├── filters.js      Filter panel
│   │   ├── search.js       Header search
│   │   ├── listView.js     Year-grouped list
│   │   ├── viewToggle.js   Wall ↔ list switch
│   │   ├── profileOverlay.js  Profile dialog
│   │   └── getFeatured.js  Header "GET FEATURED" link
│   └── admin/
│       ├── admin.js        Admin dashboard logic
│       └── admin.css       Admin dashboard styles
├── server/
│   ├── env.js              Loads .env (imported first)
│   ├── index.js            Express app: headers, routes, import, static, startup
│   ├── auth.js             Password login, tokens, rate limit
│   ├── db.js               pg or PGlite; migrate; seed
│   ├── students.js         Queries + row ↔ object mapping
│   ├── excel.js            Spreadsheet → student records
│   ├── images.js           Photo download + resize
│   └── tags.js             AI enrichment (n8n) + local fallback
├── public/                 Copied as-is into dist/ by the build
│   ├── fonts/              6 woff2 files (IBM Plex Mono ×3, At Hauss Mono, Klim, Rokkitt)
│   ├── images/back.svg     Profile close icon
│   ├── img1…25.jpeg        Sample photos
│   └── thumbs/img1…25.webp Sample thumbnails (npm run thumbs)
├── scripts/thumbs.mjs      Regenerates public/thumbs
├── n8n/                    AI enrichment workflow + setup guide
├── docs/                   This documentation
├── liquid-glass/           Standalone UI experiment (not used)
└── phantom-land/           Saved copy of the design reference site (not used)
```

---

## Frontend core

### `src/config.js`

Constants shared by the shaders, the renderer and the click math, so they can't
disagree. Every value is documented in
[configuration.md](configuration.md#wall-tunables-srcconfigjs).

Exports: `WALL`, `COLORS`, `FADE`, `LAYOUT`, `CARD`, `TILE_POOL`, `CATEGORIES`,
`CANVAS_FONT`. `CARD` picks smaller sizes when the window's shorter side is
under 768 px. That is measured once at import, so rotating a phone doesn't change it.

### `src/store.js`

The single source of truth for student data and filter state. Every view
renders from it; nothing else fetches students.

| Part | What it does |
|---|---|
| `normalizeStatic(raw, i)` | `data.js` shape → student object (`title` → `name`, thumbnail path derived from the image, category = `(category ‖ type ‖ "others")` lowercased, the same rule as the server's seed) |
| `normalizeApi(s)` | Guards `tags` (array) and `socials` (object) on API records |
| `stressStudents()` | `?seed=N`: clones the samples to N with unique ids and `?v=` image URLs |
| `status` | `loading` → `ready` / `sample` / `error` ([meaning](architecture.md#store-states)) |
| `recomputeOptions()` | Rebuilds the category (ordered by `CATEGORIES`), department (sorted) and year (newest first) filter options from the data |
| `matches(s)` | Filter test: category, department, year, and a case-insensitive search over name + department + type + tags. Bio and Reg No are not searched. |
| `load()` | `GET /api/students` → `ready`; on failure, the dev build uses the samples (`sample`) and the production build empties the list (`error`). Then notifies `onData` listeners (filters rebuild) and `subscribe` listeners (views re-render). |

Public API, the `store` object:

| Member | Purpose |
|---|---|
| `students`, `status`, `options` | Current data, load state, filter options |
| `byId(id)` | Lookup that accepts numbers or strings (DOM `data-id` is a string) |
| `getState()` | Copy of the filter state |
| `getFiltered()` | Students passing the current filters |
| `setFilter(type, value)`, `setSearch(text)`, `reset()` | Change filters, then notify |
| `subscribe(fn)` | `fn(filtered)` on every filter or data change. Returns an unsubscribe function. |
| `onData(fn)` | `fn()` when the dataset is replaced. Returns an unsubscribe function. |
| `load()` | Fetch the data |

### `src/main.js`

Wall page entry. `start()`:

1. calls `store.load()` immediately, so the request overlaps font loading and
   WebGL setup;
2. creates the profile overlay, then the `Wall` (`await wall.init()`);
3. with `?seed=` or `?debug=`, exposes `window.__wall`;
4. initialises the list view, view toggle, filters, search and GET FEATURED;
5. `apply(filtered)`: hands the filtered list to the wall and the list view and
   toggles the empty-state message (`EMPTY_MESSAGES`). The message is hidden
   while loading and says "Couldn't load…" on error.
6. subscribes `apply` to the store and runs it once.

### `src/shaders.js`

Two GLSL strings used by every tile's `ShaderMaterial`. `f(n)` formats numbers
as GLSL floats, so config values are baked into the source.

- **`tileVertexShader`:** world → normalised screen position `u` using
  `uOffset`/`uZoom`/`uAspect`, then the barrel warp `s = u·(1 + K·|u|²)`.
  Writes clip space directly, and passes `vScreen` for the fade.
- **`tileFragmentShader`:** `mix(uAvg·uHover·0.55, card.rgb, card.a)` (glow behind
  transparent card areas), grid lines from `fwidth(vUv)`, radial fade
  `1 − smoothstep(FADE.start, FADE.end, |vScreen|)`.

---

## The wall renderer

### `src/gl/wall.js`, `class Wall`

| Member | What it does |
|---|---|
| `UI_SELECTOR` | Overlays where pointer/touch input must not pan the wall (and touches aren't `preventDefault`-ed) |
| `strideFor(n)` | `WALL.rowStride` (3) below `wideStrideFrom` (64) students; otherwise `wideRowStride` (17) bumped until it shares no factor with n |
| `cellIndex(cx, cy, stride, n)` | `(cx + cy·stride) mod n`, made non-negative. **The only cell → student mapping**, used for drawing and hit-testing. |
| `init()` | Waits for fonts (`CANVAS_FONT`), creates the renderer (pixel ratio ≤ 2.5), a plain `THREE.Camera`, one shared 12×12-subdivided plane, the shared uniforms, the `CardCache`, the mesh pool; attaches events; starts `animate()` |
| `growPool(n)` | Adds meshes, each with its own `ShaderMaterial` (`tMap`, `uAvg`, `uHover`) sharing the pan/zoom/aspect/grid uniform objects |
| `setActiveStudents(list)` | Sets the students to show and recomputes the stride; hides the canvas when the list is empty |
| `updateVisibleTiles()` | Per frame: visible cell range (+ `cellMargin`), assigns pool meshes, fetches textures from the cache, eases each tile's hover value, hides unused meshes, evicts stale textures |
| `cellCoordsAt(x, y)` | Screen pixels → cell, using the first-order inverse warp `d = 1 − K·r²` |
| `indexAt(x, y)` | Student index under a point (`cellCoordsAt` + `cellIndex`) |
| `attachEvents()` | Left-button mouse and touch dragging (pan, drag-zoom after 150 ms, click if < 200 ms and < 2 px), hover tracking on the canvas, `contextmenu` suppressed on the gallery only, window resize |
| `resize()` | Updates renderer size and aspect; skipped while the gallery is hidden |
| `animate()` | rAF loop: eases offset/zoom by `lerpFactor`; returns early while the gallery has zero size (list view); clears if no students; otherwise updates tiles and renders |

**Watch out:** the shader warp and `cellCoordsAt()` must change together, and so
must drawing and `indexAt()`. Both use `config.js` and `cellIndex()` for that.

### `src/gl/card.js`

Draws one card on a `size × size` canvas with a transparent background.

| Function | What it does |
|---|---|
| `loadImage(url)` | Promise for an `Image` with `crossOrigin = "anonymous"`, so remote images can become textures |
| `cardImageUrl(s)` | `thumbnail ‖ image` |
| `averageColor(img)` | Dominant colour for the hover glow: 16×16 average of opaque pixels, saturation ×1.45, brightened toward max channel 205 (≤ 2.4×). Returns `[r, g, b]` in 0–1. |
| `initials(name)` | Up to two initials, `"?"` if none. Also used by the profile. |
| `PLACEHOLDER_GLOW` | Hover colour for cards without a photo |
| `drawCard(s, img, size)` | Photo square (`LAYOUT.imageSize`, cover-cropped), or `drawPhotoPlaceholder()` when `img` is `null`; then `drawTitle()` (name left in white, year right in `COLORS.text`) and `drawTags()` (department right; up to 4 tag pills left, stopping before they would overlap the department) |

### `src/gl/textureCache.js`, `class CardCache`

Bounded GPU memory for any number of students.

| Member | What it does |
|---|---|
| `makeTexture(canvas)` | `CanvasTexture`, sRGB, `LinearFilter`, **no mipmaps** (mipmaps caused the old blur) |
| `placeholder` | Transparent texture shown while a card loads |
| `get(student)` | Returns `{ texture, avg }` now, never waits. On a miss it starts `load()`. If the cached entry holds a different object for the same id (dataset replaced), it is discarded and rebuilt; otherwise a tile could show one student while a click opens another. Stamps the entry with the current frame. |
| `load(student, entry)` | Tries the thumbnail, then the full image. On success: dominant colour + card. If there's no photo or every source fails: an initials card with `PLACEHOLDER_GLOW` (`status` `no-photo` or `error`). |
| `evict()` | Over `limit`, disposes the least recently used entries **not** used this frame |
| `liveTextureCount` | Diagnostics (stress test) |

---

## UI modules

Each module exports one `init…()` called once by `main.js`.

### `src/ui/filters.js`

Renders the three pill groups from `store.options` (values and labels
HTML-escaped) and rebuilds them on `store.onData`. A click sets the filter. The
panel opens from `#filterToggle` and closes on Esc or an outside click. The
toggle gets the `has-filters` class while any filter or search is active.
`mousedown` on the panel doesn't reach the wall.

### `src/ui/search.js`

`#searchBtn` toggles the search box. Typing updates `store.setSearch()` after
120 ms. **Closing (× or Esc) clears the query**, so a hidden search can never
keep filtering.

### `src/ui/listView.js`

`render(students)` groups by year (newest first, no year last as "—") and
builds rows: name, an outlined type pill plus up to 3 tag pills, department. All
values are escaped with `escapeHtml()`. The empty states say "Loading
students…", "Couldn't load…" or "No students match these filters." depending on
`store.status`. Row clicks resolve the student with `store.byId()` and open the
profile.

### `src/ui/viewToggle.js`

`switchView("wall" | "list")` shows one view and hides the other with a fade.
It adds the `list-open` body class (darker header blur behind scrolling list
text). Returning to the wall fires a `resize` event so the canvas re-measures.

### `src/ui/profileOverlay.js`

The profile dialog (`role="dialog"`, `aria-modal`). `open(student, list)` fills
it, moves focus to the close button, and remembers where focus was; `close()`
restores it. **Go to next person** steps through `list` (the filtered set) and
wraps around.

| Helper | What it does |
|---|---|
| `setStackedName(el, name)` | Title-cased name, one word per line, built from text nodes (never `innerHTML`) |
| `safeUrl(url)` | Only `http:`, `https:` and `mailto:` pass; everything else becomes `""` |
| `roleLine(s)` | "TYPE at FIRST TAG", or whichever half exists |
| `formatStipend(v)` | Digits only → `₹2,50,000` (Indian grouping); other text unchanged |
| `showPhoto(s)` | Full photo, or initials (`.no-photo`, `data-initials`) when missing or broken |
| `setLink(id, url)` | Shows a social link only if it has a safe URL; hides the Socials block when both are missing |

The certificate link stays visible without a URL (`is-disabled`, not
clickable), by design.

### `src/ui/getFeatured.js`

Turns the header's GET FEATURED text into a link to `VITE_GET_FEATURED_URL`
(`https:`/`mailto:`) when it is set at build time.

---

## Admin

### `src/admin/admin.js`

Plain DOM code against the same-origin API, with the token in `localStorage`
(`wof_token`).

| Part | What it does |
|---|---|
| `api(path, opts)` | `fetch` wrapper: adds `Authorization`, JSON-encodes bodies (or sends `FormData`), throws the server's `error` message. A `401` from anything but login signs out with "Session expired — sign in again." |
| `logout(message)` | Clears the token, closes the edit modal, shows the sign-in screen with the message |
| `tokenExpired(t)` | Reads `exp` from the token payload, so an expired session shows the sign-in screen on load |
| `renderRows()` | Students table filtered by the search box (name, department, type, tags); every value escaped. Broken thumbnails are hidden by a capturing `error` listener (the CSP forbids inline `onerror`). |
| `removeStudent(id)` | Confirm, delete, reload, report errors in the status line |
| `openModal(s)` / `formData()` / `persist()` | Fill the form; read it (uppercases department, type, tags; empty socials → `"#"`); create (`POST`) or update (`PUT`) |
| **Generate** | `POST /api/admin/enrich` with the About text and fills the Tags field. Saves nothing. |
| **Save** | `persist()`, then uploads the chosen photo (`pendingPhoto`) if any |
| `handleImport(file)` | `POST /api/admin/import`, reloads the table, reports counts and names the first three failed photos (all of them in the console) |
| `TEMPLATE` | The CSV offered by **Download the template** |

### `src/admin/admin.css`

Styles only (dark, phantom-inspired: login, hero, action cards, table, modal).

---

## Server

### `server/env.js`

Loads `./.env` with Node's built-in `process.loadEnvFile` if the file exists.
Real environment variables win. Must stay the **first import** in `index.js`,
because `auth.js` reads `process.env` when it is imported.

### `server/index.js`

| Section | What it does |
|---|---|
| Setup | `x-powered-by` off; `trust proxy` = `TRUST_PROXY` ?? (1 on Render, else 0); security headers (CSP for everything; plus `frame-ancestors 'none'` and `X-Frame-Options: DENY` for `/admin` and `/api/admin/*`); JSON bodies up to 2 MB; multer memory storage, 15 MB |
| `app.param("id")` | Non-digit `:id` → `404` |
| `wrap(fn)` | Forwards async errors to the error handler |
| Public routes | `/api/health`, `/api/students`, photo blobs via `sendBlob()` (immutable cache with `?v=`, 5 minutes without) |
| Admin routes | Login (rate-limited), student CRUD, photo upload, tag regeneration, stateless enrich, import ([api.md](api.md)) |
| `nonBlankFields(rec, existing)` | For re-imports: keeps only cells with values; merges socials with the existing ones |
| Import handler | Parse → per row: find by Reg No → enrich only if the About changed (`about_source`) → create or update → download the photo only if the URL changed (`photo_source`) |
| `/api` fallback | JSON `404` for unknown API routes |
| Static | `dist/` (hashed `/assets` cached for a year), then `public/` as a fallback; `/` and `/admin` send the HTML, or a "not built yet" message (`503`) |
| Error handler | Multer limits → `413`/`400`; bad JSON → `400`; other 4xx kept; anything else logged and answered `500 Server error` |
| Startup | `initDb()` then `listen`; `SIGTERM`/`SIGINT` → close the server, then the database (forced exit after 10 s); a failed start logs the reason and exits 1 |

### `server/auth.js`

| Part | What it does |
|---|---|
| `IS_PROD` | `DATABASE_URL` set, `NODE_ENV=production`, or `RENDER` set |
| `SECRET` / `ADMIN_PASSWORD` | From env. Locally they fall back to dev values; in production a missing password disables login and a missing secret becomes random (both logged). |
| `sign` / `verify` | `base64url(JSON).base64url(HMAC-SHA256)`; constant-time signature check; `exp` check |
| `passwordMatches` | SHA-256 both sides, then `timingSafeEqual` |
| `login(password)` | 12-hour token, or `null` |
| `loginRateLimit`, `recordLoginFailure`, `clearLoginFailures` | In-memory per-IP counter: 10 failures per 15 minutes → `429` with `Retry-After` |
| `requireAuth` | Middleware: valid `Bearer` token or `401` |

### `server/db.js`

| Part | What it does |
|---|---|
| `initDb()` | `pg.Pool` when `DATABASE_URL` is set (SSL unless `PGSSL=false` or localhost; an `error` listener so idle-connection errors don't crash the process). Otherwise PGlite in `PGLITE_DIR`, with a clear message if it isn't installed. Then `migrate()` and, unless `SEED_SAMPLE_DATA=false`, `seedIfEmpty()`. |
| `query(text, params)` | The one query function; same SQL on both engines |
| `closeDb()` | Ends the pool / closes PGlite (shutdown) |
| `migrate()` | `CREATE TABLE IF NOT EXISTS students …` plus idempotent `ADD COLUMN IF NOT EXISTS` lines (`about_source`, `photo_source`). Add new columns here. |
| `seedIfEmpty()` | Inserts `data.js` when the table is empty; static photo paths go in `image_url`/`thumb_url` |

### `server/students.js`

| Function | What it does |
|---|---|
| `LIST_COLS` | Selected columns: never the photo bytes; `has_image`/`has_thumb` booleans and `updated_at` instead |
| `mapRow(r)` | Row → student object; photo URL resolution and `?v=` versioning ([details](data-model.md#reading-row--object)) |
| `listStudents()`, `getStudent(id)`, `getByRegNo(regNo)` | Reads |
| `getImportState(id)` | `{ aboutSource, photoSource }` for re-import decisions |
| `buildColumns(data)` | Partial object → columns/placeholders/values, with coercions ([details](data-model.md#writing-object--row)) |
| `createStudent`, `updateStudent`, `deleteStudent` | Writes; update bumps `updated_at` |
| `getImageBlob(id, which)` | Photo or thumbnail bytes + type |
| `setImageBlob(id, full, thumb, { photoSource })` | Stores both WebPs, clears `image_url`/`thumb_url`, records `photo_source` for imports |

### `server/excel.js`

| Part | What it does |
|---|---|
| `ALIASES` | Accepted headers per field ([table](data-model.md#headers)) |
| `URL_FIELD_KEYWORDS` | Keyword fallback for photo/LinkedIn/certificate/website columns with question-style headers |
| `norm(h)` | Lowercase, punctuation → spaces |
| `parseYear(raw)` | Year/batch cell → year (ranges → last year) ([rules](data-model.md#year-values)) |
| `directImageUrl(url)` | Google Drive / OneDrive share links → direct downloads |
| `rowToStudent(row)` | One sheet row → record (uppercases department/type, lowercases category, splits tags, max 4) |
| `parseWorkbook(buf)` | First sheet → records with a name |

### `server/images.js`

- `fetchRemoteImage(url)`: `http(s)` only, follows redirects, 20 s timeout,
  20 MB cap (declared and actual), rejects `text/html` with a readable message.
- `processImage(buf)`: EXIF-rotate, then a full WebP (fits 1200 × 1200, quality
  82) and a 512 × 512 cover thumbnail (quality 78). Metadata is dropped.

### `server/tags.js`

- `enrichAbout(about)` → `{ bio, tags }`. With `N8N_TAGS_WEBHOOK_URL`: POST
  `{ about }`, 20 s timeout, bio capped at 256, up to 3 tags uppercased. Any
  missing piece, error or timeout falls back to `localBio()` (trim to 256 at a
  word boundary) and `localTags()` (multi-capital words, then whole-word
  `KEYWORDS`, max 3).
- `generateTags(about)`: tags only (used by `/students/:id/tags`).

---

## Pages, data and tooling

| File | Notes |
|---|---|
| `index.html` | Static markup with the IDs the JS relies on: `#gallery`, `#emptyState`, `#searchBtn`, `#searchInput`, `#filterToggle`, `.filters-container` (with `[data-type]` pill containers), `.view-toggle`, `#listViewContainer`, `#profileOverlay` and its `#profile*` fields, `#getFeatured`. Preloads 3 fonts; inline SVG favicon; meta description. |
| `admin.html` | Sign-in (`#loginForm`), app (`#dropzone`, `#templateBtn`, `#addBtn`, `#rows`, `#search`, `#status`) and the edit modal (`#f_*` fields, `#photoFile`, `#genTags`, `#saveBtn`, `#deleteBtn`). `noindex`. |
| `styles.css` | Wall page styles: header, search, view toggle, filters, list view, profile, empty state |
| `data.js` | `export const projects = [...]`: 25 samples (`title`, `image`, `year`, `regNo`, `department`, `type`, `duration`, `stipend`, `bio`, `socials`, `tags`) |
| `vite.config.js` | Dev server on 5173 (opens the browser), `/api` → `localhost:3000`; build inputs `index.html` and `admin.html`. `vite preview` inherits the proxy. |
| `render.yaml` | One Node web service: `npm ci && npm run build`, `node server/index.js`, health `/api/health`, env vars |
| `scripts/thumbs.mjs` | `npm run thumbs`: every `public/img*.jpe?g` → `public/thumbs/*.webp` (512 px, q78) |
| `n8n/enrich.workflow.json` | Webhook → LLM (HTTP request to Groq/OpenRouter) → Code node (parse `{bio, tags}`) → respond |

---

## Invariants

Rules that keep the app correct. Break one and something subtle fails.

1. **Draw and hit-test with the same math.** The vertex warp ↔
   `cellCoordsAt()`, and drawing ↔ `indexAt()`, via `config.js` and
   `cellIndex()`. A click must open the student drawn under it.
2. **Never put data into HTML unescaped.** Use `escapeHtml()`, `textContent` or
   DOM nodes; pass links through `safeUrl()`. The CSP is the backstop, not the
   fix.
3. **No inline scripts or event handlers** in HTML or templates; the CSP blocks them.
4. **Keep card textures mipmap-free** (`LinearFilter`, `generateMipmaps = false`).
5. **Views render from the store only.** Don't fetch or cache students elsewhere.
6. **Schema changes must be additive and idempotent** (`IF NOT EXISTS`); they
   run on every boot.
7. **`server/env.js` stays the first import** of `server/index.js`.
8. **Listing never selects photo bytes.**
9. **Re-imports must not destroy admin work:** blank cells and unchanged
   About/Photo URL keep current values.
