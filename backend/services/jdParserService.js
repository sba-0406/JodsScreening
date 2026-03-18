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
-seniorityLevel: Junior, Mid, Senior, Lead (Based on the job description,experience required)
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
    console.log('[JD_PARSER] Raw AI Analysis Content:', content);

    // Remove markdown code blocks if present
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
    const jsonString = jsonMatch ? jsonMatch[1] : content;

    let analysis;
    try {
      analysis = JSON.parse(jsonString);
    } catch (e) {
      console.error('[JD_PARSER] Failed to parse analysis JSON:', e.message);
      console.error('[JD_PARSER] Problematic JSON string:', jsonString);
      throw new Error('AI returned invalid analysis format');
    }

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
 * @param {string} jobTitle - Actual job title (e.g. "Senior Backend Engineer")
 * @returns {Promise<Array>} - Array of scenario templates
 */
async function generateScenarioTemplates(softSkills, roleCategory, roleType, count = 3, jobDescription = '', jobTitle = '') {
  try {
    const isComposite = count < softSkills.length;
    const prompt = `Generate exactly ${count} realistic workplace scenario templates for a ${roleType} in ${roleCategory}.
${isComposite ? `Since we only have ${count} scenarios to test ${softSkills.length} skills, each scenario MUST be a "Composite Scenario" that probes multiple skills from this list: ${softSkills.join(', ')}.` : `STRICT REQUIREMENT: You MUST generate exactly one scenario for EACH of the following soft skills: ${softSkills.join(', ')}.`}

Job Description Context:
"""
${jobDescription}
"""

Return ONLY valid JSON with exactly two keys: "scenarios" and "physics".

EXACT STRUCTURE (no extra fields):
{
  "scenarios": [
    {
      "softSkill": "${isComposite ? "Primary skill being tested (e.g. 'Communication')" : "The EXACT name of the soft skill from the list"}",
      "otherSkills": ${isComposite ? "[\"List of 1-2 additional skills also tested in this prompt\"]" : "[]"},
      "theme": "A short, catchy title for the situation",
      "stakeholder": "The specific job title of the person the candidate of job title or role type ${jobTitle || roleType} is speaking with",
      "prompt": "A specific, realistic workplace challenge. ${isComposite ? "This prompt must be complex enough to trigger 2-3 different soft skills from the list." : "This prompt should specifically test the main soft skill."}",
      "applicableRoles": ["${roleType}"]
    }
  ],
  "physics": {
    "metrics": ["MetricA", "MetricB", "MetricC"],
    "polarity": {
      "MetricA": "high",
      "MetricB": "high",
      "MetricC": "low"
    }
  }
}

RULES — follow exactly:
1. QUANTITY: Return exactly ${count} scenarios.
2. SOFTSKILL: The 'softSkill' field MUST be the exact name of a soft skill from the list provided.
3. THEME: A creative title related to the situation.
4. METRICS: Choose exactly 3 metrics that are critical success factors for THIS specific job role and soft skill/soft skills.
5. POLARITY: "high" = higher is better. "low" = higher is worse.
6. SCENARIOS: Be specific to the job. Each prompt should describe a concrete stakeholder, their complaint/demand, and high stakes.
7. ROLE: The candidate's role in the scenario should be exactly '${jobTitle || roleType}'.
8. STAKEHOLDER: The 'stakeholder' field must be a professional job title.`;

    const response = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.7,
      max_tokens: 3000
    });

    const content = response.choices[0].message.content.trim();
    console.log('[SCENARIO_PARSER] Raw AI Scenario Content:', content);

    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
    const jsonString = jsonMatch ? jsonMatch[1] : content;

    try {
      return JSON.parse(jsonString);
    } catch (e) {
      console.error('[SCENARIO_PARSER] Failed to parse scenario JSON:', e.message);
      console.error('[SCENARIO_PARSER] Problematic JSON string:', jsonString);
      throw new Error('AI returned invalid scenario format');
    }
  } catch (error) {
    console.error('Error generating scenario templates:', error);
    throw new Error('Failed to generate scenarios: ' + error.message);
  }
}

module.exports = {
  analyzeJobDescription,
  generateScenarioTemplates
};
