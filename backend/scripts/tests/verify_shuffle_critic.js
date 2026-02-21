const mongoose = require('mongoose');
require('dotenv').config();
const { selectQuestions } = require('./services/questionBankService');

async function verifyShuffleAndCritic() {
    await mongoose.connect(process.env.MONGO_URI);
    const skill = 'Throttling Test Skill';

    console.log(`\n--- Phase 1: Initial Selection (Should pick from Bank) ---`);
    const res1 = await selectQuestions([skill], 2);
    const ids1 = res1.questions.map(q => q.questionId.toString());
    console.log('Selected IDs (Set 1):', ids1);
    console.log('Source:', res1.questions[0].status === 'active' ? 'Bank' : 'AI');

    console.log(`\n--- Phase 2: Shuffle Selection (Should pick OTHER questions from Bank) ---`);
    const res2 = await selectQuestions([skill], 2, 'Medium', false, ids1);
    const ids2 = res2.questions.map(q => q.questionId.toString());
    console.log('Selected IDs (Set 2):', ids2);

    const overlap = ids1.filter(id => ids2.includes(id));
    if (overlap.length === 0 && ids2.length === 2) {
        console.log('✅ SUCCESS: Shuffle logic worked. No overlap.');
    } else {
        console.log('❌ FAILURE: Overlap detected or insufficient questions.');
    }

    console.log(`\n--- Phase 3: AI Fallback & Critic Pass (Bank exhausted) ---`);
    const allBankIds = [...ids1, ...ids2];
    const res3 = await selectQuestions([skill], 1, 'Medium', true, allBankIds);

    if (res3.questions.length > 0 && res3.questions[0].status === 'pending_review') {
        console.log('✅ SUCCESS: AI Generation triggered and saved as PENDING_REVIEW.');
        console.log('Question:', res3.questions[0].question);
    } else {
        console.log('❌ FAILURE: AI Generation not triggered or status not pending.');
    }

    await mongoose.disconnect();
}

verifyShuffleAndCritic();
