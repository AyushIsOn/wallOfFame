# Security and privacy

What is protected, how, and what isn't covered yet. Last reviewed October 2026
(PR #32).

- [What is public and what is protected](#what-is-public-and-what-is-protected)
- [Controls](#controls)
- [Known gaps](#known-gaps)
- [Privacy](#privacy)
- [Operating securely](#operating-securely)
- [Reporting a vulnerability](#reporting-a-vulnerability)

---

## What is public and what is protected

| Public (no login) | Protected (admin token) |
|---|---|
| The wall and list view | Creating, editing and deleting students |
| `GET /api/students`: every field of every student | Uploading photos |
| Photos and thumbnails | Excel/CSV import, which makes the server download Photo URLs |
| `/admin` page itself (the login form) | AI enrichment endpoints |

There is one admin role, unlocked by one shared password.

---

## Controls

| Threat | Control | Where |
|---|---|---|
| **Guessing the admin password** | 10 failed logins per IP per 15 minutes, then `429`. Constant-time comparison. | `server/auth.js` |
| **Default credentials in production** | With `DATABASE_URL`, `NODE_ENV=production`, or on Render, an unset `ADMIN_PASSWORD` disables login instead of accepting `admin`; an unset `TOKEN_SECRET` becomes a random per-process secret | `server/auth.js` |
| **Forged or expired tokens** | HMAC-SHA256 signed tokens, compared in constant time; 12-hour expiry | `server/auth.js` |
| **Script injection through student data** (a name, tag or link in an imported sheet) | Every value put into HTML is escaped (list view, filter pills, admin table), or set with `textContent`; links pass `safeUrl()` (`http:`, `https:`, `mailto:` only); tile text is drawn on a canvas | `src/ui/*.js`, `src/admin/admin.js` |
| …and if an escape is ever missed | Content-Security-Policy `script-src 'self'`: no inline scripts, inline event handlers or `eval` | `server/index.js` |
| **Clickjacking the admin** | `frame-ancestors 'none'` and `X-Frame-Options: DENY` on `/admin` and `/api/admin/*` | `server/index.js` |
| **SQL injection** | Parameterised queries only; column names come from code, never from input; `:id` must be digits | `server/students.js`, `server/index.js` |
| **Malicious or huge uploads** | 15 MB limit, files kept in memory (never written to disk), decoded and re-encoded to WebP by sharp; unreadable images rejected | `server/index.js`, `server/images.js` |
| **Spreadsheet parser bugs** | Maintained SheetJS 0.20.3 from SheetJS's CDN (the npm `xlsx` package stopped at 0.18.5, which has prototype-pollution and ReDoS advisories); import is admin-only | `package.json` |
| **Slow or hostile Photo URLs** | `http(s)` only, 20 s timeout, 20 MB cap, HTML responses rejected | `server/images.js` |
| **Leaking internals** | 500 responses say only `Server error`; `X-Powered-By` disabled; `X-Content-Type-Options: nosniff`; `Referrer-Policy: strict-origin-when-cross-origin` | `server/index.js` |
| **Secrets in the repository** | All secrets come from environment variables; `.env` is gitignored; Render generates `TOKEN_SECRET` | `.gitignore`, `render.yaml` |
| **Spoofed client IPs** | `trust proxy` is 1 hop on Render and 0 elsewhere, so `X-Forwarded-For` can't be forged to dodge the rate limit | `server/index.js` |
| **Known-vulnerable dependencies** | `npm audit` reported 0 vulnerabilities at the time of this review | `package-lock.json` |

These controls are covered by the verification checks in
[CONTRIBUTING.md](../CONTRIBUTING.md#verify-your-change), which include planting
script payloads in a student's name, department, tags and links and checking
that none run.

---

## Known gaps

Ordered by how much they matter for a college deployment.

| Gap | Risk | Mitigation today | Fix |
|---|---|---|---|
| **One shared admin password** | No per-person accountability or audit trail. Changing the password doesn't end existing sessions. | Share it with few people; rotate `ADMIN_PASSWORD` and `TOKEN_SECRET` together when someone leaves | Per-user accounts (roadmap) |
| **Token in `localStorage`** | Any script that ran on the admin page could read it | CSP blocks injected scripts; 12-hour expiry | HttpOnly cookie + CSRF protection |
| **Photo URLs can point anywhere** | An admin (or a stolen token) can make the server request internal network addresses (SSRF) | Admin-only; the response must decode as an image | Block private and link-local IP ranges before fetching |
| **Rate limit is per process and in memory** | Resets on restart; not shared across instances | Single instance on Render | Shared store (Redis/Postgres) if scaled out |
| **Behind Cloudflare/Render, IPs may be shared** | If Render adds proxy hops, many visitors could share one rate-limit bucket (a nuisance lockout, not a bypass) | `TRUST_PROXY` can be raised after checking `X-Forwarded-For` | – |
| **No backups on free Postgres** | Data loss | Manual `pg_dump` ([deployment.md](deployment.md#backups-and-the-free-tier)) | Paid plan with backups |

---

## Privacy

Everything on a profile is **public**, and `GET /api/students` lets anyone
download all of it at once:

> name, photo, year, registration number, department, type, duration, stipend,
> bio, tags, LinkedIn, website, certificate link

Recommendations for the institution:

1. **Consent:** only import students who agreed to be featured. A form question
   ("I agree to my details and photo being shown") is the simplest record.
2. **Minimise:** leave out fields that aren't needed. Registration numbers and
   stipends are the most sensitive. A blank cell isn't shown, and blank cells
   never erase existing values on re-import.
3. **Removal on request:** delete the student in the admin; their row and photo
   bytes are removed from the database right away. Database backups you made
   still contain them.
4. **Photo metadata:** uploaded and imported photos are re-encoded, which strips
   EXIF data such as GPS location and camera details.
5. **No tracking:** the public site sets no cookies and loads nothing from
   third parties. The admin page stores its session token in the browser's
   `localStorage`.
6. **AI processing:** with n8n configured, each student's About text is sent to
   the LLM provider (Groq or OpenRouter) for rewriting. Check that provider's
   data-use terms fit your institution's policy.

If registration numbers shouldn't be public at all, remove `regNo` from
`mapRow()` in `server/students.js` and from the profile in `index.html` /
`src/ui/profileOverlay.js`. The admin reads the same public list endpoint, so it
would then need a separate admin-only endpoint to show them.

---

## Operating securely

- Use a long, unique `ADMIN_PASSWORD`; keep `TOKEN_SECRET` Render-generated.
- Rotate both when an admin leaves ([recipes.md](recipes.md#change-the-admin-password--sign-everyone-out)).
- Sign out of the admin on shared computers.
- Keep dependencies current: `npm audit` and `npm outdated`, then test
  ([CONTRIBUTING.md](../CONTRIBUTING.md)).
- Keep the repository free of real student data; `.data/` and `.env` are
  gitignored for that reason.

## Reporting a vulnerability

Don't open a public issue. Use GitHub's private reporting (**Security →
Report a vulnerability** on the repository, if enabled) or contact the
maintainer directly, with steps to reproduce.
