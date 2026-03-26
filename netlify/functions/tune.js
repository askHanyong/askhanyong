// ════════════════════════════════════════════════════════════════
// HAN System Prompt Tuning — Admin-only style analysis tool
// POST /api/tune
// Authorization: Bearer ADMIN_SECRET
//
// Modes:
//   han     → Get HAN's current answer for a question (for comparison)
//   analyze → Analyze style differences across collected examples
//             and return updated system prompt rules
// ════════════════════════════════════════════════════════════════

const https = require('https');

const ADMIN_SECRET      = process.env.ADMIN_SECRET;
const ANTHROPIC_API_KEY = (process.env.ANTHROPIC_API_KEY || '').trim();

const CORS = {
  'Content-Type':                'application/json',
  'Access-Control-Allow-Origin': '*',
};

// ── HAN system prompt (keep in sync with edge-functions/claude.js) ─
const HAN_SYSTEM_PROMPT = `You are HAN, an IB Mathematics AA HL tutor with 20+ years of IB examining experience. You solve questions the way Hanyong Lim does — with examiner precision, efficiency, and genuine care for the student's marks.

STYLE RULES:

1. ORIENT FIRST
Restate the key given information before working. Label the question type (e.g. "G.P.", "c.r.v.", "pdf", "induction"). This grounds the student immediately.

2. NUMBER YOUR EQUATIONS
For simultaneous systems, always label equations — (1) and (2) — and write "(1)−(2):" to show the elimination step. Never skip this.

3. DRAW TO SIMPLIFY
For geometry, trig, vectors, and complex numbers — describe or reference a simplified diagram focusing only on the relevant triangle, shape, or Argand plane. Annotate key values directly.

4. USE ⇒ TO SHOW LOGICAL FLOW
Each line should follow clearly from the last using ⇒. Show the chain of reasoning — don't skip steps silently.

5. BE SPECIFIC ABOUT GDC (Paper 2)
Don't just say "use GDC." Tell the student exactly what to key in, what to plot, and what to look for (roots, intersections, max/min). Say explicitly when manual working is NOT needed.

6. REWARD EFFICIENCY — ALWAYS MENTION THE FASTEST METHOD
After a solution, if a faster valid approach exists, flag it. Label it "Faster approach:" and explain why it saves time. This is a hallmark of HAN's teaching.

7. FLAG MARK-LOSING MISTAKES — PRECISELY
After each solution, add a "Note:" that flags the most common student error for that exact question type. Be specific — not "be careful" but "many students write X, which loses the final mark because..."

8. FLAG "THIS LINE MUST BE SEEN"
For steps that examiners specifically require (e.g. showing discriminant < 0 for domain of log, stating the inductive assumption correctly), explicitly warn: "This line must be seen by the examiner."

9. MARK AWARENESS
Where relevant, note which step earns the mark (M1, A1) so students understand what the examiner rewards. For "show that" questions, make clear where the proof lands.

10. ACKNOWLEDGE MULTIPLE METHODS — GIVE THE PRINCIPLE
Where multiple valid approaches exist, acknowledge them and give a general rule of thumb (e.g. "If right-angled triangles exist, use standard trig ratios. If not, use sine/cosine rule.")

11. PAPER 1 VS PAPER 2 AWARENESS
On Paper 1: stress exact values, no GDC, and mental arithmetic discipline.
On Paper 2: actively direct students to GDC for numerical results — no need to work manually.

12. SKETCHING STANDARDS
When a sketch is required: remind students that decent sketching is required. Always specify what must appear: end points, max/min, x and y intercepts, asymptotes, symmetry.

TONE:
Calm, precise, efficient. You respect the student's time. You think like an examiner — you know exactly where marks are won and lost, and you make that transparent. Never condescending. Never vague.`;

// ── Claude API helper ─────────────────────────────────────────────
function callClaude(system, userMessage, model, maxTokens) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userMessage }],
    });

    const req = https.request({
      hostname: 'api.anthropic.com',
      path:     '/v1/messages',
      method:   'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta':    'pdfs-2024-09-25',
        'Content-Length':    Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) reject(new Error(parsed.error.message));
          else resolve(parsed.content?.[0]?.text || '');
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

// ── Style analysis prompt ─────────────────────────────────────────
function buildAnalysisPrompt(examples) {
  const exText = examples.map((ex, i) =>
    `EXAMPLE ${i + 1}
QUESTION:
${ex.question}

HAN'S CURRENT ANSWER:
${ex.hanAnswer}

HANYONG'S IDEAL ANSWER:
${ex.myAnswer}`
  ).join('\n\n' + '─'.repeat(60) + '\n\n');

  return `You are refining the system prompt of HAN, an AI tutor built to teach like Hanyong Lim (IB Math examiner, 20+ years).

Below are ${examples.length} side-by-side examples: HAN's current output vs. how Hanyong would actually explain it.

${exText}

════════════════════════════════════════════════════════════════
TASK:

1. STYLE ANALYSIS
   Describe clearly what makes Hanyong's explanations distinctive. Focus on:
   - Opening/framing moves (how he introduces a problem)
   - Vocabulary, transitions, and sentence rhythm
   - What he emphasises vs. what HAN over- or under-does
   - Pedagogical habits unique to him (e.g. things he always says, always warns about)
   - Tone and register differences

2. NEW RULES (3–6 rules)
   Write specific new rules in exactly the same format as the existing ones:
   "N. RULE NAME IN CAPS\n[One short paragraph explaining the rule with an example if helpful]"
   Only write rules that are genuinely missing from the current prompt.

3. MODIFICATIONS TO EXISTING RULES
   List any existing rules that need to be reworded to better match Hanyong's style.
   Format: "Rule X: [old wording] → [new wording]"

4. FULL UPDATED SYSTEM PROMPT
   Output the complete updated HAN system prompt — existing rules (with any modifications applied) plus new rules integrated in logical order. Preserve all Desmos graph instructions exactly.

Current system prompt for reference:
════════════════════════════════════════════════════════════════
${HAN_SYSTEM_PROMPT}
════════════════════════════════════════════════════════════════`;
}

// ── Handler ───────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        ...CORS,
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  // Auth
  const authHeader = (event.headers.authorization || event.headers.Authorization || '');
  if (!ADMIN_SECRET || !authHeader.startsWith('Bearer ') || authHeader.slice(7) !== ADMIN_SECRET) {
    return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  // ── Mode: han ─────────────────────────────────────────────────
  if (body.mode === 'han') {
    const { question, imageBase64, imageType } = body;
    if (!question?.trim() && !imageBase64) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'question or image required' }) };
    }
    // Build content array (text + optional image)
    const userContent = [];
    if (imageBase64) {
      userContent.push({ type: 'image', source: { type: 'base64', media_type: imageType || 'image/jpeg', data: imageBase64 } });
    }
    userContent.push({ type: 'text', text: question?.trim() || 'Please solve this question.' });
    try {
      const answer = await callClaude(
        HAN_SYSTEM_PROMPT,
        userContent,
        'claude-sonnet-4-6',
        1500
      );
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ answer }) };
    } catch (e) {
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
    }
  }

  // ── Mode: analyze ─────────────────────────────────────────────
  if (body.mode === 'analyze') {
    const { examples } = body;
    if (!Array.isArray(examples) || examples.length < 2) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'At least 2 examples required' }) };
    }
    for (const ex of examples) {
      if (!ex.question?.trim() || !ex.hanAnswer?.trim() || !ex.myAnswer?.trim()) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Each example needs question, hanAnswer, and myAnswer' }) };
      }
    }
    try {
      const analysis = await callClaude(
        'You are an expert at analysing teaching styles and writing precise AI system prompts. Be specific and actionable.',
        buildAnalysisPrompt(examples),
        'claude-sonnet-4-6',
        4096
      );
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ analysis }) };
    } catch (e) {
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
    }
  }

  // ── Mode: transcribe ──────────────────────────────────────────
  if (body.mode === 'transcribe') {
    const { imageBase64, imageType } = body;
    if (!imageBase64 || !imageType) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'imageBase64 and imageType required' }) };
    }
    const isPdf = imageType === 'application/pdf';
    const contentBlock = isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: imageBase64 } }
      : { type: 'image', source: { type: 'base64', media_type: imageType, data: imageBase64 } };
    const userContent = [
      contentBlock,
      { type: 'text', text: 'Please transcribe all handwritten text and working from this ' + (isPdf ? 'PDF' : 'image') + ' exactly as written. Preserve mathematical notation, line breaks, and structure. Output only the transcribed content — no commentary.' },
    ];
    try {
      const text = await callClaude('You are an expert at reading handwritten mathematical working. Transcribe faithfully without adding or omitting anything.', userContent, 'claude-sonnet-4-6', 2000);
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ text }) };
    } catch (e) {
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
    }
  }

  return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'mode must be "han", "analyze", or "transcribe"' }) };
};
