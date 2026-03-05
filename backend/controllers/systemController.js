const AuditLog = require('../models/AuditLog');
const ai = require('../services/aiService');

/**
 * @desc Get system-wide AI health and governance data
 */
exports.getAIHealth = async (req, res) => {
    try {
        const health = ai.getGovernanceData();
        res.json({ success: true, data: health });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to fetch health data' });
    }
};

/**
 * @desc Get audit logs for a specific entity
 */
exports.getAuditLogs = async (req, res) => {
    try {
        const { entityId, entityType } = req.query;
        const query = {};
        if (entityId) query.entityId = entityId;
        if (entityType) {
            // Use regex for case-insensitive match to handle inconsistent data casing
            query.entityType = { $regex: new RegExp(`^${entityType}$`, 'i') };
        }

        const logs = await AuditLog.find(query)
            .sort({ timestamp: -1 })
            .limit(50)
            .populate('performer', 'name role');

        res.json({ success: true, data: logs });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to fetch audit logs' });
    }
};

/**
 * @desc Render System Monitor Dashboard (Admin only)
 */
exports.renderSystemMonitor = async (req, res) => {
    try {
        const health = ai.getGovernanceData();
        res.render('system-monitor', {
            title: 'System Intelligence Monitor',
            health,
            user: req.user
        });
    } catch (error) {
        res.status(500).send('Error loading monitor');
    }
};
