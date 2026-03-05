const Notification = require('../models/Notification');
const NotificationTemplate = require('../models/NotificationTemplate');
const Job = require('../models/Job');
const User = require('../models/User');
const emailService = require('./emailService');

/**
 * Replace placeholders in a string with actual data
 */
const populateTemplate = (text, data) => {
    let result = text;
    Object.entries(data).forEach(([key, value]) => {
        const regex = new RegExp(`{{${key}}}`, 'g');
        result = result.replace(regex, String(value || ''));
    });
    return result;
};

class NotificationService {
    /**
     * Send dual-channel notification (In-App + Email)
     * @param {Object} params - { recipientId, jobId, templateName, data, type, customTitle, customMessage, actionUrl }
     */
    async sendNotification({ recipientId, jobId = null, templateName, data = {}, type = 'SYSTEM', customTitle, customMessage, actionUrl }) {
        try {
            let title = customTitle;
            let message = customMessage;
            let settings = { sendInApp: true, sendEmail: false };

            // 1. Resolve Job Settings if provided
            if (jobId) {
                const job = await Job.findById(jobId).select('notificationSettings title');
                if (job && job.notificationSettings) {
                    settings = job.notificationSettings;
                    // Auto-populate job title if missing in data
                    if (!data.jobTitle) data.jobTitle = job.title;
                }
            }

            // 2. Fetch Template if provided
            if (templateName) {
                const template = await NotificationTemplate.findOne({ name: templateName });
                if (template) {
                    title = populateTemplate(template.subject, data);
                    message = populateTemplate(template.body, data);

                    // --- ENHANCEMENT: CANDIDATE-FACING NOTIFICATIONS ---
                    // Even if HR has disabled their "Email Alerts" for the job, 
                    // we should still send confirmation emails to candidates by default.
                    if (template.category === 'CANDIDATE') {
                        settings.sendEmail = true;
                    }
                }
            }

            if (!title || !message) {
                throw new Error('Notification title or message missing');
            }

            let result = { inApp: null, email: null };

            // 3. Dispatch In-App Notification
            if (settings.sendInApp) {
                result.inApp = await Notification.create({
                    recipient: recipientId,
                    type,
                    title,
                    message,
                    actionUrl
                });
            }

            // 4. Dispatch Email Notification
            if (settings.sendEmail) {
                const recipient = await User.findById(recipientId).select('email name');
                if (recipient && recipient.email) {
                    // Enrich data for email template if needed
                    if (!data.candidateName) data.candidateName = recipient.name;

                    result.email = await emailService.sendEmail({
                        to: recipient.email,
                        subject: title,
                        text: message, // Plain text fallback
                        html: `
                            <div style="font-family: sans-serif; max-width: 600px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px;">
                                <h2 style="color: #2563eb; margin-top: 0;">${title}</h2>
                                <p style="font-size: 16px; color: #475569; line-height: 1.6;">${message}</p>
                                ${actionUrl ? `
                                    <div style="margin-top: 25px;">
                                        <a href="${process.env.APP_URL || 'http://localhost:2000'}${actionUrl}" 
                                           style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
                                            View Details
                                        </a>
                                    </div>
                                ` : ''}
                                <hr style="margin-top: 30px; border: 0; border-top: 1px solid #e2e8f0;">
                                <p style="font-size: 12px; color: #94a3b8;">This is an automated message from ScenarioSim.</p>
                            </div>
                        `
                    });
                }
            }

            console.log(`[NOTIFICATION DISPATCH] Recipient: ${recipientId} | In-App: ${!!result.inApp} | Email: ${!!result.email}`);
            return result;
        } catch (error) {
            console.error('[NOTIFICATION SERVICE ERROR]', error.message);
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
