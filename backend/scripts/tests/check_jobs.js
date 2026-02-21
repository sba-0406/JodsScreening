const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const Job = require('./models/Job');
const User = require('./models/User');

async function check() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const jobs = await Job.find({});
        console.log('Total Jobs:', jobs.length);
        for (const j of jobs) {
            const user = await User.findById(j.postedBy);
            console.log(` - ${j.title}: ${j.status} (Posted By: ${user ? user.email : 'Unknown'} - ID: ${j.postedBy})`);
        }
        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
