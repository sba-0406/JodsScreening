const Application = require('../models/Application');
const https = require('https');

/**
 * @desc Get the resume file from S3 and stream it to the browser
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Boolean} download - Whether to force a download
 */
const proxyResume = async (req, res, download = false) => {
    try {
        const application = await Application.findById(req.params.id);
        if (!application) return res.status(404).json({ success: false, error: 'Application not found' });

        const resumeUrl = application.resume;
        if (!resumeUrl) return res.status(404).json({ success: false, error: 'No resume found for this candidate' });

        // Security check: Only HR and Admin of the appropriate project/global
        // (Note: Basic authentication is handled by the route middleware)

        // Fetch from S3 and Pipe to response
        https.get(resumeUrl, (s3Response) => {
            if (s3Response.statusCode !== 200) {
                return res.status(s3Response.statusCode).json({ success: false, error: 'Could not fetch file from storage' });
            }

            // Set Headers
            res.setHeader('Content-Type', 'application/pdf');
            if (download) {
                const filename = `Resume_${application.candidateName.replace(/\s+/g, '_')}.pdf`;
                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            } else {
                res.setHeader('Content-Disposition', 'inline');
            }

            // Stream the data
            s3Response.pipe(res);
        }).on('error', (err) => {
            console.error('[RESUME PROXY ERROR]', err);
            res.status(500).json({ success: false, error: 'Streaming failed' });
        });

    } catch (error) {
        console.error('[CONTROLLER ERROR] viewResume:', error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
};

/**
 * @desc    View resume in browser
 * @route   GET /api/resumes/view/:id
 */
exports.viewResume = (req, res) => proxyResume(req, res, false);

/**
 * @desc    Download resume file
 * @route   GET /api/resumes/download/:id
 */
exports.downloadResume = (req, res) => proxyResume(req, res, true);
