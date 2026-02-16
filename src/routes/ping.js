const express = require('express');
const { ping } = require('../controllers/pingController');
const router = express.Router();

router.get('/', ping);

module.exports = router;