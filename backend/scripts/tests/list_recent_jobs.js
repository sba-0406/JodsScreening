
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const Job = require('./models/Job');

async function list() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const jobs = await Job.find({}).sort({ createdAt: -1 }).limit(5);
        console.log('--- Most Recent 5 Jobs ---');
        jobs.forEach((j, i) => {
            console.log(`${i + 1}. [${j.createdAt.toISOString()}] ${j.title} -> STATUS: ${j.status}`);
        });
        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

list();
