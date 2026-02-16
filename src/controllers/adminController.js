const GroupSheet = require('../models/GroupSheet');
const { updateAllGroupSheetsMapping } = require('../services/mapping');

// Simple API key check middleware (can be used as separate middleware)
const checkAdminKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// Add a new group sheet to track
exports.addSheet = async (req, res) => {
  try {
    const { sheetId, name } = req.body;
    if (!sheetId) {
      return res.status(400).json({ error: 'sheetId is required' });
    }

    const existing = await GroupSheet.findOne({ sheetId });
    if (existing) {
      return res.status(409).json({ error: 'Sheet already tracked' });
    }

    const newSheet = new GroupSheet({ sheetId, name });
    await newSheet.save();
    res.status(201).json({ success: true, sheet: newSheet });
  } catch (error) {
    console.error('Error adding sheet:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Remove a group sheet from tracking
exports.removeSheet = async (req, res) => {
  try {
    const { sheetId } = req.params;
    const result = await GroupSheet.findOneAndDelete({ sheetId });
    if (!result) {
      return res.status(404).json({ error: 'Sheet not found' });
    }
    // Optionally also delete related questions?
    res.json({ success: true });
  } catch (error) {
    console.error('Error removing sheet:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// List all tracked sheets
exports.listSheets = async (req, res) => {
  try {
    const sheets = await GroupSheet.find({});
    res.json({ sheets });
  } catch (error) {
    console.error('Error listing sheets:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Manually refresh mapping for all tracked sheets
exports.refreshMapping = async (req, res) => {
  try {
    await updateAllGroupSheetsMapping();
    res.json({ success: true });
  } catch (error) {
    console.error('Error refreshing mapping:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};