const mongoose = require('mongoose');

const ChatSessionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  archetype: {
    role: { type: String, required: true }, // e.g. 'Manager'
    type: { type: String, required: true }, // e.g. 'CRISIS'
    goal: { type: String }, // Optional for assessment
    intensity: { type: String, default: 'Medium' }
  },
  // Assessment specific fields
  application: { type: mongoose.Schema.Types.ObjectId, ref: 'Application' },
  assessmentPhase: { type: String, enum: ['MCQ', 'SCENARIO', 'COMPLETED'], default: 'MCQ' },
  currentMCQIndex: { type: Number, default: 0 },
  mcqAnswers: [{
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question' },
    answerIndex: Number,
    isCorrect: Boolean,
    skill: String
  }],

  persona: {
    name: { type: String, required: true }, // e.g. 'Sarah'
    role: { type: String, required: true }, // e.g. 'Senior Developer'
    mood: { type: String, required: true }, // e.g. 'Frustrated'
    instructions: { type: String }, // Backwards compatibility
    briefing: {
      situation: String,
      objective: String,
      stakes: String
    }
  },
  messages: [{
    sender: { type: String, enum: ['user', 'ai'], required: true },
    text: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    analysis: { // The "Sidecar" analysis for this turn
      sentiment: { type: Number }, // 1-100 (Negative -> Positive)
      empathy: { type: Number }, // 1-100
      professionalism: { type: Number }, // 1-100
      notes: { type: String }
    }
  }],
  status: {
    type: String,
    enum: ['active', 'completed', 'abandoned'],
    default: 'active'
  },
  scenarioProgress: {
    currentScenario: { type: Number, default: 1 }, // 1, 2, or 3
    totalScenarios: { type: Number, default: 3 },
    scenarios: [{
      scenarioNumber: Number,
      stakeholder: String,  // e.g. 'Angry Client', 'Team Member'
      description: String,
      status: {
        type: String,
        enum: ['pending', 'in-progress', 'resolved', 'failed'],
        default: 'pending'
      },
      startedAt: Date,
      completedAt: Date,
      moodLevel: { type: Number, default: 50 }, // 0-100 (0=furious, 100=satisfied)
      resolution: { type: String, enum: ['success', 'timeout', 'skipped', null], default: null }
    }]
  },
  worldState: {
    type: Map,
    of: Number,
    default: {}
  },
  metricPolarity: {
    type: Map,
    of: String, // 'high' or 'low'
    default: {}
  },
  skillScores: {
    type: Map,
    of: Number,
    default: {}
  },
  turnCount: {
    type: Number,
    default: 0
  },
  messageCount: { type: Number, default: 0 },
  completedAt: Date,
  finalReport: {
    roleAssessed: String,
    scenariosCompleted: Number,
    competencyScores: Object,  // Role-specific competency names mapped to scores
    roleRequirements: Object,   // Expected scores for this role
    gapAnalysis: {
      strengths: [String],
      improvements: [String]
    },
    overallGrade: String,
    recommendation: String
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('ChatSession', ChatSessionSchema);
