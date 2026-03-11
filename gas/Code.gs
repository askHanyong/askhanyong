// ════════════════════════════════════════════════════════════════
// HAN Admin — Google Apps Script
// Deploy as: Web App → Execute as Me → Anyone can access
// ════════════════════════════════════════════════════════════════

// Maps URL param keys → Sheet column header names
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

function doGet(e) {
  const action = e.parameter.action;
  if (action === 'addQuestion') {
    return addQuestion(e.parameter);
  }
  return ContentService
    .createTextOutput('HAN Admin GAS — OK')
    .setMimeType(ContentService.MimeType.TEXT);
}

function addQuestion(params) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Questions') || ss.getActiveSheet();

  // Read column headers from row 1
  const lastCol = Math.max(sheet.getLastColumn(), Object.keys(PARAM_TO_HEADER).length);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  // Build the row array aligned to header positions
  const row = headers.map(header => {
    // Find param key whose mapped header matches this column header
    const paramKey = Object.keys(PARAM_TO_HEADER).find(k => PARAM_TO_HEADER[k] === header);
    return paramKey ? (params[paramKey] || '') : '';
  });

  sheet.appendRow(row);

  return ContentService
    .createTextOutput(JSON.stringify({ success: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
