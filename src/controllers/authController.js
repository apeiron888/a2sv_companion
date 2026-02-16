const axios = require('axios');
const Student = require('../models/Student');
const GroupSheet = require('../models/GroupSheet');
const { encrypt } = require('../utils/encryption');

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const CALLBACK_URL = process.env.GITHUB_CALLBACK_URL;

// Redirect user to GitHub for authorization
exports.githubAuth = async (req, res) => {
  try {
    const { email, groupSheetId: rawGroupSheetId, groupName, extensionId } = req.query;
    if (!email || !extensionId || (!rawGroupSheetId && !groupName)) {
      return res.status(400).send('Missing email, group name (or sheet id), or extensionId');
    }

    let groupSheetId = rawGroupSheetId;
    let resolvedGroupName = groupName;

    if (!groupSheetId && groupName) {
      const escaped = groupName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const group = await GroupSheet.findOne({ name: new RegExp(`^${escaped}$`, 'i') });
      if (!group) {
        return res.status(404).send('Group name not found');
      }
      groupSheetId = group.sheetId;
      resolvedGroupName = group.name || groupName;
    }

    // Store data in state to retrieve later
    const state = Buffer.from(JSON.stringify({ email, groupSheetId, groupName: resolvedGroupName, extensionId })).toString('base64');

    const url = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${CALLBACK_URL}&scope=repo&state=${state}`;
    res.redirect(url);
  } catch (error) {
    console.error('GitHub OAuth init error:', error);
    res.status(500).send('Internal server error');
  }
};

// Handle callback
exports.githubCallback = async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state) {
    return res.status(400).send('Missing code or state');
  }

  let email, groupSheetId, groupName, extensionId;
  try {
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    email = stateData.email;
    groupSheetId = stateData.groupSheetId;
    groupName = stateData.groupName;
    extensionId = stateData.extensionId;
  } catch (err) {
    return res.status(400).send('Invalid state');
  }

  if (!groupSheetId && groupName) {
    const escaped = groupName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const group = await GroupSheet.findOne({ name: new RegExp(`^${escaped}$`, 'i') });
    if (!group) {
      return res.status(404).send('Group name not found');
    }
    groupSheetId = group.sheetId;
  }

  if (!groupSheetId) {
    return res.status(400).send('Missing group sheet id');
  }

  try {
    // Exchange code for access token
    const tokenResponse = await axios.post('https://github.com/login/oauth/access_token', {
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: CALLBACK_URL,
    }, {
      headers: { Accept: 'application/json' },
    });

    const accessToken = tokenResponse.data.access_token;

    // Get user info to store username
    const userResponse = await axios.get('https://api.github.com/user', {
      headers: { Authorization: `token ${accessToken}` },
    });
    const githubUsername = userResponse.data.login;

    // Encrypt token
    const { encrypted, iv, authTag } = encrypt(accessToken);

    // Upsert student record
    await Student.findOneAndUpdate(
      { email },
      {
        email,
        groupSheetId,
        githubToken: encrypted,
        githubTokenIV: iv,
        githubTokenAuthTag: authTag,
        githubUsername,
        // repoName defaults; can be updated later
      },
      { upsert: true, new: true }
    );

    // Build success redirect URL using extensionId
    const successUrl = `chrome-extension://${extensionId}/success.html`;
    res.redirect(successUrl);
  } catch (error) {
    console.error('GitHub OAuth error:', error);
    const errorUrl = `chrome-extension://${extensionId}/error.html`;
    res.redirect(errorUrl);
  }
};