const Student = require('../models/Student');
const { decrypt } = require('../utils/encryption');
const { getSheetsClient } = require('../config/googlesheets');

/**
 * Get student by email, with decrypted token
 */
async function getStudentWithToken(email) {
  const student = await Student.findOne({ email });
  if (!student) return null;

  if (student.githubToken && student.githubTokenIV && student.githubTokenAuthTag) {
    const token = decrypt(
      student.githubToken,
      student.githubTokenIV,
      student.githubTokenAuthTag
    );
    student.githubTokenDecrypted = token; // attach non-persistent field
  }
  return student;
}

/**
 * Find the row number of a student in their group sheet.
 * Uses cached row number if still valid, otherwise searches and updates cache.
 * @param {Object} student - Student document with email, groupSheetId, and optional rowNumber
 * @param {string} tabName - Sheet tab name to search within
 * @returns {number|null} 1-based row number or null if not found
 */
async function findStudentRow(student, tabName) {
  const sheets = getSheetsClient();
  const sheetId = student.groupSheetId;
  const email = (student.email || '').trim().toLowerCase();
  const fullName = (student.fullName || '').trim().toLowerCase();

  // If we have a cached row number, verify it first
  if (student.rowNumber) {
    const verifyRange = tabName ? `${tabName}!A${student.rowNumber}` : `A${student.rowNumber}`;
    try {
      const verifyResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: verifyRange,
      });
      const cellValueRaw = verifyResponse.data.values?.[0]?.[0];
      const cellValue = cellValueRaw ? String(cellValueRaw).trim().toLowerCase() : '';
      if ((email && cellValue === email) || (fullName && cellValue === fullName)) {
        return student.rowNumber; // cache still valid
      }
    } catch (err) {
      console.warn(`Failed to verify cached row for ${student.email}:`, err.message);
      // fall through to full search
    }
  }

  // Perform full search (column A, starting from row 6)
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: tabName ? `${tabName}!A:A` : 'A:A',
  });

  const values = response.data.values || [];
  // Headers are rows 1-5, student data starts at row 6 (index 5)
  for (let i = 5; i < values.length; i++) {
    const row = values[i];
    const cellValueRaw = row && row[0] ? row[0] : '';
    const cellValue = cellValueRaw ? String(cellValueRaw).trim().toLowerCase() : '';
    if ((email && cellValue === email) || (fullName && cellValue === fullName)) {
      const foundRow = i + 1; // 1-based row number

      // Update cached row number in database
      await Student.updateOne(
        { _id: student._id },
        { rowNumber: foundRow }
      );

      return foundRow;
    }
  }

  return null; // student not found
}

module.exports = { getStudentWithToken, findStudentRow };