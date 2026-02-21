const Groq = require('groq-sdk');

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

/**
 * Analyze job description and extract skills, role info, and assessment config
 * @param {string} jobDescription - The full job description text
 * @returns {Promise<Object>} - Parsed JD analysis with skills, weights, question counts
 */
async function analyzeJobDescription(jobDescription) {
    try {
        const prompt = `You are an expert HR analyst. Analyze this job description and extract the following information in JSON format:

Job Description:
"""
${jobDescription}
"""

Return ONLY valid JSON (no markdown, no explanations) with this exact structure:
{
  "roleCategory": "Engineering" | "Sales" | "Marketing" | "Customer Success" | "Product" | "Operations" | "Leadership",
  "seniorityLevel": "Junior" | "Mid" | "Senior" | "Lead",
  "roleType": "IC" | "Manager" | "Senior IC",
  "technicalSkills": ["skill1", "skill2"],
  "softSkills": ["skill1", "skill2"],
  "domainSkills": ["skill1", "skill2"],
  "businessSkills": ["skill1", "skill2"],
  "technicalWeight": 0.0-1.0,
  "softSkillWeight": 0.0-1.0,
  "domainWeight": 0.0-1.0,
  "businessWeight": 0.0-1.0,
  "recommendedQuestionCount": {
    "technical": number,
    "scenarios": number,
    "totalTime": number
  },
  "minTechnicalScore": 60-80,
  "minSoftSkillScore": 50-70,
  "reasoning": "Brief explanation of weight decisions"
}

Guidelines:
- Technical skills: Programming languages, tools, frameworks
- Soft skills: Communication, leadership, teamwork
- Domain skills: Industry knowledge (HR, Finance, Healthcare, etc.)
- Business skills: Sales, analytics, strategy
- Weights must sum to 1.0
- For IC roles: higher technical weight (0.7-0.8)
- For Manager roles: balanced (0.4-0.5 technical, 0.3-0.4 soft)
- For Sales/CS roles: lower technical (0.1-0.2), higher soft (0.6-0.8)`;

        const response = await groq.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model: 'llama-3.3-70b-versatile',
            temperature: 0.3, // Lower temperature for more consistent output
            max_tokens: 2000
        });

        const content = response.choices[0].message.content.trim();

        // Remove markdown code blocks if present
        const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
        const jsonString = jsonMatch ? jsonMatch[1] : content;

        const analysis = JSON.parse(jsonString);

        // Validate weights sum to 1.0 (with small tolerance for floating point)
        const totalWeight = (analysis.technicalWeight || 0) +
            (analysis.softSkillWeight || 0) +
            (analysis.domainWeight || 0) +
            (analysis.businessWeight || 0);

        if (Math.abs(totalWeight - 1.0) > 0.01) {
            console.warn('Weights do not sum to 1.0, normalizing...');
            const factor = 1.0 / totalWeight;
            analysis.technicalWeight *= factor;
            analysis.softSkillWeight *= factor;
            if (analysis.domainWeight) analysis.domainWeight *= factor;
            if (analysis.businessWeight) analysis.businessWeight *= factor;
        }

        return analysis;
    } catch (error) {
        console.error('Error analyzing job description:', error);
        throw new Error('Failed to analyze job description: ' + error.message);
    }
}

/**
 * Generate scenario templates based on soft skills and JD context
 * @param {Array<string>} softSkills - List of soft skills to test
 * @param {string} roleCategory - Role category (Engineering, Sales, etc.)
 * @param {string} roleType - IC, Manager, etc.
 * @param {number} count - Number of scenarios to generate
 * @param {string} jobDescription - Full job description for context
 * @returns {Promise<Array>} - Array of scenario templates
 */
async function generateScenarioTemplates(softSkills, roleCategory, roleType, count = 3, jobDescription = '') {
    try {
        const prompt = `Generate ${count} workplace scenario templates for a ${roleType} in ${roleCategory}.

Test these soft skills: ${softSkills.join(', ')}

Job Description for context:
"""
${jobDescription}
"""

Return ONLY valid JSON array with this structure:
[
  {
    "theme": "Leadership" | "Communication" | "Problem-solving" | "Teamwork" | "Conflict Resolution",
    "metrics": ["Team Morale", "Trust", "Productivity"],
    "metricPolarity": {
      "Team Morale": "high",
      "Trust": "high",
      "Productivity": "high"
    },
    "prompt": "Detailed prompt for AI to generate the actual scenario. Include specific role-appropriate challenges mentioned or implied in the JD.",
    "applicableRoles": ["Manager", "Senior IC"]
  }
]

Make scenarios highly realistic, challenging, and specific to the role described in the JD. Avoid generic workplace clichés.`;

        const response = await groq.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model: 'llama-3.3-70b-versatile',
            temperature: 0.7,
            max_tokens: 2000
        });

        const content = response.choices[0].message.content.trim();
        const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
        const jsonString = jsonMatch ? jsonMatch[1] : content;

        return JSON.parse(jsonString);
    } catch (error) {
        console.error('Error generating scenario templates:', error);
        throw new Error('Failed to generate scenarios: ' + error.message);
    }
}

module.exports = {
    analyzeJobDescription,
    generateScenarioTemplates
};
