const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
  questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question' },
  attempt: Number,
  codeUrl: String,
  timeTaken: Number, // minutes
  submittedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Submission', submissionSchema);