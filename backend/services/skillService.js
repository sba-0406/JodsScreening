const SkillTaxonomy = require('../models/SkillTaxonomy');
const ai = require('./aiService');

/**
 * Normalizes skill strings for consistent matching
 */
const normalize = (s) => s.toLowerCase().trim().replace(/[\s.-]/g, '');

const STATIC_TAXONOMY = {
    'frontend-framework': ['react', 'vue', 'angular', 'svelte', 'nextjs', 'nuxt'],
    'backend-framework': ['express', 'nestjs', 'fastify', 'django', 'flask', 'laravel'],
    'database': ['mongodb', 'postgresql', 'mysql', 'redis', 'sqlite', 'mariadb'],
    'programming-language': ['javascript', 'typescript', 'python', 'java', 'cpp', 'golang', 'rust'],
    'cloud-devops': ['aws', 'azure', 'docker', 'kubernetes', 'jenkins', 'terraform']
};

class SkillService {
    /**
     * Finds the category for a given skill using static map or DB
     */
    async getCategory(skillName) {
        const norm = normalize(skillName);

        // 1. Check static taxonomy
        for (const [cat, skills] of Object.entries(STATIC_TAXONOMY)) {
            if (skills.includes(norm)) return cat;
        }

        // 2. Check DB SkillTaxonomy
        let taxonomy = await SkillTaxonomy.findOne({ 
            $or: [{ skill: norm }, { aliases: norm }] 
        });

        if (taxonomy) return taxonomy.category;

        // 3. One-time AI classification (Smart Cache)
        try {
            console.log(`[SKILL AI] Classifying new skill: ${skillName}`);
            const prompt = `Identify the general tech category for the skill "${skillName}". 
            Choose from: Frontend-Framework, Backend-Framework, Database, Programming-Language, Cloud-DevOps, UI-UX, Testing, or General-Tech.
            Return ONLY the category name.`;
            
            const category = await ai.generateContent(prompt);
            const sanitizedCat = category.trim().replace(/["']/g, '');

            await SkillTaxonomy.create({
                skill: norm,
                category: sanitizedCat,
                aliases: [skillName.toLowerCase().trim()]
            });

            return sanitizedCat;
        } catch (e) {
            return 'General-Tech';
        }
    }

    /**
     * Matches candidate skills against job requirements
     */
    async matchSkills(candidateSkills = [], jobSkills = []) {
        const results = {
            exact: [],
            similar: [],
            missing: [],
            score: 0
        };

        if (jobSkills.length === 0) return { ...results, score: 100 };

        const cNorm = candidateSkills.map(normalize);
        const jNorm = jobSkills.map(normalize);

        // Get categories for job skills to allow similar matching
        const jobSkillCats = await Promise.all(jobSkills.map(async s => ({
            name: s,
            norm: normalize(s),
            cat: await this.getCategory(s)
        })));

        for (const jSkill of jobSkillCats) {
            if (cNorm.includes(jSkill.norm)) {
                results.exact.push(jSkill.name);
            } else {
                // Check for similar skills (same category)
                let foundSimilar = false;
                for (const cSkill of candidateSkills) {
                    const cCat = await this.getCategory(cSkill);
                    if (cCat === jSkill.cat && jSkill.cat !== 'General-Tech') {
                        results.similar.push(`${cSkill} (vs ${jSkill.name})`);
                        foundSimilar = true;
                        break;
                    }
                }
                if (!foundSimilar) results.missing.push(jSkill.name);
            }
        }

        // Simple scoring logic
        const exactWeight = 1.0;
        const similarWeight = 0.5;
        
        const rawScore = (results.exact.length * exactWeight) + (results.similar.length * similarWeight);
        results.score = Math.round((rawScore / jobSkills.length) * 100);

        return results;
    }
}

module.exports = new SkillService();
