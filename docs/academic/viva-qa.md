# Wall of Fame: viva Q&A

Questions an examiner or a new developer is likely to ask, with answers that
point at the code. Checked against the code in October 2026. Deeper material:
[architecture.md](../architecture.md), [data-model.md](../data-model.md),
[security.md](../security.md).

**Product**
1. [What is it, and what problem does it solve?](#q1-what-is-it-and-what-problem-does-it-solve)

**Rendering**
2. [How does the wall render thousands of students without slowing down?](#q2-how-does-the-wall-render-thousands-of-students-without-slowing-down)
3. [Why did the wall look blurry before, and how was it fixed?](#q3-why-did-the-wall-look-blurry-before-and-how-was-it-fixed)
4. [How does a click find the right student on a distorted grid?](#q4-how-does-a-click-find-the-right-student-on-a-distorted-grid)
5. [Why does the row stride change at 64 students?](#q5-why-does-the-row-stride-change-at-64-students)

**Data**
6. [How does data get from the database to the screen?](#q6-how-does-data-get-from-the-database-to-the-screen)
7. [How does the Excel import work, and what format does it need?](#q7-how-does-the-excel-import-work-and-what-format-does-it-need)
8. [What happens when the same sheet is uploaded again?](#q8-what-happens-when-the-same-sheet-is-uploaded-again)
9. [What does n8n do, and what if it is down?](#q9-what-does-n8n-do-and-what-if-it-is-down)
10. [What happens when a student has no photo?](#q10-what-happens-when-a-student-has-no-photo)

**Backend and security**
11. [What does the API look like, and how is it secured?](#q11-what-does-the-api-look-like-and-how-is-it-secured)
12. [How do you stop a malicious spreadsheet from injecting scripts?](#q12-how-do-you-stop-a-malicious-spreadsheet-from-injecting-scripts)
13. [How is it configured and deployed?](#q13-how-is-it-configured-and-deployed)
14. [How was it tested?](#q14-how-was-it-tested)
15. [What are its limitations, and what would you do next?](#q15-what-are-its-limitations-and-what-would-you-do-next)

---

### Q1. What is it, and what problem does it solve?

A showcase of student achievements for Manipal University Jaipur: an infinite,
draggable WebGL wall of tiles (photo, name, year, department, tags), a profile
for each student, a year-grouped list, filters and search. The problem is
visibility and effort: achievements are scattered, and putting them online by
hand doesn't scale. Here a teacher uploads the spreadsheet a Google/Microsoft
Form already produces; the site downloads photos, writes short bios with an LLM,
and publishes everything.

### Q2. How does the wall render thousands of students without slowing down?

Two techniques (`src/gl/wall.js`, `textureCache.js`, `card.js`):

- **Virtualisation:** only cells on screen plus one ring are drawn, with a
  recycled pool of 120 meshes. The mesh count depends on screen size, not on
  the number of students.
- **Texture streaming:** each visible student is drawn once into a canvas
  "card" (photo + text) and uploaded as one texture, kept in an LRU cache of 72
  (56 on phones). Cards that scroll away are disposed when the cache is full.

Measured with `/?seed=N`: 1,000 and 5,000 students both peaked at 72 live
textures on 120 meshes.

### Q3. Why did the wall look blurry before, and how was it fixed?

Three causes, three fixes:

1. The fisheye was a full-screen post-processing pass that resampled the frame.
   It moved into the **vertex shader** (`src/shaders.js`), so tiles are drawn
   straight to the screen in one pass, on 12×12-subdivided geometry so the
   curve stays smooth.
2. **Mipmaps** blurred textures drawn smaller than their size. They're
   disabled: `generateMipmaps = false` with `LinearFilter`.
3. Grid lines were soft. They're now drawn in the fragment shader with `fwidth`,
   about 1.5 px at any zoom.

(The sample photos are intentionally motion-blurred art; real photos are sharp.)

### Q4. How does a click find the right student on a distorted grid?

The vertex shader warps positions with `s = u·(1 + K·|u|²)`. A click applies the
inverse, approximately `u ≈ s·(1 − K·|s|²)` (`cellCoordsAt()`), to get back to
world coordinates, then the cell. That cell goes through the same `cellIndex()`
function used for drawing, so the click opens exactly the student drawn there.
Both use `K` from `src/config.js`, so they can't drift apart.

### Q5. Why does the row stride change at 64 students?

A cell `(x, y)` shows student `(x + y × stride) mod N`. With stride 3, the
diagonal pattern the design was tuned with, neighbouring rows overlap: on a
1440×900 screen with 1,000 students only 23 different students were visible,
each about twice. From 64 students the stride is 17 or more (wider than the
visible columns, and coprime with N), so every tile on screen is a different
student. Below 64 there aren't enough students to fill a screen anyway.

### Q6. How does data get from the database to the screen?

`src/store.js` is the single source of truth. On load it requests
`GET /api/students` immediately, in parallel with font loading and WebGL setup.
When the data arrives it rebuilds the filter options from the data and notifies
subscribers; `main.js` hands the filtered list to the wall and the list view.
Until then the wall is blank (status `loading`). If the request fails, a
production build shows an error message; a development build falls back to the
sample data in `data.js`. Filtering (`matches()`) covers category, department,
year and a search over name, department, type and tags.

### Q7. How does the Excel import work, and what format does it need?

`server/excel.js` reads the first sheet; the first row is the headers; only
**Name** is required. Headers are matched after lowercasing and removing
punctuation, against 56 aliases (Reg No / Roll Number / Registration Number;
Department / Branch; Year / Batch; About / Description…). Link columns with
question-style headers ("Upload your photo") are matched by keyword. Years like
"2021-2025" become the passing year (2025). Google Drive and OneDrive share
links are turned into direct downloads, which requires the files to be shared
"Anyone with the link". Full rules: [data-model.md](../data-model.md#spreadsheet--student).

### Q8. What happens when the same sheet is uploaded again?

Form-response sheets grow, so re-uploading must be safe. Rows are matched by
**Reg No**: a match updates that student, otherwise a new one is created. Only
non-blank cells overwrite. If the About is unchanged since the last import
(stored in `about_source`), the bio and tags, including admin edits, are kept
and the AI isn't called. If the Photo URL is unchanged (`photo_source`), it isn't
downloaded again. Rows without a Reg No can't be matched and become duplicates.

### Q9. What does n8n do, and what if it is down?

`n8n/enrich.workflow.json` is Webhook → LLM (Groq or OpenRouter) → Code →
Respond. The server POSTs `{ about }` and gets `{ bio, tags }`: a first-person
bio of up to 256 characters and 2–3 uppercase tags. The prompt lives in the LLM
node, so it can change without redeploying the app. If the webhook isn't set,
errors, or takes over 20 seconds, `server/tags.js` falls back to trimming the
About and picking keyword tags, so imports never fail because of the AI.

### Q10. What happens when a student has no photo?

The wall draws a card with the student's initials in place of the photo, and
still shows their name, year, tags and department (`drawPhotoPlaceholder()` in
`card.js`). The profile shows the initials in the photo area. Before this was
fixed, such students were invisible black tiles.

### Q11. What does the API look like, and how is it secured?

Public: `GET /api/health`, `GET /api/students`, and the photo endpoints. Admin:
login, create/update/delete, photo upload, tag generation, AI preview and
import, all needing `Authorization: Bearer <token>`. The token is an
HMAC-SHA256-signed payload valid for 12 hours, issued for the shared
`ADMIN_PASSWORD`. Logins are limited to 10 failures per IP per 15 minutes. In
production a missing password disables login rather than falling back to a
default. Reference: [api.md](../api.md).

### Q12. How do you stop a malicious spreadsheet from injecting scripts?

Defence in depth. Every value placed in HTML is escaped (list view, filter
pills, admin table) or set with `textContent`; the profile name is built from
text nodes; links must be `http(s)` or `mailto`; tile text is drawn on a canvas,
which can't run code. Behind that, a Content-Security-Policy allows only the
site's own scripts, so even a missed escape couldn't run an injected script.
This was tested by importing a student whose name, department, tags and links
contain script payloads and checking that nothing ran.

### Q13. How is it configured and deployed?

Environment variables ([configuration.md](../configuration.md)): `DATABASE_URL`,
`ADMIN_PASSWORD`, `TOKEN_SECRET`, `N8N_TAGS_WEBHOOK_URL`, `SEED_SAMPLE_DATA`
and a few more; `.env` locally. Visual tunables are in `src/config.js`. On
Render, `render.yaml` defines one web service: `npm ci && npm run build`, then
`node server/index.js`, which migrates the schema on boot. The database is a
separate Render Postgres whose URL is set by hand, because a workspace can have
only one free database.

### Q14. How was it tested?

With scripted, headless end-to-end checks rather than a unit-test suite: 28 API
checks (auth, rate limit, CRUD, import and re-import rules, error codes,
headers, caching) and 27 browser checks in headless Chromium (rendering, click
accuracy, filters, search, list view, XSS payloads, no-photo students, the
API-down state, admin flows), plus the stress test and a replay of the
getting-started tutorial. Adding these as an automated suite with CI is the
first roadmap item.

### Q15. What are its limitations, and what would you do next?

One shared admin password; imports run in the request one row at a time; rows
without a Reg No duplicate; photos live in Postgres; private Microsoft 365
photo links can't be downloaded; the free database expires after 30 days. Next:
automated tests and CI, blocking private IPs for Photo URLs (SSRF), bulk admin
actions, background imports with progress, per-user accounts, object storage,
and the unbuilt vision items (certificate generation, email notifications).
See [roadmap.md](../roadmap.md).
