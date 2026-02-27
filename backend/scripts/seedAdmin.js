const mongoose = require('mongoose');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function seedAdmin() {
    try {
        // Connect to database
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        // Check if admin already exists
        const existing = await User.findOne({ role: 'admin' });
        if (existing) {
            console.log('✓ Admin user already exists');
            console.log(`  Email: ${existing.email}`);
            process.exit(0);
        }

        // Create admin user
        const admin = await User.create({
            name: 'Admin',
            email: 'admin@scenariosim.com',
            password: 'admin123', // Will be hashed by pre-save hook
            role: 'admin',
            status: 'active',
            isActive: true,
            isAuthorized: true
        });

        console.log('✓ Admin user created successfully!');
        console.log('  Email: admin@scenariosim.com');
        console.log('  Password: admin123');
        //console.log('\n⚠️  Please change the password after first login!');

        process.exit(0);
    } catch (error) {
        console.error('Error seeding admin:', error);
        process.exit(1);
    }
}

seedAdmin();
