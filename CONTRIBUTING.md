# Contributing

How to change Wall of Fame without breaking it. Setup is in
[docs/getting-started.md](docs/getting-started.md).

- [Workflow](#workflow)
- [Code style](#code-style)
- [Verify your change](#verify-your-change)
- [Documentation](#documentation)
- [Dependencies](#dependencies)
- [Releasing](#releasing)

---

## Workflow

1. Branch from `main`: `<type>/<short-description>`, e.g. `fix/search-clear`,
   `feat/profile-company`, `docs/admin-guide`.
2. Commit in the style the history already uses:
   `<type>(<scope>): <summary>`, e.g. `fix(list-view): remove top border`.
   Types: `feat`, `fix`, `refine`, `revert`, `docs`, `chore`. Scopes: `wall`,
   `profile`, `list-view`, `filters`, `search`, `header`, `admin`, `import`,
   `server`, `deps`.
3. Open a PR into `main` describing **what changed, why, and how you verified
   it**. Mention any new environment variable or deploy step at the top.
4. Never push straight to `main`: Render deploys it automatically.

## Code style

- **Plain modern JavaScript, ES modules, no frameworks.** Think twice before
  adding a dependency; the app has six.
- Match the surrounding code: 2-space indent, double quotes, semicolons, `const`
  by default, small arrow-function helpers.
- Start each file with a short comment saying what it's for. Comment *why*,
  not *what*.
- Use descriptive names, and give complex conditions a named boolean
  (`const showEmpty = store.status !== "loading" && filtered.length === 0`).
- UI pieces are small `init…()` modules in `src/ui/` that read from the store.
- Shared tunables go in `src/config.js`, never as copied numbers.
- Follow the [invariants](docs/code-reference.md#invariants), especially:
  escape all data put into HTML, no inline scripts or handlers (CSP), additive
  idempotent schema changes, drawing and hit-testing share one mapping.

## Verify your change

There is no automated test suite yet (it's roadmap item 1), so run the
checklist below. Use a throwaway database so your normal data isn't touched:

```bash
npm ci && npm run build          # must succeed
npm audit                        # expect 0 vulnerabilities
PGLITE_DIR=.data/verify npm start
```

Then, against http://localhost:3000:

**API**
- [ ] `curl -s localhost:3000/api/health` → `{"ok":true}`
- [ ] A wrong password at `/api/admin/login` → `401`; the right one → a token
- [ ] Import [`docs/examples/import-example.csv`](docs/examples/import-example.csv)
      in the admin → `Imported 3 new, 1 photo saved`; import it again →
      `Imported 0 new, updated 3, 1 photo unchanged`

**Wall** (browser console open: no errors or CSP violations)
- [ ] Drag, hover glow, and a click opens the profile of **the tile you clicked**
- [ ] Go to next person, Esc closes, Tab doesn't reach the closed profile
- [ ] Each filter group; search, then × clears it and everyone returns
- [ ] List view and back; the wall resumes correctly
- [ ] Kabir Singh (from the example sheet) shows an initials tile and profile
- [ ] `/?seed=2000` renders and pans smoothly

**Admin**
- [ ] Sign in; **Generate** fills tags without adding a row
- [ ] Edit + Save, with a photo upload (the new photo shows at once)
- [ ] Delete a student

**Security** (after any change to rendering or the admin): create a hostile
student, check it everywhere, then delete it:

```bash
TOKEN=$(curl -s -X POST localhost:3000/api/admin/login -H 'Content-Type: application/json' \
  -d '{"password":"admin"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
curl -s -X POST localhost:3000/api/admin/students -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"XSS <img src=x onerror=alert(1)>","department":"<b>X</b>","tags":["<i>t</i>"],
       "socials":{"linkedin":"javascript:alert(2)","website":"#"},"certificate":"javascript:alert(3)"}'
```

- [ ] On the wall, list, profile, filters and admin table the markup shows as
      plain text; no alert appears; LinkedIn is hidden; the certificate isn't clickable

Delete `.data/verify` when done.

## Documentation

Update the docs **in the same PR** as the code. When the code and the docs
disagree, the docs are wrong.

| You changed | Update |
|---|---|
| An environment variable | [configuration.md](docs/configuration.md), `.env.example`, `render.yaml` if Render needs it |
| An API route, request or response | [api.md](docs/api.md) |
| A field, the schema, or import behaviour | [data-model.md](docs/data-model.md), and [admin-guide.md](docs/admin-guide.md) if staff notice |
| The renderer or a tunable | [architecture.md](docs/architecture.md), [configuration.md](docs/configuration.md) |
| A file's functions or responsibilities | [code-reference.md](docs/code-reference.md) |
| Something staff see in the admin | [admin-guide.md](docs/admin-guide.md); screenshots in `docs/images/` if the layout changed |
| Deployment | [deployment.md](docs/deployment.md) |
| Anything security-relevant | [security.md](docs/security.md) |
| An error message | [troubleshooting.md](docs/troubleshooting.md) (search for the old text) |
| A limitation added or removed | [roadmap.md](docs/roadmap.md) |
| Anything notable | [CHANGELOG.md](CHANGELOG.md), under *Unreleased* |

Writing style for the docs: short sentences, plain words, real numbers and real
output (run the command and paste what it prints), one term per concept (see
the [glossary](docs/architecture.md#glossary)). Screenshots are 1440×900 WebP.

## Dependencies

- Check: `npm outdated`, `npm audit`.
- Update one package at a time, then run the checklist.
- **three.js:** after an upgrade, check grid-line sharpness, the hover glow and
  click accuracy. The shaders use `fwidth` and a custom `ShaderMaterial`.
- **xlsx** comes from SheetJS's CDN, not npm. To upgrade, change the URL in
  `package.json` (e.g. `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`)
  and run `npm install`.
- **sharp** has native binaries; Render builds them during `npm ci`.

## Releasing

Merging to `main` deploys on Render (`npm ci && npm run build`, then
`node server/index.js`). After it goes live:

1. `/api/health` returns `{"ok":true}`.
2. The wall loads and the admin signs in.
3. The deploy log shows no errors.

To undo: Render → service → **Events** → earlier deploy → **Rollback**.
