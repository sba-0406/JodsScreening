const { analyzeJobDescription, generateScenarioTemplates } = require('./jdParserService');
const { selectQuestions } = require('./questionBankService');
const Assessment = require('../models/Assessment');

/**
 * Phase 20: Assessment Quality & AI Generation Fixes ✅
 * - **Realistic Scenarios**: Scenarios now use the **Full Job Description** as context. This ensures the situational challenges are role-specific (e.g., mention of "low-latency" or "microservices" if present in the JD) rather than generic workplace tropes.
 * - **Robust AI Questions**: Fixed a JSON formatting bug (mismatch between array and object) that was causing AI generation to fail for skills not in the question bank. Niche skills like "Rust" or "Mojo" now correctly trigger question generation.
 * - **Verified**: Confirmed both fixes with automated test scripts (`final_verify_ai.js`).
 *
 * ---
 *
 * ## Final Verification
 * - [x] Resumes are served statically and accessible via browser.
 * - [x] AI generation for missing skills works without `ReferenceError` or JSON errors.
 * - [x] New jobs are visible to candidates immediately.
 * - [x] Scenarios include role-specific context from the JD.
 */
/**
 * Generate a complete assessment from a job description
 * @param {string} jobDescription - Full job description text
 * @param {string} jobId - Job ID to link assessment to
 * @param {string} createdBy - User ID of creator (HR/Admin)
 * @param {Object} assessmentConfig - Configuration for assessment generation
 * @returns {Promise<Object>} - Created assessment with questions and scenarios
 */
async function generateAssessment(jobDescription, jobId, createdBy, assessmentConfig = {}) {
    try {
        // Step 1: Analyze JD with AI
        console.log('Analyzing job description...');
        const analysis = await analyzeJobDescription(jobDescription);

        // Step 2: Select technical questions from bank
        console.log('Selecting technical questions...');

        // Use HR config if available, otherwise fallback to global default
        let countConfig = assessmentConfig.questionsPerSkill || 2;
        if (assessmentConfig.skillConfigs && assessmentConfig.skillConfigs.length > 0) {
            countConfig = { default: assessmentConfig.questionsPerSkill || 2 };
            assessmentConfig.skillConfigs.forEach(sc => {
                countConfig[sc.skill] = sc.questionCount;
            });
        }

        const { questions, missingSkills, skillMappings } = await selectQuestions(
            analysis.technicalSkills,
            countConfig,
            analysis.seniorityLevel === 'Junior' ? 'Easy' :
                analysis.seniorityLevel === 'Lead' ? 'Hard' : 'Medium',
            assessmentConfig.allowAIGeneration || false
        );

        // Step 3: Generate scenario templates
        console.log('Generating scenario templates...');
        const scenarios = await generateScenarioTemplates(
            analysis.softSkills,
            analysis.roleCategory,
            analysis.roleType,
            analysis.recommendedQuestionCount.scenarios,
            jobDescription
        );

        // Step 4: Create assessment
        const assessment = await Assessment.create({
            job: jobId,
            roleCategory: analysis.roleCategory,
            seniorityLevel: analysis.seniorityLevel,
            roleType: analysis.roleType,

            technicalSkills: analysis.technicalSkills,
            softSkills: analysis.softSkills,
            domainSkills: analysis.domainSkills || [],
            businessSkills: analysis.businessSkills || [],

            technicalWeight: analysis.technicalWeight,
            softSkillWeight: analysis.softSkillWeight,
            domainWeight: analysis.domainWeight || 0,
            businessWeight: analysis.businessWeight || 0,

            technicalQuestions: questions,
            scenarioTemplates: scenarios,

            minTechnicalScore: analysis.minTechnicalScore,
            minSoftSkillScore: analysis.minSoftSkillScore,

            questionCounts: {
                technical: questions.length,
                scenarios: scenarios.length,
                totalTime: analysis.recommendedQuestionCount.totalTime
            },

            missingSkills,
            skillMappings,

            aiAnalysis: {
                reasoning: analysis.reasoning,
                confidence: 0.85,
                recommendations: []
            },

            createdBy,
            status: (missingSkills.length > 0 || questions.some(q => q.status === 'pending_review')) ? 'pending_review' : 'active'
        });

        console.log(`Assessment created: ${assessment._id}`);
        console.log(`- ${questions.length} technical questions`);
        console.log(`- ${scenarios.length} scenarios`);
        if (missingSkills.length > 0) {
            console.log(`- Missing skills: ${missingSkills.join(', ')}`);
        }

        return {
            assessment,
            analysis,
            warnings: missingSkills.length > 0 ? [
                `The following skills are not in the question bank: ${missingSkills.join(', ')}`
            ] : []
        };
    } catch (error) {
        console.error('Error generating assessment:', error);
        throw new Error('Failed to generate assessment: ' + error.message);
    }
}

/**
 * Regenerate scenarios for an existing assessment
 * @param {string} assessmentId - Assessment ID
 * @returns {Promise<Object>} - Updated assessment
 */
async function regenerateScenarios(assessmentId) {
    const assessment = await Assessment.findById(assessmentId);
    if (!assessment) {
        throw new Error('Assessment not found');
    }

    const scenarios = await generateScenarioTemplates(
        assessment.softSkills,
        assessment.roleCategory,
        assessment.roleType,
        assessment.scenarioTemplates.length,
        assessment.job.description || '' // Ensure JD is passed if available
    );

    assessment.scenarioTemplates = scenarios;
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

    // For shuffling/regeneration, exclude currently used questions
    const excludeIds = assessment.technicalQuestions.map(q => q.questionId);

    const { questions, missingSkills, skillMappings } = await selectQuestions(
        assessment.technicalSkills,
        countConfig,
        difficulty,
        config.allowAIGeneration || false,
        excludeIds
    );

    assessment.technicalQuestions = questions;
    assessment.missingSkills = missingSkills;
    assessment.skillMappings = skillMappings;
    assessment.questionCounts.technical = questions.length;

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
