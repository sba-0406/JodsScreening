const Job = require('../models/Job');
const Assessment = require('../models/Assessment');
const Application = require('../models/Application');
const { generateAssessment } = require('../services/assessmentGeneratorService');

// @desc    Create a new job posting
// @route   POST /api/jobs
// @access  Private (HR/Admin)
exports.createJob = async (req, res) => {
    try {
        const {
            title,
            department,
            location,
            experienceMin,
            experienceMax,
            employmentType,
            salaryMin,
            salaryMax,
            salaryCurrency,
            description,
            companyName,
            companyDescription,
            companyWebsite,
            requireAssessment,
            allowResumeUpload,
            requireCoverLetter,
            applicationDeadline,
            questionsPerSkill,
            allowAIGeneration
        } = req.body;

        // Create job
        const job = await Job.create({
            title,
            department,
            location,
            experienceMin,
            experienceMax,
            employmentType,
            salaryMin,
            salaryMax,
            salaryCurrency,
            description,
            companyName,
            companyDescription,
            companyWebsite,
            requireAssessment,
            allowResumeUpload,
            requireCoverLetter,
            applicationDeadline,
            assessmentConfig: {
                questionsPerSkill: parseInt(questionsPerSkill) || 3,
                allowAIGeneration: allowAIGeneration === 'on' || allowAIGeneration === true
            },
            postedBy: req.user._id,
            status: 'active' // Default to active so visible in portal immediately
        });

        res.status(201).json({
            success: true,
            data: job
        });
    } catch (error) {
        console.error('Error creating job:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to create job'
        });
    }
};

// @desc    Generate assessment for a job
// @route   POST /api/jobs/:id/generate-assessment
// @access  Private (HR/Admin)
exports.generateAssessment = async (req, res) => {
    try {
        const job = await Job.findById(req.params.id);

        if (!job) {
            return res.status(404).json({
                success: false,
                error: 'Job not found'
            });
        }

        // Check if user owns this job
        if (job.postedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Not authorized to modify this job'
            });
        }

        // Generate assessment using AI
        const { assessment, analysis, warnings } = await generateAssessment(
            job.description,
            job._id,
            req.user._id,
            job.assessmentConfig
        );

        // Link assessment to job
        job.assessmentId = assessment._id;
        await job.save();

        res.json({
            success: true,
            data: {
                job,
                assessment,
                analysis,
                warnings
            }
        });
    } catch (error) {
        console.error('Error generating assessment:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to generate assessment'
        });
    }
};

// @desc    Update assessment configuration
// @route   PUT /api/jobs/:id/assessment
// @access  Private (HR/Admin)
exports.updateAssessment = async (req, res) => {
    try {
        const job = await Job.findById(req.params.id).populate('assessmentId');

        if (!job) {
            return res.status(404).json({
                success: false,
                error: 'Job not found'
            });
        }

        if (!job.assessmentId) {
            return res.status(400).json({
                success: false,
                error: 'No assessment found for this job'
            });
        }

        // Update assessment fields
        const allowedUpdates = [
            'technicalWeight',
            'softSkillWeight',
            'minTechnicalScore',
            'minSoftSkillScore'
        ];

        allowedUpdates.forEach(field => {
            if (req.body[field] !== undefined) {
                job.assessmentId[field] = req.body[field];
            }
        });

        // Update Job-level config
        if (req.body.questionsPerSkill !== undefined || req.body.allowAIGeneration !== undefined || req.body.skillConfigs !== undefined) {
            if (!job.assessmentConfig) job.assessmentConfig = {};

            if (req.body.questionsPerSkill !== undefined) {
                job.assessmentConfig.questionsPerSkill = parseInt(req.body.questionsPerSkill);
            }

            if (req.body.allowAIGeneration !== undefined) {
                job.assessmentConfig.allowAIGeneration = req.body.allowAIGeneration === true || req.body.allowAIGeneration === 'true';
            }

            if (req.body.skillConfigs !== undefined) {
                // Expecting structure: { "React": 3, "Node.js": 2 }
                const config = req.body.skillConfigs;
                const skillConfigsArray = [];
                for (const skill in config) {
                    skillConfigsArray.push({
                        skill,
                        questionCount: parseInt(config[skill])
                    });
                }
                job.assessmentConfig.skillConfigs = skillConfigsArray;
            }

            await job.save();
        }

        await job.assessmentId.save();

        res.json({
            success: true,
            data: job.assessmentId
        });
    } catch (error) {
        console.error('Error updating assessment:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to update assessment'
        });
    }
};

// @desc    Get all jobs (for HR dashboard)
// @route   GET /api/jobs
// @access  Private (HR/Admin)
exports.getJobs = async (req, res) => {
    try {
        const { status, search } = req.query;

        const query = {};

        // Filter by status if provided
        if (status) {
            query.status = status;
        }

        // Search by title or department
        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { department: { $regex: search, $options: 'i' } }
            ];
        }

        // HR can only see their own jobs, admin can see all
        if (req.user.role === 'hr') {
            query.postedBy = req.user._id;
        }

        const jobs = await Job.find(query)
            .populate('assessmentId')
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            count: jobs.length,
            data: jobs
        });
    } catch (error) {
        console.error('Error fetching jobs:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch jobs'
        });
    }
};

// @desc    Get single job by ID
// @route   GET /api/jobs/:id
// @access  Private (HR/Admin)
exports.getJobById = async (req, res) => {
    try {
        const job = await Job.findById(req.params.id)
            .populate('assessmentId')
            .populate('postedBy', 'name email');

        if (!job) {
            return res.status(404).json({
                success: false,
                error: 'Job not found'
            });
        }

        res.json({
            success: true,
            data: job
        });
    } catch (error) {
        console.error('Error fetching job:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch job'
        });
    }
};

// @desc    Approve/Reject AI generated question
// @route   PUT /api/jobs/:id/questions/:questionId
// @access  Private (HR/Admin)
exports.moderateQuestion = async (req, res) => {
    try {
        const { id, questionId } = req.params;
        const { action } = req.body; // 'approve' or 'reject'

        const job = await Job.findById(id).populate({
            path: 'assessmentId',
            populate: { path: 'technicalQuestions.questionId' }
        });

        if (!job || !job.assessmentId) {
            return res.status(404).json({ success: false, error: 'Job or assessment not found' });
        }

        const assessment = job.assessmentId;
        const qIndex = assessment.technicalQuestions.findIndex(q => q.questionId?._id?.toString() === questionId);

        if (qIndex === -1) {
            return res.status(404).json({ success: false, error: 'Question not found in assessment' });
        }

        const Question = require('../models/Question');
        const questionPoolItem = await Question.findById(questionId);

        if (action === 'approve') {
            if (questionPoolItem) {
                questionPoolItem.status = 'active';
                await questionPoolItem.save();
                console.log(`[MODERATION] Question ${questionId} approved and added to active bank.`);
            }
        } else if (action === 'reject') {
            // Remove from assessment
            assessment.technicalQuestions.splice(qIndex, 1);

            // Optionally retire from pool
            if (questionPoolItem) {
                questionPoolItem.status = 'retired';
                await questionPoolItem.save();
                console.log(`[MODERATION] Question ${questionId} rejected and retired.`);
            }
        }

        // Re-calculate assessment status
        // We need to fetch the updated assessment questions to check their pool status
        const updatedAssessment = await Assessment.findById(assessment._id).populate('technicalQuestions.questionId');
        const hasPending = updatedAssessment.technicalQuestions.some(q => q.questionId?.status === 'pending_review');
        const hasMissing = updatedAssessment.missingSkills && updatedAssessment.missingSkills.length > 0;

        updatedAssessment.status = (hasPending || hasMissing) ? 'pending_review' : 'active';
        await updatedAssessment.save();

        res.json({
            success: true,
            message: `Question ${action}d successfully`,
            data: updatedAssessment
        });
    } catch (error) {
        console.error('Error moderating question:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Regenerate technical questions for an assessment
// @route   POST /api/jobs/:id/regenerate-questions
// @access  Private (HR/Admin)
exports.regenerateTechnicalAssessment = async (req, res) => {
    try {
        const job = await Job.findById(req.params.id);

        if (!job || !job.assessmentId) {
            return res.status(404).json({ success: false, error: 'Job or assessment not found' });
        }

        const { regenerateTechnicalQuestions } = require('../services/assessmentGeneratorService');

        // Pass current config
        const assessment = await regenerateTechnicalQuestions(job.assessmentId, job.assessmentConfig);

        res.json({
            success: true,
            data: assessment
        });
    } catch (error) {
        console.error('Error regenerating technical questions:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Regenerate scenario templates
// @route   POST /api/jobs/:id/regenerate-scenarios
// @access  Private (HR/Admin)
exports.regenerateScenarios = async (req, res) => {
    try {
        const job = await Job.findById(req.params.id);

        if (!job || !job.assessmentId) {
            return res.status(404).json({ success: false, error: 'Job or assessment not found' });
        }

        const { regenerateScenarios } = require('../services/assessmentGeneratorService');
        const assessment = await regenerateScenarios(job.assessmentId);

        res.json({
            success: true,
            data: assessment
        });
    } catch (error) {
        console.error('Error regenerating scenarios:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Update job
// @route   PUT /api/jobs/:id
// @access  Private (HR/Admin)
exports.updateJob = async (req, res) => {
    try {
        let job = await Job.findById(req.params.id);

        if (!job) {
            return res.status(404).json({
                success: false,
                error: 'Job not found'
            });
        }

        // Check ownership
        if (job.postedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Not authorized to modify this job'
            });
        }

        job = await Job.findByIdAndUpdate(req.params.id, { $set: req.body }, {
            new: true,
            runValidators: true
        });

        res.json({
            success: true,
            data: job
        });
    } catch (error) {
        console.error('Error updating job:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update job'
        });
    }
};

// @desc    Delete job
// @route   DELETE /api/jobs/:id
// @access  Private (HR/Admin)
exports.deleteJob = async (req, res) => {
    try {
        const job = await Job.findById(req.params.id);

        if (!job) {
            return res.status(404).json({
                success: false,
                error: 'Job not found'
            });
        }

        // Check ownership
        if (job.postedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Not authorized to delete this job'
            });
        }

        await job.deleteOne();

        res.json({
            success: true,
            data: {}
        });
    } catch (error) {
        console.error('Error deleting job:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete job'
        });
    }
};

// @desc    Get job analytics
// @route   GET /api/jobs/:id/analytics
// @access  Private (HR/Admin)
exports.getJobAnalytics = async (req, res) => {
    try {
        const job = await Job.findById(req.params.id);

        if (!job) {
            return res.status(404).json({
                success: false,
                error: 'Job not found'
            });
        }

        // Get application statistics
        const totalApplications = await Application.countDocuments({ job: job._id });
        const completedAssessments = await Application.countDocuments({
            job: job._id,
            assessmentStatus: 'completed'
        });
        const shortlisted = await Application.countDocuments({
            job: job._id,
            status: 'shortlisted'
        });

        // Get average scores
        const applications = await Application.find({
            job: job._id,
            assessmentStatus: 'completed'
        });

        let avgTechnicalScore = 0;
        let avgSoftSkillScore = 0;
        let avgWeightedScore = 0;

        if (applications.length > 0) {
            avgTechnicalScore = applications.reduce((sum, app) =>
                sum + (app.assessmentResults?.technicalScore || 0), 0) / applications.length;
            avgSoftSkillScore = applications.reduce((sum, app) =>
                sum + (app.assessmentResults?.softSkillScore || 0), 0) / applications.length;
            avgWeightedScore = applications.reduce((sum, app) =>
                sum + (app.assessmentResults?.weightedScore || 0), 0) / applications.length;
        }

        // Score distribution
        const scoreDistribution = {
            excellent: applications.filter(app => app.assessmentResults?.weightedScore >= 85).length,
            strong: applications.filter(app => {
                const score = app.assessmentResults?.weightedScore;
                return score >= 70 && score < 85;
            }).length,
            fair: applications.filter(app => {
                const score = app.assessmentResults?.weightedScore;
                return score >= 60 && score < 70;
            }).length,
            below: applications.filter(app => app.assessmentResults?.weightedScore < 60).length
        };

        // Conversion rates
        const conversionRates = {
            viewToApply: job.views > 0 ? (totalApplications / job.views * 100).toFixed(1) : 0,
            applyToComplete: totalApplications > 0 ? (completedAssessments / totalApplications * 100).toFixed(1) : 0,
            completeToShortlist: completedAssessments > 0 ? (shortlisted / completedAssessments * 100).toFixed(1) : 0
        };

        // Skill Gap Analysis
        const skillGaps = {}; // { skill: { totalScore: 0, count: 0 } }
        applications.forEach(app => {
            if (app.assessmentResults?.skillBreakdown) {
                // skillBreakdown is a Map in Mongoose, but it might be treated as a plain object after .toObject() or if not lean
                // Handle both cases
                const breakdown = app.assessmentResults.skillBreakdown instanceof Map
                    ? Object.fromEntries(app.assessmentResults.skillBreakdown)
                    : app.assessmentResults.skillBreakdown;

                Object.entries(breakdown).forEach(([skill, score]) => {
                    if (!skillGaps[skill]) skillGaps[skill] = { totalScore: 0, count: 0 };
                    skillGaps[skill].totalScore += score;
                    skillGaps[skill].count++;
                });
            }
        });

        const skillGapAnalysis = {};
        Object.keys(skillGaps).forEach(skill => {
            skillGapAnalysis[skill] = Math.round(skillGaps[skill].totalScore / skillGaps[skill].count);
        });

        const analyticsData = {
            views: job.views,
            applications: totalApplications,
            completedAssessments,
            shortlisted,
            avgTechnicalScore: avgTechnicalScore.toFixed(1),
            avgSoftSkillScore: avgSoftSkillScore.toFixed(1),
            avgWeightedScore: avgWeightedScore.toFixed(1),
            scoreDistribution,
            conversionRates,
            skillGapAnalysis
        };

        // If browser request, render view
        if (req.headers.accept && req.headers.accept.includes('text/html')) {
            return res.render('job-analytics.ejs', {
                title: `Analytics | ${job.title}`,
                job,
                analytics: analyticsData,
                user: req.user
            });
        }

        res.json({
            success: true,
            data: analyticsData
        });
    } catch (error) {
        console.error('Error fetching analytics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch analytics'
        });
    }
};

// @desc    Get candidates for a job
// @route   GET /api/jobs/:id/candidates
// @access  Private (HR/Admin)
exports.getJobCandidates = async (req, res) => {
    try {
        const { status, sort } = req.query;

        const query = { job: req.params.id };

        if (status) {
            query.status = status;
        }

        let sortOption = { appliedAt: -1 }; // Default: newest first

        if (sort === 'score') {
            sortOption = { 'assessmentResults.weightedScore': -1 };
        } else if (sort === 'name') {
            sortOption = { candidateName: 1 };
        }

        const candidates = await Application.find(query).sort(sortOption)
            .populate('job', 'title');

        // If browser request, render view
        if (req.headers.accept && req.headers.accept.includes('text/html')) {
            const job = await Job.findById(req.params.id);
            return res.render('job-candidates.ejs', {
                title: `Candidates | ${job.title}`,
                job,
                candidates,
                user: req.user
            });
        }

        res.json({
            success: true,
            count: candidates.length,
            data: candidates
        });
    } catch (error) {
        console.error('Error fetching candidates:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch candidates'
        });
    }
};

// @desc    Render HR dashboard
// @route   GET /api/jobs/dashboard/view
// @access  Private (HR/Admin)
exports.renderHRDashboard = async (req, res) => {
    try {
        res.render('hr-dashboard', {
            user: req.user,
            title: 'HR Dashboard'
        });
    } catch (error) {
        console.error('Error rendering dashboard:', error);
        res.status(500).send('Error loading dashboard');
    }
};

// @desc    Render create job page
// @route   GET /api/jobs/create/view
// @access  Private (HR/Admin)
exports.renderCreateJob = async (req, res) => {
    try {
        res.render('create-job', {
            user: req.user,
            title: 'Create Job Posting'
        });
    } catch (error) {
        console.error('Error rendering create job page:', error);
        res.status(500).send('Error loading page');
    }
};

// @desc    Render job detail page
// @route   GET /api/jobs/:id/view
// @access  Private (HR/Admin)
exports.renderJobDetail = async (req, res) => {
    try {
        const job = await Job.findById(req.params.id)
            .populate({
                path: 'assessmentId',
                populate: {
                    path: 'technicalQuestions.questionId'
                }
            })
            .populate('postedBy', 'name email');

        if (!job) {
            return res.status(404).send('Job not found');
        }

        res.render('job-detail', {
            user: req.user,
            job,
            title: job.title
        });
    } catch (error) {
        console.error('Error rendering job detail:', error);
        res.status(500).send('Error loading job');
    }
};
