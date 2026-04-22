# 🎬 ScenarioSim - AI-Powered Career Reflection Platform

[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Groq](https://img.shields.io/badge/Groq-AI-orange?style=for-the-badge)](https://groq.com/)
[![EJS](https://img.shields.io/badge/EJS-B4CA65?style=for-the-badge&logo=ejs&logoColor=black)](https://ejs.co/)

**ScenarioSim** is a cutting-edge career reflection and competency insight tool that leverages state-of-the-art AI to provide scenario-based simulations. It helps candidates understand their performance in real-world scenarios while providing HR teams with deep analytics on candidate competency.

---

## 🌟 Key Features

### 🤖 AI-Agentic Assessments
- **Dynamic Scenario Generation**: Leverages Llama 3 (via Groq) to create unique, role-specific simulations.
- **Real-time Grading**: Performance-based multipliers that evaluate Skill Accumulation and Metric Management.
- **Adaptive Questioning**: Assessments that evolve based on candidate responses.
- **JD Parsing**: Intelligent extraction of skills and requirements from Job Descriptions.

### 🔒 Enterprise-Grade Security
- **Secure S3 Proxying**: Resumes and sensitive documents are stored in private S3 buckets and accessed via secure, backend-proxied temporary URLs. No direct public S3 links are ever exposed.
- **JWT Authentication**: Robust user authentication and session management.

### 📊 Advanced Dashboards
- **HR Dashboard**: Track candidate progress, review AI-generated summaries, and manage job postings.
- **Admin Control**: System-wide oversight, user management, and real-time monitoring.
- **Candidate Portal**: Intuitive interface for applying to jobs and completing immersive simulations.

---

## 🏗️ Technical Architecture

### Tech Stack
- **Backend**: Node.js, Express.js
- **Database**: MongoDB (Mongoose ODM)
- **Frontend**: EJS Templating, Vanilla CSS, Responsive JS
- **AI Engine**: Llama 3 (Groq SDK)
- **Storage**: AWS S3 (multer-s3)
- **Communication**: Nodemailer (Gmail SMTP)
- **Document Processing**: PDF-Parse

### Security Architecture (S3 Proxy)
Unlike standard implementations, ScenarioSim does not expose direct S3 links. All document requests pass through a backend authorization layer that validates the user session before fetching and streaming the file, ensuring zero unauthorized access.

---

## 📸 System Flows

### User Onboarding & Job Creation
![Register Flow](documentation/pics/01_register_flow.png)
![Post Job Flow](documentation/pics/03_post_job_flow.png)

### Assessment & Grading
![Start Assessment Flow](documentation/pics/07_start_assessment_flow.png)
![Generate Assessment Flow](documentation/pics/04_generate_assessment_flow.png)

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- MongoDB Instance (Atlas or Local)
- Groq API Key (for AI simulations)
- AWS Credentials (for S3 storage)
- Gmail App Password (for email notifications)

### Environment Configuration
Create a `.env` file in the `backend/` directory with the following variables:

| Category | Variable | Description |
| :--- | :--- | :--- |
| **Server** | `PORT` | Server port (default: 4000) |
| | `NODE_ENV` | `development` or `production` |
| | `JWT_SECRET` | Secret key for session tokens |
| **Database** | `MONGO_URI` | MongoDB connection string |
| **AI (Groq)** | `GROQ_API_KEY` | Your Groq Cloud API Key |
| **Email** | `SMTP_USER` | Your Gmail address |
| | `SMTP_PASS` | Your Gmail App Password |
| | `SMTP_FROM` | Sender name/email (e.g. `"ScenarioSim" <noreply@gmail.com>`) |
| **AWS S3** | `AWS_REGION` | Your S3 bucket region |
| | `AWS_ACCESS_KEY_ID` | AWS IAM Access Key |
| | `AWS_SECRET_ACCESS_KEY` | AWS IAM Secret Key |
| | `AWS_BUCKET_NAME` | Private S3 Bucket name |

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/sba-0406/JodsScreening.git
   cd JodsScreening
   ```

2. **Install Dependencies**
   ```bash
   cd backend
   npm install
   ```

3. **Launch Application**
   ```bash
   npm run dev
   ```
   Visit: `http://localhost:4000`

---

## 📈 Roadmap & Future Scope
- [ ] Integration with multi-LLM fallbacks (Gemini, Anthropic).
- [ ] Real-time video-based scenario analysis.
- [ ] Multi-tenant support for enterprise clients.

---

## 📄 License
This project is licensed under the ISC License.

---
Built with ❤️ by **Shaik Alisha**
