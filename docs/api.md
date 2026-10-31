# API reference

The server exposes a small JSON API on the same origin as the site. The wall
uses the public endpoints; the admin dashboard uses the admin endpoints. Every
example response below was captured from a running server.

- [Conventions](#conventions)
- [Public endpoints](#public-endpoints)
- [Authentication](#authentication)
- [Admin: students](#admin-students)
- [Admin: photos](#admin-photos)
- [Admin: AI enrichment](#admin-ai-enrichment)
- [Admin: import](#admin-import)
- [Errors](#errors)
- [Limits and caching](#limits-and-caching)

---

## Conventions

- **Base URL:** the site's origin (`http://localhost:3000` locally,
  `https://<service>.onrender.com` on Render). In `npm run dev`, Vite on `:5173`
  proxies `/api` to `:3000`.
- **Format:** JSON request and response bodies (`Content-Type: application/json`),
  except uploads, which are `multipart/form-data`.
- **IDs:** `:id` is a positive integer. Anything else returns `404`.
- **Errors:** always `{ "error": "<message>" }` with a 4xx/5xx status.
- **Student object:** described field by field in
  [data-model.md](data-model.md#the-student-object).

Shell setup for the examples:

```bash
BASE=http://localhost:3000
TOKEN=$(curl -s -X POST $BASE/api/admin/login \
  -H 'Content-Type: application/json' \
  -d '{"password":"admin"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
```

---

## Public endpoints

### `GET /api/health`

Liveness check, used by Render's health check. It does not touch the database.

```json
{ "ok": true }
```

### `GET /api/students`

All students, ordered by `position`, then `id`. Photo bytes are never included,
only their URLs.

```bash
curl -s $BASE/api/students
```

```json
[
  {
    "id": 1,
    "name": "ADITYA GURU",
    "year": 2024,
    "regNo": "22541001",
    "department": "CSE",
    "type": "RESEARCH",
    "category": "research",
    "duration": "6 MONTHS",
    "stipend": "250000",
    "bio": "Published at ACL'24 on human-computer interaction and adaptive interfaces. …",
    "tags": ["ACL'24", "HCI", "AI"],
    "socials": { "linkedin": "#", "website": "#" },
    "certificate": "",
    "image": "/img1.jpeg",
    "thumbnail": "/thumbs/img1.webp"
  }
]
```

There is no pagination; the whole list is one response. That is fine up to a few
thousand students.

> **Privacy:** this endpoint is public and includes `regNo` and `bio`. Only
> import data students have agreed to show. See [security.md](security.md#privacy).

### `GET /api/students/:id/image` and `GET /api/students/:id/thumb`

The stored photo (≤ 1200 px) or thumbnail (512 × 512), as `image/webp`. Only for
photos uploaded or imported into the database; sample students' photos are
static files. Use the URLs from the student object, which carry `?v=`.

| Request | Response |
|---|---|
| With `?v=…` (as the API returns it) | `200`, `Cache-Control: public, max-age=31536000, immutable` |
| Without `?v` | `200`, `Cache-Control: public, max-age=300` |
| Student has no stored photo | `404` with an empty body |
| `:id` not an integer | `404 {"error":"Not found"}` |

---

## Authentication

### `POST /api/admin/login`

Exchanges the admin password (the `ADMIN_PASSWORD` variable) for a token valid
for **12 hours**.

```bash
curl -s -X POST $BASE/api/admin/login -H 'Content-Type: application/json' -d '{"password":"admin"}'
```

| Status | Body |
|---|---|
| `200` | `{ "token": "eyJyb2xlIjoi….kznfNI…" }` |
| `401` | `{ "error": "Invalid password" }` |
| `429` | `{ "error": "Too many attempts. Try again later." }` with a `Retry-After` header (seconds) |

The rate limit is **10 failed attempts per client IP per 15 minutes**. A
successful login clears that IP's counter. In production, if `ADMIN_PASSWORD`
isn't set, every login fails with `401` (see
[configuration.md](configuration.md#server)).

**Using the token:** send `Authorization: Bearer <token>` on every
`/api/admin/*` call. A missing, invalid or expired token returns
`401 {"error":"Unauthorized"}`, and the admin page then signs you out.

**Token format:** `<base64url JSON payload>.<HMAC-SHA256 signature>`. The payload
is `{"role":"admin","exp":<ms timestamp>}` and is readable (not encrypted); only
the signature is secret. Changing `TOKEN_SECRET` invalidates every existing
token. Changing only the password does not.

---

## Admin: students

### `POST /api/admin/students`

Creates a student. Only `name` is needed; every other field is optional.

```bash
curl -s -X POST $BASE/api/admin/students \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"PRIYA NAIR","year":2025,"regNo":"23FE10CSE00042","department":"CSE",
       "type":"INTERNSHIP","duration":"2 MONTHS","stipend":"60000",
       "bio":"Interned at Microsoft on Azure DevOps tooling.","tags":["AZURE","DEVOPS"],
       "socials":{"linkedin":"https://www.linkedin.com/in/example","website":""},"certificate":""}'
```

`201` with the created student:

```json
{
  "id": 26, "name": "PRIYA NAIR", "year": 2025, "regNo": "23FE10CSE00042",
  "department": "CSE", "type": "INTERNSHIP", "category": "internship",
  "duration": "2 MONTHS", "stipend": "60000",
  "bio": "Interned at Microsoft on Azure DevOps tooling.", "tags": ["AZURE", "DEVOPS"],
  "socials": { "linkedin": "https://www.linkedin.com/in/example", "website": "#" },
  "certificate": "", "image": null, "thumbnail": null
}
```

Field handling (details in [data-model.md](data-model.md#writing-object--row)):
an empty `name` becomes `"Unnamed"`; an invalid `year` becomes `null`;
`category` is derived from `type` when not given; empty socials become `"#"`.
Send `department`, `type` and `tags` uppercased; the API stores them as sent.

### `PUT /api/admin/students/:id`

**Partial** update: only the fields in the body change.

```bash
curl -s -X PUT $BASE/api/admin/students/26 \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"duration":"3 MONTHS"}'
```

`200` with the updated student, or `404 {"error":"Not found"}`.

### `DELETE /api/admin/students/:id`

```bash
curl -s -X DELETE $BASE/api/admin/students/26 -H "Authorization: Bearer $TOKEN"
```

`200 {"ok":true}`. Deleting an id that doesn't exist also returns `200`.

---

## Admin: photos

### `POST /api/admin/students/:id/image`

Multipart upload, field name **`image`**, max 15 MB. The server corrects EXIF
rotation and stores two WebPs: the full photo (fits in 1200 × 1200, never
enlarged, quality 82) and a 512 × 512 centre-cropped thumbnail (quality 78).
Any `image_url` / `thumb_url` on the student is cleared.

```bash
curl -s -X POST $BASE/api/admin/students/26/image \
  -H "Authorization: Bearer $TOKEN" -F "image=@photo.jpg"
```

`200` with the updated student, whose `image` and `thumbnail` now point to
`/api/students/26/image?v=…` and `/thumb?v=…`. The `v` changes on every upload.

| Status | Error |
|---|---|
| `400` | `No image uploaded` (no `image` field) |
| `400` | `Invalid or unsupported image file` (sharp can't read it) |
| `404` | `Not found` (no such student) |
| `413` | `File too large (max 15MB)` |

---

## Admin: AI enrichment

Both endpoints use the n8n webhook when `N8N_TAGS_WEBHOOK_URL` is set, and the
local fallback otherwise or when the webhook fails or takes over 20 seconds. See
[n8n/README.md](../n8n/README.md).

### `POST /api/admin/enrich`

Turns an About text into a bio + tags **without saving anything**. The admin's
**Generate** button uses it.

```bash
curl -s -X POST $BASE/api/admin/enrich \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"about":"Priya interned at Microsoft for 3 months working on Azure DevOps pipelines and cloud tooling."}'
```

Local fallback response (no n8n configured):

```json
{
  "bio": "Priya interned at Microsoft for 3 months working on Azure DevOps pipelines and cloud tooling.",
  "tags": ["DEVOPS", "CLOUD"]
}
```

With n8n, `bio` is an LLM rewrite in the first person (≤ 256 characters) and
`tags` are 2–3 LLM-chosen tags. An empty `about` returns
`{ "bio": "", "tags": [] }`.

**Local fallback:** the bio is the About trimmed to 256 characters at a word
boundary. Tags are up to 3 of: words with two or more capitals ("DevOps",
"HCI", "ACL'24"), then whole-word matches from a fixed list (AI, ML, HCI, UX,
UI, DESIGN, RESEARCH, NLP, CV, ROBOTICS, SECURITY, CYBERSECURITY, ALGORITHMS,
BCI, PSYCHOLOGY, DATA, CLOUD, DEVOPS, BLOCKCHAIN, IOT, HARDWARE, SYSTEMS,
REMOTE).

### `POST /api/admin/students/:id/tags`

Generates tags from `about` in the body (or the student's saved bio) and
**saves** them.

```bash
curl -s -X POST $BASE/api/admin/students/26/tags -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{}'
```

```json
{ "tags": ["DEVOPS"] }
```

---

## Admin: import

### `POST /api/admin/import`

Multipart upload, field name **`file`**: `.xlsx`, `.xls` or `.csv`, max 15 MB.
Rows are processed in order following the
[import rules](data-model.md#import-rules).

```bash
curl -s -X POST $BASE/api/admin/import \
  -H "Authorization: Bearer $TOKEN" -F "file=@docs/examples/import-example.csv"
```

First import of the example sheet:

```json
{ "imported": 3, "updated": 0, "total": 3, "photos": 1, "photosSkipped": 0, "photoErrors": [] }
```

Same file again (every row has a Reg No, so all three update; the Photo URL is
unchanged, so it isn't downloaded again):

```json
{ "imported": 0, "updated": 3, "total": 3, "photos": 0, "photosSkipped": 1, "photoErrors": [] }
```

| Field | Meaning |
|---|---|
| `imported` | New students created |
| `updated` | Existing students (matched by Reg No) updated |
| `total` | Rows with a name |
| `photos` | Photos downloaded and stored |
| `photosSkipped` | Photo URL unchanged since the last import, photo kept |
| `photoErrors` | One message per failed photo, e.g. `"ROHAN MEHTA: photo fetch failed (fetch failed)"`. The student is still saved. |

| Status | Error |
|---|---|
| `400` | `No file uploaded` |
| `400` | `Could not read that file. Upload an .xlsx, .xls or .csv sheet.` |
| `400` | `No students found. The first row must be the headers, and one header must be Name (or Student Name / Full Name).` |
| `413` | `File too large (max 15MB)` |

The request returns when every row is done. With AI enabled, budget 1–3 seconds
per row, more if photos are large or slow to download.

---

## Errors

| Status | When | Body |
|---|---|---|
| `400` | Malformed JSON | `Request body is not valid JSON` |
| `400` | Bad upload (see the endpoint) | Endpoint-specific message |
| `401` | Login failed / missing or expired token | `Invalid password` / `Unauthorized` |
| `404` | Unknown `/api/*` route, non-integer `:id`, missing student | `Not found` |
| `413` | Upload over 15 MB, or JSON body over 2 MB | `File too large (max 15MB)` / `request entity too large` |
| `429` | Too many failed logins | `Too many attempts. Try again later.` |
| `500` | Unexpected server error | `Server error`. Details are only in the server log. |

---

## Limits and caching

| Limit | Value | Where |
|---|---|---|
| Upload size (photo, sheet) | 15 MB | `multer` in `server/index.js` |
| JSON body | 2 MB | `express.json` |
| Token lifetime | 12 hours | `server/auth.js` |
| Failed logins | 10 per IP per 15 min | `server/auth.js` |
| Photo URL download | 20 s, 20 MB | `server/images.js` |
| n8n webhook call | 20 s, then local fallback | `server/tags.js` |
| Bio from enrichment | 256 characters | `server/tags.js` |
| Tags | 4 from a sheet, 3 from enrichment | `server/excel.js`, `server/tags.js` |

| Response | `Cache-Control` |
|---|---|
| `/assets/*` (content-hashed JS/CSS) | `public, max-age=31536000, immutable` |
| Photos with `?v=` | `public, max-age=31536000, immutable` |
| Photos without `?v` | `public, max-age=300` |
| HTML, fonts, sample photos | `public, max-age=0`, revalidated with ETag |
| JSON API | No `Cache-Control`; revalidated with ETag |
