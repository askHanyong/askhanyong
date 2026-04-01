// ── System prompt (GDC tool instructions appended below) ─────────
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

WHEN CHECKING STUDENT WORKING:
If the student asks you to check, mark, or review their working, after your analysis output a structured marking summary in EXACTLY this format (each on its own line, no extra text inside the block):

---EXAMINER MARKING---
PASS [M1] Description of what was correct
FAIL [A1] Description of what was wrong — correct answer should be X
SCORE: X/Y
FEEDBACK: One specific, encouraging sentence referencing the exact mistake or achievement.
---END MARKING---

Rules for the marking block:
- PASS = the mark was earned, FAIL = the mark was lost
- Each PASS/FAIL line has exactly one mark code in square brackets: [M1], [A1], [R1], [ft], etc.
- List every mark in the question, one per line
- SCORE: marks earned / total available (integers only, e.g. SCORE: 3/4)
- FEEDBACK: one short, specific sentence — encouraging, referencing what went right or wrong
- Write math as plain text inside the block (e.g. "2x ln x + x" not LaTeX), as LaTeX will not render there

TONE:
Calm, precise, efficient. You respect the student's time. You think like an examiner — you know exactly where marks are won and lost, and you make that transparent. Never condescending. Never vague.
LATEX RULES: Write ALL math in LaTeX. Use \\( ... \\) for inline math and \\[ ... \\] for display/block math. Never write raw expressions like x^2 outside LaTeX delimiters.
GRAPHS: CRITICAL RULE — whenever a question references a graph or diagram, you MUST output a real interactive Desmos graph block. NEVER write "[Graph would show...]" or "[Imagine a graph...]". Always output exactly:
\`\`\`graph
{"exprs":[{"latex":"YOUR_LATEX_HERE","color":"#C9A84C"}],"bounds":{"left":0,"right":13,"bottom":-4,"top":5}}
\`\`\`
For example, for v = 3cos(0.4t) + 0.25t - 1.5, output:
\`\`\`graph
{"exprs":[{"latex":"y=3\\cos(0.4x)+0.25x-1.5","color":"#C9A84C","label":"v(t)"}],"bounds":{"left":0,"right":13,"bottom":-4,"top":5}}
\`\`\`
Always choose bounds that show the full relevant domain of the function.

GDC COMPUTE TOOL — MANDATORY FOR NUMERICAL RESULTS:
You have a gdc_compute tool. Call it whenever exact numerical values are required and cannot be found analytically. NEVER approximate by hand — always use the tool for:
- Solving transcendental/complex equations: operation "solve"
- Definite integrals that cannot be found in closed form: operation "integrate"
- Derivative value at a specific point: operation "nderiv"
- Evaluating an expression at a value: operation "evaluate"

EXACT parameter names you MUST use (wrong names cause errors):
- For solve/integrate: "from" and "to" (NOT "interval", NOT "lower"/"upper")
- For nderiv/evaluate: "at" (NOT "point", NOT "x")
- Variable name: "variable" (e.g. "t" for time, "x" for position)

Example calls for v(t) = exp(sin(t)) + 4*sin(t) on [0,6]:
  solve:     { "operation":"solve",    "expression":"exp(sin(t))+4*sin(t)",        "variable":"t", "from":0, "to":6 }
  nderiv:    { "operation":"nderiv",   "expression":"exp(sin(t))*cos(t)+4*cos(t)", "variable":"t", "at":3.347 }
  integrate: { "operation":"integrate","expression":"abs(exp(sin(t))+4*sin(t))",   "variable":"t", "from":0, "to":6 }

Expression syntax: exp(), sin(), cos(), tan(), ln(), abs(), sqrt(), pi, e, *, **, ^

NOTATION RULE: Always use the variable names from the problem throughout ALL working and explanations. If the problem uses t, use t everywhere — never substitute x in the written solution (only use x inside Desmos graph expressions, which require y=f(x) format, and note the substitution explicitly).

After the tool returns, present the result as an exact GDC value and continue your solution.`;

// ── GDC tool schema ───────────────────────────────────────────────
const GDC_TOOL = {
  name: 'gdc_compute',
  description: 'Perform exact GDC-equivalent numerical computation. Use instead of estimating. Supports solve (find zeros), integrate (definite integral), nderiv (derivative at a point), evaluate (expression value).',
  input_schema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['solve', 'integrate', 'nderiv', 'evaluate'],
        description: 'solve=find all zeros in interval, integrate=definite integral, nderiv=derivative at point, evaluate=expression value',
      },
      expression: {
        type: 'string',
        description: 'Expression using exp(), sin(), cos(), tan(), ln(), abs(), sqrt(), pi, e, *, **, ^. E.g. "exp(sin(t)) + 4*sin(t)"',
      },
      variable: {
        type: 'string',
        description: 'Variable name, e.g. "t" or "x". Default: "x"',
      },
      from: { type: 'number', description: 'Lower bound (solve / integrate). Alternative: pass interval:[lo,hi] array instead.' },
      to:   { type: 'number', description: 'Upper bound (solve / integrate). Alternative: pass interval:[lo,hi] array instead.' },
      at:   { type: 'number', description: 'Point at which to differentiate or evaluate (nderiv / evaluate). Alternative: pass point:value instead.' },
      interval: { type: 'array', items: { type: 'number' }, description: 'Alternative to from+to: [lowerBound, upperBound] for solve / integrate.' },
      point:    { type: 'number', description: 'Alternative to at for nderiv / evaluate.' },
    },
    required: ['operation', 'expression'],
  },
};

// ── Numerical computation engine ──────────────────────────────────
// All expressions come from Claude (not raw user input), but we still
// validate with a character whitelist before eval to limit blast radius.

function makeEvaluator(expr, varName) {
  if (typeof expr !== 'string' || expr.length > 500) throw new Error('Expression invalid or too long');
  // Whitelist: digits, letters, whitespace, arithmetic operators, decimal point, parentheses, comma, underscore
  if (!/^[0-9a-zA-Z\s\+\-\*\/\.\(\),_\^]+$/.test(expr)) throw new Error('Unsafe characters in expression: ' + expr);

  // Map math notation → JS. Order matters: named functions before bare letters.
  const js = expr
    .replace(/\^/g, '**')
    .replace(/\bexp\(/g,  'Math.exp(')
    .replace(/\bsin\(/g,  'Math.sin(')
    .replace(/\bcos\(/g,  'Math.cos(')
    .replace(/\btan\(/g,  'Math.tan(')
    .replace(/\bln\(/g,   'Math.log(')
    .replace(/\bsqrt\(/g, 'Math.sqrt(')
    .replace(/\babs\(/g,  'Math.abs(')
    .replace(/\bpi\b/gi,  'Math.PI')
    // Standalone 'e' not adjacent to letters/digits/( — replaces Euler's number
    .replace(/(?<![a-zA-Z0-9_(])e(?![a-zA-Z0-9_(])/g, 'Math.E');

  // new Function creates a global-scope function; varName is the only binding exposed
  // eslint-disable-next-line no-new-func
  return new Function(varName, `"use strict"; return (${js});`);
}

// Find all zeros of f in [lo, hi] by scanning + bisection
function gdcSolve(f, lo, hi) {
  const N = 2000;
  const step = (hi - lo) / N;
  const TOL = 1e-10;
  const roots = [];

  for (let i = 0; i < N; i++) {
    const a = lo + i * step;
    const b = a + step;
    const fa = f(a);
    if (!isFinite(fa)) continue;
    if (Math.abs(fa) < TOL) { roots.push(a); continue; }
    const fb = f(b);
    if (!isFinite(fb)) continue;
    if (fa * fb < 0) {
      // Bisect
      let r0 = a, r1 = b, fr0 = fa;
      for (let j = 0; j < 60; j++) {
        const mid = (r0 + r1) / 2;
        const fm  = f(mid);
        if (Math.abs(fm) < TOL || (r1 - r0) < TOL) { roots.push(mid); break; }
        if (fr0 * fm < 0) { r1 = mid; } else { r0 = mid; fr0 = fm; }
      }
    }
  }

  // Deduplicate roots closer than 1e-6
  const deduped = [];
  for (const r of roots) {
    if (deduped.length === 0 || Math.abs(r - deduped[deduped.length - 1]) > 1e-6) {
      deduped.push(r);
    }
  }
  return deduped;
}

// Adaptive Simpson's rule
function gdcIntegrate(f, a, b) {
  function simpson(f, a, b) {
    return (b - a) / 6 * (f(a) + 4 * f((a + b) / 2) + f(b));
  }
  function adaptive(f, a, b, tol, whole, depth) {
    const c  = (a + b) / 2;
    const left  = simpson(f, a, c);
    const right = simpson(f, c, b);
    if (depth > 25 || Math.abs(left + right - whole) <= 15 * tol) {
      return left + right + (left + right - whole) / 15;
    }
    return adaptive(f, a, c, tol / 2, left, depth + 1) +
           adaptive(f, c, b, tol / 2, right, depth + 1);
  }
  const whole = simpson(f, a, b);
  return adaptive(f, a, b, 1e-8, whole, 0);
}

// 5-point stencil numerical derivative
function gdcNderiv(f, x) {
  const h = 1e-5;
  return (-f(x + 2*h) + 8*f(x + h) - 8*f(x - h) + f(x - 2*h)) / (12 * h);
}

function roundTo(x, d) {
  const p = Math.pow(10, d);
  return Math.round(x * p) / p;
}

function executeGDC(input) {
  try {
    const { operation, expression, variable = 'x' } = input;
    // Accept the naming conventions Claude naturally produces as alternatives
    const from = input.from   ?? input.lower ?? (Array.isArray(input.interval) ? input.interval[0] : undefined);
    const to   = input.to     ?? input.upper ?? (Array.isArray(input.interval) ? input.interval[1] : undefined);
    const at   = input.at     ?? input.point ?? input.x_val ?? input.value;
    const f = makeEvaluator(expression, variable);

    if (operation === 'solve') {
      if (from == null || to == null) throw new Error('"solve" requires from and to');
      const roots = gdcSolve(f, from, to);
      if (roots.length === 0) return `No zeros found for f(${variable}) = ${expression} on [${from}, ${to}]`;
      const formatted = roots.map(r => roundTo(r, 6).toString()).join(', ');
      return `Zeros of f(${variable}) = ${expression} on [${from}, ${to}]: ${variable} = ${formatted}`;
    }

    if (operation === 'integrate') {
      if (from == null || to == null) throw new Error('"integrate" requires from and to');
      const result = gdcIntegrate(f, from, to);
      return `∫[${from} to ${to}] (${expression}) d${variable} = ${roundTo(result, 6)}`;
    }

    if (operation === 'nderiv') {
      if (at == null) throw new Error('"nderiv" requires at');
      const result = gdcNderiv(f, at);
      return `d/d${variable}(${expression}) at ${variable} = ${at} is ${roundTo(result, 6)}`;
    }

    if (operation === 'evaluate') {
      if (at == null) throw new Error('"evaluate" requires at');
      const result = f(at);
      return `${expression} at ${variable} = ${at} is ${roundTo(result, 6)}`;
    }

    throw new Error('Unknown operation: ' + operation);
  } catch (e) {
    return 'GDC error: ' + (e.message || String(e));
  }
}

// ── Stream interceptor — handles tool_use inline, transparent to client ──
// Supports multiple tool-call rounds (up to MAX_TOOL_ROUNDS) and multiple
// parallel tool calls per round. The client sees only continuous text_delta
// SSE events — all tool mechanics are invisible to it.
function buildStream(apiKey, body, safeMessages, tools = []) {
  const enc = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const push = (s) => controller.enqueue(enc.encode(s));

      // Read one streaming Anthropic response. Forwards text events to the client,
      // silently collects tool_use blocks. Returns null on HTTP error.
      async function doStream(reqBody) {
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type':      'application/json',
            'x-api-key':         apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-beta':    'pdfs-2024-09-25',
          },
          body: JSON.stringify({ ...reqBody, stream: true }),
        });

        if (!resp.ok) {
          const errText = await resp.text();
          push(`data: ${JSON.stringify({ type: 'error', error: errText })}\n\n`);
          return null;
        }

        const reader  = resp.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';

        // blockTypes: index → 'text' | 'tool'
        // pendingTools: index → { id, name, inputStr }
        const blockTypes   = new Map();
        const pendingTools = new Map();
        const assistantContent = [];
        let currentText = null;
        let stopReason  = null;

        outer: while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) {
              if (line.trim()) push(line + '\n'); // keep-alive pings
              continue;
            }

            const data = line.slice(6).trim();
            // Don't forward [DONE] mid-stream — the outer loop controls stream end
            if (data === '[DONE]') { break outer; }

            let evt;
            try { evt = JSON.parse(data); } catch { push(line + '\n'); continue; }

            if (evt.type === 'content_block_start') {
              const idx = evt.index;
              if (evt.content_block?.type === 'tool_use') {
                blockTypes.set(idx, 'tool');
                pendingTools.set(idx, {
                  id: evt.content_block.id, name: evt.content_block.name, inputStr: '',
                });
                // Don't forward — client doesn't know about tools
              } else if (evt.content_block?.type === 'text') {
                blockTypes.set(idx, 'text');
                currentText = { type: 'text', text: '' };
                assistantContent.push(currentText);
                push(line + '\n');
              } else {
                push(line + '\n');
              }

            } else if (evt.type === 'content_block_delta') {
              const idx  = evt.index;
              const kind = blockTypes.get(idx);
              if (kind === 'tool' && evt.delta?.type === 'input_json_delta') {
                const t = pendingTools.get(idx);
                if (t) t.inputStr += evt.delta.partial_json ?? '';
                // Don't forward
              } else if (kind === 'text' && evt.delta?.type === 'text_delta') {
                if (currentText) currentText.text += evt.delta.text;
                push(line + '\n');
              } else if (kind !== 'tool') {
                push(line + '\n');
              }

            } else if (evt.type === 'content_block_stop') {
              const idx  = evt.index;
              const kind = blockTypes.get(idx);
              if (kind === 'tool') {
                const t = pendingTools.get(idx);
                if (t) {
                  let parsed;
                  try { parsed = JSON.parse(t.inputStr); } catch { parsed = {}; }
                  assistantContent.push({ type: 'tool_use', id: t.id, name: t.name, input: parsed });
                }
                // Don't forward
              } else {
                push(line + '\n');
              }

            } else if (evt.type === 'message_delta') {
              stopReason = evt.delta?.stop_reason ?? stopReason;
              if (stopReason !== 'tool_use') push(line + '\n');

            } else if (evt.type === 'message_stop') {
              if (stopReason !== 'tool_use') push(line + '\n');

            } else {
              // message_start, ping, etc.
              push(line + '\n');
            }
          }
        }

        return { stopReason, assistantContent };
      }

      // ── Agentic tool-use loop (up to 5 rounds) ─────────────────
      const MAX_TOOL_ROUNDS = 5;
      let messages = safeMessages;

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const result = await doStream({ ...body, messages });
        if (!result) break; // HTTP error — already surfaced to client

        if (result.stopReason !== 'tool_use') break; // normal end or error

        // Collect all tool_use blocks from this round
        const toolBlocks = result.assistantContent.filter(b => b.type === 'tool_use');
        if (toolBlocks.length === 0) break;

        // Execute every tool call and build the tool_result message
        const toolResults = toolBlocks.map(tb => ({
          type:        'tool_result',
          tool_use_id: tb.id,
          content:     executeGDC(tb.input),
        }));

        // Append assistant turn + tool results, then loop for next round
        messages = [
          ...messages,
          { role: 'assistant', content: result.assistantContent },
          { role: 'user',      content: toolResults },
        ];
      }

      // Signal end of stream to the client
      push('data: [DONE]\n\n');
      controller.close();
    },
  });
}

// ── Real-time confidence heuristic ───────────────────────────────
const LOW_CONFIDENCE_PATTERNS = [
  /\bvoronoi\b/i,
  /\bmaclaurin\b/i,
  /\btaylor\s+series\b/i,
  /\bepsilon[-\s]delta\b/i,
  /\bproof\s+by\s+induction\b.*\bcomplex\b/i,
  /\bcomplex\b.*\bproof\s+by\s+induction\b/i,
  /\bde\s+moivre\b/i,
  /\binfinite\s+series\b/i,
];

function estimateConfidence(messages) {
  const lastUser = Array.isArray(messages)
    ? [...messages].reverse().find(m => m.role === 'user')
    : null;
  if (!lastUser) return 'normal';
  const text = typeof lastUser.content === 'string'
    ? lastUser.content
    : JSON.stringify(lastUser.content);
  if (text.trim().length < 25) return 'low';
  for (const pattern of LOW_CONFIDENCE_PATTERNS) {
    if (pattern.test(text)) return 'low';
  }
  return 'normal';
}

// ── Server-side limits ────────────────────────────────────────────
const PINNED_MODEL      = 'claude-sonnet-4-6';
const MAX_TOKENS        = 2000;
const MAX_HISTORY_TURNS = 8;

// ── HMAC session token verification ──────────────────────────────
async function verifySessionToken(token, secret) {
  try {
    const parts = token.split(':');
    if (parts.length < 3) return null;
    const hmac    = parts[parts.length - 1];
    const payload = parts.slice(0, -1).join(':');
    const [emailB64, expiry] = payload.split(':');
    if (!emailB64 || !expiry || !hmac) return null;
    if (Date.now() > Number(expiry)) return null;
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
    const expectedHex = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
    if (hmac.length !== expectedHex.length) return null;
    let diff = 0;
    for (let i = 0; i < hmac.length; i++) diff |= hmac.charCodeAt(i) ^ expectedHex.charCodeAt(i);
    if (diff !== 0) return null;
    return atob(emailB64);
  } catch { return null; }
}

// ── Edge function entry point ─────────────────────────────────────
export default async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Headers': 'Content-Type, X-HAN-Token',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  }
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')?.trim();
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: { message: 'ANTHROPIC_API_KEY not set' } }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }

  const sessionSecret = Deno.env.get('SESSION_SECRET');
  if (sessionSecret) {
    const token = request.headers.get('X-HAN-Token') || '';
    const email = await verifySessionToken(token, sessionSecret);
    if (!email) {
      return new Response(
        JSON.stringify({ error: { message: 'Unauthorized. Please sign in to ask questions.' } }),
        { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }
  }

  let requestBody;
  try {
    requestBody = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: { message: 'Invalid JSON body' } }),
      { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }

  const messages = Array.isArray(requestBody.messages) ? requestBody.messages : [];
  const confidenceLevel = estimateConfidence(messages);

  const cappedMessages = messages.length > MAX_HISTORY_TURNS * 2
    ? messages.slice(-MAX_HISTORY_TURNS * 2)
    : messages;
  const safeMessages = cappedMessages.map(m => ({ role: m.role, content: m.content }));

  // Paper context — sent by the frontend from the user's selector
  const paper = typeof requestBody.paper === 'string' ? requestBody.paper.trim() : '';
  const level = typeof requestBody.level === 'string' ? requestBody.level.trim() : '';
  const gdcAllowed = paper === 'Paper 2' || paper === 'Paper 3';

  // Prepend a definitive paper-context line so HAN knows the rules with certainty
  const paperContextLine = paper
    ? (gdcAllowed
        ? `CURRENT PAPER: ${level ? level + ' ' : ''}${paper} — GDC IS ALLOWED. Use the gdc_compute tool for all numerical results that cannot be found analytically. Never estimate by hand.`
        : `CURRENT PAPER: ${level ? level + ' ' : ''}${paper} — NO CALCULATOR. Do NOT use the gdc_compute tool. All working must be done by hand with exact values only.`)
    : '';

  const systemPrompt = paperContextLine
    ? paperContextLine + '\n\n' + HAN_SYSTEM_PROMPT
    : HAN_SYSTEM_PROMPT;

  // Only expose the GDC tool when the paper actually permits it
  const tools = gdcAllowed ? [GDC_TOOL] : [];

  const finalBody = {
    model:      PINNED_MODEL,
    max_tokens: MAX_TOKENS,
    system:     systemPrompt,
    ...(tools.length > 0 && { tools }),
    messages:   safeMessages,
  };

  const outputStream = buildStream(apiKey, finalBody, safeMessages, tools);

  return new Response(outputStream, {
    headers: {
      'Content-Type':                  'text/event-stream',
      'Cache-Control':                 'no-cache',
      'X-Accel-Buffering':             'no',
      'Access-Control-Allow-Origin':   '*',
      'X-HAN-Confidence':              confidenceLevel,
      'Access-Control-Expose-Headers': 'X-HAN-Confidence',
    },
  });
};
