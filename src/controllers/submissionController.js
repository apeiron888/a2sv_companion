const { getStudentWithToken } = require('../services/student');
const { findQuestionByTitle } = require('../services/questionMatcher');
const Submission = require('../models/Submission');

/**
 * POST /api/submit
 */
exports.submit = async (req, res) => {
  try {
    const { email, platform, problemTitle, problemSlug, problemUrl, code, timeTaken, trial, language } = req.body;

    // ── Validate required fields ──────────────────────────────────────────────
    if (!email) {
      return res.status(400).json({ error: 'Missing email. Please configure your email in the extension options.' });
    }
    if (!code) {
      return res.status(400).json({ error: 'No code received. Try refreshing the page and syncing again.' });
    }

    // ── 1. Validate student ───────────────────────────────────────────────────
    const student = await getStudentWithToken(email);
    if (!student) {
      return res.status(404).json({
        error: `No account found for ${email}. Please connect GitHub from the extension options page first.`,
      });
    }
    if (!student.githubTokenDecrypted) {
      return res.status(401).json({
        error: 'Your GitHub token has expired or is missing. Please click "Reconnect GitHub" in the extension options.',
      });
    }

    // ── 2. Match the question in the group sheet mapping ──────────────────────
    const question = await findQuestionByTitle(student.groupSheetId, problemTitle, problemUrl, platform);
    if (!question) {
      return res.status(404).json({
        error: `Problem "${problemTitle}" is not yet mapped for your group. The mapping updates every 5 minutes — please wait and try again, or ask your TA to ensure this problem is in the sheet.`,
      });
    }

    // ── 3. Build file path for GitHub ─────────────────────────────────────────
    const slug = (problemSlug || problemTitle).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const normalizedPlatform = (platform || 'unknown').toLowerCase();
    const extMap = {
      python: 'py', java: 'java', 'c++': 'cpp', javascript: 'js',
      typescript: 'ts', 'c#': 'cs', go: 'go', kotlin: 'kt', rust: 'rs', php: 'php', swift: 'swift',
    };
    const fileExt = extMap[language] || 'txt';
    const githubPath = `${normalizedPlatform}/${slug}_trial${trial || 1}.${fileExt}`;

    // ── 4. Persist submission as 'pending' → return immediately ───────────────
    const submission = await Submission.create({
      studentId: student._id,
      questionId: question._id,
      platform: normalizedPlatform,
      problemTitle,
      problemUrl,
      attempt: trial || 1,
      timeTaken: timeTaken || 0,
      language,
      code,          // stored temporarily; cleared by queue after GitHub push
      githubPath,
      status: 'pending',
    });

    // Return 202 Accepted immediately. The queue processor handles GitHub + Sheets.
    return res.status(202).json({
      success: true,
      jobId: submission._id.toString(),
      message: 'Submission received. GitHub and Google Sheets will be updated within 30 seconds.',
    });

  } catch (error) {
    console.error('Submission controller error:', error);
    return res.status(500).json({
      error: 'An unexpected server error occurred. Our team has been notified. Please try again in a minute.',
    });
  }
};

/**
 * GET /api/submit/status/:jobId
 *
 * Allows the extension to poll the status of a specific submission.
 * The extension calls this ~12 s after receiving the 202 to surface
 * any background processing errors as user-facing toasts.
 */
exports.getSubmitStatus = async (req, res) => {
  try {
    const { jobId } = req.params;
    if (!jobId || jobId.length !== 24) {
      return res.status(400).json({ error: 'Invalid job ID' });
    }
    const submission = await Submission.findById(jobId).select('status errorMessage codeUrl htmlUrl processedAt');
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    return res.json({
      status: submission.status,
      errorMessage: submission.errorMessage || null,
      codeUrl: submission.codeUrl || null,
      htmlUrl: submission.htmlUrl || null,
      processedAt: submission.processedAt || null,
    });
  } catch (error) {
    console.error('Status check error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};