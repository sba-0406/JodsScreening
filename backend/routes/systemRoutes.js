const express = require('express');
const router = express.Router();
const { protect, authorizeAdmin } = require('../middleware/authMiddleware');
const systemController = require('../controllers/systemController');

// All routes require authentication and Admin role
router.use(protect);
router.use(authorizeAdmin);

// Monitor Dashboard
router.get('/monitor', systemController.renderSystemMonitor);

// API Endpoints
router.get('/health', systemController.getAIHealth);
router.get('/audit', systemController.getAuditLogs);

module.exports = router;
