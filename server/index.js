// Wall of Fame server: serves the built frontend + admin, and the JSON API
// (public student data + images, admin CRUD / Excel import / image upload /
// tag generation). One service, deployable as a single Render Web Service.

import express from "express";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { initDb } from "./db.js";
import { login, requireAuth } from "./auth.js";
import {
  listStudents,
  getStudent,
  getByRegNo,
  createStudent,
  updateStudent,
  deleteStudent,
  getImageBlob,
  setImageBlob,
} from "./students.js";
import { processImage } from "./images.js";
import { parseWorkbook } from "./excel.js";
import { generateTags } from "./tags.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "..", "dist");
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const app = express();
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
    res.set("Cache-Control", "public, max-age=300");
    res.send(Buffer.from(blob.data));
  });

app.get("/api/students/:id/image", sendBlob("image"));
app.get("/api/students/:id/thumb", sendBlob("thumb"));

// ---- Admin auth ----
app.post("/api/admin/login", (req, res) => {
  const token = login(req.body?.password);
  if (!token) return res.status(401).json({ error: "Invalid password" });
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

// Excel/CSV import -> create students (auto-tags rows that have none).
// Idempotent for rows with a Reg No: an existing match is updated, not duplicated.
app.post("/api/admin/import", requireAuth, upload.single("file"), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const records = parseWorkbook(req.file.buffer);
  let imported = 0;
  let updated = 0;
  for (const rec of records) {
    if (!rec.tags?.length && rec.bio) {
      try {
        rec.tags = await generateTags(rec.bio);
      } catch {
        /* leave empty */
      }
    }
    const existing = rec.regNo ? await getByRegNo(rec.regNo) : null;
    if (existing) {
      await updateStudent(existing.id, rec);
      updated++;
    } else {
      await createStudent(rec);
      imported++;
    }
  }
  res.json({ imported, updated, total: records.length });
}));

// ---- Static frontend ----
app.use(express.static(distDir));
app.get("/admin", (_req, res) => res.sendFile(path.join(distDir, "admin.html")));
app.get("/", (_req, res) => res.sendFile(path.join(distDir, "index.html")));

// ---- Error handler ----
app.use((err, _req, res, _next) => {
  if (err && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "File too large (max 15MB)" });
  }
  if (err && err.name === "MulterError") {
    return res.status(400).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: err.message || "Server error" });
});

const PORT = process.env.PORT || 3000;
initDb()
  .then(() => app.listen(PORT, () => console.log(`Wall of Fame server on :${PORT}`)))
  .catch((err) => {
    console.error("Failed to start:", err);
    process.exit(1);
  });

export default app;
