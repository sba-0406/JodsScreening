const ChatSession = require('../models/ChatSession');
const chatService = require('../services/chatService');
const aiService = require('../services/aiService');
const { roleConfigs } = require('../config/simulationConfig');

/**
 * Helper: Calculate Grade
 */
function getGrade(score) {
  if (score >= 95) return 'S';
  if (score >= 85) return 'A';
  if (score >= 75) return 'B';
  if (score >= 65) return 'C';
  if (score >= 55) return 'D';
  return 'F';
}

/**
 * Start a new Dojo 3-Scenario Journey
 */
exports.startDojoSession = async (req, res) => {
  try {
    const { role } = req.body;
    if (!role || !roleConfigs[role]) {
      return res.status(400).json({ success: false, error: 'Valid role is required' });
    }

    const config = roleConfigs[role];
    const scenarios = config.scenarios.map((s, i) => ({
      scenarioNumber: i + 1,
      stakeholder: s.stakeholder,
      description: s.description,
      status: i === 0 ? 'in-progress' : 'pending',
      moodLevel: 50,
      resolution: null
    }));

    // Initialize skill scores based on role-specific skills
    const skillScores = {};
    Object.values(config.skills).forEach(skillName => {
      skillScores[skillName] = 0;
    });

    const session = await ChatSession.create({
      user: req.user._id,
      archetype: {
        role,
        type: 'MULTI_SCENARIO_DOJO',
        goal: config.goal || `Master the role of ${role}`,
        intensity: 'High'
      },
      persona: {
        name: scenarios[0].stakeholder,
        role: scenarios[0].stakeholder,
        mood: 'Neutral',
        briefing: {
          situation: scenarios[0].description,
          objective: `Navigate the situation effectively as a ${role}`,
          stakes: "Professional success and team stability"
        }
      },
      scenarioProgress: {
        currentScenario: 1,
        totalScenarios: scenarios.length,
        scenarios
      },
      worldState: config.initialState,
      metricPolarity: config.metricPolarity, // Add polarity for UI
      skillScores: skillScores,
      turnCount: 0,
      status: 'active',
      messages: []
    });

    console.log(`[DOJO] Started session ${session._id} for role ${role}`);
    res.status(201).json({ success: true, data: session });
  } catch (err) {
    console.error('[DOJO ERROR] startDojoSession:', err);
    res.status(500).json({ success: false, error: 'Failed to start dojo session' });
  }
};

/**
 * Handle user response (Free-text or MCQ)
 */
exports.respondToScenario = async (req, res) => {
  try {
    const { sessionId, message, mcqChoice } = req.body;
    const session = await ChatSession.findById(sessionId);

    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

    if (session.status === 'completed') {
      return res.status(200).json({ success: true, data: { isComplete: true } });
    }

    const role = session.archetype.role;
    const config = roleConfigs[role];
    const currentScenarioIndex = session.scenarioProgress.currentScenario - 1;
    const currentScenario = session.scenarioProgress.scenarios[currentScenarioIndex];

    let userMessage = String(message || '').trim();
    let approach = 'Results'; // Default

    /* 
    // DEPRECATED: Initial MCQ generation is no longer used
    if (!userMessage && !mcqChoice) {
      const mcqOptions = await chatService.generateMCQOptions(...);
      return res.status(200).json({ ... });
    }
    */

    /*
    // DEPRECATED: MCQ Choice handling
    if (mcqChoice) { ... }
    */

    // --- NEW DYNAMIC EVALUATION ---
    // 1. Analyze user response using AI Judge
    const currentMetrics = Array.from(session.worldState.entries()).map(([name, value]) => ({ name, value }));
    const evaluation = await aiService.evaluateBehavioralResponse(
      { prompt: currentScenario.description, softSkill: session.persona.name },
      userMessage,
      currentMetrics
    );

    console.log(`[AI JUDGE] Evaluation for ${session._id}:`, evaluation);

    // 2. Apply deltas to worldState
    if (evaluation.deltas) {
      for (const [metric, delta] of Object.entries(evaluation.deltas)) {
        const currentVal = session.worldState.get(metric) || 50;
        session.worldState.set(metric, Math.max(0, Math.min(100, currentVal + delta)));

        // Track skill scores (using the target soft skill for this scenario)
        // We'll give a fraction of the delta to the skill score if it's positive
        const targetSkill = session.persona.name; // In Dojo, theme/skill is stored in persona.name/role for now
        if (delta > 0) {
          const currentSkillScore = session.skillScores.get(targetSkill) || 0;
          session.skillScores.set(targetSkill, currentSkillScore + delta);
        }
      }
    }

    const aiResponseText = evaluation.feedback || "I understand. Let's see how this plays out.";

    // 3. Update session state
    session.turnCount += 1;
    session.messageCount += 1;
    session.messages.push({ sender: 'user', text: userMessage });
    session.messages.push({ sender: 'ai', text: aiResponseText });

    // Optional: Still generate the persona-voiced response if we want it to feel more immersive
    /*
    const history = session.messages.map(m => ({ sender: m.sender, text: m.text }));
    const personaResponse = await chatService.generateResponse(history, {
      name: currentScenario.stakeholder,
      role: currentScenario.stakeholder,
      context: currentScenario.description,
      worldState: Object.fromEntries(session.worldState)
    }, role);
    session.messages.push({ sender: 'ai', text: personaResponse });
    */

    // DEPRECATED: MCQ generation
    const mcqOptions = [];

    // Scenario Transition Logic
    // For demo: 4 turns per scenario, or based on mood? 
    // User suggested 5 turns total, but also "3 continuous like it is".
    // Let's do 3 turns per scenario, 3 scenarios = 9 turns total.
    const turnsInCurrentScenario = session.turnCount % 3;
    const isScenarioOver = turnsInCurrentScenario === 0 && session.turnCount > 0;
    const isLastScenario = session.scenarioProgress.currentScenario >= session.scenarioProgress.totalScenarios;

    session.markModified('worldState');
    session.markModified('skillScores');
    await session.save();

    res.status(200).json({
      success: true,
      data: {
        message: aiResponseText,
        worldState: Object.fromEntries(session.worldState),
        mcqOptions: [], // DEPRECATED
        isResolved: isScenarioOver,
        isLastScenario: isLastScenario && isScenarioOver,
        scenario: currentScenario
      }
    });

  } catch (err) {
    console.error('[DOJO ERROR] respondToScenario:', err);
    res.status(500).json({ success: false, error: 'Internal system error' });
  }
};

/**
 * Advance or Finalize Session
 */
exports.nextScenario = async (req, res) => {
  try {
    const { sessionId, reason } = req.body;
    const session = await ChatSession.findById(sessionId);
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

    const currentIdx = session.scenarioProgress.currentScenario - 1;
    const current = session.scenarioProgress.scenarios[currentIdx];

    current.resolution = reason || 'success';
    current.status = (reason === 'failed') ? 'failed' : 'resolved';
    current.completedAt = new Date();

    const isLast = session.scenarioProgress.currentScenario >= session.scenarioProgress.totalScenarios;

    if (!isLast) {
      session.scenarioProgress.currentScenario += 1;
      const nextIdx = session.scenarioProgress.currentScenario - 1;
      const next = session.scenarioProgress.scenarios[nextIdx];

      next.status = 'in-progress';
      next.startedAt = new Date();

      session.persona.name = next.stakeholder;
      session.persona.role = next.stakeholder;
      session.persona.briefing.situation = next.description;
      session.messages = []; // Clear history for new scenario context

      console.log(`[DOJO] Advancing to Scenario ${session.scenarioProgress.currentScenario}`);
    } else {
      session.status = 'completed';
      session.completedAt = new Date();
      console.log(`[DOJO] Simulation Complete. Status -> Completed`);
    }

    session.markModified('scenarioProgress.scenarios');
    await session.save();

    res.status(200).json({
      success: true,
      data: {
        currentScenario: session.scenarioProgress.currentScenario,
        isComplete: session.status === 'completed'
      }
    });
  } catch (err) {
    console.error('[DOJO ERROR] nextScenario:', err);
    res.status(500).json({ success: false, error: 'Failed to advance simulation' });
  }
};

/**
 * Finalize Report Construction
 */
exports.finalizeDojoSession = async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = await ChatSession.findById(sessionId);
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

    const role = session.archetype.role;
    const skillScores = Object.fromEntries(session.skillScores);

    // Strengths and Weaknesses derived from skill scores
    const strengths = [];
    const improvements = [];

    Object.entries(skillScores).forEach(([skill, score]) => {
      if (score >= 20) strengths.push(skill);
      else improvements.push(skill);
    });

    // Optional: Determine "Better Role" suggestion
    const allSessions = await ChatSession.find({ user: req.user._id, status: 'completed' });
    const averages = {};
    const gradeHierarchy = { 'S': 6, 'A': 5, 'B': 4, 'C': 3, 'D': 2, 'F': 1 };

    allSessions.forEach(s => {
      if (s.finalReport && s.finalReport.overallGrade) {
        const r = s.archetype.role;
        const g = gradeHierarchy[s.finalReport.overallGrade];
        if (!averages[r]) averages[r] = { total: 0, count: 0 };
        averages[r].total += g;
        averages[r].count += 1;
      }
    });

    let bestRole = role;
    let maxAvg = 0;
    Object.entries(averages).forEach(([r, data]) => {
      const avg = data.total / data.count;
      if (avg > maxAvg) {
        maxAvg = avg;
        bestRole = r;
      }
    });

    // Generate AI Narrative Summary
    const summary = await chatService.generateFinalReport({
      role,
      skillScores,
      strengths,
      improvements
    });

    // Calculate Performance Multiplier based on Metric Health
    const roleConfig = require('../config/simulationConfig').roleConfigs[role];
    const finalMetrics = Object.fromEntries(session.worldState);
    const metricPolarity = roleConfig.metricPolarity;

    let totalHealth = 0;
    let metricCount = 0;

    Object.entries(finalMetrics).forEach(([metric, value]) => {
      const polarity = metricPolarity[metric];
      let health = 0;

      if (polarity === 'high') {
        // Higher values are better (e.g., trust, morale)
        health = value / 100;
      } else if (polarity === 'low') {
        // Lower values are better (e.g., risk, stress)
        health = (100 - value) / 100;
      }

      totalHealth += health;
      metricCount += 1;
    });

    const performanceMultiplier = metricCount > 0 ? totalHealth / metricCount : 1.0;

    // Calculate grade with performance multiplier
    const skillAverage = Object.values(skillScores).reduce((a, b) => a + b, 0) / Object.keys(skillScores).length;
    const adjustedScore = (skillAverage * performanceMultiplier * 2) + 30;
    const finalGrade = getGrade(adjustedScore);

    const report = {
      roleAssessed: role,
      scenariosCompleted: session.scenarioProgress.scenarios.length,
      skillScores,
      gapAnalysis: { strengths, improvements },
      overallGrade: finalGrade,
      performanceMultiplier: Math.round(performanceMultiplier * 100) / 100, // Store for transparency
      recommendation: summary,
      bestSuitedRole: bestRole
    };

    session.finalReport = report;
    session.status = 'completed';
    session.completedAt = new Date();
    await session.save();

    console.log(`[DOJO] Report Finalized for Session ${session._id}`);
    res.status(200).json({ success: true, data: report });

  } catch (err) {
    console.error('[DOJO ERROR] finalizeDojoSession:', err);
    res.status(500).json({ success: false, error: 'Failed to generate comprehensive report' });
  }
};

/**
 * Retrieval
 */
exports.getDojoSession = async (req, res) => {
  try {
    const session = await ChatSession.findById(req.params.id);
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
    res.status(200).json({ success: true, data: session });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Data retrieval error' });
  }
};
