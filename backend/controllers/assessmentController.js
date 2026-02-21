const Application = require('../models/Application');
const Assessment = require('../models/Assessment');
const Question = require('../models/Question');
const ChatSession = require('../models/ChatSession');
const chatService = require('../services/chatService');

// Helper to sanitize skill names for Mongoose Map keys (no dots allowed)
const sanitizeSkill = (skill) => {
    if (!skill) return 'General';
    return skill.replace(/\./g, '．'); // Replace dot with Unicode Fullwidth Full Stop
};

// @desc    Start/Resume Assessment
// @route   GET /dojo/assessment/:applicationId
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

            // Initialize Phase 1: MCQ
            // Note: We'll repurpose ChatSession or create a special field for phase tracking
            session = await ChatSession.create({
                user: req.user._id,
                application: application._id,
                archetype: {
                    role: application.job.title,
                    type: 'CANDIDATE_ASSESSMENT'
                },
                status: 'active',
                assessmentPhase: 'MCQ',
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
                    scenarios: assessment.scenarioTemplates.map((s, i) => ({
                        scenarioNumber: i + 1,
                        stakeholder: s.theme,
                        description: s.prompt,
                        status: i === 0 ? 'pending' : 'pending' // Will start after MCQ
                    }))
                },
                worldState: {},
                skillScores: {}
            });

            // Update application status
            application.assessmentStatus = 'in_progress';
            await application.save();
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
                q.questionId && (q.questionId.status === 'active' || q.questionId.status === 'pending_review')
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
                // Transition to Scenario Phase if no MCQs or all answered
                console.log(`[ASSESSMENT] MCQ Phase complete or no questions found (${totalQuestions}). Transitioning to SCENARIO.`);
                session.assessmentPhase = 'SCENARIO';
                await session.save();
                // We'll return the scenario state below
            }
        }

        // If in Scenario phase
        if (session.assessmentPhase === 'SCENARIO') {
            const currentIdx = session.scenarioProgress.currentScenario - 1;
            const currentScenario = session.scenarioProgress.scenarios[currentIdx];

            return res.json({
                success: true,
                data: {
                    phase: 'SCENARIO',
                    current: session.scenarioProgress.currentScenario,
                    total: session.scenarioProgress.totalScenarios,
                    scenario: currentScenario,
                    messages: session.messages,
                    worldState: Object.fromEntries(session.worldState)
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
            q.questionId && (q.questionId.status === 'active' || q.questionId.status === 'pending_review')
        );

        const currentIdx = session.currentMCQIndex;
        if (currentIdx >= availableQuestions.length) {
            return res.status(400).json({ success: false, error: 'No more questions' });
        }

        const question = availableQuestions[currentIdx].questionId;

        // Grade the answer
        const isCorrect = question.correctAnswer === parseInt(answerIndex);

        // Save answer with skill
        session.mcqAnswers.push({
            questionId: question._id,
            answerIndex: parseInt(answerIndex),
            isCorrect,
            skill: question.skill
        });

        // Track technical score with sanitized skill
        if (isCorrect) {
            const skillName = sanitizeSkill(question.skill);
            const currentScore = session.skillScores.get(skillName) || 0;
            session.skillScores.set(skillName, currentScore + 10); // Points per correct answer
        }

        session.currentMCQIndex += 1;

        // Check if finished MCQ phase
        const totalMCQs = assessment.technicalQuestions.length;
        let phaseComplete = false;
        if (session.currentMCQIndex >= totalMCQs) {
            session.assessmentPhase = 'SCENARIO';
            phaseComplete = true;

            // Initialize first scenario
            const firstScenario = session.scenarioProgress.scenarios[0];
            session.persona = {
                name: firstScenario.stakeholder,
                role: firstScenario.stakeholder,
                mood: 'Neutral',
                briefing: {
                    situation: firstScenario.description,
                    objective: 'Navigate the situation effectively',
                    stakes: 'High'
                }
            };
            // Set initial worldState for the first scenario
            // (In a real app, we'd define metrics per scenario theme)
            session.worldState = {
                'Trust': 50,
                'TeamMorale': 50,
                'Productivity': 50
            };
            session.metricPolarity = {
                'Trust': 'high',
                'TeamMorale': 'high',
                'Productivity': 'high'
            };
        }

        session.markModified('skillScores');
        session.markModified('mcqAnswers');
        session.markModified('worldState');
        await session.save();

        res.json({
            success: true,
            data: {
                phaseComplete,
                nextPhase: session.assessmentPhase
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
        const session = await ChatSession.findById(sessionId);

        if (!session || session.assessmentPhase !== 'SCENARIO') {
            return res.status(400).json({ success: false, error: 'Invalid session or phase' });
        }

        const role = session.archetype.role;
        const currentScenarioIndex = session.scenarioProgress.currentScenario - 1;
        const currentScenario = session.scenarioProgress.scenarios[currentScenarioIndex];

        let userMessage = String(message || '').trim();
        let approach = 'Results';

        // Initial fetch: Generate options without pushing a message
        if (!userMessage && !mcqChoice) {
            console.log(`[ASSESSMENT DEBUG] Initial fetch for scenario: ${currentScenario.stakeholder}`);
            const mcqOptions = await chatService.generateMCQOptions(
                session.messages,
                currentScenario.description,
                Object.fromEntries(session.worldState),
                role
            );
            return res.json({
                success: true,
                data: {
                    message: session.messages.length > 0 ? session.messages[session.messages.length - 1].text : null,
                    worldState: Object.fromEntries(session.worldState),
                    mcqOptions,
                    isResolved: false,
                    isLastScenario: false
                }
            });
        }

        if (mcqChoice) {
            userMessage = mcqChoice.text;
            approach = mcqChoice.approach || 'Results';

            // Apply effects (Using a simpler rule-based approach for assessments)
            const effects = {
                'Results': { 'Productivity': +10, 'TeamMorale': -5 },
                'Relationship': { 'TeamMorale': +10, 'Trust': +5 },
                'Boundary': { 'Trust': +5, 'Productivity': -5 },
                'Growth': { 'Trust': +5, 'TeamMorale': +5 }
            };

            const delta = effects[approach] || {};
            for (const [metric, change] of Object.entries(delta)) {
                const currentVal = session.worldState.get(metric) || 0;
                session.worldState.set(metric, Math.max(0, Math.min(100, currentVal + change)));
            }

            // Track Skill Scores (Soft Skills)
            const skillName = currentScenario.stakeholder + '_' + approach; // Placeholder mapping
            const currentSkillScore = session.skillScores.get(approach) || 0;
            session.skillScores.set(approach, currentSkillScore + 5);
        }

        // Update session state
        session.turnCount += 1;
        session.messages.push({ sender: 'user', text: userMessage });

        // AI Response
        const history = session.messages.map(m => ({ sender: m.sender, text: m.text }));
        const aiResponse = await chatService.generateResponse(history, {
            name: currentScenario.stakeholder,
            role: currentScenario.stakeholder,
            context: currentScenario.description,
            worldState: Object.fromEntries(session.worldState)
        }, role);

        session.messages.push({ sender: 'ai', text: aiResponse });

        // Generate MCQs for next turn
        const mcqOptions = await chatService.generateMCQOptions(
            session.messages,
            currentScenario.description,
            Object.fromEntries(session.worldState),
            role
        );

        // Turn limit per scenario in assessment
        const MAX_TURNS = 3;
        const isScenarioOver = (session.messages.length / 2) >= MAX_TURNS;
        const isLastScenario = session.scenarioProgress.currentScenario >= session.scenarioProgress.totalScenarios;

        session.markModified('worldState');
        session.markModified('skillScores');
        await session.save();

        res.json({
            success: true,
            data: {
                message: aiResponse,
                worldState: Object.fromEntries(session.worldState),
                mcqOptions,
                isResolved: isScenarioOver,
                isLastScenario: isLastScenario && isScenarioOver
            }
        });

    } catch (error) {
        console.error('Error responding to scenario:', error);
        res.status(500).json({ success: false, error: 'Internal system error' });
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
        const skillStats = {}; // { skillName: { correct: 0, total: 0 } }

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
        // Average health of worldState metrics
        const worldStateEntries = Object.fromEntries(session.worldState);
        let totalHealth = 0;
        let count = 0;
        Object.values(worldStateEntries).forEach(val => {
            totalHealth += val;
            count++;
        });
        const softScore = count > 0 ? totalHealth / count : 0;

        // 3. Calculate Weighted Score
        const weightedScore = (techScore * assessment.technicalWeight) + (softScore * assessment.softSkillWeight);

        // 4. Determine Fit
        let overallFit = 'Need Review';
        if (weightedScore >= 85) overallFit = 'High Potential';
        else if (weightedScore >= 70) overallFit = 'Strong Fit';
        else if (weightedScore >= 50) overallFit = 'Moderate Fit';
        else overallFit = 'Low Fit';

        // 5. Update Application
        application.assessmentStatus = 'completed';
        application.status = weightedScore >= (assessment.minTechnicalScore || 60) ? 'assessment_completed' : 'applied';
        application.assessmentResults = {
            technicalScore: Math.round(techScore),
            softSkillScore: Math.round(softScore),
            weightedScore: Math.round(weightedScore),
            overallFit,
            skillBreakdown,
            softSkillBreakdown: worldStateEntries, // Save raw world state as soft skill breakdown
            completedAt: new Date()
        };
        await application.save();

        session.status = 'completed';
        session.completedAt = new Date();
        await session.save();

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
