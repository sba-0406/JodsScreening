const express = require('express');
const router = express.Router();
// const multer = require('multer');
// const path = require('path');
const applicationController = require('../controllers/applicationController');
const { protect, loadUser, authorizeHR } = require('../middleware/authMiddleware');

// Configure multer for resume uploads
// const storage = multer.diskStorage({
//     destination: function (req, file, cb) {
//         cb(null, 'uploads/resumes/');
//     },
//     filename: function (req, file, cb) {
//         const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
//         cb(null, 'resume-' + uniqueSuffix + path.extname(file.originalname));
//     }
// });

// const upload = multer({
//     storage: storage,
//     limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
//     fileFilter: function (req, file, cb) {
//         const allowedTypes = /pdf|doc|docx/;
//         const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
//         const mimetype = allowedTypes.test(file.mimetype);

//         if (mimetype && extname) {
//             return cb(null, true);
//         } else {
//             cb(new Error('Only PDF and Word documents are allowed'));
//         }
//     }
// });

const multer = require('multer');
const multerS3 = require('multer-s3');
const path = require('path');
const s3 = require('../config/s3');

const upload = multer({
    storage: multerS3({
        s3: s3,
        bucket: process.env.AWS_BUCKET_NAME,

        contentType: multerS3.AUTO_CONTENT_TYPE,

        key: function (req, file, cb) {

            const uniqueSuffix =
                Date.now() + '-' + Math.round(Math.random() * 1E9);

            cb(
                null,
                'resumes/resume-' + uniqueSuffix + path.extname(file.originalname)
            );
        }
    }),

    limits: { fileSize: 5 * 1024 * 1024 },

    fileFilter: function (req, file, cb) {

        const allowedTypes = /pdf|doc|docx/;

        const extname = allowedTypes.test(
            path.extname(file.originalname).toLowerCase()
        );

        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            cb(null, true);
        } else {
            cb(new Error('Only PDF and Word documents allowed'));
        }
    }
});

const uploadMemory = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: function (req, file, cb) {
        const allowedTypes = /pdf|doc|docx/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            cb(null, true);
        } else {
            cb(new Error('Only PDF and Word documents allowed'));
        }
    }
});

// Public routes (no authentication required, but load user if logged in)
router.get('/jobs', loadUser, applicationController.getPublicJobs);
router.get('/jobs/:id', loadUser, applicationController.getPublicJobDetail);

// Application routes (require authentication as candidate)
router.post('/apply/:jobId', protect, upload.single('resume'), applicationController.submitApplication);
router.get('/my-applications', protect, applicationController.getMyApplications);
router.get('/application/:id', protect, applicationController.getApplicationDetail);
router.get('/application/:id/benchmark', protect, applicationController.getBenchmarkingData);
router.get('/application/:id/view', protect, applicationController.renderApplicationDetail);
router.patch('/application/:id/status', protect, authorizeHR, applicationController.updateApplicationStatus);
router.post('/application/:id/invite', protect, authorizeHR, applicationController.sendAssessmentInvite);
router.post('/application/:id/ai-summary', protect, authorizeHR, applicationController.generateAISummary);
router.post('/autofill', protect, uploadMemory.single('resume'), applicationController.autofillFromResume);

// View routes
router.get('/jobs-portal', loadUser, applicationController.renderJobsPortal);
router.get('/job/:id/view', loadUser, applicationController.renderJobDetailPublic);
router.get('/job/:id/apply', protect, applicationController.renderApplicationForm);
router.get('/my-dashboard', protect, applicationController.renderCandidateDashboard);

module.exports = router;





// For S3:
// req.file = {
//   fieldname: 'resume',
//   originalname: 'resume.pdf',
//   mimetype: 'application/pdf',
//   location: 'https://s3.amazonaws.com/...',
//   key: 'resumes/resume-123.pdf',
//   ...
// }
// For memory:
// req.file = {
//   buffer: <Buffer ...>,
//   size: ...,
//   mimetype: ...
// }