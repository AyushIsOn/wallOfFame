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

// Keyword fallback for link columns whose header is a form question.
const URL_FIELD_KEYWORDS = {
  imageUrl: /\b(photo|photograph|image|picture|pic|headshot)\b/,
  linkedin: /\blinkedin\b/,
  certificate: /\b(certificate|cert)\b/,
  website: /\b(website|portfolio|github)\b/,
};

// Header -> comparable key: lowercase, punctuation as spaces, single spaces.
// So "Reg No.", "REG-NO" and "Name *" match the aliases "reg no" and "name".
const norm = (h) =>
  String(h)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// Year / batch cell -> a single year. Ranges resolve to their LAST year (the
// passing year): "2021-2025" -> 2025, "2021-25" -> 2025, "2023-24" -> 2024.
// Anything without a plausible year (1950-2100) -> null.
export const parseYear = (raw) => {
  const text = String(raw ?? "").trim();
  const range = text.match(/((?:19|20)\d{2})\s*[-–—/]\s*(\d{2}|\d{4})\b/);
  let year = null;
  if (range) {
    const start = Number(range[1]);
    const end = range[2].length === 2 ? Number(range[1].slice(0, 2) + range[2]) : Number(range[2]);
    // A real batch range moves forward by at most 10 years; otherwise this is
    // something like a date ("2024-01"), so keep the first year.
    year = end >= start && end - start <= 10 ? end : start;
  } else {
    const single = text.match(/(?:19|20)\d{2}/);
    if (single) year = Number(single[0]);
  }
  return year && year >= 1950 && year <= 2100 ? year : null;
};

// Turn common Google Drive / OneDrive share links into a direct-download URL.
// (Requires the shared file to be "anyone with the link" accessible.)
const directImageUrl = (url) => {
  const g = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]{20,})/);
  if (g) return `https://drive.google.com/uc?export=download&id=${g[1]}`;
  if (/1drv\.ms|onedrive\.live\.com|sharepoint\.com/i.test(url)) {
    const b64 = Buffer.from(url).toString("base64").replace(/=+$/, "").replace(/\//g, "_").replace(/\+/g, "-");
    return `https://api.onedrive.com/v1.0/shares/u!${b64}/root/content`;
  }
  return url;
};

const rowToStudent = (row) => {
  const lower = {};
  for (const [k, v] of Object.entries(row)) lower[norm(k)] = v;

  const pick = (field) => {
    for (const alias of ALIASES[field]) {
      const v = lower[norm(alias)];
      if (v !== undefined && String(v).trim() !== "") return String(v).trim();
    }
    // Form exports use the question as the header ("Upload your photo",
    // "Your LinkedIn profile"). For link fields only, fall back to any header
    // containing a keyword, and only accept a value that is actually a URL.
    const keywords = URL_FIELD_KEYWORDS[field];
    if (keywords) {
      for (const [header, v] of Object.entries(lower)) {
        const value = String(v).trim();
        if (keywords.test(header) && /^https?:\/\//i.test(value)) return value;
      }
    }
    return undefined;
  };

  const year = parseYear(pick("year"));
  const tagsRaw = pick("tags");
  const tags = tagsRaw
    ? tagsRaw.split(/[,;|/]/).map((t) => t.trim().toUpperCase()).filter(Boolean).slice(0, 4)
    : [];
  const type = pick("type") || "";
  const category = pick("category") || type;

  return {
    name: pick("name") || "",
    year,
    regNo: pick("regNo") || "",
    department: (pick("department") || "").toUpperCase(),
    type: type.toUpperCase(),
    // undefined when the sheet says nothing about it: a new student then gets
    // "others", and an existing student keeps their category on re-import.
    category: category ? category.toLowerCase() : undefined,
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
