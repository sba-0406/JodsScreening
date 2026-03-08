# Microscopic System Flows

This document provides a low-level, file-to-file view of how the most critical services in ScenarioSim operate. Use these as a map for debugging or extending features.

---

## 1. Notification Flow (In-App)
Handles the creation and delivery of real-time alerts inside the HR and Candidate dashboards.

### 🎬 Sequence Diagram
```mermaid
sequenceDiagram
    participant App as "Any Controller"
    participant NS as "notificationService.js"
    participant DB as "MongoDB (Notifications)"
    participant FE as "Dashboard UI"

    App->>NS: "sendNotification({ templateName, data })"
    
    Note over NS: "STEP 1: Template Lookup"
    NS->>DB: "Find NotificationTemplate by Name"
    
    Note over NS: "STEP 2: String Interpolation"
    NS->>NS: "populateTemplate(body, data)"
    Note right of NS: "Uses Regex to replace {{key}}"

    Note over NS: "STEP 3: Persistence"
    NS->>DB: "Notification.create({ message, type })"
    
    FE->>DB: "Fetch Unread Count (Poll/Refresh)"
    DB-->>FE: "Updated Alert List"
```

### 🔬 Files & Methods
- **Service**: `backend/services/notificationService.js` -> `sendNotification()`
- **Model (Storage)**: `backend/models/Notification.js`
- **Model (Blueprints)**: `backend/models/NotificationTemplate.js`
- **Controller**: `backend/controllers/notificationController.js` (For fetching/marking as read)

---

## 2. Email Dispatch Flow
The standalone engine for sending external communications via SMTP.

### 🎬 Sequence Diagram
```mermaid
sequenceDiagram
    participant NS as "Notification/Auth Service"
    participant ES as "emailService.js"
    participant SMTP as "Gmail SMTP Server"
    participant User as "Recipient Inbox"

    NS->>ES: "sendEmail({ to, subject, html })"
    
    Note over ES: "STEP 1: Verification"
    ES->>ES: "Check for SMTP_USER in .env"
    
    Note over ES: "STEP 2: Safety Filter"
    ES->>ES: "Check if domain is @gmail.com (Dev mode)"

    Note over ES: "STEP 3: Transmission"
    ES->>SMTP: "Nodemailer.sendMail(mailOptions)"
    SMTP-->>ES: "Success: messageId"
    
    SMTP->>User: "Delivers Physical Email"
```

### 🔬 Files & Methods
- **Service**: `backend/services/emailService.js`
- **Configuration**: `backend/.env` (`SMTP_USER`, `SMTP_PASS`)
- **Key Method**: `nodemailer.createTransport()` (Initializes connection)

---

## 3. Resume Parsing & Application Flow
How a raw applicant becomes a scoped candidate with a profile.

### 🎬 Sequence Diagram
```mermaid
sequenceDiagram
    participant UI as "application-form.ejs"
    participant AC as "applicationController.js"
    participant RA as "resumeAssistant.js"
    participant PP as "pdf-parse"
    participant AI as "aiService.js"

    UI->>AC: "POST /apply (Multipart Form)"
    Note over AC: "Multer intercepts file to buffer"
    
    AC->>RA: "extractTextFromBuffer(buffer)"
    RA->>PP: "pdf(buffer)"
    PP-->>RA: "Raw UTF-8 String"

    Note over RA: "Parallel AI Enrichment"
    RA->>AI: "Extract Name, Email, Skills"
    AI-->>RA: "structuredData JSON"

    AC->>AC: "calculateMatchScore()"
    Note over AC: "Math: (Skills / JobReq) * Weight"
    
    AC->>DB: "Application.save()"
```

### 🔬 Files & Methods
- **Service**: `backend/services/resumeAssistant.js`
- **Dependency**: `pdf-parse` (Inbuilt method `pdf()`)
- **Controller**: `backend/controllers/applicationController.js` -> `applyToJob()`

---

## 4. Audit Logging (System History)
Every critical action leaves a permanent trail here.

### 🎬 Sequence Diagram
```mermaid
sequenceDiagram
    participant Controller as "Any Controller"
    participant AL as "auditLogger.js"
    participant DB as "MongoDB (AuditLog)"

    Controller->>AL: "logAction({ action, req, metadata })"
    
    Note over AL: "STEP 1: Identity Extraction"
    AL->>AL: "Extract req.user._id & req.ip"
    
    Note over AL: "STEP 2: State Diff (Optional)"
    AL->>AL: "Capture previousState & newState"

    AL->>DB: "AuditLog.create()"
```

### 🔬 Files & Methods
- **Utility**: `backend/utils/auditLogger.js` -> `logAction()`
- **Model**: `backend/models/AuditLog.js` (Defines `entityType` and `action`)

---

## 5. Global Leaderboard & Scoring
The mathematical engine behind candidate rankings.

### 🎬 Logic Map
*   **Base Score**: (Years Experience / Min Required) * 100 [Capped at 100]
*   **Skill Match**: (Resume Skills ∩ Job Skills) / Total Required * 100
*   **Simulation Score**: Dynamic HSL calculation from AI Dojo.
*   **Final Aggregate**:
    *   `Experience * 0.15`
    *   `SkillMatch * 0.10`
    *   `Technical * 0.40`
    *   `Soft Skills * 0.35`

### 🔬 Files & Methods
- **Score Logic**: `backend/controllers/applicationController.js` -> `calculateMatchScore()`
- **Ranking Weights**: Stored in `Job` model (`rankingWeights` map).

---

## 6. Authentication & JWT Safety
How the system identifies you across sessions.

### 🎬 Sequence Diagram
```mermaid
sequenceDiagram
    participant FE as "Browser/UI"
    participant AC as "authController.js"
    participant DB as "MongoDB (Users)"
    participant MW as "authMiddleware.js"

    FE->>AC: "POST /login { email, password }"
    AC->>DB: "Find User & Select +password"
    
    Note over AC: "BCrypt.compare(input, hashed)"
    
    AC->>AC: "user.getSignedJwtToken()"
    Note right of AC: "Token contains { id, role }"
    
    AC-->>FE: "Set-Cookie: token=JWT; HttpOnly"

    Note over FE, MW: "Future Requests"
    FE->>MW: "HTTP Request + Cookie"
    MW->>MW: "JWT.verify(token)"
    MW-->>FE: "Forbidden (if invalid)"
```

### 🔬 Files & Methods
- **Controller**: `backend/controllers/authController.js`
- **Model Logic**: `backend/models/User.js` (`matchPassword`, `getSignedJwtToken`)
- **Security Guard**: `backend/middleware/auth.js` (`protect`, `authorize`)
