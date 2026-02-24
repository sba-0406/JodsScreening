const Job = require('../models/Job');
const Application = require('../models/Application');
const ai = require('../services/aiService');

// ==========================================
// PUBLIC CONTROLLERS (No Login Required)
// ==========================================

/**
 * @desc    Fetch and filter active jobs for the public portal
 * @route   GET /api/applications/jobs
 */
exports.getPublicJobs = async (req, res) => {
    try {
        const { search, department, location } = req.query;
        const query = { status: 'active' };

        // 1. Build Filter Query
        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }
        if (department) query.department = department;
        if (location) query.location = { $regex: location, $options: 'i' };

        // 2. Fetch Jobs
        const jobs = await Job.find(query)
            .select('-description -companyDescription') // Keep network payload small
            .sort({ createdAt: -1 })
            .lean();

        // 3. Application State (If user is logged in, show 'Applied' status)
        let results = jobs;
        if (req.user) {
            const userApplications = await Application.find({ candidate: req.user._id })
                .select('job')
                .lean();
            const appliedJobIds = new Set(userApplications.map(app => app.job.toString()));

            results = jobs.map(job => ({
                ...job,
                isApplied: appliedJobIds.has(job._id.toString())
            }));
        }

        res.json({ success: true, count: results.length, data: results });
    } catch (error) {
        console.error('[CONTROLLER ERROR] getPublicJobs:', error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
};

/**
 * @desc    Get detailed info for a specific job
 * @route   GET /api/applications/jobs/:id
 */
exports.getPublicJobDetail = async (req, res) => {
    try {
        const job = await Job.findById(req.params.id)
            .populate('assessmentId', 'technicalSkills softSkills');

        if (!job) {
            return res.status(404).json({ success: false, error: 'Job not found' });
        }

        // Check application status for logged-in users
        let isApplied = false;
        if (req.user) {
            const app = await Application.findOne({ job: job._id, candidate: req.user._id }).select('_id');
            isApplied = !!app;
        }

        res.json({ success: true, data: { ...job.toObject(), isApplied } });
    } catch (error) {
        console.error('[CONTROLLER ERROR] getPublicJobDetail:', error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
};

// ==========================================
// CANDIDATE CONTROLLERS (Login Required)
// ==========================================

/**
 * @desc    Process a new job application (supports resume upload)
 * @route   POST /api/applications/apply/:jobId
 */
exports.submitApplication = async (req, res) => {
    try {
        const { candidateName, candidateEmail, candidatePhone, yearsExperience, coverLetter } = req.body;
        const jobId = req.params.jobId;

        // 1. Validation Logic
        const job = await Job.findById(jobId);
        if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
        if (job.status !== 'active') return res.status(400).json({ success: false, error: 'Applications are closed' });

        const existingApp = await Application.findOne({ job: jobId, candidate: req.user._id });
        if (existingApp) return res.status(400).json({ success: false, error: 'Already applied' });

        // 2. Create Application Record
        const application = await Application.create({
            job: jobId,
            candidate: req.user._id,
            candidateName,
            candidateEmail,
            candidatePhone,
            yearsExperience: parseInt(yearsExperience),
            resume: req.file ? req.file.path.replace(/\\/g, '/') : null, // Normalize file path for Windows
            coverLetter,
            status: 'applied',
            assessmentStatus: job.requireAssessment ? 'pending' : 'not_required'
        });

        // 3. Increment Stats
        job.applications += 1;
        await job.save();

        res.status(201).json({ success: true, data: application });
    } catch (error) {
        console.error('[CONTROLLER ERROR] submitApplication:', error);
        res.status(500).json({ success: false, error: error.message || 'Submission failed' });
    }
};

/**
 * @desc    Get all applications for the logged-in candidate
 * @route   GET /api/applications/my-applications
 */
exports.getMyApplications = async (req, res) => {
    try {
        const applications = await Application.find({ candidate: req.user._id })
            .populate('job', 'title department location companyName')
            .sort({ appliedAt: -1 });

        res.json({ success: true, count: applications.length, data: applications });
    } catch (error) {
        console.error('[CONTROLLER ERROR] getMyApplications:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch applications' });
    }
};

/**
 * @desc    Get detailed application record (JSON)
 * @route   GET /api/applications/application/:id
 */
exports.getApplicationDetail = async (req, res) => {
    try {
        const application = await Application.findById(req.params.id).populate('job');
        if (!application) return res.status(404).json({ success: false, error: 'Not found' });

        // Security check
        const isOwner = application.candidate?.toString() === req.user._id.toString();
        const isHR = ['hr', 'admin'].includes(req.user.role);

        if (!isOwner && !isHR) {
            return res.status(403).json({ success: false, error: 'Unauthorized access' });
        }

        res.json({ success: true, data: application });
    } catch (error) {
        console.error('[CONTROLLER ERROR] getApplicationDetail:', error);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};

// ==========================================
// VIEW CONTROLLERS (HTML Rendering)
// ==========================================

exports.renderJobsPortal = async (req, res) => {
    res.render('jobs-portal', { title: 'Browse Jobs', user: req.user || null });
};

exports.renderJobDetailPublic = async (req, res) => {
    try {
        const job = await Job.findById(req.params.id).populate('assessmentId', 'technicalSkills softSkills');
        if (!job) return res.status(404).send('Job not found');

        let isApplied = false, existingApplicationId = null;
        if (req.user) {
            const app = await Application.findOne({ job: job._id, candidate: req.user._id }).select('_id');
            if (app) { isApplied = true; existingApplicationId = app._id; }
        }

        res.render('job-detail-public', { title: job.title, job, user: req.user, isApplied, existingApplicationId });
    } catch (e) { res.status(500).send('Error'); }
};

exports.renderApplicationForm = async (req, res) => {
    try {
        const job = await Job.findById(req.params.id);
        if (!job || job.status !== 'active') return res.status(404).send('Unavailable');

        const existing = await Application.findOne({ job: job._id, candidate: req.user._id });
        if (existing) return res.redirect(`/api/applications/application/${existing._id}/view`);

        res.render('application-form', { title: 'Apply', job, user: req.user });
    } catch (e) { res.status(500).send('Error'); }
};

exports.renderCandidateDashboard = async (req, res) => {
    res.render('candidate-dashboard', { title: 'My Dashboard', user: req.user });
};

exports.renderApplicationDetail = async (req, res) => {
    try {
        const application = await Application.findById(req.params.id).populate('job').lean();
        if (!application) return res.status(404).send('Not found');

        const isOwner = application.candidate?.toString() === req.user._id.toString();
        const isHR = ['hr', 'admin'].includes(req.user.role);
        if (!isOwner && !isHR) return res.status(403).send('Unauthorized');

        res.render('application-detail.ejs', { title: 'Application Details', application, user: req.user });
    } catch (e) { res.status(500).send('Error'); }
};

// ==========================================
// HR/ADMIN CONTROLLERS (Restricted)
// ==========================================

/**
 * @desc    Change application status (Reject, Shortlist, Schedule)
 * @route   PATCH /api/applications/application/:id/status
 */
exports.updateApplicationStatus = async (req, res) => {
    try {
        const { status, notes, interviewDate } = req.body;
        const validStatuses = ['applied', 'shortlisted', 'rejected', 'hired', 'interview_scheduled'];

        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, error: 'Invalid status' });
        }

        const application = await Application.findById(req.params.id);
        if (!application) return res.status(404).json({ success: false, error: 'Not found' });

        // Update basic fields
        application.status = status;
        application.reviewNotes = notes || application.reviewNotes;
        application.reviewedBy = req.user._id;

        // Specific logic per status
        if (status === 'shortlisted') application.shortlistedAt = Date.now();
        if (status === 'rejected') application.rejectedAt = Date.now();

        if (status === 'interview_scheduled' && interviewDate) {
            const parsedDate = new Date(interviewDate);
            if (isNaN(parsedDate.getTime())) {
                return res.status(400).json({ success: false, error: 'Incorrect date format' });
            }
            application.interviewDate = parsedDate;
        }

        await application.save();
        res.json({ success: true, data: application });
    } catch (error) {
        console.error('[CONTROLLER ERROR] updateApplicationStatus:', error);
        res.status(500).json({ success: false, error: 'Update failed' });
    }
};

/**
 * @desc    Generate an AI-driven summary based on assessment results
 * @route   POST /api/applications/application/:id/ai-summary
 */
exports.generateAISummary = async (req, res) => {
    try {
        const application = await Application.findById(req.params.id).populate('job');
        if (!application) return res.status(404).json({ success: false, error: 'Not found' });

        if (application.assessmentStatus !== 'completed') {
            return res.status(400).json({ success: false, error: 'Candidate has not finished the test' });
        }

        // Call the AI utility service
        const summary = await ai.generateCandidateSummary(
            application.candidateName,
            application.job.title,
            application.assessmentResults
        );

        // Save generated summary to notes
        application.reviewNotes = summary;
        application.reviewedBy = req.user._id;
        await application.save();

        res.json({ success: true, summary });
    } catch (error) {
        console.error('[CONTROLLER ERROR] generateAISummary:', error);
        res.status(500).json({ success: false, error: 'AI Generation Failed' });
    }
};

