const express = require('express');
const { githubAuth, githubCallback, githubStatus } = require('../controllers/authController');
const { submit } = require('../controllers/submissionController');
const router = express.Router();

router.get('/auth/github', githubAuth);
router.get('/auth/github/callback', githubCallback);
router.get('/auth/github/status', githubStatus);
router.post('/submit', submit);

module.exports = router;