const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect); // All notification routes require login

router.get('/', notificationController.getNotifications);
router.get('/view', notificationController.renderNotificationsPage);
router.patch('/:id/read', notificationController.markAsRead);

// HR/Admin only routes
router.get('/templates', authorize('hr', 'admin'), notificationController.getTemplates);
router.post('/send', authorize('hr', 'admin'), notificationController.sendManualNotification);

module.exports = router;
