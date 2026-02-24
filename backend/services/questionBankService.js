const Question = require('../models/Question');

/**
 * Skill mappings for when exact skill is not in question bank
 * Maps uncommon skills to similar ones we have questions for
 */
const skillMappings = {
    // Programming Languages
    "Rust": "C++",
    "Go": "Python",
    "Kotlin": "Java",
    "Swift": "JavaScript",
    // Frontend Frameworks (Removed Angular/Vue/Svelte -> React mapping as they are too different)
    "TypeScript": "JavaScript",
    "Tailwind": "CSS",
    "jQuery": "JavaScript",

    // Backend Frameworks
    "FastAPI": "Node.js",
    "Flask": "Node.js",
    "Django": "Node.js",

    // Databases
    "Cassandra": "NoSQL",
    "DynamoDB": "NoSQL",
    "Redis": "NoSQL",
    "PostgreSQL": "SQL",
    "MySQL": "SQL",

    // DevOps
    "Terraform": "Docker",
    "Ansible": "Docker",
    "Kubernetes": "Docker"
};

const aiService = require('./aiService'); // Import AI Service

async function selectQuestions(skills, countConfig, difficulty = 'Medium', allowAIGeneration = false, excludeIds = []) {
    const selected = [];
    const missing = [];
    const mappings = {};

    const skillsToGenerate = {};

    for (const skill of skills) {
        // Determine number of questions for this skill
        let count = 2; // Default
        if (typeof countConfig === 'number') {
            count = countConfig;
        } else if (typeof countConfig === 'object' && countConfig !== null) {
            count = countConfig[skill] || countConfig.default || 2;
        }

        // --- Step 1: Search the existing Bank (Shuffle logic) ---
        let questions = await Question.find({
            skill,
            difficulty,
            status: 'active',
            _id: { $nin: excludeIds }
        })
            .sort({ usageCount: 1 })
            .limit(count);

        // --- Step 2: Try Skill Mapping ---
        if (questions.length < count) {
            const needed = count - questions.length;
            const mappedSkill = skillMappings[skill];
            if (mappedSkill) {
                const mappedQuestions = await Question.find({
                    skill: mappedSkill,
                    difficulty,
                    status: 'active',
                    _id: { $nin: [...excludeIds, ...questions.map(q => q._id)] }
                })
                    .sort({ usageCount: 1 })
                    .limit(needed);

                if (mappedQuestions.length > 0) {
                    questions = [...questions, ...mappedQuestions];
                    mappings[skill] = mappedSkill;
                    console.log(`Using ${mappedSkill} questions for ${skill} (${mappedQuestions.length} found)`);
                }
            }
        }

        // --- Step 3: Collect for Bulk AI Generation ---
        if (questions.length < count && allowAIGeneration) {
            const needed = count - questions.length;
            skillsToGenerate[skill] = needed;
        }

        // Store intermediate results
        selected.push(...questions.map(q => ({
            questionId: q._id,
            skill: skill,
            difficulty: q.difficulty,
            question: q.question,
            options: q.options,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            status: q.status
        })));
    }

    // --- Step 4: Execute Bulk AI Generation if needed ---
    const skillsList = Object.keys(skillsToGenerate);
    if (skillsList.length > 0) {
        console.log(`[BULK] Generating questions for ${skillsList.length} skills in one packet...`);
        try {
            const bulkResults = await aiService.generateBulkTechnicalQuestions(skillsToGenerate, difficulty);

            for (const skill of skillsList) {
                const aiQuestionsData = bulkResults[skill] || [];

                if (aiQuestionsData.length > 0) {
                    const savedQuestions = await Promise.all(aiQuestionsData.map(async (qData) => {
                        let correctIdx = qData.correctAnswer;
                        if (typeof correctIdx === 'string') {
                            correctIdx = qData.options.indexOf(correctIdx);
                            if (correctIdx === -1) correctIdx = 0;
                        }

                        return await Question.create({
                            skill,
                            difficulty,
                            question: qData.question,
                            options: qData.options,
                            correctAnswer: correctIdx,
                            explanation: qData.explanation,
                            status: 'pending_review',
                            source: 'ai_generated',
                            createdBy: 'system_ai'
                        });
                    }));

                    // Add to final selection (preserving the bank questions already there)
                    selected.push(...savedQuestions.map(q => ({
                        questionId: q._id,
                        skill: skill,
                        difficulty: q.difficulty,
                        question: q.question,
                        options: q.options,
                        correctAnswer: q.correctAnswer,
                        explanation: q.explanation,
                        status: q.status
                    })));

                    console.log(`[BULK SUCCESS] Added ${savedQuestions.length} AI questions for ${skill}`);
                }
            }
        } catch (err) {
            console.error(`[BULK ERROR] Failed bulk generation:`, err);
        }
    }

    // Final missing skills check
    for (const skill of skills) {
        const targetCount = typeof countConfig === 'number' ? countConfig : (countConfig[skill] || countConfig.default || 2);
        const currentCount = selected.filter(q => q.skill === skill).length;
        if (currentCount < targetCount) {
            missing.push(skill);
        }
    }

    return {
        questions: selected,
        missingSkills: missing,
        skillMappings: mappings
    };
}

/**
 * Get total count of questions available for a skill
 * @param {string} skill - Skill name
 * @returns {Promise<number>} - Count of available questions
 */
async function getQuestionCount(skill) {
    return await Question.countDocuments({
        skill,
        status: 'active'
    });
}

/**
 * Get all available skills in the question bank
 * @returns {Promise<Array>} - List of unique skills
 */
async function getAvailableSkills() {
    return await Question.distinct('skill', { status: 'active' });
}

/**
 * Record question usage and update statistics
 * @param {string} questionId - Question ID
 * @param {boolean} wasCorrect - Whether the candidate answered correctly
 */
async function recordQuestionUsage(questionId, wasCorrect) {
    const question = await Question.findById(questionId);
    if (question) {
        await question.recordUsage(wasCorrect);
    }
}

module.exports = {
    selectQuestions,
    getQuestionCount,
    getAvailableSkills,
    recordQuestionUsage,
    skillMappings
};
