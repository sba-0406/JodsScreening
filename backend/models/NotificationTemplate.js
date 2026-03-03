const mongoose = require('mongoose');

const NotificationTemplateSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    category: {
        type: String,
        enum: ['CANDIDATE', 'HR', 'SYSTEM'],
        required: true
    },
    subject: {
        type: String,
        required: true
    },
    body: {
        type: String,
        required: true
    },
    placeholders: [String], // e.g. ['candidateName', 'jobTitle', 'date']
    description: String
}, {
    timestamps: true
});

module.exports = mongoose.model('NotificationTemplate', NotificationTemplateSchema);
