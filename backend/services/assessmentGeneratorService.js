const { analyzeJobDescription, generateScenarioTemplates } = require('./jdParserService');
const { selectQuestions } = require('./questionBankService');
const Assessment = require('../models/Assessment');

/**
 * ============================================================================
 * ASSESSMENT GENERATOR SERVICE
 * ============================================================================
 * This service is responsible for orchestrating the creation of a full
 * assessment by combining:
 * 1. AI-driven Job Description (JD) analysis.
 * 2. Database lookups for technical questions.
 * 3. AI-driven situational scenario generation.
 * ============================================================================
 */

/**
 * @desc    Generate a complete assessment from a job description
 * @param {string} jobDescription - Full job description text
 * @param {string} jobId - Job ID to link assessment to
 * @param {string} createdBy - User ID of creator (HR/Admin)
 * @param {Object} assessmentConfig - Configuration for assessment generation
 * @returns {Promise<Object>} - Created assessment with questions and scenarios
 */
async function generateAssessment(jobDescription, jobId, createdBy, assessmentConfig = {}) {
    try {
        // STEP 1: AI Job Description Analysis
        console.log('[GENERATE] Step 1: Analyzing Job Description...');
        const analysis = await analyzeJobDescription(jobDescription);

        // --- PRIORITY WEIGHTING LOGIC ---
        // 1. Recruiter overrides (if any)
        // 2. AI Analysis results
        // 3. System Defaults
        const technicalWeight = assessmentConfig.technicalWeight || analysis.technicalWeight || 0.6;
        const softSkillWeight = assessmentConfig.softSkillWeight || analysis.softSkillWeight || 0.4;

        // --- QUESTION COUNT LOGIC (The "2X Strategy") ---
        // 1. Base Count Priority: assessmentConfig > analysis > Default(2)
        const baseCount = assessmentConfig.questionsPerSkill || analysis.recommendedQuestionCount?.technical || 2;

        // 2. Per-Skill Configuration (If recruiter wants 5 for Node.js but 2 for CSS)
        let countConfig = baseCount;
        if (assessmentConfig.skillConfigs?.length > 0) {
            countConfig = { default: baseCount };
            assessmentConfig.skillConfigs.forEach(sc => {
                if (sc.skill && sc.questionCount) {
                    countConfig[sc.skill.trim()] = sc.questionCount;
                }
            });
        }

        // STEP 2: Technical Question Sourcing
        console.log(`[GENERATE] Step 2: Sourcing technical questions (Base Count: ${baseCount})...`);

        const difficulty = assessmentConfig.difficulty || (analysis.seniorityLevel === 'Junior' ? 'Easy' :
            analysis.seniorityLevel === 'Lead' ? 'Hard' : 'Medium');

        // NOTE: selectQuestions returns 'questions' (Primary) and 'suggestions' (The 2X Buffer)
        const { questions, missingSkills, skillMappings, suggestions } = await selectQuestions(
            analysis.technicalSkills,
            countConfig,
            difficulty,
            assessmentConfig.allowAIGeneration || false
        );

        // STEP 3: Scenario Template Creation
        console.log('[GENERATE] Step 3: Generating Situational Scenarios...');

        const Job = require('../models/Job');
        const jobDoc = await Job.findById(jobId);
        const jobTitle = jobDoc?.title || '';

        let scenarios = { scenarios: [], physics: { metrics: [], polarity: {} } };
        if (analysis.softSkills && analysis.softSkills.length > 0) {
            // Strictly generate one scenario for every soft skill identified
            const scenarioCount = Math.min(analysis.softSkills.length, 3);

            scenarios = await generateScenarioTemplates(
                analysis.softSkills,
                analysis.roleCategory,
                analysis.roleType,
                scenarioCount,
                jobDescription,
                jobTitle
            );
        }

        // STEP 4: Assessment Persistence
        const assessment = await Assessment.create({
            job: jobId,
            roleCategory: analysis.roleCategory,
            seniorityLevel: analysis.seniorityLevel,
            roleType: analysis.roleType,
            technicalSkills: analysis.technicalSkills,
            softSkills: analysis.softSkills,
            technicalWeight,
            softSkillWeight,
            technicalQuestions: questions,
            suggestedQuestions: suggestions || [],
            scenarioTemplates: scenarios.scenarios,
            simulationConfig: {
                metrics: scenarios.physics.metrics,
                metricPolarity: scenarios.physics.polarity,
            },
            minTechnicalScore: analysis.minTechnicalScore || 70,
            minSoftSkillScore: analysis.minSoftSkillScore || 60,
            questionCounts: {
                technical: questions.length,
                scenarios: scenarios.scenarios.length,
                totalTime: analysis.recommendedQuestionCount?.totalTime || 30
            },
            missingSkills,
            skillMappings,
            createdBy,
            status: (missingSkills.length > 0 || (suggestions && suggestions.length > 0)) ? 'pending_review' : 'active'
        });

        return { assessment, analysis, warnings: missingSkills.length > 0 ? [`Missing skills in bank: ${missingSkills.join(', ')}`] : [] };
    } catch (error) {
        console.error('[SERVICE ERROR] generateAssessment:', error);
        throw new Error('Assessment generation failed: ' + error.message);
    }
}

/**
 * Regenerate scenarios for an existing assessment
 * @param {string} assessmentId - Assessment ID
 * @returns {Promise<Object>} - Updated assessment
 */
async function regenerateScenarios(assessmentId) {
    const assessment = await Assessment.findById(assessmentId).populate('job', 'description');
    if (!assessment) {
        throw new Error('Assessment not found');
    }

    // Safely get the job description - job is now populated
    const jobDescription = assessment.job?.description || '';

    // Use original recommended count from the assessment record
    let scenarioCount = assessment.questionCounts?.scenarios || 3;

    // Fallback to soft skills length if counts are missing
    if (!assessment.questionCounts?.scenarios && assessment.softSkills?.length > 0) {
        scenarioCount = Math.min(assessment.softSkills.length, 3);
    }

    // Preserve manual scenarios
    const manualScenarios = assessment.scenarioTemplates.filter(s => s.isManual);

    let result = { scenarios: [], physics: { metrics: [], polarity: {} } };
    if (assessment.softSkills && assessment.softSkills.length > 0) {
        result = await generateScenarioTemplates(
            assessment.softSkills,
            assessment.roleCategory,
            assessment.roleType,
            scenarioCount,
            jobDescription,
            assessment.job?.title || ''
        );
    }

    // Combine manual with newly generated ones
    assessment.scenarioTemplates = [...manualScenarios, ...result.scenarios];

    // Update count
    assessment.questionCounts.scenarios = assessment.scenarioTemplates.length;

    assessment.simulationConfig = {
        metrics: result.physics.metrics,
        metricPolarity: result.physics.polarity,
        // approachEffects: result.physics.effects // DEPRECATED
    };
    await assessment.save();

    return assessment;
}

/**
 * Regenerate a single scenario within an assessment
 * @param {string} assessmentId - Assessment ID
 * @param {string} scenarioId - Scenario Template ID
 * @returns {Promise<Object>} - Updated assessment
 */
async function regenerateSingleScenario(assessmentId, scenarioId) {
    const assessment = await Assessment.findById(assessmentId).populate('job', 'description title');
    if (!assessment) throw new Error('Assessment not found');

    const scenarioIdx = assessment.scenarioTemplates.findIndex(s => s._id.toString() === scenarioId);
    if (scenarioIdx === -1) throw new Error('Scenario not found');

    const scenario = assessment.scenarioTemplates[scenarioIdx];
    const softSkill = scenario.softSkill;

    console.log(`[GENERATE] Regenerating single scenario for skill: ${softSkill}`);

    const result = await generateScenarioTemplates(
        [softSkill],
        assessment.roleCategory,
        assessment.roleType,
        1,
        assessment.job?.description || '',
        assessment.job?.title || ''
    );

    if (result.scenarios && result.scenarios.length > 0) {
        // Replace just that one scenario
        assessment.scenarioTemplates[scenarioIdx] = result.scenarios[0];

        // Note: We don't update global physics/metrics here to avoid disrupting other scenarios
        // unless they are empty.
        if (!assessment.simulationConfig || !assessment.simulationConfig.metrics || assessment.simulationConfig.metrics.length === 0) {
            assessment.simulationConfig = {
                metrics: result.physics.metrics,
                metricPolarity: result.physics.polarity
            };
        }

        await assessment.save();
    }

    return assessment;
}

/**
 * Update assessment configuration (weights, thresholds, etc.)
 * @param {string} assessmentId - Assessment ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} - Updated assessment
 */
async function updateAssessmentConfig(assessmentId, updates) {
    const assessment = await Assessment.findById(assessmentId);
    if (!assessment) {
        throw new Error('Assessment not found');
    }

    // Update allowed fields
    const allowedFields = [
        'technicalWeight', 'softSkillWeight', 'domainWeight', 'businessWeight',
        'minTechnicalScore', 'minSoftSkillScore'
    ];

    allowedFields.forEach(field => {
        if (updates[field] !== undefined) {
            assessment[field] = updates[field];
        }
    });

    await assessment.save();
    return assessment;
}

/**
 * Regenerate technical questions for an assessment
 * @param {string} assessmentId - Assessment ID
 * @param {Object} config - Updated assessment configuration
 * @returns {Promise<Object>} - Updated assessment
 */
async function regenerateTechnicalQuestions(assessmentId, config = {}) {
    const assessment = await Assessment.findById(assessmentId);
    if (!assessment) {
        throw new Error('Assessment not found');
    }

    const { selectQuestions } = require('./questionBankService');

    // We need seniorityLevel to decide difficulty
    const difficulty = assessment.seniorityLevel === 'Junior' ? 'Easy' :
        assessment.seniorityLevel === 'Lead' ? 'Hard' : 'Medium';

    // Priority: Recruiter specified > AI recommendation > Default(2)
    let countConfig = config.questionsPerSkill || assessment.questionCounts?.technical || 2;

    if (config.skillConfigs?.length > 0) {
        countConfig = { default: countConfig };
        config.skillConfigs.forEach(sc => {
            if (sc.skill && sc.questionCount) {
                countConfig[sc.skill.trim()] = sc.questionCount;
            }
        });
    }

    // Prepare exclusion for current questions to get fresh ones
    const excludeIds = assessment.technicalQuestions.map(q => q.questionId);

    const { questions, missingSkills, skillMappings, suggestions } = await selectQuestions(
        assessment.technicalSkills,
        countConfig,
        difficulty,
        config.allowAIGeneration || false,
        excludeIds
    );

    // Combine manual with newly source/generated ones
    assessment.technicalQuestions = [...manualQuestions, ...questions];
    assessment.suggestedQuestions = suggestions || [];
    assessment.missingSkills = missingSkills;
    assessment.skillMappings = skillMappings;
    assessment.questionCounts.technical = assessment.technicalQuestions.length;

    // Update status if needed
    assessment.status = (missingSkills.length > 0 || (suggestions && suggestions.length > 0)) ? 'pending_review' : 'active';

    await assessment.save();
    return assessment;
}

module.exports = {
    generateAssessment,
    regenerateScenarios,
    regenerateSingleScenario,
    regenerateTechnicalQuestions,
    updateAssessmentConfig
};
