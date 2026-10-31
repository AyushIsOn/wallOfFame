# Troubleshooting

Find the symptom, check the cause, apply the fix. Messages in `code` are what the
app actually prints or shows.

- [Local setup](#local-setup)
- [The wall](#the-wall)
- [Admin and sign-in](#admin-and-sign-in)
- [Imports](#imports)
- [Photos](#photos)
- [AI enrichment (n8n)](#ai-enrichment-n8n)
- [Render](#render)
- [Debugging tools](#debugging-tools)

---

## Local setup

| Symptom | Cause | Fix |
|---|---|---|
| `npm install` fails on `xlsx` | No access to `cdn.sheetjs.com`, where the maintained SheetJS build is downloaded from | Allow that host (proxy/firewall), then retry |
| `npm install` fails building `sharp` | Unsupported platform or old Node | Use Node 20.12+ (22 recommended) on a 64-bit OS |
| `Failed to start: DATABASE_URL is not set and PGlite is not installed…` | Installed with `--omit=dev` (PGlite is a dev dependency) | Run `npm install`, or set `DATABASE_URL` |
| `Error: listen EADDRINUSE: address already in use :::3000` | Something already uses port 3000 (often a second `npm run dev:server`) | Stop it, or set `PORT=3001` (then update the proxy in `vite.config.js`) |
| `http://localhost:3000` shows `The frontend isn't built yet…` | `dist/` doesn't exist | Use `npm run dev` (:5173) while developing, or `npm run build` first |
| Settings in `.env` are ignored | A real environment variable with the same name is set, and it wins; or `.env` isn't in the folder you start from | `echo $ADMIN_PASSWORD`; start the server from the repo root |
| `[env] .env found but Node vX can't load it; use Node 20.12 or newer.` | Node older than 20.12 | Upgrade Node |

## The wall

| Symptom | Cause | Fix |
|---|---|---|
| `Couldn't load students right now. Please refresh the page.` | `GET /api/students` failed (server down, database error) | Check `/api/health` and the server log |
| Wall stays black, no message | Still loading, or WebGL is unavailable | Wait a second; check the browser console; try another browser. The list view (bottom-left icon) works without WebGL. |
| `npm run dev` shows the 25 sample students although your database has others | The API server isn't running, so the dev build fell back to `data.js` | Start `npm run dev:server` |
| Filters show an option that gives no results | Shouldn't happen: options come from the data. A search may also be active | Clear the search (× or Esc) |
| A new photo doesn't appear | Browser shows the old page | Refresh; photo URLs change on every upload |
| The same student appears twice on screen | Normal when there are fewer students than tiles on screen (under about 64) | – |
| A tile shows initials, not a photo | The student has no photo, or it failed to load | Upload one in the admin |

## Admin and sign-in

| Symptom | Cause | Fix |
|---|---|---|
| `Invalid password` locally | The password is `ADMIN_PASSWORD` from `.env` (`change-me` in the example), or `admin` if unset | Check `.env`, restart the server after editing it |
| `Invalid password` on Render, every time | `ADMIN_PASSWORD` isn't set; the log shows `[auth] ADMIN_PASSWORD is not set: admin login is DISABLED until you set it.` | Set it in Render → Environment |
| `Too many attempts. Try again later.` | 10 failed logins from your IP within 15 minutes | Wait 15 minutes (or restart the server) |
| `Session expired — sign in again.` | The 12-hour token expired, or `TOKEN_SECRET` changed (including restarts in production without a fixed `TOKEN_SECRET`) | Sign in again; set `TOKEN_SECRET` permanently |
| Signed out after every Render restart | `TOKEN_SECRET` not set; the log shows `[auth] TOKEN_SECRET is not set…` | Set it (the blueprint generates one) |

## Imports

| Symptom | Cause | Fix |
|---|---|---|
| `No students found. The first row must be the headers…` | No header matches Name, or the headers aren't in row 1 | Put headers in the first row; name the column `Name` |
| `Could not read that file…` | Not a spreadsheet, or damaged | Re-save as `.xlsx` or `.csv` |
| `File too large (max 15MB)` | Sheet over 15 MB (usually embedded images) | Remove embedded images; use a Photo URL column |
| A column's data is missing after import | Header not recognised | Rename it (see [admin-guide.md](admin-guide.md#1-prepare-the-sheet)) or [add an alias](recipes.md#accept-another-spreadsheet-header) |
| Duplicates after re-importing | Those rows have no Reg No | Add Reg Nos; delete the duplicates |
| Year looks wrong | See the [year rules](data-model.md#year-values); ranges become the last year | Use a single year if that's not what you want |
| Import seems stuck | Each row waits for the AI (up to 20 s) and photo download (up to 20 s) | Wait, or import in batches of about 100 rows |
| Bios didn't change on re-import | The About was the same as last time, so bio and tags were kept on purpose | Change the About text, or edit the bio in the admin |

## Photos

| `photoErrors` message | Cause | Fix |
|---|---|---|
| `photo link returned a web page, not an image (is the file shared publicly?)` | Drive/OneDrive file isn't shared "Anyone with the link", or it's a SharePoint (work/school) link | Share it publicly, or upload by hand |
| `photo fetch failed (404)` / `(403)` | Wrong link, or access denied | Open the link in a private browser window to test |
| `photo fetch failed (fetch failed)` | Host unreachable or DNS failure | Check the URL |
| `photo timed out` | Host took more than 20 s | Try again, or upload by hand |
| `photo image too large` | Over 20 MB | Use a smaller file |
| `photo not an http(s) URL` | Cell has text or a local path | Use a full `https://` link |
| `photo Input buffer contains unsupported image format` | The link downloads something that isn't an image sharp can read | Check the link points at the image itself |
| Upload in the admin: `Invalid or unsupported image file` | Not an image sharp can read (e.g. HEIC from iPhones, PDF) | Convert to JPG or PNG |

## AI enrichment (n8n)

| Symptom | Cause | Fix |
|---|---|---|
| Bios are just the About cut to 256 characters | Fallback in use: `N8N_TAGS_WEBHOOK_URL` unset, the webhook failed, or it took over 20 s | Test the webhook with `curl` ([n8n/README.md](../n8n/README.md#test)); check n8n's execution log |
| Works in n8n's editor but not from the app | Using the *Test* URL, or the workflow isn't active | Activate it and use the *Production* URL |
| Some rows AI-written, others not | LLM rate limit hit during a big import (about 30 requests/minute on Groq's free tier) | Import in smaller batches, or use a paid tier |
| Tags in odd formats | Prompt drift | Tighten the prompt in the LLM node |

## Render

| Symptom | Cause | Fix |
|---|---|---|
| Build fails at `npm ci` | `package-lock.json` out of sync with `package.json` | Run `npm install` locally, commit the lockfile |
| `cannot have more than one active free tier database` | A workspace can have only one free Postgres | Reuse it, or upgrade (`render.yaml` doesn't create one) |
| Data disappeared after a deploy | `DATABASE_URL` wasn't set, so PGlite wrote to the ephemeral disk | Set `DATABASE_URL`; the old data is gone |
| Database suddenly unreachable after about a month | The free Postgres expired (30 days) | Upgrade it within the 14-day grace period ([deployment.md](deployment.md#backups-and-the-free-tier)) |
| SSL errors connecting to Postgres | Server doesn't accept SSL | `PGSSL=false` |
| First page load takes about a minute | Free web service woke up from sleep | Expected on the free plan |
| `[db] idle client error: …` in the log | The database restarted or dropped a connection | Usually harmless; the pool reconnects |
| GET FEATURED doesn't link after setting the variable | `VITE_*` values are read at build time | Manual Deploy → Deploy latest commit |

## Debugging tools

| Tool | Use |
|---|---|
| `/api/health` | Is the server up? |
| `/?debug=1` | Exposes `window.__wall` (e.g. `__wall.cache.liveTextureCount`, `__wall.active.length`, `__wall.stride`) |
| `/?seed=2000` | Renderer stress test with 2,000 cloned sample students; no API needed |
| Server log | Startup messages (`[db]`, `[auth]`, `[server]`) and every 500 error with its stack |
| Browser console | Admin import logs all photo errors with `Photo errors:` |
