const Groq = require('groq-sdk');

// Advanced Prompt Templates
const SUMMARIZE_TEMPLATE = `
Analyze the following professional simulation transcript. 
Extract 3-5 concise, evidence-based bullet points of what the user DID.
Focus on actions, specific decisions, and tone.
Example: 'Used a collaborative tone when unblocking developers.'
Transcript:
`;

const IMPACT_ANALYZE_TEMPLATE = (role) => `
You are a Senior Executive evaluating a ${role}. Analyse the transcript.
Return ONLY a JSON object:
{
  "scores": [
    { "competency": "string", "score": number, "evidence": "string" }
  ],
  "overallFeedback": "string"
}
Transcript:
`;

const extractJSON = (text) => {
    try {
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        let candidate = jsonMatch ? jsonMatch[1] : text;
        candidate = candidate.replace(/\/\/.*$/gm, '');
        candidate = candidate.replace(/\/\*[\s\S]*?\*\//g, '');
        candidate = candidate.trim();

        try {
            return JSON.parse(candidate);
        } catch (parseErr) {
            const start = candidate.indexOf('{') !== -1 ? candidate.indexOf('{') : candidate.indexOf('[');
            const end = candidate.lastIndexOf('}') !== -1 ? candidate.lastIndexOf('}') : candidate.lastIndexOf(']');
            if (start !== -1 && end !== -1) {
                const sliced = candidate.substring(start, end + 1);
                return JSON.parse(sliced);
            }
            throw parseErr;
        }
    } catch (err) {
        console.error("[AI DEBUG] JSON Extraction Failed. Raw Text:", text);
        throw new Error("Invalid AI Response Format");
    }
};

class GroqAIService {
    constructor(apiKey) {
        this.groq = new Groq({ apiKey });
        this.models = [
            "llama-3.3-70b-versatile",
            "llama-3.1-8b-instant",
            "llama-3.2-11b-vision-preview",
            "llama-3.2-3b-preview"
        ];
        this.currentModelIndex = 0;
        this.activeModel = "None";
        this.lastRequestTime = 0;
        this.minInterval = 2500; // 2.5 seconds for ~24 RPM
    }

    async _throttle() {
        const now = Date.now();
        const timeSinceLast = now - this.lastRequestTime;
        if (timeSinceLast < this.minInterval) {
            const wait = this.minInterval - timeSinceLast;
            console.log(`[AI THROTTLE] Waiting ${wait}ms to respect rate limits...`);
            await new Promise(resolve => setTimeout(resolve, wait));
        }
        this.lastRequestTime = Date.now();
    }

    async generateContent(prompt, isJson = false, modelOverride = null) {
        await this._throttle();

        // Try models in rotation
        let attempts = 0;
        while (attempts < this.models.length) {
            const modelName = modelOverride || this.models[this.currentModelIndex];
            try {
                const response = await this.groq.chat.completions.create({
                    model: modelName,
                    messages: [{ role: "user", content: prompt }],
                    ...(isJson ? { response_format: { type: "json_object" } } : {})
                });
                this.activeModel = modelName;
                return response.choices[0].message.content;
            } catch (err) {
                if (err.status === 401) throw err;
                console.warn(`[AI SERVICE] Groq Model ${modelName} failed:`, err.message);

                if (modelOverride) throw err; // Don't rotate if specific model requested

                this.currentModelIndex = (this.currentModelIndex + 1) % this.models.length;
                attempts++;
                await new Promise(resolve => setTimeout(resolve, 500)); // Short wait before retry
            }
        }
        throw new Error("All Groq models failed");
    }

    async generateTechnicalQuestions(skill, count, difficulty) {
        console.log(`[AI GENERATE] Creating ${count} questions for ${skill}...`);

        // Buffer logic: Ask for more than needed (at least 3 or 1.5x) to handle rejections
        const targetCount = Math.max(count + 2, Math.ceil(count * 1.5));

        const genPrompt = `
        Create ${targetCount} distinct multiple-choice questions for the technical skill: "${skill}".
        Difficulty Level: ${difficulty}.

        Format requirements:
        - Return ONLY a JSON object with a "questions" key containing the array.
        - Each question object must have: "question", "options" (array of 4 strings), "correctAnswer" (index 0-3), "explanation".
        - Ensure questions are practical and scenario-based.
        
        Example:
        {
          "questions": [
            {
                "question": "...",
                "options": ["...", "...", "...", "..."],
                "correctAnswer": 0,
                "explanation": "..."
            }
          ]
        }
        `;

        try {
            // Step 1: Generate Questions (using Llama 3.3)
            const genText = await this.generateContent(genPrompt, true, "llama-3.3-70b-versatile");
            const genData = extractJSON(genText);
            const rawQuestions = genData.questions || [];

            if (rawQuestions.length === 0) return [];

            // Step 2: Critic Pass (using Mixtral for a different "brain")
            console.log(`[AI CRITIC] Validating ${rawQuestions.length} questions for accuracy...`);
            const criticPrompt = `
            You are a Senior Technical Architect. Review these technical questions for "${skill}" at "${difficulty}" difficulty.
            
            Questions to review:
            ${JSON.stringify(rawQuestions, null, 2)}

            For each question:
            1. Is the "correctAnswer" actually the most accurate choice?
            2. Are the questions clear and non-ambiguous?
            3. Is the explanation technically sound?

            Return ONLY a JSON object. Be fair but firm. Bias towards approval unless the question is factually wrong or completely unreadable.
            {
                "reviews": [
                    { "index": 0, "isValid": true/false, "feedback": "Short string explanation if false" }
                ]
            }
            `;

            const criticText = await this.generateContent(criticPrompt, true, "llama-3.1-8b-instant");
            const criticData = extractJSON(criticText);
            const reviews = criticData.reviews || [];

            // Filter out invalid questions
            const validatedQuestions = rawQuestions.filter((q, idx) => {
                const review = reviews.find(r => r.index === idx);
                if (review && review.isValid === false) {
                    const reason = typeof review.feedback === 'object' ? JSON.stringify(review.feedback) : review.feedback;
                    console.warn(`[AI CRITIC] Rejecting Question ${idx} for ${skill}: ${reason}`);
                    return false;
                }
                return true;
            });

            console.log(`[AI SUCCESS] ${validatedQuestions.length}/${rawQuestions.length} questions passed the Critic pass.`);

            // If we still don't have enough, and this isn't already a retry
            if (validatedQuestions.length < count && !this._isRetry) {
                console.log(`[AI FILL GAP] Only ${validatedQuestions.length}/${count} passed. Retrying to fill gap...`);
                this._isRetry = true;
                const extra = await this.generateTechnicalQuestions(skill, count - validatedQuestions.length, difficulty);
                this._isRetry = false;
                return [...validatedQuestions, ...extra].slice(0, count);
            }

            return validatedQuestions.slice(0, count);

        } catch (error) {
            console.error(`[AI SERVICE] Failed to generate/validate questions for ${skill}:`, error);
            return [];
        }
    }

    async generateBulkTechnicalQuestions(skillsMap, difficulty) {
        // skillsMap: { "React": 2, "Node.js": 2 }
        const skillsList = Object.keys(skillsMap);
        console.log(`[AI BULK GENERATE] Creating questions for: ${skillsList.join(', ')}...`);

        // Ask for a bit more buffer per skill (Math.max(count+1, 1.2x))
        const bulkConfig = {};
        skillsList.forEach(skill => {
            bulkConfig[skill] = Math.max(skillsMap[skill] + 1, Math.ceil(skillsMap[skill] * 1.3));
        });

        const genPrompt = `
        Create technical multiple-choice questions for the following skills:
        ${JSON.stringify(bulkConfig, null, 2)}
        Difficulty Level: ${difficulty}.

        Format requirements:
        - Return ONLY a JSON object with a "results" key.
        - "results" should be an array of objects, one per skill.
        - Each skill object must have "skill" and "questions" (array).
        - Each question object: "question", "options" (4 strings), "correctAnswer" (index 0-3), "explanation".
        
        Example:
        {
          "results": [
            {
                "skill": "React",
                "questions": [ { "question": "...", ... } ]
            }
          ]
        }
        `;

        try {
            // Step 1: Bulk Generation
            const genText = await this.generateContent(genPrompt, true, "llama-3.3-70b-versatile");
            const genData = extractJSON(genText);
            const results = genData.results || [];

            // Step 2: Bulk Critic Pass
            console.log(`[AI BULK CRITIC] Validating results across ${results.length} skills...`);
            const criticPrompt = `
            You are a Senior Technical Architect. Review these technical questions for accuracy.
            Difficulty: ${difficulty}.

            Questions:
            ${JSON.stringify(results, null, 2)}

            Return ONLY a JSON object. You are a strict technical critic. Be firm; reject questions if they are simplistic or have errors.
            IMPORTANT: Use the EXACT skill names provided below in your response.
            {
                "reviews": [
                    { "skill": "React", "reviews": [ { "index": 0, "isValid": true/false, "feedback": "Short reason" } ] }
                ]
            }
            `;

            const criticText = await this.generateContent(criticPrompt, true, "llama-3.1-8b-instant");
            const criticData = extractJSON(criticText);
            const allReviews = criticData.reviews || [];

            const finalMap = {};
            results.forEach(skillRes => {
                const skill = skillRes.skill;
                const skillQuestions = skillRes.questions || [];

                const validated = skillQuestions.filter((q, idx) => {
                    // Robust fuzzy match for skill name (handle case, spaces, or small variations)
                    const matchingReview = allReviews.find(r =>
                        r.skill?.toLowerCase().trim() === skill.toLowerCase().trim() ||
                        r.skill?.toLowerCase().includes(skill.toLowerCase()) ||
                        skill.toLowerCase().includes(r.skill?.toLowerCase())
                    );

                    const review = matchingReview?.reviews?.find(r => r.index === idx);

                    if (review && review.isValid === false) {
                        const reason = typeof review.feedback === 'object' ? JSON.stringify(review.feedback) : review.feedback;
                        console.warn(`[AI BULK CRITIC] Rejecting ${skill} Question ${idx}: ${reason}`);
                        return false;
                    }
                    return true;
                });

                // Slice to requested count
                const requestedCount = skillsMap[skill];
                finalMap[skill] = validated.slice(0, requestedCount);

                // Note: We don't do automatic recursive retry here to keep it simple and safe for one big packet.
                // If a skill is under-populated, questionBankService can handle a small targeted fallback.
                console.log(`[AI BULK SUCCESS] ${finalMap[skill].length}/${requestedCount} questions approved for ${skill}`);
            });

            return finalMap;

        } catch (error) {
            console.error(`[AI BULK SERVICE] Failed:`, error);
            return {};
        }
    }
}

class SmartMockAIService {
    async generateTechnicalQuestions(skill, count, difficulty) {
        const questions = [];
        for (let i = 1; i <= count; i++) {
            questions.push({
                question: `Mock Technical Question ${i} for ${skill}?`,
                options: ["Option A", "Option B", "Option C", "Option D"],
                correctAnswer: 0,
                explanation: `This is a mock explanation for ${skill} at ${difficulty} level.`
            });
        }
        return questions;
    }

    async generateContent(prompt) {
        const lower = prompt.toLowerCase();
        if (lower.includes('scenario titles')) {
            return JSON.stringify({ suggestions: [{ title: "Navigating Conflict", confidence: 0.9 }, { title: "Strategic Shift", confidence: 0.9 }] });
        }
        if (lower.includes('scenario description')) {
            return JSON.stringify({ description: "A complex scenario involving stakeholders and tight deadlines.", confidence: 0.95 });
        }
        if (lower.includes('questions')) {
            return JSON.stringify({ questions: [{ text: "How do you handle the pressure?", confidence: 0.9 }] });
        }
        if (lower.includes('technical questions')) {
            return JSON.stringify([
                {
                    question: "Mock Question 1?",
                    options: ["A", "B", "C", "D"],
                    correctAnswer: "A",
                    explanation: "Reason A"
                }
            ]);
        }
        if (lower.includes('leadership approaches') || lower.includes('mcq options') || lower.includes('leadership options') || lower.includes('generate 3 options')) {
            return JSON.stringify([
                {
                    text: "I understand your perspective and want to collaborate on a solution.",
                    approach: "Relationship",
                    moodDelta: 10,
                    scores: { competency1: 85, competency2: 80, competency3: 75, competency4: 70, competency5: 80, competency6: 75 }
                },
                {
                    text: "Let's focus on the data and project milestones to resolve this efficiently.",
                    approach: "Results",
                    moodDelta: 5,
                    scores: { competency1: 70, competency2: 85, competency3: 80, competency4: 90, competency5: 75, competency6: 80 }
                },
                {
                    text: "We need to maintain professional standards and clear boundaries in this situation.",
                    approach: "Boundary",
                    moodDelta: 15,
                    scores: { competency1: 75, competency2: 70, competency3: 90, competency4: 80, competency5: 85, competency6: 90 }
                }
            ]);
        }
        return JSON.stringify({
            competency1: 75,
            competency2: 70,
            competency3: 80,
            competency4: 65,
            competency5: 70,
            competency6: 75,
            totalScore: 7,
            reasoning: "Mock evaluation.",
            confidence: 0.8,
            evidence: ["Maintained a constructive tone."],
            overallFeedback: "Solid foundation shown."
        });
    }

    async summarize(text) {
        return ["Communicated clearly with stakeholders.", "Identified root cause effectively.", "Balanced technical needs with business goals."];
    }

    async analyzeImpact(transcript, role) {
        return {
            scores: [
                { competency: "Decision Making", score: 8, evidence: "Promptly chose a path forward." },
                { competency: "Communication", score: 7, evidence: "Professional tone throughout." }
            ],
            overallFeedback: "Strong performance with clear leadership potential."
        };
    }

    async scoreTextResponse(userText, prompt, rubricCriteria) {
        return {
            totalScore: 7,
            confidence: 0.8,
            evidence: ["Demonstrated clarity in communication."],
            breakdown: []
        };
    }
}

class ResilientAIService {
    constructor() {
        this.groqPool = [];
        this.mock = new SmartMockAIService();
        this.extractJSON = extractJSON;
        this.activeSource = { provider: 'Initial Connection...', model: 'Checking...', status: 'Pending' };

        console.log(`[AI DEBUG] GROQ_API_KEY present: ${!!process.env.GROQ_API_KEY}`);

        // Load Groq
        const groqKeys = [process.env.GROQ_API_KEY].filter(k => k && !k.includes('placeholder'));
        groqKeys.forEach(k => this.groqPool.push(new GroqAIService(k)));
        console.log(`[AI INITIALIZE] Groq Keys Loaded: ${this.groqPool.length}`);

        this.resetRotation();
    }

    resetRotation() {
        this.currentGroqIndex = 0;
    }

    getSource() { return this.activeSource; }

    async callAI(fnName, ...args) {
        const prompt = args[0];
        const isJson = args[1] === true;

        this.resetRotation();

        // Try Groq
        while (this.currentGroqIndex < this.groqPool.length) {
            const service = this.groqPool[this.currentGroqIndex];
            try {
                const res = await service[fnName](...args);
                this.activeSource = { provider: 'Groq Cloud', model: service.activeModel, keyIndex: this.currentGroqIndex + 1, status: 'Active (Free)' };
                return res;
            } catch (e) {
                console.warn(`[AI ERROR] Groq Key ${this.currentGroqIndex + 1} Failed for ${fnName}:`, e.message);
                this.currentGroqIndex++;
            }
        }

        // Fallback to Mock
        this.activeSource = { provider: 'Smart Mock', model: 'Rule-Based Local Engine', keyIndex: 0, status: 'Fallback' };
        if (this.mock[fnName]) return await this.mock[fnName](...args);
        return await this.mock.generateContent(prompt);
    }

    async generateContent(prompt, isJson = false) { return this.callAI('generateContent', prompt, isJson); }

    async generateTechnicalQuestions(skill, count, difficulty) {
        this.resetRotation();
        while (this.currentGroqIndex < this.groqPool.length) {
            const service = this.groqPool[this.currentGroqIndex];
            try {
                const res = await service.generateTechnicalQuestions(skill, count, difficulty);
                this.activeSource = { provider: 'Groq Cloud', model: service.activeModel, keyIndex: this.currentGroqIndex + 1, status: 'Active (Free)' };
                return res;
            } catch (e) {
                console.warn(`[AI ERROR] Groq Key ${this.currentGroqIndex + 1} Failed for Technical Questions:`, e.message);
                this.currentGroqIndex++;
            }
        }

        // Fallback to Mock
        this.activeSource = { provider: 'Smart Mock', model: 'Rule-Based Local Engine', keyIndex: 0, status: 'Fallback' };
        return await this.mock.generateTechnicalQuestions(skill, count, difficulty);
    }

    async generateBulkTechnicalQuestions(skillsMap, difficulty) {
        this.resetRotation();
        while (this.currentGroqIndex < this.groqPool.length) {
            const service = this.groqPool[this.currentGroqIndex];
            try {
                const res = await service.generateBulkTechnicalQuestions(skillsMap, difficulty);
                this.activeSource = { provider: 'Groq Cloud', model: service.activeModel, keyIndex: this.currentGroqIndex + 1, status: 'Active (Free)' };
                return res;
            } catch (e) {
                console.warn(`[AI ERROR] Groq Key ${this.currentGroqIndex + 1} Failed for Bulk Questions:`, e.message);
                this.currentGroqIndex++;
            }
        }

        // Fallback: targeted sequential mock generation
        console.log(`[AI BULK FALLBACK] Falling back to mock for ${Object.keys(skillsMap).length} skills`);
        const fallback = {};
        for (const [skill, count] of Object.entries(skillsMap)) {
            fallback[skill] = await this.mock.generateTechnicalQuestions(skill, count, difficulty);
        }
        return fallback;
    }

    async summarize(text) {
        try {
            const res = await this.generateContent(SUMMARIZE_TEMPLATE + text);
            if (this.activeSource.provider === 'Smart Mock') return this.mock.summarize(text);
            return res.split('\n').filter(l => l.trim().length > 0).map(s => s.replace(/^[- \d.]+/, '').trim());
        } catch (e) { return this.mock.summarize(text); }
    }

    async analyzeImpact(transcript, role) {
        try {
            const res = await this.generateContent(IMPACT_ANALYZE_TEMPLATE(role) + transcript, true);
            if (this.activeSource.provider === 'Smart Mock') return this.mock.analyzeImpact(transcript, role);
            const data = extractJSON(res);
            if (!data.scores) data.scores = [];
            return data;
        } catch (e) { return this.mock.analyzeImpact(transcript, role); }
    }

    async scoreTextResponse(userText, prompt, rubricCriteria) {
        const criteriaText = rubricCriteria.map(c => `- ${c.criterion} (${c.maxPoints} pts)`).join('\n');
        const p = `Score this response:\nPROMPT: ${prompt}\nRESPONSE: ${userText}\nRUBRIC:\n${criteriaText}\nReturn JSON with totalScore, confidence, evidence, breakdown.`;

        try {
            const res = await this.generateContent(p, true);
            if (this.activeSource.provider === 'Smart Mock') return this.mock.scoreTextResponse(userText, prompt, rubricCriteria);
            return extractJSON(res);
        } catch (e) { return this.mock.scoreTextResponse(userText, prompt, rubricCriteria); }
    }

    async generateCandidateSummary(candidateName, jobTitle, assessmentResults) {
        const resultsJson = JSON.stringify(assessmentResults, null, 2);
        const p = `Generate a professional, concise executive summary (3-4 sentences) for a candidate named ${candidateName} who applied for the ${jobTitle} position. 
        Focus on their technical proficiency, soft skills fit, and overall suitability based on these assessment results:
        ${resultsJson}
        The summary should highlight strengths and mention any areas for development if applicable. Keep it professional and actionable for a hiring manager.`;

        try {
            const res = await this.generateContent(p);
            if (this.activeSource.provider === 'Smart Mock') return "Candidate shown solid foundation in core technical areas with professional communication style.";
            return res.trim();
        } catch (e) {
            return "Candidate demonstrated required technical competencies and professional demeanor throughout the assessment.";
        }
    }
}

const ai = new ResilientAIService();
module.exports = ai;
