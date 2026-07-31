# Wall of Fame — Engineering Handover

> A complete, file-by-file, line-by-line reference for the entire codebase.
> Written so a new engineer can pick up the project with zero prior context.
> If you only read one doc, read this one. For a lighter overview see
> `PROJECT_OVERVIEW.md`; for deploy steps see `DEPLOY.md`.

---

## 0. What this project is

**Wall of Fame** is a digital showcase built for **Manipal University Jaipur**
that makes student achievements discoverable so students get noticed. The
landing page is an **infinite, draggable WebGL wall** of achievement tiles
(photo · name · year · tags). You can also switch to a **year-grouped list
view**, **filter** (category / department / year), **search**, and click any
tile to open a **profile card** (bio, metadata, socials, certificate).

Students are managed from a separate **admin dashboard**: a teacher uploads one
**Excel/CSV** sheet (or adds students by hand / uploads photos), and the system
resizes photos and uses **AI enrichment** (an n8n + LLM workflow) to turn each
raw "About" paragraph into a concise bio + 2–3 tags.

It ships as **one deployable service**: a Node/Express server that serves the
built frontend, the admin page, and the JSON API. Data lives in **PostgreSQL**
in production and **PGlite** (in-process Postgres) locally, so local dev needs
zero database setup.

---

## 1. Tech stack at a glance

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Vanilla JS + **Vite** + **Three.js** | No framework; the wall is a custom WebGL renderer |
| Backend | **Node + Express 5** | One service serves wall + admin + API |
| Database | **PostgreSQL** (prod) / **PGlite** (local) | Same SQL both places |
| Images | **sharp** | Server-side resize → full + thumbnail WebP, stored as `bytea` |
| Import | **xlsx** (SheetJS) | Parse Excel/CSV, flexible header aliases |
| AI enrichment | **n8n** + LLM (Groq/OpenRouter/OpenAI) | Rewrites About → bio + tags; local fallback if unset |
| Hosting | **Render** (Web Service + managed Postgres) | `render.yaml` blueprint |

---

## 2. Directory map

```
wallOfFame/
├── index.html            # Wall page (the public site)
├── admin.html            # Admin dashboard page
├── data.js               # Static sample dataset (first paint + DB seed)
├── styles.css            # All wall/list/profile styling (large)
├── vite.config.js        # Build config (two HTML entry points, dev proxy)
├── package.json          # Scripts + dependencies
├── render.yaml           # Render deploy blueprint
├── public/               # Static assets served at site root
│   ├── fonts/            # woff2 fonts (IBM Plex Mono, At Hauss Mono, Klim, Rokkitt)
│   ├── images/           # UI icons (e.g. back.svg)
│   ├── img*.jpeg         # Sample student photos
│   └── thumbs/           # Generated square webp thumbnails
├── scripts/
│   └── thumbs.mjs        # Regenerate thumbnails from public/img*.jpeg
├── src/                  # Frontend source (built by Vite)
│   ├── config.js         # Shared tunables (wall, layout, colors, categories)
│   ├── store.js          # Single source of truth (data + filters)
│   ├── shaders.js        # GLSL vertex + fragment shaders for tiles
│   ├── main.js           # Wall entry point (wires everything together)
│   ├── gl/
│   │   ├── wall.js       # The virtualized WebGL wall renderer
│   │   ├── card.js       # Draws one student "card" onto a canvas
│   │   └── textureCache.js  # LRU cache of card textures (GPU streaming)
│   ├── ui/
│   │   ├── filters.js    # Filter panel (category/department/year pills)
│   │   ├── search.js     # Header search input
│   │   ├── listView.js   # Year-grouped list view
│   │   ├── viewToggle.js # Wall ↔ list toggle
│   │   └── profileOverlay.js # The profile modal
│   └── admin/
│       ├── admin.js      # Admin dashboard logic
│       └── admin.css     # Admin dashboard styling
└── server/               # Backend (Node/Express)
    ├── index.js          # Express app: routes + static serving + startup
    ├── db.js             # DB init/migrate/seed; pg vs PGlite
    ├── students.js       # Student queries + row↔object mapping
    ├── auth.js           # Admin login + token verification
    ├── images.js         # sharp resize + remote image fetch
    ├── excel.js          # Excel/CSV parsing with header aliases
    └── tags.js           # AI enrichment (n8n) + local fallback
```

---

## 3. The big picture (how a request flows)

**Public wall load:**
1. Browser loads `index.html` → `src/main.js`.
2. `store.js` immediately provides the **static** `data.js` students (instant first paint, works offline).
3. `main.js` builds the `Wall` (WebGL), list view, filters, search, profile overlay, and subscribes them to the store.
4. `store.load()` fetches `GET /api/students` and **swaps in** the live DB data; every view re-renders.
5. The wall draws only the tiles currently in view, streaming each student's card as a GPU texture.

**Admin flow:**
1. Teacher opens `/admin` → logs in (`POST /api/admin/login`) → gets a bearer token stored in `localStorage`.
2. Uploads an Excel sheet (`POST /api/admin/import`): server parses rows → enriches each About via n8n → upserts students → fetches/resizes any photo URLs.
3. Or edits/adds a single student, uploads a photo, or generates tags — all via the protected `/api/admin/*` routes.

**The key architectural idea:** `store.js` is the **single source of truth**.
Every view renders from `store.subscribe()`. Adding the entire backend only
required changing `store.js` (paint static first, then swap in API data).

---


# PART A — FRONTEND CORE

## `src/config.js` — shared tunables

Central constants imported by **both** the renderer and the interaction code, so
the two can never disagree about cell size, distortion, layout, etc.

- **`WALL` object** — geometry/interaction tunables for the wall:
  - `cellSize: 0.75` — world-space size of one square tile (in the clip-space units the shader works in).
  - `dragZoom: 1.25` — the zoom level the wall animates to *while* you drag (zooms out slightly for context).
  - `lerpFactor: 0.075` — smoothing factor for pan/zoom; each frame the current value moves 7.5% toward the target (inertia/easing).
  - `distortionK: 0.08` — strength of the barrel/fisheye warp. Used in **both** the shader (forward warp) and the click math (inverse warp).
  - `rowStride: 3.0` — how the infinite grid maps a cell to a student: `index = cellX + cellY * rowStride`. Controls the diagonal repeat pattern.
  - `cellMargin: 1` — draw one extra ring of cells beyond the viewport so tiles don't pop in at the edges.
- **`COLORS` object** — shared color tokens:
  - `border` — grid/border tint (unused directly here but semantic).
  - `background` — solid black.
  - `text: "rgba(160,160,160,1)"` — the **muted gray** used for the tile's year + department labels. (This was lightened from 128→160 so the labels stay readable over the hover glow while staying subtle.)
- **`FADE = { start: 1.2, end: 1.8 }`** — radial edge fade in normalized screen radius; tiles fade out between these radii so the wall dissolves at the edges instead of hard-cropping.
- **`LAYOUT` object** — where text/photo sit *inside* a cell, in cell-local UV (y=0 bottom, y=1 top). Deliberately symmetric so the four corners balance:
  - `imageSize: 0.6` — the centered photo square is 60% of the cell.
  - `titleY: 0.87`, `titleHeight: 0.07`, `titleXInset: 0.06` — the top band (name top-left, year top-right).
  - `tagsY: 0.06`, `tagsHeight: 0.07`, `tagsXInset: 0.06` — the bottom band (tag pills bottom-left, department bottom-right).
- **`isSmallScreen`** — `true` when the smaller viewport dimension is `< 768px`. Guarded by `typeof window !== "undefined"` so the module is safe to import in Node (the server imports nothing from here, but it keeps the module SSR-safe). Computed **once** at import.
- **`CARD` object** — card-texture resolution + cache size, scaled down on mobile to save memory:
  - `size: 512 (mobile) / 768 (desktop)` — pixel resolution each card texture is rasterised at. Higher = sharper when a tile is large.
  - `cacheLimit: 56 (mobile) / 72 (desktop)` — max number of card textures kept in GPU memory at once (LRU).
- **`TILE_POOL = 120`** — initial number of reusable tile meshes. Only this many quads are ever drawn regardless of how many students exist (it auto-grows if a viewport ever needs more).
- **`CATEGORIES` array** — the fixed category vocabulary the college plans to use (internship, hackathons, research, …). NOTE: department + year filter pills are derived from live data, but category pills come from this fixed list — so a category with no matching students shows an empty result.
- **`CANVAS_FONT = "At Hauss Mono"`** — the monospace font used to rasterise tile text; it's loaded before any card is drawn (see `wall.init()`).

---

## `src/store.js` — the single source of truth

Holds the student list + filter state, and notifies subscribers on change. Paints
from static `data.js` first, then swaps in `/api/students`.

**Imports & helpers:**
- `import { projects } from "../data.js"` — the static sample dataset.
- `import { CATEGORIES } from "./config.js"` — the fixed category list for filter options.
- `TYPE_TO_CATEGORY = { RESEARCH: "research", INTERNSHIP: "internship" }` — maps a student's `type` to a filter `category` for the static data.
- `toThumb(url)` — derives a thumbnail path from an image path: strips the directory and extension, returns `/thumbs/<base>.webp`. Returns `null` if no url. (Used only for static data whose photos live in `public/`.)

**Normalizers (turn raw records into the canonical frontend shape):**
- `normalizeStatic(raw, i)` — converts a `data.js` entry into the app's student object. Assigns `id: i` (the array index), maps `title→name`, derives `thumbnail` (explicit or via `toThumb`), sets `category` via the map (default `"others"`), and guards `tags`/`socials`/`certificate` with safe defaults.
- `normalizeApi(s)` — API records already arrive close to final shape; this just spreads them and guards `tags` (must be an array) and `socials` (must be an object).

**Initial state:**
- `let students = projects.map(normalizeStatic)` — start with the static dataset.
- `options = { categories: CATEGORIES, departments: [], years: [] }` — the filter dropdown options; departments/years are filled from data.
- `seed` / `stressMode` — reads a `?seed=N` URL param. If present and `> 0`, the app enters **stress-test mode**.
- The `if (stressMode && seed > students.length)` block **clones** the sample data up to `N` synthetic students (unique ids, `#i` appended to the name, cache-busting `?v=i` on image URLs). This is used to prove the wall scales to thousands of tiles without a backend.
- `let byId = new Map(...)` — an id → student lookup used by the list view and profile.

**`recomputeOptions()`** — rebuilds `options.departments` (unique, sorted) and `options.years` (unique, sorted descending) from the current `students`. Called on init and every time data reloads.

**Filter state + matching:**
- `state = { category, department, year, search }` — the active filters (all start `"all"` / empty).
- `listeners` / `dataListeners` — two `Set`s of callbacks: `listeners` fire on any filter/data change (views re-render); `dataListeners` fire only when the dataset itself reloads (filters rebuild their pills).
- `matches(s)` — returns whether a student passes the current filters: category equality, department equality, year equality (string-compared), and a substring search over `name + department + type + tags`. (Note: bio and regNo are **not** in the search haystack.)
- `getFiltered()` — `students.filter(matches)`.
- `notify()` — computes the filtered list once and calls every `listener` with it.

**`load()`** — the static→API swap:
- Returns early in stress mode (keeps synthetic data).
- `fetch("/api/students")`; on a non-OK response, silently returns (keeps the static fallback).
- On success: replaces `students` with `data.map(normalizeApi)`, rebuilds `byId`, recomputes options, fires `dataListeners` (filters rebuild) then `notify()` (views re-render).
- Wrapped in try/catch so a network failure leaves the static data intact (offline-friendly).

**The exported `store` object (public API):**
- `get students()` — current array (getter so callers always see the latest).
- `options` — the filter options object.
- `byId(id)` — robust lookup that tries the id as-is, as a Number, and as a String (handles the fact that DOM `data-id` is always a string but ids may be numbers).
- `getState()` — a **copy** of the filter state (so callers can't mutate it).
- `getFiltered`, `load` — as above.
- `setFilter(type, value)` — updates one filter (no-op if unchanged or unknown key) then `notify()`.
- `setSearch(value)` — trims + sets the search term (no-op if unchanged) then `notify()`.
- `reset()` — clears all filters + search then `notify()`.
- `subscribe(fn)` — registers a view callback; returns an unsubscribe function.
- `onData(fn)` — registers a data-reload callback; returns an unsubscribe function.

---

## `src/shaders.js` — the tile GLSL shaders

Exports two GLSL source strings used by every tile's `ShaderMaterial`. Tiles are
drawn **directly to the screen** (no offscreen render target) so nothing is
re-sampled and everything stays crisp.

- `f(n)` — a tiny helper that formats a JS number as a GLSL float literal (ensures `0.08` and `1.0` render with a decimal point). Used to inline config constants into the shader source at build time.

**`tileVertexShader`** — runs per vertex (the tile geometry is subdivided 12×12 so the warp is smooth):
- Uniforms: `uOffset` (pan), `uZoom`, `uAspect` (viewport aspect).
- Varyings: `vUv` (cell-local texture coord), `vScreen` (final screen position, passed to the fragment shader for the edge fade).
- `world = modelMatrix * position` — the tile's world position (its cell center + local vertex offset).
- `u = (world - offset) / (aspect*zoom, zoom)` — the **undistorted** normalized screen position.
- `s = u * (1.0 + K * dot(u,u))` — the **forward barrel distortion**: pushes vertices outward proportional to their squared distance from center (the fisheye). `K` = `WALL.distortionK`, inlined via `f()`.
- `gl_Position = vec4(s, 0, 1)` — writes clip space directly (that's why the JS uses a plain `THREE.Camera`, not a projection camera).

**`tileFragmentShader`** — runs per pixel:
- Uniforms: `tMap` (the card texture), `uAvg` (dominant color for the hover glow), `uHover` (0→1 hover amount), `uGrid` (grid line color+alpha).
- `c = texture2D(tMap, vUv)` — the card pixel (photo/text on a transparent background).
- `color = mix(uAvg * (uHover*0.55), c.rgb, c.a)` — where the card is transparent (`c.a≈0`) it shows the dominant-color **hover glow** (scaled by hover amount × 0.55); where the card is opaque (photo/text) it shows the card. So the glow fills the empty cell background on hover, behind the photo/text.
- The two `smoothstep`/`fwidth` lines draw **crisp ~1.5px grid lines** along each cell edge using screen-space derivatives (per-axis so there's no diagonal artifact), blended in with `uGrid`.
- `fade = 1 - smoothstep(FADE.start, FADE.end, length(vScreen))` — the **radial edge fade**; multiplies the final color so tiles dissolve near the screen edges.
- `gl_FragColor = vec4(color * fade, 1.0)`.

---

## `src/main.js` — the wall entry point

Wires the store to all the views. Loaded by `index.html`.

- Imports the store, the `Wall` class, and the five UI init functions.
- **`start()`** (async):
  - Grabs `#gallery`; bails if missing.
  - `initProfileOverlay()` → `profile`; defines `openProfile(student)` which opens the profile modal with the current filtered list (so the modal's "next" button steps through the filtered set).
  - Creates `new Wall(container, openProfile)` and `await wall.init()` (waits for fonts + WebGL setup).
  - Under `?seed=` or `?debug=`, exposes `window.__wall` for inspection/stress tests.
  - `initListView(openProfile)` → `list`; then `initViewToggle()`, `initFilters()`, `initSearch()`.
  - Grabs `#emptyState`.
  - **`apply(filtered)`** — the render callback: pushes the filtered list to the wall (`setActiveStudents`) and the list view (`list.render`), and toggles the empty-state message.
  - `apply(store.getFiltered())` — initial render; `store.subscribe(apply)` — re-render on every change.
  - `store.load()` — kick off the API fetch (swaps in live data when it arrives).
- `start()` is called at module load.


# PART B — THE WEBGL WALL (`src/gl/`)

This is the heart of the project: a **virtualized, single-pass** infinite wall.
"Virtualized" = only the tiles currently in view are drawn (a small recycled
pool of meshes). "Single-pass" = tiles render straight to the screen with the
fisheye done per-vertex, so there's no blurry post-processing step. Each
student's card is streamed to the GPU as one texture and cached (LRU).

## `src/gl/wall.js` — the renderer + interaction

**Module-level constants:**
- `UI_SELECTOR` — a CSS selector list of all overlay UI (filters, toggle, list, profile, search). Used so that a drag/click that starts on UI doesn't pan the wall.
- `HOVER_LERP = 0.18` — smoothing factor for the hover glow fade-in/out.

**`class Wall` — constructor(container, onSelect):**
- Stores the `#gallery` container and the `onSelect` callback (opens a profile).
- `offset`/`targetOffset` — current vs desired pan (world units); animated toward target each frame.
- `zoom`/`targetZoom` — current vs desired zoom.
- `dragging`, `isClick`, `clickStartTime`, `prevMouse` — pointer interaction state (distinguishes a click from a drag).
- `pointer` — last mouse position over the canvas (for hover), or `null`.
- `active` — the current filtered student array being displayed.
- `pool` — the array of reusable tile meshes.

**`async init()`:**
- `await document.fonts.ready` then `document.fonts.load("80px 'At Hauss Mono'")` — ensures the tile font is loaded before any card is rasterised (otherwise text would render in a fallback font). Wrapped in try/catch to fall back gracefully.
- Reads container width/height.
- Creates the `THREE.WebGLRenderer({ antialias: true })`, caps pixel ratio at 2.5 (retina sharpness without excess cost), sizes it, sets a black clear color, appends the canvas.
- `scene` + a plain `THREE.Camera` (the shader writes clip space directly, so no projection matrix is needed).
- `tileGeometry = new THREE.PlaneGeometry(cellSize, cellSize, 12, 12)` — a single shared quad subdivided **12×12** so the per-vertex fisheye warp is smooth.
- `this.shared` — uniform objects **shared by every tile** (updated once per frame): `uOffset`, `uZoom`, `uAspect`, `uGrid` (white at 0.22 alpha).
- Creates the `CardCache` (texture streaming).
- `growPool(TILE_POOL)`, `attachEvents()`, `animate()`.

**`growPool(target)`** — lazily creates tile meshes up to `target`:
- Each mesh gets its **own** `ShaderMaterial` (so per-tile uniforms `tMap`/`uAvg`/`uHover` differ) but **shares** the pan/zoom/aspect/grid uniform objects.
- `extensions: { derivatives: true }` — enables `fwidth` in the fragment shader (grid lines).
- `frustumCulled = false` (we manage visibility manually), `visible = false` (until assigned), `userData.hover = 0` (per-mesh hover animation state).
- Pushes each mesh into `scene` and `pool`.

**`setActiveStudents(active)`** — swaps the displayed list; hides the canvas entirely when the list is empty (so the empty-state message shows through).

**`updateVisibleTiles()`** — the core per-frame virtualization (called from `animate`):
- Computes `aspect`, `halfW`/`halfH` (visible world half-extents at current zoom).
- Pushes current `offset`/`zoom`/`aspect` into the shared uniforms.
- Computes the range of cell coordinates `[minX..maxX] × [minY..maxY]` visible in the viewport, expanded by `cellMargin`.
- `needed` = number of cells; grows the pool if the viewport needs more meshes than exist.
- `cache.beginFrame()` — increments the cache's frame counter (for LRU stamping).
- `hoverCell` — the cell under the pointer (only when not dragging), via `cellCoordsAt`.
- Loops every visible cell `(cx, cy)`:
  - `raw = (cx + cy*rowStride) % count`, then `idx = ((raw%count)+count)%count` — the **deterministic cell→student mapping** (double-mod to handle negatives). This is why the same world cell always shows the same student, and why the wall tiles/repeats students infinitely.
  - Assigns a pool mesh, positions it at the cell center `((cx+0.5)*cs, (cy+0.5)*cs)`, makes it visible.
  - `cache.get(active[idx])` → `{ texture, avg }`; sets the mesh's `tMap` and `uAvg`.
  - Hover: eases `mesh.userData.hover` toward 1 if this is the hovered cell, else toward 0 (via `HOVER_LERP`), and writes it to `uHover`.
- Hides any leftover pool meshes beyond the visible count.
- `cache.evict()` — disposes textures not used this frame once over the cache limit.

**`cellCoordsAt(clientX, clientY)`** — inverse of the vertex warp (screen → cell):
- Converts client pixels to normalized screen coords `sx, sy` in `[-1, 1]`.
- `d = 1 - K*(sx²+sy²)` — the **inverse** barrel distortion (first-order approximation of undoing the shader's forward warp).
- `wx = sx*d*aspect*zoom + offset.x`, `wy = sy*d*zoom + offset.y` — the world position under the cursor.
- Returns `{ cx: floor(wx/cellSize), cy: floor(wy/cellSize) }`. This is used for both **hover** and **click** hit-testing, and matches the shader's forward warp closely (error < ~0.1 cell even at the corners).

**`indexAt(clientX, clientY)`** — `cellCoordsAt` + the same `(cx + cy*rowStride) % count` mapping → the student index under the cursor. Uses the identical formula as the render loop so click resolves to exactly the displayed student.

**`attachEvents()`** — pointer + keyboard + resize wiring (defined as closures over `this`):
- `startDrag(x, y, target)` — ignores if the target is inside UI (`UI_SELECTOR`). Sets `dragging`, resets `isClick`, records `clickStartTime` and `prevMouse`, adds a `dragging` body class, and after 150ms (if still holding) animates to `dragZoom`.
- `move(x, y)` — while dragging, converts pointer delta to a pan of `targetOffset` (×0.003), and if the pointer moved > 2px marks it as **not** a click (and zooms out). Note the y sign is inverted (screen y down = world y up).
- `end(x, y)` — stops dragging, resets `targetZoom = 1`. If it was a genuine click (`isClick` and < 200ms), uses `document.elementFromPoint` to confirm the click is on `#gallery`, then calls `onSelect(active[indexAt(x,y)])` → opens that student's profile.
- Registers `mousedown/mousemove/mouseup/mouseleave` on `document`, plus `touchstart/touchmove/touchend` (passive: false so `preventDefault` works to stop page scroll), `contextmenu` prevention, and `window resize`.
- Also tracks `pointer` on canvas `mousemove` (for hover) and clears it on `mouseleave`.

**`resize()`** — re-reads container size, resizes the renderer, updates `uAspect`.

**`animate()`** — the render loop (rAF):
- Eases `offset` and `zoom` toward their targets by `lerpFactor` (smooth inertia).
- If `active` is empty, just clears and returns (nothing to draw).
- Otherwise `updateVisibleTiles()` then `renderer.render(scene, camera)`.

> **Note (known behavior):** the rAF loop keeps running even when the list view is showing (the wall is `display:none`), so it keeps rendering off-screen. Minor wasted GPU; candidate for a future pause.

---

## `src/gl/card.js` — rasterising one student card

Draws a single student's photo + name + year + tag pills + department onto a
2D `<canvas>`, which becomes one GPU texture. The card background is left
**transparent** so the shader's hover glow can show through behind it.

**`loadImage(url)`** — returns a Promise that resolves with a loaded `Image`. Sets `crossOrigin = "anonymous"` so remote/CDN images can be drawn to a canvas without tainting it (required to read pixels / use as WebGL texture).

**`cardImageUrl(student)`** — returns `thumbnail || image` (prefer the lightweight thumbnail for the wall).

**`averageColor(img)`** — computes the vibrant "dominant color" for the hover glow, **once** per student at load:
- Draws the image into a shared 16×16 canvas and reads pixels.
- Averages the opaque pixels (skips near-transparent ones).
- Computes luminance, then **boosts saturation** by 1.45 (so the glow reads as a color, not mud).
- Scales brightness up toward a vivid target (max channel → 205, capped at 2.4×) so even dark photos glow with color.
- Returns `[r,g,b]` in 0..1.

**`drawCover(ctx, img, dx, dy, dw, dh)`** — draws an image to *cover* a rect (center-crop, preserve aspect) — like CSS `object-fit: cover`.

**`toCanvasY(uvY, size)`** — converts a cell-local UV y (0 bottom) to a canvas y (0 top): `(1-uvY)*size`.

**`drawTitle(ctx, student, size)`** — the top band:
- Computes the band's top/bottom/mid canvas y from `LAYOUT.titleY/titleHeight`, and the horizontal inset + font size.
- Draws the **name** (uppercase, white) left-aligned at the inset.
- Draws the **year** (uppercase, `COLORS.text` gray) right-aligned.

**`labelFontPx(size)`** — the font size for the bottom-right department label (matches the title row).

**`drawTags(ctx, student, size)`** — the bottom band:
- Draws the **department** (uppercase, gray) bottom-right, and records `rightLimit` (so pills don't overlap it).
- Then draws up to **4 tag pills** bottom-left: for each tag it measures width, stops if it would exceed `rightLimit`, draws a rounded dark pill (`rgba(38,38,38,0.92)`) with a subtle white stroke, and the tag text centered in white.

**`drawCard(student, img, size)`** — assembles the full card:
- Creates a `size×size` canvas.
- Draws the centered photo square (`LAYOUT.imageSize`) with high-quality smoothing via `drawCover`.
- Calls `drawTitle` and `drawTags`.
- Returns the canvas (the background outside the photo/text stays transparent).

---

## `src/gl/textureCache.js` — GPU texture streaming (LRU)

This is what makes the wall scale to thousands of students on bounded GPU
memory: only students currently (or recently) on screen have a texture.

**`makeTexture(canvas)`** — wraps a canvas in a `THREE.CanvasTexture`:
- sRGB color space; `LinearFilter` for both min/mag; **`generateMipmaps = false`**. Disabling mipmaps is deliberate — mipmaps pre-blur the texture when scaled down, which was the original "blurry wall" bug. Sampling the full-res card keeps text/lines/photos crisp.

**`buildPlaceholder(size)`** — a transparent texture shown while a card's photo is still downloading (the tile then shows the cleared black background).

**`class CardCache` — constructor({ size, limit, onReady }):**
- `entries` — `Map<studentId, { student, texture, avg, status, frame }>`.
- `placeholder` — the transparent texture.
- `frame` — a monotonically increasing frame counter for LRU stamping.

**`beginFrame()`** — increments `frame` (called once per rendered frame).

**`get(student)`** — returns `{ texture, avg }` for a student right now, never blocking:
- Looks up the entry by `student.id`.
- **Identity guard:** if an entry exists but its stored `student` object is a *different* object than the one passed in, it disposes the stale texture and treats it as a miss. This fixes a real bug: the wall paints from static `data.js` (ids 0,1,2…) then swaps in API data whose serial ids overlap but point at different people — without this check a cell would show the old cached face while a click opened the new student at that id.
- On a miss, creates a `loading` entry and kicks off `load()` (async).
- Stamps `entry.frame = this.frame` (marks it used this frame).
- Returns the entry's texture (or the placeholder while loading) and its dominant color (or black).

**`async load(student, entry)`** — builds the card texture off the main path:
- Candidate URLs: the thumbnail first, then the full image as a fallback (e.g. a freshly-added student before thumbnails exist).
- For each candidate: `loadImage` → `averageColor` (store as a `THREE.Color`) → `drawCard` → `makeTexture` → mark `ready` → call `onReady`. Returns on first success.
- If all candidates fail, marks `error` (the placeholder keeps showing).

**`evict()`** — bounds GPU memory:
- No-op if under the limit.
- Otherwise collects entries **not** used this frame (`frame !== this.frame`), sorts oldest-first, and disposes/removes them until back under the limit. Entries used this frame (currently on screen) are never evicted.

**`get liveTextureCount()`** — diagnostics: how many entries currently hold a real texture (used by the stress test).


# PART C — UI MODULES (`src/ui/`)

Each module is a small `init…()` function that grabs its DOM elements, wires
events, and talks to the store. All are called once from `main.js`.

## `src/ui/filters.js` — the filter panel

- `pill(type, value, text, active)` — returns the HTML for one filter button, with `data-type`/`data-filter` attributes and an `active` class if selected.
- `renderPills(container, type, values, activeValue)` — renders an "ALL" pill plus one pill per value into a container, marking the active one.
- **`initFilters()`:**
  - Grabs the floating `#filterToggle` button and `.filters-container` panel; bails if missing.
  - `buildAll()` — renders the three pill groups: **category** (from the fixed `store.options.categories`), **department** and **year** (from live-data-derived `store.options.departments`/`.years`), each reflecting the current selection.
  - Calls `buildAll()` once, then `store.onData(buildAll)` so the pills rebuild when live data arrives (new departments/years appear) while keeping the current selection.
  - `panel.mousedown → stopPropagation` — prevents a drag started on the panel from panning the wall behind it.
  - Panel click handler: finds the clicked `.filter-pill`, clears `active` on its group, marks it active, calls `store.setFilter(type, filter)`, and does a quick scale "tap" animation.
  - `openPanel`/`closePanel` — toggle the panel + button `active` classes and add/remove an Escape-key listener.
  - Toggle button click opens/closes; a document click outside the panel closes it.
  - `store.subscribe(...)` — reflects a `has-filters` class on the toggle button whenever any filter or search is active (visual hint).

> **Known quirk:** category pills come from the fixed `CATEGORIES` list, not live data, so clicking a category no student has yields an empty wall.

## `src/ui/search.js` — the header search

- **`initSearch()`:**
  - Grabs the `#searchBtn`, `.search-overlay`, `#searchInput`; bails if missing.
  - `open()` — shows the overlay and focuses the input after 50ms.
  - `close()` — hides the overlay.
  - Search button toggles open/close.
  - The close (×) button calls `close()`.
  - Input handler: **debounced** (120ms) call to `store.setSearch(input.value)`.
  - Escape key: clears the input, clears the search in the store, and closes.

> **Known quirk:** the × close button only hides the overlay — it does **not** clear the query (only Escape does). So closing via × can leave a hidden active search filter. (Small fix candidate: make `close()` also clear the input + `store.setSearch("")`.)

## `src/ui/listView.js` — the year-grouped list

- `escapeHtml(str)` — escapes `& < > " '` for safe interpolation into HTML strings.
- `rowHtml(s)` — one list row: name (left), a pill group (middle), department (right). The **first pill is the student's `type`/category** (e.g. INTERNSHIP) rendered with an extra `type-pill` class (styled outlined, like phantom's "EXPERIENCE" pill); the remaining pills are up to 3 n8n tags (filled).
- `groupByYear(students)` — buckets students into a `Map` keyed by year (non-year → `"—"`), then returns the entries sorted by year **descending** (numeric), with non-numeric keys pushed to the end.
- **`initListView(onSelect)`:**
  - Grabs `#listViewContainer`.
  - `render(students)` — if empty, renders the "All Students" header + a "No students match" message. Otherwise builds the header ("All Students" + a small `N students` count) and, for each year group, a `.student-group` with a sticky year label and the rows.
  - Event delegation: a click on a `.student-link` resolves the student via `store.byId(dataset.id)` and calls `onSelect` (opens the profile).
  - Returns `{ render }` (called by `main.js`'s `apply`).

## `src/ui/viewToggle.js` — wall ↔ list toggle

- **`initViewToggle()`:**
  - Grabs the toggle buttons, the list wrapper, and `#gallery`.
  - `switchView(view)` — no-op if already on that view. Updates the active button, then:
    - **list:** shows the list wrapper (flex), animates it open on the next frame, hides the gallery, and adds a `list-open` class to `<body>` (CSS uses this to darken the header blur so list text scrolling behind the fixed logo stays readable).
    - **wall:** animates the list closed, shows the gallery, removes `list-open`, and after 300ms sets the list wrapper back to `display:none` (if still on wall).
  - Wires each toggle button; returns `{ switchView, getView }`.

## `src/ui/profileOverlay.js` — the profile modal

- `titleCase(name)` — splits the name on spaces, capitalises each word, and joins with `<br>` (so the hero name stacks vertically, e.g. "Ravi<br>Sharma").
- **`initProfileOverlay()`:**
  - Grabs `#profileOverlay`; if absent returns a no-op `{ open }`.
  - Grabs the backdrop, close button, next button.
  - `list` + `index` — the current navigable list and position (for "next").
  - `setText(id, value)` — safe `textContent` setter.
  - `formatStipend(v)` — if the stipend is purely numeric, formats it as `₹4,00,000` (Indian grouping); otherwise leaves it as-is (e.g. "Unpaid").
  - `fill(s)` — populates every field: photo, name (via `titleCase`, `innerHTML`), the role line (`TYPE at <firstTag>`), bio, reg no, department, type, duration, formatted stipend, LinkedIn/Website hrefs, and the certificate link (adds `is-disabled` + removes href when there's no certificate).
  - `open(student, currentList)` — sets `list` to the passed filtered list (or all students), finds the student's index, fills the card, adds `active`, locks body scroll, and listens for Escape.
  - `close()` — plays the closing animation, removes `active`, unlocks scroll, removes the Escape listener.
  - `next()` — advances `index` (wraps) and fills the next student in `list`.
  - Wires backdrop/close/next clicks, Escape, and clicking the overlay backdrop (but not the card) to close.
  - Returns `{ open }`.


# PART D — BACKEND (`server/`)

A single Express 5 app that serves the built frontend + admin and the JSON API,
backed by Postgres (prod) / PGlite (local).

## `server/index.js` — the Express app

**Setup:**
- Imports Express, multer (file uploads), path helpers, and all the server modules.
- `__dirname` / `distDir` — resolves the built `dist/` folder (served statically).
- `upload = multer({ memoryStorage, limits: 15MB })` — file uploads are kept in memory (never written to disk), capped at 15 MB.
- `app.use(express.json({ limit: "2mb" }))` — parse JSON bodies.
- `app.param("id", …)` — for any route with `:id`, rejects non-integer ids with 404 (prevents DB cast errors / injection via the id param).
- `wrap(fn)` — an async route wrapper that catches rejected promises and forwards them to the error handler (so `await` errors become clean 500s).

**Public routes:**
- `GET /api/health` — `{ ok: true }` (used by Render's health check).
- `GET /api/students` — returns `listStudents()` (all students, no blobs).
- `sendBlob(which)` — a route factory that streams an image/thumb blob: fetches the bytea, 404s if missing, sets content-type + a 5-minute cache header, sends the buffer.
- `GET /api/students/:id/image` and `/thumb` — the two blob routes.

**Admin auth:**
- `POST /api/admin/login` — calls `login(password)`; returns `{ token }` or 401 `Invalid password`.

**Admin CRUD (all `requireAuth`):**
- `POST /api/admin/students` — create → 201 + the new student.
- `PUT /api/admin/students/:id` — update → the updated student (404 if missing).
- `DELETE /api/admin/students/:id` — delete → `{ ok: true }`.
- `POST /api/admin/students/:id/image` — `upload.single("image")`: validates the student + file, runs `processImage` (resize), stores full+thumb blobs, returns the updated student. Bad image → 400.
- `POST /api/admin/students/:id/tags` — regenerates tags from the bio (or a provided `about`) via `generateTags`, saves them, returns `{ tags }`.
- `POST /api/admin/enrich` — **stateless**: returns `{ bio, tags }` from a provided about text **without saving**, so the admin could preview the AI bio before committing. (Note: the current admin UI doesn't call this endpoint yet.)

**Excel import (`requireAuth`):**
- `POST /api/admin/import` — `upload.single("file")`:
  - `parseWorkbook(buffer)` → an array of student records.
  - For each record: if it has a bio, `enrichAbout(bio)` rewrites the bio and fills tags (if the row had none); errors keep the original.
  - Upsert: if the row has a Reg No and a student with that Reg No exists, `updateStudent` (counts as `updated`); otherwise `createStudent` (counts as `imported`). **This is the idempotency mechanism** — re-importing the same sheet updates rather than duplicates, but only for rows that have a Reg No.
  - If the row has a Photo URL, `fetchRemoteImage` → `processImage` → `setImageBlob` (counts photos; failures collected in `photoErrors`).
  - Returns `{ imported, updated, total, photos, photoErrors }`.
  - Note: enrichment runs **sequentially** per row (slow for very large sheets).

**Static serving + startup:**
- `express.static(distDir)` serves the built assets.
- `GET /admin` and `GET /` send the built `admin.html` / `index.html`.
- **Error handler** — maps multer file-size errors to 413, other multer errors to 400, everything else to 500 (and logs it).
- `initDb().then(...)` — initialises the DB (migrate + seed) **before** `app.listen(PORT)`. On failure, logs and `process.exit(1)`.
- Exports `app` (for tests).

## `server/db.js` — database layer (pg / PGlite)

- Module-level `_query` — the active query function, set by `initDb`.
- **`initDb()`:**
  - If `DATABASE_URL` is set → **production**: dynamically import `pg`, build a `Pool`. SSL is on unless the URL is localhost or `PGSSL=false`; uses `rejectUnauthorized: false` (accepts Render's managed cert). `_query = pool.query`.
  - Else → **local**: dynamically import `@electric-sql/pglite`, create/ensure a data dir (`PGLITE_DIR` or `./.data/pg`), open an in-process Postgres, `_query = db.query`.
  - Then `migrate()` + `seedIfEmpty()`.
- **`query(text, params)`** — the exported query interface (delegates to `_query`); the **same SQL runs on both** pg and PGlite.
- **`migrate()`** — `CREATE TABLE IF NOT EXISTS students (...)` with all columns: identity/text fields, `tags JSONB`, socials, certificate, `image_url`/`thumb_url` (for external URLs), `image`/`thumb` bytea blobs + their types, `position`, timestamps. It's a single idempotent create (no versioned migrations).
- `toThumb(url)` — same thumbnail-path derivation as the frontend, used when seeding.
- **`seedIfEmpty()`** — if the table is empty, inserts every entry from `data.js` (mapping the static shape to columns, deriving `category` from `type`, thumbnail from image, and `position` from index). So a fresh deploy is never empty.

## `server/students.js` — queries + row↔object mapping

- `LIST_COLS` — the columns selected for listing; crucially it **excludes the heavy bytea blobs** and instead selects booleans `has_image`/`has_thumb` (so the list query stays light).
- `parseTags(t)` — normalises the `tags` column to an array (handles array, JSON string, or junk).
- **`mapRow(r)`** — converts a DB row to the public student object the frontend expects. Notably resolves `image`/`thumbnail` URLs: an external `image_url` if present, else the `/api/students/:id/image` blob route if a blob exists, else null; thumbnail similarly (falls back to the full image).
- `listStudents()` — all students ordered by `position, id`.
- `getStudent(id)` / `getByRegNo(regNo)` — single-row lookups (the latter powers import idempotency).
- **`buildColumns(data, { withName })`** — dynamically builds the column list, placeholders, and values from only the fields present in `data` (so PATCH-style partial updates work). Casts `tags` to `::jsonb`, lowercases `category`, splits `socials` into `linkedin`/`website`, coerces empty year to null.
- `createStudent(data)` — INSERT (always includes name) → returns the created student.
- `updateStudent(id, data)` — UPDATE of only the provided columns + `updated_at` → returns the updated student (no-op returns current if nothing to set).
- `deleteStudent(id)` — DELETE.
- `getImageBlob(id, which)` — fetches the `image`/`thumb` bytea + its type (or null).
- `setImageBlob(id, full, thumb)` — stores both blobs + types and **nulls out** any external `image_url`/`thumb_url` (an uploaded photo supersedes a URL).

> **Note:** there's no DB-level unique constraint on `reg_no`; idempotency relies on the app-level `getByRegNo` check.

## `server/auth.js` — admin auth

- `SECRET` = `TOKEN_SECRET` env (default insecure dev value) — HMAC signing key.
- `ADMIN_PASSWORD` = env (**default `"admin"`**).
- `TTL_MS` = 12 hours.
- `sign(payload)` — base64url-encodes the JSON payload and appends an HMAC-SHA256 signature (`body.sig`). A tiny stateless JWT-like token.
- `verify(token)` — splits `body.sig`, recomputes the HMAC, compares with `crypto.timingSafeEqual` (constant-time, avoids timing attacks), then checks the `exp` timestamp. Returns the payload or null.
- `login(password)` — returns a signed 12h admin token if the password matches, else null.
- `requireAuth(req, res, next)` — reads the `Bearer` token from the `Authorization` header, verifies it, and 401s `Unauthorized` if invalid. Express middleware guarding all `/api/admin/*` (except login).

> **Security notes (flagged for hardening):** defaults (`admin` / `dev-insecure-secret-change-me`) are insecure if the env vars aren't set in prod; there's no login rate-limiting; a single shared password (no per-user accounts).

## `server/images.js` — image processing (sharp)

- **`fetchRemoteImage(url)`** — validates it's an http(s) URL, fetches it (following redirects), errors on non-OK or > 20 MB, returns a Buffer. (No content-type check or timeout — a slow/non-image URL can stall the import loop.)
- **`processImage(buffer)`** — produces two WebPs with sharp, both `.rotate()` (respects EXIF orientation):
  - `full` — resized to fit within 1200×1200 (no enlargement), quality 82.
  - `thumb` — square 512×512 cover-crop (centered), quality 78.
  - Returns `{ full: {data,type}, thumb: {data,type} }`.

## `server/excel.js` — Excel/CSV parsing

- `ALIASES` — for each canonical field (name, year, regNo, department, type, category, duration, stipend, bio, linkedin, website, certificate, tags, imageUrl) a list of accepted header names (case-insensitive), so teachers can use their existing sheet layout. Only `Name` is truly required.
- `norm(h)` — lowercases/trims a header.
- **`directImageUrl(url)`** — converts Google Drive / OneDrive **share** links into **direct-download** URLs (Drive `uc?export=download&id=…`; OneDrive via the base64 `shares/u!…/root/content` API). Requires the file be shared "anyone with the link".
- **`rowToStudent(row)`** — lowercases all keys, then for each field picks the first non-empty aliased value; parses year to an int, splits tags on `, ; | /` (uppercased, max 4), uppercases department/type, lowercases category (defaults to type or "others"), and normalises the photo URL. Returns the record shape the import route expects.
- **`parseWorkbook(buffer)`** — reads the workbook (SheetJS), takes the first sheet, converts to JSON rows (blank cells → `""`), maps each to a student, and drops rows with no name.

> **Dependency note:** `xlsx@0.18.5` from npm has known advisories (prototype pollution / ReDoS); worth pinning/replacing with the maintained build.

## `server/tags.js` — AI enrichment + fallback

- `KEYWORDS` / `STOP` — the local fallback's keyword vocabulary and stop-words.
- **`localTags(text)`** — the offline tag extractor: pulls up to 3 acronym-like tokens (e.g. "ACL'24", "HCI"); if fewer than 3, scans for known keywords. Returns ≤ 3 uppercase tags.
- `localBio(text)` — trims the About to ≤ 256 chars at a word boundary (used when no LLM is available).
- **`enrichAbout(about)`** — the main entry:
  - Returns `{ bio: "", tags: [] }` for empty input.
  - If `N8N_TAGS_WEBHOOK_URL` is set, POSTs `{ about }` to it; on a valid response uses the LLM's `{ bio, tags }` (bio capped at 256 chars, tags uppercased/capped at 3), falling back to local values for any missing piece.
  - If the webhook is unset or fails, returns `{ localBio, localTags }`. So imports always work, with or without n8n.
- **`generateTags(about)`** — backwards-compatible helper (tags only) used by the per-student tags endpoint; delegates to `enrichAbout`.


# PART E — ADMIN, HTML, DATA & CONFIG

## `src/admin/admin.js` — the admin dashboard logic

Talks to the same-origin API with a bearer token in `localStorage`.

- `$(id)` — `getElementById` shorthand.
- `TOKEN_KEY` / `token` — the localStorage key and current token.
- `students` / `pendingPhoto` — the loaded list and a photo File awaiting upload on save.
- **`api(path, {method, body, form})`** — the fetch wrapper: adds the `Authorization` header, JSON-encodes `body` (unless `form`, then sends the FormData raw). On 401 → `logout()` + throws "Session expired". On other errors → throws the server's `error` message. Returns parsed JSON (or null for 204).
- `status(msg)` — writes to the status line.
- `showApp()` / `logout()` — toggle the login vs app panels; logout clears the token.
- **Login form submit** — POSTs the password to `/api/admin/login`, stores the returned token, shows the app. Errors render in `#loginError`.
- `tagPills(tags)` — renders up to 3 tag chips for the table.
- **`renderRows()`** — renders the students table, filtered by the search box (name/dept/type/tags substring). Each row has a thumbnail (hidden on error), name, dept, year, type, tags, and a Delete button.
- **`loadStudents()`** — GET `/api/students` → render + status count.
- Search input re-renders on input.
- **Rows click handler (delegation):** a Delete button → confirm + DELETE + reload; a row → open the edit modal for that student.
- `fields` — the modal field id suffixes.
- **`openModal(student)`** — fills the modal inputs from a student (or blanks for a new one); shows/hides the Delete button; sets the photo preview.
- `closeModal()`; Add button opens a blank modal; `[data-close]` elements close it.
- **`formData()`** — reads the modal inputs into the API shape (uppercases department/type/tags, coerces year, defaults socials to "#").
- **`persist()`** — validates name, then POST (create) or PUT (update); stores the returned id back in the hidden field; returns the saved student.
- Photo file input — stashes the File in `pendingPhoto` and shows a local preview.
- **Generate Tags button** — `persist()` first (so the server has a saved bio to read), then POSTs to `/tags`, fills the tags field. (Side effect: clicking Generate on a new record silently creates it.)
- **Save button** — `persist()`, then if a photo is pending uploads it via `/image` (FormData), closes the modal, reloads.
- **Delete button** (in modal) — confirm + DELETE + reload.
- **Import flow:**
  - `TEMPLATE` — the CSV template string (header row + one example row) offered for download.
  - Template button — builds a Blob and triggers a download.
  - `handleImport(file)` — POSTs the file to `/api/admin/import` (FormData), reloads, and reports `imported/updated/photos/errors` in the status line.
  - Dropzone — click opens the file picker; dragover/dragleave/drop styling; drop or file-select triggers `handleImport`.
  - The whole Template/Add cards are clickable (not just their arrow buttons).
- `escapeHtml(str)` — HTML-escaping for table cells.
- **Boot:** if a token exists in localStorage, `showApp()` immediately.

> `src/admin/admin.css` is styling only (phantom-inspired dark dashboard) — no logic.

## `index.html` — the wall page

Static markup the JS hydrates. Key hooks (IDs/classes the JS relies on):
- `<head>` preloads the four woff2 fonts (incl. `Rokkitt.woff2`, used for profile name/bio) and links `styles.css`.
- **Header** (`.header-bar`): the gradient blur backdrop, the "Wall of Fame" logo, the short description, and the `.search-cta` (the "GET FEATURED" link with its small pixel arrow, and the `#searchBtn`).
- **Search overlay** (`.search-overlay`): the search box with `#searchInput` and a × close button.
- **View toggle** (`.view-toggle`): the wall/list pill with the sliding `.toggle-highlight` and two icon buttons (`data-view="wall"|"list"`).
- **Filter toggle** (`#filterToggle`) + **filters panel** (`.filters-container`) with three empty `.filter-pills[data-type=…]` containers the JS fills.
- **Gallery** (`#gallery`): where the WebGL canvas is injected; contains a vignette overlay and the `#emptyState` message.
- **List view** (`.list-view-wrapper` → `#listViewContainer`): populated entirely by `listView.js`.
- **Profile overlay** (`#profileOverlay`): backdrop, card with header (logo + close button using `/images/back.svg`), body (photo + info split into `.profile-info-top` hero and `.profile-info-bottom` data), the meta grid (reg no, department, type, duration, stipend, certificate), the socials block, and a footer with the "Go to Next Person" button.
- Loads `/src/main.js` as a module.

## `admin.html` — the admin page

- A background glow, then two top-level panels toggled by JS:
  - `#login` — the welcome + password form (`#loginForm`, `#password`, `#loginError`).
  - `#app` (hidden until logged in) — topbar (view wall / logout), hero copy, three action cards (**Upload** dropzone `#dropzone` + hidden `#importFile`, **Template** `#templateBtn`, **Manual** `#addBtn`), and the students table (`#search`, `#status`, `#rows`).
- The **edit/add modal** (`#modal`): photo column (`#photoPreview` + `#photoFile`) and the form fields (`#f_name`, `#f_department`, `#f_year`, `#f_type`, `#f_regNo`, `#f_duration`, `#f_stipend`, `#f_bio`, `#f_tags` + `#genTags`, `#f_linkedin`, `#f_website`, `#f_certificate`), with Delete / Cancel / Save.
- Loads `/src/admin/admin.js`.

## `data.js` — the static sample dataset

- `export const projects = [ … ]` — an array of ~25 sample students. Each object shape:
  ```js
  {
    title: "ADITYA GURU",        // → name
    image: "/img1.jpeg",          // photo in public/
    year: 2024,
    regNo: "22541001",
    department: "CSE",
    type: "RESEARCH",             // → category via TYPE_TO_CATEGORY
    duration: "6 MONTHS",
    stipend: "250000",            // formatted to ₹ in the profile
    bio: "…",
    socials: { linkedin: "#", website: "#" },
    href: "/sample-project",       // legacy, unused by current code
    tags: ["ACL'24", "HCI", "AI"]
  }
  ```
- Used for: (1) instant first paint / offline fallback in `store.js`, and (2) seeding the DB on first boot in `db.js`.

## `vite.config.js` — build config

- Dev server on port 5173, opens the browser, and **proxies `/api` → `http://localhost:3000`** (so the frontend dev server and the API server run separately in dev).
- Build: two HTML entry points (`index.html` = main, `admin.html` = admin), so Vite emits both pages.

## `package.json` — scripts & deps

- Scripts: `dev` (Vite), `dev:server` (the API), `build` (Vite build → `dist/`), `preview`, `start` (`node server/index.js` — production), `thumbs` (regenerate thumbnails).
- Deps: `express`, `multer`, `pg`, `sharp`, `three`, `xlsx`. Dev deps: `@electric-sql/pglite`, `vite`.
- `"type": "module"` — everything is ESM.

## `scripts/thumbs.mjs` — thumbnail generator

- Resolves `public/` and `public/thumbs/`.
- Finds every `img*.jpeg`/`.jpg`, resizes each to a 512×512 square cover-crop WebP (quality 78) into `thumbs/`, and logs the size savings.
- Run with `npm run thumbs` after adding new sample photos. (In production the same resizing is done server-side by `images.js` during import/upload.)

## `render.yaml` — deploy blueprint

- One `web` service (Node, free plan): `buildCommand: npm install && npm run build`, `startCommand: node server/index.js`, health check `/api/health`.
- Env vars: `NODE_VERSION=22`; `DATABASE_URL` (set manually — the blueprint deliberately does **not** auto-create a DB because Render's free tier allows only one); `ADMIN_PASSWORD` (set in dashboard); `TOKEN_SECRET` (auto-generated); `N8N_TAGS_WEBHOOK_URL` (optional).

---

# PART F — DATA MODEL

The canonical **student object** (what the frontend everywhere consumes, and
what `mapRow` produces):

```js
{
  id,                         // number (DB serial) or array index (static)
  name,                       // string
  year,                       // number | null
  regNo,                      // string (dedup key for import)
  department,                 // string, e.g. "CSE"
  type,                       // string, e.g. "INTERNSHIP" / "RESEARCH"
  category,                   // lowercased type, for filtering
  duration,                   // string, e.g. "6 MONTHS"
  stipend,                    // string; numeric ones shown as ₹4,00,000
  bio,                        // string (AI-polished on import)
  tags: [],                   // string[] (n8n-generated, ≤ 3–4 shown)
  socials: { linkedin, website },  // "#" when absent
  certificate,                // URL string ("" when none)
  image,                      // full image URL or /api/students/:id/image
  thumbnail,                  // thumb URL or /api/students/:id/thumb
}
```

The DB `students` table stores these columns plus `image`/`thumb` **bytea**
blobs (+ types), `image_url`/`thumb_url` (for external URLs), `position` (sort
order), and `created_at`/`updated_at`.

---

# PART G — RUNNING IT

```bash
npm install
cp .env.example .env          # leave DATABASE_URL empty → uses PGlite locally

# Two terminals for local dev:
npm run dev:server            # API + in-process DB at http://localhost:3000
npm run dev                   # frontend at http://localhost:5173 (proxies /api)

# Production-style (one server serving the built site + API):
npm run build && npm start    # http://localhost:3000  and  /admin

npm run thumbs                # regenerate sample thumbnails after adding img*.jpeg
```

**Admin login:** the password is the `ADMIN_PASSWORD` env var (default `admin`
if unset). The database password is separate — it lives inside `DATABASE_URL`.

---

# PART H — KNOWN BEHAVIORS / GOTCHAS (read before changing things)

1. **Search haystack** excludes bio and regNo (only name/department/type/tags).
2. **Category filter pills** come from the fixed `CATEGORIES` list, not live data — categories with no students return an empty wall.
3. **Search × button** hides the overlay but doesn't clear the query (only Escape clears it).
4. **Wall rAF loop** keeps rendering even when the list view is shown (wall is `display:none`).
5. **Import enrichment is sequential** (one n8n call per row) — slow for very large sheets.
6. **Import idempotency** needs a Reg No; rows without one create duplicates on re-import.
7. **No unique constraint on `reg_no`** at the DB level — dedup is app-level only.
8. **Auth**: default `ADMIN_PASSWORD`/`TOKEN_SECRET` are insecure if unset in prod; no login rate-limiting; single shared password.
9. **`fetchRemoteImage`** has no timeout / content-type check.
10. **`xlsx@0.18.5`** has known advisories — consider replacing.
11. **`/api/students` is public** and includes regNo + bio — a privacy consideration for real data.
12. **Images live in Postgres** (`bytea`) — fine at college scale; move to object storage (S3/R2) for very large datasets.
13. **`/api/admin/enrich`** exists (preview bio before saving) but the admin UI doesn't call it yet.
14. **Profile card sizes to content** (no fixed aspect ratio) so both columns stay equal height across short/long bios; the info column can scroll on very short viewports.

---

*End of handover. If something here has drifted from the code, the code is the
source of truth — update this file when you change behavior.*
