const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

// Absolute path to backend
const BACKEND_PATH = 'c:/Users/shaik/Desktop/JodsScreening/JodsScreening/backend';

require('dotenv').config({ path: path.join(BACKEND_PATH, '.env') });

const Application = require(path.join(BACKEND_PATH, 'models/Application'));
const Job = require(path.join(BACKEND_PATH, 'models/Job'));
const SkillService = require(path.join(BACKEND_PATH, 'services/skillService'));
const ResumeAssistant = require(path.join(BACKEND_PATH, 'services/resumeAssistant'));

async function fix() {
    try {
        console.log("Connecting to DB...");
        if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI not found");
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected.");

        const candidateName = "John W. Smith";
        const app = await Application.findOne({ candidateName }).populate('job');
        
        if (!app) {
            console.error("Candidate not found");
            process.exit(1);
        }

        console.log(`Processing ${app.candidateName} for ${app.job.title}...`);
        
        const resumeUrl = app.resume;
        if (!resumeUrl) {
           console.error("No resume URL found");
           process.exit(1);
        }

        console.log("Extracting text...");
        const text = await ResumeAssistant.extractText(resumeUrl);
        console.log("Extracting skills...");
        const skills = await ResumeAssistant.extractSkills(text);
        console.log("Extracted Skills:", skills);

        const jobWithSkillDesc = await Job.findById(app.job._id).populate('assessmentId');
        const jobSkills = jobWithSkillDesc.assessmentId?.technicalSkills || [];
        
        console.log("Job Skills:", jobSkills);
        const matchResults = await SkillService.matchSkills(skills, jobSkills);
        console.log("Match Results:", matchResults);

        await Application.findByIdAndUpdate(app._id, {
            extractedSkills: skills,
            skillsMatch: matchResults
        });

        console.log("SUCCESS: Application updated.");
        process.exit(0);
    } catch (err) {
        console.error("ERROR:", err.message);
        process.exit(1);
    }
}

fix();
