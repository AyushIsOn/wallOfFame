// Student data access + mapping to the shape the frontend/store expects.

import { query } from "./db.js";

// Columns to select for listing (never the heavy bytea blobs).
const LIST_COLS = `
  id, name, year, reg_no, department, type, category, duration, stipend, bio,
  tags, linkedin, website, certificate, image_url, thumb_url, position,
  (image IS NOT NULL) AS has_image, (thumb IS NOT NULL) AS has_thumb
`;

const parseTags = (t) => {
  if (Array.isArray(t)) return t;
  if (typeof t === "string") {
    try {
      return JSON.parse(t);
    } catch {
      return [];
    }
  }
  return [];
};

// DB row -> public student object consumed by the wall, list and profile.
export const mapRow = (r) => {
  const image = r.image_url || (r.has_image ? `/api/students/${r.id}/image` : null);
  const thumbnail = r.thumb_url || (r.has_thumb ? `/api/students/${r.id}/thumb` : image);
  return {
    id: r.id,
    name: r.name,
    year: r.year,
    regNo: r.reg_no || "",
    department: r.department || "",
    type: r.type || "",
    category: r.category || "others",
    duration: r.duration || "",
    stipend: r.stipend || "",
    bio: r.bio || "",
    tags: parseTags(r.tags),
    socials: { linkedin: r.linkedin || "#", website: r.website || "#" },
    certificate: r.certificate || "",
    image,
    thumbnail,
  };
};

export async function listStudents() {
  const { rows } = await query(`SELECT ${LIST_COLS} FROM students ORDER BY position, id`);
  return rows.map(mapRow);
}

export async function getStudent(id) {
  const { rows } = await query(`SELECT ${LIST_COLS} FROM students WHERE id = $1`, [id]);
  return rows[0] ? mapRow(rows[0]) : null;
}

// Build (columns, placeholders, values) from the frontend shape. Only provided
// fields are included; tags is cast to jsonb.
const buildColumns = (data, { withName }) => {
  const cols = [];
  const ph = [];
  const vals = [];
  let i = 1;
  const add = (col, val, cast = "") => {
    cols.push(col);
    ph.push(`$${i}${cast}`);
    vals.push(val);
    i++;
  };

  if (withName || data.name !== undefined) add("name", data.name || "Unnamed");
  if (data.year !== undefined) add("year", data.year === "" ? null : data.year);
  if (data.regNo !== undefined) add("reg_no", data.regNo);
  if (data.department !== undefined) add("department", data.department);
  if (data.type !== undefined) add("type", data.type);
  if (data.category !== undefined || data.type !== undefined)
    add("category", (data.category || data.type || "others").toLowerCase());
  if (data.duration !== undefined) add("duration", data.duration);
  if (data.stipend !== undefined) add("stipend", data.stipend);
  if (data.bio !== undefined) add("bio", data.bio);
  if (data.tags !== undefined)
    add("tags", JSON.stringify(Array.isArray(data.tags) ? data.tags : []), "::jsonb");
  if (data.socials !== undefined) {
    add("linkedin", data.socials.linkedin || "#");
    add("website", data.socials.website || "#");
  }
  if (data.certificate !== undefined) add("certificate", data.certificate);
  if (data.image_url !== undefined) add("image_url", data.image_url);
  if (data.thumb_url !== undefined) add("thumb_url", data.thumb_url);

  return { cols, ph, vals, next: i };
};

export async function createStudent(data) {
  const { cols, ph, vals } = buildColumns(data, { withName: true });
  const { rows } = await query(
    `INSERT INTO students (${cols.join(", ")}) VALUES (${ph.join(", ")}) RETURNING id`,
    vals
  );
  return getStudent(rows[0].id);
}

export async function updateStudent(id, data) {
  const { cols, ph, vals, next } = buildColumns(data, { withName: false });
  if (!cols.length) return getStudent(id);
  const setSql = cols.map((c, idx) => `${c} = ${ph[idx]}`).join(", ");
  await query(`UPDATE students SET ${setSql}, updated_at = now() WHERE id = $${next}`, [...vals, id]);
  return getStudent(id);
}

export async function deleteStudent(id) {
  await query("DELETE FROM students WHERE id = $1", [id]);
}

export async function getImageBlob(id, which = "image") {
  const col = which === "thumb" ? "thumb" : "image";
  const typeCol = which === "thumb" ? "thumb_type" : "image_type";
  const { rows } = await query(`SELECT ${col} AS data, ${typeCol} AS type FROM students WHERE id = $1`, [id]);
  return rows[0]?.data ? rows[0] : null;
}

export async function setImageBlob(id, full, thumb) {
  await query(
    `UPDATE students
       SET image = $1, image_type = $2, thumb = $3, thumb_type = $4,
           image_url = NULL, thumb_url = NULL, updated_at = now()
     WHERE id = $5`,
    [full.data, full.type, thumb.data, thumb.type, id]
  );
}
