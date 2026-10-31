# Roadmap and known limitations

What the project does not do yet, and the suggested order to tackle it. Status
as of October 2026, after PR #32.

## Before a real launch

These need decisions or accounts, not code:

1. **Use a database that won't expire.** Free Render Postgres is deleted 30 + 14
   days after creation. Upgrade it, and take a first backup
   ([deployment.md](deployment.md#backups-and-the-free-tier)).
2. **Remove the sample students**, or deploy with `SEED_SAMPLE_DATA=false`.
3. **Collect consent** in the submission form and decide which fields are
   public, especially registration numbers and stipends ([security.md](security.md#privacy)).
4. **Connect n8n** so bios are AI-written ([n8n/README.md](../n8n/README.md)).
5. **Set `VITE_GET_FEATURED_URL`** to the submission form.

## Known limitations

| Limitation | Impact | Workaround |
|---|---|---|
| One shared admin password | No per-person accounts or audit log | Share with few people; rotate on staff changes |
| Rows without a Reg No duplicate on re-import | Duplicate students | Always include Reg No |
| Import runs in the request, one row at a time | Large sheets take minutes; the tab must stay open | Batches of about 100 rows |
| Photos stored in Postgres | Database size; Node serves every photo | Fine for a few thousand students |
| Photo URLs from private Microsoft 365 / SharePoint can't be downloaded | Those photos must be uploaded by hand | Make files public, or upload |
| No automated test suite in the repo | Changes are verified by hand ([CONTRIBUTING.md](../CONTRIBUTING.md#verify-your-change)) | Follow the checklist |
| `GET /api/students` has no pagination | One large response at thousands of students | Fine up to a few thousand |
| Certificate field shows "Certificate of Excellence" even with no link | Intentional placeholder for generated certificates, but it can look like a dead link | – |

## Suggested next steps

Roughly in priority order:

| # | Item | Why | Size |
|---|---|---|---|
| 1 | **Automated tests + CI** (API tests with PGlite, a browser smoke test, `npm audit`) | Every change so far was verified by hand | Medium |
| 2 | **Block private IPs for Photo URLs** | Closes the SSRF gap ([security.md](security.md#known-gaps)) | Small |
| 3 | **Bulk actions in the admin** (multi-select delete, "delete samples") | Cleaning up is one row at a time today | Small |
| 4 | **Background import with progress** | Large sheets without a waiting tab; enables retries | Medium |
| 5 | **Per-user admin accounts** (or sign-in with the college's Google/Microsoft accounts) | Accountability and revocation | Large |
| 6 | **Object storage for photos** (S3 / Cloudflare R2) with CDN URLs | Smaller database, faster photos at scale | Medium |
| 7 | **Photo matching by file name** (upload a zip named by Reg No) | Works around private form-upload folders | Medium |
| 8 | **Draft vs published, and manual ordering** | Review imports before they go live; feature students | Medium |

## From the original vision, not built

The early plans (see [academic/flowcharts.md](academic/flowcharts.md)) included
these. They are not in the code:

- **Certificate generation:** upload a template, place the name, generate a PDF
  per student. Today the certificate is just a URL field.
- **Email notifications** to students or the college when an achievement is
  added.
- **First-time setup wizard** (departments, certificate template).
- **Analytics** (views, clicks).
- **Preview before commit** for imports.

## Housekeeping

- `phantom-land/` (11 MB) is a saved copy of the phantom.land website, the design
  reference. The build doesn't use it, and it's third-party content in a public
  repository. Consider removing it from the repo, keeping a link or private copy.
- `liquid-glass/` is a standalone UI experiment kept for later; not used by the app.
- `.commandcode/` holds another AI tool's project notes; not used by the app.
