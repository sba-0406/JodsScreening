
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const aiService = require('./services/aiService');
const { generateScenarioTemplates } = require('./services/jdParserService');

async function testFixes() {
    try {
        console.log('--- Testing AI Technical Question Fix ---');
        const skill = "Niche Technical Tool X";
        console.log(`Generating questions for: ${skill}`);
        const questions = await aiService.generateTechnicalQuestions(skill, 2, 'Medium');
        console.log('Generated Questions Count:', questions.length);
        if (questions.length > 0) {
            console.log('First Question:', questions[0].question);
        } else {
            console.error('FAILED: No questions generated.');
        }

        console.log('\n--- Testing Scenario Context Fix ---');
        const jd = "We are seeking a Backend Engineer who specialized in High-Frequency Trading systems. They must handle low-latency requirements and complex microservices architectures.";
        const softSkills = ["Decision Making", "Problem Solving"];
        console.log('Generating scenarios with JD context...');
        const scenarios = await generateScenarioTemplates(softSkills, "Engineering", "Senior IC", 2, jd);
        console.log('Generated Scenarios Count:', scenarios.length);
        if (scenarios.length > 0) {
            console.log('First Scenario Theme:', scenarios[0].theme);
            console.log('First Scenario Prompt Snippet:', scenarios[0].prompt.substring(0, 100) + '...');
        } else {
            console.error('FAILED: No scenarios generated.');
        }

        process.exit();
    } catch (err) {
        console.error('Test Error:', err);
        process.exit(1);
    }
}

testFixes();
