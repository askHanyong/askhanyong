// ════════════════════════════════════════════════════════════════
// HAN Mark Papers — Netlify Function
// POST /api/mark
// Authorization: Bearer ADMIN_SECRET
//
// Body: {
//   markSchemeImages: [{ data: <base64>, mediaType: <string> }, ...],
//   students:         [{ name: <string>, images: [{ data, mediaType }, ...] }, ...]
// }
//
// Returns: { ok: true, results: [{ name, parts, total, maxTotal, summary }, ...] }
// ════════════════════════════════════════════════════════════════

const ANTHROPIC_API_KEY = (process.env.ANTHROPIC_API_KEY || '').trim();
const ADMIN_SECRET      = process.env.ADMIN_SECRET;
const MODEL             = 'claude-sonnet-4-6';

const CORS = {
  'Content-Type':                'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':'Content-Type, Authorization',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
};

// ── System prompt ────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an IB Mathematics examiner with 20+ years of marking experience. \
Your task is to mark a student's handwritten work strictly against the official IB mark scheme provided.

MARKING RULES:
1. Award marks ONLY as specified in the mark scheme — do not invent criteria
2. M (method marks): award if the correct method is clearly shown, even if there is an arithmetic slip
3. A (accuracy marks): award only if the numerical or algebraic answer is correct
4. FT (follow-through marks): award if the correct method was applied to an earlier incorrect value
5. AG (answer given): the student must show sufficient working to arrive at the printed answer — do not award if the answer is just copied without working
6. (M1) in brackets in the mark scheme: can be implied by subsequent correct work; does not need to be explicitly stated
7. Accept any valid alternative method described in the mark scheme
8. If a part is entirely missing from the student's work, all marks for that part are 0
9. Read handwriting carefully — if a symbol is ambiguous, interpret it charitably in the student's favour when the intent is clear

Return ONLY valid JSON — no markdown fences, no explanatory text outside the JSON.
Use exactly this structure:
{
  "parts": [
    {
      "part": "a",
      "maxMarks": 3,
      "awarded": 3,
      "marks": [
        { "code": "M1", "type": "M", "awarded": true,  "reason": "Substitutes general point into both planes" },
        { "code": "A1", "type": "A", "awarded": true,  "reason": "Π₁ calculation correctly gives 6" },
        { "code": "A1", "type": "A", "awarded": false, "reason": "Π₂ result not shown" }
      ]
    }
  ],
  "total": 3,
  "maxTotal": 8,
  "summary": "One or two examiner sentences noting key strengths and any errors."
}

Use "type": "M" for method marks, "A" for accuracy marks, "R" for reasoning marks, and "other" for anything else (e.g. AG, FT, G).`;

// ── Call Anthropic with vision ────────────────────────────────────
async function markStudent(markSchemeImages, studentImages, studentName) {
  // Build the content array: markscheme images, then student images
  const content = [
    {
      type: 'text',
      text: 'The following images show the IB Mathematics question and the official mark scheme:',
    },
    ...markSchemeImages.map(img => ({
      type: 'image',
      source: {
        type:       'base64',
        media_type: img.mediaType || 'image/jpeg',
        data:       img.data,
      },
    })),
    {
      type: 'text',
      text: `The following images show the handwritten work of student "${studentName}". ` +
            'Mark this work against the mark scheme above and return the JSON result:',
    },
    ...studentImages.map(img => ({
      type: 'image',
      source: {
        type:       'base64',
        media_type: img.mediaType || 'image/jpeg',
        data:       img.data,
      },
    })),
  ];

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      MODEL,
      max_tokens: 2048,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: 'user', content }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API ${response.status}: ${errText.slice(0, 300)}`);
  }

  const json = await response.json();
  const raw  = (json.content?.[0]?.text || '').trim();

  // Strip accidental markdown fences
  const clean = raw
    .replace(/^```[^\n]*\n?/m, '')
    .replace(/```\s*$/m, '')
    .trim();

  try {
    return JSON.parse(clean);
  } catch (e) {
    throw new Error('Could not parse marking response as JSON: ' + clean.slice(0, 200));
  }
}

// ── Handler ───────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  // Auth
  const authHeader = (event.headers['authorization'] || event.headers['Authorization'] || '').trim();
  if (!ADMIN_SECRET || authHeader !== 'Bearer ' + ADMIN_SECRET) {
    return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  if (!ANTHROPIC_API_KEY) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }) };
  }

  // Parse body
  let body;
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : (event.body || '{}');
    body = JSON.parse(raw);
  } catch (e) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { markSchemeImages, students } = body;

  if (!Array.isArray(markSchemeImages) || markSchemeImages.length === 0) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'markSchemeImages is required and must be a non-empty array' }) };
  }
  if (!Array.isArray(students) || students.length === 0) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'students is required and must be a non-empty array' }) };
  }

  // Process students in parallel (capped at 5)
  const capped = students.slice(0, 5);

  const results = await Promise.all(
    capped.map(async (student) => {
      const name   = student.name  || 'Student';
      const images = Array.isArray(student.images) ? student.images : [];
      try {
        const result = await markStudent(markSchemeImages, images, name);
        return { name, ...result };
      } catch (e) {
        console.error(`mark.js: error marking ${name}:`, e.message);
        return {
          name,
          error:    e.message,
          parts:    [],
          total:    0,
          maxTotal: 0,
          summary:  'Marking failed — ' + e.message,
        };
      }
    })
  );

  return {
    statusCode: 200,
    headers:    CORS,
    body:       JSON.stringify({ ok: true, results }),
  };
};
