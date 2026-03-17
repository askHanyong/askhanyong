// ════════════════════════════════════════════════════════════════
// HAN — Evaluation Data Population Script
// Reads IB paper, markscheme, and worked solution PDFs from Drive,
// calls Claude to extract question text / gold answers / key steps,
// and writes results back into the Questions sheet.
//
// HOW TO USE:
//   1. Run setClaudeApiKey() once to store your API key
//   2. Run testPdfLookup() to verify files are found correctly
//   3. Run populateEvalData() — re-run as needed (resumes where it left off)
//   4. Run resetPopulateProgress() only if you want to start fresh
// ════════════════════════════════════════════════════════════════

const POP_CONFIG = {
  PAPERS_FOLDER_ID:    '1e6J1EWEsZX6Qk_bt2ND94aw1iXGkOS9V',
  SOLUTIONS_FOLDER_ID: '1mfKgbit7SBrYTPke7biBgJRIqtH587C',
  QUESTIONS_SHEET:     'Questions',
  CLAUDE_MODEL:        'claude-haiku-4-5-20251001', // swap to 'claude-sonnet-4-6' for higher accuracy
  PAPERS_PER_RUN:      3,   // papers to process per execution (stay inside 6-min GAS limit)
};

// ── QID parser ────────────────────────────────────────────────────
// Parses e.g. IBHLN23P2TZ1Q8 → { level:'HL', session:'N', year:'23', paper:'P2', tz:'TZ1', question:8, paperKey:'N23-MAAHL-P2-TZ1' }
function parseQID_(qid) {
  const m = String(qid).match(/^IB(HL|SL)([MN])(\d{2})(P\d)(TZ\d)Q(\d+)$/i);
  if (!m) return null;
  const level   = m[1].toUpperCase();
  const session = m[2].toUpperCase();
  const year    = m[3];
  const paper   = m[4].toUpperCase();
  const tz      = m[5].toUpperCase();
  return {
    level,
    session,
    year,
    paper,
    tz,
    question: parseInt(m[6], 10),
    // Unique key per exam paper (multiple questions share same physical PDF)
    paperKey: `${session}${year}-MAA${level}-${paper}-${tz}`,
  };
}

// ── Filename builders ─────────────────────────────────────────────
// Paper:       "N23 MAAHL P2 TZ1"
// Markscheme:  "N23 MAAHL P2 TZ1_markscheme"
// Solutions:   "MAA HL N23 P2 TZ1 solutions"
function paperFilename_(p)   { return `${p.session}${p.year} MAA${p.level} ${p.paper} ${p.tz}`; }
function msFilename_(p)      { return `${p.session}${p.year} MAA${p.level} ${p.paper} ${p.tz}_markscheme`; }
function solFilename_(p)     { return `MAA ${p.level} ${p.session}${p.year} ${p.paper} ${p.tz} solutions`; }

// ── Drive helpers ─────────────────────────────────────────────────
function findFile_(folderId, namePart) {
  const folder = DriveApp.getFolderById(folderId);
  const files  = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    if (f.getName().toLowerCase().includes(namePart.toLowerCase())) return f;
  }
  return null;
}

function toBase64_(file) {
  return Utilities.base64Encode(file.getBlob().getBytes());
}

// ── Claude API call with a PDF ────────────────────────────────────
function claudePdf_(prompt, pdfBase64) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY');
  if (!apiKey) throw new Error('CLAUDE_API_KEY not set. Run setClaudeApiKey() first.');

  const response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':        apiKey,
      'anthropic-version': '2023-06-01',
      'content-type':     'application/json',
    },
    payload: JSON.stringify({
      model:      POP_CONFIG.CLAUDE_MODEL,
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          {
            type:   'document',
            source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
          },
          { type: 'text', text: prompt },
        ],
      }],
    }),
    muteHttpExceptions: true,
  });

  const json = JSON.parse(response.getContentText());
  if (json.error) throw new Error(`Claude error: ${json.error.message}`);
  return json.content[0].text.trim();
}

// ── Safe JSON parse with fallback ─────────────────────────────────
function parseJson_(raw) {
  // Claude sometimes wraps JSON in ```json ... ``` — strip that
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
  return JSON.parse(cleaned);
}

// ── Main population function ──────────────────────────────────────
function populateEvalData() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(POP_CONFIG.QUESTIONS_SHEET);
  if (!sheet) { Logger.log(`Sheet "${POP_CONFIG.QUESTIONS_SHEET}" not found.`); return; }

  const data    = sheet.getDataRange().getValues();
  const headers = data[0];

  const IDX = {
    QID:  headers.indexOf('Question ID'),
    TEXT: headers.indexOf('Question Text'),
    ANS:  headers.indexOf('Gold Answer'),
    STEP: headers.indexOf('Key Steps'),
  };

  // Validate columns exist
  for (const [name, idx] of Object.entries(IDX)) {
    if (idx === -1) { Logger.log(`Column "${name}" not found in sheet. Check header names.`); return; }
  }

  // Group rows by paper — only rows where Question Text is still empty
  const paperGroups = {}; // paperKey → { parsed, rows: [{rowIndex, question}] }
  for (let i = 1; i < data.length; i++) {
    const qid  = data[i][IDX.QID];
    const text = data[i][IDX.TEXT];
    if (!qid || text) continue; // skip empty or already filled

    const p = parseQID_(qid);
    if (!p) { Logger.log(`Cannot parse QID: ${qid} (row ${i + 1}) — skipping`); continue; }

    if (!paperGroups[p.paperKey]) paperGroups[p.paperKey] = { parsed: p, rows: [] };
    paperGroups[p.paperKey].rows.push({ rowIndex: i, question: p.question });
  }

  const allKeys = Object.keys(paperGroups);
  if (allKeys.length === 0) { Logger.log('Nothing to populate — all Question Text cells are filled.'); return; }

  // Resume support: skip already-completed papers from previous runs
  const props      = PropertiesService.getScriptProperties();
  const donePapers = JSON.parse(props.getProperty('POP_DONE_PAPERS') || '[]');
  const pending    = allKeys.filter(k => !donePapers.includes(k));

  Logger.log(`Total papers needing data: ${allKeys.length} | Already done: ${donePapers.length} | This run: up to ${POP_CONFIG.PAPERS_PER_RUN}`);

  let processedCount = 0;

  for (const key of pending.slice(0, POP_CONFIG.PAPERS_PER_RUN)) {
    const { parsed: p, rows } = paperGroups[key];
    const qNums    = [...new Set(rows.map(r => r.question))].sort((a, b) => a - b);
    const qList    = qNums.join(', ');
    const paperF   = paperFilename_(p);
    const msF      = msFilename_(p);
    const solF     = solFilename_(p);

    Logger.log(`\nProcessing: ${paperF} | Questions: ${qList}`);

    try {
      // ── Find PDFs ──────────────────────────────────────────────
      const paperFile = findFile_(POP_CONFIG.PAPERS_FOLDER_ID, paperF);
      const msFile    = findFile_(POP_CONFIG.PAPERS_FOLDER_ID, msF);
      const solFile   = findFile_(POP_CONFIG.SOLUTIONS_FOLDER_ID, solF);

      if (!paperFile) { Logger.log(`  MISSING paper PDF: "${paperF}" — skipping`); continue; }
      if (!msFile)    { Logger.log(`  MISSING markscheme PDF: "${msF}" — skipping`); continue; }
      if (!solFile)   { Logger.log(`  WARNING: solutions PDF not found: "${solF}" — Key Steps will be empty`); }

      const paperB64 = toBase64_(paperFile);
      const msB64    = toBase64_(msFile);
      const solB64   = solFile ? toBase64_(solFile) : null;

      // ── Extract question texts (one API call for whole paper) ──
      Logger.log('  Extracting question texts...');
      const textsRaw = claudePdf_(
        `This is an IB Mathematics exam paper.

Extract the COMPLETE text of questions: ${qList}
Include ALL sub-parts (a), (b), (c), etc. and any context/given information for each question.
For questions with diagrams you cannot read, write [diagram] as a placeholder.

Return ONLY a valid JSON object with question numbers as string keys:
{"${qNums[0]}": "full text of question ${qNums[0]}", ...}

No explanation, no markdown code fences, just raw JSON.`,
        paperB64
      );
      const texts = parseJson_(textsRaw);

      // ── Extract gold answers (one API call for whole markscheme) ──
      Logger.log('  Extracting gold answers...');
      const answersRaw = claudePdf_(
        `This is an IB Mathematics markscheme.

Extract the final answer(s) for questions: ${qList}
Include answers for all sub-parts (a), (b), (c), etc.
Be concise — just the answer values/expressions, not the full working.

Return ONLY a valid JSON object with question numbers as string keys:
{"${qNums[0]}": "a) answer  b) answer  c) answer", ...}

No explanation, no markdown code fences, just raw JSON.`,
        msB64
      );
      const answers = parseJson_(answersRaw);

      // ── Extract key steps (one API call for whole solutions PDF) ──
      let steps = {};
      if (solB64) {
        Logger.log('  Extracting key steps...');
        const stepsRaw = claudePdf_(
          `This is an IB Mathematics worked solutions document.

For questions: ${qList}, extract 2–4 KEY WORKING STEPS per question.
These are the critical method steps an IB examiner would award marks for.
Be concise. Use numbered lines.

Return ONLY a valid JSON object with question numbers as string keys:
{"${qNums[0]}": "1. Set up equation...\n2. Differentiate...\n3. Solve for x...", ...}

No explanation, no markdown code fences, just raw JSON.`,
          solB64
        );
        steps = parseJson_(stepsRaw);
      }

      // ── Write back to sheet ────────────────────────────────────
      for (const { rowIndex, question } of rows) {
        const q       = String(question);
        const sheetRow = rowIndex + 1; // 1-indexed

        if (texts[q])   sheet.getRange(sheetRow, IDX.TEXT + 1).setValue(texts[q]);
        if (answers[q]) sheet.getRange(sheetRow, IDX.ANS  + 1).setValue(answers[q]);
        if (steps[q])   sheet.getRange(sheetRow, IDX.STEP + 1).setValue(steps[q]);
      }
      SpreadsheetApp.flush(); // write immediately

      // Mark paper done and save progress
      donePapers.push(key);
      props.setProperty('POP_DONE_PAPERS', JSON.stringify(donePapers));
      processedCount++;
      Logger.log(`  ✓ Done: ${paperF}`);

    } catch (err) {
      Logger.log(`  ✗ Error on ${key}: ${err.message}`);
    }

    Utilities.sleep(1000); // brief pause between papers to respect rate limits
  }

  // ── Summary ───────────────────────────────────────────────────
  const remaining = pending.length - processedCount;
  if (remaining <= 0) {
    props.deleteProperty('POP_DONE_PAPERS'); // clean up — all done
    Logger.log('\n✅ All papers complete! Progress tracker cleared.');
  } else {
    Logger.log(`\nRun populateEvalData() again to continue. ${remaining} papers remaining.`);
  }
  Logger.log(`This run: ${processedCount} paper(s) processed.`);
}

// ── Test: verify file lookup before running the full job ──────────
// Change TEST_QID to any Question ID from your sheet
function testPdfLookup() {
  const TEST_QID = 'IBHLN23P2TZ1Q8';

  const p = parseQID_(TEST_QID);
  if (!p) { Logger.log('QID failed to parse: ' + TEST_QID); return; }

  Logger.log('Parsed QID:         ' + JSON.stringify(p));
  Logger.log('Paper filename:     ' + paperFilename_(p));
  Logger.log('Markscheme filename:' + msFilename_(p));
  Logger.log('Solutions filename: ' + solFilename_(p));

  const pf = findFile_(POP_CONFIG.PAPERS_FOLDER_ID, paperFilename_(p));
  const mf = findFile_(POP_CONFIG.PAPERS_FOLDER_ID, msFilename_(p));
  const sf = findFile_(POP_CONFIG.SOLUTIONS_FOLDER_ID, solFilename_(p));

  Logger.log('\nPaper found:      ' + (pf ? '✓ ' + pf.getName() : '✗ NOT FOUND'));
  Logger.log('Markscheme found: ' + (mf ? '✓ ' + mf.getName() : '✗ NOT FOUND'));
  Logger.log('Solutions found:  ' + (sf ? '✓ ' + sf.getName() : '✗ NOT FOUND'));
}

// ── Test: run a single question end-to-end (writes to sheet) ──────
function testSingleQuestion() {
  const TEST_QID = 'IBHLN23P2TZ1Q8'; // change to any QID that exists in your sheet

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(POP_CONFIG.QUESTIONS_SHEET);
  const data  = sheet.getDataRange().getValues();
  const IDX   = {
    QID:  data[0].indexOf('Question ID'),
    TEXT: data[0].indexOf('Question Text'),
    ANS:  data[0].indexOf('Gold Answer'),
    STEP: data[0].indexOf('Key Steps'),
  };

  const rowIndex = data.findIndex((r, i) => i > 0 && String(r[IDX.QID]) === TEST_QID);
  if (rowIndex === -1) { Logger.log('QID not found in sheet: ' + TEST_QID); return; }

  const p        = parseQID_(TEST_QID);
  const paperF   = paperFilename_(p);
  const msF      = msFilename_(p);
  const solF     = solFilename_(p);
  const q        = String(p.question);

  const paperFile = findFile_(POP_CONFIG.PAPERS_FOLDER_ID, paperF);
  const msFile    = findFile_(POP_CONFIG.PAPERS_FOLDER_ID, msF);
  const solFile   = findFile_(POP_CONFIG.SOLUTIONS_FOLDER_ID, solF);

  if (!paperFile || !msFile) { Logger.log('Paper or markscheme not found — run testPdfLookup() first.'); return; }

  const paperB64 = toBase64_(paperFile);
  const msB64    = toBase64_(msFile);
  const solB64   = solFile ? toBase64_(solFile) : null;

  Logger.log('Extracting question text...');
  const textsRaw  = claudePdf_(`Extract question ${p.question} from this IB exam paper, including all sub-parts. Return JSON: {"${q}": "text"}`, paperB64);
  const texts     = parseJson_(textsRaw);

  Logger.log('Extracting gold answer...');
  const answersRaw = claudePdf_(`From this IB markscheme, extract the answer for question ${p.question}, all sub-parts. Return JSON: {"${q}": "answer"}`, msB64);
  const answers    = parseJson_(answersRaw);

  let steps = {};
  if (solB64) {
    Logger.log('Extracting key steps...');
    const stepsRaw = claudePdf_(`From this worked solutions PDF, extract 2-4 key steps for question ${p.question}. Return JSON: {"${q}": "1. ...\n2. ..."}`, solB64);
    steps = parseJson_(stepsRaw);
  }

  Logger.log('\n— Results —');
  Logger.log('Question Text: ' + (texts[q] || 'NOT EXTRACTED'));
  Logger.log('Gold Answer:   ' + (answers[q] || 'NOT EXTRACTED'));
  Logger.log('Key Steps:     ' + (steps[q] || 'NOT EXTRACTED'));

  // Write to sheet
  const sheetRow = rowIndex + 1;
  if (texts[q])   sheet.getRange(sheetRow, IDX.TEXT + 1).setValue(texts[q]);
  if (answers[q]) sheet.getRange(sheetRow, IDX.ANS  + 1).setValue(answers[q]);
  if (steps[q])   sheet.getRange(sheetRow, IDX.STEP + 1).setValue(steps[q]);
  SpreadsheetApp.flush();

  Logger.log('\n✓ Written to sheet row ' + sheetRow);
}

// ── One-time setup: store your Claude API key ─────────────────────
// Replace YOUR_API_KEY_HERE then run this function once
function setClaudeApiKey() {
  PropertiesService.getScriptProperties().setProperty('CLAUDE_API_KEY', 'YOUR_API_KEY_HERE');
  Logger.log('API key saved to Script Properties.');
}

// ── Clear progress tracker to restart from scratch ────────────────
function resetPopulateProgress() {
  PropertiesService.getScriptProperties().deleteProperty('POP_DONE_PAPERS');
  Logger.log('Progress reset. Next run of populateEvalData() will start from the beginning.');
}
