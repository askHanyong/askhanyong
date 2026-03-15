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

  return ContentService
    .createTextOutput('HAN Admin GAS — OK')
    .setMimeType(ContentService.MimeType.TEXT);
}

// Progress data sent as JSON body — only save needs POST due to data size
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action === 'saveProgress') return saveProgress(body);
  } catch (err) {}
  return ContentService
    .createTextOutput(JSON.stringify({ error: 'Invalid request' }))
    .setMimeType(ContentService.MimeType.JSON);
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
