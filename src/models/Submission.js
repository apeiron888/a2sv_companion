const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question' },
  platform: { type: String },
  problemTitle: { type: String },
  problemUrl: { type: String },
  attempt: { type: Number, default: 1 },
  codeUrl: { type: String },
  htmlUrl: { type: String },
  timeTaken: { type: Number },
  language: { type: String },
  code: { type: String }, // temporarily stored until processed
  githubPath: { type: String },
  // Async queue fields
  status: {
    type: String,
    enum: ['pending', 'processing', 'done', 'error'],
    default: 'pending',
    index: true,
  },
  errorMessage: { type: String },
  retries: { type: Number, default: 0 },
  processedAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

// Index for efficient queue queries
submissionSchema.index({ status: 1, createdAt: 1 });

module.exports = mongoose.model('Submission', submissionSchema);