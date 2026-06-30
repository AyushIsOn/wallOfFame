# n8n: AI enrichment (bio + tags)

`enrich.workflow.json` takes a student's raw "about" text and returns a
**polished first-person bio (≤256 chars) and 2–3 tags**, using an LLM via
**Groq** or **OpenRouter** (both OpenAI-compatible).

**Flow:** `Webhook (POST)` → `LLM` → `Format bio + tags (Code)` → `Respond`.

### Contract (what the app sends / expects)
- Request: `POST` JSON `{ "about": "<raw text>" }`
- Response: `{ "bio": "I ...", "tags": ["AI", "ML", "DESIGN"] }`

Used by the Wall of Fame backend during **Excel import** (each row's About is
rewritten + tagged automatically) and via the admin `/api/admin/enrich` endpoint.
If the webhook is unset or fails, the backend falls back to a local
truncate-bio + keyword-tags, so imports still work.

---

## Setup

1. **Import** — n8n → *Workflows → Import from File* → `enrich.workflow.json`.

2. **Add your API key** — open the **LLM** node → *Credential → Header Auth*,
   create one with:
   - **Name:** `Authorization`
   - **Value:** `Bearer <your key>`

3. **Pick your provider** (edit the LLM node):

   | Provider | URL | Example model |
   |---|---|---|
   | **Groq** (default) | `https://api.groq.com/openai/v1/chat/completions` | `llama-3.3-70b-versatile` |
   | **OpenRouter** | `https://openrouter.ai/api/v1/chat/completions` | `meta-llama/llama-3.3-70b-instruct` |

   The model name is in the node's **JSON body** field — change it there.
   (If an OpenRouter model rejects `response_format`, delete that line from the
   JSON body; the Code node still parses the reply.)

4. **Activate** the workflow, copy the Webhook **Production URL**
   (`.../webhook/wall-of-fame-enrich`), and set it on Render:
   `N8N_TAGS_WEBHOOK_URL = <that URL>` → redeploy.

### Test
```bash
curl -X POST "<your-webhook-url>" -H "Content-Type: application/json" \
  -d '{"about":"6 month research internship; published at ACL 2024 on HCI and adaptive AI interfaces."}'
# -> {"bio":"I published at ACL 2024 on human-computer interaction...","tags":["ACL","HCI","AI"]}
```

The system prompt (with an example) lives in the LLM node's JSON body — tweak
the wording/length/tone there.

---

## Photos from Google Forms / Microsoft Forms

**n8n is not involved in photos** — the backend pulls them from the **Photo URL**
column of your sheet during import. Forms put a Drive/OneDrive link there.

This works **when the file is shared "anyone with the link"**:
- The backend converts Google Drive and OneDrive share links to direct-download
  URLs automatically and fetches + resizes the image.
- So: in your Form, ask students to share the file as *anyone with the link*, or
  set the responses folder to public. Then the Photo URL column just works.

If your org **can't** make files public (locked-down Microsoft 365), the
alternative is a second n8n workflow using n8n's **authenticated** Google
Drive / OneDrive nodes (signed in as the form owner) to download private files
and POST them to the admin API. Ask to have that + the upsert endpoint built
when you need it.
