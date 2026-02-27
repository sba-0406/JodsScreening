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
        // We deconstruct the JD into skills, seniority, and weighting logic.
        console.log('[GENERATE] Step 1: Analyzing Job Description...');
        const analysis = await analyzeJobDescription(jobDescription);

        // STEP 2: Technical Question Sourcing
        // We look at the existing question bank. If allowed, we generate AI questions for missing skills.
        console.log('[GENERATE] Step 2: Selecting Technical Questions...');

        let countConfig = assessmentConfig.questionsPerSkill || 2;
        if (assessmentConfig.skillConfigs?.length > 0) {
            countConfig = { default: assessmentConfig.questionsPerSkill || 2 };
            assessmentConfig.skillConfigs.forEach(sc => countConfig[sc.skill] = sc.questionCount);
        }

        const difficulty = analysis.seniorityLevel === 'Junior' ? 'Easy' :
            analysis.seniorityLevel === 'Lead' ? 'Hard' : 'Medium';

        const { questions, missingSkills, skillMappings } = await selectQuestions(
            analysis.technicalSkills,
            countConfig,
            difficulty,
            assessmentConfig.allowAIGeneration || false
        );

        // STEP 3: Scenario Template Creation
        // We generate one situational scenario for each soft skill identified.
        console.log('[GENERATE] Step 3: Generating Situational Scenarios...');

        // Fetch the job title for role-specific scenario prompts
        const Job = require('../models/Job');
        const jobDoc = await Job.findById(jobId);
        const jobTitle = jobDoc?.title || '';

        const scenarios = await generateScenarioTemplates(
            analysis.softSkills,
            analysis.roleCategory,
            analysis.roleType,
            analysis.softSkills.length, // Explicitly one per soft skill
            jobDescription,
            jobTitle
        );

        // STEP 4: Assessment Persistence
        // We save the structured assessment to the database.
        const assessment = await Assessment.create({
            job: jobId,
            roleCategory: analysis.roleCategory,
            seniorityLevel: analysis.seniorityLevel,
            roleType: analysis.roleType,
            technicalSkills: analysis.technicalSkills,
            softSkills: analysis.softSkills,
            technicalWeight: analysis.technicalWeight,
            softSkillWeight: analysis.softSkillWeight,
            technicalQuestions: questions,
            scenarioTemplates: scenarios.scenarios, // Use .scenarios from result
            simulationConfig: {
                metrics: scenarios.physics.metrics,
                metricPolarity: scenarios.physics.polarity,
                // approachEffects: scenarios.physics.effects // DEPRECATED: Physics is now dynamic
            },
            minTechnicalScore: analysis.minTechnicalScore,
            minSoftSkillScore: analysis.minSoftSkillScore,
            questionCounts: {
                technical: questions.length,
                scenarios: scenarios.scenarios.length,
                totalTime: analysis.recommendedQuestionCount.totalTime
            },
            missingSkills,
            skillMappings,
            createdBy,
            status: (missingSkills.length > 0 || questions.some(q => q.status === 'pending_review')) ? 'pending_review' : 'active'
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
    const scenarioCount = assessment.softSkills?.length || 3;

    // Preserve manual scenarios
    const manualScenarios = assessment.scenarioTemplates.filter(s => s.isManual);

    const result = await generateScenarioTemplates(
        assessment.softSkills,
        assessment.roleCategory,
        assessment.roleType,
        scenarioCount,
        jobDescription,
        assessment.job?.title || ''
    );

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

    // Prepare granular count config
    let countConfig = config.questionsPerSkill || 2;
    if (config.skillConfigs && config.skillConfigs.length > 0) {
        countConfig = { default: config.questionsPerSkill || 2 };
        config.skillConfigs.forEach(sc => {
            countConfig[sc.skill] = sc.questionCount;
        });
    }

    // Preserve manual questions
    const manualQuestions = assessment.technicalQuestions.filter(q => q.isManual);

    // For shuffling/regeneration, exclude currently used questions
    const excludeIds = assessment.technicalQuestions.map(q => q.questionId);

    const { questions, missingSkills, skillMappings } = await selectQuestions(
        assessment.technicalSkills,
        countConfig,
        difficulty,
        config.allowAIGeneration || false,
        excludeIds
    );

    // Combine manual with newly source/generated ones
    assessment.technicalQuestions = [...manualQuestions, ...questions];
    assessment.missingSkills = missingSkills;
    assessment.skillMappings = skillMappings;
    assessment.questionCounts.technical = assessment.technicalQuestions.length;

    // Update status if needed
    assessment.status = (missingSkills.length > 0 || questions.some(q => q.status === 'pending_review')) ? 'pending_review' : 'active';

    await assessment.save();
    return assessment;
}

module.exports = {
    generateAssessment,
    regenerateScenarios,
    regenerateTechnicalQuestions,
    updateAssessmentConfig
};
