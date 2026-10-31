// Wall of Fame server: serves the built frontend + admin, and the JSON API
// (public student data + images, admin CRUD / Excel import / image upload /
// tag generation). One service, deployable as a single Render Web Service.

import "./env.js"; // must stay first: loads .env before modules read process.env
import express from "express";
import multer from "multer";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { initDb, closeDb } from "./db.js";
import { login, requireAuth, loginRateLimit, recordLoginFailure, clearLoginFailures } from "./auth.js";
import {
  listStudents,
  getStudent,
  getByRegNo,
  getImportState,
  createStudent,
  updateStudent,
  deleteStudent,
  getImageBlob,
  setImageBlob,
} from "./students.js";
import { processImage, fetchRemoteImage } from "./images.js";
import { parseWorkbook } from "./excel.js";
import { generateTags, enrichAbout } from "./tags.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "..", "dist");
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const app = express();
app.disable("x-powered-by");

// Number of reverse-proxy hops in front of the app, so req.ip is the client IP
// (used by the login rate limit). Render sets RENDER=true and has one hop.
// Trusting more hops than really exist would let clients spoof their IP, so
// the default elsewhere is 0. Override with TRUST_PROXY=<hops>.
app.set("trust proxy", Number(process.env.TRUST_PROXY ?? (process.env.RENDER ? 1 : 0)));

// Security headers. The CSP allows only this origin's scripts (no inline
// script, no eval) as a second line of defence against injected markup.
// Inline style attributes are allowed: index.html and the UI use them.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");
app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  });
  // The admin must never be framed (clickjacking). The public wall may be
  // embedded, e.g. in the college website.
  const isAdmin = req.path === "/admin" || req.path === "/admin.html" || req.path.startsWith("/api/admin");
  if (isAdmin) {
    res.set("Content-Security-Policy", `${CSP}; frame-ancestors 'none'`);
    res.set("X-Frame-Options", "DENY");
  } else {
    res.set("Content-Security-Policy", CSP);
  }
  next();
});

app.use(express.json({ limit: "2mb" }));

// Any :id must be a positive integer; otherwise 404 (avoids DB cast errors).
app.param("id", (req, res, next, val) => {
  if (!/^\d+$/.test(val)) return res.status(404).json({ error: "Not found" });
  next();
});

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---- Public API ----
app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/students", wrap(async (_req, res) => {
  res.json(await listStudents());
}));

const sendBlob = (which) =>
  wrap(async (req, res) => {
    const blob = await getImageBlob(req.params.id, which);
    if (!blob) return res.status(404).end();
    res.set("Content-Type", blob.type || "image/webp");
    // URLs from the API carry ?v=<updated_at>, which changes whenever the photo
    // does, so a versioned URL can be cached for good.
    res.set("Cache-Control", req.query.v ? "public, max-age=31536000, immutable" : "public, max-age=300");
    res.send(Buffer.from(blob.data));
  });

app.get("/api/students/:id/image", sendBlob("image"));
app.get("/api/students/:id/thumb", sendBlob("thumb"));

// ---- Admin auth ----
app.post("/api/admin/login", loginRateLimit, (req, res) => {
  const token = login(req.body?.password);
  if (!token) {
    recordLoginFailure(req.ip);
    return res.status(401).json({ error: "Invalid password" });
  }
  clearLoginFailures(req.ip);
  res.json({ token });
});

// ---- Admin CRUD (protected) ----
app.post("/api/admin/students", requireAuth, wrap(async (req, res) => {
  res.status(201).json(await createStudent(req.body || {}));
}));

app.put("/api/admin/students/:id", requireAuth, wrap(async (req, res) => {
  const student = await updateStudent(req.params.id, req.body || {});
  if (!student) return res.status(404).json({ error: "Not found" });
  res.json(student);
}));

app.delete("/api/admin/students/:id", requireAuth, wrap(async (req, res) => {
  await deleteStudent(req.params.id);
  res.json({ ok: true });
}));

// Image upload -> resize -> store full + thumb.
app.post("/api/admin/students/:id/image", requireAuth, upload.single("image"), wrap(async (req, res) => {
  const student = await getStudent(req.params.id);
  if (!student) return res.status(404).json({ error: "Not found" });
  if (!req.file) return res.status(400).json({ error: "No image uploaded" });
  let processed;
  try {
    processed = await processImage(req.file.buffer);
  } catch {
    return res.status(400).json({ error: "Invalid or unsupported image file" });
  }
  await setImageBlob(req.params.id, processed.full, processed.thumb);
  res.json(await getStudent(req.params.id));
}));

// Generate tags from the student's bio (n8n or local fallback).
app.post("/api/admin/students/:id/tags", requireAuth, wrap(async (req, res) => {
  const student = await getStudent(req.params.id);
  if (!student) return res.status(404).json({ error: "Not found" });
  const tags = await generateTags(req.body?.about || student.bio);
  const updated = await updateStudent(req.params.id, { tags });
  res.json({ tags: updated.tags });
}));

// Stateless enrich: rewrite an about text into { bio, tags } WITHOUT saving,
// so the admin can review the AI bio before committing it.
app.post("/api/admin/enrich", requireAuth, wrap(async (req, res) => {
  res.json(await enrichAbout(req.body?.about || ""));
}));

// On re-import, only cells that have a value update the student; blank cells
// keep what's there. (Form-response sheets are cumulative and often lack
// columns the admin fills in later, e.g. Certificate.)
const nonBlankFields = (rec, existing) => {
  const out = {};
  for (const [key, value] of Object.entries(rec)) {
    if (key === "socials" || key === "imageUrl") continue;
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value) && !value.length) continue;
    out[key] = value;
  }
  const linkedin = rec.socials.linkedin !== "#" ? rec.socials.linkedin : null;
  const website = rec.socials.website !== "#" ? rec.socials.website : null;
  if (linkedin || website) {
    out.socials = {
      linkedin: linkedin || existing.socials.linkedin,
      website: website || existing.socials.website,
    };
  }
  return out;
};

// Excel/CSV import -> create students (auto-tags rows that have none, and
// fetches a Photo URL column if present). Idempotent for rows with a Reg No:
// those update the existing student (non-blank cells only) instead of
// creating a duplicate, and an unchanged About skips the AI call.
app.post("/api/admin/import", requireAuth, upload.single("file"), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  let records;
  try {
    records = parseWorkbook(req.file.buffer);
  } catch {
    return res.status(400).json({ error: "Could not read that file. Upload an .xlsx, .xls or .csv sheet." });
  }
  if (!records.length) {
    return res.status(400).json({
      error: "No students found. The first row must be the headers, and one header must be Name (or Student Name / Full Name).",
    });
  }
  let imported = 0;
  let updated = 0;
  let photos = 0;
  let photosSkipped = 0;
  const photoErrors = [];
  for (const rec of records) {
    const existing = rec.regNo ? await getByRegNo(rec.regNo) : null;
    const last = existing ? await getImportState(existing.id) : { aboutSource: null, photoSource: null };

    if (rec.bio) {
      const about = rec.bio; // raw text from the sheet
      if (existing && last.aboutSource === about) {
        // Same About as last import: keep the current bio (including any
        // edits made in the admin) and skip the AI call.
        delete rec.bio;
      } else {
        try {
          const e = await enrichAbout(about);
          if (e.bio) rec.bio = e.bio; // polished, concise first-person bio
          // New or changed About: tags follow it, unless the sheet has its own.
          if (!rec.tags.length) rec.tags = e.tags;
        } catch {
          /* keep the original bio/tags */
        }
        rec.aboutSource = about;
      }
    }

    const student = existing
      ? (updated++, await updateStudent(existing.id, nonBlankFields(rec, existing)))
      : (imported++, await createStudent(rec));

    if (rec.imageUrl) {
      if (existing?.image && last.photoSource === rec.imageUrl) {
        photosSkipped++; // same Photo URL as last import: keep the stored photo
      } else {
        try {
          const buf = await fetchRemoteImage(rec.imageUrl);
          const { full, thumb } = await processImage(buf);
          await setImageBlob(student.id, full, thumb, { photoSource: rec.imageUrl });
          photos++;
        } catch (e) {
          photoErrors.push(`${rec.name}: photo ${e.message}`);
        }
      }
    }
  }
  res.json({ imported, updated, total: records.length, photos, photosSkipped, photoErrors });
}));

// Unknown API routes get a JSON 404 (not the HTML page from express).
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

// ---- Static frontend ----
// Vite puts content-hashed files in /assets, so they can be cached for good.
// Everything else (HTML, fonts, sample photos) is revalidated via ETag.
app.use(
  express.static(distDir, {
    setHeaders: (res, filePath) => {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.set("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  })
);
const NOT_BUILT =
  "The frontend isn't built yet. Run `npm run build` (then reload), or use `npm run dev` for the hot-reload dev server on http://localhost:5173.";
const sendPage = (file) => (_req, res) => {
  const full = path.join(distDir, file);
  if (!existsSync(full)) return res.status(503).type("text/plain").send(NOT_BUILT);
  res.sendFile(full);
};
// public/ is copied into dist/ by the build. Serving it as a fallback makes the
// sample photos and fonts available before a build too (npm run dev:server).
app.use(express.static(path.join(__dirname, "..", "public")));
app.get("/admin", sendPage("admin.html"));
app.get("/", sendPage("index.html"));

// ---- Error handler ----
app.use((err, _req, res, _next) => {
  if (err && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "File too large (max 15MB)" });
  }
  if (err && err.name === "MulterError") {
    return res.status(400).json({ error: err.message });
  }
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Request body is not valid JSON" });
  }
  // Other client errors raised by Express/body-parser (e.g. 413 body too large).
  const status = err?.status || err?.statusCode;
  if (status >= 400 && status < 500) {
    return res.status(status).json({ error: err.expose ? err.message : "Bad request" });
  }
  // Unexpected: log the details, but don't send internals to the client.
  console.error(err);
  res.status(500).json({ error: "Server error" });
});

const PORT = process.env.PORT || 3000;
initDb()
  .then(() => {
    const server = app.listen(PORT, () => console.log(`Wall of Fame server on :${PORT}`));
    if (!existsSync(path.join(distDir, "index.html"))) console.warn(`[server] ${NOT_BUILT}`);

    // Graceful shutdown (Render sends SIGTERM on every deploy; Ctrl-C locally):
    // stop accepting requests, let in-flight ones finish, then close the DB.
    const shutdown = (signal) => {
      console.log(`[server] ${signal} received, shutting down`);
      setTimeout(() => process.exit(1), 10_000).unref();
      server.close(() => closeDb().finally(() => process.exit(0)));
    };
    process.once("SIGTERM", shutdown);
    process.once("SIGINT", shutdown);
  })
  .catch((err) => {
    console.error("Failed to start:", err.message || err);
    process.exit(1);
  });

export default app;
