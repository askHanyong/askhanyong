// ════════════════════════════════════════════════════════════════
// HAN Accuracy Evaluation — Admin-only batch evaluation runner
// POST /api/evaluate
// Authorization: Bearer ADMIN_SECRET
//
// Actions:
//   ping   — verify auth without running evaluation
//   run    — evaluate a batch of questions and save scores
// ════════════════════════════════════════════════════════════════

const https = require('https');

const ADMIN_SECRET = process.env.ADMIN_SECRET;
const ANTHROPIC_API_KEY = (process.env.ANTHROPIC_API_KEY || '').trim();
const GAS_URL = process.env.GAS_URL || '';          // Google Apps Script web app URL
const GAS_SECRET = process.env.GAS_ADMIN_SECRET || process.env.ADMIN_SECRET || '';

// Models
const HAN_MODEL   = 'claude-sonnet-4-20250514';    // same as production edge function
const JUDGE_MODEL = 'claude-haiku-4-5-20251001';   // cheaper for scoring

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

// ── HAN system prompt (matches production edge function) ─────────
const HAN_SYSTEM_PROMPT = `You are HAN, an IB Mathematics AA HL tutor with 20+ years of IB examining experience. You solve questions the way Hanyong Lim does — with examiner precision, efficiency, and genuine care for the student's marks.

STYLE RULES:

1. ORIENT FIRST
Restate the key given information before working. Label the question type (e.g. "G.P.", "c.r.v.", "pdf", "induction"). This grounds the student immediately.

2. NUMBER YOUR EQUATIONS
For simultaneous systems, always label equations — (1) and (2) — and write "(1)−(2):" to show the elimination step. Never skip this.

3. USE ⇒ TO SHOW LOGICAL FLOW
Each line should follow clearly from the last using ⇒. Show the chain of reasoning — don't skip steps silently.

4. FLAG MARK-LOSING MISTAKES — PRECISELY
After each solution, add a "Note:" that flags the most common student error for that exact question type. Be specific.

5. MARK AWARENESS
Where relevant, note which step earns the mark (M1, A1) so students understand what the examiner rewards.

TONE:
Calm, precise, efficient. You respect the student's time. You think like an examiner.`;

// ── LLM-as-judge scoring rubric ──────────────────────────────────
// Returns a score 0-8 across 5 dimensions:
//   Final Answer   0-2  (correct value/expression)
//   Method         0-2  (correct approach, key steps present)
//   Mark Scheme    0-2  (IB examiner would award full marks)
//   IB Presentation 0-1 (layout, notation, labelling)
//   Examiner Note  0-1  (useful tip about common mistakes)
function buildJudgePrompt(question, level, topic, marks, goldAnswer, keySteps, hanResponse) {
  return `You are an IB Mathematics examiner scoring an AI tutor's response.

QUESTION (${level}, ${topic}, ${marks} marks):
${question}

GOLD ANSWER (official solution / key steps):
Gold Answer: ${goldAnswer}
Key Steps: ${keySteps}

HAN'S RESPONSE:
${hanResponse}

Score HAN's response on these 5 dimensions. Return ONLY valid JSON — no markdown, no explanation.

Scoring dimensions:
1. final_answer   (0-2): Is the final numerical/algebraic answer correct? 2=fully correct, 1=minor error, 0=wrong
2. method         (0-2): Is the method correct and all key steps present? 2=complete, 1=mostly correct with gap, 0=wrong method
3. mark_scheme    (0-2): Would an IB examiner award full marks? 2=yes, 1=would lose ≤1 mark, 0=would lose ≥2 marks
4. ib_presentation (0-1): Is IB notation/layout/labelling correct? 1=yes, 0=issues
5. examiner_note  (0-1): Does HAN flag the key common mistake for this question type? 1=yes, 0=no/vague

Return exactly this JSON:
{
  "final_answer": <0|1|2>,
  "method": <0|1|2>,
  "mark_scheme": <0|1|2>,
  "ib_presentation": <0|1>,
  "examiner_note": <0|1>,
  "total": <0-8>,
  "reasoning": "<1-2 sentence explanation of the most important score deduction, if any>"
}`;
}

// ── HTTP helper — call Anthropic API (non-streaming) ─────────────
function callAnthropic(model, systemPrompt, userMessage, maxTokens) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }), 'utf8');

    const req = https.request({
      hostname: 'api.anthropic.com',
      path:     '/v1/messages',
      method:   'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length':    body.length,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          const json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (json.error) return reject(new Error(json.error.message || 'Anthropic error'));
          const text = json.content?.[0]?.text || '';
          resolve(text);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── GAS helpers ──────────────────────────────────────────────────
function gasGet(params) {
  return new Promise((resolve, reject) => {
    const qs = new URLSearchParams(params).toString();
    const url = new URL(GAS_URL + '?' + qs);
    https.get({ hostname: url.hostname, path: url.pathname + url.search }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// ── Evaluate a single question ────────────────────────────────────
async function evaluateQuestion(q) {
  const levelLabel = q.level || 'MAA HL';

  // Build level-aware system prompt for HAN
  const levelNote = levelLabel.includes('SL')
    ? '\n\nIMPORTANT: This is a Standard Level (SL) question. Apply SL scope only.'
    : '';

  // 1. Get HAN's answer
  const hanResponse = await callAnthropic(
    HAN_MODEL,
    HAN_SYSTEM_PROMPT + levelNote,
    q.question,
    1500
  );

  // 2. Score with LLM-as-judge
  const judgePrompt = buildJudgePrompt(
    q.question,
    levelLabel,
    q.topic || '',
    q.marks || '?',
    q.goldAnswer || '',
    q.keySteps || '',
    hanResponse
  );

  const judgeRaw = await callAnthropic(JUDGE_MODEL, '', judgePrompt, 512);

  let scores;
  try {
    // Strip any accidental markdown fences before parsing
    const clean = judgeRaw.replace(/^```[^\n]*\n?/m, '').replace(/```$/m, '').trim();
    scores = JSON.parse(clean);
    // Ensure total is computed correctly even if judge drifts
    const computed = (scores.final_answer || 0) + (scores.method || 0) +
      (scores.mark_scheme || 0) + (scores.ib_presentation || 0) + (scores.examiner_note || 0);
    scores.total = computed;
  } catch (e) {
    scores = { final_answer: 0, method: 0, mark_scheme: 0, ib_presentation: 0, examiner_note: 0, total: 0, reasoning: 'Parse error: ' + judgeRaw.slice(0, 100) };
  }

  return {
    questionId:    q.questionId,
    level:         levelLabel,
    topic:         q.topic || '',
    subtopic:      q.subtopic || '',
    marks:         q.marks || '',
    difficulty:    q.difficulty || '',
    hanResponse,
    scores,
    pct:           Math.round((scores.total / 8) * 100),
    evaluatedAt:   new Date().toISOString(),
  };
}

// ── Main handler ─────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };
  }

  // Auth
  if (!ADMIN_SECRET) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: { message: 'ADMIN_SECRET not configured' } }) };
  }
  const auth = event.headers['authorization'] || event.headers['Authorization'] || '';
  if (auth !== 'Bearer ' + ADMIN_SECRET) {
    return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: { message: 'Unauthorized' } }) };
  }

  // Parse body
  let body;
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : (event.body || '{}');
    body = JSON.parse(raw);
  } catch (e) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: { message: 'Invalid JSON body' } }) };
  }

  // Ping — verify auth without running evaluation
  if (body.action === 'ping') {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
  }

  // Validate prerequisites for run
  if (!ANTHROPIC_API_KEY) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: { message: 'ANTHROPIC_API_KEY not set' } }) };
  }
  if (!GAS_URL) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: { message: 'GAS_URL not set' } }) };
  }

  // Run evaluation
  if (body.action !== 'run') {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: { message: 'Unknown action. Use "run" or "ping".' } }) };
  }

  // Fetch questions from GAS
  // Supports optional filters: level (MAA HL / MAA SL), topic, limit
  const gasParams = {
    action: 'getEvalQuestions',
    secret: GAS_SECRET,
  };
  if (body.level)  gasParams.level  = body.level;
  if (body.topic)  gasParams.topic  = body.topic;
  if (body.limit)  gasParams.limit  = String(body.limit);

  let questions;
  try {
    const gasResp = await gasGet(gasParams);
    if (!gasResp.questions || !Array.isArray(gasResp.questions)) {
      return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: { message: 'GAS did not return questions', raw: gasResp } }) };
    }
    questions = gasResp.questions;
  } catch (e) {
    return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: { message: 'Failed to fetch questions from GAS: ' + e.message } }) };
  }

  if (questions.length === 0) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, evaluated: 0, message: 'No questions with gold answers found. Add Gold Answer + Key Steps to the Questions sheet first.' }) };
  }

  // Evaluate each question (sequentially to avoid rate limits)
  const results = [];
  const errors  = [];

  for (const q of questions) {
    try {
      const result = await evaluateQuestion(q);
      results.push(result);

      // Save each result to GAS immediately so partial runs are persisted
      try {
        await gasGet({
          action:     'saveEvalResult',
          secret:     GAS_SECRET,
          questionId: result.questionId,
          level:      result.level,
          topic:      result.topic,
          subtopic:   result.subtopic,
          marks:      result.marks,
          difficulty: result.difficulty,
          pct:        String(result.pct),
          scoreJson:  JSON.stringify(result.scores),
          reasoning:  result.scores.reasoning || '',
          evaluatedAt: result.evaluatedAt,
        });
      } catch (saveErr) {
        errors.push({ questionId: q.questionId, phase: 'save', error: saveErr.message });
      }
    } catch (evalErr) {
      errors.push({ questionId: q.questionId, phase: 'eval', error: evalErr.message });
    }
  }

  // Compute summary
  const pcts   = results.map(r => r.pct);
  const avgPct = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0;

  // Group by level
  const byLevel = {};
  for (const r of results) {
    if (!byLevel[r.level]) byLevel[r.level] = [];
    byLevel[r.level].push(r.pct);
  }
  const levelSummary = {};
  for (const [lvl, arr] of Object.entries(byLevel)) {
    levelSummary[lvl] = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
  }

  return {
    statusCode: 200,
    headers: CORS,
    body: JSON.stringify({
      ok:         true,
      evaluated:  results.length,
      errors:     errors.length,
      avgPct,
      byLevel:    levelSummary,
      results:    results.map(r => ({
        questionId: r.questionId,
        level:      r.level,
        topic:      r.topic,
        pct:        r.pct,
        scores:     r.scores,
      })),
      errorDetails: errors,
    }),
  };
};
