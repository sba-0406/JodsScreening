const notificationService = require('../services/notificationService');
const NotificationTemplate = require('../models/NotificationTemplate');
const Notification = require('../models/Notification');

/**
 * @desc    Render notifications history page
 * @route   GET /api/notifications/view
 */
exports.renderNotificationsPage = async (req, res) => {
    try {
        const notifications = await notificationService.getUserNotifications(req.user._id);
        const unreadCount = await notificationService.getUnreadCount(req.user._id);

        res.render('notifications', {
            title: 'Notifications',
            user: req.user,
            notifications,
            unreadCount
        });
    } catch (error) {
        console.error('Error rendering notifications:', error);
        res.status(500).render('error/500');
    }
};

/**
 * @desc    Get all notifications for logged-in user
 * @route   GET /api/notifications
 */
exports.getNotifications = async (req, res) => {
    try {
        const notifications = await notificationService.getUserNotifications(req.user._id);
        const unreadCount = await notificationService.getUnreadCount(req.user._id);

        res.json({ success: true, count: notifications.length, unreadCount, data: notifications });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to fetch notifications' });
    }
};

/**
 * @desc    Mark notification as read
 * @route   PATCH /api/notifications/:id/read
 */
exports.markAsRead = async (req, res) => {
    try {
        console.log(`[NOTIF] Marking read: ${req.params.id}`);
        const notification = await notificationService.markAsRead(req.params.id);
        console.log(`[NOTIF] Result: ${notification ? 'Success' : 'Not Found'}`);
        res.json({ success: true, data: notification });
    } catch (error) {
        console.error(`[NOTIF ERROR] markAsRead:`, error);
        res.status(500).json({ success: false, error: 'Failed to update notification' });
    }
};

/**
 * @desc    Get all notification templates (HR only)
 * @route   GET /api/notifications/templates
 */
exports.getTemplates = async (req, res) => {
    try {
        const templates = await NotificationTemplate.find({ category: { $in: ['CANDIDATE', 'SYSTEM'] } });
        res.json({ success: true, data: templates });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to fetch templates' });
    }
};

/**
 * @desc    Send manual notification (HR only)
 * @route   POST /api/notifications/send
 */
exports.sendManualNotification = async (req, res) => {
    try {
        const { recipientId, jobId, templateName, data, customTitle, customMessage, actionUrl } = req.body;

        const notification = await notificationService.sendNotification({
            recipientId,
            jobId,
            senderId: req.user._id,
            templateName,
            data,
            type: 'HR',
            customTitle,
            customMessage,
            actionUrl
        });

        res.json({ success: true, data: notification });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message || 'Failed to send notification' });
    }
};
