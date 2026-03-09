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
    const suggestions = [];

    const skillsToGenerate = {};

    for (const skill of skills) {
        // Determine number of questions for this skill
        let targetCount = 2; // Default
        if (typeof countConfig === 'number') {
            targetCount = countConfig;
        } else if (typeof countConfig === 'object' && countConfig !== null) {
            targetCount = countConfig[skill] || countConfig.default || 2;
        }
        
        let desiredTotal = targetCount * 2; // We want 2x options for the user to pick from

        // --- Step 1: Search the existing Bank (Prioritize Verified questions) ---
        let questions = await Question.find({
            skill,
            difficulty,
            status: 'active',
            isVerified: true,
            _id: { $nin: excludeIds }
        })
            .sort({ usageCount: 1 })
            .limit(desiredTotal);

        // Fallback to non-verified active questions
        if (questions.length < desiredTotal) {
            const needed = desiredTotal - questions.length;
            const nonVerified = await Question.find({
                skill,
                difficulty,
                status: 'active',
                isVerified: false,
                _id: { $nin: [...excludeIds, ...questions.map(q => q._id)] }
            })
                .sort({ usageCount: 1 })
                .limit(needed);
            questions = [...questions, ...nonVerified];
        }

        // --- Step 2: Try Skill Mapping ---
        if (questions.length < desiredTotal) {
            const needed = desiredTotal - questions.length;
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
        if (questions.length < desiredTotal && allowAIGeneration) {
            const needed = desiredTotal - questions.length;
            // Over-generate slightly if we rely heavily on AI to ensure we hit the 2x target
            skillsToGenerate[skill] = needed + 1; 
        }

        // Split DB questions: First 'targetCount' go to active assessment, remainder to suggestions
        const activeQs = questions.slice(0, targetCount);
        const overflowQs = questions.slice(targetCount);

        selected.push(...activeQs.map(q => ({
            questionId: q._id,
            skill: skill,
            difficulty: q.difficulty,
            question: q.question,
            options: q.options,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            status: q.status
        })));
        
        // Add overflow DB questions to suggestions
        suggestions.push(...overflowQs.map(q => ({
            questionId: q._id,
            skill: skill,
            difficulty: q.difficulty,
            question: q.question,
            options: q.options,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            source: 'question_bank'
        })));
    }

    // --- Step 4: Execute Bulk AI Generation if needed ---
    const skillsList = Object.keys(skillsToGenerate);
    if (skillsList.length > 0) {
        console.log(`[BULK] Generating questions for ${skillsList.length} skills in one packet (2x buffer)...`);
        try {
            const bulkResults = await aiService.generateBulkTechnicalQuestions(skillsToGenerate, difficulty);

            for (const skill of skillsList) {
                const aiQuestionsData = bulkResults[skill] || [];

                if (aiQuestionsData.length > 0) {
                    const skillSuggestions = aiQuestionsData.map((qData) => {
                        let correctIdx = qData.correctAnswer;
                        if (typeof correctIdx === 'string') {
                            correctIdx = qData.options.indexOf(correctIdx);
                            if (correctIdx === -1) correctIdx = 0;
                        }

                        return {
                            skill,
                            difficulty,
                            question: qData.question,
                            options: qData.options,
                            correctAnswer: correctIdx,
                            explanation: qData.explanation,
                            source: 'ai_generated'
                        };
                    });

                    suggestions.push(...skillSuggestions);
                    console.log(`[BULK SUCCESS] Generated ${skillSuggestions.length} suggestions for ${skill}`);
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
        skillMappings: mappings,
        suggestions: suggestions
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
