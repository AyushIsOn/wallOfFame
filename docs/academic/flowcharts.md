# Flowcharts

Diagrams for reports and presentations. **Part 1 shows the system as built**
(October 2026). **Part 2 is the original vision** from the project proposal,
with what was and wasn't built marked. GitHub renders these Mermaid diagrams
directly; to export images, paste them into [mermaid.live](https://mermaid.live).

- Part 1, as built: [Viewer flow](#1-viewer-flow) · [Admin flow](#2-admin-flow) · [System architecture](#3-system-architecture) · [Import pipeline](#4-import-pipeline) · [Rendering loop](#5-rendering-loop) · [Database](#6-database) · [AI workflow](#7-ai-workflow-n8n) · [Deployment](#8-deployment)
- Part 2: [Original vision](#part-2-original-vision)

---

## Part 1: As built

### 1. Viewer flow

```mermaid
flowchart TD
  V([Visitor opens the site]) --> W[Infinite wall loads]
  W --> D{What next?}
  D -->|Drag| W
  D -->|Hover a tile| G[Tile fills with its photo's colour] --> D
  D -->|Search or filters| F[Wall and list show matching students] --> D
  D -->|List icon| L[Year-grouped list] -->|Click a name| P
  D -->|Click a tile| P[Profile: photo, bio, details, links]
  P --> N{Choose}
  N -->|Go to next person| P
  N -->|LinkedIn, website, certificate| X[Opens in a new tab]
  N -->|Close or Esc| W
```

### 2. Admin flow

```mermaid
flowchart TD
  A([Admin opens /admin]) --> S{Signed in within<br/>the last 12 hours?}
  S -->|No| L[Enter the admin password] --> R{Correct?}
  R -->|No| E[Invalid password<br/>max 10 tries per 15 min] --> L
  R -->|Yes| DB
  S -->|Yes| DB[Dashboard: upload, template, manual, students table]
  DB -->|Upload a sheet| I[Import runs row by row] --> RES[Status: imported, updated,<br/>photos, failures] --> DB
  DB -->|Download template| T[CSV with headers and an example] --> DB
  DB -->|Add, or click a row| M[Edit form]
  M -->|Generate| AI[AI suggests tags; nothing saved yet] --> M
  M -->|Save| SV[Save; upload photo if chosen] --> DB
  M -->|Delete| DEL[Confirm, then delete] --> DB
  DB -->|Log out| O([Signed out])
```

### 3. System architecture

```mermaid
flowchart LR
  visitor([Visitor browser]) -->|"wall, list, profile"| server
  admin([Admin browser]) -->|"/admin + admin API"| server
  subgraph server [One Node.js + Express service]
    static[Built frontend<br/>dist/]
    api[JSON API<br/>/api/*]
  end
  api --> db[(PostgreSQL<br/>PGlite locally)]
  api -->|"About text"| n8n[n8n webhook] --> llm[LLM: Groq / OpenRouter]
  api -->|"Photo URLs"| hosts[Google Drive, OneDrive, web]
```

### 4. Import pipeline

```mermaid
flowchart TD
  U[Admin uploads .xlsx, .xls or .csv] --> P[Read first sheet, match headers]
  P --> Q{Any row with a Name?}
  Q -->|No| E400[Error: No students found]
  Q -->|Yes| Row[Next row]
  Row --> A{About new or changed<br/>since last import?}
  A -->|Yes| AI[n8n + LLM: bio + tags<br/>or local fallback] --> EX
  A -->|No| EX{Reg No already<br/>on the wall?}
  EX -->|No| C[Create student]
  EX -->|Yes| UP[Update non-blank cells only]
  C --> PH{Photo URL new<br/>or changed?}
  UP --> PH
  PH -->|Yes| DL[Download, resize to WebP, store] --> MORE
  PH -->|No| MORE{More rows?}
  MORE -->|Yes| Row
  MORE -->|No| DONE[Report counts and photo errors]
```

### 5. Rendering loop

Runs every animation frame in the browser.

```mermaid
flowchart TD
  F([Frame starts]) --> E[Ease pan and zoom toward targets]
  E --> H{Gallery visible?}
  H -->|No: list view open| F
  H -->|Yes| C[Compute visible cells plus a 1-cell margin]
  C --> M["Each cell (x, y) → student (x + y·stride) mod N"]
  M --> K{Card texture cached?}
  K -->|Yes| T[Use it]
  K -->|No| LD[Load thumbnail, draw card on a canvas,<br/>upload as texture] --> T
  T --> S[Position a pooled tile mesh]
  S --> GPU["Shaders: fisheye warp, hover glow,<br/>grid lines, edge fade"]
  GPU --> EV[Evict least-recently-used textures over the limit]
  EV --> F
```

### 6. Database

```mermaid
erDiagram
  STUDENTS {
    serial id PK
    text name
    integer year
    text reg_no "import dedup key"
    text department
    text type
    text category
    text duration
    text stipend
    text bio
    jsonb tags
    text linkedin
    text website
    text certificate
    text image_url "static photo path"
    text thumb_url
    bytea image "uploaded photo, WebP"
    bytea thumb "512px thumbnail, WebP"
    integer position
    timestamptz created_at
    timestamptz updated_at
    text about_source "last imported About"
    text photo_source "last imported Photo URL"
  }
```

### 7. AI workflow (n8n)

```mermaid
flowchart LR
  W["Webhook<br/>POST { about }"] --> L["LLM node<br/>Groq or OpenRouter"] --> C["Code node<br/>parse { bio, tags }"] --> R["Respond<br/>{ bio, tags }"]
  W -. "unset, error or > 20 s" .-> FB["Server's local fallback:<br/>trimmed About + keyword tags"]
```

### 8. Deployment

```mermaid
flowchart LR
  G[Push to main on GitHub] --> B["Render build<br/>npm ci && npm run build"]
  B --> S["Start<br/>node server/index.js"]
  S --> MG[Migrate: create table, add columns]
  MG --> SD{Table empty and<br/>SEED_SAMPLE_DATA not false?}
  SD -->|Yes| IN[Insert 25 sample students] --> LIVE
  SD -->|No| LIVE["Health check /api/health → live"]
```

---

## Part 2: Original vision

The proposal described a larger system. This table shows where each part
stands; [roadmap.md](../roadmap.md) has the remaining items.

| Vision item | Status |
|---|---|
| Infinite WebGL wall, profiles, socials | **Built** |
| Excel/CSV upload by teachers | **Built** (with header aliases, re-import rules, photo download) |
| AI-generated introductions via n8n | **Built** (bio + tags; local fallback) |
| Admin login and record editing | **Built** (single shared password) |
| Search and filters | **Built** |
| Certificate template upload and name placement | Not built (certificate is a URL field) |
| Email notifications to students or the college | Not built |
| First-time setup wizard (departments, certificate) | Not built |
| Analytics dashboard (views, clicks) | Not built |
| Separate tables for achievements, socials, departments | Not built (one `students` table) |
| Redis cache, S3/CDN image storage | Not built (photos in Postgres) |

The original "complete system" chart, kept for reference. The other original
charts (data flow, five-table schema, technology mind map, staging deployment,
email-sending n8n flow) are in the git history of `FLOWCHART.md`.

```mermaid
flowchart TD
    Start([Wall of Fame System]) --> UserType{User Type?}

    UserType -->|Viewer/Student| ViewerEntry[Enter Infinite Wall]
    ViewerEntry --> ViewerInteract[Drag & Browse Grid]
    ViewerInteract --> ViewerSelect[Click on Student Card]
    ViewerSelect --> ViewerProfile[View Profile Page]
    ViewerProfile --> ViewerDetails[See Achievement Details]
    ViewerDetails --> ViewerActions{Choose Action}
    ViewerActions -->|View Certificate| Certificate[Open College Certificate]
    ViewerActions -->|Visit Social| Social[Open LinkedIn/Website]
    ViewerActions -->|Continue Browsing| ViewerInteract
    ViewerActions -->|Exit| ViewerEnd([End Session])

    UserType -->|Admin/Teacher| AdminLogin[Login to Admin Panel]
    AdminLogin --> FirstTime{First Time Setup?}
    FirstTime -->|Yes| SetupDept["Add Department Details (not built)"]
    SetupDept --> SetupCert["Upload Certificate Template (not built)"]
    SetupCert --> SetupFields["Select Name Placement Fields (not built)"]
    SetupFields --> SetupComplete[Setup Complete]
    SetupComplete --> AdminDashboard[Admin Dashboard]
    FirstTime -->|No| AdminDashboard
    AdminDashboard --> AdminAction{Choose Action}

    AdminAction -->|Upload Data| UploadFile[Upload Excel/CSV File]
    UploadFile --> ValidateData{Data Valid?}
    ValidateData -->|No| ErrorMsg[Show Error Message]
    ErrorMsg --> UploadFile
    ValidateData -->|Yes| ProcessData[Process Student Data]
    ProcessData --> N8NScript[N8N Script Execution]
    N8NScript --> GenerateIntro[Generate AI Introduction]
    GenerateIntro --> CreateProfiles[Create Profile Pages]
    CreateProfiles --> EmailPrompt{"Send Emails? (not built)"}
    EmailPrompt -->|Yes| EmailOptions{Email Recipients}
    EmailOptions -->|All College| SendAllEmails[Send to All College Emails]
    EmailOptions -->|Selected List| SendSelectedEmails[Send to Selected Recipients]
    SendAllEmails --> EmailSent[Emails Sent Successfully]
    SendSelectedEmails --> EmailSent
    EmailSent --> UpdateComplete[Data Upload Complete]
    EmailPrompt -->|No| UpdateComplete
    UpdateComplete --> AdminDashboard

    AdminAction -->|Update/Modify| SelectStudent[Select Student Record]
    SelectStudent --> ModifyData[Edit Student Details]
    ModifyData --> SaveChanges[Save Changes]
    SaveChanges --> AdminDashboard

    AdminAction -->|View Analytics| Analytics["View Dashboard Analytics (not built)"]
    Analytics --> AdminDashboard
    AdminAction -->|Logout| AdminLogout([Logout])
```
