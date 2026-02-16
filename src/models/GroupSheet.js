const mongoose = require('mongoose');

const groupSheetSchema = new mongoose.Schema({
  sheetId: { type: String, required: true, unique: true },
  name: { type: String }, // optional friendly name
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('GroupSheet', groupSheetSchema);