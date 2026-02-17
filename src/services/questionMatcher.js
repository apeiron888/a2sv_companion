const Question = require('../models/Question');
const fuzzy = require('fuzzball');

const THRESHOLD = 80; // similarity percentage

/**
 * Find the best matching question for a given title within a group sheet.
 * @param {string} groupSheetId 
 * @param {string} submittedTitle 
 * @param {string} problemUrl
 * @param {string} platform
 * @returns {Promise<Object|null>} question document or null
 */
async function findQuestionByTitle(groupSheetId, submittedTitle, problemUrl, platform) {
  const normalizedPlatformRaw = platform ? String(platform).toLowerCase().trim() : null;
  const normalizedPlatform = (normalizedPlatformRaw && normalizedPlatformRaw !== 'unknown' && normalizedPlatformRaw !== 'generic')
    ? normalizedPlatformRaw
    : null;
  const normalizeUrl = (url) => {
    if (!url) return null;
    const stripped = String(url).trim().split('#')[0].split('?')[0];
    return stripped.replace(/\/$/, '');
  };
  const normalizedUrl = normalizeUrl(problemUrl);
  const questions = await Question.find({ groupSheetId });

  if (normalizedUrl) {
    const urlMatch = questions.find(q => {
      if (!q.problemUrl) return false;
      const qUrl = normalizeUrl(q.problemUrl);
      if (normalizedPlatform && q.platform && q.platform.toLowerCase() !== normalizedPlatform) {
        return false;
      }
      return qUrl === normalizedUrl;
    });
    if (urlMatch) return urlMatch;
  }

  // Normalize submitted title
  if (!submittedTitle || typeof submittedTitle !== 'string') return null;
  const normalizedSubmitted = submittedTitle.toLowerCase().trim();
  if (!normalizedSubmitted) return null;

  let bestMatch = null;
  let bestScore = 0;

  questions.forEach(q => {
    if (!q.questionTitle || typeof q.questionTitle !== 'string') return;
    if (normalizedPlatform && q.platform && q.platform.toLowerCase() !== normalizedPlatform) return;
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