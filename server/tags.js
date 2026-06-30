// AI enrichment of a student's "about" text: rewrite it into a concise,
// first-person bio AND extract 2-3 tags.
//
// If N8N_TAGS_WEBHOOK_URL is set, the text is POSTed there (your n8n workflow
// runs an LLM via Groq/OpenRouter/OpenAI and returns { bio, tags }). Otherwise
// a local fallback is used (truncate the bio, keyword-extract the tags), so
// imports still work before n8n is wired up.

const KEYWORDS = [
  "AI", "ML", "HCI", "UX", "UI", "DESIGN", "RESEARCH", "NLP", "CV", "ROBOTICS",
  "SECURITY", "CYBERSECURITY", "ALGORITHMS", "BCI", "PSYCHOLOGY", "DATA",
  "CLOUD", "DEVOPS", "BLOCKCHAIN", "IOT", "HARDWARE", "SYSTEMS", "REMOTE",
];
const STOP = new Set(["THE", "AND", "FOR", "WITH", "THAT", "THIS", "FROM", "INTO", "OVER"]);

export function localTags(text) {
  const found = new Set();
  const acronyms = text.match(/\b[A-Z][A-Za-z]*[A-Z][A-Za-z]*(?:'?\d{2,4})?\b/g) || [];
  for (const a of acronyms) {
    const up = a.toUpperCase();
    if (up.length >= 2 && up.length <= 12 && !STOP.has(up)) found.add(up);
    if (found.size >= 3) break;
  }
  if (found.size < 3) {
    const up = text.toUpperCase();
    for (const k of KEYWORDS) {
      if (up.includes(k)) found.add(k);
      if (found.size >= 3) break;
    }
  }
  return [...found].slice(0, 3);
}

// Trim to <= 256 chars at a word boundary (used when no LLM is available).
const localBio = (text) =>
  text.length <= 256 ? text : text.slice(0, 253).replace(/\s+\S*$/, "") + "…";

// Returns { bio, tags } from the about text.
export async function enrichAbout(about) {
  const text = (about || "").trim();
  if (!text) return { bio: "", tags: [] };

  const url = process.env.N8N_TAGS_WEBHOOK_URL;
  if (url) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ about: text }),
      });
      if (res.ok) {
        const data = await res.json();
        const bio = typeof data.bio === "string" && data.bio.trim() ? data.bio.trim().slice(0, 256) : "";
        const tags = Array.isArray(data.tags) ? data.tags.slice(0, 3).map((t) => String(t).toUpperCase()) : [];
        return { bio: bio || localBio(text), tags: tags.length ? tags : localTags(text) };
      }
    } catch {
      /* fall back to local */
    }
  }
  return { bio: localBio(text), tags: localTags(text) };
}

// Backwards-compatible tags-only helper (used by the per-student tags endpoint).
export async function generateTags(about) {
  return (await enrichAbout(about)).tags;
}
