const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
    entityType: {
        type: String,
        required: true,
        enum: ['application', 'job', 'user', 'notification'],
        default: 'application'
    },
    entityId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: 'entityType' // Dynamic ref
    },
    action: {
        type: String,
        required: true,
        enum: ['create', 'update', 'delete', 'status_change', 'ai_summary_generated', 'assessment_started', 'assessment_completed', 'invited_to_assessment']
    },
    previousState: {
        type: mongoose.Schema.Types.Mixed
    },
    newState: {
        type: mongoose.Schema.Types.Mixed
    },
    performer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    performerRole: {
        type: String,
        required: true
    },
    ipAddress: String,
    metadata: {
        type: mongoose.Schema.Types.Mixed
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
});

// Index for fast audit queries
auditLogSchema.index({ entityId: 1, timestamp: -1 });
auditLogSchema.index({ action: 1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);
module.exports = AuditLog;
