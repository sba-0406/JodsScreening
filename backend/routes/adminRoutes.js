const express = require('express');
const router = express.Router();
const { protect, authorizeAdmin } = require('../middleware/authMiddleware');
const adminController = require('../controllers/adminController');

// All routes require authentication and Admin role
router.use(protect);
router.use(authorizeAdmin);

// Render Admin Dashboard
router.get('/dashboard', adminController.renderAdminDashboard);

// HR Account Management
router.post('/hr', adminController.createHR);
router.delete('/hr/:id', adminController.deleteHR);

module.exports = router;
