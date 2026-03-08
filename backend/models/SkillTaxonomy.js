const mongoose = require('mongoose');

const SkillTaxonomySchema = new mongoose.Schema({
    skill: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    category: String, // e.g., 'Frontend', 'Backend', 'Database'
    aliases: [String], // e.g., 'Nodejs' -> ['Node.js', 'Node-JS']
    relatedSkills: [String], // e.g., 'React' -> ['Vue', 'Angular']
    isVerified: {
        type: Boolean,
        default: false // AI generated categorization needs manual review occasionally
    }
}, { timestamps: true });

module.exports = mongoose.model('SkillTaxonomy', SkillTaxonomySchema);
