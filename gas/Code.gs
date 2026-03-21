// ════════════════════════════════════════════════════════════════
// HAN Admin — Google Apps Script
// Deploy as: Web App → Execute as Me → Anyone can access
// ════════════════════════════════════════════════════════════════

// Maps URL param keys → Sheet column header names (Questions sheet)
const PARAM_TO_HEADER = {
  questionId:     'Question ID',
  level:          'Level',
  paper:          'Paper',
  year:           'Year',
  session:        'Session',
  timeZone:       'Time Zone',
  topic:          'Topic',
  subtopic:       'Subtopic',
  marks:          'Marks',
  difficulty:     'Difficulty',
  status:         'Status',
  hanExplanation: 'HAN Explanation',
  commonMistakes: 'Common Mistakes',
  examinerNote:   'Examiner Note',
  solutionUrl:    'Solution URL',
};

// Admin secret — stored in Script Properties (File → Project Properties → Script Properties)
// Key: ADMIN_SECRET, Value: must match GAS_ADMIN_SECRET in your Netlify env vars
function getAdminSecret() {
  return PropertiesService.getScriptProperties().getProperty('ADMIN_SECRET');
}

function doGet(e) {
  const action = e.parameter.action;

  if (action === 'addQuestion')       return addQuestion(e.parameter);
  if (action === 'addPremiumUser')    return addPremiumUser(e.parameter);
  if (action === 'checkPremium')      return checkPremium(e.parameter);
  if (action === 'saveUser')          return saveUser(e.parameter);
  if (action === 'registerUser')      return registerUser(e.parameter);
  if (action === 'getUser')           return getUser(e.parameter);
  if (action === 'loadProgress')      return loadProgress(e.parameter);
  if (action === 'resetProgress')     return resetProgressGAS(e.parameter);
  if (action === 'storeResetToken')   return storeResetToken(e.parameter);
  if (action === 'verifyResetToken')  return verifyResetToken(e.parameter);
  if (action === 'updateUserPassword') return updateUserPassword(e.parameter);
  if (action === 'getEvalQuestions')  return getEvalQuestions(e.parameter);
  if (action === 'saveEvalResult')    return saveEvalResult(e.parameter);
  if (action === 'getAccuracyMetrics') return getAccuracyMetrics(e.parameter);
  if (action === 'getTrendData')      return getTrendData(e.parameter);

  return ContentService
    .createTextOutput('HAN Admin GAS — OK')
    .setMimeType(ContentService.MimeType.TEXT);
}

// Progress data sent as JSON body — only save needs POST due to data size
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action === 'saveProgress') return saveProgress(body);
    if (body.action === 'saveFeedback') return saveFeedback(body);
    return ContentService
      .createTextOutput(JSON.stringify({ error: 'Unknown action: ' + (body.action || 'none') }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.message || 'Invalid request' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── Save user feedback to the Feedback sheet, photos to Drive ────
function saveFeedback(body) {
  if (body.secret !== getAdminSecret()) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: 'Unauthorized' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Feedback');

  if (!sheet) {
    sheet = ss.insertSheet('Feedback');
    sheet.appendRow(['Timestamp', 'Type', 'Subject', 'Message', 'Name', 'Email', 'Page', 'Photo URLs', 'Admin Reply']);
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(4, 400); // Message column wider
    sheet.setColumnWidth(9, 300); // Admin Reply column
  } else {
    // Add Admin Reply column if the sheet existed before this update
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (!headers.includes('Admin Reply')) {
      const nextCol = sheet.getLastColumn() + 1;
      sheet.getRange(1, nextCol).setValue('Admin Reply');
      sheet.setColumnWidth(nextCol, 300);
    }
  }

  // Save photos to Google Drive and collect view URLs
  const photoUrls = [];
  if (Array.isArray(body.photos) && body.photos.length > 0) {
    try {
      const folders = DriveApp.getFoldersByName('HAN Feedback Photos');
      const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder('HAN Feedback Photos');

      body.photos.forEach(function(photo, i) {
        try {
          const matches = photo.match(/^data:([^;]+);base64,(.+)$/);
          if (!matches) { photoUrls.push('[Error: invalid photo format]'); return; }
          const mimeType = matches[1];
          const base64Data = matches[2];
          const ext = mimeType.split('/')[1] || 'jpg';
          const ts = (body.ts || new Date().toISOString()).replace(/[:.]/g, '-');
          const fileName = 'feedback_' + ts + '_' + (i + 1) + '.' + ext;
          const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName);
          const file = folder.createFile(blob);
          file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          photoUrls.push(file.getUrl());
        } catch (photoErr) {
          photoUrls.push('[Photo error: ' + photoErr.message + ']');
        }
      });
    } catch (driveErr) {
      photoUrls.push('[Drive error: ' + driveErr.message + ']');
    }
  }

  sheet.appendRow([
    body.ts      || new Date().toISOString(),
    body.type    || '',
    body.subject || '',
    body.message || '',
    body.name    || '',
    body.email   || '',
    body.page    || '',
    photoUrls.join('\n'),
    '', // Admin Reply — filled in manually to trigger email
  ]);

  return ContentService
    .createTextOutput(JSON.stringify({ success: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Send reply email when admin fills in the Admin Reply column ───
// This is an installable onEdit trigger — run createReplyTrigger() once to set it up.
function onFeedbackReply(e) {
  const sheet = e.range.getSheet();
  if (sheet.getName() !== 'Feedback') return;

  const col = e.range.getColumn();
  const row = e.range.getRow();
  if (row < 2) return; // skip header

  // Find which column is Admin Reply
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const replyCol = headers.indexOf('Admin Reply') + 1;
  if (col !== replyCol || replyCol === 0) return;

  const replyText = e.range.getValue().toString().trim();
  if (!replyText) return;

  const emailCol  = headers.indexOf('Email') + 1;
  const subjectCol = headers.indexOf('Subject') + 1;
  const nameCol   = headers.indexOf('Name') + 1;

  const toEmail = sheet.getRange(row, emailCol).getValue().toString().trim();
  if (!toEmail) return;

  const subject    = sheet.getRange(row, subjectCol).getValue().toString().trim();
  const userName   = sheet.getRange(row, nameCol).getValue().toString().trim();
  const salutation = userName ? ('Hi ' + userName.split(' ')[0] + ',') : 'Hi there,';

  const emailBody = salutation + '\n\n' + replyText + '\n\n— Hanyong\nHAN · askhanyong.com';

  GmailApp.sendEmail(toEmail, 'Re: ' + subject, emailBody, {
    name: 'Hanyong from HAN',
  });

  // Highlight the cell green to confirm the email was sent
  e.range.setBackground('#d9f7be');
}

// ── Run this once in the GAS editor to install the onEdit trigger ─
function createReplyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function(t) { return t.getHandlerFunction() === 'onFeedbackReply'; })
    .forEach(function(t) { ScriptApp.deleteTrigger(t); });

  ScriptApp.newTrigger('onFeedbackReply')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit()
    .create();
}

// ── Write a question row to the Questions sheet ──────────────────
function addQuestion(params) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Questions') || ss.getActiveSheet();

  const lastCol = Math.max(sheet.getLastColumn(), Object.keys(PARAM_TO_HEADER).length);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  const row = headers.map(header => {
    const paramKey = Object.keys(PARAM_TO_HEADER).find(k => PARAM_TO_HEADER[k] === header);
    return paramKey ? (params[paramKey] || '') : '';
  });

  sheet.appendRow(row);

  return ContentService
    .createTextOutput(JSON.stringify({ success: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Record a paying customer in the Premium sheet ─────────────────
// Called by the Netlify stripe-webhook function after successful payment.
// Protected by a shared secret to prevent unauthorised additions.
function addPremiumUser(params) {
  if (params.secret !== getAdminSecret()) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: 'Unauthorized' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Premium');

  // Create the Premium sheet with headers if it doesn't exist yet
  if (!sheet) {
    sheet = ss.insertSheet('Premium');
    sheet.getRange(1, 1, 1, 4).setValues([['Email', 'Name', 'Stripe Customer ID', 'Date Added']]);
  }

  // Avoid duplicates — check if email is already in the sheet
  const data = sheet.getDataRange().getValues();
  const alreadyExists = data.some(row => row[0] === params.email);
  if (!alreadyExists) {
    sheet.appendRow([
      params.email      || '',
      params.name       || '',
      params.customerId || '',
      new Date().toISOString(),
    ]);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ success: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Check whether an email address has premium access ────────────
// Called by index.html after Google Sign-In.
function checkPremium(params) {
  const email = params.email || '';
  if (!email) {
    return ContentService
      .createTextOutput(JSON.stringify({ premium: false }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Premium');

  if (!sheet) {
    return ContentService
      .createTextOutput(JSON.stringify({ premium: false }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const data      = sheet.getDataRange().getValues();
  const isPremium = data.some(row => row[0] === email);

  return ContentService
    .createTextOutput(JSON.stringify({ premium: isPremium }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Ensure Users sheet has correct headers ────────────────────────
function ensureUserSheetHeaders(sheet) {
  const correct = ['Email', 'Name', 'Country', 'AuthMethod', 'HashedPassword', 'Last Seen'];
  const existing = sheet.getRange(1, 1, 1, correct.length).getValues()[0];
  const needsFix = correct.some((h, i) => existing[i] !== h);
  if (needsFix) {
    sheet.getRange(1, 1, 1, correct.length).setValues([correct]);
  }
}

// ── Save / update a Google OAuth user in the Users sheet ─────────
// Called by saveUserToSheet() on frontend after Google sign-in.
// Columns: Email | Name | Country | AuthMethod | HashedPassword | Last Seen
function saveUser(params) {
  const email = (params.email || '').toLowerCase().trim();
  if (!email) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: 'No email' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Users');
  if (!sheet) {
    sheet = ss.insertSheet('Users');
    sheet.getRange(1, 1, 1, 6).setValues([['Email', 'Name', 'Country', 'AuthMethod', 'HashedPassword', 'Last Seen']]);
  } else {
    ensureUserSheetHeaders(sheet);
  }

  const data = sheet.getDataRange().getValues();
  // Find existing row by email (skip header row 0)
  const rowIndex = data.findIndex((row, i) => i > 0 && row[0] === email);

  if (rowIndex > -1) {
    // Update Last Seen (column 6, 1-indexed)
    sheet.getRange(rowIndex + 1, 6).setValue(params.ts || new Date().toISOString());
    // Update country if provided and not already set
    if (params.country && !data[rowIndex][2]) {
      sheet.getRange(rowIndex + 1, 3).setValue(params.country);
    }
  } else {
    sheet.appendRow([
      email,
      params.name       || '',
      params.country    || '',
      params.authMethod || 'google',
      '',                               // HashedPassword — empty for Google users
      params.ts         || new Date().toISOString(),
    ]);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ success: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Register a new email/password user ───────────────────────────
// Called by the auth Netlify function. Protected by admin secret.
function registerUser(params) {
  if (params.secret !== getAdminSecret()) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: 'Unauthorized' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const email = (params.email || '').toLowerCase().trim();
  if (!email) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: 'No email' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Users');
  if (!sheet) {
    sheet = ss.insertSheet('Users');
    sheet.getRange(1, 1, 1, 6).setValues([['Email', 'Name', 'Country', 'AuthMethod', 'HashedPassword', 'Last Seen']]);
  } else {
    ensureUserSheetHeaders(sheet);
  }

  sheet.appendRow([
    email,
    params.name           || '',
    params.country        || '',
    params.authMethod     || 'email',
    params.hashedPassword || '',
    params.ts             || new Date().toISOString(),
  ]);

  return ContentService
    .createTextOutput(JSON.stringify({ success: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Progress tracking ─────────────────────────────────────────────

function getOrCreateProgressSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Progress');
  if (!sheet) {
    sheet = ss.insertSheet('Progress');
    sheet.getRange(1, 1, 1, 3).setValues([['Email', 'ProgressJSON', 'LastUpdated']]);
  }
  return sheet;
}

// Save progress — called via doPost (data too large for URL params)
function saveProgress(body) {
  const email = (body.email || '').toLowerCase().trim();
  if (!email) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: 'No email' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const sheet = getOrCreateProgressSheet();
  const rows = sheet.getDataRange().getValues();
  const rowIndex = rows.findIndex((r, i) => i > 0 && r[0] === email);
  const now = new Date().toISOString();
  const json = typeof body.data === 'string' ? body.data : JSON.stringify(body.data || {});

  if (rowIndex > -1) {
    sheet.getRange(rowIndex + 1, 2, 1, 2).setValues([[json, now]]);
  } else {
    sheet.appendRow([email, json, now]);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ success: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

// Load progress — called via doGet
function loadProgress(params) {
  const email = (params.email || '').toLowerCase().trim();
  if (!email) {
    return ContentService
      .createTextOutput(JSON.stringify({ found: false }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Progress');
  if (!sheet) {
    return ContentService
      .createTextOutput(JSON.stringify({ found: false }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const rows = sheet.getDataRange().getValues();
  const row = rows.find((r, i) => i > 0 && r[0] === email);
  if (!row) {
    return ContentService
      .createTextOutput(JSON.stringify({ found: false }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ found: true, data: row[1], lastUpdated: row[2] }))
    .setMimeType(ContentService.MimeType.JSON);
}

// Reset progress — called via doGet
function resetProgressGAS(params) {
  const email = (params.email || '').toLowerCase().trim();
  if (!email) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: 'No email' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Progress');
  if (!sheet) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const rows = sheet.getDataRange().getValues();
  const rowIndex = rows.findIndex((r, i) => i > 0 && r[0] === email);
  if (rowIndex > -1) sheet.deleteRow(rowIndex + 1);

  return ContentService
    .createTextOutput(JSON.stringify({ success: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Password reset tokens ─────────────────────────────────────────

function getOrCreateResetSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('ResetTokens');
  if (!sheet) {
    sheet = ss.insertSheet('ResetTokens');
    sheet.getRange(1, 1, 1, 3).setValues([['Email', 'OTP', 'ExpiresAt']]);
  }
  return sheet;
}

function storeResetToken(params) {
  if (params.secret !== getAdminSecret()) {
    return ContentService.createTextOutput(JSON.stringify({ error: 'Unauthorized' })).setMimeType(ContentService.MimeType.JSON);
  }
  const email = (params.email || '').toLowerCase().trim();
  if (!email || !params.otp || !params.expiresAt) {
    return ContentService.createTextOutput(JSON.stringify({ error: 'Missing fields' })).setMimeType(ContentService.MimeType.JSON);
  }
  const sheet = getOrCreateResetSheet();
  const rows  = sheet.getDataRange().getValues();
  const idx   = rows.findIndex((r, i) => i > 0 && r[0] === email);
  if (idx > -1) {
    sheet.getRange(idx + 1, 2, 1, 2).setValues([[params.otp, params.expiresAt]]);
  } else {
    sheet.appendRow([email, params.otp, params.expiresAt]);
  }
  // Send email via GAS MailApp
  try {
    MailApp.sendEmail({
      to: email,
      subject: 'askHanyong — your password reset code',
      htmlBody:
        '<div style="font-family:Inter,sans-serif;max-width:420px;margin:0 auto">' +
        '<h2 style="color:#0f1f3d">Password Reset</h2>' +
        '<p>Your 6-digit reset code is:</p>' +
        '<div style="font-size:36px;font-weight:700;letter-spacing:0.2em;color:#0f1f3d;background:#f0f4ff;border-radius:8px;padding:16px 24px;display:inline-block;margin:8px 0">' + params.otp + '</div>' +
        '<p style="color:#6b7280;font-size:13px">This code expires in 15 minutes. If you did not request a reset, you can ignore this email.</p>' +
        '<p style="color:#6b7280;font-size:12px">— HAN · askHanyong</p>' +
        '</div>',
    });
  } catch (mailErr) {
    // Email failure — still store token so user can retry
    Logger.log('Email send failed: ' + mailErr.message);
  }
  return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
}

function verifyResetToken(params) {
  if (params.secret !== getAdminSecret()) {
    return ContentService.createTextOutput(JSON.stringify({ error: 'Unauthorized' })).setMimeType(ContentService.MimeType.JSON);
  }
  const email = (params.email || '').toLowerCase().trim();
  const sheet = getOrCreateResetSheet();
  const rows  = sheet.getDataRange().getValues();
  const row   = rows.find((r, i) => i > 0 && r[0] === email);
  if (!row) return ContentService.createTextOutput(JSON.stringify({ valid: false, error: 'No reset code found. Please request a new one.' })).setMimeType(ContentService.MimeType.JSON);
  if (row[1] !== params.otp) return ContentService.createTextOutput(JSON.stringify({ valid: false, error: 'Incorrect code. Please check your email.' })).setMimeType(ContentService.MimeType.JSON);
  if (new Date() > new Date(row[2])) return ContentService.createTextOutput(JSON.stringify({ valid: false, error: 'Code has expired. Please request a new one.' })).setMimeType(ContentService.MimeType.JSON);
  // Clear the token
  const idx = rows.findIndex((r, i) => i > 0 && r[0] === email);
  if (idx > -1) sheet.deleteRow(idx + 1);
  return ContentService.createTextOutput(JSON.stringify({ valid: true })).setMimeType(ContentService.MimeType.JSON);
}

function updateUserPassword(params) {
  if (params.secret !== getAdminSecret()) {
    return ContentService.createTextOutput(JSON.stringify({ error: 'Unauthorized' })).setMimeType(ContentService.MimeType.JSON);
  }
  const email = (params.email || '').toLowerCase().trim();
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Users');
  if (!sheet) return ContentService.createTextOutput(JSON.stringify({ error: 'Users sheet not found' })).setMimeType(ContentService.MimeType.JSON);
  const rows = sheet.getDataRange().getValues();
  // Headers: Email(0) | Name(1) | Country(2) | AuthMethod(3) | HashedPassword(4) | Last Seen(5)
  const idx  = rows.findIndex((r, i) => i > 0 && r[0] === email);
  if (idx === -1) return ContentService.createTextOutput(JSON.stringify({ error: 'User not found' })).setMimeType(ContentService.MimeType.JSON);
  sheet.getRange(idx + 1, 5).setValue(params.hashedPassword);
  return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
}

// ── Get a user by email (for login verification) ─────────────────
// Returns user data including hashed password. Protected by admin secret.
function getUser(params) {
  if (params.secret !== getAdminSecret()) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: 'Unauthorized' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const email = (params.email || '').toLowerCase().trim();
  if (!email) {
    return ContentService
      .createTextOutput(JSON.stringify({ found: false }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Users');
  if (!sheet) {
    return ContentService
      .createTextOutput(JSON.stringify({ found: false }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const data = sheet.getDataRange().getValues();
  // Headers: Email(0) | Name(1) | Country(2) | AuthMethod(3) | HashedPassword(4) | Last Seen(5)
  const row = data.find((r, i) => i > 0 && r[0] === email);

  if (!row) {
    return ContentService
      .createTextOutput(JSON.stringify({ found: false }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService
    .createTextOutput(JSON.stringify({
      found:          true,
      email:          row[0],
      name:           row[1],
      country:        row[2],
      authMethod:     row[3],
      hashedPassword: row[4],
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ══════════════════════════════════════════════════════════════════
// ACCURACY EVALUATION SYSTEM
// ══════════════════════════════════════════════════════════════════

// Evaluation sheet headers:
// Question ID | Level | Topic | Subtopic | Marks | Difficulty |
// Pct | ScoreJSON | Reasoning | EvaluatedAt
const EVAL_HEADERS = [
  'Question ID', 'Level', 'Topic', 'Subtopic', 'Marks', 'Difficulty',
  'Pct', 'ScoreJSON', 'Reasoning', 'EvaluatedAt'
];

function getOrCreateEvalSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Evaluation');
  if (!sheet) {
    sheet = ss.insertSheet('Evaluation');
    sheet.getRange(1, 1, 1, EVAL_HEADERS.length).setValues([EVAL_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// ── Return Questions that have Gold Answer + Key Steps filled ─────
// Filters: level (optional), topic (optional), limit (optional, default 20)
function getEvalQuestions(params) {
  if (params.secret !== getAdminSecret()) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: 'Unauthorized' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Questions');
  if (!sheet) {
    return ContentService
      .createTextOutput(JSON.stringify({ questions: [] }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const rows    = sheet.getDataRange().getValues();
  const headers = rows[0];

  // Column indices (Questions sheet uses PARAM_TO_HEADER mapping)
  const col = (name) => headers.indexOf(name);
  const iId         = col('Question ID');
  const iLevel      = col('Level');
  const iTopic      = col('Topic');
  const iSubtopic   = col('Subtopic');
  const iMarks      = col('Marks');
  const iDifficulty = col('Difficulty');
  const iStatus     = col('Status');
  // Evaluation-specific columns — must be added manually to the sheet
  const iGoldAnswer = col('Gold Answer');
  const iKeySteps   = col('Key Steps');
  // The question text itself — stored as 'HAN Explanation' in some setups
  // but the actual question prompt is needed. Use 'Question Text' if present,
  // else fall back to the first non-ID column.
  const iQuestion   = col('Question Text') !== -1 ? col('Question Text') : col('HAN Explanation');

  const levelFilter = (params.level || '').trim();
  const topicFilter = (params.topic || '').trim().toLowerCase();
  const limit       = parseInt(params.limit || '20', 10);

  const questions = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[iId]) continue;
    // Only include rows with Gold Answer filled
    if (iGoldAnswer === -1 || !r[iGoldAnswer]) continue;

    // Apply optional filters
    if (levelFilter && r[iLevel] !== levelFilter) continue;
    if (topicFilter && (r[iTopic] || '').toLowerCase().indexOf(topicFilter) === -1) continue;
    // Skip non-active questions if Status column exists
    if (iStatus !== -1 && r[iStatus] && r[iStatus] !== 'Active' && r[iStatus] !== '') continue;

    questions.push({
      questionId: String(r[iId]),
      level:      r[iLevel]      || 'MAA HL',
      topic:      r[iTopic]      || '',
      subtopic:   r[iSubtopic]   || '',
      marks:      r[iMarks]      || '',
      difficulty: r[iDifficulty] || '',
      question:   r[iQuestion]   || '',
      goldAnswer: r[iGoldAnswer] || '',
      keySteps:   iKeySteps !== -1 ? (r[iKeySteps] || '') : '',
    });

    if (questions.length >= limit) break;
  }

  return ContentService
    .createTextOutput(JSON.stringify({ questions }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Save a single evaluation result to the Evaluation sheet ──────
function saveEvalResult(params) {
  if (params.secret !== getAdminSecret()) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: 'Unauthorized' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const sheet = getOrCreateEvalSheet();
  const rows  = sheet.getDataRange().getValues();
  // Find existing row for this questionId + level (to update rather than duplicate)
  const idx = rows.findIndex((r, i) => i > 0 && r[0] === params.questionId && r[1] === params.level);

  const newRow = [
    params.questionId  || '',
    params.level       || '',
    params.topic       || '',
    params.subtopic    || '',
    params.marks       || '',
    params.difficulty  || '',
    params.pct         || '0',
    params.scoreJson   || '{}',
    params.reasoning   || '',
    params.evaluatedAt || new Date().toISOString(),
  ];

  if (idx > -1) {
    sheet.getRange(idx + 1, 1, 1, newRow.length).setValues([newRow]);
  } else {
    sheet.appendRow(newRow);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ success: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Aggregate accuracy metrics for the public badge ──────────────
// Returns: overall %, by level (HL/SL), by topic, question count, last evaluated date
function getAccuracyMetrics(params) {
  // Public endpoint — no secret required, but accept secret for admin parity
  const sheet = getOrCreateEvalSheet();
  const rows  = sheet.getDataRange().getValues();

  if (rows.length <= 1) {
    return ContentService
      .createTextOutput(JSON.stringify({
        overall: null,
        questionCount: 0,
        byLevel: {},
        byTopic: {},
        lastEvaluated: null,
        message: 'No evaluation data yet. Run an evaluation first.',
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const headers    = rows[0];
  const iId        = headers.indexOf('Question ID');
  const iLevel     = headers.indexOf('Level');
  const iTopic     = headers.indexOf('Topic');
  const iPct       = headers.indexOf('Pct');
  const iScoreJson = headers.indexOf('ScoreJSON');
  const iDate      = headers.indexOf('EvaluatedAt');

  const DIM_MAXES = { final_answer: 2, method: 2, mark_scheme: 2, ib_presentation: 1, examiner_note: 1 };
  const allPcts      = [];
  const levelBuckets = {};
  const topicBuckets = {};
  const dimBuckets   = { final_answer: [], method: [], mark_scheme: [], ib_presentation: [], examiner_note: [] };
  let lastEvaluated  = null;

  for (let i = 1; i < rows.length; i++) {
    const r    = rows[i];
    if (!r[iId]) continue;
    const pct   = parseInt(r[iPct] || '0', 10);
    const level = r[iLevel] || 'MAA HL';
    const topic = r[iTopic] || 'Other';
    const dated = r[iDate]  || '';

    allPcts.push(pct);

    if (!levelBuckets[level]) levelBuckets[level] = [];
    levelBuckets[level].push(pct);

    if (!topicBuckets[topic]) topicBuckets[topic] = [];
    topicBuckets[topic].push(pct);

    if (!lastEvaluated || dated > lastEvaluated) lastEvaluated = dated;

    // Parse per-dimension scores from ScoreJSON column
    if (iScoreJson >= 0 && r[iScoreJson]) {
      try {
        const scores = JSON.parse(r[iScoreJson]);
        Object.keys(DIM_MAXES).forEach(dim => {
          if (scores[dim] !== undefined && scores[dim] !== null) {
            dimBuckets[dim].push(Number(scores[dim]));
          }
        });
      } catch(e) {}
    }
  }

  const avg    = (arr) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10 : null;
  const avgPct = (arr) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

  const byLevel = {};
  for (const [k, v] of Object.entries(levelBuckets)) byLevel[k] = { avg: avgPct(v), count: v.length };

  const byTopic = {};
  for (const [k, v] of Object.entries(topicBuckets)) byTopic[k] = { avg: avgPct(v), count: v.length };

  const byDimension = {};
  for (const [dim, max] of Object.entries(DIM_MAXES)) {
    const vals = dimBuckets[dim];
    byDimension[dim] = {
      avg:   avg(vals),
      max,
      pct:   vals.length ? Math.round(avg(vals) / max * 100) : null,
      count: vals.length,
    };
  }

  return ContentService
    .createTextOutput(JSON.stringify({
      overall:       avgPct(allPcts),
      questionCount: allPcts.length,
      byLevel,
      byTopic,
      byDimension,
      lastEvaluated,
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Aggregate exam trend data from the Questions sheet ────────────
// Returns topic × marks statistics across years/sessions/levels.
// Used for the "What to Focus On" trend analysis section.
function getTrendData(params) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Questions');
  if (!sheet) {
    return ContentService
      .createTextOutput(JSON.stringify({ byTopic: {}, byYear: {}, totalMarks: 0, totalQuestions: 0 }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const rows    = sheet.getDataRange().getValues();
  const headers = rows[0];
  const col     = (name) => headers.indexOf(name);

  const iId       = col('Question ID');
  const iLevel    = col('Level');
  const iYear     = col('Year');
  const iSession  = col('Session');
  const iTopic    = col('Topic');
  const iSubtopic = col('Subtopic');
  const iMarks    = col('Marks');
  const iStatus   = col('Status');
  const iPaper    = col('Paper');

  const levelFilter = (params.level || '').trim();

  // byTopic: { topic: { totalMarks, questionCount, byYear: { year: marks }, byLevel: { level: marks } } }
  // byYear:  { year:  { totalMarks, questionCount, byTopic: { topic: marks } } }
  const byTopic      = {};
  const byYear       = {};
  let   totalMarks   = 0;
  let   totalQuestions = 0;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[iId]) continue;
    // Skip inactive questions if Status column exists
    if (iStatus !== -1 && r[iStatus] && r[iStatus] !== 'Active' && r[iStatus] !== '') continue;

    const level   = String(r[iLevel]   || '');
    const topic   = String(r[iTopic]   || 'Other');
    const year    = String(r[iYear]    || '');
    const session = String(r[iSession] || '');
    const marks   = parseInt(r[iMarks] || '0', 10) || 0;
    const yearKey = year && session ? year + ' ' + session : year;

    if (levelFilter && level !== levelFilter) continue;

    totalMarks    += marks;
    totalQuestions++;

    // byTopic aggregation
    if (!byTopic[topic]) byTopic[topic] = { totalMarks: 0, questionCount: 0, byYear: {}, byLevel: {} };
    byTopic[topic].totalMarks    += marks;
    byTopic[topic].questionCount++;
    if (yearKey) byTopic[topic].byYear[yearKey]   = (byTopic[topic].byYear[yearKey]   || 0) + marks;
    if (level)   byTopic[topic].byLevel[level]    = (byTopic[topic].byLevel[level]    || 0) + marks;

    // byYear aggregation
    if (yearKey) {
      if (!byYear[yearKey]) byYear[yearKey] = { totalMarks: 0, questionCount: 0, byTopic: {} };
      byYear[yearKey].totalMarks    += marks;
      byYear[yearKey].questionCount++;
      byYear[yearKey].byTopic[topic] = (byYear[yearKey].byTopic[topic] || 0) + marks;
    }
  }

  return ContentService
    .createTextOutput(JSON.stringify({ byTopic, byYear, totalMarks, totalQuestions }))
    .setMimeType(ContentService.MimeType.JSON);
}
