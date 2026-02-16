const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  groupSheetId: { type: String, required: true },
  tabName: { type: String, required: true },
  questionTitle: { type: String, required: true },
  linkCol: { type: String, required: true },
  timeCol: { type: String, required: true },
  platform: { type: String }, // optional: 'leetcode', 'codeforces', etc.
  problemUrl: { type: String }, // optional: full URL
  lastSeen: { type: Date, default: Date.now }
});

// Ensure uniqueness per sheet, tab, and link column
questionSchema.index({ groupSheetId: 1, tabName: 1, linkCol: 1 }, { unique: true });

module.exports = mongoose.model('Question', questionSchema);