require('dotenv').config(); // LOAD VARS FIRST
const ai = require('./services/aiService');

async function testThrottling() {
    console.log('--- Testing AI Throttling (2.5s interval) ---');
    const start = Date.now();

    // We expect 3 calls to take at least 5 seconds total 
    // (Call 1: 0s, wait 2.5, Call 2: 2.5s, wait 2.5, Call 3: 5s)

    for (let i = 1; i <= 3; i++) {
        console.log(`Request ${i} at ${((Date.now() - start) / 1000).toFixed(2)}s`);
        try {
            await ai.generateContent("Say hello in 5 words", false);
        } catch (err) {
            console.log(`Request ${i} error: ${err.message}`);
        }
    }

    const totalTime = (Date.now() - start) / 1000;
    console.log(`Total time for 3 requests: ${totalTime.toFixed(2)}s`);

    if (totalTime >= 4.5) {
        console.log('✅ SUCCESS: Throttling working correctly.');
    } else {
        console.log('❌ FAILURE: Requests executed too fast.');
    }
}

testThrottling();
