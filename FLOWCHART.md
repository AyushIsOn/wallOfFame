# Wall of Fame - System Architecture Flowchart

## Complete System Flow

```mermaid
flowchart TD
    Start([Wall of Fame System]) --> UserType{User Type?}
    
    %% VIEWER FLOW
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
    
    %% ADMIN/TEACHER FLOW
    UserType -->|Admin/Teacher| AdminLogin[Login to Admin Panel]
    AdminLogin --> FirstTime{First Time Setup?}
    
    %% FIRST TIME SETUP
    FirstTime -->|Yes| SetupDept[Add Department Details]
    SetupDept --> SetupCert[Upload Certificate Template]
    SetupCert --> SetupFields[Select Name Placement Fields]
    SetupFields --> SetupComplete[Setup Complete]
    SetupComplete --> AdminDashboard[Admin Dashboard]
    
    %% REGULAR ADMIN FLOW
    FirstTime -->|No| AdminDashboard
    AdminDashboard --> AdminAction{Choose Action}
    
    %% UPLOAD NEW DATA
    AdminAction -->|Upload Data| UploadFile[Upload Excel/CSV File]
    UploadFile --> ValidateData{Data Valid?}
    ValidateData -->|No| ErrorMsg[Show Error Message]
    ErrorMsg --> UploadFile
    ValidateData -->|Yes| ProcessData[Process Student Data]
    ProcessData --> N8NScript[N8N Script Execution]
    N8NScript --> GenerateIntro[Generate AI Introduction]
    GenerateIntro --> CreateProfiles[Create Profile Pages]
    CreateProfiles --> EmailPrompt{Send Emails?}
    
    %% EMAIL FLOW
    EmailPrompt -->|Yes| EmailOptions{Email Recipients}
    EmailOptions -->|All College| SendAllEmails[Send to All College Emails]
    EmailOptions -->|Selected List| SendSelectedEmails[Send to Selected Recipients]
    SendAllEmails --> EmailSent[Emails Sent Successfully]
    SendSelectedEmails --> EmailSent
    EmailSent --> UpdateComplete[Data Upload Complete]
    
    EmailPrompt -->|No| UpdateComplete
    UpdateComplete --> AdminDashboard
    
    %% UPDATE EXISTING DATA
    AdminAction -->|Update/Modify| SelectStudent[Select Student Record]
    SelectStudent --> ModifyData[Edit Student Details]
    ModifyData --> SaveChanges[Save Changes]
    SaveChanges --> RegenerateIntro[Regenerate Introduction]
    RegenerateIntro --> UpdateProfile[Update Profile Page]
    UpdateProfile --> UpdateSuccess[Update Complete]
    UpdateSuccess --> AdminDashboard
    
    %% VIEW ANALYTICS
    AdminAction -->|View Analytics| Analytics[View Dashboard Analytics]
    Analytics --> AnalyticsData[Views, Clicks, Engagement]
    AnalyticsData --> AdminDashboard
    
    %% LOGOUT
    AdminAction -->|Logout| AdminLogout([Logout])
    
    %% STYLING
    classDef viewerClass fill:#4A90E2,stroke:#2E5C8A,stroke-width:2px,color:#fff
    classDef adminClass fill:#E24A4A,stroke:#8A2E2E,stroke-width:2px,color:#fff
    classDef processClass fill:#50C878,stroke:#2E8A4A,stroke-width:2px,color:#fff
    classDef decisionClass fill:#FFB84D,stroke:#CC8A3D,stroke-width:2px,color:#000
    
    class ViewerEntry,ViewerInteract,ViewerSelect,ViewerProfile,ViewerDetails,Certificate,Social viewerClass
    class AdminLogin,AdminDashboard,SetupDept,SetupCert,SetupFields,UploadFile,SelectStudent,ModifyData,Analytics adminClass
    class ProcessData,N8NScript,GenerateIntro,CreateProfiles,SaveChanges,RegenerateIntro,UpdateProfile processClass
    class UserType,FirstTime,ValidateData,EmailPrompt,EmailOptions,ViewerActions,AdminAction decisionClass
```

---

## Data Flow Architecture

```mermaid
flowchart LR
    subgraph Input ["Data Input Layer"]
        CSV[Excel/CSV File]
        Form[Admin Form]
        Cert[Certificate Template]
    end
    
    subgraph Processing ["Processing Layer"]
        Validate[Data Validation]
        N8N[N8N Automation]
        AI[AI Content Generation]
        ImageGen[Image Processing]
    end
    
    subgraph Storage ["Storage Layer"]
        DB[(Database)]
        FileStore[File Storage]
        CDN[CDN/Assets]
    end
    
    subgraph Output ["Output Layer"]
        Website[Infinite Wall Website]
        ProfilePages[Profile Pages]
        Emails[Email Notifications]
    end
    
    CSV --> Validate
    Form --> Validate
    Cert --> FileStore
    
    Validate --> N8N
    N8N --> AI
    AI --> DB
    N8N --> ImageGen
    ImageGen --> CDN
    
    DB --> Website
    DB --> ProfilePages
    CDN --> Website
    FileStore --> ProfilePages
    
    N8N --> Emails
    
    style Input fill:#E8F4F8
    style Processing fill:#FFF4E6
    style Storage fill:#F0F0F0
    style Output fill:#E8F8E8
```

---

## Database Schema

```mermaid
erDiagram
    STUDENTS ||--o{ ACHIEVEMENTS : has
    STUDENTS ||--o{ SOCIALS : has
    STUDENTS }o--|| DEPARTMENTS : belongs_to
    ACHIEVEMENTS }o--|| CERTIFICATES : references
    
    STUDENTS {
        int id PK
        string reg_number UK
        string name
        int department_id FK
        string profile_image
        text ai_introduction
        datetime created_at
        datetime updated_at
    }
    
    ACHIEVEMENTS {
        int id PK
        int student_id FK
        string type
        string title
        string organization
        int duration_months
        decimal stipend
        int certificate_id FK
        datetime achievement_date
    }
    
    SOCIALS {
        int id PK
        int student_id FK
        string platform
        string url
    }
    
    DEPARTMENTS {
        int id PK
        string name
        string code
    }
    
    CERTIFICATES {
        int id PK
        string template_path
        json name_placement
        datetime created_at
    }
```

---

## Technology Stack

```mermaid
mindmap
  root((Wall of Fame))
    Frontend
      Three.js
      WebGL Shaders
      Vanilla JavaScript
      CSS3
    Backend
      Node.js/Express
      N8N Automation
      AI API Integration
      Email Service
    Database
      PostgreSQL/MySQL
      Redis Cache
    Storage
      AWS S3/CloudFlare
      CDN
    Admin Panel
      React/Vue
      CSV Parser
      Form Validation
```

---

## Deployment Flow

```mermaid
flowchart TD
    Dev[Development] --> Test[Testing]
    Test --> Staging[Staging Environment]
    Staging --> Approve{Approved?}
    Approve -->|Yes| Prod[Production Deploy]
    Approve -->|No| Dev
    
    Prod --> CDN[Update CDN]
    Prod --> DB[Migrate Database]
    Prod --> Cache[Clear Cache]
    
    CDN --> Live[Live Website]
    DB --> Live
    Cache --> Live
    
    Live --> Monitor[Monitoring]
    Monitor --> Metrics{Issues?}
    Metrics -->|Yes| Hotfix[Hotfix Deploy]
    Metrics -->|No| Success([Deployment Complete])
    
    Hotfix --> Test
```

---

## N8N Workflow Detail

```mermaid
flowchart TD
    Start([CSV Upload Trigger]) --> Parse[Parse CSV Data]
    Parse --> Loop{For Each Student}
    
    Loop --> ExtractData[Extract Student Info]
    ExtractData --> AIPrompt[Build AI Prompt]
    AIPrompt --> CallAI[Call OpenAI API]
    CallAI --> GetIntro[Receive Introduction]
    
    GetIntro --> ProcessImage{Has Image?}
    ProcessImage -->|Yes| OptimizeImg[Optimize Image]
    ProcessImage -->|No| DefaultImg[Use Default Avatar]
    
    OptimizeImg --> SaveDB[Save to Database]
    DefaultImg --> SaveDB
    
    SaveDB --> GeneratePage[Generate Profile Page]
    GeneratePage --> UpdateCache[Update Cache]
    
    UpdateCache --> EmailCheck{Send Email?}
    EmailCheck -->|Yes| PrepareEmail[Prepare Email Content]
    EmailCheck -->|No| NextStudent
    
    PrepareEmail --> SendEmail[Send Email]
    SendEmail --> NextStudent{More Students?}
    
    NextStudent -->|Yes| Loop
    NextStudent -->|No| Complete([Workflow Complete])
    
    Complete --> Webhook[Send Completion Webhook]
```

</content>
</invoke>