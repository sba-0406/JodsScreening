const express = require('express');
const router = express.Router();
const resumeController = require('../controllers/resumeController');
const { protect, authorize } = require('../middleware/authMiddleware');

// All resume routes require HR or Admin level access
router.use(protect);
router.use(authorize('hr', 'admin'));

router.get('/view/:id', resumeController.viewResume);
router.get('/download/:id', resumeController.downloadResume);

module.exports = router;
