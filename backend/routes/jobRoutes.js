const express = require('express');
const router = express.Router();
const { protect, authorizeHR } = require('../middleware/authMiddleware');
const jobController = require('../controllers/jobController');

// All routes require authentication and HR role
router.use(protect);
router.use(authorizeHR);

// Render views
router.get('/dashboard', jobController.renderHRDashboard);
router.get('/dashboard/view', jobController.renderHRDashboard);
router.get('/create', jobController.renderCreateJob);
router.get('/create/view', jobController.renderCreateJob);
router.get('/:id/view', jobController.renderJobDetail);

// Job CRUD
router.post('/', jobController.createJob);
router.get('/', jobController.getJobs);
router.get('/:id', jobController.getJobById);
router.put('/:id', jobController.updateJob);
router.delete('/:id', jobController.deleteJob);

// Assessment generation
router.post('/:id/generate-assessment', jobController.generateAssessment);
router.put('/:id/assessment', jobController.updateAssessment);
router.post('/:id/regenerate-questions', jobController.regenerateTechnicalAssessment);
router.post('/:id/regenerate-scenarios', jobController.regenerateScenarios);
router.post('/:id/approve-all', jobController.approveAllQuestions);
router.put('/:id/questions/:questionId', jobController.moderateQuestion);
router.delete('/:id/questions/:questionId/remove', jobController.removeQuestionFromAssessment);

// AI Question Suggestions
router.post('/:id/suggestions/approve', jobController.approveSuggestions);
router.post('/:id/suggestions/dismiss', jobController.dismissSuggestions);
router.post('/:id/suggestions/generate-more', jobController.generateMoreSuggestions);

// Technical Pool
router.put('/:id/pool/refresh-skill', jobController.refreshSkillPool);
router.put('/:id/pool/save-selection', jobController.saveSkillSelection);

// Granular Scenario Control
router.delete('/:id/scenario/:scenarioId', jobController.deleteScenario);
router.post('/:id/scenario/:scenarioId/regenerate', jobController.regenerateSingleScenario);

// Manual overrides & AI Refinement
router.post('/:id/manual-question', jobController.addManualQuestion);
router.post('/:id/manual-scenario', jobController.addManualScenario);
router.post('/refine-content', jobController.refineContent);

// Analytics
router.get('/:id/analytics', jobController.getJobAnalytics);
router.get('/:id/candidates', jobController.getJobCandidates);
router.get('/:id/pool-insights', jobController.getPoolInsights);

module.exports = router;
