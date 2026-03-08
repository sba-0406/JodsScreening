const AuditLog = require('../models/AuditLog');

/**
 * @desc Helper to create an audit log entry
 */
const logAction = async ({
    entityType,
    entityId,
    action,
    previousState = null,
    newState = null,
    user = null,
    req = null,
    metadata = {}
}) => {
    try {
        if (!user && !req?.user) {
            console.warn('[AUDIT] Skipping log: No user provided');
            return;
        }

        const performer = user || req.user;

        await AuditLog.create({
            entityType,
            entityId,
            action,
            previousState,
            newState,
            performer: performer._id,
            performerRole: performer.role,
            ipAddress: req ? (req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'Systemic') : null,
            metadata
        });
    } catch (error) {
        console.error('[AUDIT ERROR] Failed to create log:', error);
        // We don't throw here to avoid breaking the main business logic
    }
};

module.exports = { logAction };
