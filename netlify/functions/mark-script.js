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

// Max pages sent to Claude in a single API call.
// 2 pages per batch, 5 concurrent workers on client → ~60s for 26-page paper.
// 2 pages at ~80 tok/s ≈ 15s generation → well within 26s Netlify hard limit.
const BATCH_SIZE = 2;

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
function buildSystemPrompt(paperInfo) {
  const { level = '', paper = '', year = '', session = '' } = paperInfo || {};
  return `You are an experienced IB Mathematics examiner with 20+ years of marking experience.
The student has uploaded their completed ${level} ${paper}${year ? ' (' + year + (session ? ' ' + session : '') + ')' : ''}.

Your task is to mark this student's paper. The images show the student's handwritten work — which may include the printed question text plus their written answers, or just their answers.

MARKING RULES:
1. Identify each question number visible in the student's work
2. For each question (and each part a, b, c…), award marks according to IB Mathematics marking standards
3. M (method) marks: award if correct method is clearly shown, even with an arithmetic slip
4. A (accuracy) marks: award only if the numerical or algebraic answer is correct
5. FT (follow-through) marks: award when correct method is applied to an earlier incorrect value
6. AG (answer given) questions: student must show sufficient working — do not award if answer is copied without working
7. If a part is entirely missing, all marks for that part = 0
8. Read handwriting charitably — interpret ambiguous symbols in the student's favour when intent is clear
9. For each question part, give a brief feedback comment explaining what was done well or what mark was lost

After marking all visible questions, calculate per-topic performance using standard IB topic categories:
- Number & Algebra, Functions, Geometry & Trigonometry, Statistics & Probability, Calculus

Self-assess your confidence in this marking (0.0–1.0):
- 1.0 = very clear handwriting, well-structured answers, familiar questions
- 0.5 = some unclear writing, unusual methods, or edge cases
- <0.5 = very hard to read, unconventional approach, or very recent paper unlikely in training data

Return ONLY valid JSON — no markdown fences, no text outside the JSON.
Use exactly this structure:
{
  "questions": [
    {
      "number": "1",
      "parts": [
        {
          "part": "a",
          "maxMarks": 4,
          "awarded": 3,
          "marks": [
            { "code": "M1", "type": "M", "awarded": true,  "reason": "Correct substitution shown" },
            { "code": "A1", "type": "A", "awarded": true,  "reason": "Correct value of k" },
            { "code": "M1", "type": "M", "awarded": true,  "reason": "Method for integration present" },
            { "code": "A1", "type": "A", "awarded": false, "reason": "Forgot constant of integration" }
          ],
          "feedback": "Good method throughout; lost the final mark by omitting +C.",
          "topic": "Calculus"
        }
      ],
      "questionTotal": 3,
      "questionMax": 4
    }
  ],
  "total": 32,
  "maxTotal": 60,
  "percentage": 53,
  "overallFeedback": "2–3 sentences summarising performance, key strengths, and the most impactful area to improve.",
  "topicPerformance": [
    { "topic": "Calculus",            "awarded": 8,  "max": 12, "percentage": 67 },
    { "topic": "Functions",           "awarded": 6,  "max": 8,  "percentage": 75 },
    { "topic": "Number & Algebra",    "awarded": 10, "max": 14, "percentage": 71 },
    { "topic": "Geometry & Trig",     "awarded": 5,  "max": 10, "percentage": 50 },
    { "topic": "Statistics & Prob",   "awarded": 3,  "max": 16, "percentage": 19 }
  ],
  "strengths":    ["Good algebraic manipulation", "Clear method steps on calculus"],
  "improvements": ["Review integration constants", "Practice probability distributions"],
  "confidence": 0.82
}`;
}

// ── Call Claude with a batch of paper images ──────────────────────
async function markPaper(pages, paperInfo, studentName) {
  const textPreamble = {
    type: 'text',
    text: `The following ${pages.length} image(s) show the completed answer script of student "${studentName || 'Student'}". Please mark the work and return the JSON result:`,
  };

  const content = [
    textPreamble,
    ...pages.map(p => ({
      type: 'image',
      source: { type: 'base64', media_type: p.mediaType || 'image/jpeg', data: p.data },
    })),
  ];

  const anthController = new AbortController();
  const anthTimer = setTimeout(() => anthController.abort(), 25000); // leave 1s buffer before Netlify's 26s limit
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
        model:      MODEL,
        max_tokens: 1200,
        system:     buildSystemPrompt(paperInfo),
        messages:   [{ role: 'user', content }],
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

  const raw  = (json.content?.[0]?.text || '').trim()
    .replace(/^```[^\n]*\n?/m, '')
    .replace(/```\s*$/m, '')
    .trim();

  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error('Could not parse marking response as JSON: ' + raw.slice(0, 200));
  }
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

  // ── batchMark: auth-only batch call — no quota check, no GAS recording ──
  // Used by the client when submitting large scripts in chunks (pages 5+).
  if (action === 'batchMark') {
    if (!Array.isArray(pages) || pages.length === 0 || pages.length > BATCH_SIZE) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: `batchMark requires 1–${BATCH_SIZE} pages.` }) };
    }
    try {
      const batchResult = await markPaper(pages, paperInfo || {}, studentName || 'Student');
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, result: batchResult }) };
    } catch (e) {
      console.error('mark-script: batchMark error:', e.message);
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Batch marking failed: ' + e.message }) };
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
