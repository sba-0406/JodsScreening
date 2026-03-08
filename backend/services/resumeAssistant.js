const pdf = require('pdf-parse');
const ai = require('./aiService');
const fs = require('fs');
const axios = require('axios');

class ResumeAssistant {
    /**
     * Extracts plain text from a resume buffer
     */
    async extractTextFromBuffer(buffer) {
        try {
            const data = await pdf(buffer);
            return data.text;
        } catch (error) {
            console.error('[RESUME PARSE ERROR]', error.message);
            return "";
        }
    }

    /**
     * Extracts plain text from a resume (PDF)
     */
    async extractText(location) {
        try {
            let dataBuffer;
            if (location.startsWith('http')) {
                if (location.includes('amazonaws.com')) {
                    const { GetObjectCommand } = require('@aws-sdk/client-s3');
                    const s3 = require('../config/s3');
                    const url = new URL(location);
                    
                    // Extract bucket name from env or hostname
                    const bucket = process.env.AWS_BUCKET_NAME || url.hostname.split('.')[0];
                    // Pathname starts with /, so we remove it to get the key
                    let key = decodeURIComponent(url.pathname.substring(1));
                    
                    // If path styling was used (s3.region.amazonaws.com/bucket/key), remove bucket from key
                    if (key.startsWith(bucket + '/')) {
                        key = key.substring(bucket.length + 1);
                    }

                    const command = new GetObjectCommand({
                        Bucket: bucket,
                        Key: key
                    });
                    const response = await s3.send(command);
                    dataBuffer = Buffer.from(await response.Body.transformToByteArray());
                } else {
                    const response = await axios.get(location, { responseType: 'arraybuffer' });
                    dataBuffer = Buffer.from(response.data);
                }
            } else {
                dataBuffer = fs.readFileSync(location);
            }

            const data = await pdf(dataBuffer);
            return data.text;
        } catch (error) {
            console.error('[RESUME PARSE ERROR]', error.message);
            return "";
        }
    }

    /**
     * Extracts skills from resume text using AI, with a keyword-based fallback
     */
    async extractSkills(text) {
        if (!text || text.length < 50) return [];

        const prompt = `Extract a flat list of technical skills, methodologies, frameworks, and professional tools from the following resume text. 
        Focus on specific competencies (e.g., ADDIE, SAM, Agile), software (e.g., Articulate, Photoshop), and technical languages.
        Return ONLY a JSON array of strings. No duplicates.
        
        RESUME TEXT:
        ${text.substring(0, 6000)}
        `;

        try {
            const result = await ai.generateContent(prompt, true);
            const skills = typeof result === 'string' ? JSON.parse(result.match(/\[.*\]/s)[0]) : result;
            
            if (Array.isArray(skills) && skills.length > 0) return skills;
            throw new Error("Empty AI response");
        } catch (e) {
            console.warn('[SKILL EXTRACTION] AI failed, using keyword fallback:', e.message);
            return this._keywordFallback(text);
        }
    }

    /**
     * Deterministic fallback for common skills
     */
    _keywordFallback(text) {
        const commonSkills = [
            "Photoshop", "Illustrator", "Figma", "PowerPoint", "InDesign", "Sketch", "Canva", "CorelDraw",
            "React", "Vue", "Angular", "Node.js", "Express", "MongoDB", "SQL", "Python", "JavaScript",
            "TypeScript", "HTML", "CSS", "Excel", "Word", "Outlook", "Teams", "Docker", "AWS", "Azure",
            "Project Management", "Agile", "Scrum", "UI/UX", "Graphic Design", "Motion Graphics", "After Effects"
        ];
        
        const textLower = text.toLowerCase();
        const found = commonSkills.filter(skill => {
            // Match whole word or specific common variations
            const regex = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
            return regex.test(textLower);
        });
        
        return found;
    }

    /**
     * Autofills application data based on extracted text
     */
    async getAutofillData(text) {
        const prompt = `From the resume text below, extract:
        1. Full Name
        2. Email
        3. Phone Number
        4. Approximate Years of Professional Experience. 
           - If a "summary" or "profile" section explicitly mentions a number (e.g., "10+ years"), USE THAT NUMBER. 
           - Otherwise, calculate years from the earliest listed job to the present year 2026.
           - Return as a single number (e.g., 10).
        
        Return ONLY a JSON object: {"name": "", "email": "", "phone": "", "years": 0}
        
        RESUME TEXT:
        ${text.substring(0, 2000)}
        `;

        try {
            const result = await ai.generateContent(prompt, true);
            return typeof result === 'string' ? JSON.parse(result.match(/\{.*\}/s)[0]) : result;
        } catch (e) {
            return {};
        }
    }
}

module.exports = new ResumeAssistant();
