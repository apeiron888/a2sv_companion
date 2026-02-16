const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  fullName: { type: String },
  githubHandle: { type: String },
  groupSheetId: { type: String, required: true },
  rowNumber: { type: Number }, // cached row number
  githubToken: { type: String }, // encrypted
  githubTokenIV: { type: String }, // initialization vector
  githubTokenAuthTag: { type: String }, // for GCM
  githubUsername: { type: String },
  repoName: { type: String, default: process.env.DEFAULT_REPO_NAME || 'a2sv-solutions' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Student', studentSchema);