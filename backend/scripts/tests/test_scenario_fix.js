require('dotenv').config();
const aiService = require('./services/aiService');

async function testScenario() {
    console.log('[TEST] Checking generateContent for scenarios...');
    try {
        const res = await aiService.generateContent("Suggest 2 scenario titles for a Senior User Experience Designer.", true);
        console.log('Result:', res);
        console.log('✅ generateContent IS a function and returned data.');
    } catch (err) {
        console.error('❌ FAILURE:', err.message);
    }
}

testScenario();
