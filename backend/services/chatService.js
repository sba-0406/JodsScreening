const aiService = require('./aiService');


// 3. The Actor (Chat Response)
exports.generateResponse = async (history, persona, userRole) => {
  const worldStateStr = persona.worldState ?
    Object.entries(persona.worldState).map(([k, v]) => `- ${k}: ${v}/100`).join('\n') :
    "No metrics available.";

  const prompt = `Roleplay Mode: ACTIVE.
You are roleplaying as "${persona.name}", with the job title "${persona.role}".
You are currently in a high-stakes meeting with the ${userRole}.

SCENARIO CONTEXT:
${persona.context}

YOUR CURRENT WORLD STATE:
${worldStateStr}

YOUR GOAL:
You are a realistic stakeholder. You have your own professional agenda (the SCENARIO CONTEXT) which naturally conflicts with the ${userRole}'s perspective.
- Be firm and stick to your goal, but stay professional.
- Acknowledge the ${userRole}'s reasonable points, but explain the constraints that make it difficult to agree.
- Do NOT be an unreasonable villain; be a difficult colleague/partner.
- CRITICAL: You are NOT the ${userRole}. Do not do their job for them. You represent your own department's interests.

Conversation History:
${history.map(m => `${m.sender === 'user' ? userRole.toUpperCase() : persona.name.toUpperCase()}: ${m.text}`).join('\n')}

Reply ONLY as "${persona.name}". Keep it SHORT (1-2 sentences). Be firm and challenging.
Response:`;

  try {
    const response = await aiService.generateContent(prompt);
    return response.trim().replace(/^"|"$/g, '');
  } catch (e) {
    return "...";
  }
};

// 4. The Analyzer (Sidecar)
exports.analyzeTurn = async (lastUserMessage, context) => {
  const prompt = `Real-Time Analysis.
Evaluate the User's last message: "${lastUserMessage}"
Context: User is trying to "${context.goal}".
Opponent is "${context.mood}".

Rate the User (0-100):
- Empathy: Did they acknowledge feelings?
- Professionalism: Did they stay calm?
- Strategy: did they move towards the goal?

Return ONLY valid JSON:
{
  "empathy": 0-100,
  "professionalism": 0-100,
  "notes": "One short insight (max 10 words)"
}`;

  const fallback = { empathy: 50, professionalism: 50, notes: "Neutral response." };

  try {
    const text = await aiService.generateContent(prompt);
    return aiService.extractJSON(text);
  } catch (e) {
    return fallback;
  }
};

// ========================================
// MULTI-SCENARIO DOJO SYSTEM
// ========================================



// Scenario templates for each role (3 scenarios per role)
const SCENARIO_TEMPLATES = {
  Manager: [
    { stakeholder: 'Angry Client', description: 'A major client is furious about a missed deadline and threatens to cancel the contract.' },
    { stakeholder: 'Underperforming Team Member', description: 'A team member consistently misses deadlines and seems disengaged.' },
    { stakeholder: 'Executive in Budget Crisis', description: 'The CFO demands a 30% budget cut to your department immediately.' }
  ],
  Developer: [
    { stakeholder: 'Stubborn Senior Developer', description: 'A senior dev insists on a technical approach you believe is wrong.' },
    { stakeholder: 'Stressed Project Manager', description: 'The PM wants to add more features despite the tight deadline.' },
    { stakeholder: 'Junior Developer Struggling', description: 'A junior team member is overwhelmed and considering quitting.' }
  ],
  HR: [
    { stakeholder: 'Harassment Complaint', description: 'An employee reports feeling harassed by their manager.' },
    { stakeholder: 'Salary Negotiation', description: 'A top performer demands a 40% raise or they will leave.' },
    { stakeholder: 'Team Conflict', description: 'Two team members refuse to work together after a public argument.' }
  ],
  Executive: [
    { stakeholder: 'Board Member Questioning Strategy', description: 'A board member publicly challenges your Q3 strategy in a meeting.' },
    { stakeholder: 'Major Client Escalation', description: 'Your biggest client CEO calls threatening to switch to a competitor.' },
    { stakeholder: 'Union Negotiation', description: 'Union representatives demand better benefits during a cost-cutting phase.' }
  ]
};

// Generate 3 unique scenarios for a role
exports.generateScenarioSet = function (role) {
  const templates = SCENARIO_TEMPLATES[role] || SCENARIO_TEMPLATES.Manager;
  return templates.map((template, index) => ({
    scenarioNumber: index + 1,
    stakeholder: template.stakeholder,
    description: template.description,
    status: index === 0 ? 'in-progress' : 'pending',
    moodLevel: 30, // Start with low mood (angry/tense)
    resolution: null
  }));
};

/*
// DEPRECATED: generateMCQOptions is replaced by dynamic behavioral evaluation
exports.generateMCQOptions = async function (history, scenarioDescription, worldState, role) {
  ...
};
*/

// 5. Final Report Generator
exports.generateFinalReport = async function (data) {
  const skillScoresStr = Object.entries(data.skillScores).map(([k, v]) => `- ${k}: ${v} points`).join('\n');

  const prompt = `You are a Senior Executive Coach. Analyze this simulation performance.
    
    Role: ${data.role}
    Skill Performance:
    ${skillScoresStr}
    
    Strengths Identified: ${data.strengths.join(', ')}
    Areas for Improvement: ${data.improvements.join(', ')}

    Write a professional 2-3 sentence performance summary for the user.
    Sound insightful and encouraging. Focus on behaviors.
    Summary:`;

  try {
    return await aiService.generateContent(prompt);
  } catch (e) {
    return `You demonstrated a good understanding of ${data.role} challenges. Focus on balancing your ${data.improvements[0]} with your strong ${data.strengths[0]}.`;
  }
};
