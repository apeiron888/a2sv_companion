const { google } = require('googleapis');

let sheetsClient = null;

const getSheetsClient = () => {
  if (sheetsClient) return sheetsClient;

  const base64Key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_BASE64;
  if (!base64Key) throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_KEY_BASE64');

  const credentials = JSON.parse(
    Buffer.from(base64Key, 'base64').toString('utf8')
  );

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
};

module.exports = { getSheetsClient };