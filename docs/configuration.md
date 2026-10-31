# Configuration reference

Every setting in one place: environment variables for the server and the build,
then the constants that control how the wall looks and behaves.

- [Environment variables](#environment-variables)
  - [Server](#server)
  - [Build time (frontend)](#build-time-frontend)
  - [Set automatically by Render](#set-automatically-by-render)
- [Wall tunables (`src/config.js`)](#wall-tunables-srcconfigjs)
- [Other constants](#other-constants)

---

## Environment variables

The server reads `process.env`. Locally, put values in `.env` (start from
`.env.example`). `server/env.js` loads that file at startup, and real
environment variables always win over it. On Render, set them in the service's
**Environment** tab.

"Production" below means any of: `DATABASE_URL` is set, `NODE_ENV=production`,
or running on Render (`RENDER=true`).

### Server

| Variable | Default | Effect |
|---|---|---|
| `PORT` | `3000` | Port to listen on. Render sets it. |
| `DATABASE_URL` | empty | PostgreSQL connection string. **Empty → PGlite**, an in-process Postgres stored in `PGLITE_DIR`. On Render use the database's *Internal* URL. |
| `PGSSL` | on | SSL is used unless `PGSSL=false` or the URL points at `localhost`/`127.0.0.1`. Certificates aren't verified (`rejectUnauthorized: false`), which suits Render's managed Postgres. |
| `PGLITE_DIR` | `./.data/pg` | PGlite data folder (local only). Delete it to reset the local database. |
| `ADMIN_PASSWORD` | `admin` locally; **none in production** | Admin login password. In production, if it's unset, admin login is **disabled** and the log says `ADMIN_PASSWORD is not set`. |
| `TOKEN_SECRET` | fixed dev value locally; random per process in production | Signs admin tokens. Set a long random value in production (Render generates one); otherwise admins are signed out on every restart. Changing it signs everyone out. |
| `SEED_SAMPLE_DATA` | `true` | When the table is empty at boot, insert the 25 sample students. Set to `false` for a real deployment that should start empty. |
| `N8N_TAGS_WEBHOOK_URL` | empty | The n8n webhook for AI enrichment (`POST {about}` → `{bio, tags}`). Empty, failing, or slower than 20 s → local fallback. See [n8n/README.md](../n8n/README.md). |
| `TRUST_PROXY` | `1` on Render, `0` elsewhere | Number of reverse proxies in front of the app, used to find the client IP for the login rate limit. Setting it higher than the real number lets clients fake their IP. |
| `NODE_ENV` | – | `production` turns on the production auth rules even without `DATABASE_URL`. |

### Build time (frontend)

Vite inlines `VITE_*` variables into the JavaScript bundle during `npm run build`.
Changing one needs a rebuild, which on Render means a redeploy. These values are
public: anyone can read them in the bundle.

| Variable | Default | Effect |
|---|---|---|
| `VITE_GET_FEATURED_URL` | empty | Where the header's **GET FEATURED** text links, e.g. the Google/Microsoft Form students use to submit achievements. `https:` and `mailto:` only. Empty → plain text. |

### Set automatically by Render

| Variable | Used for |
|---|---|
| `RENDER=true` | Turns on the production auth rules; defaults `TRUST_PROXY` to `1` |
| `PORT` | Listening port |
| `NODE_VERSION` | Set to `22` in `render.yaml` |

---

## Wall tunables (`src/config.js`)

These constants are shared by the shaders and the interaction code, so drawing
and click hit-testing always agree. Change them here, never by editing a copied
number elsewhere.

### `WALL`: geometry and motion

| Key | Default | Effect |
|---|---|---|
| `cellSize` | `0.75` | Size of one tile in world units. Smaller = more, smaller tiles. |
| `dragZoom` | `1.25` | Zoom level while dragging (above 1 zooms out). |
| `lerpFactor` | `0.075` | Easing: each frame, pan/zoom move 7.5% toward the target. Higher = snappier. |
| `distortionK` | `0.08` | Fisheye strength. `0` = flat grid. Used by both the vertex shader and the click math. |
| `rowStride` | `3` | Cell → student stride for walls with fewer than `wideStrideFrom` students (the diagonal repeat pattern). |
| `wideRowStride` | `17` | Starting stride for larger walls, bumped to the next number sharing no factor with N. Keep it ≥ the number of visible columns, or one screen repeats students. |
| `wideStrideFrom` | `64` | Student count at which the wide stride takes over. |
| `cellMargin` | `1` | Extra ring of cells drawn outside the viewport, so tiles don't pop in. |

### `LAYOUT`: what goes where inside a tile

Coordinates are fractions of the tile, with `y = 0` at the bottom.

| Key | Default | Effect |
|---|---|---|
| `imageSize` | `0.6` | The photo is a centred square, 60% of the tile. |
| `titleY`, `titleHeight` | `0.87`, `0.07` | Top band: name (left) and year (right). |
| `titleXInset` | `0.06` | Left/right margin of the top band. |
| `tagsY`, `tagsHeight` | `0.06`, `0.07` | Bottom band: tag pills (left) and department (right). |
| `tagsXInset` | `0.06` | Left/right margin of the bottom band. |

### Other `config.js` exports

| Export | Default | Effect |
|---|---|---|
| `COLORS.text` | `rgba(160,160,160,1)` | Year and department label colour on tiles (lightened from 128 so labels stay readable over the hover glow). `COLORS.border` and `COLORS.background` are currently unused. |
| `FADE` | `{ start: 1.2, end: 1.8 }` | Tiles fade out between these screen radii (1 = screen edge). |
| `CARD.size` | `768` desktop, `512` small screens | Card texture resolution in pixels. Higher is sharper and uses more GPU memory. |
| `CARD.cacheLimit` | `72` desktop, `56` small screens | Max card textures kept on the GPU (LRU). |
| `TILE_POOL` | `120` | Initial number of reusable tile meshes (grows if a viewport needs more). |
| `CATEGORIES` | internship, hackathons, research, fellowship, grants, incubation, exams, patent, sports, services, others | Display order of category filter pills. Pills only appear for categories that exist in the data. |
| `CANVAS_FONT` | `At Hauss Mono` | Font for tile text. Loaded before any card is drawn. |

"Small screen" means the shorter side of the window is under 768 px, measured
once at page load.

---

## Other constants

Values that live in a single file rather than `config.js`:

| Value | Where | Effect |
|---|---|---|
| Hover glow strength `0.55` | `src/shaders.js` | How bright the dominant-colour wash gets on hover |
| Grid line colour/alpha `(1,1,1,0.22)` | `src/gl/wall.js` (`uGrid`) | Grid line brightness |
| `HOVER_LERP = 0.18` | `src/gl/wall.js` | How fast the hover glow fades in and out |
| Drag sensitivity `0.003` | `src/gl/wall.js` (`move`) | World units per pixel dragged |
| Click threshold: under 200 ms, under 2 px | `src/gl/wall.js` | What counts as a click rather than a drag |
| Drag-zoom delay `150 ms` | `src/gl/wall.js` | Hold time before zooming out for a drag |
| Pixel ratio cap `2.5` | `src/gl/wall.js` | Max device pixel ratio rendered |
| Tile mesh subdivision `12 × 12` | `src/gl/wall.js` | Smoothness of the fisheye curve |
| Placeholder glow `[0.42, 0.44, 0.5]` | `src/gl/card.js` | Hover colour for students without a photo |
| Photo sizes: full ≤ 1200 px q82, thumb 512 px q78 | `server/images.js` | WebP output of uploads/imports |
| Sample thumbnails 512 px q78 | `scripts/thumbs.mjs` | `npm run thumbs` output |
| Upload, token, timeout and rate limits | `server/*.js` | Listed in [api.md → Limits](api.md#limits-and-caching) |
| Local tag keywords | `server/tags.js` (`KEYWORDS`) | Fallback tag vocabulary |
| Bio limit 256 characters | `server/tags.js`, `n8n/enrich.workflow.json` | Max length of the AI bio |
