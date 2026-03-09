const mongoose = require('mongoose');
const Application = require('./backend/models/Application');
const Job = require('./backend/models/Job');
const User = require('./backend/models/User');
require('dotenv').config({ path: './backend/.env' });

async function checkOrphans() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const apps = await Application.find().populate('job');
        
        console.log(`Total Applications: ${apps.length}`);
        
        const orphans = apps.filter(app => !app.job);
        console.log(`Orphaned Applications (Job missing): ${orphans.length}`);
        
        if (orphans.length > 0) {
            orphans.forEach(app => {
                console.log(`- App ID: ${app._id}, Candidate: ${app.candidateName}, Job ID: ${app.job ? 'Populated' : 'MISSING'}`);
            });
        }

        const candidate2 = await User.findOne({ name: 'Candidate 2' });
        if (candidate2) {
            const candidateApps = apps.filter(app => app.candidate && app.candidate.toString() === candidate2._id.toString());
            console.log(`\nApplications for Candidate 2 (${candidate2._id}): ${candidateApps.length}`);
            candidateApps.forEach(app => {
                console.log(`- App ID: ${app._id}, Job: ${app.job ? app.job.title : 'MISSING'}`);
            });
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkOrphans();
