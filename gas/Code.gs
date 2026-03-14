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

  if (action === 'addQuestion')     return addQuestion(e.parameter);
  if (action === 'addPremiumUser')  return addPremiumUser(e.parameter);
  if (action === 'checkPremium')    return checkPremium(e.parameter);
  if (action === 'saveUser')        return saveUser(e.parameter);
  if (action === 'registerUser')    return registerUser(e.parameter);
  if (action === 'getUser')         return getUser(e.parameter);

  return ContentService
    .createTextOutput('HAN Admin GAS — OK')
    .setMimeType(ContentService.MimeType.TEXT);
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

// ── Save / update a Google OAuth user in the Users sheet ─────────
// Called by saveUserToSheet() on frontend after Google sign-in.
// Columns: Email | Name | Country | AuthMethod | Last Seen
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
