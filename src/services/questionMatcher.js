const Question = require('../models/Question');
const fuzzy = require('fuzzball');

const THRESHOLD = 80; // similarity percentage

/**
 * Find the best matching question for a given title within a group sheet.
 * @param {string} groupSheetId 
 * @param {string} submittedTitle 
 * @returns {Promise<Object|null>} question document or null
 */
async function findQuestionByTitle(groupSheetId, submittedTitle) {
  const questions = await Question.find({ groupSheetId });

  // Normalize submitted title
  const normalizedSubmitted = submittedTitle.toLowerCase().trim();

  let bestMatch = null;
  let bestScore = 0;

  questions.forEach(q => {
    const normalizedStored = q.questionTitle.toLowerCase().trim();
    const score = fuzzy.ratio(normalizedSubmitted, normalizedStored);
    if (score > bestScore && score >= THRESHOLD) {
      bestScore = score;
      bestMatch = q;
    }
  });

  return bestMatch;
}

module.exports = { findQuestionByTitle };