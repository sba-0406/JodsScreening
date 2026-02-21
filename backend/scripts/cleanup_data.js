const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const Application = require('../models/Application');

const cleanupResumes = async () => {
    try {
        console.log('[CLEANUP] Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('[CLEANUP] Connected successfully.');

        // 1. Wipe resume references in MongoDB
        console.log('[CLEANUP] Wiping resume references in Application collection...');
        const result = await Application.updateMany(
            { resume: { $regex: /^uploads\/resumes\/resume-/ } },
            { $set: { resume: null } }
        );
        console.log(`[CLEANUP] Updated ${result.modifiedCount} applications.`);

        // 2. Delete physical files
        const resumesDir = path.join(__dirname, '../uploads/resumes');
        console.log(`[CLEANUP] Scanning directory: ${resumesDir}`);

        if (fs.existsSync(resumesDir)) {
            const files = fs.readdirSync(resumesDir);
            let deletedCount = 0;

            files.forEach(file => {
                if (file.startsWith('resume-')) {
                    fs.unlinkSync(path.join(resumesDir, file));
                    deletedCount++;
                }
            });
            console.log(`[CLEANUP] Deleted ${deletedCount} physical files.`);
        } else {
            console.log('[CLEANUP] Resumes directory not found, skipping file deletion.');
        }

        console.log('[CLEANUP] Task completed successfully.');
        process.exit(0);
    } catch (error) {
        console.error('[CLEANUP ERROR]:', error);
        process.exit(1);
    }
};

cleanupResumes();
