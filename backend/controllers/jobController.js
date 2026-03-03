const Job = require('../models/Job');
const Assessment = require('../models/Assessment');
const Application = require('../models/Application');
const Question = require('../models/Question');
const aiService = require('../services/aiService');
const { generateAssessment } = require('../services/assessmentGeneratorService');

// ==========================================
// JOB MANAGEMENT (HR Actions)
// ==========================================

/**
 * @desc    Post a new job opportunity
 * @route   POST /api/jobs
 */
exports.createJob = async (req, res) => {
    try {
        const data = req.body;

        // Create job with sensible defaults
        const job = await Job.create({
            ...data,
            assessmentConfig: {
                questionsPerSkill: parseInt(data.questionsPerSkill) || 3,
                allowAIGeneration: data.allowAIGeneration === 'on' || data.allowAIGeneration === true
            },
            postedBy: req.user._id,
            status: 'active'
        });

        res.status(201).json({ success: true, data: job });
    } catch (error) {
        console.error('[CONTROLLER ERROR] createJob:', error);
        res.status(500).json({ success: false, error: 'Creation failed' });
    }
};

/**
 * @desc    Delete a job and its linked assessment (e.g., rollback on failed generation)
 * @route   DELETE /api/jobs/:id
 */
exports.deleteJob = async (req, res) => {
    try {
        const job = await Job.findById(req.params.id);
        if (!job) return res.status(404).json({ success: false, error: 'Job not found' });

        // Only owner or admin can delete
        if (job.postedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'Unauthorized' });
        }

        // Delete linked assessment if exists
        if (job.assessmentId) {
            await Assessment.findByIdAndDelete(job.assessmentId);
        }

        await Job.findByIdAndDelete(req.params.id);

        res.json({ success: true, message: 'Job deleted successfully' });
    } catch (error) {
        console.error('[CONTROLLER ERROR] deleteJob:', error);
        res.status(500).json({ success: false, error: 'Delete failed' });
    }
};

/**
 * @desc    Triggers AI to analyze JD and generate a tailored assessment
 * @route   POST /api/jobs/:id/generate-assessment
 */
exports.generateAssessment = async (req, res) => {
    try {
        const job = await Job.findById(req.params.id);
        if (!job) return res.status(404).json({ success: false, error: 'Job not found' });

        // Security: Ensure ownership
        if (job.postedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'Unauthorized' });
        }

        // Call the generation service
        const { assessment, analysis, warnings } = await generateAssessment(
            job.description,
            job._id,
            req.user._id,
            job.assessmentConfig
        );

        // Link the generated assessment back to the job
        job.assessmentId = assessment._id;
        await job.save();

        res.json({ success: true, data: { job, assessment, analysis, warnings } });
    } catch (error) {
        console.error('[CONTROLLER ERROR] generateAssessment:', error);
        res.status(500).json({ success: false, error: 'AI Generation failed' });
    }
};

/**
 * @desc    Adjust weights and configuration for an assessment
 * @route   PUT /api/jobs/:id/assessment
 */
exports.updateAssessment = async (req, res) => {
    try {
        const job = await Job.findById(req.params.id).populate('assessmentId');
        if (!job?.assessmentId) return res.status(404).json({ success: false, error: 'Assessment not found' });

        const body = req.body;

        // 1. Update Weights & Scores
        const weights = ['technicalWeight', 'softSkillWeight', 'minTechnicalScore', 'minSoftSkillScore'];
        weights.forEach(f => { if (body[f] !== undefined) job.assessmentId[f] = body[f]; });

        // 2. Update Job-level Generation Config
        if (body.questionsPerSkill || body.allowAIGeneration || body.skillConfigs) {
            if (body.questionsPerSkill) job.assessmentConfig.questionsPerSkill = parseInt(body.questionsPerSkill);
            if (body.allowAIGeneration !== undefined) job.assessmentConfig.allowAIGeneration = !!body.allowAIGeneration;

            if (body.skillConfigs) {
                job.assessmentConfig.skillConfigs = Object.entries(body.skillConfigs).map(([skill, count]) => ({
                    skill, questionCount: parseInt(count)
                }));
            }
            await job.save();
        }

        await job.assessmentId.save();
        res.json({ success: true, data: job.assessmentId });
    } catch (error) {
        console.error('[CONTROLLER ERROR] updateAssessment:', error);
        res.status(500).json({ success: false, error: 'Update failed' });
    }
};

/**
 * @desc    Fetch jobs for the HR/Admin dashboard
 * @route   GET /api/jobs
 */
exports.getJobs = async (req, res) => {
    try {
        const { status, search } = req.query;
        const query = {};

        if (status) query.status = status;
        if (search) query.$or = [{ title: { $regex: search, $options: 'i' } }, { department: { $regex: search, $options: 'i' } }];

        // Identity filter: HR sees only their jobs
        if (req.user.role === 'hr') query.postedBy = req.user._id;

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 6;
        const skip = (page - 1) * limit;

        const totalJobs = await Job.countDocuments(query);
        const totalPages = Math.ceil(totalJobs / limit);

        // Fetch Overview Stats (Total for the current HR user)
        const statsQuery = req.user.role === 'hr' ? { postedBy: req.user._id } : {};
        const overview = await Job.aggregate([
            { $match: statsQuery },
            {
                $group: {
                    _id: null,
                    activeCount: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
                    totalApplications: { $sum: "$applications" },
                    totalAssessmentsCompleted: { $sum: "$assessmentsCompleted" }
                }
            }
        ]);

        const jobs = await Job.find(query)
            .populate('assessmentId')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.json({
            success: true,
            count: jobs.length,
            totalJobs,
            totalPages,
            currentPage: page,
            overview: overview[0] || { activeCount: 0, totalApplications: 0, totalAssessmentsCompleted: 0 },
            data: jobs
        });
    } catch (error) {
        console.error('[CONTROLLER ERROR] getJobs:', error);
        res.status(500).json({ success: false, error: 'Fetch failed' });
    }
};

/**
 * @desc    Get full job profile by ID
 * @route   GET /api/jobs/:id
 */
exports.getJobById = async (req, res) => {
    try {
        const job = await Job.findById(req.params.id)
            .populate('assessmentId')
            .populate('postedBy', 'name email');

        if (!job) return res.status(404).json({ success: false, error: 'Not found' });
        res.json({ success: true, data: job });
    } catch (error) {
        console.error('[CONTROLLER ERROR] getJobById:', error);
        res.status(500).json({ success: false, error: 'Internal Error' });
    }
};

// @desc    Approve/Reject AI generated question
// @route   PUT /api/jobs/:id/questions/:questionId
// @access  Private (HR/Admin)
exports.moderateQuestion = async (req, res) => {
    try {
        const { id, questionId } = req.params;
        const { action } = req.body; // 'approve' or 'reject'

        console.log(`[MODERATION] action=${action} questionId=${questionId} jobId=${id}`);

        const job = await Job.findById(id);
        if (!job || !job.assessmentId) {
            return res.status(404).json({ success: false, error: 'Job or assessment not found' });
        }

        // Load assessment directly with populated questions for comparison
        const assessment = await Assessment.findById(job.assessmentId).populate('technicalQuestions.questionId');
        if (!assessment) {
            return res.status(404).json({ success: false, error: 'Assessment not found' });
        }

        console.log(`[MODERATION] Assessment has ${assessment.technicalQuestions.length} questions`);

        // Robust comparison: handle both populated & unpopulated questionId refs
        const qIndex = assessment.technicalQuestions.findIndex(q => {
            const qId = q.questionId;
            if (!qId) return false;
            // If populated (object with _id), compare _id; if unpopulated (ObjectId), compare directly
            const idStr = qId._id ? qId._id.toString() : qId.toString();
            return idStr === questionId;
        });

        console.log(`[MODERATION] findIndex result: ${qIndex}`);

        if (qIndex === -1) {
            console.error(`[MODERATION ERROR] questionId ${questionId} not found. IDs in assessment:`,
                assessment.technicalQuestions.map(q => {
                    const qId = q.questionId;
                    if (!qId) return 'null';
                    return qId._id ? qId._id.toString() : qId.toString();
                })
            );
            return res.status(404).json({ success: false, error: 'Question not found in assessment' });
        }

        const Question = require('../models/Question');
        const questionPoolItem = await Question.findById(questionId);

        if (action === 'approve') {
            if (questionPoolItem) {
                questionPoolItem.status = 'active';
                await questionPoolItem.save();
                console.log(`[MODERATION] Question ${questionId} approved and added to active bank.`);
            } else {
                console.warn(`[MODERATION] Question ${questionId} not in Question collection. Marking assessment entry only.`);
            }
        } else if (action === 'reject') {
            // Remove from assessment
            assessment.technicalQuestions.splice(qIndex, 1);
            assessment.markModified('technicalQuestions');
            await assessment.save();

            // Retire from pool
            if (questionPoolItem) {
                questionPoolItem.status = 'retired';
                await questionPoolItem.save();
                console.log(`[MODERATION] Question ${questionId} rejected and retired.`);
            }
        }

        // Re-calculate assessment status: only blocked if questions still need approval
        const updatedAssessment = await Assessment.findById(assessment._id).populate('technicalQuestions.questionId');
        const hasPending = updatedAssessment.technicalQuestions.some(q => q.questionId?.status === 'pending_review');

        updatedAssessment.status = hasPending ? 'pending_review' : 'active';
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

// @desc    Approve all pending questions in an assessment
// @route   POST /api/jobs/:id/approve-all
// @access  Private (HR/Admin)
exports.approveAllQuestions = async (req, res) => {
    try {
        const job = await Job.findById(req.params.id);
        if (!job || !job.assessmentId) {
            return res.status(404).json({ success: false, error: 'Job or assessment not found' });
        }

        const Assessment = require('../models/Assessment');
        const Question = require('../models/Question');
        const assessment = await Assessment.findById(job.assessmentId).populate('technicalQuestions.questionId');

        for (const qEntry of assessment.technicalQuestions) {
            if (qEntry.questionId && qEntry.questionId.status === 'pending_review') {
                qEntry.questionId.status = 'active';
                await qEntry.questionId.save();
            }
        }

        // Assessment is now active as long as no questions are still pending review
        assessment.status = assessment.technicalQuestions.some(
            q => q.questionId?.status === 'pending_review'
        ) ? 'pending_review' : 'active';
        await assessment.save();

        res.json({
            success: true,
            message: 'All pending questions approved and added to global bank',
            data: assessment
        });
    } catch (error) {
        console.error('Error approving all questions:', error);
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

/**
 * @desc    Get data for the analytics dashboard (JSON or HTML)
 * @route   GET /api/jobs/:id/analytics
 */
exports.getJobAnalytics = async (req, res) => {
    try {
        const job = await Job.findById(req.params.id);
        if (!job) return res.status(404).json({ success: false, error: 'Job not found' });

        const [total, completed, shortlisted] = await Promise.all([
            Application.countDocuments({ job: job._id }),
            Application.countDocuments({ job: job._id, assessmentStatus: 'completed' }),
            Application.countDocuments({ job: job._id, status: 'shortlisted' })
        ]);

        const apps = await Application.find({ job: job._id, assessmentStatus: 'completed' });
        const calcAvg = (field) => apps.length ? (apps.reduce((sum, a) => sum + (a.assessmentResults?.[field] || 0), 0) / apps.length).toFixed(1) : 0;

        const analyticsData = {
            views: job.views,
            applications: total,
            completedAssessments: completed,
            shortlisted,
            avgTechnicalScore: calcAvg('technicalScore'),
            avgSoftSkillScore: calcAvg('softSkillScore'),
            avgWeightedScore: calcAvg('weightedScore'),
            conversionRates: {
                viewToApply: job.views ? (total / job.views * 100).toFixed(1) : 0,
                applyToComplete: total ? (completed / total * 100).toFixed(1) : 0,
                completeToShortlist: completed ? (shortlisted / completed * 100).toFixed(1) : 0
            },
            scoreDistribution: {
                '<50': apps.filter(a => (a.assessmentResults?.weightedScore || 0) < 50).length,
                '50-70': apps.filter(a => (a.assessmentResults?.weightedScore || 0) >= 50 && (a.assessmentResults?.weightedScore || 0) < 70).length,
                '70-85': apps.filter(a => (a.assessmentResults?.weightedScore || 0) >= 70 && (a.assessmentResults?.weightedScore || 0) < 85).length,
                '>85': apps.filter(a => (a.assessmentResults?.weightedScore || 0) >= 85).length
            },
            skillGapAnalysis: {}
        };

        // Calculate Average Score Per Skill
        const skillTotals = {};
        const skillCounts = {};

        apps.forEach(app => {
            if (app.assessmentResults?.skillBreakdown) {
                app.assessmentResults.skillBreakdown.forEach((score, skill) => {
                    skillTotals[skill] = (skillTotals[skill] || 0) + score;
                    skillCounts[skill] = (skillCounts[skill] || 0) + 1;
                });
            }
        });

        Object.keys(skillTotals).forEach(skill => {
            analyticsData.skillGapAnalysis[skill] = (skillTotals[skill] / skillCounts[skill]).toFixed(1);
        });

        if (req.headers.accept?.includes('text/html')) {
            return res.render('job-analytics.ejs', { title: 'Analytics', job, analytics: analyticsData, user: req.user });
        }
        res.json({ success: true, data: analyticsData });
    } catch (error) {
        console.error('[CONTROLLER ERROR] getJobAnalytics:', error);
        res.status(500).json({ success: false, error: 'Fetch failed' });
    }
};

/**
 * @desc    Fetch and sort candidates for a specific job
 * @route   GET /api/jobs/:id/candidates
 */
exports.getJobCandidates = async (req, res) => {
    try {
        const { status, sort } = req.query;
        const query = { job: req.params.id };
        if (status) query.status = status;

        const sortOption = sort === 'score' ? { 'assessmentResults.weightedScore': -1 } :
            sort === 'name' ? { candidateName: 1 } : { appliedAt: -1 };

        const candidates = await Application.find(query).sort(sortOption).populate('job', 'title');

        if (req.headers.accept?.includes('text/html')) {
            const job = await Job.findById(req.params.id);
            return res.render('job-candidates.ejs', { title: 'Candidates', job, candidates, user: req.user });
        }

        res.json({ success: true, count: candidates.length, data: candidates });
    } catch (error) {
        console.error('[CONTROLLER ERROR] getJobCandidates:', error);
        res.status(500).json({ success: false, error: 'Fetch failed' });
    }
};
// @desc    Add a manual technical question to an assessment
// @route   POST /api/jobs/:id/manual-question
// @access  Private (HR/Admin)
exports.addManualQuestion = async (req, res) => {
    try {
        const { question, options, correctAnswer, skill, difficulty } = req.body;
        const job = await Job.findById(req.params.id);
        if (!job) return res.status(404).json({ success: false, error: 'Job not found' });

        const assessment = await Assessment.findById(job.assessmentId);
        if (!assessment) return res.status(404).json({ success: false, error: 'Assessment not found' });

        // Generate a new Question document
        const newQuestion = await Question.create({
            question,
            options,
            correctAnswer,
            skill,
            difficulty,
            isAI: false
        });

        assessment.technicalQuestions.push({
            questionId: newQuestion._id,
            skill,
            difficulty,
            isManual: true
        });

        await assessment.save();
        res.status(201).json({ success: true, data: newQuestion });
    } catch (error) {
        console.error('Error adding manual question:', error);
        res.status(500).json({ success: false, error: 'Failed to add question' });
    }
};

// @desc    Add a manual scenario to an assessment
// @route   POST /api/jobs/:id/manual-scenario
// @access  Private (HR/Admin)
exports.addManualScenario = async (req, res) => {
    try {
        const { softSkill, theme, stakeholder, prompt } = req.body;
        const job = await Job.findById(req.params.id);
        if (!job) return res.status(404).json({ success: false, error: 'Job not found' });

        const assessment = await Assessment.findById(job.assessmentId);
        if (!assessment) return res.status(404).json({ success: false, error: 'Assessment not found' });

        assessment.scenarioTemplates.push({
            softSkill,
            theme,
            stakeholder,
            prompt,
            isManual: true
        });

        await assessment.save();
        res.status(201).json({ success: true, data: assessment.scenarioTemplates[assessment.scenarioTemplates.length - 1] });
    } catch (error) {
        console.error('Error adding manual scenario:', error);
        res.status(500).json({ success: false, error: 'Failed to add scenario' });
    }
};

// @desc    Refine HR rough draft using AI
// @route   POST /api/jobs/refine-content
// @access  Private (HR/Admin)
exports.refineContent = async (req, res) => {
    try {
        const { text, type } = req.body;
        if (!text) return res.status(400).json({ success: false, error: 'Text is required' });

        const refinedText = await aiService.refineHRContent(text, type || 'general');
        res.json({ success: true, data: refinedText });
    } catch (error) {
        console.error('Error refining content:', error);
        res.status(500).json({ success: false, error: 'Failed to refine content' });
    }
};

// @desc    Delete a specific scenario from an assessment
// @route   DELETE /api/jobs/:id/scenario/:scenarioId
// @access  Private (HR/Admin)
exports.deleteScenario = async (req, res) => {
    try {
        const job = await Job.findById(req.params.id);
        if (!job) return res.status(404).json({ success: false, error: 'Job not found' });

        const assessment = await Assessment.findById(job.assessmentId);
        if (!assessment) return res.status(404).json({ success: false, error: 'Assessment not found' });

        assessment.scenarioTemplates = assessment.scenarioTemplates.filter(
            s => s._id.toString() !== req.params.scenarioId
        );
        assessment.questionCounts.scenarios = assessment.scenarioTemplates.length;

        await assessment.save();
        res.json({ success: true, data: assessment });
    } catch (error) {
        console.error('Error deleting scenario:', error);
        res.status(500).json({ success: false, error: 'Failed to delete scenario' });
    }
};

// @desc    Regenerate a single specific scenario
// @route   POST /api/jobs/:id/scenario/:scenarioId/regenerate
// @access  Private (HR/Admin)
exports.regenerateSingleScenario = async (req, res) => {
    try {
        const job = await Job.findById(req.params.id);
        if (!job) return res.status(404).json({ success: false, error: 'Job not found' });

        const { regenerateSingleScenario } = require('../services/assessmentGeneratorService');
        const assessment = await regenerateSingleScenario(job.assessmentId, req.params.scenarioId);

        res.json({ success: true, data: assessment });
    } catch (error) {
        console.error('Error regenerating single scenario:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ==========================================
// VIEW CONTROLLERS (HTML Rendering)
// ==========================================

exports.renderHRDashboard = (req, res) => res.render('hr-dashboard', { user: req.user, title: 'HR Dashboard' });
exports.renderCreateJob = (req, res) => res.render('create-job', { user: req.user, title: 'Create Job' });

exports.renderJobDetail = async (req, res) => {
    try {
        const job = await Job.findById(req.params.id)
            .populate({ path: 'assessmentId', populate: { path: 'technicalQuestions.questionId' } })
            .populate('postedBy', 'name email');

        if (!job) return res.status(404).send('Job not found');
        res.render('job-detail', { user: req.user, job, title: job.title });
    } catch (e) { res.status(500).send('Error'); }
};
