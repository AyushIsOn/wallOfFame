// Database layer.
//
// Production (Render): real PostgreSQL via `pg`, configured by DATABASE_URL.
// Local/dev/test: PGlite (in-process Postgres, same SQL) so no server is
// needed. Both expose the same query(text, params) -> { rows } interface.

import { projects } from "../data.js";

let _query;
let _close = async () => {};

export async function initDb() {
  if (process.env.DATABASE_URL) {
    const { default: pg } = await import("pg");
    const useSsl = process.env.PGSSL !== "false" && !/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL);
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: useSsl ? { rejectUnauthorized: false } : false,
    });
    // Without this listener, an error on an IDLE pooled connection (e.g. the
    // database restarting for maintenance) is an unhandled 'error' event and
    // crashes the process. The pool replaces the broken client by itself.
    pool.on("error", (err) => console.error("[db] idle client error:", err.message));
    _query = (text, params) => pool.query(text, params);
    _close = () => pool.end();
  } else {
    let PGlite;
    try {
      ({ PGlite } = await import("@electric-sql/pglite"));
    } catch {
      throw new Error(
        "DATABASE_URL is not set and PGlite is not installed. Set DATABASE_URL, " +
          "or install dev dependencies (npm install) to use the local in-process database."
      );
    }
    const { mkdirSync } = await import("node:fs");
    const dir = process.env.PGLITE_DIR || "./.data/pg";
    mkdirSync(dir, { recursive: true });
    const db = new PGlite(dir);
    await db.waitReady;
    _query = (text, params) => db.query(text, params);
    _close = () => db.close();
  }
  await migrate();
  if (process.env.SEED_SAMPLE_DATA !== "false") await seedIfEmpty();
}

export const query = (text, params) => _query(text, params);

// Close the pool / local database (used on shutdown).
export const closeDb = () => _close();

async function migrate() {
  await query(`
    CREATE TABLE IF NOT EXISTS students (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      year        INTEGER,
      reg_no      TEXT,
      department  TEXT,
      type        TEXT,
      category    TEXT,
      duration    TEXT,
      stipend     TEXT,
      bio         TEXT,
      tags        JSONB DEFAULT '[]'::jsonb,
      linkedin    TEXT DEFAULT '#',
      website     TEXT DEFAULT '#',
      certificate TEXT DEFAULT '',
      image_url   TEXT,
      thumb_url   TEXT,
      image       BYTEA,
      image_type  TEXT,
      thumb       BYTEA,
      thumb_type  TEXT,
      position    INTEGER DEFAULT 0,
      created_at  TIMESTAMPTZ DEFAULT now(),
      updated_at  TIMESTAMPTZ DEFAULT now()
    );
  `);
  // Additive, idempotent column changes go here (safe to re-run every boot).
  // Import bookkeeping, never exposed by the API:
  //   about_source = the raw About text the current bio was generated from
  //   photo_source = the Photo URL the current photo was imported from
  // A re-import skips the AI call / photo download when these are unchanged.
  await query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS about_source TEXT`);
  await query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS photo_source TEXT`);
}

const toThumb = (url) => {
  if (!url) return null;
  const base = url.split("/").pop().replace(/\.[^.]+$/, "");
  return `/thumbs/${base}.webp`;
};

// Seed the sample dataset once, so a fresh deploy isn't empty.
async function seedIfEmpty() {
  const { rows } = await query("SELECT COUNT(*)::int AS n FROM students");
  if (rows[0].n > 0) return;

  let i = 0;
  for (const p of projects) {
    await query(
      `INSERT INTO students
        (name, year, reg_no, department, type, category, duration, stipend, bio, tags, linkedin, website, certificate, image_url, thumb_url, position)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16)`,
      [
        p.title,
        p.year ?? null,
        p.regNo ?? null,
        p.department ?? null,
        p.type ?? null,
        (p.type || "others").toLowerCase(),
        p.duration ?? null,
        p.stipend ?? null,
        p.bio ?? "",
        JSON.stringify(Array.isArray(p.tags) ? p.tags : []),
        p.socials?.linkedin ?? "#",
        p.socials?.website ?? "#",
        p.certificate ?? "",
        p.image ?? null,
        toThumb(p.image),
        i++,
      ]
    );
  }
  console.log(`[db] seeded ${projects.length} sample students`);
}
