# n8n workflows

## 1. Tag generation (`tag-generation.workflow.json`)

Generates 2–3 tags from a student's About/Bio text using an LLM. The Wall of
Fame backend calls this whenever it needs tags (admin "Generate" button and
Excel import rows that have no tags).

**Flow:** `Webhook (POST)` → `OpenAI (chat completions)` → `Format tags (Code)`
→ `Respond` returning `{ "tags": ["AI", "ML", "DESIGN"] }`.

### Contract (what the app sends/expects)
- Request: `POST` with JSON body `{ "about": "<bio text>" }`
- Response: JSON `{ "tags": ["AI", "ML", "DESIGN"] }` (2–3 uppercase tags)

### Setup
1. In n8n: **Workflows → Import from File** → select `tag-generation.workflow.json`.
2. Open the **OpenAI** node → **Credential** → create/select an *OpenAI API*
   credential (your `sk-...` key).
   - Using a different provider (OpenRouter, Azure, a local LLM)? Switch that
     node's URL/auth and keep the rest. The model is `gpt-4o-mini` by default —
     change it in the node's JSON body if you like.
3. **Activate** the workflow (toggle top-right). Copy the **Production URL** from
   the Webhook node — e.g. `https://<you>.app.n8n.cloud/webhook/wall-of-fame-tags`.
4. In your Render web service env, set:
   `N8N_TAGS_WEBHOOK_URL = <that production URL>` and redeploy.

That's it. If the webhook is unset or fails, the backend falls back to its
built-in keyword extractor, so tagging always works.

### Test it
```bash
curl -X POST "<your-webhook-url>" \
  -H "Content-Type: application/json" \
  -d '{"about":"Published at ACL 24 on HCI and adaptive AI interfaces."}'
# -> {"tags":["ACL","HCI","AI"]}
```

---

## 2. Forms → photos ingestion (planned)

For pulling **student photos uploaded via Google/Microsoft Forms** (which land
as *private* Drive/OneDrive links), the robust approach is a second n8n
workflow that uses n8n's authenticated Drive/OneDrive nodes:

`Form response trigger / Sheet read` → for each row: `Google Drive` (or
`Microsoft OneDrive`) **Download** node (signed in as the form owner, so private
files work) → `HTTP Request` to the Wall of Fame admin API to upsert the student
+ attach the image.

This needs a small **idempotent upsert endpoint** on the backend
(`POST /api/admin/students` accepting multipart fields + image, keyed by Reg No)
so n8n can do it in one call per student. Ask to have that built when you're
ready to wire Forms ingestion.
