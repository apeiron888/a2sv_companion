const axios = require('axios');
const { retry } = require('../utils/retry');

async function ensureRepoExists(token, owner, repo) {
  const repoApi = `https://api.github.com/repos/${owner}/${repo}`;
  try {
    await axios.get(repoApi, {
      headers: { Authorization: `token ${token}` },
    });
    return;
  } catch (err) {
    if (err.response?.status !== 404) {
      throw err;
    }
  }

  // Repo doesn't exist; try to create it under authenticated user account.
  try {
    await axios.post('https://api.github.com/user/repos', {
      name: repo,
      private: false,
      auto_init: true,
      description: 'A2SV Companion submissions',
    }, {
      headers: { Authorization: `token ${token}` },
    });
  } catch (err) {
    const msg = err?.response?.data?.message || err.message;
    throw new Error(`Repository "${owner}/${repo}" not found and auto-create failed: ${msg}`);
  }
}

/**
 * Save code to student's GitHub repo
 * @param {string} token - OAuth token
 * @param {string} owner - GitHub username
 * @param {string} repo - repo name
 * @param {string} path - file path (e.g., 'leetcode/two-sum.js')
 * @param {string} content - file content
 * @param {string} message - commit message
 * @returns {Promise<{rawUrl: string, htmlUrl: string}>} raw and HTML URLs of the file
 */
async function saveCodeToGitHub(token, owner, repo, path, content, message) {
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

  const operation = async () => {
    await ensureRepoExists(token, owner, repo);

    // First, try to get the existing file's SHA (if updating)
    let sha;
    try {
      const getResponse = await axios.get(apiUrl, {
        headers: { Authorization: `token ${token}` },
      });
      sha = getResponse.data.sha;
    } catch (err) {
      if (err.response?.status !== 404) {
        throw err;
      }
      // File doesn't exist, sha will be undefined (new file)
    }

    // Prepare content (base64 encoded)
    const contentBase64 = Buffer.from(content).toString('base64');

    const putBody = {
      message,
      content: contentBase64,
      branch: 'main', // or default branch; could be configurable
    };
    if (sha) putBody.sha = sha;

    const putResponse = await axios.put(apiUrl, putBody, {
      headers: { Authorization: `token ${token}` },
    });

    // Construct raw URL (assuming main branch)
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/${path}`;
    const htmlUrl = `https://github.com/${owner}/${repo}/blob/main/${path}`;
    return { rawUrl, htmlUrl };
  };

  return retry(operation, 3, 1000);
}

module.exports = { saveCodeToGitHub };