const { google } = require('googleapis');

let sheetsClient = null;

const getSheetsClient = () => {
  if (sheetsClient) return sheetsClient;

  const base64Key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_BASE64;
  if (!base64Key) throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_KEY_BASE64');

  let credentials;
  const trimmed = base64Key.trim();
  const tryParseJson = (value) => {
    const cleaned = value.replace(/^\uFEFF/, '');
    return JSON.parse(cleaned);
  };

  try {
    if (trimmed.startsWith('{')) {
      credentials = tryParseJson(trimmed);
    } else {
      const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
      credentials = tryParseJson(decoded);
    }
  } catch (err) {
    throw new Error('Invalid GOOGLE_SERVICE_ACCOUNT_KEY_BASE64. Provide valid base64 JSON or raw JSON.');
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
};

module.exports = { getSheetsClient };