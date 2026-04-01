// ════════════════════════════════════════════════════════════════
// Teacher Mark — Background Function
// Netlify Background Functions return 202 immediately and run for
// up to 15 minutes.  The result is stored in Netlify Blobs so the
// frontend can poll /api/teacher-mark-status?jobId=<id> for it.
// ════════════════════════════════════════════════════════════════

const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');
const { getStore } = require('@netlify/blobs');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SESSION_SECRET    = process.env.SESSION_SECRET;
const MODEL             = 'claude-sonnet-4-6';
const BLOB_STORE        = 'marking-jobs';
const JOB_TTL           = 3600; // 1 hour

// ── Teacher token verification ────────────────────────────────────
function verifyTeacherToken(token) {
  if (!token || !SESSION_SECRET) return null;
  try {
    const parts   = token.split(':');
    if (parts.length < 3) return null;
    const hmac    = parts.pop();
    const expiry  = parts.pop();
    const emailB64 = parts.join(':');
    const payload  = `${emailB64}:${expiry}`;
    const expected = crypto.createHmac('sha256', SESSION_SECRET + ':teacher').update(payload).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expected, 'hex'))) return null;
    if (Date.now() > parseInt(expiry, 10)) return null;
    const decoded = Buffer.from(emailB64, 'base64').toString();
    if (!decoded.startsWith('T:')) return null;
    return decoded.slice(2);
  } catch { return null; }
}

// ── Read calibration PDF as base64 ───────────────────────────────
function readCalibrationPdf(filename) {
  const candidates = [
    path.join(__dirname, 'calibration', filename),
    path.join(__dirname, '..', '..', 'calibration', filename),
    path.join(process.cwd(), 'calibration', filename),
  ];
  for (const p of candidates) {
    try { return fs.readFileSync(p).toString('base64'); } catch {}
  }
  return null;
}

// ── System prompt & marking tool (same as teacher-mark.js) ───────
const SYSTEM_PROMPT = `You are a senior IB Mathematics Analysis & Approaches HL examiner with 15 years of experience.
You are marking the IB MAA HL May 2024 Paper 1 TZ1 exam script.

## MARK TYPES
- **M** (Method): awarded for correct method even if arithmetic error follows
- **A** (Accuracy): dependent on preceding M mark unless stated otherwise
- **R** (Reasoning): must be accompanied by a correct, explicit statement
- **AG** (Answer Given): the answer is printed — full working MUST be shown
- **(M1)** / **(A1)**: implied marks — awarded if correct answer seen without explicit working

## KEY RULES
1. **Follow-Through (FT)**: award FT marks if method is correct but follows an earlier error
2. **Misread (MR)**: if candidate misreads data, deduct 1 mark but award FT thereafter; max 1 MR per paper
3. **3 significant figures**: accept answers correct to 3 sf unless question specifies exact; penalise wrong sf only once per paper
4. **METHOD 1 / METHOD 2**: alternative valid methods are fully accepted
5. **AG proofs**: if answer is given, candidate must show sufficient working — do not award if key steps omitted
6. **Do not penalise the same error twice**
7. **Radians vs degrees**: Paper 1 assumes radian mode; working in degrees loses the A mark for the result, but M marks for correct method structure may still be awarded

## PAPER STRUCTURE (12 questions, 110 marks total)
Q1:6 Q2:4 Q3:7 Q4:9 Q5:8 Q6:5 Q7:8 Q8:8 Q9:9 Q10:16 Q11:16 Q12:14

## CALIBRATION EXAMPLES

### Student A — 109/110 (near-perfect)
- Q1(a): Correct simultaneous equations, q=3 p=4. 4/4
- Q1(b): 10×3=30. 2/2
- Q2(a): log₁₀(1/a)=-1/3. 2/2
- Q2(b): log₁₀₀₀a=1/9. 2/2
- Q3(a): Perimeter 2r+rθ=10 AND Area ½r²θ=6.25, derived 4r²-20r+25=0. Full marks AG.
- Q3(b): (2r-5)²=0, r=5/2, θ=2 rad. 2/2
- Q4(a): cosx=2sinxcosx → cosx(1-2sinx)=0, rejected cosx=0, x=π/6 or 5π/6. 5/5
- Q4(b): ∫[π/6 to 5π/6](cosx-sin2x)dx=1/4. 4/4
- Q5(a): Sₙ=(10ⁿ-1)/9, a=10 b=9. 3/3
- Q5(b): [10(10ⁿ-1)-9n]/81. 5/5
- Q6: π∫x·sin(x²)dx substitution, π(2-√2)/4. 5/5
- Q7: Full induction proof with conclusion. 8/8
- Q8: All parts correct. 8/8
- Q9: All parts correct. 9/9
- Q10: All parts correct. 16/16
- Q11: All parts correct (minus 1 unspecified). ~15/16
- Q12: All parts correct. 14/14

### Student B — 77/110 (mid-range)
- Q2(b): Computed 1/3÷3=1 instead of 1/9. 0/2
- Q4(a): Worked in degrees (x=30° or 150°). Lost A marks, kept M marks.
- Q5(b): Denominator 9^(n+1) instead of 81. Partial credit lost.
- Q9(c)(i): Got 1.6 instead of -1.6. 0/2
- Q9(c)(ii): Got 6.4 by 1.6×2+1.6×2, not recognising f(x) odd. 0/2
- Q10(c): Axis of symmetry error, p=3.5 instead of 4.5. Cascading errors in d,e,f.
- Q12(c): v=-2 but w missing.
- Q12(d-g): Incomplete.

### Student C — 43/110 (lower range)
- Q1(a): Equation error: p+2q+38=3 → wrong values. M1 only.
- Q1(b): FT 10×3=30 awarded. 2/2 FT
- Q2(a): Used division not subtraction: 0/2
- Q2(b): Carried wrong value: 0/2
- Q3(a): Perimeter rθ=10 only (missed 2r). Lost M1 for perimeter.
- Q3(b): Used given AG equation correctly, r=5/2 θ=2. 2/2
- Q4(a): Did not reject cosx=0, lost R mark. Partial.
- Q4(b): Wrong antiderivative sign and wrong limit. 0/4
- Q5(a): Correct. 3/3
- Q6: Forgot ½ from substitution. Partial method.
- Q7: Mostly correct. ~7/8
- Q8(a): Correct. 3/3
- Q8(b): cos(x²)≈1-x²/2 instead of 1-x⁴/2. Lost A marks.
- Q9(a,b): Correct. Full marks.
- Q9(c): Same errors as Student B.
- Q10(a-c): Mostly correct.
- Q10(d-f): Errors from wrong g(x).
- Q12(a,b): Sign error in expansion. 0/6
- Q12(c): Correct v=-2, w=1-√3i. 1/1
- Q12(d-g): Partially attempted.`;

const MARKING_TOOL = {
  name: 'submit_marks',
  description: 'Submit the complete structured marking result for this student script.',
  input_schema: {
    type: 'object',
    required: ['questions', 'total_awarded', 'total_available', 'examiner_summary'],
    properties: {
      questions: {
        type: 'array',
        items: {
          type: 'object',
          required: ['number', 'parts'],
          properties: {
            number: { type: 'integer' },
            parts: {
              type: 'array',
              items: {
                type: 'object',
                required: ['part', 'marks_available', 'marks_awarded'],
                properties: {
                  part:            { type: 'string' },
                  marks_available: { type: 'integer' },
                  marks_awarded:   { type: 'integer' },
                  mark_breakdown:  { type: 'string' },
                  criteria_met:    { type: 'array', items: { type: 'string' } },
                  criteria_missed: { type: 'array', items: { type: 'string' } },
                  ft_applied:      { type: 'boolean' },
                  notes:           { type: 'string' },
                },
              },
            },
          },
        },
      },
      total_awarded:    { type: 'integer' },
      total_available:  { type: 'integer', enum: [110] },
      examiner_summary: { type: 'string' },
    },
  },
};

// ── Handler ───────────────────────────────────────────────────────
exports.handler = async (event) => {
  // Netlify returns 202 automatically for background functions —
  // we still validate early so bad requests fail fast.
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { token, studentPdf, studentName, jobId } = body;

  if (!jobId)       return { statusCode: 400, body: JSON.stringify({ error: 'jobId required' }) };
  if (!token)       return { statusCode: 401, body: JSON.stringify({ error: 'token required' }) };
  if (!studentPdf)  return { statusCode: 400, body: JSON.stringify({ error: 'studentPdf required' }) };
  if (!studentName) return { statusCode: 400, body: JSON.stringify({ error: 'studentName required' }) };

  const email = verifyTeacherToken(token);
  if (!email) return { statusCode: 401, body: JSON.stringify({ error: 'Invalid or expired teacher session' }) };

  if (!ANTHROPIC_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'API key not configured' }) };
  }

  const store = getStore(BLOB_STORE);

  // Mark job as in-progress
  await store.set(jobId, JSON.stringify({ ready: false }), { ttl: JOB_TTL });

  // Build content
  const markschemeB64    = readCalibrationPdf('M24 MAAHL P1 TZ1_markscheme.pdf');
  const questionPaperB64 = readCalibrationPdf('M24 MAAHL P1 TZ1.pdf');

  const content = [
    { type: 'text', text: 'You are marking the IB MAA HL May 2024 Paper 1 TZ1. Below are the question paper and official markscheme, followed by the student script to mark.' },
  ];

  if (questionPaperB64) {
    content.push({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: questionPaperB64 },
      title: 'Question Paper: IB MAA HL May 2024 Paper 1 TZ1',
      cache_control: { type: 'ephemeral' },
    });
  }

  if (markschemeB64) {
    content.push({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: markschemeB64 },
      title: 'Official Markscheme: IB MAA HL May 2024 Paper 1 TZ1',
      cache_control: { type: 'ephemeral' },
    });
  }

  content.push({
    type: 'text',
    text: `Now mark the following student script for "${studentName}". Go question by question, part by part. Apply all IB marking rules and the calibration guidance. Use the submit_marks tool to return your structured result.`,
  });

  content.push({
    type: 'document',
    source: { type: 'base64', media_type: 'application/pdf', data: studentPdf },
    title: `Student Script: ${studentName}`,
  });

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta':    'pdfs-2024-09-25',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:       MODEL,
        max_tokens:  4096,
        system:      SYSTEM_PROMPT,
        tools:       [MARKING_TOOL],
        tool_choice: { type: 'tool', name: 'submit_marks' },
        messages:    [{ role: 'user', content }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      await store.set(jobId, JSON.stringify({ ready: true, error: `Anthropic ${res.status}: ${errText}` }), { ttl: JOB_TTL });
      return { statusCode: 200 };
    }

    const apiResponse = await res.json();
    const toolUse     = apiResponse.content?.find(b => b.type === 'tool_use' && b.name === 'submit_marks');

    if (!toolUse) {
      await store.set(jobId, JSON.stringify({ ready: true, error: 'Marking engine did not return structured result' }), { ttl: JOB_TTL });
      return { statusCode: 200 };
    }

    await store.set(jobId, JSON.stringify({
      ready:       true,
      studentName,
      markedBy:    email,
      timestamp:   new Date().toISOString(),
      result:      toolUse.input,
    }), { ttl: JOB_TTL });

  } catch (err) {
    await store.set(jobId, JSON.stringify({ ready: true, error: err.message }), { ttl: JOB_TTL });
  }

  return { statusCode: 200 };
};
