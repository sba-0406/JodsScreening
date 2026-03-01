const mongoose = require('mongoose');

const ApplicationSchema = new mongoose.Schema({
    // Job Reference
    job: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Job',
        required: true
    },
    candidate: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    // Candidate Information
    candidateName: {
        type: String,
        required: true
    },
    candidateEmail: {
        type: String,
        required: true
    },
    // candidatePhone: String,
    candidatePhone: {
        type: String,
        required: true,
        match: [/^\+?[1-9]\d{7,14}$/, 'Please enter a valid phone number']
    },
    resume: String, // File path or URL
    coverLetter: String,
    yearsExperience: Number,

    // Assessment Status
    assessmentStatus: {
        type: String,
        enum: ['pending', 'in_progress', 'completed'],
        default: 'pending'
    },

    // Assessment Results
    assessmentResults: {
        technicalScore: Number,
        softSkillScore: Number,
        weightedScore: Number,
        overallFit: String, // 'Excellent Match', 'Strong Match', etc.
        skillBreakdown: {
            type: Map,
            of: Number
        },
        softSkillBreakdown: {
            type: Map,
            of: Number
        },
        redFlags: [String],
        completedAt: Date
    },

    // Application Status
    status: {
        type: String,
        enum: ['applied', 'shortlisted', 'rejected', 'hired', 'interview_scheduled'],
        default: 'applied'
    },

    // HR Actions
    interviewDate: Date,
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    reviewNotes: String,
    shortlistedAt: Date,
    rejectedAt: Date,

    // Reminder Tracking
    lastReminderSent: Date,
    reminderCount: {
        type: Number,
        default: 0
    },

    // Timestamps
    appliedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Update timestamp on save
ApplicationSchema.pre('save', function (next) {
    this.lastUpdated = Date.now();
    next();
});

// Index for faster queries and unique constraint
ApplicationSchema.index({ job: 1, candidate: 1 }, { unique: true });
ApplicationSchema.index({ job: 1, status: 1 });
ApplicationSchema.index({ candidateEmail: 1 });

module.exports = mongoose.model('Application', ApplicationSchema);
