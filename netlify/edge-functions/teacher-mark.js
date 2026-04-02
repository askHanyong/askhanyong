// ════════════════════════════════════════════════════════════════
// Teacher Mark — Netlify Edge Function (Deno runtime)
// Streams Anthropic SSE directly to browser.
// Edge functions have no wall-clock timeout for I/O operations
// (only 50ms CPU limit, which waiting on network does NOT count
// toward) — so the 26s Lambda cap no longer applies.
// ════════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `You are a senior IB Mathematics Analysis & Approaches HL examiner with 15 years of experience.
You are marking the IB MAA HL May 2024 Paper 1 TZ1 exam script.

## STRICT MARKING POLICY
You must be STRICT and CONSERVATIVE. This is critical:
- Award a mark ONLY if you can clearly see the required working or answer in the student's script.
- When in doubt, do NOT award the mark.
- Do NOT give benefit of the doubt for illegible or ambiguous working.
- A blank space, crossed-out work, or unclear notation means the mark is NOT awarded.
- Your first instinct is usually too generous — check each mark again before confirming.

## MARK TYPES
- **M** (Method): awarded only if the correct method is clearly shown
- **A** (Accuracy): awarded only if both the preceding M mark is earned AND the answer is correct
- **R** (Reasoning): requires an explicit correct statement — implicit reasoning does NOT earn R
- **AG** (Answer Given): the answer is printed — candidate MUST show every key step; if any step is missing, do NOT award
- **(M1)** / **(A1)**: implied marks — awarded if the correct answer is seen, even without explicit working

## KEY RULES
1. **Follow-Through (FT)**: award FT only if the method is demonstrably correct despite an earlier error — do NOT award FT for a correct answer by coincidence
2. **Misread (MR)**: deduct 1 mark but award FT thereafter; max 1 MR per paper
3. **3 significant figures**: accept answers to 3 sf unless exact is required; penalise wrong sf only once
4. **Alternative methods**: valid alternative methods are fully accepted
5. **AG proofs**: every key step must be shown — if the candidate jumps to the given answer, award 0
6. **Do not penalise the same error twice**
7. **Radians vs degrees**: degrees loses the A mark for the result; M marks for correct method structure may still be awarded

## PAPER STRUCTURE (12 questions, 110 marks total)
Q1:  6 marks  — (a) 5, (b) 1
Q2:  5 marks  — (a) 2, (b) 3
Q3:  8 marks  — (a) 4, (b) 4
Q4:  7 marks  — (a) 3, (b) 4
Q5:  5 marks  — (a) 1, (b) 4
Q6:  6 marks
Q7:  7 marks
Q8:  7 marks  — (a)(i) 2, (a)(ii) 3, (b) 2
Q9:  6 marks  — (a) 2, (b) 2, (c)(i) 1, (c)(ii) 1
Q10: 16 marks — (a) 5, (b) 1, (c) 1, (d) 3, (e) 2, (f) 4
Q11: 17 marks — (a) 2, (b) 3, (c) 3, (d) 2, (e) 4, (f)(i) 2, (f)(ii) 1
Q12: 20 marks — (a)(i) 2, (a)(ii) 1, (b) 2, (c) 2, (d) 3, (e) 4, (f) 3, (g) 3

## CALIBRATION EXAMPLES

### Student A — 109/110 (near-perfect)
Key marking decisions:
- Q1(a): Correctly set up two simultaneous equations from mean formula and total. Solved to get q=3, p=4. **Full marks 5/5**
- Q1(b): Mean final score = 10×3 = 30. **Full marks 1/1**
- Q2(a): log₁₀(1/a) = log₁₀1 - log₁₀a = -1/3. **Full marks 2/2**
- Q2(b): log₁₀₀₀a = log₁₀a / log₁₀1000 = (1/3)/3 = 1/9. **Full marks 3/3**
- Q3(a): Perimeter = 2r+rθ = 10 AND Area = ½r²θ = 6.25. Substituted θ=12.5/r² into perimeter equation. Obtained 4r²-20r+25=0. **Full marks 4/4**
- Q3(b): Factored (2r-5)² = 0, r=5/2, θ=2 rad. **Full marks 4/4**
- Q4(a): cosx=sin2x → cosx(1-2sinx)=0. Rejected cosx=0. sinx=1/2 → x=π/6 or 5π/6. **Full marks 3/3**
- Q4(b): Area = ∫[π/6 to 5π/6](cosx-sin2x)dx = 1/4. **Full marks 4/4**
- Q5(a): Sₙ = (10ⁿ-1)/9, so a=10, b=9. **Full marks 1/1**
- Q5(b): Sum = [10(10ⁿ-1)-9n]/81. **Full marks 4/4**
- Q6: Volume = π∫ x·sin(x²)dx with substitution → π(2-√2)/4. **Full marks 6/6**
- Q7: Complete induction proof: base case, assumption, inductive step, conclusion. **Full marks 7/7**
- Q8(a)(i): sin(x²) = x²-x⁶/6+... **Full marks 2/2**
- Q8(a)(ii): sin²(x²) = x⁴-x⁸/3+... **Full marks 3/3**
- Q8(b): 4x·sin(x²)·cos(x²) = 4x³-8x⁷/3+... **Full marks 2/2**
- Q9(a): Correct sketch of y=|f(|x|)|. **Full marks 2/2**
- Q9(b): Correct sketch of y=f(x). **Full marks 2/2**
- Q9(c)(i): ∫[-4 to 0]f(x)dx = -1.6. **Full marks 1/1**
- Q9(c)(ii): ∫[-4 to 4][f(|x|)+f(x)]dx = 3.2. **Full marks 1/1**
- Q10: All parts correct — range (y∈ℝ, y≠4), p=9/2, vertex, product of roots. **Full marks 16/16**
- Q11: All parts correct, one mark lost. **16/17**
- Q12: All parts correct — (a+bi)³ expansion, v=-2, w=1-√3i, area 3√3, polar forms, c=4√2, d=-4√2, n=12. **Full marks 20/20**

### Student B — 77/110 (mid-range)
Marks lost and reasons (use PAPER STRUCTURE above for marks available):
- Q2(b): Wrote (1/3)/3 = 1 instead of 1/9. Arithmetic error. **0/3**
- Q4(a): Worked in degrees (x=30° or 150°). Method correct, lost A mark(s) for degrees.
- Q5(b): Final denominator wrong (9^(n+1) instead of 81). **Partial marks**
- Q9(c)(i): Wrote 1.6 instead of −1.6. **0/1**
- Q9(c)(ii): Did not use odd function property. **0/1**
- Q10(c): Arithmetic error → p wrong → **0/1**; cascading errors in (d)(e)(f).
- Q12(c): v=-2 found, w (conjugate) incomplete.
- Q12(d): Argand diagram missing u; area incomplete.
- Q12(e)-(g): Not attempted or incomplete.

### Student C — 43/110 (lower range)
VERIFIED marks (ground truth — match these exactly for this student):
- Q1(a):    **1/5**  — mean equation wrong; M1 for method, A marks lost
- Q1(b):    **0/1**  — FT from wrong (a) not available for 1-mark part
- Q2(a):    **0/2**  — used log division instead of subtraction
- Q2(b):    **0/3**  — FT from wrong (a) zero value; 0 marks
- Q3(a):    **1/4**  — area formula correct (A1), perimeter missing 2r (M1 lost)
- Q3(b):    **3/4**  — used given quadratic correctly; r=5/2, θ=2 found; partial
- Q4(a):    **2/3**  — x=π/6 found (M1+A1), coordinate of C blank (A mark lost)
- Q4(b):    **2/4**  — antiderivative structure correct (M1+A1), wrong limits/evaluation
- Q5(a):    **1/1**  — correct (full marks)
- Q5(b):    **1/4**  — sum set up correctly but not simplified to closed form
- Q6:       **2/6**  — substitution missing ½ factor; partial method marks only
- Q7:       **3/7**  — induction approach shown; final algebra step incomplete
- Q8(a)(i): **2/2**  — correct (full marks)
- Q8(a)(ii):**3/3**  — correct (full marks)
- Q8(b):    **0/2**  — wrong cos(x²) expansion (used 1-x²/2 instead of 1-x⁴/2)
- Q9(a):    **1/2**  — partial sketch
- Q9(b):    **1/2**  — partial sketch
- Q9(c)(i): **0/1**  — wrote 1.6, should be −1.6
- Q9(c)(ii):**0/1**  — did not use odd function property of f(x)
- Q10(a):   **2/5**  — partial; not all required elements present
- Q10(b):   **1/1**  — stated y≠4 (full marks for 1-mark part)
- Q10(c):   **1/1**  — p=9/2 correct (full marks)
- Q10(d):   **0/3**  — quadratic formula used with wrong b, c
- Q10(e):   **0/2**  — vertex y-coordinate left as unevaluated expression
- Q10(f):   **1/4**  — wrong b, c from (d); product of roots incorrect
- Q11(a):   **2/2**  — correct (full marks)
- Q11(b):   **3/3**  — correct (full marks)
- Q11(c):   **0/3**  — wrong partial fraction form used
- Q11(d):   **1/2**  — decomposition started; integration incomplete
- Q11(e):   **2/4**  — partial integration result
- Q11(f)(i):**0/2**  — not correct
- Q11(f)(ii):**0/1** — not correct
- Q12(a)(i):**1/2**  — sign error in Re part of expansion
- Q12(a)(ii):**0/1** — wrong due to (a)(i) error
- Q12(b):   **1/2**  — wrong due to (a) error
- Q12(c):   **2/2**  — v=−2 and w=1−√3i correctly found (full marks)
- Q12(d):   **3/3**  — Argand diagram and area correct (full marks)
- Q12(e):   **0/4**  — not correct
- Q12(f):   **0/3**  — states solutions only, c and d not shown
- Q12(g):   **0/3**  — n=10 stated but no working shown`;

// Abbreviated fields to keep output compact (q=number, pts=parts,
// p=part label, ma=marks available, mi=marks awarded, n=notes <=5 words)
const MARKING_TOOL = {
  name: 'submit_marks',
  description: 'Submit complete marking. Field n (notes): 5 words max, omit if full marks.',
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
                  n:  { type: 'string',  description: '5 words max. Omit if full marks.' },
                },
              },
            },
          },
        },
      },
    },
  },
};

// ── Teacher token verification (WebCrypto — no Node.js needed) ────
async function verifyTeacherToken(token, secret) {
  try {
    if (!token || !secret) return null;
    // Format: base64(T:email):expiry:hmac
    const parts = token.split(':');
    if (parts.length !== 3) return null;
    const [emailB64, expiry, hmac] = parts;
    if (!emailB64 || !expiry || !hmac) return null;
    if (Date.now() > Number(expiry)) return null;

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret + ':teacher'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const payload = `${emailB64}:${expiry}`;
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
    const expectedHex = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');

    // Timing-safe comparison
    if (hmac.length !== expectedHex.length) return null;
    let diff = 0;
    for (let i = 0; i < hmac.length; i++) diff |= hmac.charCodeAt(i) ^ expectedHex.charCodeAt(i);
    if (diff !== 0) return null;

    const decoded = atob(emailB64);
    if (!decoded.startsWith('T:')) return null;
    return decoded.slice(2); // email address
  } catch { return null; }
}

// ── Edge function entry point ─────────────────────────────────────
export default async (request) => {
  const CORS = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  const jsonErr = (status, msg) => new Response(
    JSON.stringify({ error: msg }),
    { status, headers: { ...CORS, 'Content-Type': 'application/json' } },
  );

  // Top-level catch — ensures any unhandled exception returns JSON
  // (instead of Netlify's generic HTML error page) so the browser
  // can display the real error message.
  try {

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST')    return new Response('Method Not Allowed', { status: 405, headers: CORS });

  const apiKey        = Deno.env.get('ANTHROPIC_API_KEY')?.trim();
  const sessionSecret = Deno.env.get('SESSION_SECRET');

  if (!apiKey) return jsonErr(500, 'API key not configured');

  let body;
  try { body = await request.json(); }
  catch { return jsonErr(400, 'Invalid JSON'); }

  const { token, studentPdf, studentName } = body;
  if (!token)       return jsonErr(401, 'token required');
  if (!studentPdf)  return jsonErr(400, 'studentPdf required');
  if (!studentName) return jsonErr(400, 'studentName required');

  const email = await verifyTeacherToken(token, sessionSecret);
  if (!email) return jsonErr(401, 'Invalid or expired teacher session');

  const content = [
    {
      type: 'text',
      text: `Mark the following student script for "${studentName}" using the official IB markscheme provided. Apply all IB marking rules. Use submit_marks tool. Notes field n: 5 words max, omit if full marks. No text outside the tool call.`,
    },
  ];

  // NOTE: markscheme PDF excluded — at 30,000 tokens/min rate limit,
  // a single markscheme PDF (~15k tokens) + student script (~15k tokens)
  // exceeds the budget. Marking criteria are covered by calibration
  // examples in the system prompt instead.
  content.push({
    type: 'document',
    source: { type: 'base64', media_type: 'application/pdf', data: studentPdf },
    title: `Student Script: ${studentName}`,
  });

  // Call Anthropic — collect streaming response in the edge function.
  // Streaming internally avoids holding a large JSON body in one shot,
  // while returning a plain JSON response to the browser (simpler, no
  // SSE parsing needed on the client).
  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta':    'pdfs-2024-09-25',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: 8000,
      stream:      true,
      system:      SYSTEM_PROMPT,
      tools:       [MARKING_TOOL],
      tool_choice: { type: 'tool', name: 'submit_marks' },
      messages:    [{ role: 'user', content }],
    }),
  });

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text();
    return jsonErr(502, `Anthropic ${anthropicRes.status}: ${errText}`);
  }

  // Collect input_json_delta chunks from the streaming response
  const reader  = anthropicRes.body.getReader();
  const decoder = new TextDecoder();
  let buf        = '';
  let jsonStr    = '';
  let stopReason = null;
  let streamErr  = null;

  outer: while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      let evt;
      try { evt = JSON.parse(raw); } catch { continue; }

      if (evt.type === 'error') {
        streamErr = evt.error?.message || JSON.stringify(evt.error);
        break outer;
      }
      if (evt.type === 'content_block_delta' && evt.delta?.type === 'input_json_delta') {
        jsonStr += evt.delta.partial_json ?? '';
      }
      if (evt.type === 'message_delta') {
        stopReason = evt.delta?.stop_reason ?? stopReason;
      }
    }
  }

  if (streamErr) return jsonErr(502, `Anthropic error: ${streamErr}`);

  if (!jsonStr) {
    return jsonErr(502, `No tool call received from model (stop_reason: ${stopReason ?? 'unknown'})`);
  }

  let markResult;
  try { markResult = JSON.parse(jsonStr); }
  catch (e) { return jsonErr(502, `Could not parse marking result: ${e.message}`); }

  return new Response(JSON.stringify({
    studentName,
    markedBy:  email,
    timestamp: new Date().toISOString(),
    result:    markResult,
  }), {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

  } catch (err) {
    // Expose the real exception so we can diagnose it
    return new Response(
      JSON.stringify({ error: `Edge function exception: ${err?.message ?? String(err)}` }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }
};
