const mongoose = require('mongoose');
require('dotenv').config();
const Question = require('./models/Question');

async function seedTestQuestions() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const skill = 'Throttling Test Skill';

    // Create 4 active questions for this skill
    const questions = [];
    for (let i = 1; i <= 4; i++) {
        questions.push({
            skill,
            difficulty: 'Medium',
            question: `Bank Question ${i}: What is the output of X in ${skill}?`,
            options: ["A", "B", "C", "D"],
            correctAnswer: 0,
            explanation: `Standard bank explanation ${i}`,
            status: 'active',
            source: 'test_seed'
        });
    }

    await Question.deleteMany({ skill });
    await Question.insertMany(questions);
    console.log(`Seeded 4 active questions for "${skill}"`);

    await mongoose.disconnect();
}

seedTestQuestions();
