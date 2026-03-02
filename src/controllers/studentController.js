const Student = require('../models/Student');
const GroupSheet = require('../models/GroupSheet');

function hasGithubToken(student) {
  return !!(student && student.githubToken && student.githubTokenIV && student.githubTokenAuthTag);
}

exports.upsertStudentSettings = async (req, res) => {
  try {
    const {
      email,
      previousEmail,
      studentName,
      githubHandle,
      groupName,
      groupSheetId: rawGroupSheetId,
      repoName,
    } = req.body || {};

    if (!email || !studentName || !githubHandle || (!groupName && !rawGroupSheetId)) {
      return res.status(400).json({
        error: 'Missing required fields: email, studentName, githubHandle, and groupName (or groupSheetId).',
      });
    }

    let groupSheetId = rawGroupSheetId;
    let resolvedGroupName = groupName;

    if (!groupSheetId && groupName) {
      const escaped = groupName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const group = await GroupSheet.findOne({ name: new RegExp(`^${escaped}$`, 'i') });
      if (!group) {
        return res.status(404).json({ error: `Group "${groupName}" was not found.` });
      }
      groupSheetId = group.sheetId;
      resolvedGroupName = group.name || groupName;
    }

    const lookupEmail = (previousEmail || email || '').trim().toLowerCase();
    const normalizedEmail = String(email).trim().toLowerCase();

    let student = await Student.findOne({ email: lookupEmail });

    if (!student && lookupEmail !== normalizedEmail) {
      student = await Student.findOne({ email: normalizedEmail });
    }

    if (student && student.email !== normalizedEmail) {
      const duplicate = await Student.findOne({ email: normalizedEmail });
      if (duplicate && !duplicate._id.equals(student._id)) {
        return res.status(409).json({
          error: 'Another account already exists with this email. Reconnect GitHub with that email or use a different one.',
        });
      }
    }

    const update = {
      email: normalizedEmail,
      fullName: String(studentName).trim(),
      githubHandle: String(githubHandle).trim(),
      groupSheetId,
      rowNumber: null,
    };

    if (typeof repoName === 'string' && repoName.trim()) {
      update.repoName = repoName.trim();
    }

    const filter = student?._id ? { _id: student._id } : { email: normalizedEmail };

    const saved = await Student.findOneAndUpdate(
      filter,
      { $set: update },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.json({
      success: true,
      message: 'Settings saved successfully.',
      email: saved.email,
      groupSheetId: saved.groupSheetId,
      groupName: resolvedGroupName || null,
      connected: hasGithubToken(saved),
      githubUsername: saved.githubUsername || null,
      repoName: saved.repoName || null,
    });
  } catch (error) {
    console.error('Save settings error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
