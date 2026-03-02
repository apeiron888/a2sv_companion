const Question = require('../models/Question');
const fuzzy = require('fuzzball');

const THRESHOLD = 75; // slightly relaxed from 80 to handle title variations

/**
 * Normalize a problem URL for comparison.
 * Strips trailing slashes, query params, fragments.
 * Also normalizes Codeforces /problemset/problem/N/X ↔ /contest/N/problem/X
 * since they refer to the same problem.
 */
function normalizeUrl(url) {
  if (!url) return null;
  let stripped = String(url).trim().split('#')[0].split('?')[0].replace(/\/$/, '');
  // Normalize CF problemset URLs to contest format for comparison
  stripped = stripped.replace(
    /codeforces\.com\/problemset\/problem\/(\d+)\/([A-Za-z0-9]+)/,
    'codeforces.com/contest/$1/problem/$2'
  );
  return stripped.toLowerCase();
}

/**
 * Find the best matching question for a given title within a group sheet.
 * Strategy (priority order):
 *   1. Exact URL match (most reliable — survives title changes)
 *   2. Normalized URL match (handles trailing slash / query param differences)
 *   3. Fuzzy title match on platform-filtered subset (reduced scan)
 *
 * @param {string} groupSheetId
 * @param {string} submittedTitle
 * @param {string} problemUrl
 * @param {string} platform
 * @returns {Promise<Object|null>}
 */
async function findQuestionByTitle(groupSheetId, submittedTitle, problemUrl, platform) {
  const normalizedPlatformRaw = platform ? String(platform).toLowerCase().trim() : null;
  const normalizedPlatform =
    normalizedPlatformRaw && normalizedPlatformRaw !== 'unknown' && normalizedPlatformRaw !== 'generic'
      ? normalizedPlatformRaw
      : null;

  const normalizedUrl = normalizeUrl(problemUrl);

  // ── Build an efficient DB query ──────────────────────────────────────────────
  // Use platform index if available to limit the candidate set
  const query = { groupSheetId };
  if (normalizedPlatform) query.platform = normalizedPlatform;
  const questions = await Question.find(query);

  // ── 1. Exact URL match ───────────────────────────────────────────────────────
  if (normalizedUrl) {
    const exactMatch = questions.find(q => {
      if (!q.problemUrl) return false;
      return normalizeUrl(q.problemUrl) === normalizedUrl;
    });
    if (exactMatch) return exactMatch;
  }

  // ── 2. Fuzzy title match ─────────────────────────────────────────────────────
  if (!submittedTitle || typeof submittedTitle !== 'string') return null;
  const normalizedSubmitted = submittedTitle.toLowerCase().trim();
  if (!normalizedSubmitted) return null;

  let bestMatch = null;
  let bestScore = 0;

  for (const q of questions) {
    if (!q.questionTitle || typeof q.questionTitle !== 'string') continue;
    const normalizedStored = q.questionTitle.toLowerCase().trim();
    const score = fuzzy.ratio(normalizedSubmitted, normalizedStored);
    if (score > bestScore && score >= THRESHOLD) {
      bestScore = score;
      bestMatch = q;
    }
  }

  return bestMatch;
}

module.exports = { findQuestionByTitle };