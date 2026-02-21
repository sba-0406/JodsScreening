const mongoose = require('mongoose');
require('dotenv').config();
const { selectQuestions } = require('./services/questionBankService');

async function testCritic() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Remove existing questions for these niche skills to force AI generation
    const Question = require('./models/Question');
    await Question.deleteMany({ skill: { $in: ["Mojo Lang", "Carbon Lang", "Val Lang"] } });

    const skills = ["Mojo Lang", "Carbon Lang", "Val Lang"];
    console.log(`\n[TEST] Generating questions for niche/unstable skills to trigger rejections...`);

    const result = await selectQuestions(skills, 2, 'Medium', true);

    console.log('\n--- Final Selection Status ---');
    result.questions.forEach(q => {
        console.log(`- ${q.skill}: Status=${q.status}, Question=${q.question.substring(0, 50)}...`);
    });

    const pendingCount = result.questions.filter(q => q.status === 'pending_review').length;
    console.log(`\nTotal PENDING questions: ${pendingCount}`);

    if (pendingCount > 0) {
        console.log('✅ SUCCESS: Questions are correctly marked as PENDING_REVIEW.');
    } else {
        console.log('❌ FAILURE: Questions not marked as pending.');
    }

    await mongoose.disconnect();
}

testCritic();
