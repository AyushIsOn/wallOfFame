// Parse an uploaded Excel/CSV workbook into student records. Header names are
// matched flexibly (case-insensitive, several common aliases) so teachers can
// use their existing sheet layout.

import * as XLSX from "xlsx";

const ALIASES = {
  name: ["name", "student name", "full name", "student"],
  year: ["year", "batch", "graduation year", "passing year"],
  regNo: ["reg no", "registration no", "registration number", "reg. no", "roll no", "roll number", "regno", "registration"],
  department: ["department", "dept", "branch"],
  type: ["type", "achievement type"],
  category: ["category"],
  duration: ["duration", "period"],
  stipend: ["stipend", "salary", "amount", "package"],
  bio: ["bio", "about", "about section", "description", "details", "achievement", "summary", "what they did"],
  linkedin: ["linkedin", "linkedin url"],
  website: ["website", "portfolio", "url", "link"],
  certificate: ["certificate", "certificate url", "cert", "certificate link"],
  tags: ["tags", "skills"],
  imageUrl: ["photo", "image", "photo url", "image url", "picture", "photo link", "image link", "photo url link"],
};

const norm = (h) => String(h).trim().toLowerCase();

// Turn common Google Drive share links into a direct-download URL.
const directImageUrl = (url) => {
  const m = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]{20,})/);
  return m ? `https://drive.google.com/uc?export=download&id=${m[1]}` : url;
};

const rowToStudent = (row) => {
  const lower = {};
  for (const [k, v] of Object.entries(row)) lower[norm(k)] = v;

  const pick = (field) => {
    for (const alias of ALIASES[field]) {
      const v = lower[alias];
      if (v !== undefined && String(v).trim() !== "") return String(v).trim();
    }
    return undefined;
  };

  const yearRaw = pick("year");
  const year = yearRaw ? parseInt(yearRaw.replace(/\D/g, ""), 10) || null : null;
  const tagsRaw = pick("tags");
  const tags = tagsRaw
    ? tagsRaw.split(/[,;|/]/).map((t) => t.trim().toUpperCase()).filter(Boolean).slice(0, 4)
    : [];
  const type = pick("type") || "";

  return {
    name: pick("name") || "",
    year,
    regNo: pick("regNo") || "",
    department: (pick("department") || "").toUpperCase(),
    type: type.toUpperCase(),
    category: (pick("category") || type || "others").toLowerCase(),
    duration: pick("duration") || "",
    stipend: pick("stipend") || "",
    bio: pick("bio") || "",
    socials: { linkedin: pick("linkedin") || "#", website: pick("website") || "#" },
    certificate: pick("certificate") || "",
    tags,
    imageUrl: pick("imageUrl") ? directImageUrl(pick("imageUrl")) : "",
  };
};

export function parseWorkbook(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  return rows.map(rowToStudent).filter((s) => s.name);
}
