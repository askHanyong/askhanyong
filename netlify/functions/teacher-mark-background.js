// ════════════════════════════════════════════════════════════════
// Teacher Mark — Background Function
// Netlify returns 202 immediately; this runs up to 15 minutes.
// Stores result in Netlify Blobs; teacher-mark-status.js polls it.
// ════════════════════════════════════════════════════════════════

const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');
// @netlify/blobs loaded lazily inside storeJob to avoid top-level crash

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SESSION_SECRET    = process.env.SESSION_SECRET;
const MODEL             = 'claude-sonnet-4-6';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function verifyTeacherToken(token) {
  if (!token || !SESSION_SECRET) return null;
  try {
    const parts    = token.split(':');
    if (parts.length < 3) return null;
    const hmac     = parts.pop();
    const expiry   = parts.pop();
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

async function storeJob(jobId, data) {
  try {
    const { getStore } = require('@netlify/blobs');
    const store = getStore('marking-jobs');
    await store.setJSON(jobId, data, { ttl: 86400 }); // 24h TTL
  } catch (e) {
    console.error('storeJob failed:', e.message);
    throw e; // propagate so handler can return a meaningful error
  }
}

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
2. **Misread (MR)**: deduct 1 mark but award FT thereafter; max 1 MR per paper
3. **3 significant figures**: accept answers correct to 3 sf unless question specifies exact
4. **METHOD 1 / METHOD 2**: alternative valid methods are fully accepted
5. **AG proofs**: candidate must show sufficient working — do not award if key steps omitted
6. **Do not penalise the same error twice**
7. **Radians vs degrees**: working in degrees loses the A mark for the result; M marks for correct method may still be awarded

## PAPER STRUCTURE (12 questions, 110 marks total)
Q1:6 Q2:4 Q3:7 Q4:9 Q5:8 Q6:5 Q7:8 Q8:8 Q9:9 Q10:16 Q11:16 Q12:14

## OUTPUT RULES
- Use the submit_marks tool. No text outside the tool call.
- Field "n" (notes): 5 words maximum. Omit "n" entirely if full marks awarded.
- Be as terse as possible.`;

// Abbreviated field names to keep output compact:
// q=question number, pts=parts, p=part label, ma=marks available,
// mi=marks awarded, n=notes (≤5 words, omit if full marks)
const MARKING_TOOL = {
  name: 'submit_marks',
  description: 'Submit complete marking. Notes (n): ≤5 words, omit if full marks.',
  input_schema: {
    type: 'object',
    required: ['questions'],
    properties: {
      questions: {
        type: 'array',
        items: {
          type: 'object',
          required: ['q', 'pts'],
          properties: {
            q:   { type: 'integer', description: 'Question number 1-12' },
            pts: {
              type: 'array',
              items: {
                type: 'object',
                required: ['p', 'ma', 'mi'],
                properties: {
                  p:  { type: 'string',  description: 'Part label e.g. "a", "b(i)"' },
                  ma: { type: 'integer', description: 'Marks available' },
                  mi: { type: 'integer', description: 'Marks awarded' },
                  n:  { type: 'string',  description: '≤5 words. Omit if full marks.' },
                },
              },
            },
          },
        },
      },
    },
  },
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS_HEADERS };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: CORS_HEADERS, body: 'Method not allowed' };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { token, studentPdf, studentName, jobId } = body;
  if (!jobId)       return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'jobId required' }) };
  if (!studentPdf)  return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'studentPdf required' }) };
  if (!studentName) return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'studentName required' }) };

  const email = verifyTeacherToken(token);
  if (!email) return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Invalid or expired session' }) };
  if (!ANTHROPIC_API_KEY) return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'API key not configured' }) };

  // Verify storage is available before starting the long Anthropic call
  try {
    await storeJob(jobId, { ready: false, studentName });
  } catch (e) {
    return { statusCode: 503, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Storage unavailable — Netlify Blobs not accessible: ' + e.message }) };
  }

  // Build content: official markscheme + student script
  const markschemeB64 = readCalibrationPdf('M24 MAAHL P1 TZ1_markscheme.pdf');

  const content = [
    {
      type: 'text',
      text: `Mark the following student script for "${studentName}" using the official IB markscheme provided. Apply all IB marking rules. Use submit_marks tool. Notes ≤5 words, omit if full marks.`,
    },
    ...(markschemeB64 ? [{
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: markschemeB64 },
      title: 'Official Markscheme — IB MAA HL May 2024 P1 TZ1',
    }] : []),
    {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: studentPdf },
      title: `Student Script: ${studentName}`,
    },
  ];

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
      await storeJob(jobId, { ready: true, error: `Anthropic ${res.status}: ${errText.slice(0, 200)}` });
      return { statusCode: 200, headers: CORS_HEADERS };
    }

    const apiResponse = await res.json();
    const toolUse     = apiResponse.content?.find(b => b.type === 'tool_use' && b.name === 'submit_marks');

    if (!toolUse || !toolUse.input?.questions?.length) {
      const stopReason = apiResponse.stop_reason || 'unknown';
      const tokens     = apiResponse.usage?.output_tokens ?? '?';
      await storeJob(jobId, { ready: true, error: `No questions returned. stop_reason="${stopReason}" output_tokens=${tokens}` });
      return { statusCode: 200, headers: CORS_HEADERS };
    }

    await storeJob(jobId, {
      ready:       true,
      studentName,
      markedBy:    email,
      timestamp:   new Date().toISOString(),
      result:      toolUse.input,
    });

  } catch (err) {
    await storeJob(jobId, { ready: true, error: err.message });
  }

  return { statusCode: 200, headers: CORS_HEADERS };
};
