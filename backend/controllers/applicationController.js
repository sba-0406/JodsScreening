const Job = require('../models/Job');
const Application = require('../models/Application');
const ai = require('../services/aiService');
const notificationService = require('../services/notificationService');
const User = require('../models/User');
const { logAction } = require('../utils/auditLogger'); // Added import for auditLogger

// ==========================================
// UTILITY FUNCTIONS (Internal)
// ==========================================

/**
 * @desc Calculate a weighted match score for a candidate
 * @param {Object} application - Application model instance
 * @param {Object} job - Job model instance with rankingWeights
 * @returns {Number} - Score from 0-100
 */
const calculateMatchScore = (application, job) => {
    const weights = job.rankingWeights || { technicalWeight: 0.45, softSkillWeight: 0.40, experienceWeight: 0.15 };
    const assessmentDone = application.assessmentStatus === 'completed';

    // 1. Technical Score (0-100) — only if assessment completed
    const techScore = assessmentDone ? (application.assessmentResults?.technicalScore || 0) : 0;

    // 2. Soft Skill Score (0-100) — only if assessment completed
    const softScore = assessmentDone ? (application.assessmentResults?.softSkillScore || 0) : 0;

    // 3. Experience Score — uses job's min/max range
    const rawExp = Math.max(0, parseInt(application.yearsExperience) || 0); // Guard: negative/invalid → 0
    const minExp = job.experienceMin || 0;
    const maxExp = job.experienceMax || 10;

    let expScore;
    if (rawExp >= minExp && rawExp <= maxExp) {
        expScore = 100; // In range — perfect
    } else if (rawExp > maxExp) {
        expScore = 100; // Over-qualified — still valid, will be flagged in view
    } else if (minExp > 0) {
        // Under-qualified: proportional penalty (0–80% of max, capped)
        expScore = Math.round((rawExp / minExp) * 80);
    } else {
        expScore = 0;
    }

    // 4. Final Weighted Calculation
    // If assessment not done, only experience component contributes
    let finalScore;
    if (!assessmentDone) {
        finalScore = expScore * weights.experienceWeight;
    } else {
        finalScore =
            (techScore * weights.technicalWeight) +
            (softScore * weights.softSkillWeight) +
            (expScore * weights.experienceWeight);
    }

    return {
        score: Math.round(finalScore),
        isPartial: !assessmentDone,
        isOverQualified: rawExp > maxExp,
        isUnderQualified: rawExp < minExp
    };
};
exports.calculateMatchScore = calculateMatchScore;

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

        // 2. Fetch Jobs with Pagination
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 6;
        const skip = (page - 1) * limit;

        // Fetch total count, jobs, and user's applied status in parallel
        const [totalJobs, jobs, userApplications] = await Promise.all([
            Job.countDocuments(query),
            Job.find(query)
                .select('-description -companyDescription')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            req.user ? Application.find({ candidate: req.user._id }).select('job').lean() : null
        ]);

        const totalPages = Math.ceil(totalJobs / limit);

        // Map application state
        let results = jobs;
        if (userApplications) {
            const appliedJobIds = new Set(userApplications.map(app => app.job.toString()));

            results = jobs.map(job => ({
                ...job,
                isApplied: appliedJobIds.has(job._id.toString())
            }));
        }

        res.json({
            success: true,
            count: results.length,
            totalJobs,
            totalPages,
            currentPage: page,
            data: results
        });
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

        // Increment views using $inc for reliability
        await Job.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } });
        console.log(`[METRICS] Incremented views for job (API): ${req.params.id}`);

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

        // 1. Validate experience input
        const parsedExp = parseInt(yearsExperience);
        if (isNaN(parsedExp) || parsedExp < 0 || parsedExp > 60) {
            return res.status(400).json({ success: false, error: 'Please enter a valid years of experience (0-60).' });
        }

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
            resume: req.file ? req.file.location : null,
            // resume: req.file ? req.file.path.replace(/\\/g, '/') : null, // Normalize file path for Windows
            coverLetter,
            status: 'applied',
            assessmentStatus: job.requireAssessment ? 'pending' : 'not_required'
        });
        if (req.file) {
            console.log("S3 Upload Success:", req.file.location);
        } else {
            console.log("No file uploaded");
        }

        // Audit Log: creation
        await logAction({
            entityType: 'application',
            entityId: application._id,
            action: 'create',
            req,
            metadata: { jobTitle: job.title }
        });

        // 3. Increment Stats using $inc for reliability
        await Job.findByIdAndUpdate(jobId, { $inc: { applications: 1 } });
        console.log(`[METRICS] Incremented applications for job: ${jobId}`);

        // 4. Send Notifications
        // To Candidate
        await notificationService.sendNotification({
            recipientId: req.user._id,
            templateName: 'application_received',
            data: { candidateName: req.user.name, jobTitle: job.title },
            type: 'SYSTEM',
            actionUrl: '/api/applications/my-dashboard'
        });

        // To HR (Target the specific HR who posted the job, with fallback)
        let hrId = job.postedBy;
        if (!hrId) {
            const fallbackHr = await User.findOne({ role: 'hr', department: job.department }) || await User.findOne({ role: 'hr' });
            hrId = fallbackHr ? fallbackHr._id : null;
        }

        if (hrId) {
            await notificationService.sendNotification({
                recipientId: hrId,
                senderId: req.user._id,
                templateName: 'hr_new_application',
                data: {
                    candidateName: req.user.name,
                    jobTitle: job.title,
                    yearsExperience: yearsExperience
                },
                type: 'HR',
                actionUrl: `/api/jobs/${jobId}/candidates`
            });
        }

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

/**
 * @desc    Get benchmarking data for a candidate compared to the pool
 * @route   GET /api/applications/application/:id/benchmark
 */
exports.getBenchmarkingData = async (req, res) => {
    try {
        const application = await Application.findById(req.params.id);
        if (!application) return res.status(404).json({ success: false, error: 'Application not found' });

        // Security: Only candidate or HR/Admin
        if (application.candidate.toString() !== req.user._id.toString() && !['hr', 'admin'].includes(req.user.role)) {
            return res.status(403).json({ success: false, error: 'Unauthorized' });
        }

        if (application.assessmentStatus !== 'completed') {
            return res.status(400).json({ success: false, error: 'Assessment not completed' });
        }

        const myScore = application.assessmentResults.weightedScore;

        // Aggregate pool data for the SAME JOB
        const poolStats = await Application.aggregate([
            { $match: { job: application.job, assessmentStatus: 'completed' } },
            {
                $group: {
                    _id: null,
                    avgScore: { $avg: '$assessmentResults.weightedScore' },
                    total: { $sum: 1 },
                    betterThan: {
                        $sum: { $cond: [{ $lt: ['$assessmentResults.weightedScore', myScore] }, 1, 0] }
                    }
                }
            }
        ]);

        if (!poolStats || poolStats.length === 0) {
            return res.json({ success: true, data: { percentile: 100, avgScore: myScore, total: 1 } });
        }

        const stats = poolStats[0];
        const percentile = stats.total > 1 ? Math.round((stats.betterThan / (stats.total - 1)) * 100) : 100;

        res.json({
            success: true,
            data: {
                percentile,
                avgScore: Math.round(stats.avgScore),
                totalPoolSize: stats.total,
                myScore
            }
        });
    } catch (error) {
        console.error('[CONTROLLER ERROR] getBenchmarkingData:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch benchmark' });
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

        // Increment views using $inc for reliability
        await Job.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } });
        console.log(`[METRICS] Incremented views for job (VIEW): ${req.params.id}`);

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

        // Store previous status for audit log
        const prevStatus = application.status;

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

        // Audit Log: status change
        await logAction({
            entityType: 'application',
            entityId: application._id,
            action: 'status_change',
            previousState: prevStatus,
            newState: status,
            req,
            metadata: { notes }
        });

        // 5. Send Status Notifications to Candidate
        const templateMap = {
            'shortlisted': 'shortlisted',
            'rejected': 'rejected',
            'interview_scheduled': 'interview_scheduled'
        };

        if (templateMap[status]) {
            const job = await Job.findById(application.job);
            const notificationData = {
                candidateName: application.candidateName,
                jobTitle: job.title
            };

            // Add interview details if applicable
            if (status === 'interview_scheduled' && application.interviewDate) {
                const dateObj = new Date(application.interviewDate);
                notificationData.date = dateObj.toLocaleDateString();
                notificationData.time = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }

            await notificationService.sendNotification({
                recipientId: application.candidate,
                senderId: req.user._id,
                templateName: templateMap[status],
                data: notificationData,
                type: 'HR'
            });
        }

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

        // Audit Log: AI summary generated
        await logAction({
            entityType: 'application',
            entityId: application._id,
            action: 'ai_summary_generated',
            req,
            metadata: { length: summary.length }
        });

        res.json({ success: true, summary });
    } catch (error) {
        console.error('[CONTROLLER ERROR] generateAISummary:', error);
        res.status(500).json({ success: false, error: 'AI Generation Failed' });
    }
};
