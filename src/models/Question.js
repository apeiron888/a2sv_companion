const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  groupSheetId: { type: String, required: true },
  tabName: { type: String, required: true },
  questionTitle: { type: String, required: true },
  linkCol: { type: String, required: true },
  timeCol: { type: String, required: true },
  platform: { type: String }, // 'leetcode', 'codeforces', etc.
  problemUrl: { type: String }, // full URL to problem
  lastSeen: { type: Date, default: Date.now }
});

// Ensure uniqueness per sheet, tab, and link column
questionSchema.index({ groupSheetId: 1, tabName: 1, linkCol: 1 }, { unique: true });
// Fast URL-first lookups per group + platform (reduces matching to a small set)
questionSchema.index({ groupSheetId: 1, platform: 1, problemUrl: 1 });
// Fast lookups for fuzzy matching per group
questionSchema.index({ groupSheetId: 1, platform: 1 });

module.exports = mongoose.model('Question', questionSchema);