const { getStudentWithToken, findStudentRow } = require('../services/student');
const { findQuestionByTitle } = require('../services/questionMatcher');
const { saveCodeToGitHub } = require('../services/github');
const { getSheetsClient } = require('../config/googlesheets');
const Submission = require('../models/Submission');

exports.submit = async (req, res) => {
  try {
    const { email, platform, problemTitle, code, timeTaken, trial, language } = req.body;

    // 1. Get student and token
    const student = await getStudentWithToken(email);
    if (!student) {
      return res.status(404).json({ error: 'Student not found. Please authenticate with GitHub first.' });
    }
    if (!student.githubTokenDecrypted) {
      return res.status(401).json({ error: 'GitHub token missing. Please reconnect GitHub.' });
    }

    // 2. Find question in mapping for this group
    const question = await findQuestionByTitle(student.groupSheetId, problemTitle);
    if (!question) {
      return res.status(404).json({ error: 'Question not found in any sheet tab. It may not be synced yet.' });
    }

    // 3. Find student's row in sheet
    const rowNumber = await findStudentRow(student);
    if (!rowNumber) {
      return res.status(404).json({ error: 'Student row not found in sheet.' });
    }

    // 4. Prepare GitHub file path
    const slug = problemTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const fileExt = language === 'python' ? 'py' : language === 'java' ? 'java' : language === 'c++' ? 'cpp' : 'js';
    const path = `${platform}/${slug}_trial${trial}.${fileExt}`;
    const commitMessage = `Add solution for ${problemTitle} (trial ${trial})`;

    // 5. Save code to GitHub using student's token
    const rawUrl = await saveCodeToGitHub(
      student.githubTokenDecrypted,
      student.githubUsername,
      student.repoName,
      path,
      code,
      commitMessage
    );

    // 6. Update Google Sheet
    const sheets = getSheetsClient();
    const sheetId = student.groupSheetId;
    const tabName = question.tabName;
    const linkCell = `${tabName}!${question.linkCol}${rowNumber}`;
    const timeCell = `${tabName}!${question.timeCol}${rowNumber}`;

    // Set link cell as hyperlink formula
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: linkCell,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[`=HYPERLINK("${rawUrl}", "Solution")`]] }
    });

    // Set time cell
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: timeCell,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[timeTaken]] }
    });

    // 7. Log submission (optional)
    await Submission.create({
      studentId: student._id,
      questionId: question._id,
      attempt: trial,
      codeUrl: rawUrl,
      timeTaken
    });

    res.json({ success: true, rawUrl });
  } catch (error) {
    console.error('Submission error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};