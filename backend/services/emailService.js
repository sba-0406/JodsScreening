const nodemailer = require('nodemailer');

/**
 * Email Service
 * Handles dispatching emails using SMTP.
 * In Development: Optionally logs to console or uses Ethereal/Mailtrap.
 */
class EmailService {
    constructor() {
        this.transporter = null;
        this.isDev = process.env.NODE_ENV === 'development';

        // Initialize transporter if credentials exist
        if (process.env.SMTP_USER && process.env.SMTP_PASS) {
            this.transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                }
            });
        }
    }

    /**
     * @desc Send an email
     * @param {Object} options - { to, subject, text, html }
     */
    async sendEmail({ to, subject, text, html }) {
        if (!to) return;

        // --- GMAIL ONLY FILTER ---
        // During dev/testing, only send to real Gmail addresses to avoid 
        // bounce errors with random dummy domains like xyz.com.
        if (!to.toLowerCase().endsWith('@gmail.com')) {
            console.log(`[EMAIL FILTER] Skipping non-gmail recipient: ${to}`);
            return { success: true, mode: 'filtered' };
        }
        // -------------------------

        try {
            const mailOptions = {
                from: `"ScenarioSim" <${process.env.SMTP_FROM || 'noreply@scenariosim.com'}>`,
                to,
                subject,
                text,
                html: html || text
            };

            // If no transporter (Dev mode/No config), log to console
            if (!this.transporter || this.isDev) {
                console.log('--------------------------------------------');
                console.log('[EMAIL SERVICE - DEV MODE]');
                console.log(`To: ${to}`);
                console.log(`Subject: ${subject}`);
                console.log(`Body: ${text}`);
                console.log('--------------------------------------------');

                // If we have a transporter even in dev, we can still try to send it
                if (!this.transporter) return { success: true, mode: 'log' };
            }

            const info = await this.transporter.sendMail(mailOptions);
            console.log(`[EMAIL SENT] ID: ${info.messageId}`);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('[EMAIL ERROR]', error.message);
            // We don't throw here to prevent blocking the main app flow
            return { success: false, error: error.message };
        }
    }
}

module.exports = new EmailService();
