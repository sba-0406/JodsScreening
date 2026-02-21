const Job = require('../models/Job');
const Application = require('../models/Application');
const ai = require('../services/aiService');

// @desc    Get all active jobs (public)
// @route   GET /api/applications/jobs
// @access  Public
exports.getPublicJobs = async (req, res) => {
    try {
        const { search, department, location } = req.query;

        const query = { status: 'active' };

        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        if (department) {
            query.department = department;
        }

        if (location) {
            query.location = { $regex: location, $options: 'i' };
        }

        const jobs = await Job.find(query)
            .select('-description -companyDescription') // Exclude full descriptions for listing
            .sort({ createdAt: -1 })
            .lean();

        // If user logged in, mark jobs they've applied to
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

        res.json({
            success: true,
            count: results.length,
            data: results
        });
    } catch (error) {
        console.error('Error fetching public jobs:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch jobs'
        });
    }
};

// @desc    Get single job detail (public)
// @route   GET /api/applications/jobs/:id
// @access  Public
exports.getPublicJobDetail = async (req, res) => {
    try {
        const job = await Job.findById(req.params.id)
            .populate('assessmentId', 'technicalSkills softSkills');

        if (!job) {
            return res.status(404).json({
                success: false,
                error: 'Job not found'
            });
        }

        // If user logged in, check if they've applied
        let isApplied = false;
        if (req.user) {
            const application = await Application.findOne({
                job: job._id,
                candidate: req.user._id
            }).select('_id');
            isApplied = !!application;
        }

        res.json({
            success: true,
            data: {
                ...job.toObject(),
                isApplied
            }
        });
    } catch (error) {
        console.error('Error fetching job detail:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch job'
        });
    }
};

// @desc    Submit application
// @route   POST /api/applications/apply/:jobId
// @access  Private (Candidate)
exports.submitApplication = async (req, res) => {
    try {
        const { candidateName, candidateEmail, candidatePhone, yearsExperience, coverLetter } = req.body;
        const jobId = req.params.jobId;

        // Check if job exists and is active
        const job = await Job.findById(jobId);
        if (!job) {
            return res.status(404).json({
                success: false,
                error: 'Job not found'
            });
        }

        if (job.status !== 'active') {
            return res.status(400).json({
                success: false,
                error: 'This job is no longer accepting applications'
            });
        }

        // Check if user already applied
        const existingApplication = await Application.findOne({
            job: jobId,
            candidate: req.user._id
        });

        if (existingApplication) {
            return res.status(400).json({
                success: false,
                error: 'You have already applied for this job'
            });
        }

        // Create application
        const application = await Application.create({
            job: jobId,
            candidate: req.user._id,
            candidateName,
            candidateEmail,
            candidatePhone,
            yearsExperience: parseInt(yearsExperience),
            resume: req.file ? req.file.path.replace(/\\/g, '/') : null,
            coverLetter,
            status: 'applied',
            assessmentStatus: job.requireAssessment ? 'pending' : 'not_required'
        });

        // Update job application count
        job.applications += 1;
        await job.save();

        res.status(201).json({
            success: true,
            data: application
        });
    } catch (error) {
        console.error('Error submitting application:', error);

        // Handle unique constraint error
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                error: 'You have already applied for this job'
            });
        }

        res.status(500).json({
            success: false,
            error: error.message || 'Failed to submit application'
        });
    }
};

// @desc    Get my applications
// @route   GET /api/applications/my-applications
// @access  Private (Candidate)
exports.getMyApplications = async (req, res) => {
    try {
        const applications = await Application.find({ candidate: req.user._id })
            .populate('job', 'title department location companyName')
            .sort({ appliedAt: -1 });

        res.json({
            success: true,
            count: applications.length,
            data: applications
        });
    } catch (error) {
        console.error('Error fetching applications:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch applications'
        });
    }
};

// @desc    Get application detail
// @route   GET /api/applications/application/:id
// @access  Private (Candidate)
exports.getApplicationDetail = async (req, res) => {
    try {
        const application = await Application.findById(req.params.id)
            .populate('job');

        if (!application) {
            return res.status(404).json({
                success: false,
                error: 'Application not found'
            });
        }

        // Verify ownership or HR/Admin access
        const isOwner = application.candidate && application.candidate.toString() === req.user._id.toString();
        const isAdmin = req.user.role === 'hr' || req.user.role === 'admin';

        if (!isOwner && !isAdmin) {
            return res.status(403).json({
                success: false,
                error: 'Not authorized to view this application'
            });
        }

        // If browser request, redirect to view
        if (req.headers.accept && req.headers.accept.includes('text/html')) {
            return res.redirect(`/api/applications/application/${req.params.id}/view`);
        }

        res.json({
            success: true,
            data: application
        });
    } catch (error) {
        console.error('Error fetching application:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch application'
        });
    }
};

// @desc    Render jobs portal
// @route   GET /api/applications/jobs-portal
// @access  Public
exports.renderJobsPortal = async (req, res) => {
    try {
        res.render('jobs-portal', {
            title: 'Browse Jobs',
            user: req.user || null
        });
    } catch (error) {
        console.error('Error rendering jobs portal:', error);
        res.status(500).send('Error loading page');
    }
};

// @desc    Render public job detail
// @route   GET /api/applications/job/:id/view
// @access  Public
exports.renderJobDetailPublic = async (req, res) => {
    try {
        const job = await Job.findById(req.params.id)
            .populate('assessmentId', 'technicalSkills softSkills');

        if (!job) {
            return res.status(404).send('Job not found');
        }

        // Check if user logged in and applied
        let isApplied = false;
        let existingApplicationId = null;
        if (req.user) {
            const application = await Application.findOne({
                job: job._id,
                candidate: req.user._id
            }).select('_id');

            if (application) {
                isApplied = true;
                existingApplicationId = application._id;
            }
        }

        res.render('job-detail-public', {
            title: job.title,
            job,
            user: req.user || null,
            isApplied,
            existingApplicationId
        });
    } catch (error) {
        console.error('Error rendering job detail:', error);
        res.status(500).send('Error loading job');
    }
};

// @desc    Render application form
// @route   GET /api/applications/job/:id/apply
// @access  Private (Candidate)
exports.renderApplicationForm = async (req, res) => {
    try {
        const job = await Job.findById(req.params.id);

        if (!job) {
            return res.status(404).send('Job not found');
        }

        if (job.status !== 'active') {
            return res.status(400).send('This job is no longer accepting applications');
        }

        // Check if already applied
        const existingApplication = await Application.findOne({
            job: job._id,
            candidate: req.user._id
        });

        if (existingApplication) {
            return res.redirect(`/api/applications/application/${existingApplication._id}`);
        }

        res.render('application-form', {
            title: `Apply for ${job.title}`,
            job,
            user: req.user
        });
    } catch (error) {
        console.error('Error rendering application form:', error);
        res.status(500).send('Error loading form');
    }
};

// @desc    Render candidate dashboard
// @route   GET /api/applications/my-dashboard
// @access  Private (Candidate)
exports.renderCandidateDashboard = async (req, res) => {
    try {
        res.render('candidate-dashboard', {
            title: 'My Applications',
            user: req.user
        });
    } catch (error) {
        console.error('Error rendering dashboard:', error);
        res.status(500).send('Error loading dashboard');
    }
};

// @desc    Render application detail page
// @route   GET /api/applications/application/:id/view
// @access  Private (Candidate)
exports.renderApplicationDetail = async (req, res) => {
    try {
        const application = await Application.findById(req.params.id)
            .populate('job')
            .lean();

        if (!application) {
            return res.status(404).send('Application not found');
        }

        // Verify ownership or HR/Admin access
        const isOwner = application.candidate && application.candidate.toString() === req.user._id.toString();
        const isAdmin = req.user.role === 'hr' || req.user.role === 'admin';

        if (!isOwner && !isAdmin) {
            return res.status(403).send('Not authorized to view this application');
        }

        res.render('application-detail.ejs', {
            title: 'Application Details',
            application,
            user: req.user
        });
    } catch (error) {
        console.error('Error rendering application detail:', error);
        res.status(500).send('Error loading page');
    }
};

// @desc    Update application status (Shortlist/Reject)
// @route   PATCH /api/applications/application/:id/status
// @access  Private (HR/Admin)
exports.updateApplicationStatus = async (req, res) => {
    try {
        const { status, notes, interviewDate } = req.body;
        const validStatuses = ['shortlisted', 'rejected', 'hired', 'applied', 'interview_scheduled'];

        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid status'
            });
        }

        const application = await Application.findById(req.params.id);

        if (!application) {
            return res.status(404).json({
                success: false,
                error: 'Application not found'
            });
        }

        application.status = status;
        application.reviewNotes = notes || application.reviewNotes;
        application.reviewedBy = req.user._id;

        if (status === 'shortlisted') {
            application.shortlistedAt = Date.now();
        } else if (status === 'rejected') {
            application.rejectedAt = Date.now();
        } else if (status === 'interview_scheduled') {
            if (interviewDate) {
                // Robust Date Parsing
                let parsedDate = new Date(interviewDate);

                // Handle partial dates (e.g., "Feb 27, 11:00am") by appending current year if invalid
                if (isNaN(parsedDate.getTime())) {
                    const currentYear = new Date().getFullYear();
                    parsedDate = new Date(`${interviewDate}, ${currentYear}`);
                }

                // Final breakdown check
                if (isNaN(parsedDate.getTime())) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid date format. Please use a format like "Feb 27, 2026 11:00 AM"'
                    });
                }

                application.interviewDate = parsedDate;
            }
        }

        await application.save();

        res.json({
            success: true,
            data: application
        });
    } catch (error) {
        console.error('Error updating application status:', error);

        // Handle Mongoose Validation Errors specifically
        if (error.name === 'ValidationError' || error.name === 'CastError') {
            return res.status(400).json({
                success: false,
                error: `Validation Error: ${error.message}`
            });
        }

        res.status(500).json({
            success: false,
            error: 'Failed to update status'
        });
    }
};

// @desc    Generate AI summary for a candidate
// @route   POST /api/applications/application/:id/ai-summary
// @access  Private (HR/Admin)
exports.generateAISummary = async (req, res) => {
    try {
        const application = await Application.findById(req.params.id).populate('job');

        if (!application) {
            return res.status(404).json({
                success: false,
                error: 'Application not found'
            });
        }

        if (application.assessmentStatus !== 'completed') {
            return res.status(400).json({
                success: false,
                error: 'Assessment not completed yet'
            });
        }

        const summary = await ai.generateCandidateSummary(
            application.candidateName,
            application.job.title,
            application.assessmentResults
        );

        application.reviewNotes = summary;
        application.reviewedBy = req.user._id;
        await application.save();

        res.json({
            success: true,
            summary
        });
    } catch (error) {
        console.error('Error generating AI summary:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate AI summary'
        });
    }
};

