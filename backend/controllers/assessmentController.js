const Application = require('../models/Application');
const Assessment = require('../models/Assessment');
const Question = require('../models/Question');
const ChatSession = require('../models/ChatSession');
const chatService = require('../services/chatService');
const aiService = require('../services/aiService');
const notificationService = require('../services/notificationService');
const User = require('../models/User');
const Job = require('../models/Job');
const { logAction } = require('../utils/auditLogger');

// Helper to sanitize skill names for Mongoose Map keys (no dots allowed)
const sanitizeSkill = (skill) => {
    if (!skill) return 'General';
    return skill.replace(/\./g, '．'); // Replace dot with Unicode Fullwidth Full Stop
};

// @desc    Start/Resume Assessment
// @route   GET /api/assessment/assessment/:applicationId
// @access  Private (Candidate)
exports.startAssessment = async (req, res) => {
    try {
        const application = await Application.findById(req.params.applicationId)
            .populate('job')
            .populate({
                path: 'job',
                populate: { path: 'assessmentId' }
            });

        if (!application) return res.status(404).send('Application not found');
        if (application.candidate.toString() !== req.user._id.toString()) {
            return res.status(403).send('Unauthorized');
        }

        // --- NEW GUARD: INVITE ONLY ---
        const allowedStatuses = ['invited', 'in_progress'];
        if (!allowedStatuses.includes(application.assessmentStatus)) {
            return res.status(403).send('<h2>Access Denied</h2><p>You must be invited by HR to take this assessment.</p><a href="/api/applications/my-dashboard">Back to Dashboard</a>');
        }

        if (application.assessmentStatus === 'completed') {
            return res.redirect(`/api/applications/application/${application._id}/view`);
        }

        // Check if a chat session already exists for this assessment
        let session = await ChatSession.findOne({
            user: req.user._id,
            application: application._id,
            status: 'active'
        });

        if (!session) {
            const assessment = application.job.assessmentId;
            if (!assessment) return res.status(400).send('Assessment configuration missing for this job');

            // Prevent starting if any questions are STILL pending HR approval
            // We do a live check (not status field) to avoid stale data issues
            const Assessment = require('../models/Assessment');
            const fullyPopulated = await Assessment.findById(assessment._id).populate('technicalQuestions.questionId');
            const stillPending = fullyPopulated.technicalQuestions.some(q => q.questionId?.status === 'pending_review');
            if (stillPending) {
                return res.status(400).send('This assessment is currently undergoing moderation by HR. Please check back later.');
            }

            // Initialize Phase 1: MCQ (Only if enabled)
            const includeTechnical = application.assessmentConfig?.includeTechnical !== false;
            
            session = await ChatSession.create({
                user: req.user._id,
                application: application._id,
                archetype: {
                    role: application.job.title,
                    type: 'CANDIDATE_ASSESSMENT'
                },
                status: 'active',
                assessmentPhase: includeTechnical ? 'MCQ' : 'SCENARIO',
                currentMCQIndex: 0,
                mcqAnswers: [],
                persona: {
                    name: 'Assessment Engine',
                    role: 'Proctor',
                    mood: 'Neutral'
                },
                scenarioProgress: {
                    currentScenario: 1,
                    totalScenarios: assessment.scenarioTemplates.length,
                    scenarios: assessment.scenarioTemplates.map((s, i) => {
                        // Map theme to a realistic stakeholder role
                        const themeToRole = {
                            'Leadership': 'Senior Manager',
                            'Collaboration': 'Cross-Functional Lead',
                            'Influence': 'Key Stakeholder',
                            'Communication': 'Client Director',
                            'Problem-solving': 'Technical Lead',
                            'Teamwork': 'Team Member',
                            'Conflict Resolution': 'Concerned Partner',
                            'Strategic Thinking': 'Executive Sponsor',
                            'Operations': 'Operations Head',
                            'Sales': 'Sales Director',
                            'Customer Success': 'Client Success Manager'
                        };
                        const skillName = s.softSkill || s.theme || 'General';
                        const stakeholderRole = s.stakeholder || themeToRole[skillName] || `${skillName} Lead`;
                        return {
                            scenarioNumber: i + 1,
                            stakeholder: stakeholderRole,
                            theme: s.theme,
                            softSkill: skillName,
                            description: s.prompt,
                            status: 'pending'
                        };
                    })
                },
                worldState: {},
                skillScores: {}
            });

            // Update application status
            application.assessmentStatus = 'in_progress';
            await application.save();

            // Audit Log: assessment started
            await logAction({
                entityType: 'application',
                entityId: application._id,
                action: 'assessment_started',
                req,
                metadata: { sessionId: session._id }
            });
        }

        res.render('dojo-assessment', {
            user: req.user,
            sessionId: session._id,
            applicationId: application._id
        });
    } catch (error) {
        console.error('Error starting assessment:', error);
        res.status(500).send('Error starting assessment');
    }
};

// @desc    Get Assessment Current State
// @route   GET /api/assessment/session/:id
// @access  Private (Candidate)
exports.getAssessmentSession = async (req, res) => {
    try {
        const session = await ChatSession.findById(req.params.id)
            .populate({
                path: 'application',
                populate: {
                    path: 'job',
                    populate: {
                        path: 'assessmentId',
                        populate: { path: 'technicalQuestions.questionId' }
                    }
                }
            });

        if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

        const assessment = session.application.job.assessmentId;

        // If in MCQ phase, return current question
        if (session.assessmentPhase === 'MCQ') {
            // Include questions that are active or newly generated (pending_review)
            const availableQuestions = assessment.technicalQuestions.filter(q =>
                q.questionId && q.questionId.status === 'active'
            );

            const currentIdx = session.currentMCQIndex;
            const totalQuestions = availableQuestions.length;

            if (totalQuestions > 0 && currentIdx < totalQuestions) {
                const qRef = availableQuestions[currentIdx];
                const question = qRef.questionId;

                return res.json({
                    success: true,
                    data: {
                        phase: 'MCQ',
                        current: currentIdx + 1,
                        total: totalQuestions,
                        question: {
                            _id: question._id,
                            text: question.question,
                            options: question.options,
                            skill: question.skill
                        }
                    }
                });
            } else {
                // Transition to Scenario Phase ONLY if scenarios exist
                const hasScenarios = session.scenarioProgress?.scenarios?.length > 0;
                console.log(`[ASSESSMENT] MCQ Phase complete. Scenarios exist: ${hasScenarios}`);
                
                if (hasScenarios) {
                    session.assessmentPhase = 'SCENARIO';
                    // Initialize first scenario persona if not set
                    if (session.persona?.role === 'Proctor') {
                        const firstScenario = session.scenarioProgress.scenarios[0];
                        session.persona = {
                            name: firstScenario.stakeholder,
                            role: firstScenario.stakeholder,
                            mood: 'Professional',
                            briefing: {
                                situation: firstScenario.description,
                                objective: 'Navigate the situation effectively',
                                stakes: 'High'
                            }
                        };
                    }
                    // Initialize worldState if empty
                    if (!session.worldState || session.worldState.size === 0) {
                        const config = assessment.simulationConfig;
                        const metrics = (config && config.metrics && config.metrics.length > 0)
                            ? config.metrics
                            : ['Stakeholder Trust', 'Execution Quality', 'Relationship Risk'];
                        
                        const initialState = {};
                        metrics.forEach(m => initialState[m] = 50);
                        session.worldState = initialState;
                    }
                } else {
                    session.assessmentPhase = 'COMPLETED';
                }
                await session.save();
            }
        }

        // If in Scenario phase
        if (session.assessmentPhase === 'SCENARIO') {
            const currentIdx = session.scenarioProgress.currentScenario - 1;
            const currentScenario = session.scenarioProgress.scenarios[currentIdx];

            if (!currentScenario) {
                console.warn(`[ASSESSMENT] Scenario data missing for index ${currentIdx}. Completing session.`);
                session.assessmentPhase = 'COMPLETED';
                await session.save();
                return res.json({ success: true, data: { phase: 'COMPLETED' } });
            }

            return res.json({
                success: true,
                data: {
                    phase: 'SCENARIO',
                    current: session.scenarioProgress.currentScenario,
                    total: session.scenarioProgress.totalScenarios,
                    scenario: currentScenario,
                    messages: session.messages,
                    worldState: Object.fromEntries(session.worldState || new Map())
                }
            });
        }

        // If phase is COMPLETED (all enabled sections done)
        if (session.assessmentPhase === 'COMPLETED') {
            return res.json({
                success: true,
                data: {
                    phase: 'COMPLETED'
                }
            });
        }

        res.json({ success: false, error: 'Unknown phase' });
    } catch (error) {
        console.error('Error getting assessment session:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
};

// @desc    Submit MCQ Answer
// @route   POST /api/assessment/submit-mcq
// @access  Private (Candidate)
exports.submitMCQAnswer = async (req, res) => {
    try {
        const { sessionId, answerIndex } = req.body;
        const session = await ChatSession.findById(sessionId)
            .populate({
                path: 'application',
                populate: {
                    path: 'job',
                    populate: {
                        path: 'assessmentId',
                        populate: { path: 'technicalQuestions.questionId' }
                    }
                }
            });

        if (!session || session.assessmentPhase !== 'MCQ') {
            return res.status(400).json({ success: false, error: 'Invalid session or phase' });
        }

        const assessment = session.application.job.assessmentId;
        const availableQuestions = assessment.technicalQuestions.filter(q =>
            q.questionId && q.questionId.status === 'active'
        );

        const currentIdx = session.currentMCQIndex;
        if (currentIdx >= availableQuestions.length) {
            return res.status(400).json({ success: false, error: 'No more questions' });
        }

        const question = availableQuestions[currentIdx]?.questionId;

        // Guard: if the question document no longer exists (deleted from bank), skip gracefully
        if (!question) {
            await ChatSession.findByIdAndUpdate(sessionId, { $inc: { currentMCQIndex: 1 } });
            return res.json({ success: true, data: { phaseComplete: false, nextPhase: 'MCQ' } });
        }

        // Grade the answer
        const isCorrect = question.correctAnswer === parseInt(answerIndex);

        // Update question statistics (usageCount, avgScore)
        await question.recordUsage(isCorrect);

        // Atomic Update to prevent race conditions during rapid clicking
        const skillKey = sanitizeSkill(question.skill);
        
        // Get current score safely (handle Map vs Object)
        let currentScore = 0;
        if (session.skillScores) {
            if (typeof session.skillScores.get === 'function') {
                currentScore = session.skillScores.get(skillKey) || 0;
            } else {
                currentScore = session.skillScores[skillKey] || 0;
            }
        }
        
        const updatedSession = await ChatSession.findByIdAndUpdate(
            sessionId,
            {
                $push: {
                    mcqAnswers: {
                        questionId: question._id,
                        answerIndex: parseInt(answerIndex),
                        isCorrect,
                        skill: question.skill
                    }
                },
                $inc: { currentMCQIndex: 1 },
                $set: {
                    [`skillScores.${skillKey}`]: currentScore + (isCorrect ? 10 : 0)
                }
            },
            { new: true }
        );

        // Check if phase is complete
        const totalMCQs = availableQuestions.length;
        let phaseComplete = false;
        if (updatedSession.currentMCQIndex >= totalMCQs) {
            const includeScenarios = session.application.assessmentConfig?.includeScenarios !== false;
            const hasScenarios = updatedSession.scenarioProgress?.scenarios?.length > 0;
            phaseComplete = true;

            if (includeScenarios && hasScenarios) {
                updatedSession.assessmentPhase = 'SCENARIO';
                
                // Initialize first scenario persona
                const firstScenario = updatedSession.scenarioProgress.scenarios[0];
                updatedSession.persona = {
                    name: firstScenario.stakeholder,
                    role: firstScenario.stakeholder,
                    mood: 'Professional',
                    briefing: {
                        situation: firstScenario.description,
                        objective: 'Navigate the situation effectively',
                        stakes: 'High'
                    }
                };

                // Set initial world state if not already set
                if (!updatedSession.worldState || updatedSession.worldState.size === 0) {
                    const config = assessment.simulationConfig;
                    const metrics = (config && config.metrics && config.metrics.length > 0)
                        ? config.metrics
                        : ['Stakeholder Trust', 'Execution Quality', 'Relationship Risk'];
                    
                    metrics.forEach(m => {
                        updatedSession.worldState.set(m, 50);
                    });
                }
            } else {
                updatedSession.assessmentPhase = 'COMPLETED';
            }
            
            await updatedSession.save();
        }

        res.json({
            success: true,
            data: {
                phaseComplete,
                nextPhase: updatedSession.assessmentPhase
            }
        });
    } catch (error) {
        console.error('Error submitting MCQ:', error);
        res.status(500).json({ success: false, error: 'Error submitting answer' });
    }
};

// @desc    Respond to Scenario (Assessment Version)
// @route   POST /api/assessment/respond
// @access  Private (Candidate)
exports.respondToScenario = async (req, res) => {
    // This is almost identical to dojoController.respondToScenario
    // but optimized for assessment (uses Groq AI for response)
    try {
        const { sessionId, message, mcqChoice } = req.body;
        const session = await ChatSession.findById(sessionId).populate({
            path: 'application',
            populate: { path: 'job' }
        });

        if (!session || session.assessmentPhase !== 'SCENARIO') {
            return res.status(400).json({ success: false, error: 'Invalid session or phase' });
        }

        const role = session.archetype.role;
        const currentScenarioIndex = session.scenarioProgress.currentScenario - 1;
        const currentScenario = session.scenarioProgress.scenarios[currentScenarioIndex];

        let userMessage = String(message || '').trim();
        //let approach = 'Results';


        // --- NEW DYNAMIC EVALUATION ---
        // 1. Analyze user response using AI Judge
        const currentMetrics = Array.from(session.worldState.entries()).map(([name, value]) => ({ name, value }));
        const evaluation = await aiService.evaluateBehavioralResponse(
            { prompt: currentScenario.description, softSkill: currentScenario.theme || currentScenario.stakeholder },
            userMessage,
            currentMetrics
        );

        console.log(`[AI JUDGE] Assessment Evaluation for ${session._id}:`, evaluation);

        // 2. Apply deltas to worldState
        if (evaluation.deltas) {
            for (const [metric, delta] of Object.entries(evaluation.deltas)) {
                const currentVal = session.worldState.get(metric) ?? 50;
                session.worldState.set(metric, Math.max(0, Math.min(100, currentVal + Number(delta))));

                // Track skill scores - we use the scenario theme/stakeholder as the skill proxy
                if (delta > 0) {
                    const approach = 'Behavioral'; // Generic label for free-text
                    const currentSkillScore = session.skillScores.get(approach) || 0;
                    session.skillScores.set(approach, currentSkillScore + delta);
                }
            }
        }

        const aiResponseText = evaluation.feedback || "I understand. Let's see how this plays out.";

        // Atomic update for message history and metrics
        const updatedSession = await ChatSession.findByIdAndUpdate(
            sessionId,
            {
                $push: {
                    messages: {
                        $each: [
                            { sender: 'user', text: userMessage },
                            { sender: 'ai', text: aiResponseText }
                        ]
                    }
                },
                $inc: { turnCount: 1 },
                $set: {
                    worldState: session.worldState // Already updated in-memory for simpler logic, but we could do more complex $inc here
                }
            },
            { new: true }
        );

        // Map modified metrics back to session for UI logic
        if (evaluation.deltas) {
            for (const [metric, delta] of Object.entries(evaluation.deltas)) {
                if (delta > 0) {
                    const approach = 'Behavioral';
                    updatedSession.skillScores.set(approach, (updatedSession.skillScores.get(approach) || 0) + delta);
                }
            }
            await updatedSession.save(); // Save the skillScore update
        }

        // Turn limit per scenario in assessment
        const MAX_TURNS = 3;
        const isScenarioOver = (updatedSession.messages.length / 2) >= MAX_TURNS;
        const isLastScenario = updatedSession.scenarioProgress.currentScenario >= updatedSession.scenarioProgress.totalScenarios;

        res.json({
            success: true,
            data: {
                message: aiResponseText,
                worldState: Object.fromEntries(session.worldState),
                isResolved: isScenarioOver,
                isLastScenario: isLastScenario && isScenarioOver
            }
        });

    } catch (error) {
        console.error('Error responding to scenario:', error);
        res.status(500).json({ success: false, error: 'Internal system error' });
    }
};

// @desc    Advance to Next Scenario (Assessment Version)
// @route   POST /api/assessment/next
// @access  Private (Candidate)
exports.nextScenario = async (req, res) => {
    try {
        const { sessionId, reason } = req.body;
        const session = await ChatSession.findById(sessionId).populate({
            path: 'application',
            populate: { path: 'job', populate: { path: 'assessmentId' } }
        });

        if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

        const currentIdx = session.scenarioProgress.currentScenario - 1;
        const scenarios = session.scenarioProgress.scenarios;
        const assessment = session.application.job.assessmentId;

        // Mark current scenario as resolved
        scenarios[currentIdx].status = 'resolved';
        scenarios[currentIdx].completedAt = new Date();

        const isLast = session.scenarioProgress.currentScenario >= session.scenarioProgress.totalScenarios;

        if (!isLast) {
            session.scenarioProgress.currentScenario += 1;
            const nextIdx = session.scenarioProgress.currentScenario - 1;
            const next = scenarios[nextIdx];
            const nextTemplate = assessment.scenarioTemplates[nextIdx];

            next.status = 'pending';
            next.startedAt = new Date();

            session.persona.name = next.stakeholder;
            session.persona.role = next.stakeholder;
            session.persona.briefing.situation = next.description;
            session.persona.softSkill = next.softSkill;
            session.messages = []; // Clear messages for new scenario — metrics carry over unchanged

            // NOTE: No new metrics injected. The same 3 metrics from simulationConfig
            // are used for the ENTIRE assessment across all scenarios.

            console.log(`[ASSESSMENT] Advancing to Scenario ${session.scenarioProgress.currentScenario}`);
        } else {
            session.status = 'completed';
            session.completedAt = new Date();
            console.log(`[ASSESSMENT] All scenarios complete.`);
        }

        session.markModified('scenarioProgress.scenarios');
        session.markModified('worldState');
        session.markModified('metricPolarity');
        await session.save();

        res.json({
            success: true,
            data: {
                currentScenario: session.scenarioProgress.currentScenario,
                isComplete: session.status === 'completed'
            }
        });
    } catch (error) {
        console.error('Error advancing scenario:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Finalize Assessment
// @route   POST /api/assessment/finalize
// @access  Private (Candidate)
exports.finalizeAssessment = async (req, res) => {
    try {
        const { sessionId } = req.body;
        const session = await ChatSession.findById(sessionId).populate('application');
        if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

        const application = await Application.findById(session.application._id).populate({
            path: 'job',
            populate: { path: 'assessmentId' }
        });
        const assessment = application.job.assessmentId;

        // 1. Calculate Technical Score (MCQ) and Skill Breakdown
        const skillStats = {};
        session.mcqAnswers.forEach(answer => {
            const skill = answer.skill || 'General';
            if (!skillStats[skill]) skillStats[skill] = { correct: 0, total: 0 };
            skillStats[skill].total++;
            if (answer.isCorrect) skillStats[skill].correct++;
        });

        const skillBreakdown = {};
        Object.keys(skillStats).forEach(skill => {
            const sanitizedKey = sanitizeSkill(skill);
            skillBreakdown[sanitizedKey] = Math.round((skillStats[skill].correct / skillStats[skill].total) * 100);
        });

        const correctMCQs = session.mcqAnswers.filter(a => a.isCorrect).length;
        const totalMCQs = session.mcqAnswers.length;
        const techScore = totalMCQs > 0 ? (correctMCQs / totalMCQs) * 100 : 0;

        // 2. Calculate Soft Skill Score (Scenario)
        const worldStateEntries = Object.fromEntries(session.worldState);
        const metricPolarity = session.metricPolarity ? Object.fromEntries(session.metricPolarity) : {};

        let totalHealth = 0;
        let count = 0;

        Object.entries(worldStateEntries).forEach(([metric, value]) => {
            const polarity = metricPolarity[metric] || 'high';
            let health = (polarity === 'high') ? value : (100 - value);
            totalHealth += health;
            count++;
        });
        const softScore = count > 0 ? totalHealth / count : 0;

        // 3. Calculate Weighted Score (Normalized if sessions are skipped)
        const hasTech = application.assessmentConfig?.includeTechnical !== false;
        const hasSoft = application.assessmentConfig?.includeScenario !== false;

        let weightedScore;
        if (hasTech && hasSoft) {
            weightedScore = (techScore * assessment.technicalWeight) + (softScore * assessment.softSkillWeight);
        } else if (hasTech) {
            weightedScore = techScore; // 100% weight to Tech
        } else if (hasSoft) {
            weightedScore = softScore; // 100% weight to Soft
        } else {
            weightedScore = 0;
        }

        // 4. Determine Fit
        let overallFit = 'Need Review';
        if (weightedScore >= 85) overallFit = 'High Potential';
        else if (weightedScore >= 70) overallFit = 'Strong Fit';
        else if (weightedScore >= 50) overallFit = 'Moderate Fit';
        else overallFit = 'Low Fit';

        // 5. Update Application
        application.assessmentStatus = 'completed';
        // Keep status as 'applied' (or current lifecycle status) to avoid confusion in HR view
        // application.status = weightedScore >= (assessment.minTechnicalScore || 60) ? 'assessment_completed' : 'applied';
        application.assessmentResults = {
            technicalScore: Math.round(techScore),
            softSkillScore: Math.round(softScore),
            weightedScore: Math.round(weightedScore),
            overallFit,
            skillBreakdown,
            softSkillBreakdown: worldStateEntries,
            completedAt: new Date()
        };
        await application.save();

        // Audit Log: assessment completed
        await logAction({
            entityType: 'application',
            entityId: application._id,
            action: 'assessment_completed',
            req: { user: { _id: session.user, role: 'candidate' } }, // Manual req object for systemic log
            metadata: {
                weightedScore: application.assessmentResults.weightedScore,
                overallFit: application.assessmentResults.overallFit
            }
        });

        // 6. Update Job Stats
        if (application.job) {
            const Job = require('../models/Job');
            await Job.findByIdAndUpdate(application.job._id, {
                $inc: { assessmentsCompleted: 1 }
            });
            console.log(`[METRICS] Incremented assessmentsCompleted for job: ${application.job._id}`);
        }

        session.status = 'completed';
        session.completedAt = new Date();
        await session.save();

        // 7. Send Notification to HR (non-critical — wrap in try/catch so missing template won't crash finalize)
        try {
            let hrId = application.job ? application.job.postedBy : null;
            if (!hrId) {
                const fallbackHr = await User.findOne({ role: 'hr', department: application.job?.department }) || await User.findOne({ role: 'hr' });
                hrId = fallbackHr ? fallbackHr._id : null;
            }

            if (hrId) {
                await notificationService.sendNotification({
                    recipientId: hrId,
                    jobId: application.job?._id,
                    senderId: session.user,
                    templateName: 'hr_assessment_complete',
                    data: {
                        candidateName: application.candidateName,
                        jobTitle: application.job?.title || 'the job',
                        score: Math.round(weightedScore),
                        fit: overallFit
                    },
                    type: 'HR',
                    actionUrl: `/api/applications/application/${application._id}/view`
                });
            }
        } catch (notifErr) {
            console.warn('[ASSESSMENT] HR notification failed (non-critical):', notifErr.message);
        }

        res.json({
            success: true,
            data: {
                techScore: Math.round(techScore),
                softScore: Math.round(softScore),
                weightedScore: Math.round(weightedScore),
                overallFit
            }
        });
    } catch (error) {
        console.error('Error finalizing assessment:', error);
        res.status(500).json({ success: false, error: 'Failed to finalize assessment' });
    }
};
