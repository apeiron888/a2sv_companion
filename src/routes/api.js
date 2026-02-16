const express = require('express');
const { githubAuth, githubCallback } = require('../controllers/authController');
const { submit } = require('../controllers/submissionController');
const router = express.Router();

router.get('/auth/github', githubAuth);
router.get('/auth/github/callback', githubCallback);
router.post('/submit', submit);

module.exports = router;