const mongoose = require('mongoose');

const AssessmentSchema = new mongoose.Schema({
    // Job Reference
    job: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Job',
        required: true
    },

    // Role Classification
    roleCategory: String, // Engineering, Sales, etc.
    seniorityLevel: String, // Junior, Mid, Senior, Lead
    roleType: String, // IC, Manager, etc.

    // Extracted Skills
    technicalSkills: [String],
    softSkills: [String],
    domainSkills: [String],
    businessSkills: [String],

    // Assessment Weights
    technicalWeight: {
        type: Number,
        default: 0.7
    },
    softSkillWeight: {
        type: Number,
        default: 0.3
    },
    domainWeight: Number,
    businessWeight: Number,

    // Technical Questions (pre-selected from bank)
    technicalQuestions: [{
        questionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Question'
        },
        skill: String,
        difficulty: String
    }],

    // Scenario Templates (AI-generated)
    scenarioTemplates: [{
        theme: String, // Leadership, Communication, etc.
        metrics: [String], // Team Morale, Trust, etc.
        metricPolarity: {
            type: Map,
            of: String // 'high' or 'low'
        },
        prompt: String, // AI prompt for generation
        applicableRoles: [String]
    }],

    // Passing Thresholds
    minTechnicalScore: {
        type: Number,
        default: 70
    },
    minSoftSkillScore: {
        type: Number,
        default: 60
    },

    // Question Counts
    questionCounts: {
        technical: Number,
        scenarios: Number,
        totalTime: Number // in minutes
    },

    // Missing Skills (not in question bank)
    missingSkills: [String],
    skillMappings: {
        type: Map,
        of: String // original skill -> mapped skill
    },

    // Simulation Physics (Dynamic Metrics & Effects)
    simulationConfig: {
        metrics: [String],
        metricPolarity: {
            type: Map,
            of: String
        },
        approachEffects: {
            type: Map,
            of: Map // Relationship -> { Metric: Delta }
        }
    },

    // AI Analysis
    aiAnalysis: {
        reasoning: String,
        confidence: Number,
        recommendations: [String]
    },

    // Metadata
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: Date,

    // Status
    status: {
        type: String,
        enum: ['draft', 'pending_review', 'active'],
        default: 'active'
    },

    // Usage Analytics
    timesUsed: {
        type: Number,
        default: 0
    },
    avgCompletionTime: Number,
    avgTechnicalScore: Number,
    avgSoftSkillScore: Number
});

// Update timestamp on save
AssessmentSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('Assessment', AssessmentSchema);
