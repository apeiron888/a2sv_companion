const Question = require('../models/Question');
const GroupSheet = require('../models/GroupSheet');
const { getSheetsClient } = require('../config/googleSheets');

/**
 * Update mapping for all tracked group sheets.
 */
async function updateAllGroupSheetsMapping() {
  const groupSheets = await GroupSheet.find({});
  console.log(`Updating mapping for ${groupSheets.length} group sheets`);

  for (const group of groupSheets) {
    try {
      await updateSheetMapping(group.sheetId);
    } catch (err) {
      console.error(`Error updating sheet ${group.sheetId}:`, err);
    }
  }
}

/**
 * Extract URL from a Google Sheets HYPERLINK formula.
 * Example: =HYPERLINK("https://leetcode.com/problems/two-sum/", "Two Sum")
 * Returns the URL or null if not found.
 */
function extractUrlFromHyperlink(cellValue) {
  if (typeof cellValue !== 'string') return null;
  const match = cellValue.match(/=HYPERLINK\("([^"]+)"/);
  return match ? match[1] : null;
}

/**
 * Update mapping for a single group sheet.
 * Reads headers (rows 1-5) from each tab, finds question pairs starting from column F,
 * extracts platform (row4) and question title (row5), and upserts into DB.
 */
async function updateSheetMapping(sheetId) {
  const sheets = getSheetsClient();

  // Get spreadsheet metadata to list tabs
  const metadata = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const tabs = metadata.data.sheets.map(s => s.properties.title);

  for (const tab of tabs) {
    // Read rows 1-5 to get headers
    const range = `${tab}!1:5`;
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range,
    });
    const rows = response.data.values || []; // rows[0] = row1, rows[1] = row2, ... rows[4] = row5

    if (rows.length < 5) continue; // need at least 5 rows

    const row4 = rows[3] || []; // platform row
    const row5 = rows[4] || []; // question title row

    // Start from column F (index 5)
    for (let colIndex = 5; colIndex < row5.length; colIndex += 2) {
      const linkCol = String.fromCharCode(65 + colIndex); // 0->A, 5->F
      const timeCol = String.fromCharCode(65 + colIndex + 1);
      const titleCell = row5[colIndex];
      if (!titleCell || titleCell.trim() === '') continue; // empty cell, skip

      const questionTitle = titleCell.trim();
      const platform = row4[colIndex] ? row4[colIndex].trim() : '';
      const problemUrl = extractUrlFromHyperlink(titleCell);

      // Upsert into DB
      await Question.findOneAndUpdate(
        { groupSheetId: sheetId, tabName: tab, linkCol },
        {
          questionTitle,
          platform,
          problemUrl,
          timeCol,
          lastSeen: new Date()
        },
        { upsert: true }
      );
    }

    // Optional: remove questions not seen in last N days
    // await Question.deleteMany({ groupSheetId: sheetId, lastSeen: { $lt: new Date(Date.now() - 7*24*60*60*1000) } });
  }
}

module.exports = { updateAllGroupSheetsMapping };