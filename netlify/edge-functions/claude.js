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
Calm, precise, efficient. You respect the student's time. You think like an examiner — you know exactly where marks are won and lost, and you make that transparent. Never condescending. Never vague.
GRAPHS: CRITICAL RULE — whenever a question references a graph or diagram, you MUST output a real interactive Desmos graph block. NEVER write "[Graph would show...]" or "[Imagine a graph...]". Always output exactly:
\`\`\`graph
{"exprs":[{"latex":"YOUR_LATEX_HERE","color":"#C9A84C"}],"bounds":{"left":0,"right":13,"bottom":-4,"top":5}}
\`\`\`
For example, for v = 3cos(0.4t) + 0.25t - 1.5, output:
\`\`\`graph
{"exprs":[{"latex":"y=3\\cos(0.4x)+0.25x-1.5","color":"#C9A84C","label":"v(t)"}],"bounds":{"left":0,"right":13,"bottom":-4,"top":5}}
\`\`\`
Always choose bounds that show the full relevant domain of the function.`;

// ── Server-side limits ────────────────────────────────────────────
const PINNED_MODEL      = 'claude-sonnet-4-20250514'; // enforced server-side
const MAX_TOKENS        = 2000;                        // cap regardless of client request
const MAX_HISTORY_TURNS = 8;                           // keep last 8 user+assistant pairs (16 messages)

// ── HMAC session token verification (Web Crypto, Deno-compatible) ─
// Token format: base64(email):expiry_ms:hmac_hex
// Returns the email on success, null on failure.
async function verifySessionToken(token, secret) {
  try {
    const parts = token.split(':');
    if (parts.length < 3) return null;
    // hmac is always the last 64 hex chars; email:expiry is everything before the last ":"
    const hmac    = parts[parts.length - 1];
    const payload = parts.slice(0, -1).join(':'); // "base64(email):expiry"
    const [emailB64, expiry] = payload.split(':');
    if (!emailB64 || !expiry || !hmac) return null;
    if (Date.now() > Number(expiry))  return null; // expired

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
    const expectedHex = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');

    // Constant-time comparison
    if (hmac.length !== expectedHex.length) return null;
    let diff = 0;
    for (let i = 0; i < hmac.length; i++) diff |= hmac.charCodeAt(i) ^ expectedHex.charCodeAt(i);
    if (diff !== 0) return null;

    return atob(emailB64); // decoded email
  } catch (e) {
    return null;
  }
}

export default async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
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

  // ── Authentication check ─────────────────────────────────────────
  // When SESSION_SECRET is configured, require a valid HAN session token.
  // If SESSION_SECRET is not yet set, the check is skipped (backward compat).
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

  // ── Parse and sanitize request body ──────────────────────────────
  let requestBody;
  try {
    requestBody = await request.json();
  } catch (e) {
    return new Response(
      JSON.stringify({ error: { message: 'Invalid JSON body' } }),
      { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }

  // Pin model and max_tokens server-side — ignore whatever client sends
  const messages = Array.isArray(requestBody.messages) ? requestBody.messages : [];

  // Cap conversation history to prevent inflated input tokens
  const cappedMessages = messages.length > MAX_HISTORY_TURNS * 2
    ? messages.slice(-MAX_HISTORY_TURNS * 2)
    : messages;

  // Sanitize each message: only allow role + content, strip extra keys
  const safeMessages = cappedMessages.map(m => ({ role: m.role, content: m.content }));

  const finalBody = {
    model:      PINNED_MODEL,
    max_tokens: MAX_TOKENS,
    system:     HAN_SYSTEM_PROMPT,
    stream:     true,
    messages:   safeMessages,
  };

  const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta':    'pdfs-2024-09-25',
    },
    body: JSON.stringify(finalBody),
  });

  if (!claudeResponse.ok) {
    const errText = await claudeResponse.text();
    return new Response(errText, {
      status: claudeResponse.status,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  return new Response(claudeResponse.body, {
    headers: {
      'Content-Type':          'text/event-stream',
      'Cache-Control':         'no-cache',
      'X-Accel-Buffering':     'no',
      'Access-Control-Allow-Origin': '*',
    },
  });
};
