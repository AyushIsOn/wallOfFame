# Changelog

Notable changes, newest first. The project has no version releases; entries are
grouped by pull request and date. Format based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased: PR #32 `fix/finish-hardening` (October 2026)

> **Deploy note:** set `ADMIN_PASSWORD` on Render before deploying. In
> production an unset password now disables admin login instead of
> defaulting to `admin`.

### Security
- Fixed stored XSS on the public wall: the profile name was inserted with
  `innerHTML`, and filter pills interpolated department values as HTML. Both
  now render as text.
- Social and certificate links accept only `http(s)` and `mailto` (blocks
  `javascript:` links).
- Admin table escapes tags and thumbnail URLs.
- Content-Security-Policy (`script-src 'self'`), `nosniff`, `Referrer-Policy`;
  the admin is protected against framing; `X-Powered-By` removed.
- Production refuses default credentials (`ADMIN_PASSWORD`, `TOKEN_SECRET`);
  constant-time password check; login rate limit of 10 failures per IP per 15
  minutes.
- `trust proxy` is 1 on Render and 0 elsewhere (`TRUST_PROXY` to override), so
  client IPs can't be spoofed.
- Dependencies: `npm audit fix`; `xlsx` replaced with the maintained SheetJS
  0.20.3 build. `npm audit` now reports 0 vulnerabilities.
- 500 responses no longer include internal error messages.

### Fixed
- Students without a photo were invisible black tiles; they now get an
  initials card on the wall and an initials placeholder on the profile.
- The wall no longer shows the sample students for a moment before the real
  data loads. In production, a failed load shows an error instead of fake
  students.
- Large walls showed each student about twice per screen; from 64 students a
  wider, coprime row stride is used.
- Search × left a hidden search filter active; closing now clears it.
- Category filters offered options with no students; all options now come from
  the data.
- Social links without a URL opened a second copy of the site; they're hidden.
- The role line read " at TAG" when the type was empty.
- Year ranges were parsed as `20212025`; `2021-2025`, `2021-25` and `2023-24` now
  give the passing year, and dates keep their year.
- Re-importing a sheet overwrote admin edits and re-downloaded every photo:
  blank cells now keep values, an unchanged About keeps the bio/tags and skips
  the AI call, an unchanged Photo URL isn't downloaded again.
- **Generate** in the admin silently created the student; it now previews tags
  without saving.
- `.env` was documented but never loaded; `server/env.js` loads it.
- An error on an idle Postgres connection crashed the server; the pool now has
  an error handler.
- Photo downloads and the n8n call could hang an import forever; both time out
  after 20 seconds. A private Drive/OneDrive link now reports a clear error.
- The local tag fallback matched word fragments ("built" → `UI`).
- Bad JSON returned 500 (now 400); unknown `/api` routes returned HTML (now
  JSON 404); invalid years and `socials: null` caused database errors.
- A re-uploaded photo could show the old cached version for five minutes;
  photo URLs are now versioned (`?v=`).
- The wall kept rendering while hidden behind the list view.
- Right-click on a tile opened a profile; the context menu was disabled on the
  whole page; the header logo wasn't tappable on touch screens.
- The closed profile overlay was still reachable with Tab.
- The admin's delete errors were swallowed; an expired session is now detected
  on load; import status names the students whose photos failed.

### Added
- `SEED_SAMPLE_DATA=false` to start a deployment without the sample students.
- `VITE_GET_FEATURED_URL` turns the header's GET FEATURED into a link.
- Header matching ignores punctuation (`Reg No.`, `Name *`); form-question
  headers work for photo, LinkedIn, certificate and website columns.
- Clear 400 errors for unreadable files and sheets without a Name column.
- Graceful shutdown on `SIGTERM`/`SIGINT`; a clear message when PGlite isn't
  installed or `dist/` isn't built.
- Long-term caching for hashed assets and versioned photos.
- Profile is an accessible dialog (`role="dialog"`, focus management).
- Favicon, description and Open Graph tags; the admin is `noindex`.
- `engines: node >=20.12`; `render.yaml` builds with `npm ci`.
- Database columns `about_source` and `photo_source` (added automatically on boot).

### Documentation
- New README, documentation index and guides in `docs/`: getting started,
  admin guide, deployment, configuration, API, architecture, data model, code
  reference, recipes, security, troubleshooting, roadmap; real screenshots; an
  example import sheet.
- `HANDOVER.md` rewritten as a handover brief; `CONTEXT.md`,
  `PROJECT_OVERVIEW.md` and `DEPLOY.md` merged into the new docs.
- Academic material moved to `docs/academic/` with facts corrected:
  report prompt, viva Q&A, flowcharts (as built, plus the original vision).
- `CHANGELOG.md`, `CONTRIBUTING.md`; `AGENTS.md` rewritten.

## July 2026

- **#31, #30** (Jul 31) Added `HANDOVER.md`, a line-by-line engineering reference.
- **#29** (Jul 9) List view: removed the line above the first year group.
- **#28** GET FEATURED arrow aligned with the text.
- **#27, #26** Card labels kept legible over the hover glow (label colour lightened).
- **#25** Profile: socials clipping, certificate colour, spacing, close icon, arrow.
- **#24** Profile uses Rokkitt for name and bio.
- **#23, #22** Profile card rebalanced and sized to its content.
- **#21** List view: removed a redundant top line; fixed the toggle highlight offset.
- **#20, #19, #18** List view: three-column rows, type pill, compact rows, header spacing.
- **#17, #16** List view review fixes (blur, hover, icon, header).
- **#15** List view redesigned: year-grouped, phantom.land-style.
- **#14** Fixed: a tile click could open the wrong student (texture cache identity).
- **#13** (Jul 1) Docs: project overview, roadmap and architecture Q&A.

## June 2026

All merged on June 30:

- **#12** n8n enrichment workflow (About → bio + tags) and setup docs; OneDrive links.
- **#11** Admin UI redesign (phantom-inspired).
- **#10** Excel-first admin: upload a sheet, template, photos from Photo URLs (Drive link conversion).
- **#9** Sharper grid lines and glow; Render free-tier database fix (set `DATABASE_URL` manually).
- **#8** Symmetric four-corner tile layout, white names.
- **#7** Admin dashboard and backend: Express, Postgres/PGlite, Excel import, photo upload, tags, Render config.
- **#6, #5** Sharp single-pass rendering: fisheye in the vertex shader, no mipmaps, in-cell hover glow.
- **#4, #3** Hover glow and visual fixes (superseded by #5/#6).
- **#2** Virtualised, texture-streaming wall that scales to thousands of photos; thumbnail pipeline.
- **#1** Static prototype refactored into modules; filters, search and profile fixed; faster load.

## September 2025

- Initial commit: the static prototype.
