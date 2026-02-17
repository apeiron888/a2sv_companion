const Question = require('../models/Question');
const GroupSheet = require('../models/GroupSheet');
const { getSheetsClient } = require('../config/googlesheets');

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
function extractUrlFromHyperlink(cell) {
  if (!cell) return null;

  if (cell.hyperlink) return cell.hyperlink;

  if (cell.textFormatRuns && Array.isArray(cell.textFormatRuns)) {
    const runWithLink = cell.textFormatRuns.find(run => run.format && run.format.link && run.format.link.uri);
    if (runWithLink) return runWithLink.format.link.uri;
  }

  const formulaValue = cell.userEnteredValue && cell.userEnteredValue.formulaValue;
  if (typeof formulaValue === 'string') {
    const match = formulaValue.match(/=HYPERLINK\("([^"]+)"/);
    return match ? match[1] : null;
  }

  return null;
}

function toColumnLetter(index) {
  let n = index + 1;
  let result = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

/**
 * Update mapping for a single group sheet.
 * Reads headers (rows 1-5) from each tab, finds question pairs starting from column H,
 * extracts platform (row4) and question title (row5), and upserts into DB.
 */
async function updateSheetMapping(sheetId) {
  const sheets = getSheetsClient();

  // Get spreadsheet metadata to list tabs
  const metadata = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const excludedTabs = new Set([
    'Dashboard',
    'Info Sheet',
    'Attendance',
    'Consistency Chart',
    'Contest Progress'
  ]);
  const tabs = metadata.data.sheets
    .map(s => s.properties.title)
    .filter(title => !excludedTabs.has(title));

  for (const tab of tabs) {
    // Read rows 1-5 to get headers (need hyperlink info)
    const range = `${tab}!1:5`;
    const response = await sheets.spreadsheets.get({
      spreadsheetId: sheetId,
      ranges: [range],
      includeGridData: true,
    });
    const grid = response.data.sheets && response.data.sheets[0] && response.data.sheets[0].data
      ? response.data.sheets[0].data[0]
      : null;

    if (!grid || !grid.rowData || grid.rowData.length < 5) continue;

    const row4 = grid.rowData[3] || {}; // platform row
    const row5 = grid.rowData[4] || {}; // question title row
    const row4Values = row4.values || [];
    const row5Values = row5.values || [];

    // Start from column H (index 7), each question takes 2 columns
    for (let colIndex = 7; colIndex < row5Values.length; colIndex += 2) {
      const linkCol = toColumnLetter(colIndex);
      const timeCol = toColumnLetter(colIndex + 1);
      const titleCell = row5Values[colIndex];
      const titleFromEntered = titleCell && titleCell.userEnteredValue && titleCell.userEnteredValue.stringValue
        ? titleCell.userEnteredValue.stringValue
        : '';
      const titleFromFormatted = titleCell && titleCell.formattedValue ? titleCell.formattedValue : '';
      const titleText = (titleFromEntered || titleFromFormatted || '').trim();
      if (!titleText) {
        console.log(`[mapping] Stop at empty question cell: tab=${tab}, col=${linkCol}`);
        break; // stop when question header becomes empty
      }

      const questionTitle = titleText;
      const platformCell = row4Values[colIndex];
      const platformText = platformCell && platformCell.formattedValue ? platformCell.formattedValue.trim() : '';
      const platform = platformText ? platformText.toLowerCase() : '';
      const problemUrl = extractUrlFromHyperlink(titleCell);

      console.log(
        `[mapping] sheet=${sheetId} tab=${tab} col=${linkCol}/${timeCol} ` +
        `title="${questionTitle}" platform="${platform}" url=${problemUrl || 'null'}`
      );

      // Upsert into DB
      try {
        const saved = await Question.findOneAndUpdate(
          { groupSheetId: sheetId, tabName: tab, linkCol },
          {
            questionTitle,
            platform,
            problemUrl,
            timeCol,
            lastSeen: new Date()
          },
          { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
        );

        console.log(
          `[mapping] saved question id=${saved?._id || 'null'} ` +
          `sheet=${sheetId} tab=${tab} col=${linkCol}/${timeCol}`
        );
      } catch (err) {
        console.error(
          `[mapping] failed to save question sheet=${sheetId} tab=${tab} col=${linkCol}/${timeCol}:`,
          err
        );
      }
    }

    try {
      const count = await Question.countDocuments({ groupSheetId: sheetId, tabName: tab });
      console.log(`[mapping] tab=${tab} totalQuestions=${count}`);
    } catch (err) {
      console.warn(`[mapping] failed to count questions for tab=${tab}:`, err.message);
    }

    // Optional: remove questions not seen in last N days
    // await Question.deleteMany({ groupSheetId: sheetId, lastSeen: { $lt: new Date(Date.now() - 7*24*60*60*1000) } });
  }
}

module.exports = { updateAllGroupSheetsMapping };