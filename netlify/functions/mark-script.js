// ════════════════════════════════════════════════════════════════
// HAN Mark Script — Netlify Function  (Student-facing)
// POST /api/mark-script
// Authorization: Bearer <han_session_token>
//
// Body (JSON):
//   {
//     pages:      [{ data: <base64>, mediaType: "image/jpeg" }, ...],  // PDF pages as images
//     paperInfo:  { level: "AA HL", paper: "Paper 2", year: "2023", session: "May TZ1" },
//     studentName: "optional display name"
//   }
//
// Returns:
//   { ok: true, scriptId, result: { questions, total, maxTotal, percentage,
//     overallFeedback, topicPerformance, strengths, improvements, confidence } }
//
// Quota:  3 markings/month for active subscribers; 0 for free users.
//         Returns 402 { error, quotaExceeded: true, remaining: 0 } when over.
//
// HITL:   Papers with confidence < HITL_THRESHOLD trigger an email to admin.
// ════════════════════════════════════════════════════════════════

const crypto = require('crypto');

const ANTHROPIC_API_KEY = (process.env.ANTHROPIC_API_KEY || '').trim();
const SESSION_SECRET    = process.env.SESSION_SECRET;
const SHEETS_URL        = process.env.SHEETS_URL;
const GAS_ADMIN_SECRET  = process.env.GAS_ADMIN_SECRET;
const MODEL             = 'claude-sonnet-4-6';

// ── IB paper total marks (fixed by IB specification) ─────────────
// Used as a fallback when no markscheme has been uploaded for this paper.
const PAPER_TOTALS = {
  'AA HL': { 'Paper 1': 110, 'Paper 2': 110, 'Paper 3': 55 },
  'AA SL': { 'Paper 1': 80,  'Paper 2': 80 },
  'AI HL': { 'Paper 1': 110, 'Paper 2': 110, 'Paper 3': 55 },
  'AI SL': { 'Paper 1': 80,  'Paper 2': 80 },
};

// ── Build the question-ID prefix used in Google Sheets ────────────
// Matches admin.html getIdPrefix() logic.
// e.g. { level:'AA HL', paper:'Paper 1', year:'2024', session:'May TZ1' }
//   → 'IBMAAHM24P1TZ1'
function buildPaperKey(paperInfo) {
  if (!paperInfo) return null;
  const levelMap = { 'AA HL': 'HL', 'AA SL': 'SL', 'AI HL': 'AIHL', 'AI SL': 'AISL' };
  const level = levelMap[paperInfo.level];
  if (!level) return null;
  const sessionParts = (paperInfo.session || '').trim().split(/\s+/);
  const sessionChar  = sessionParts[0] ? sessionParts[0].charAt(0).toUpperCase() : '';
  const tzNum        = sessionParts[1] ? sessionParts[1].replace('TZ', '') : '';
  const year         = (paperInfo.year || '').slice(-2);
  const paperMap     = { 'Paper 1': 'P1', 'Paper 2': 'P2', 'Paper 3': 'P3' };
  const paper        = paperMap[paperInfo.paper];
  if (!sessionChar || !year || !paper) return null;
  return `IBMAA${level}${sessionChar}${year}${paper}TZ${tzNum}`;
}

// ── Fetch per-question mark allocation from GAS ───────────────────
// Calls GAS action 'getPaperStructure' which returns questions uploaded
// via the admin markscheme upload flow.
// Falls back to static total-marks-only if GAS has no data.
async function fetchPaperStructure(paperInfo) {
  const key  = buildPaperKey(paperInfo);
  const total = PAPER_TOTALS[paperInfo?.level]?.[paperInfo?.paper] ?? null;

  if (key && SHEETS_URL && GAS_ADMIN_SECRET) {
    try {
      const data = await callGAS({
        action: 'getPaperStructure',
        prefix: key,
        secret: GAS_ADMIN_SECRET,
      }, 4000);
      if (data && Array.isArray(data.questions) && data.questions.length > 0) {
        return { totalMarks: data.totalMarks ?? total, questions: data.questions };
      }
    } catch (_) { /* non-fatal — fall through to static */ }
  }

  return total ? { totalMarks: total, questions: [] } : null;
}

// Comma-separated list of emails that bypass the monthly quota entirely.
// Also accepts an env var UNLIMITED_EMAILS for runtime configuration.
const UNLIMITED_EMAILS = new Set([
  'mathstutorlimhy@gmail.com',
  ...(process.env.UNLIMITED_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
]);

// Papers with AI confidence below this threshold are flagged for human review
const HITL_THRESHOLD = 0.72;

// Free-tier users cannot use this feature (subscription required)
const SCRIPT_MONTHLY_LIMIT = 3;

// 1 page per batch keeps each Sonnet call to ~15-20s → well within 26s limit.
// 5 concurrent workers on client: 26 pages → ceil(26/5) = 6 waves × ~18s ≈ 2 min.
const BATCH_SIZE = 1;

const CORS = {
  'Content-Type':                'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':'Content-Type, Authorization',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
};

// ── Session token verification (mirrors edge-function logic using Node crypto) ──
function verifySessionToken(token) {
  try {
    if (!SESSION_SECRET || !token) return null;
    const parts = token.split(':');
    if (parts.length < 3) return null;
    const hmac    = parts[parts.length - 1];
    const payload = parts.slice(0, -1).join(':');
    const [emailB64, expiry] = payload.split(':');
    if (!emailB64 || !expiry || !hmac) return null;
    if (Date.now() > Number(expiry)) return null;
    const expectedHex = crypto
      .createHmac('sha256', SESSION_SECRET)
      .update(payload)
      .digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expectedHex, 'hex'))) return null;
    return Buffer.from(emailB64, 'base64').toString('utf8');
  } catch {
    return null;
  }
}

// ── GAS call helper ───────────────────────────────────────────────
async function callGAS(params, timeoutMs = 3000) {
  const url = SHEETS_URL + '?' + new URLSearchParams(params).toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { redirect: 'follow', signal: controller.signal });
    if (!resp.ok) throw new Error('GAS ' + resp.status);
    const text = await resp.text();
    try { return JSON.parse(text); } catch { return { raw: text }; }
  } finally {
    clearTimeout(timer);
  }
}

async function postGAS(body, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(SHEETS_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      redirect: 'follow',
      signal:  controller.signal,
    });
    if (!resp.ok) throw new Error('GAS POST ' + resp.status);
    const text = await resp.text();
    try { return JSON.parse(text); } catch { return { raw: text }; }
  } finally {
    clearTimeout(timer);
  }
}

// ── Generate a short unique script ID ────────────────────────────
function newScriptId() {
  return 'scr_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
}

// ── System prompt for student-paper marking ───────────────────────
// paperStructure: { totalMarks: number, questions: [{num, marks, topic, parts}] }
function buildSystemPrompt(paperInfo, paperStructure) {
  const { level = '', paper = '', year = '', session = '' } = paperInfo || {};
  const paperLabel = `${level} ${paper}${year ? ' (' + year + (session ? ' ' + session : '') + ')' : ''}`.trim();

  // ── Paper structure block ────────────────────────────────────────
  let structureBlock = '';
  if (paperStructure) {
    const lines = [];
    if (paperStructure.totalMarks) {
      lines.push(`FIXED PAPER TOTAL: ${paperStructure.totalMarks} marks. Do NOT award more than this across all questions.`);
    }
    if (paperStructure.questions && paperStructure.questions.length > 0) {
      lines.push('QUESTIONS AND MARKING CRITERIA (do not deviate from these):');
      for (const q of paperStructure.questions) {
        lines.push(`\nQ${q.num}: ${q.marks} mark${q.marks !== 1 ? 's' : ''}${q.topic ? ` [${q.topic}]` : ''}`);
        if (q.questionText) lines.push(`  Question: "${q.questionText}"`);
        if (q.markscheme)   lines.push(`  Markscheme: ${q.markscheme}`);
      }
      lines.push('\nIf a question is not listed above, it is not on this paper — do not invent it.');
    }
    if (lines.length) structureBlock = '\n\n' + lines.join('\n');
  }

  return `CRITICAL INSTRUCTION: You must respond with ONLY a valid JSON object. No prose, no explanation, no analysis. Your entire response = one JSON object, nothing else.

You are an experienced IB Mathematics examiner with 20+ years of marking experience.
The student has uploaded their completed ${paperLabel}.${structureBlock}

Your task is to mark this student's paper. The image shows the student's handwritten work — which may include the printed question text plus their written answers, or just their answers.

MARKING RULES:
1. Identify ONLY question numbers visible in the student's work on this page
2. WHERE MARKSCHEME IS PROVIDED: mark strictly and ONLY against the criteria listed. Each mark (M1/A1/B1/R1) must match the exact criterion stated. Do not award marks not in the markscheme. Do not invent additional marks.
3. WHERE NO MARKSCHEME IS PROVIDED: apply standard IB Mathematics marking principles
4. M (method) marks: award if correct method is clearly shown, even with an arithmetic slip
5. A (accuracy) marks: award only if the numerical or algebraic answer is correct
6. FT (follow-through) marks: award when correct method is applied to an earlier incorrect value
7. R (reasoning) marks: award only if a clear mathematical reason/justification is given
8. AG (answer given): full working must be shown — do not award if answer is copied without working
9. GRAPH SKETCHING — mark each required feature independently per the markscheme criteria:
   - Shape, intercepts, asymptotes, key coordinates: only award if explicitly drawn AND labelled
10. If a part is entirely missing, all marks = 0
11. maxMarks per question MUST match the value in the QUESTIONS AND MARKING CRITERIA above — never exceed it
12. Read handwriting charitably — interpret ambiguous symbols in the student's favour when intent is clear
13. For each part, give a one-sentence feedback comment referencing the specific criterion missed or met
14. If the student only wrote working without the question text, use the "Question:" text above to understand what was asked

After marking all visible questions on this page, calculate per-topic performance using IB topic categories:
- Number & Algebra, Functions, Geometry & Trigonometry, Statistics & Probability, Calculus

Self-assess your confidence in this marking (0.0–1.0):
- 1.0 = very clear handwriting, well-structured answers, familiar questions
- 0.5 = some unclear writing, unusual methods, or edge cases
- <0.5 = very hard to read, unconventional approach, or very recent paper unlikely in training data

Call the record_marking_result tool with all findings.`;
}

// ── Forced-tool-use schema — guarantees structured output, eliminates prose ──
const MARKING_TOOL = {
  name: 'record_marking_result',
  description: 'Record the complete structured marking result for this page of the student answer script.',
  input_schema: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            number:        { type: 'string' },
            parts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  part:     { type: 'string' },
                  maxMarks: { type: 'integer' },
                  awarded:  { type: 'integer' },
                  marks: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        code:    { type: 'string' },
                        type:    { type: 'string' },
                        awarded: { type: 'boolean' },
                        reason:  { type: 'string' },
                      },
                      required: ['code', 'type', 'awarded', 'reason'],
                    },
                  },
                  feedback: { type: 'string' },
                  topic:    { type: 'string' },
                },
                required: ['part', 'maxMarks', 'awarded', 'marks', 'feedback', 'topic'],
              },
            },
            questionTotal: { type: 'integer' },
            questionMax:   { type: 'integer' },
          },
          required: ['number', 'parts', 'questionTotal', 'questionMax'],
        },
      },
      total:           { type: 'integer' },
      maxTotal:        { type: 'integer' },
      percentage:      { type: 'integer' },
      overallFeedback: { type: 'string' },
      topicPerformance: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            topic:      { type: 'string' },
            awarded:    { type: 'integer' },
            max:        { type: 'integer' },
            percentage: { type: 'integer' },
          },
          required: ['topic', 'awarded', 'max', 'percentage'],
        },
      },
      strengths:    { type: 'array', items: { type: 'string' } },
      improvements: { type: 'array', items: { type: 'string' } },
      confidence:   { type: 'number' },
    },
    required: ['questions', 'total', 'maxTotal', 'percentage', 'overallFeedback',
               'topicPerformance', 'strengths', 'improvements', 'confidence'],
  },
};

// ── Call Claude with a batch of paper images ──────────────────────
async function markPaper(pages, paperInfo, studentName, paperStructure) {
  const content = [
    {
      type: 'text',
      text: `Mark the answer script of student "${studentName || 'Student'}" shown in the following image(s). Mark ONLY what is visible on this page. Call the record_marking_result tool with the complete structured result.`,
    },
    ...pages.map(p => ({
      type: 'image',
      source: { type: 'base64', media_type: p.mediaType || 'image/jpeg', data: p.data },
    })),
  ];

  const anthController = new AbortController();
  const anthTimer = setTimeout(() => anthController.abort(), 25000);
  let resp;
  try {
    resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:       MODEL,
        max_tokens:  1800,
        system:      buildSystemPrompt(paperInfo, paperStructure),
        tools:       [MARKING_TOOL],
        tool_choice: { type: 'tool', name: 'record_marking_result' },
        messages:    [{ role: 'user', content }],
      }),
      signal: anthController.signal,
    });
  } catch (fetchErr) {
    if (fetchErr.name === 'AbortError') {
      throw new Error('Marking timed out. Please try uploading fewer pages or a smaller file.');
    }
    throw fetchErr;
  } finally {
    clearTimeout(anthTimer);
  }

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error('Anthropic ' + resp.status + ': ' + err.slice(0, 300));
  }

  const json = await resp.json();

  if (json.stop_reason === 'max_tokens') {
    throw new Error('Marking response was truncated (max_tokens reached). Try uploading fewer pages at a time.');
  }

  // With forced tool use, Claude MUST call the tool — extract its input directly
  const toolBlock = json.content?.find(c => c.type === 'tool_use' && c.name === 'record_marking_result');
  if (!toolBlock?.input) {
    throw new Error('Marking tool was not called: ' + JSON.stringify(json.content?.slice(0, 2)));
  }
  return toolBlock.input;
}

// ── Merge questions from multiple batch results, deduplicating parts ──
function mergeQuestions(allQuestions) {
  const qMap = new Map();
  for (const q of allQuestions) {
    const key = String(q.number);
    if (!qMap.has(key)) {
      qMap.set(key, { number: q.number, parts: [], questionTotal: 0, questionMax: 0 });
    }
    const entry = qMap.get(key);
    for (const part of (q.parts || [])) {
      if (!entry.parts.find(p => p.part === part.part)) {
        entry.parts.push(part);
      }
    }
    entry.questionTotal = entry.parts.reduce((s, p) => s + (p.awarded  || 0), 0);
    entry.questionMax   = entry.parts.reduce((s, p) => s + (p.maxMarks || 0), 0);
  }
  return [...qMap.values()].sort((a, b) => parseFloat(a.number) - parseFloat(b.number));
}

// ── Merge results from multiple batch calls into one cohesive result ──
function mergeMarkingResults(batchResults) {
  const questions = mergeQuestions(batchResults.flatMap(r => r.questions || []));
  const total    = questions.reduce((s, q) => s + (q.questionTotal || 0), 0);
  const maxTotal = questions.reduce((s, q) => s + (q.questionMax   || 0), 0);

  // Aggregate topic performance across batches
  const topicMap = {};
  for (const r of batchResults) {
    for (const t of (r.topicPerformance || [])) {
      if (!topicMap[t.topic]) topicMap[t.topic] = { topic: t.topic, awarded: 0, max: 0 };
      topicMap[t.topic].awarded += t.awarded || 0;
      topicMap[t.topic].max     += t.max     || 0;
    }
  }
  const topicPerformance = Object.values(topicMap).map(t => ({
    ...t,
    percentage: t.max > 0 ? Math.round(t.awarded / t.max * 100) : 0,
  }));

  const strengths    = [...new Set(batchResults.flatMap(r => r.strengths    || []))].slice(0, 4);
  const improvements = [...new Set(batchResults.flatMap(r => r.improvements || []))].slice(0, 4);
  const overallFeedback = batchResults.map(r => r.overallFeedback || '').filter(Boolean).join(' ');
  const confidence = Math.min(...batchResults.map(r =>
    typeof r.confidence === 'number' ? r.confidence : 1.0
  ));

  return {
    questions,
    total,
    maxTotal,
    percentage: maxTotal > 0 ? Math.round(total / maxTotal * 100) : 0,
    overallFeedback,
    topicPerformance,
    strengths,
    improvements,
    confidence,
  };
}

// ── Handler ───────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  // ── Auth: require valid HAN session token ──────────────────────
  const authHeader = (event.headers['authorization'] || event.headers['Authorization'] || '').trim();
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const email = token ? verifySessionToken(token) : null;

  if (!email) {
    return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Sign in required to use Script Marking.' }) };
  }

  if (!ANTHROPIC_API_KEY) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Service not configured.' }) };
  }

  // ── Parse body ─────────────────────────────────────────────────
  let body;
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : (event.body || '{}');
    body = JSON.parse(raw);
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { pages, paperInfo, studentName, action, scriptId: incomingScriptId, multiPart } = body;

  // ── Lightweight "downloaded" action — record download event ────
  if (action === 'downloaded' && incomingScriptId) {
    try {
      await postGAS({ action: 'markScriptDownloaded', secret: GAS_ADMIN_SECRET, scriptId: incomingScriptId });
    } catch(e) { /* non-fatal */ }
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
  }

  // ── getPaperStructure: returns mark allocation for this paper ────
  // Queries GAS for per-question data uploaded via admin markscheme flow.
  // Falls back to static total-marks-only if GAS has no data for this paper.
  if (action === 'getPaperStructure') {
    const structure = await fetchPaperStructure(body.paperInfo || {});
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, structure }) };
  }

  // ── batchMark: auth-only batch call — no quota check, no GAS recording ──
  if (action === 'batchMark') {
    if (!Array.isArray(pages) || pages.length === 0 || pages.length > BATCH_SIZE) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: `batchMark requires 1–${BATCH_SIZE} pages.` }) };
    }
    try {
      const ps = body.paperStructure || null;
      const batchResult = await markPaper(pages, paperInfo || {}, studentName || 'Student', ps);
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, result: batchResult }) };
    } catch (e) {
      const msg = e.message || String(e);
      console.error('mark-script: batchMark error:', msg);
      // Pass 429 back to the client so its retry loop (with Retry-After back-off) can handle it.
      if (msg.startsWith('Anthropic 429')) {
        return { statusCode: 429, headers: { ...CORS, 'Retry-After': '15' }, body: JSON.stringify({ error: msg }) };
      }
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: msg }) };
    }
  }

  // ── finalizeScript: record merged result in GAS after all batches complete ──
  if (action === 'finalizeScript') {
    const { scriptId: fScriptId, result: fResult, paperInfo: fPaperInfo } = body;
    if (!fScriptId || !fResult) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'scriptId and result are required.' }) };
    }
    const fConf       = typeof fResult.confidence === 'number' ? fResult.confidence : 1.0;
    const fNeeds      = fConf < HITL_THRESHOLD;
    const fMonthKey   = new Date().toISOString().slice(0, 7);
    try {
      await postGAS({
        action:      'recordScriptSubmission',
        secret:      GAS_ADMIN_SECRET,
        email,
        scriptId:    fScriptId,
        month:       fMonthKey,
        paperInfo:   JSON.stringify(fPaperInfo || {}),
        result:      JSON.stringify(fResult),
        confidence:  fConf,
        needsReview: fNeeds,
        expiresAt:   Date.now() + 7 * 24 * 60 * 60 * 1000,
      });
    } catch (e) {
      console.error('mark-script: finalizeScript GAS failed:', e.message);
    }
    if (fNeeds) {
      try {
        await postGAS({
          action:     'sendScriptReviewAlert',
          secret:     GAS_ADMIN_SECRET,
          scriptId:   fScriptId,
          email,
          paperInfo:  JSON.stringify(fPaperInfo || {}),
          confidence: fConf,
          total:      fResult.total,
          maxTotal:   fResult.maxTotal,
        });
      } catch (e) {
        console.error('mark-script: finalizeScript HITL alert failed:', e.message);
      }
    }
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, scriptId: fScriptId }) };
  }

  // ── Quota-check-only action — returns remaining quota without marking ──
  if (action === 'quotaCheckOnly') {
    const qMonthKey   = new Date().toISOString().slice(0, 7);
    const qUnlimited  = UNLIMITED_EMAILS.has(email.toLowerCase());
    let qResult = { remaining: 0, isPremium: false, isUnlimited: false };
    if (qUnlimited) {
      qResult = { remaining: 999, isPremium: true, isUnlimited: true };
    } else {
      try {
        const q = await callGAS({ action: 'checkScriptQuota', email, month: qMonthKey, secret: GAS_ADMIN_SECRET });
        const isLegacy = q.tier === 'legacy' || q.isUnlimited === true;
        qResult = {
          remaining:   isLegacy ? 999 : (q.remaining ?? 0),
          isPremium:   !!q.isPremium || isLegacy,
          isUnlimited: isLegacy,
        };
      } catch (e) {
        console.error('mark-script: quotaCheckOnly GAS error:', e.message);
        qResult = { remaining: 1, isPremium: false, isUnlimited: false };
      }
    }
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, quota: qResult }) };
  }

  if (!Array.isArray(pages) || pages.length === 0) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'pages is required (array of base64 images)' }) };
  }
  if (pages.length > 30) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Maximum 30 pages per upload.' }) };
  }

  // ── Quota check via GAS ────────────────────────────────────────
  const monthKey = new Date().toISOString().slice(0, 7); // "YYYY-MM"

  // Unlimited admin emails skip quota entirely.
  const isUnlimited = UNLIMITED_EMAILS.has(email.toLowerCase());

  let quota = { remaining: 0, isPremium: false };
  if (isUnlimited) {
    quota = { remaining: 999, isPremium: true };
  } else {
    try {
      const q = await callGAS({
        action:  'checkScriptQuota',
        email,
        month:   monthKey,
        secret:  GAS_ADMIN_SECRET,
      });
      const isLegacy = q.tier === 'legacy' || q.isUnlimited === true;
    quota = {
      remaining:   isLegacy ? 999 : (q.remaining ?? 0),
      isPremium:   !!q.isPremium || isLegacy,
      isUnlimited: isLegacy,
    };
    } catch (e) {
      console.error('mark-script: quota check failed:', e.message);
      // Fail-open for now rather than blocking all users on GAS errors
      quota = { remaining: 1, isPremium: false };
    }
  }

  if (quota.remaining <= 0) {
    return {
      statusCode: 402,
      headers:    CORS,
      body: JSON.stringify({
        error:        'Monthly script marking limit reached.',
        quotaExceeded: true,
        remaining:    0,
        isPremium:    quota.isPremium,
        isUnlimited:  quota.isUnlimited ?? false,
      }),
    };
  }

  // ── Mark the paper ──────────────────────────────────────────────
  // Server handles only one batch (≤BATCH_SIZE pages) per call.
  // For larger scripts the client splits pages into batches, using
  // multiPart:true for the first call and action:'batchMark' for the rest.
  if (pages.length > BATCH_SIZE) {
    return {
      statusCode: 400,
      headers:    CORS,
      body: JSON.stringify({
        error: `Send at most ${BATCH_SIZE} pages per call. Split large scripts into batches and use multiPart:true + action:'batchMark'.`,
      }),
    };
  }

  let result;
  try {
    result = await markPaper(pages, paperInfo || {}, studentName || 'Student');
  } catch (e) {
    console.error('mark-script: marking error:', e.message);
    return {
      statusCode: 500,
      headers:    CORS,
      body: JSON.stringify({ error: 'Marking failed: ' + e.message }),
    };
  }

  const scriptId   = newScriptId();
  const confidence = typeof result.confidence === 'number' ? result.confidence : 1.0;
  const needsReview = confidence < HITL_THRESHOLD;

  // ── When multiPart:true the client will send remaining batches and call
  //    finalizeScript to record the merged result — skip GAS recording here.
  if (!multiPart) {
    // ── Record submission in GAS (quota + result storage) ──────────
    try {
      await postGAS({
        action:      'recordScriptSubmission',
        secret:      GAS_ADMIN_SECRET,
        email,
        scriptId,
        month:       monthKey,
        paperInfo:   JSON.stringify(paperInfo || {}),
        result:      JSON.stringify(result),
        confidence,
        needsReview,
        expiresAt:   Date.now() + 7 * 24 * 60 * 60 * 1000,
      });
    } catch (e) {
      console.error('mark-script: GAS record failed:', e.message);
    }

    // ── Trigger HITL alert if confidence is low ───────────────────
    if (needsReview) {
      try {
        await postGAS({
          action:     'sendScriptReviewAlert',
          secret:     GAS_ADMIN_SECRET,
          scriptId,
          email,
          paperInfo:  JSON.stringify(paperInfo || {}),
          confidence,
          total:      result.total,
          maxTotal:   result.maxTotal,
        });
      } catch (e) {
        console.error('mark-script: HITL alert failed:', e.message);
      }
    }
  }

  return {
    statusCode: 200,
    headers:    CORS,
    body: JSON.stringify({
      ok: true,
      scriptId,
      needsReview,
      confidence,
      result,
    }),
  };
};
