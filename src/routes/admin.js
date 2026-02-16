const express = require('express');
const { addSheet, removeSheet, listSheets } = require('../controllers/adminController');
const router = express.Router();

// Simple API key middleware (inline for brevity)
router.use((req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

router.post('/sheets', addSheet);
router.delete('/sheets/:sheetId', removeSheet);
router.get('/sheets', listSheets);

module.exports = router;