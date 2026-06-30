// Tag generation from a student's "about" text.
//
// If N8N_TAGS_WEBHOOK_URL is set, the text is POSTed there (your n8n workflow
// can run an LLM and return 2-3 tags). Otherwise a local keyword extractor is
// used as a fallback, so tagging works even before n8n is wired up.

const KEYWORDS = [
  "AI", "ML", "HCI", "UX", "UI", "DESIGN", "RESEARCH", "NLP", "CV", "ROBOTICS",
  "SECURITY", "CYBERSECURITY", "ALGORITHMS", "BCI", "PSYCHOLOGY", "DATA",
  "CLOUD", "DEVOPS", "BLOCKCHAIN", "IOT", "HARDWARE", "SYSTEMS", "REMOTE",
];

const STOP = new Set(["THE", "AND", "FOR", "WITH", "THAT", "THIS", "FROM", "INTO", "OVER"]);

export function localTags(text) {
  const found = new Set();
  // Acronyms / conference names from the original text, e.g. ACL'24, NeurIPS.
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

export async function generateTags(about) {
  const text = (about || "").trim();
  if (!text) return [];

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
        const tags = Array.isArray(data) ? data : data.tags;
        if (Array.isArray(tags) && tags.length) {
          return tags.slice(0, 3).map((t) => String(t).toUpperCase());
        }
      }
    } catch {
      /* fall back to local extraction */
    }
  }
  return localTags(text);
}
