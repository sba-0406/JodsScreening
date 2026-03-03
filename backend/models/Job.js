const mongoose = require('mongoose');

const JobSchema = new mongoose.Schema({
    // Basic Information
    title: {
        type: String,
        required: true
    },
    department: {
        type: String,
        required: true
    },
    location: {
        type: String,
        required: true
    },
    experienceMin: {
        type: Number,
        required: true
    },
    experienceMax: {
        type: Number,
        required: true
    },
    employmentType: {
        type: String,
        enum: ['Full-time', 'Part-time', 'Contract'],
        default: 'Full-time'
    },

    // Salary Information
    salaryMin: Number,
    salaryMax: Number,
    salaryCurrency: {
        type: String,
        default: 'INR'
    },

    // Job Description
    description: {
        type: String,
        required: true
    },

    // Company Information
    companyName: String,
    companyDescription: String,
    companyWebsite: String,

    // Assessment Configuration
    assessmentConfig: {
        questionsPerSkill: { // Default global count
            type: Number,
            default: 2
        },
        skillConfigs: [{
            skill: String,
            questionCount: {
                type: Number,
                default: 2
            }
        }],
        allowAIGeneration: {
            type: Boolean,
            default: false
        }
    },
    // Ranking Weights (for Backend Intelligence)
    rankingWeights: {
        technicalWeight: { type: Number, default: 0.4 }, // 40%
        softSkillWeight: { type: Number, default: 0.3 }, // 30%
        experienceWeight: { type: Number, default: 0.3 }  // 30%
    },

    // Assessment Reference
    assessmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Assessment'
    },

    // Application Settings
    requireAssessment: {
        type: Boolean,
        default: true
    },
    allowResumeUpload: {
        type: Boolean,
        default: true
    },
    requireCoverLetter: {
        type: Boolean,
        default: false
    },
    applicationDeadline: Date,

    // Metadata
    postedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    status: {
        type: String,
        enum: ['draft', 'active', 'closed'],
        default: 'active'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: Date,

    // Analytics
    views: {
        type: Number,
        default: 0
    },
    applications: {
        type: Number,
        default: 0
    },
    assessmentsCompleted: {
        type: Number,
        default: 0
    }
});

// Update timestamp on save
JobSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('Job', JobSchema);
