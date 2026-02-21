const express = require('express');
const router = express.Router();
const assessmentController = require('../controllers/assessmentController');
const { protect } = require('../middleware/authMiddleware');

// View Route
router.get('/assessment/:applicationId', protect, assessmentController.startAssessment);

// API Routes
router.get('/session/:id', protect, assessmentController.getAssessmentSession);
router.post('/submit-mcq', protect, assessmentController.submitMCQAnswer);
router.post('/respond', protect, assessmentController.respondToScenario);
router.post('/finalize', protect, assessmentController.finalizeAssessment);

module.exports = router;
