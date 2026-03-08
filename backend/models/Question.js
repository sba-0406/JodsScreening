const mongoose = require('mongoose');

const QuestionSchema = new mongoose.Schema({
    // Skill Classification
    skill: {
        type: String,
        required: true,
        index: true
    },
    category: String, // Backend, Frontend, Database, Domain, etc.
    difficulty: {
        type: String,
        enum: ['Easy', 'Medium', 'Hard'],
        required: true,
        index: true
    },

    // Question Content
    question: {
        type: String,
        required: true
    },
    options: {
        type: [String],
        required: true,
        validate: [arrayLimit, 'Must have exactly 4 options']
    },
    correctAnswer: {
        type: Number,
        required: true,
        min: 0,
        max: 3
    },
    explanation: String,

    // Metadata
    tags: [String],
    createdBy: String, // 'admin', 'ai', or user ID
    reviewedBy: String,
    isVerified: {
        type: Boolean,
        default: false
    },
    source: String, // Where the question came from

    // Quality Metrics
    usageCount: {
        type: Number,
        default: 0
    },
    avgScore: Number, // % of candidates who got it right
    discriminationIndex: Number, // How well it separates strong/weak candidates

    // Status
    status: {
        type: String,
        enum: ['active', 'retired', 'pending_review'],
        default: 'active'
    },

    // Flags
    flagCount: {
        type: Number,
        default: 0
    },
    flagReasons: [String],

    // Timestamps
    createdAt: {
        type: Date,
        default: Date.now
    },
    lastUsed: Date,
    lastReviewed: Date
});

// Validator for options array
function arrayLimit(val) {
    return val.length === 4;
}

// Indexes for faster queries
QuestionSchema.index({ skill: 1, difficulty: 1, status: 1 });
QuestionSchema.index({ category: 1 });

// Update usage stats
QuestionSchema.methods.recordUsage = function (wasCorrect) {
    this.usageCount += 1;
    this.lastUsed = Date.now();

    // Update average score
    if (this.avgScore === undefined) {
        this.avgScore = wasCorrect ? 100 : 0;
    } else {
        this.avgScore = ((this.avgScore * (this.usageCount - 1)) + (wasCorrect ? 100 : 0)) / this.usageCount;
    }

    return this.save();
};

module.exports = mongoose.model('Question', QuestionSchema);
