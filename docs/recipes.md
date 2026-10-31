# Recipes

Step-by-step instructions for common changes. Each recipe lists every file you
need to touch. For what those files contain, see
[code-reference.md](code-reference.md).

**Operations**
- [Remove the sample students](#remove-the-sample-students)
- [Reset the local database](#reset-the-local-database)
- [Change the admin password / sign everyone out](#change-the-admin-password--sign-everyone-out)
- [Point GET FEATURED at your form](#point-get-featured-at-your-form)
- [Embed the wall in another website](#embed-the-wall-in-another-website)

**Data and import**
- [Accept another spreadsheet header](#accept-another-spreadsheet-header)
- [Add a new student field](#add-a-new-student-field)
- [Change the AI prompt or bio length](#change-the-ai-prompt-or-bio-length)
- [Change the category list or order](#change-the-category-list-or-order)

**Look and feel**
- [Tune the wall](#tune-the-wall)
- [Change what a tile shows](#change-what-a-tile-shows)
- [Add or replace sample photos](#add-or-replace-sample-photos)

---

## Remove the sample students

**New deployment:** set `SEED_SAMPLE_DATA=false` before the first boot.

**Already seeded:** the sample students are the ones whose photo is a static
`/img<N>.jpeg` file. This script deletes exactly those through the admin API,
so it needs only the site URL and the admin password:

```bash
BASE=https://<service>.onrender.com PASSWORD='<admin password>' node -e '
const B = process.env.BASE;
(async () => {
  const login = await fetch(B + "/api/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: process.env.PASSWORD }) });
  if (!login.ok) throw new Error("login failed: " + login.status);
  const { token } = await login.json();
  const all = await (await fetch(B + "/api/students")).json();
  const samples = all.filter((s) => /^\/img\d+\.jpeg$/.test(s.image || ""));
  for (const s of samples) await fetch(`${B}/api/admin/students/${s.id}`, { method: "DELETE", headers: { authorization: `Bearer ${token}` } });
  console.log(`Deleted ${samples.length} sample students; ${all.length - samples.length} left.`);
})().catch((e) => { console.error(e.message); process.exit(1); });'
```

Expected output on a freshly seeded database with one real student:
`Deleted 25 sample students; 1 left.` A sample student whose photo you replaced
by upload no longer matches and stays.

If the table becomes empty and `SEED_SAMPLE_DATA` isn't `false`, the samples
come back on the next restart. Set it to `false` once your real students are in.

## Reset the local database

Stop the server, delete `.data/pg` (or your `PGLITE_DIR`), and start it again.
It re-creates the table and re-seeds unless `SEED_SAMPLE_DATA=false`.

## Change the admin password / sign everyone out

| Goal | Change |
|---|---|
| New password, keep current sessions | `ADMIN_PASSWORD` |
| Sign everyone out now | `TOKEN_SECRET` (any new long random string) |
| Both (e.g. the password leaked) | Both |

On Render: service → **Environment** → edit → **Save changes**; the service
restarts. Locally: edit `.env` and restart `npm run dev:server`.

## Point GET FEATURED at your form

Set `VITE_GET_FEATURED_URL` to an `https://` or `mailto:` link, then rebuild.
On Render that means **Manual Deploy → Deploy latest commit** after saving the
variable. The link opens in a new tab. Code: `src/ui/getFeatured.js`.

## Embed the wall in another website

```html
<iframe src="https://<service>.onrender.com/" title="Wall of Fame"
        style="width:100%;height:80vh;border:0" loading="lazy"></iframe>
```

The admin page refuses to be framed; open it directly.

---

## Accept another spreadsheet header

If a sheet's column isn't recognised, add its name to `ALIASES` in
`server/excel.js`, written lowercase with punctuation replaced by spaces. For
example, to accept "Enrollment No.":

```js
regNo: ["reg no", "registration no", /* … */, "enrollment no"],
```

Restart the server. Matching is exact after normalisation, so one alias covers
`Enrollment No.`, `ENROLLMENT-NO` and `enrollment no`. For link columns, the
keyword fallback (`URL_FIELD_KEYWORDS`) may already match; see
[data-model.md → Headers](data-model.md#headers).

## Add a new student field

Example: add **Company** (e.g. "Google") as its own field.

1. **Database:** `server/db.js` → `migrate()`:
   ```js
   await query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS company TEXT`);
   ```
2. **Read/write:** `server/students.js`
   - add `company` to `LIST_COLS`,
   - in `mapRow()`: `company: r.company || "",`
   - in `buildColumns()`: `if (data.company !== undefined) add("company", data.company);`
3. **Import:** `server/excel.js`
   - `ALIASES`: `company: ["company", "organisation", "organization"],`
   - in `rowToStudent()`'s return: `company: pick("company") || "",`
4. **Admin form:** `admin.html` → add `<label>Company<input id="f_company" /></label>`;
   `src/admin/admin.js` → set it in `openModal()` (`$("f_company").value = s.company || ""`)
   and read it in `formData()` (`company: $("f_company").value.trim()`).
5. **Profile:** `index.html` → copy a `.profile-meta-item` block with
   `id="profileCompany"`; `src/ui/profileOverlay.js` → in `fill()`:
   `setText("profileCompany", s.company);`
6. **Sample data (optional):** `data.js` and `normalizeStatic()` in `src/store.js`.
7. **Docs:** add the field to [data-model.md](data-model.md) and the column to
   [admin-guide.md](admin-guide.md).

Restart the server: the column is added on boot, and existing rows get `NULL`,
shown as `""`.

## Change the AI prompt or bio length

The prompt lives in n8n, not in this repo's code: open the workflow → **LLM**
node → **JSON body**. It has the instructions, the example, and the model name.

To change the 256-character bio limit, change it in all three places, or the
shortest one wins:

1. The prompt text in the LLM node ("at most 256 characters"),
2. the **Format bio + tags** node (`.slice(0, 256)`),
3. `server/tags.js`: `.slice(0, 256)` in `enrichAbout()`, and `localBio()` for
   the fallback.

Then re-export the workflow to `n8n/enrich.workflow.json` so the repo matches.

## Change the category list or order

`CATEGORIES` in `src/config.js` only sets the order of the category pills; pills
appear only for categories present in the data. A student's category comes from
the sheet's Category column, or its Type lowercased (`HACKATHON` →
`hackathon`). To show a nicer label or merge spellings (e.g. `hackathon` and
`hackathons`), use one spelling in the sheets, or normalise it in
`rowToStudent()` in `server/excel.js`.

---

## Tune the wall

All in `src/config.js` (reference: [configuration.md](configuration.md#wall-tunables-srcconfigjs)):

| Want | Change |
|---|---|
| Bigger or smaller tiles | `WALL.cellSize` |
| Less or more fisheye | `WALL.distortionK` (0 = flat) |
| Snappier or smoother panning | `WALL.lerpFactor` |
| No zoom-out while dragging | `WALL.dragZoom = 1` |
| Bigger photo inside the tile | `LAYOUT.imageSize` |
| Wider or narrower edge fade | `FADE.start` / `FADE.end` |
| Sharper tiles on big screens | `CARD.size` (uses more GPU memory) |

Hover glow strength is the `0.55` in `src/shaders.js`; grid line brightness is
the `0.22` in `uGrid` in `src/gl/wall.js`. Check sharpness at 100% browser zoom
after any change; see [architecture.md → Sharpness](architecture.md#sharpness)
before touching texture filtering.

## Change what a tile shows

The tile is drawn on a canvas in `src/gl/card.js`:

- `drawTitle()`: name (top-left) and year (top-right),
- `drawTags()`: department (bottom-right) and up to 4 tag pills (bottom-left),
- `drawCard()`: the photo square, then the two functions above.

For example, to show the type instead of the department, change
`student.department` to `student.type` in `drawTags()`. Cards are cached, so
reload the page to see changes. Keep text inside the `LAYOUT` bands, or it
overlaps the photo.

## Add or replace sample photos

1. Put `img<N>.jpeg` in `public/` and add an entry with `image: "/img<N>.jpeg"`
   to `data.js`.
2. Run `npm run thumbs` to create `public/thumbs/img<N>.webp` (512 px).
3. The database is seeded only when it's empty, so reset the local database to
   see new sample students.
