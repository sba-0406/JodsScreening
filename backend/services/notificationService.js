const Notification = require('../models/Notification');
const NotificationTemplate = require('../models/NotificationTemplate');

/**
 * Replace placeholders in a string with actual data
 * @param {string} text - The template text
 * @param {Object} data - Key-value pairs matching placeholders
 * @returns {string} - The populated text
 */
const populateTemplate = (text, data) => {
    let result = text;
    Object.entries(data).forEach(([key, value]) => {
        const regex = new RegExp(`{{${key}}}`, 'g');
        result = result.replace(regex, value || '');
    });
    return result;
};

class NotificationService {
    /**
     * Send an in-app notification to a user
     * @param {Object} params - Notification parameters
     */
    async sendNotification({ recipientId, senderId = null, templateName, data, type = 'SYSTEM', customTitle, customMessage, actionUrl }) {
        try {
            let title = customTitle;
            let message = customMessage;

            // If a template is provided, use it
            if (templateName) {
                const template = await NotificationTemplate.findOne({ name: templateName });
                if (template) {
                    title = populateTemplate(template.subject, data);
                    message = populateTemplate(template.body, data);
                }
            }

            if (!title || !message) {
                throw new Error('Notification title or message missing');
            }

            const notification = await Notification.create({
                recipient: recipientId,
                sender: senderId,
                type,
                title,
                message,
                actionUrl
            });

            console.log(`[NOTIFICATION] Sent to ${recipientId}: ${title}`);
            return notification;
        } catch (error) {
            console.error('[NOTIFICATION ERROR]', error.message);
            throw error;
        }
    }

    /**
     * Mark a notification as read
     */
    async markAsRead(notificationId) {
        return await Notification.findByIdAndUpdate(notificationId, { isRead: true }, { new: true });
    }

    /**
     * Get unread notification count for a user
     */
    async getUnreadCount(userId) {
        return await Notification.countDocuments({ recipient: userId, isRead: false });
    }

    /**
     * Get all notifications for a user
     */
    async getUserNotifications(userId, limit = 20) {
        return await Notification.find({ recipient: userId })
            .sort({ createdAt: -1 })
            .limit(limit);
    }
}

module.exports = new NotificationService();
