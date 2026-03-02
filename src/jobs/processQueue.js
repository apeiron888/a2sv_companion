const cron = require('node-cron');
const Submission = require('../models/Submission');
const Student = require('../models/Student');
const Question = require('../models/Question');
const { findStudentRow } = require('../services/student');
const { decrypt } = require('../utils/encryption');
const { saveCodeToGitHub } = require('../services/github');
const { getSheetsClient } = require('../config/googlesheets');

const MAX_RETRIES = 3;
const BATCH_SIZE = 20; // Process up to 20 pending submissions per run

/**
 * Background queue processor.
 * Runs every 30 seconds and processes pending submissions asynchronously.
 * This is the core fix: /api/submit now returns instantly, and the heavy work
 * (GitHub API + Google Sheets API) happens here in the background.
 */
async function processQueue() {
    // Find pending submissions, oldest first
    const pending = await Submission.find({ status: 'pending' })
        .sort({ createdAt: 1 })
        .limit(BATCH_SIZE)
        .lean();

    if (pending.length === 0) return;
    console.log(`[queue] Processing ${pending.length} pending submission(s)`);

    // Mark all as 'processing' atomically to prevent double-processing
    const pendingIds = pending.map(s => s._id);
    await Submission.updateMany(
        { _id: { $in: pendingIds }, status: 'pending' },
        { $set: { status: 'processing' } }
    );

    const processingSubmissions = await Submission.find({ _id: { $in: pendingIds }, status: 'processing' }).lean();
    if (processingSubmissions.length === 0) return;

    const studentIds = [...new Set(processingSubmissions.map(s => String(s.studentId)).filter(Boolean))];
    const questionIds = [...new Set(processingSubmissions.map(s => String(s.questionId)).filter(Boolean))];

    const [students, questions] = await Promise.all([
        Student.find({ _id: { $in: studentIds } }).lean(),
        Question.find({ _id: { $in: questionIds } }).lean(),
    ]);

    const studentById = new Map(students.map(s => [String(s._id), s]));
    const questionById = new Map(questions.map(q => [String(q._id), q]));

    // Collect Sheets updates to batch (reduces API quota usage)
    const sheetsUpdates = [];

    for (const current of processingSubmissions) {
        try {
            // ── 1. Load student with token ─────────────────────────────────────────
            const student = studentById.get(String(current.studentId));
            if (!student) {
                await markError(current, 'Student record no longer exists. Please reconnect GitHub.');
                continue;
            }

            let githubToken;
            try {
                githubToken = decrypt(student.githubToken, student.githubTokenIV, student.githubTokenAuthTag);
            } catch (_) {
                await markError(current, 'GitHub token could not be decrypted. Please reconnect GitHub in the extension options.');
                continue;
            }

            // ── 2. Push code to GitHub ─────────────────────────────────────────────
            let htmlUrl, rawUrl;
            try {
                const result = await saveCodeToGitHub(
                    githubToken,
                    student.githubUsername,
                    student.repoName,
                    current.githubPath,
                    current.code,
                    `Add solution for ${current.problemTitle} (trial ${current.attempt})`
                );
                htmlUrl = result.htmlUrl;
                rawUrl = result.rawUrl;
            } catch (err) {
                const errMsg = err?.response?.data?.message || err.message;
                if (current.retries < MAX_RETRIES) {
                    // Retry later
                    await Submission.updateOne(
                        { _id: current._id },
                        { $set: { status: 'pending', retries: (current.retries || 0) + 1 } }
                    );
                    console.warn(`[queue] GitHub push failed for ${current._id}, retry ${(current.retries || 0) + 1}: ${errMsg}`);
                } else {
                    await markError(current, `GitHub push failed after ${MAX_RETRIES} retries: ${errMsg}`);
                }
                continue;
            }

            // ── 3. Update GitHub URL and queue Sheets update ───────────────────────
            await Submission.updateOne({ _id: current._id }, {
                $set: { codeUrl: rawUrl, htmlUrl },
            });

            // Load question for sheet cell info
            if (!current.questionId) {
                await markError(current, 'Question mapping missing for this submission.');
                continue;
            }

            const question = questionById.get(String(current.questionId));
            if (!question) {
                await markError(current, 'Question mapping not found. Please retry after mapping update.');
                continue;
            }

            sheetsUpdates.push({ submission: current, student, question, htmlUrl });

        } catch (err) {
            console.error(`[queue] Unexpected error for submission ${current._id}:`, err.message);
            await markError(current, `Internal processing error: ${err.message}`);
        }
    }

    if (sheetsUpdates.length === 0) {
        return;
    }

    // ── 4. Batch Sheets updates ────────────────────────────────────────────────
    // Group by spreadsheetId to minimize API calls
    const bySheet = {};
    for (const item of sheetsUpdates) {
        const sheetId = item.student.groupSheetId;
        if (!bySheet[sheetId]) bySheet[sheetId] = [];
        bySheet[sheetId].push(item);
    }

    const sheets = getSheetsClient();
    for (const [sheetId, items] of Object.entries(bySheet)) {
        try {
            // Build a single batchUpdate request for all items in this sheet
            const data = [];
            const successfulSubmissionIds = [];
            for (const { submission, student, question, htmlUrl } of items) {
                // We need the student's row number for this tab
                let rowNumber = student.rowNumber;
                if (!rowNumber) {
                    rowNumber = await findStudentRow(student, question.tabName);
                    if (rowNumber) {
                        student.rowNumber = rowNumber;
                    }
                }

                if (!rowNumber) {
                    await markError(submission, 'Student row not found in sheet. Check name/email in settings.');
                    continue;
                }

                const linkCell = `${question.tabName}!${question.linkCol}${rowNumber}`;
                const timeCell = `${question.tabName}!${question.timeCol}${rowNumber}`;
                data.push(
                    { range: linkCell, values: [[`=HYPERLINK("${htmlUrl}", "${submission.attempt}")`]] },
                    { range: timeCell, values: [[submission.timeTaken]] }
                );
                successfulSubmissionIds.push(submission._id);
            }

            if (data.length === 0) {
                continue;
            }

            await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId: sheetId,
                requestBody: { valueInputOption: 'USER_ENTERED', data },
            });

            // Mark processed subset as done
            if (successfulSubmissionIds.length > 0) {
                await Submission.updateMany(
                    { _id: { $in: successfulSubmissionIds } },
                    { $set: { status: 'done', processedAt: new Date(), code: null } } // Clear stored code after processing
                );
            }
        } catch (err) {
            console.error(`[queue] Sheets batch update failed for sheet ${sheetId}:`, err.message);
            // Mark each as error individually
            for (const { submission } of items) {
                await markError(submission, `Google Sheets update failed: ${err.message}`);
            }
        }
    }
}

async function markError(submission, message) {
    await Submission.updateOne(
        { _id: submission._id },
        { $set: { status: 'error', errorMessage: message, processedAt: new Date() } }
    );
    console.error(`[queue] Submission ${submission._id} failed: ${message}`);
}

// Schedule the queue processor
const cronEnabled = process.env.QUEUE_CRON_ENABLED !== 'false';
const cronSchedule = process.env.QUEUE_CRON_SCHEDULE || '*/10 * * * * *'; // every 10 seconds

if (cronEnabled) {
    cron.schedule(cronSchedule, async () => {
        try {
            await processQueue();
        } catch (err) {
            console.error('[queue] Queue processor crashed:', err.message);
        }
    });
    console.log('[queue] Submission queue processor started (every 10 s)');
}

module.exports = { processQueue };
