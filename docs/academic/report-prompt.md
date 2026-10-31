# Wall of Fame: project report prompt

Give this document to a writing assistant (or use it yourself) to produce the
college project report. Part A is the factual brief, checked against the code
in October 2026. Part B gives the report structure and writing rules.

> An earlier version of this prompt described the proposed design (GPT-4,
> Redis, S3, an email system, texture atlases, five database tables). Much of
> that was never built or was replaced. If you used it before, re-check your
> report against Part A. The old version is in the git history of
> `PROJECT_REPORT_PROMPT.md`.

---

## Part A: Facts

### A1. Summary

**Wall of Fame** is a web platform built for **Manipal University Jaipur** that
showcases student achievements (internships, research, hackathons) so students
get noticed. Visitors browse an **infinite, draggable WebGL wall** of student
tiles with a fisheye effect, open a **profile** for any student, switch to a
**year-grouped list**, and **filter or search**. Staff manage the content from an
**admin dashboard**, mainly by uploading the **Excel/CSV export of a Google or
Microsoft Form**. The server downloads and resizes photos, and an **n8n workflow
with an LLM** rewrites each student's raw "About" text into a short bio and 2–3
tags.

Two user groups:

- **Viewers** (students, faculty, recruiters): browse, search, open profiles.
- **Admins** (teachers, staff): sign in with a shared password; import, add,
  edit and delete students.

### A2. Technology (as built)

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Vanilla JavaScript (ES modules), **Three.js 0.177**, custom GLSL shaders | No UI framework |
| Build | **Vite 6** | Two pages: wall (`index.html`), admin (`admin.html`) |
| Server | **Node.js 22, Express 5** | One service serves the site, the admin and the API |
| Database | **PostgreSQL** in production, **PGlite** (in-process Postgres) locally | One `students` table |
| Images | **sharp** | Resize to WebP: full ≤ 1200 px, 512 px square thumbnail; stored in Postgres (`bytea`) |
| Spreadsheets | **SheetJS 0.20.3** | `.xlsx`, `.xls`, `.csv`; flexible header names |
| AI | **n8n** workflow calling **Groq** (`llama-3.3-70b-versatile`) or **OpenRouter** | Built-in fallback when unavailable |
| Hosting | **Render** (web service + managed Postgres), `render.yaml` blueprint | |
| Fonts | At Hauss Mono, IBM Plex Mono, Klim, Rokkitt | Self-hosted woff2 |

Code size: about 2,750 lines of JavaScript (server ≈ 960, wall frontend ≈
1,470, admin ≈ 320) plus about 2,150 lines of CSS. Production bundle: 499 KB of
JavaScript (129 KB gzipped, mostly Three.js) and 27 KB of CSS.

### A3. Architecture

- **One service:** a Node/Express server serves the built frontend, the admin
  page and a JSON API, so there is one deployment and no cross-origin setup.
- **Single source of truth on the frontend:** `src/store.js` holds the students
  and filter state; the wall, list and filters all render from it.
- **Same SQL everywhere:** PGlite runs Postgres inside Node for local
  development, so no database server is needed, while production uses real
  PostgreSQL.
- **Deployment:** `npm ci && npm run build`, then `node server/index.js`. The
  schema is created and migrated on startup.

API: public `GET /api/health`, `GET /api/students`, photo endpoints; admin
(token-protected) login, create, update, delete, photo upload, tag generation,
AI preview (`/api/admin/enrich`) and import. Full list: `docs/api.md`.

Database: one table `students` (name, year, reg_no, department, type, category,
duration, stipend, bio, tags as JSONB, linkedin, website, certificate, photo
bytes and paths, position, timestamps, and two import bookkeeping columns).
Diagram: `docs/academic/flowcharts.md`.

### A4. The WebGL wall (main technical contribution)

1. **Virtualisation.** Only the grid cells on screen (plus one ring) are drawn,
   using a recycled pool of 120 tile meshes. Each cell maps to a student with
   `(x + y × stride) mod N`, so the grid is infinite and stable: the same cell
   always shows the same student.
2. **Texture streaming with an LRU cache.** Each visible student's tile, a
   "card" with photo, name, year, tags and department, is drawn once on an
   HTML canvas and uploaded as one GPU texture. At most 72 textures are kept
   (56 on phones); the least recently used are disposed.
3. **Single-pass rendering for sharpness.** The fisheye (barrel) distortion is
   applied per vertex in the vertex shader (`s = u·(1 + 0.08·|u|²)`) on
   12×12-subdivided tiles, instead of a blurry full-screen post-process.
   Textures use linear filtering without mipmaps. Grid lines are drawn in the
   fragment shader with screen-space derivatives (`fwidth`), so they stay about
   1.5 px wide.
4. **Hover glow.** Each photo's dominant colour is computed once (16×16
   average, saturation boosted) and shown as a wash behind the tile on hover.
5. **Click accuracy.** Screen clicks are mapped back through the inverse warp to
   the same cell → student function used for drawing, so a click always opens
   the student drawn there.
6. **Row stride.** Below 64 students the stride is 3 (a diagonal pattern). From
   64 it is 17 or more and coprime with N, so one screen never shows the same
   student twice.

**Measured** (headless Chromium, 1440×900, stress mode `/?seed=N`, after
panning 96 columns): with **1,000 and 5,000 students**, the wall used 120 tile
meshes and at most **72 live textures**, with no errors. GPU memory and network
use depend on the screen, not the number of students.

### A5. The data pipeline

1. **Intake:** an admin uploads a sheet (first sheet; header row; one student
   per row; only Name required). Headers are matched flexibly, ignoring case
   and punctuation, against 56 aliases ("Reg No.", "Roll Number", "Branch",
   "Batch"…). Link columns titled like form questions ("Upload your photo")
   are recognised by keyword.
2. **Normalisation:** years such as "2021-2025" or "2023-27" become the
   passing year; department and type are uppercased; tags are split on
   `, ; | /`; Google Drive and OneDrive share links become direct downloads.
3. **AI enrichment:** each new or changed About is sent to the n8n webhook,
   whose LLM prompt returns a first-person bio of at most 256 characters and
   2–3 uppercase tags. If n8n is unset, fails, or takes over 20 seconds, a
   built-in fallback trims the About and picks keyword tags, so imports never
   fail because of the AI.
4. **Upsert:** rows with a registration number update the existing student
   instead of duplicating. Blank cells keep existing values. An unchanged About
   keeps the bio and tags (including admin edits) and skips the AI call. An
   unchanged Photo URL isn't downloaded again.
5. **Photos:** downloaded (20 s timeout, 20 MB cap), EXIF-rotated, re-encoded
   to WebP (metadata such as GPS removed), and stored as a full image and a
   thumbnail.

### A6. Security (as built)

- Admin sign-in with one shared password exchanged for an HMAC-SHA256-signed
  token valid for 12 hours; constant-time comparisons.
- Login rate limit: 10 failed attempts per IP per 15 minutes.
- Production refuses default credentials: login stays disabled until a password
  is configured.
- Stored-XSS protection: all data is escaped or set as text; links are limited
  to `http(s)`/`mailto`; a Content-Security-Policy blocks inline scripts.
- Clickjacking protection for the admin; parameterised SQL only; upload size
  limits; generic error messages.
- **Known gaps:** a single shared password (no per-user accounts or audit log);
  the token is kept in `localStorage`; Photo URLs aren't restricted to public
  addresses. Details: `docs/security.md`.

### A7. Testing and validation (what was actually done)

There is **no automated test suite in the repository**. Verification was done
with scripted, headless checks against a running server:

- **API checks** (28): health, seeding, authentication and rate limiting,
  create/update/delete, AI preview, spreadsheet import and re-import rules,
  year parsing, error codes, security and caching headers, photo versioning.
- **Browser checks** (27, headless Chromium with software WebGL): the
  wall renders and loads without errors; clicking a tile opens the right
  profile; filters, search and list view; a student whose name, department,
  tags and links contain script payloads renders as plain text with no script
  executing; students without photos; the API-down error state; admin sign-in,
  session expiry and the Generate button.
- **Stress test:** 1,000 and 5,000 students (A4).
- **Tutorial replay:** the getting-started guide executed step by step.

Write about this honestly in the report: scripted end-to-end verification, not
a unit-test suite. No user study was run, so don't report user-acceptance results.

### A8. Results

- The wall scales to thousands of students with bounded memory (A4) and stays
  sharp on high-DPI screens (pixel ratio up to 2.5).
- One spreadsheet upload adds or updates any number of students, including
  photos and AI-written bios.
- Re-uploading a growing form-response sheet is safe (A5, step 4).
- Production bundle 129 KB of gzipped JavaScript, most of it Three.js.
- The sample photos store as about 36 KB per student (full + thumbnail), so
  Postgres storage is fine at college scale.

### A9. Limitations

- Single shared admin password; no per-user accounts or audit log.
- Import runs in the web request, one row at a time: large sheets take minutes,
  and free LLM tiers (about 30 requests/minute on Groq) slow it further.
- Rows without a registration number create duplicates on re-import.
- Photos from private Microsoft 365 / SharePoint links can't be downloaded.
- Photos live in the database; object storage would scale better.
- The free hosting database expires after 30 days.

### A10. Future work

From the roadmap (`docs/roadmap.md`) and the original vision:

- Certificate generation from a template (today a certificate is a link).
- Email notifications when an achievement is added.
- Per-user admin accounts, or sign-in with college Google/Microsoft accounts.
- Background imports with progress; bulk actions; draft vs published.
- Object storage (S3 / Cloudflare R2) for photos; automated tests and CI.
- Analytics (views, clicks).

### A11. Screenshots

Captured from the running app, in `docs/images/`:

| File | Shows |
|---|---|
| `wall.webp` | The infinite wall with a hovered tile |
| `filters.webp` | The filter panel |
| `profile.webp` | A student profile |
| `list.webp` | The year-grouped list view |
| `admin-login.webp` | Admin sign-in |
| `admin-dashboard.webp` | Admin dashboard and students table |
| `admin-edit.webp` | Editing a student |

### A12. Example input

`docs/examples/import-example.csv`:

```csv
Name,Batch,Reg No,Department,Type,Duration,Stipend,About,Tags,LinkedIn,Website,Certificate,Photo URL
RIYA DAS,2022-2026,22FE10CSE00101,CSE,INTERNSHIP,2 MONTHS,80000,"Riya interned at Atlassian on the Jira mobile team, where she shipped offline sync for editing issues.",,https://www.linkedin.com/in/example,,,http://localhost:3000/img5.jpeg
KABIR SINGH,2023-27,23FE10ECE00042,ECE,HACKATHON,36 HOURS,,"Kabir won first place at Smart India Hackathon 2025 with an IoT flood-alert system for riverside villages.","IOT, SIH'25",,,https://example.com/certificate.pdf,
MEERA IYER,2025,21FE10CAI00007,CAI,RESEARCH,6 MONTHS,Unpaid,"Meera co-authored a paper at EMNLP 2025 on low-resource machine translation for Indic languages.",,,https://example.com,,
```

Importing it locally reports `Imported 3 new, 1 photo saved`; importing it
again reports `Imported 0 new, updated 3, 1 photo unchanged`.

---

## Part B: Writing the report

Use the facts in Part A. Don't add features, numbers or tools that aren't
there; in particular don't claim GPT-4, Redis, an email system, analytics, a
user study, or effort-saving percentages, because none of these were built or
measured.

**Suggested structure (25–35 pages, IEEE/ACM style):**

1. **Introduction (2 pages):** motivation (achievements are scattered and
   unseen), objectives, the solution in brief.
2. **Related work (2–3 pages):** institutional showcase pages, portfolio
   galleries, WebGL in web design (phantom.land inspired the visual design),
   LLMs for text summarisation; a comparison table.
3. **System architecture (4–5 pages):** A2, A3; the architecture and import
   diagrams from `docs/academic/flowcharts.md`; the database diagram.
4. **Implementation (6–8 pages):**
   - the WebGL wall (A4): virtualisation, texture streaming, the shaders with
     short GLSL excerpts from `src/shaders.js`, click mapping;
   - the import pipeline (A5) with an excerpt from `server/excel.js` (header
     matching or `parseYear`);
   - AI enrichment: the n8n workflow and prompt (`n8n/enrich.workflow.json`),
     and the fallback;
   - security (A6).
5. **User interface (3–4 pages):** wall, profile, list, admin; at least four
   screenshots from A11 with captions.
6. **Testing and validation (2–3 pages):** A7 as it was done, including the
   stress-test table.
7. **Results and discussion (2–3 pages):** A8, objectives vs outcomes, A9.
8. **Conclusion and future work (1–2 pages):** A10.
9. **References:** Three.js, WebGL/GLSL, Vite, Express, PostgreSQL/PGlite,
   sharp, SheetJS, n8n, Groq/OpenRouter, Render documentation, and any papers
   cited in related work.
10. **Appendices:** flowcharts, the API table, the database diagram, the example
    CSV, selected code listings.

**Points worth emphasising (all true and demonstrable):**

- A custom single-pass WebGL renderer that stays sharp and handles 5,000
  students with a fixed memory budget.
- A spreadsheet-first workflow that fits how the college already collects data
  (form exports), with safe re-imports.
- AI used narrowly and safely: it rewrites text, a fallback guarantees the
  import works, and admins can review and edit.
- A small, dependency-light codebase deployable as one service.
