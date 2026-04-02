// ════════════════════════════════════════════════════════════════
// Teacher Mark — Netlify Edge Function (Deno runtime)
// Streams Anthropic SSE directly to browser.
// Edge functions have no wall-clock timeout for I/O operations
// (only 50ms CPU limit, which waiting on network does NOT count
// toward) — so the 26s Lambda cap no longer applies.
// ════════════════════════════════════════════════════════════════

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
7. **Radians vs degrees**: Paper 1 assumes radian mode; working in degrees is an error and loses the A mark for the result, but M marks for correct method structure may still be awarded

## PAPER STRUCTURE (12 questions, 110 marks total)
Q1: 6 marks (stats/mean — 4+2)
Q2: 4 marks (logarithms — 2+2)
Q3: 7 marks (circular sectors — 5+2)
Q4: 9 marks (trig functions — 5+4)
Q5: 8 marks (geometric series — 3+5)
Q6: 5 marks (volume of revolution)
Q7: 8 marks (mathematical induction)
Q8: 8 marks (Maclaurin series — 6+2)
Q9: 9 marks (graph transformations + integration — 2+3+4)
Q10: 16 marks (rational functions — 5+2+3+4+2)
Q11: 16 marks (polynomials, partial fractions, limits — 2+4+3+5+2)
Q12: 14 marks (complex numbers — 4+2+1+3+3+3+4... wait, depends on sub-parts)

## CALIBRATION EXAMPLES

### Student A — 109/110 (near-perfect)
Key marking decisions:
- Q1(a): Correctly set up two simultaneous equations from mean formula and total. Used (p+2q+12+8+18)/16=3 and p+q+4+2+3=16. Solved to get q=3, p=4. **Full marks 4/4**
- Q1(b): Mean final score = 10×3 = 30. **Full marks 2/2**
- Q2(a): log₁₀(1/a) = log₁₀1 - log₁₀a = -1/3. **Full marks 2/2**
- Q2(b): log₁₀₀₀a = log₁₀a / log₁₀1000 = (1/3)/3 = 1/9. **Full marks 2/2**
- Q3(a): Perimeter = 2r+rθ = 10 AND Area = ½r²θ = 6.25. Substituted θ=12.5/r² into perimeter equation. Obtained 4r²-20r+25=0. **Full marks (shown)**
- Q3(b): Factored (2r-5)² = 0, r=5/2, then θ=12.5/(5/2)²=25/2×4/25=2 rad. **Full marks 2/2**
- Q4(a): cosx=sin2x → cosx=2sinxcosx → cosx(1-2sinx)=0. Rejected cosx=0 (as cosx≠0 from division). sinx=1/2 → x=π/6 or 5π/6. **Full marks 5/5**
- Q4(b): Area = ∫[π/6 to 5π/6](cosx-sin2x)dx = [sinx+cos2x/2] evaluated = 1/4. **Full marks 4/4**
- Q5(a): Sₙ = 1(10ⁿ-1)/(10-1) = (10ⁿ-1)/9, so a=10, b=9. **Full marks 3/3**
- Q5(b): Sum = (1/9)[(10+10²+...+10ⁿ) - n] = (1/9)[10(10ⁿ-1)/9 - n] = [10(10ⁿ-1)-9n]/81. **Full marks 5/5**
- Q6: Volume = π∫[0 to √(5π/2)] x·sin(x²)dx = (π/2)∫·2x·sin(x²)dx = (π/2)[-cos(x²)] evaluated = π(2-√2)/4. **Full marks 5/5**
- Q7: Induction — complete proof: base case (n=1), assumption (sum=^(k+1)C₂), inductive step showing ^(k+1)C₂+^(k+1)C₁ = (k+2)(k+1)!/2!k! = ^(k+2)C₂, conclusion. **Full marks 8/8**
- Q8(a)(i): sin(x²) = x²-x⁶/6+... (ii) sin²(x²) = x⁴-x⁸/3+... **Full marks 3/3**
- Q8(b): 4x·sin(x²)·cos(x²) = 4x(x²-x⁶/6+...)(1-x⁴/2+...) = 4x³-8x⁷/3+... **Full marks 5/5**
- Q9(a): Correct sketch of y=|f(|x|)| — even function, all humps reflected above x-axis. **Full marks 2/2**
- Q9(b): Correct sketch of y=f(x) — odd function extended to [-6,0]. **Full marks 3/3**
- Q9(c)(i): ∫[-4 to 0]f(x)dx = -1.6 (odd function symmetry). **Full marks 2/2**
- Q9(c)(ii): ∫[-4 to 4][f(|x|)+f(x)]dx = 2×1.6 + 0 = 3.2 (f(x) is odd → integrates to 0). **Full marks 2/2**
- Q10: All parts correct — rewriting f, asymptotes, graph, range (y∈ℝ,y≠4), p=9/2, g(x), vertex, f=g product of roots=-5/2. **Full marks 16/16**
- Q11: All parts correct — factor theorem, factorisation P(x)=(3x-1)(x+1)², partial fractions A=-1 B=2, decomposition of 1/[(x+1)Q(x)], integration, limits. **Full marks 16/16** (minus 1 for unspecified issue)
- Q12: All parts correct — expansion of (a+bi)³, Re and Im, evaluating (1+√3i)³=-8, v=-2 w=1-√3i, Argand diagram area 3√3, polar forms, rotated roots, c=4√2 d=-4√2, n=12. **Full marks 14/14**

### Student B — 77/110 (mid-range)
Marks lost and reasons:
- Q2(b): Wrote log₁₀₀₀a = (1/3)/3 = 1 instead of (1/3)/log₁₀(10³) = (1/3)/3 = 1/9. Arithmetic error on final step — computed 1/3 ÷ 3 = 1 instead of 1/9. **0/2** (wrong answer, no FT)
- Q4(a): Worked in degrees throughout (x=30° or 150°). Method correct but answers in degrees on a radians paper. **Lost A marks for final answers** (M marks for correct method awarded)
- Q5(b): Final denominator written as 9^(n+1) instead of 81. Algebraic error in simplification. **Partial credit lost**
- Q9(c)(i): Incorrectly wrote ∫[-4 to 0]f(x)dx = 1.6 (should be -1.6; confusion about direction of odd function). **0/2**
- Q9(c)(ii): Got 6.4 by computing 1.6×2 + 1.6×2, not recognising f(x) integrates to 0. **0/2** (wrong value and wrong reasoning)
- Q10(c): Axis of symmetry midpoint calculation: wrote (p-½)/2 = 2 → p = 3.5 instead of p = 4.5. Arithmetic error. **Lost subsequent marks**
- Q10 remaining (d,e,f): Wrong g(x) due to wrong p → cascading errors through vertex and product of roots.
- Q12(c): Identified v=-2 but did not write w (conjugate); incomplete.
- Q12(d): Argand diagram missing point u; area formula set up but not completed correctly.
- Q12(e)-(g): Not attempted or incomplete.

### Student C — 43/110 (lower range)
Marks lost and reasons:
- Q1(a): Wrong equation (1): did not multiply both sides by 16, wrote p+2q+38=3 giving p+2q=-35. Wrong values q=-42, p=49. **Method shown (M1) but A marks lost**
- Q1(b): Used result from (a) — FT mark: 10×3=30 is still awarded as it does not depend on p and q. **2/2 FT**
- Q2(a): Used wrong log law: log₁₀(1/a) = log₁₀(1)/log₁₀(a) = 0/(1/3) = 0. Fundamental error — division not subtraction. **0/2**
- Q2(b): Got log₁₀₀₀a = log₁₀a/log₁₀1000 = (1/3)/3 = 0 (carried forward wrong value from (a)). **0/2**
- Q3(a): Perimeter formula wrong: wrote rθ=10 instead of 2r+rθ=10. Did not include the two straight sides. Derived 12.5/r=10 → 12.5r=10 (wrong). **Lost M1 for perimeter, but Area formula correct**
- Q3(b): Despite wrong perimeter, used the given quadratic 4r²-20r+25=0 correctly (it's an AG), factored correctly, got r=5/2 and θ=12.5/(25/4)=2 rad. **Full marks 2/2** (AG part; used given equation)
- Q4(a): Did not explicitly reject cosx=0; lost R mark. Found x=π/6 correctly but left x-coordinate of C blank. **Partial**
- Q4(b): Used wrong antiderivative — wrote [sinx - cos2x/2] (wrong sign on cos2x) and wrong upper limit (π instead of 5π/6). Got answer 2. **0/4**
- Q5(a): Correct. **3/3**
- Q5(b): Partial — set up the sum correctly but did not complete the algebra to a closed form. **Partial credit**
- Q6: Did not use substitution u=x² → forgot the factor of ½ from du=2x dx. Got π[-cosx²] evaluated = -π(√2/2). Wrong. **Partial method mark only**
- Q7: Induction proof correct but conclusion statement slightly abbreviated. **Mostly full marks**
- Q8(a): Both parts correct. **3/3**
- Q8(b): Wrong expansion of cos(x²) — used cos(x²)≈1-x²/2! instead of 1-x⁴/2. Got 4x³-2x⁵ instead of 4x³-8x⁷/3. **Lost A marks**
- Q9(a): Both graphs drawn (combined on one page, both labelled). **Full marks**
- Q9(c)(i): Correct — ∫[-4 to 0]f(x)dx = 1.6 (same as given integral by odd function symmetry — wait, student wrote 1.6 but should be -1.6). **Depends on markscheme**
- Q9(c)(ii): Got 6.4 by adding 3.2+3.2 (same error as Student B). **0/2**
- Q10(a): Correct rewriting, asymptotes, intercepts, sketch. **Full marks**
- Q10(b): Wrote "y≠4" — incomplete (missing y∈ℝ). **Partial**
- Q10(c): Correctly found p=9/2. **Full marks**
- Q10(d): Used quadratic formula instead of factoring from roots. Arithmetic errors in setting up b, c. **Partial**
- Q10(e): Vertex y-coordinate left as expression 4+2b+c, not evaluated. **0/2**
- Q10(f): Used wrong b=1, c=2 (from erroneous d). Product of roots = 6 (wrong). **0/2**
- Q11: Factor theorem and factorisation correct. Partial fractions in (c) correct. In (d): used wrong PFD form. In (e): integration result incorrect. Limits (f)(i) correct, (f)(ii) written as "undefined" (wrong — limit is 3/2). **Mixed**
- Q12(a): Sign error in expansion — wrote Re(φ)=a³+3ab² (should be a³-3ab²). Cascading errors through. **0/4**
- Q12(b): Wrong because of (a)'s error. **0/2**
- Q12(c): Correctly identified v=-2, w=1-√3i (used conjugate reasoning). **Full marks 1/1**
- Q12(d): Diagram partially correct (v plotted, w plotted), u missing. Area calculation started but not completed. **Partial**
- Q12(e)-(g): Partially attempted, some correct steps.`;

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

  // Fetch the markscheme PDF from static files (Netlify serves calibration/ directory)
  try {
    const origin = new URL(request.url).origin;
    const msUrl  = `${origin}/calibration/M24%20MAAHL%20P1%20TZ1_markscheme.pdf`;
    const msRes  = await fetch(msUrl);
    if (msRes.ok) {
      const buf = await msRes.arrayBuffer();
      const u8  = new Uint8Array(buf);
      let binary = '';
      for (let i = 0; i < u8.length; i += 8192) {
        binary += String.fromCharCode(...u8.subarray(i, Math.min(i + 8192, u8.length)));
      }
      content.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: btoa(binary) },
        title: 'Official Markscheme — IB MAA HL May 2024 P1 TZ1',
      });
    }
  } catch { /* proceed without markscheme if fetch fails */ }

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
      max_tokens: 4096,
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
