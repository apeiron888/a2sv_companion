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
    const { email, groupSheetId: rawGroupSheetId, groupName, studentName, githubHandle, repoName } = req.query;
    if (!email || !studentName || !githubHandle || (!rawGroupSheetId && !groupName)) {
      return res.status(400).send('Missing email, full name, GitHub handle, or group name (or sheet id)');
    }

    if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET || !CALLBACK_URL) {
      return res.status(500).send('GitHub OAuth is not configured on the server. Missing GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, or GITHUB_CALLBACK_URL.');
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
    const state = Buffer.from(JSON.stringify({
      email,
      groupSheetId,
      groupName: resolvedGroupName,
      studentName,
      githubHandle,
      repoName,
      extensionId: req.query.extensionId
    })).toString('base64');

    const url = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${CALLBACK_URL}&scope=public_repo&state=${state}`;
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

  let email, groupSheetId, groupName, studentName, githubHandle, repoName, extensionId;
  try {
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    email = stateData.email;
    groupSheetId = stateData.groupSheetId;
    groupName = stateData.groupName;
    studentName = stateData.studentName;
    githubHandle = stateData.githubHandle;
    repoName = stateData.repoName;
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
    if (!accessToken) {
      return res.status(401).send('GitHub OAuth failed: access token not returned. Check your GitHub app client ID/secret and callback URL.');
    }

    // Get user info to store username
    const userResponse = await axios.get('https://api.github.com/user', {
      headers: { Authorization: `token ${accessToken}` },
    });
    const githubUsername = userResponse.data.login;

    // Encrypt token
    const { encrypted, iv, authTag } = encrypt(accessToken);

    // Upsert student record
    const updateDoc = {
      email,
      fullName: studentName,
      githubHandle,
      groupSheetId,
      githubToken: encrypted,
      githubTokenIV: iv,
      githubTokenAuthTag: authTag,
      githubUsername,
    };
    if (repoName) {
      updateDoc.repoName = repoName;
    }

    await Student.findOneAndUpdate(
      { email },
      updateDoc,
      { upsert: true, new: true }
    );

    // Build success redirect URL using extensionId
    if (extensionId) {
      const successUrl = `chrome-extension://${extensionId}/success.html`;
      return res.redirect(successUrl);
    }
    if (process.env.AUTH_SUCCESS_URL) {
      return res.redirect(process.env.AUTH_SUCCESS_URL);
    }
    return res.send('GitHub connected. You can close this tab and return to the extension.');
  } catch (error) {
    console.error('GitHub OAuth error:', error);
    if (extensionId) {
      const errorUrl = `chrome-extension://${extensionId}/error.html`;
      return res.redirect(errorUrl);
    }
    if (process.env.AUTH_ERROR_URL) {
      return res.redirect(process.env.AUTH_ERROR_URL);
    }
    const errorDesc = error?.response?.data?.error_description || error?.response?.data?.error || error.message;
    return res.status(500).send(`GitHub OAuth failed. ${errorDesc || 'Please retry from the extension.'}`);
  }
};

// Check if GitHub is connected for a given email
exports.githubStatus = async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ error: 'Missing email' });
    }
    const student = await Student.findOne({ email });
    const connected = !!(student && student.githubToken && student.githubTokenIV && student.githubTokenAuthTag);
    return res.json({ connected, githubUsername: student?.githubUsername || null, repoName: student?.repoName || null });
  } catch (error) {
    console.error('GitHub status error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};