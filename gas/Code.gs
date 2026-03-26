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

  if (action === 'addQuestion')             return addQuestion(e.parameter);
  if (action === 'addPremiumUser')          return addPremiumUser(e.parameter);
  if (action === 'checkPremium')            return checkPremium(e.parameter);
  if (action === 'cancelPremiumUser')       return cancelPremiumUser(e.parameter);
  if (action === 'updateSubscriptionStatus') return updateSubscriptionStatus(e.parameter);
  if (action === 'getSubscriptionInfo')     return getSubscriptionInfo(e.parameter);
  if (action === 'saveUser')                return saveUser(e.parameter);
  if (action === 'registerUser')            return registerUser(e.parameter);
  if (action === 'getUser')                 return getUser(e.parameter);
  if (action === 'loadProgress')            return loadProgress(e.parameter);
  if (action === 'resetProgress')           return resetProgressGAS(e.parameter);
  if (action === 'storeResetToken')         return storeResetToken(e.parameter);
  if (action === 'verifyResetToken')        return verifyResetToken(e.parameter);
  if (action === 'updateUserPassword')      return updateUserPassword(e.parameter);
  if (action === 'getEvalQuestions')        return getEvalQuestions(e.parameter);
  if (action === 'saveEvalResult')          return saveEvalResult(e.parameter);
  if (action === 'getAccuracyMetrics')      return getAccuracyMetrics(e.parameter);
  if (action === 'getTrendData')            return getTrendData(e.parameter);
  if (action === 'checkScriptQuota')        return checkScriptQuota(e.parameter);
  if (action === 'getScriptReviewQueue')    return getScriptReviewQueue(e.parameter);
  if (action === 'getScriptMarkingAccuracy') return getScriptMarkingAccuracy(e.parameter);

  return ContentService
    .createTextOutput('HAN Admin GAS — OK')
    .setMimeType(ContentService.MimeType.TEXT);
}

// Progress data sent as JSON body — only save needs POST due to data size
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action === 'saveProgress')           return saveProgress(body);
    if (body.action === 'saveFeedback')           return saveFeedback(body);
    if (body.action === 'sendLowConfidenceAlert') return sendLowConfidenceAlert(body);
    if (body.action === 'recordScriptSubmission') return recordScriptSubmission(body);
    if (body.action === 'markScriptDownloaded')   return markScriptDownloaded(body);
    if (body.action === 'sendScriptReviewAlert')  return sendScriptReviewAlert(body);
    if (body.action === 'saveReviewCorrection')   return saveReviewCorrection(body);
    return ContentService
      .createTextOutput(JSON.stringify({ error: 'Unknown action: ' + (body.action || 'none') }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.message || 'Invalid request' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── Send low-confidence alert email to the script owner ──────────
// Called by evaluate.js after a batch run when any question scores ≤ 4/8.
// Emails a summary with question IDs, topics, scores, and reasoning.
function sendLowConfidenceAlert(body) {
  if (body.secret !== getAdminSecret()) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: 'Unauthorized' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const flagged = Array.isArray(body.flagged) ? body.flagged : [];
  if (flagged.length === 0) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, skipped: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const ownerEmail = Session.getEffectiveUser().getEmail();
  const runId      = body.runId || 'unknown';
  const total      = body.total || flagged.length;

  // Build email body
  const lines = [
    'HAN Accuracy Alert — ' + flagged.length + ' low-confidence response(s) flagged',
    'Run ID: ' + runId,
    'Questions in this run: ' + total,
    '',
    '── Flagged Questions (' + flagged.length + ') ──',
    '',
  ];

  flagged.forEach(function(q, i) {
    lines.push((i + 1) + '. ' + q.questionId + ' · ' + (q.level || '') + ' · ' + (q.topic || ''));
    lines.push('   Overall: ' + q.pct + '% | Exam-safe: ' + q.examSafePct + '%');
    if (q.reasoning) lines.push('   Judge: ' + q.reasoning);
    lines.push('');
  });

  lines.push('Review these in the Evaluation sheet and consider updating the Questions bank or system prompt.');
  lines.push('');
  lines.push('— HAN Admin · askhanyong.com');

  GmailApp.sendEmail(
    ownerEmail,
    'HAN: ' + flagged.length + ' low-confidence question(s) flagged (run ' + runId + ')',
    lines.join('\n'),
    { name: 'HAN Accuracy Monitor' }
  );

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, alertSentTo: ownerEmail, flaggedCount: flagged.length }))
    .setMimeType(ContentService.MimeType.JSON);
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

// ── Premium sheet column indices (0-based) ────────────────────────
// Email | Name | Stripe Customer ID | Stripe Subscription ID | Status | Graduation Month | Graduation Year | Date Added
const PREMIUM_COLS = {
  email:           0,
  name:            1,
  customerId:      2,
  subscriptionId:  3,
  status:          4,
  gradMonth:       5,
  gradYear:        6,
  dateAdded:       7,
};
const PREMIUM_HEADERS = ['Email', 'Name', 'Stripe Customer ID', 'Stripe Subscription ID', 'Status', 'Graduation Month', 'Graduation Year', 'Date Added'];

function ensurePremiumSheet(ss) {
  let sheet = ss.getSheetByName('Premium');
  if (!sheet) {
    sheet = ss.insertSheet('Premium');
    sheet.getRange(1, 1, 1, PREMIUM_HEADERS.length).setValues([PREMIUM_HEADERS]);
  }
  return sheet;
}

// ── Record a paying subscriber in the Premium sheet ───────────────
// Called by stripe-webhook after checkout.session.completed.
// Cols: Email | Name | Customer ID | Subscription ID | Status | Grad Month | Grad Year | Date Added
function addPremiumUser(params) {
  if (params.secret !== getAdminSecret()) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: 'Unauthorized' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ensurePremiumSheet(ss);

  const data = sheet.getDataRange().getValues();

  // Check if email already has a row
  let existingRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][PREMIUM_COLS.email] === params.email) {
      existingRow = i + 1; // 1-indexed sheet row
      break;
    }
  }

  if (existingRow > 0) {
    // Update existing row with new subscription details
    sheet.getRange(existingRow, PREMIUM_COLS.subscriptionId + 1).setValue(params.subscriptionId || '');
    sheet.getRange(existingRow, PREMIUM_COLS.status       + 1).setValue(params.status || 'active');
    sheet.getRange(existingRow, PREMIUM_COLS.gradMonth    + 1).setValue(params.graduationMonth || '');
    sheet.getRange(existingRow, PREMIUM_COLS.gradYear     + 1).setValue(params.graduationYear  || '');
  } else {
    sheet.appendRow([
      params.email           || '',
      params.name            || '',
      params.customerId      || '',
      params.subscriptionId  || '',
      params.status          || 'active',
      params.graduationMonth || '',
      params.graduationYear  || '',
      new Date().toISOString(),
    ]);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ success: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Check whether an email has an active subscription ────────────
// Returns { premium: bool, status?, graduationMonth?, graduationYear? }
function checkPremium(params) {
  const email = (params.email || '').toLowerCase().trim();
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

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[PREMIUM_COLS.email] === email) {
      const status = row[PREMIUM_COLS.status] || 'active';
      // Active if status is 'active' or pending cancellation (still within paid period)
      const isPremium = (status === 'active' || status === 'cancel_at_period_end');
      return ContentService
        .createTextOutput(JSON.stringify({
          premium:         isPremium,
          status,
          graduationMonth: row[PREMIUM_COLS.gradMonth] || '',
          graduationYear:  row[PREMIUM_COLS.gradYear]  || '',
          subscriptionId:  row[PREMIUM_COLS.subscriptionId] || '',
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  return ContentService
    .createTextOutput(JSON.stringify({ premium: false }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Get subscription info for a user (used by cancel-subscription) ─
function getSubscriptionInfo(params) {
  if (params.secret !== getAdminSecret()) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: 'Unauthorized' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const email = (params.email || '').toLowerCase().trim();
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Premium');
  if (!sheet) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: 'No Premium sheet' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[PREMIUM_COLS.email] === email) {
      return ContentService
        .createTextOutput(JSON.stringify({
          subscriptionId:  row[PREMIUM_COLS.subscriptionId] || '',
          status:          row[PREMIUM_COLS.status]         || '',
          graduationMonth: row[PREMIUM_COLS.gradMonth]      || '',
          graduationYear:  row[PREMIUM_COLS.gradYear]       || '',
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  return ContentService
    .createTextOutput(JSON.stringify({ error: 'User not found' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Mark a subscription as cancelled ────────────────────────────
// Called by stripe-webhook on customer.subscription.deleted.
// Can look up by email OR by customerId/subscriptionId.
function cancelPremiumUser(params) {
  if (params.secret !== getAdminSecret()) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: 'Unauthorized' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Premium');
  if (!sheet) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: true, note: 'No Premium sheet' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const email      = (params.email      || '').toLowerCase().trim();
  const customerId = (params.customerId || '').trim();
  const subId      = (params.subscriptionId || '').trim();

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const row        = data[i];
    const rowEmail   = row[PREMIUM_COLS.email];
    const rowCustId  = row[PREMIUM_COLS.customerId];
    const rowSubId   = row[PREMIUM_COLS.subscriptionId];

    const matched = (email && rowEmail === email)
      || (subId      && rowSubId  === subId)
      || (customerId && rowCustId === customerId);

    if (matched) {
      sheet.getRange(i + 1, PREMIUM_COLS.status + 1).setValue('cancelled');
      return ContentService
        .createTextOutput(JSON.stringify({ success: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  return ContentService
    .createTextOutput(JSON.stringify({ success: true, note: 'Row not found' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Update subscription status ────────────────────────────────────
// Called by stripe-webhook on invoice.paid or subscription.updated.
function updateSubscriptionStatus(params) {
  if (params.secret !== getAdminSecret()) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: 'Unauthorized' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Premium');
  if (!sheet) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: true, note: 'No Premium sheet' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const email      = (params.email      || '').toLowerCase().trim();
  const customerId = (params.customerId || '').trim();
  const subId      = (params.subscriptionId || '').trim();
  const newStatus  = params.status || 'active';

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const row       = data[i];
    const rowEmail  = row[PREMIUM_COLS.email];
    const rowCustId = row[PREMIUM_COLS.customerId];
    const rowSubId  = row[PREMIUM_COLS.subscriptionId];

    const matched = (email && rowEmail === email)
      || (subId      && rowSubId  === subId)
      || (customerId && rowCustId === customerId);

    if (matched) {
      sheet.getRange(i + 1, PREMIUM_COLS.status + 1).setValue(newStatus);
      if (subId && !rowSubId) {
        sheet.getRange(i + 1, PREMIUM_COLS.subscriptionId + 1).setValue(subId);
      }
      return ContentService
        .createTextOutput(JSON.stringify({ success: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  return ContentService
    .createTextOutput(JSON.stringify({ success: true, note: 'Row not found' }))
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
// Pct | ExamSafePct | LowConfidence | ScoreJSON | Reasoning | EvaluatedAt
//
// ExamSafePct  = (final_answer + method + mark_scheme) / 6 × 100
//                The "exam-safe" composite: would an IB examiner award full marks?
// LowConfidence = true when total score ≤ 4/8 — flagged for human review
const EVAL_HEADERS = [
  'Question ID', 'Level', 'Topic', 'Subtopic', 'Marks', 'Difficulty',
  'Pct', 'ExamSafePct', 'LowConfidence', 'ScoreJSON', 'Reasoning', 'EvaluatedAt'
];

// EvalHistory sheet — append-only archive of every evaluation run.
// Used to track improvement over time and powers the marketing repository.
const EVAL_HISTORY_HEADERS = [
  'RunId', 'Question ID', 'Level', 'Topic', 'Subtopic', 'Marks', 'Difficulty',
  'Pct', 'ExamSafePct', 'LowConfidence', 'ScoreJSON', 'Reasoning', 'EvaluatedAt'
];

function getOrCreateEvalSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Evaluation');
  if (!sheet) {
    sheet = ss.insertSheet('Evaluation');
    sheet.getRange(1, 1, 1, EVAL_HEADERS.length).setValues([EVAL_HEADERS]);
    sheet.setFrozenRows(1);
  } else {
    // Migrate: add any columns that exist in EVAL_HEADERS but not in the sheet
    const existing = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    EVAL_HEADERS.forEach(function(h) {
      if (existing.indexOf(h) === -1) {
        const nextCol = sheet.getLastColumn() + 1;
        sheet.getRange(1, nextCol).setValue(h);
        existing.push(h);
      }
    });
  }
  return sheet;
}

function getOrCreateEvalHistorySheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('EvalHistory');
  if (!sheet) {
    sheet = ss.insertSheet('EvalHistory');
    sheet.getRange(1, 1, 1, EVAL_HISTORY_HEADERS.length).setValues([EVAL_HISTORY_HEADERS]);
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
// Also appends to EvalHistory (append-only marketing repository).
function saveEvalResult(params) {
  if (params.secret !== getAdminSecret()) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: 'Unauthorized' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const sheet   = getOrCreateEvalSheet();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const col     = function(name) { return headers.indexOf(name); };

  // Build a full-width row array keyed by header position
  const ncols  = headers.length;
  const newRow = new Array(ncols).fill('');

  const now = params.evaluatedAt || new Date().toISOString();
  const fieldMap = {
    'Question ID':   params.questionId  || '',
    'Level':         params.level       || '',
    'Topic':         params.topic       || '',
    'Subtopic':      params.subtopic    || '',
    'Marks':         params.marks       || '',
    'Difficulty':    params.difficulty  || '',
    'Pct':           params.pct         || '0',
    'ExamSafePct':   params.examSafePct || '0',
    'LowConfidence': params.lowConfidence || 'false',
    'ScoreJSON':     params.scoreJson   || '{}',
    'Reasoning':     params.reasoning   || '',
    'EvaluatedAt':   now,
  };

  for (const [header, value] of Object.entries(fieldMap)) {
    const c = col(header);
    if (c !== -1) newRow[c] = value;
  }

  const rows = sheet.getDataRange().getValues();
  // Update existing row (same questionId + level) or append
  const idx = rows.findIndex(function(r, i) {
    return i > 0 && r[col('Question ID')] === params.questionId && r[col('Level')] === params.level;
  });

  if (idx > -1) {
    sheet.getRange(idx + 1, 1, 1, ncols).setValues([newRow]);
  } else {
    sheet.appendRow(newRow);
  }

  // ── Append to EvalHistory (never overwrite — full run archive) ──
  const historySheet = getOrCreateEvalHistorySheet();
  const histRow = [
    params.runId       || '',
    params.questionId  || '',
    params.level       || '',
    params.topic       || '',
    params.subtopic    || '',
    params.marks       || '',
    params.difficulty  || '',
    params.pct         || '0',
    params.examSafePct || '0',
    params.lowConfidence || 'false',
    params.scoreJson   || '{}',
    params.reasoning   || '',
    now,
  ];
  historySheet.appendRow(histRow);

  return ContentService
    .createTextOutput(JSON.stringify({ success: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Aggregate accuracy metrics for the public badge ──────────────
// Returns: overall %, exam-safe accuracy (marketing stat), by level/topic/dimension,
//          question count, total evaluations (from EvalHistory), last evaluated date.
//
// "Exam-safe" definition: ExamSafePct ≥ 83% — i.e. ≥5/6 on the three IB mark-bearing
// dimensions (final_answer + method + mark_scheme). This is the defensible marketing stat:
// "X% of questions solved to exam-safe standard, based on N+ questions tested."
function getAccuracyMetrics(params) {
  // Public endpoint — no secret required
  const sheet = getOrCreateEvalSheet();
  const rows  = sheet.getDataRange().getValues();

  if (rows.length <= 1) {
    return ContentService
      .createTextOutput(JSON.stringify({
        overall: null,
        examSafeAccuracy: null,
        examSafeCount: 0,
        questionCount: 0,
        totalEvaluations: 0,
        byLevel: {},
        byTopic: {},
        byDimension: {},
        lastEvaluated: null,
        message: 'No evaluation data yet. Run an evaluation first.',
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const headers        = rows[0];
  const iId            = headers.indexOf('Question ID');
  const iLevel         = headers.indexOf('Level');
  const iTopic         = headers.indexOf('Topic');
  const iPct           = headers.indexOf('Pct');
  const iExamSafePct   = headers.indexOf('ExamSafePct');
  const iLowConfidence = headers.indexOf('LowConfidence');
  const iScoreJson     = headers.indexOf('ScoreJSON');
  const iDate          = headers.indexOf('EvaluatedAt');

  const DIM_MAXES = { final_answer: 2, method: 2, mark_scheme: 2, ib_presentation: 1, examiner_note: 1 };
  const allPcts          = [];
  const allExamSafePcts  = [];
  const levelBuckets     = {};
  const topicBuckets     = {};
  const dimBuckets       = { final_answer: [], method: [], mark_scheme: [], ib_presentation: [], examiner_note: [] };
  let lastEvaluated      = null;
  let examSafeCount      = 0;
  let lowConfidenceCount = 0;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[iId]) continue;

    const pct          = parseInt(r[iPct] || '0', 10);
    const examSafePct  = iExamSafePct >= 0 ? parseInt(r[iExamSafePct] || '0', 10) : Math.round(pct * 6 / 8); // fallback estimate
    const level        = r[iLevel] || 'MAA HL';
    const topic        = r[iTopic] || 'Other';
    const dated        = r[iDate]  || '';
    const isLowConf    = iLowConfidence >= 0 && r[iLowConfidence] === 'true';

    allPcts.push(pct);
    allExamSafePcts.push(examSafePct);

    if (examSafePct >= 83) examSafeCount++;
    if (isLowConf) lowConfidenceCount++;

    if (!levelBuckets[level]) levelBuckets[level] = { pcts: [], examSafePcts: [], examSafeCount: 0 };
    levelBuckets[level].pcts.push(pct);
    levelBuckets[level].examSafePcts.push(examSafePct);
    if (examSafePct >= 83) levelBuckets[level].examSafeCount++;

    if (!topicBuckets[topic]) topicBuckets[topic] = { pcts: [], examSafePcts: [], examSafeCount: 0 };
    topicBuckets[topic].pcts.push(pct);
    topicBuckets[topic].examSafePcts.push(examSafePct);
    if (examSafePct >= 83) topicBuckets[topic].examSafeCount++;

    if (!lastEvaluated || dated > lastEvaluated) lastEvaluated = dated;

    // Per-dimension breakdown from ScoreJSON
    if (iScoreJson >= 0 && r[iScoreJson]) {
      try {
        const scores = JSON.parse(r[iScoreJson]);
        Object.keys(DIM_MAXES).forEach(function(dim) {
          if (scores[dim] !== undefined && scores[dim] !== null) {
            dimBuckets[dim].push(Number(scores[dim]));
          }
        });
      } catch(e) {}
    }
  }

  const avg    = function(arr) { return arr.length ? Math.round(arr.reduce(function(a, b) { return a + b; }, 0) / arr.length * 10) / 10 : null; };
  const avgPct = function(arr) { return arr.length ? Math.round(arr.reduce(function(a, b) { return a + b; }, 0) / arr.length) : null; };

  const byLevel = {};
  for (const k in levelBuckets) {
    const v = levelBuckets[k];
    byLevel[k] = {
      avg:              avgPct(v.pcts),
      examSafeAvg:      avgPct(v.examSafePcts),
      examSafeAccuracy: v.pcts.length ? Math.round(v.examSafeCount / v.pcts.length * 100) : null,
      count:            v.pcts.length,
      examSafeCount:    v.examSafeCount,
    };
  }

  const byTopic = {};
  for (const k in topicBuckets) {
    const v = topicBuckets[k];
    byTopic[k] = {
      avg:              avgPct(v.pcts),
      examSafeAvg:      avgPct(v.examSafePcts),
      examSafeAccuracy: v.pcts.length ? Math.round(v.examSafeCount / v.pcts.length * 100) : null,
      count:            v.pcts.length,
      examSafeCount:    v.examSafeCount,
    };
  }

  const byDimension = {};
  for (const dim in DIM_MAXES) {
    const max  = DIM_MAXES[dim];
    const vals = dimBuckets[dim];
    byDimension[dim] = {
      avg:   avg(vals),
      max,
      pct:   vals.length ? Math.round(avg(vals) / max * 100) : null,
      count: vals.length,
    };
  }

  // Count total evaluations ever run (from EvalHistory — the marketing repository)
  let totalEvaluations = allPcts.length; // fallback = same as questionCount
  try {
    const histSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('EvalHistory');
    if (histSheet && histSheet.getLastRow() > 1) {
      totalEvaluations = histSheet.getLastRow() - 1; // exclude header
    }
  } catch(e) {}

  // examSafeAccuracy: % of unique questions passing exam-safe threshold (the marketing number)
  const examSafeAccuracy = allPcts.length ? Math.round(examSafeCount / allPcts.length * 100) : null;

  return ContentService
    .createTextOutput(JSON.stringify({
      overall:          avgPct(allPcts),
      examSafeAccuracy,          // Marketing stat: "X% exam-safe"
      examSafeCount,             // Count of passing questions
      questionCount:    allPcts.length,     // Unique questions evaluated (for "based on N+ questions")
      totalEvaluations,          // All-time evaluation count (from EvalHistory)
      lowConfidenceCount,        // Questions flagged for human review
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

// ════════════════════════════════════════════════════════════════
// SCRIPT MARKING — Student Paper Submissions
// Sheet: "ScriptSubmissions"
// Cols:  script_id | email | paper_info | result_json | confidence |
//        needs_review | review_corrections | reviewed_by | reviewed_at |
//        downloaded_at | expires_at | created_at
// ════════════════════════════════════════════════════════════════

var SCRIPT_COL = {
  scriptId:           1,
  email:              2,
  paperInfo:          3,
  resultJson:         4,
  confidence:         5,
  needsReview:        6,
  reviewCorrections:  7,
  reviewedBy:         8,
  reviewedAt:         9,
  downloadedAt:       10,
  expiresAt:          11,
  createdAt:          12,
};

function getScriptSheet_() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('ScriptSubmissions');
  if (!sheet) {
    sheet = ss.insertSheet('ScriptSubmissions');
    sheet.appendRow([
      'script_id', 'email', 'paper_info', 'result_json', 'confidence',
      'needs_review', 'review_corrections', 'reviewed_by', 'reviewed_at',
      'downloaded_at', 'expires_at', 'created_at',
    ]);
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(4, 600);
    sheet.setColumnWidth(7, 400);
  }
  return sheet;
}

// ── Check quota: returns remaining count and isPremium flag ───────
function checkScriptQuota(p) {
  if (p.secret !== getAdminSecret()) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: 'Unauthorized' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var email  = (p.email  || '').toLowerCase().trim();
  var month  = (p.month  || '').trim();        // "YYYY-MM"
  var LIMIT  = 3;

  if (!email || !month) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: 'email and month required' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Check premium status
  var premRes = checkPremium({ email: email, secret: p.secret });
  var premData;
  try { premData = JSON.parse(premRes.getContent()); } catch(e) { premData = {}; }
  var isPremium = (premData.status === 'active' || premData.status === 'cancel_at_period_end');

  if (!isPremium) {
    return ContentService
      .createTextOutput(JSON.stringify({ remaining: 0, isPremium: false, used: 0, limit: 0 }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Count submissions for this email + month
  var sheet = getScriptSheet_();
  var data  = sheet.getDataRange().getValues();
  var used  = 0;
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var rowEmail   = String(row[SCRIPT_COL.email - 1]      || '').toLowerCase().trim();
    var rowCreated = String(row[SCRIPT_COL.createdAt - 1]  || '');
    if (rowEmail === email && rowCreated.startsWith(month)) {
      used++;
    }
  }

  var remaining = Math.max(0, LIMIT - used);
  return ContentService
    .createTextOutput(JSON.stringify({ remaining: remaining, isPremium: true, used: used, limit: LIMIT }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Record a new script submission ────────────────────────────────
function recordScriptSubmission(body) {
  if (body.secret !== getAdminSecret()) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: 'Unauthorized' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var sheet = getScriptSheet_();
  var now   = new Date().toISOString();
  var exp   = body.expiresAt ? new Date(body.expiresAt).toISOString() : '';

  sheet.appendRow([
    body.scriptId        || '',
    (body.email          || '').toLowerCase().trim(),
    body.paperInfo       || '{}',
    body.result          || '{}',
    body.confidence      != null ? body.confidence : 1,
    body.needsReview     ? 'yes' : 'no',
    '',   // reviewCorrections — empty until reviewed
    '',   // reviewedBy
    '',   // reviewedAt
    '',   // downloadedAt
    exp,
    now,
  ]);

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Mark script as downloaded (called from client after PDF save) ─
function markScriptDownloaded(body) {
  if (body.secret !== getAdminSecret()) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: 'Unauthorized' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var sheet    = getScriptSheet_();
  var data     = sheet.getDataRange().getValues();
  var scriptId = (body.scriptId || '').trim();

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][SCRIPT_COL.scriptId - 1]).trim() === scriptId) {
      sheet.getRange(i + 1, SCRIPT_COL.downloadedAt).setValue(new Date().toISOString());
      return ContentService
        .createTextOutput(JSON.stringify({ ok: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  return ContentService
    .createTextOutput(JSON.stringify({ ok: false, error: 'Script not found' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Send HITL review alert email ──────────────────────────────────
function sendScriptReviewAlert(body) {
  if (body.secret !== getAdminSecret()) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: 'Unauthorized' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var ownerEmail = Session.getEffectiveUser().getEmail();
  var paperInfo  = '';
  try { var pi = JSON.parse(body.paperInfo || '{}'); paperInfo = [pi.level, pi.paper, pi.year, pi.session].filter(Boolean).join(' · '); } catch(e) {}

  var subject = 'HAN Script Review Needed — ' + body.scriptId;
  var text = [
    'A student script has been marked with low confidence and needs your review.',
    '',
    'Script ID:   ' + body.scriptId,
    'Student:     ' + body.email,
    'Paper:       ' + (paperInfo || 'Unknown'),
    'AI Score:    ' + body.total + '/' + body.maxTotal,
    'Confidence:  ' + Math.round((body.confidence || 0) * 100) + '%',
    '',
    'Please review this script in the ScriptSubmissions sheet and record any corrections.',
    'Use the saveReviewCorrection action to submit your revised marks.',
    '',
    '— HAN Admin · askhanyong.com',
  ].join('\n');

  GmailApp.sendEmail(ownerEmail, subject, text, { name: 'HAN Script Reviewer' });

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Retrieve scripts pending review (for admin UI) ────────────────
function getScriptReviewQueue(p) {
  if (p.secret !== getAdminSecret()) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: 'Unauthorized' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var sheet = getScriptSheet_();
  var data  = sheet.getDataRange().getValues();
  var queue = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (String(row[SCRIPT_COL.needsReview - 1]).toLowerCase() === 'yes' &&
        !String(row[SCRIPT_COL.reviewedAt - 1]).trim()) {
      queue.push({
        scriptId:   row[SCRIPT_COL.scriptId - 1],
        email:      row[SCRIPT_COL.email - 1],
        paperInfo:  row[SCRIPT_COL.paperInfo - 1],
        confidence: row[SCRIPT_COL.confidence - 1],
        createdAt:  row[SCRIPT_COL.createdAt - 1],
      });
    }
  }

  return ContentService
    .createTextOutput(JSON.stringify({ queue: queue }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Admin saves review corrections for a script ───────────────────
// corrections: { questions: [{ number, parts: [{ part, awarded }] }] }
// Also used to build the accuracy score.
function saveReviewCorrection(body) {
  if (body.secret !== getAdminSecret()) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: 'Unauthorized' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var sheet    = getScriptSheet_();
  var data     = sheet.getDataRange().getValues();
  var scriptId = (body.scriptId || '').trim();

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][SCRIPT_COL.scriptId - 1]).trim() !== scriptId) continue;

    var aiResult = {};
    try { aiResult = JSON.parse(String(data[i][SCRIPT_COL.resultJson - 1]) || '{}'); } catch(e) {}

    // Compute accuracy: compare AI-awarded marks vs human corrections
    var aiCorrect = 0, total = 0;
    var corrections = body.corrections || {};
    if (Array.isArray(corrections.questions) && Array.isArray(aiResult.questions)) {
      corrections.questions.forEach(function(corQ) {
        var aiQ = aiResult.questions.find(function(q) { return q.number === corQ.number; });
        if (!aiQ) return;
        (corQ.parts || []).forEach(function(corP) {
          var aiP = (aiQ.parts || []).find(function(p) { return p.part === corP.part; });
          if (!aiP) return;
          total++;
          if (aiP.awarded === corP.awarded) aiCorrect++;
        });
      });
    }

    var accuracy = total > 0 ? Math.round((aiCorrect / total) * 100) : null;

    sheet.getRange(i + 1, SCRIPT_COL.reviewCorrections).setValue(JSON.stringify(corrections));
    sheet.getRange(i + 1, SCRIPT_COL.reviewedBy).setValue(body.reviewedBy || 'admin');
    sheet.getRange(i + 1, SCRIPT_COL.reviewedAt).setValue(new Date().toISOString());

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, accuracy: accuracy, aiCorrect: aiCorrect, total: total }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ ok: false, error: 'Script not found' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Overall script-marking accuracy metrics (for accuracy dashboard) ─
// Returns { totalReviewed, aiCorrect, accuracy, byTopic, recentTrend }
function getScriptMarkingAccuracy(p) {
  if (p.secret !== getAdminSecret()) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: 'Unauthorized' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var sheet = getScriptSheet_();
  var data  = sheet.getDataRange().getValues();

  var totalParts = 0, correctParts = 0;
  var byTopic    = {};

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var reviewedAt    = String(row[SCRIPT_COL.reviewedAt - 1] || '').trim();
    var correctionsRaw = String(row[SCRIPT_COL.reviewCorrections - 1] || '').trim();
    var resultRaw      = String(row[SCRIPT_COL.resultJson - 1] || '').trim();
    if (!reviewedAt || !correctionsRaw || !resultRaw) continue;

    var corrections, aiResult;
    try { corrections = JSON.parse(correctionsRaw); aiResult = JSON.parse(resultRaw); } catch(e) { continue; }

    if (!Array.isArray(corrections.questions) || !Array.isArray(aiResult.questions)) continue;

    corrections.questions.forEach(function(corQ) {
      var aiQ = aiResult.questions.find(function(q) { return q.number === corQ.number; });
      if (!aiQ) return;
      (corQ.parts || []).forEach(function(corP) {
        var aiP = (aiQ.parts || []).find(function(p) { return p.part === corP.part; });
        if (!aiP) return;
        totalParts++;
        var isCorrect = (aiP.awarded === corP.awarded);
        if (isCorrect) correctParts++;

        // Track by topic
        var topic = aiP.topic || 'Other';
        if (!byTopic[topic]) byTopic[topic] = { total: 0, correct: 0 };
        byTopic[topic].total++;
        if (isCorrect) byTopic[topic].correct++;
      });
    });
  }

  var accuracy = totalParts > 0 ? Math.round((correctParts / totalParts) * 100) : null;

  // Convert byTopic to array for easier consumption
  var topicArray = Object.keys(byTopic).map(function(t) {
    return {
      topic:    t,
      total:    byTopic[t].total,
      correct:  byTopic[t].correct,
      accuracy: byTopic[t].total > 0 ? Math.round((byTopic[t].correct / byTopic[t].total) * 100) : null,
    };
  });

  return ContentService
    .createTextOutput(JSON.stringify({
      totalReviewed: totalParts,
      aiCorrect:     correctParts,
      accuracy:      accuracy,
      byTopic:       topicArray,
    }))
    .setMimeType(ContentService.MimeType.JSON);
}
