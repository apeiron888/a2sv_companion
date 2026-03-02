const express = require('express');
const { githubAuth, githubCallback, githubStatus } = require('../controllers/authController');
const { submit, getSubmitStatus } = require('../controllers/submissionController');
const { upsertStudentSettings } = require('../controllers/studentController');
const router = express.Router();

router.get('/auth/github', githubAuth);
router.get('/auth/github/callback', githubCallback);
router.get('/auth/github/status', githubStatus);
router.post('/student/settings', upsertStudentSettings);
router.post('/submit', submit);
router.get('/submit/status/:jobId', getSubmitStatus);

module.exports = router;