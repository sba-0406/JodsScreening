# Microscopic System Flows

This document provides a low-level, file-to-file view of how the most critical services in ScenarioSim operate. Use these as a map for debugging or extending features.

---

## 1. Notification Flow (In-App)
Handles the creation and delivery of real-time alerts inside the HR and Candidate dashboards.

### 🎬 Sequence Diagram
```mermaid
sequenceDiagram
    participant App as "applicationController.js"
    participant NS as "notificationService.js"
    participant DB as "MongoDB (Notifications)"
    participant FE as "Dashboard UI"

    Note over App: "Action: sendAssessmentInvite()"
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

### 🔬 Files & Actions
- **Controller Action**: `applicationController.js` -> `inviteCandidate()`
- **Controller Action**: `assessmentController.js` -> `finalizeAssessment()` (once completed)
- **Service**: `backend/services/notificationService.js` -> `sendNotification()`
- **Model**: `backend/models/Notification.js`

---

## 2. Email Dispatch Flow
The standalone engine for sending external communications via SMTP.

### 🎬 Sequence Diagram
```mermaid
sequenceDiagram
    participant NS as "notificationService.js"
    participant ES as "emailService.js"
    participant SMTP as "Gmail SMTP Server"
    participant User as "Recipient Inbox"

    Note over NS: "Action: sendNotification()"
    NS->>ES: "sendEmail({ to, subject, html })"
    
    Note over ES: "STEP 1: Verification"
    ES->>ES: "Check for SMTP_USER in .env"
    
    Note over ES: "STEP 2: Safety Filter"
    ES->>ES: "Check if domain is @gmail.com"

    Note over ES: "STEP 3: Transmission"
    ES->>SMTP: "Nodemailer.sendMail(mailOptions)"
    SMTP-->>ES: "Success: messageId"
    
    SMTP->>User: "Delivers Physical Email"
```

### 🔬 Files & Actions
- **Trigger Service**: `backend/services/notificationService.js`
- **Auth Trigger**: `backend/controllers/authController.js` -> `register()`
- **Service**: `backend/services/emailService.js` -> `sendEmail()`
- **Config**: `backend/.env` (`SMTP_USER`, `SMTP_PASS`)

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
    Note over AC: "Action: applyToJob()"
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

### 🔬 Files & Actions
- **Controller Action**: `applicationController.js` -> `applyToJob()`
- **Service**: `backend/services/resumeAssistant.js` -> `extractTextFromBuffer()`
- **Analysis**: `backend/services/aiService.js` (Groq/OpenAI Integration)

---

## 4. Audit Logging (System History)
Every critical action leaves a permanent trail here.

### 🎬 Sequence Diagram
```mermaid
sequenceDiagram
    participant Controller as "jobController.js"
    participant AL as "auditLogger.js"
    participant DB as "MongoDB (AuditLog)"

    Note over Controller: "Action: createJob() / updateJob()"
    Controller->>AL: "logAction({ action, req, metadata })"
    
    Note over AL: "STEP 1: Identity Extraction"
    AL->>AL: "Extract req.user._id & req.ip"
    
    Note over AL: "STEP 2: Persistence"
    AL->>DB: "AuditLog.create()"
```

### 🔬 Files & Actions
- **Controller Action**: `applicationController.js` -> `applyToJob()` (Logs 'create')
- **Controller Action**: `jobController.js` -> `createJob()` / `updateJob()`
- **Utility**: `backend/utils/auditLogger.js` -> `logAction()`
- **Model**: `backend/models/AuditLog.js`

---

## 5. Global Leaderboard & Scoring
The mathematical engine behind candidate rankings.

### 🎬 Logic Map
*   **Base Score**: (Years Experience / Min Required) * 100 [Capped at 100]
*   **Skill Match**: (Resume Skills ∩ Job Skills) / Total Required * 100
*   **Final Aggregate**: `(Exp * 0.15) + (Skills * 0.10) + (Tech * 0.40) + (Soft * 0.35)`

### 🔬 Files & Actions
- **Controller Action**: `applicationController.js` -> `getJobCandidates()` (Fetches and sorts by score)
- **Math Logic**: `backend/controllers/applicationController.js` -> `calculateMatchScore()`
- **Weights**: `Job` model -> `rankingWeights` (Configurable by HR)

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
    Note over AC: "Action: login()"
    AC->>DB: "Find User & Select +password"
    
    Note over AC: "BCrypt.compare(input, hashed)"
    
    AC->>AC: "user.getSignedJwtToken()"
    Note right of AC: "Token contains { id, role }"
    
    AC-->>FE: "Set-Cookie token=JWT"

    Note over FE: "Action: Future Requests"
    FE->>MW: "HTTP Request + Cookie"
    Note over MW: "Action: protect() middleware"
    MW->>MW: "jwt.verify(token)"
    MW-->>FE: "Forbidden (if invalid)"
```

### 🔬 Files & Actions
- **Controller Action**: `authController.js` -> `login()`
- **Controller Action**: `authController.js` -> `register()`
- **Middleware**: `backend/middleware/auth.js` -> `protect()`
- **Model**: `backend/models/User.js` (`matchPassword`, `getSignedJwtToken`)

---

## 7. Assessment Simulation (Dojo) Flow
The real-time candidate experience.

### 🎬 Sequence Diagram
```mermaid
sequenceDiagram
    participant C as "Candidate UI"
    participant AC as "assessmentController.js"
    participant CS as "chatService.js"
    participant DB as "MongoDB"

    Note over AC: "Action: startAssessment()"
    C->>AC: "Start My Assessment"
    AC->>DB: "ChatSessionInit"
    AC-->>C: "Render Examination UI"

    Note over AC: "Action: submitMCQAnswer()"
    C->>AC: "Send Choice"
    AC->>AC: "Grade & Score"
    AC->>DB: "Update Session State"

    Note over AC: "Action: processMessage()"
    C->>AC: "Enter Chat Message"
    AC->>CS: "analyzeTurn() & generateResponse()"
    CS-->>AC: "Sentiment & Stakeholder Reply"
    AC->>DB: "Save Chat History"

    Note over AC: "Action: finalizeAssessment()"
    C->>AC: "Finish Exam"
    AC->>AC: "Calculate Global Weighted Match"
    AC->>DB: "Save Completed Application Record"
```

### 🔬 Files & Actions
- **Controller**: `backend/controllers/assessmentController.js`
- **Service**: `backend/services/chatService.js` (Roleplay & Analysis)
- **Model**: `backend/models/ChatSession.js`
