const express = require('express');
const router = express.Router();
const { protect, authorizeAdmin, authorize } = require('../middleware/authMiddleware');
const systemController = require('../controllers/systemController');

// All routes require authentication
router.use(protect);

// Monitor Dashboard (Admin only)
router.get('/monitor', authorizeAdmin, systemController.renderSystemMonitor);

// API Endpoints
router.get('/health', authorizeAdmin, systemController.getAIHealth);
router.get('/audit', authorizeAdmin, systemController.getAuditLogs);

module.exports = router;
