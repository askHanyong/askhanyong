// ── Mark My Script — Edge Function ──────────────────────────────
// Receives page images from the frontend, sends them to Claude for
// IB-examiner-style marking, and streams the response back.
//
// The frontend converts a PDF to page images and sends them in batches
// (typically 1–3 pages per request to stay within the ~1 MB body limit).
// Multiple sequential calls are aggregated by the frontend.

const MARK_SYSTEM_PROMPT = `You are HAN, an IB Mathematics examiner with 20+ years of experience marking IB exam scripts. You are marking a student's written exam paper.

MARKING INSTRUCTIONS:
1. For each page with student working visible:
   - Identify which question/part the student is answering (e.g. "Question 3(b)")
   - Read and transcribe their working briefly
   - Mark it against the IB mark scheme using standard codes:
     M1 = method mark, A1 = answer mark, R1 = reasoning mark, ft = follow-through
   - State which marks are earned (✓) and which are lost (✗)
   - Note specific errors or where marks were lost

2. If a page is blank, contains only a printed question with no student working, or is a cover page, say "No student working on this page." and move on quickly.

3. Be precise and specific — reference the exact line or step where errors occur.

4. At the end of your response, output exactly:
   BATCH_SCORE: X/Y
   where X = total marks earned, Y = total marks available across all questions on these pages.
   If no student working is found, output: BATCH_SCORE: 0/0

TONE: Professional, precise, encouraging. Point out what the student did well, not just errors.
Write math as plain text (e.g. "2x + 3 = 7") since LaTeX will not render in this context.`;

const PINNED_MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS  = 4000;  // marking needs more tokens than chat

// ── HMAC session token verification (same as claude.js) ──
async function verifySessionToken(token, secret) {
  try {
    const parts = token.split(':');
    if (parts.length < 3) return null;
    const hmac    = parts[parts.length - 1];
    const payload = parts.slice(0, -1).join(':');
    const [emailB64, expiry] = payload.split(':');
    if (!emailB64 || !expiry || !hmac) return null;
    if (Date.now() > Number(expiry))  return null;

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
    const expectedHex = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');

    if (hmac.length !== expectedHex.length) return null;
    let diff = 0;
    for (let i = 0; i < hmac.length; i++) diff |= hmac.charCodeAt(i) ^ expectedHex.charCodeAt(i);
    if (diff !== 0) return null;

    return atob(emailB64);
  } catch (e) {
    return null;
  }
}

export default async (request) => {
  // CORS preflight
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

  // Authentication
  const sessionSecret = Deno.env.get('SESSION_SECRET');
  if (sessionSecret) {
    const token = request.headers.get('X-HAN-Token') || '';
    const email = await verifySessionToken(token, sessionSecret);
    if (!email) {
      return new Response(
        JSON.stringify({ error: { message: 'Unauthorized. Please sign in.' } }),
        { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }
  }

  // Parse request body — support multiple formats the frontend might use:
  // Format A: { messages: [...] }  (same as claude endpoint)
  // Format B: { pages: [{ image: "base64", type: "image/jpeg" }], course, paper, year, session, timezone }
  // Format C: { images: ["base64", ...], ...metadata }
  let requestBody;
  try {
    requestBody = await request.json();
  } catch (e) {
    return new Response(
      JSON.stringify({ error: { message: 'Invalid JSON body' } }),
      { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }

  let messages;

  if (requestBody.messages && Array.isArray(requestBody.messages)) {
    // Format A: already in Claude messages format — use directly
    messages = requestBody.messages.map(m => ({ role: m.role, content: m.content }));
  } else {
    // Format B/C: construct messages from pages/images
    const pages = requestBody.pages || [];
    const images = requestBody.images || [];
    const content = [];

    // Handle pages array: [{ image: "base64...", type: "image/jpeg", pageNum: 1 }]
    for (const pg of pages) {
      const imgData = pg.image || pg.base64 || pg.data;
      const imgType = pg.type || pg.media_type || 'image/jpeg';
      if (imgData) {
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: imgType, data: imgData }
        });
      }
    }

    // Handle flat images array: ["base64...", ...]
    for (const img of images) {
      if (typeof img === 'string') {
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: img }
        });
      } else if (img && img.data) {
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: img.type || 'image/jpeg', data: img.data }
        });
      }
    }

    // Build context string from metadata
    const meta = [
      requestBody.course,
      requestBody.paper,
      requestBody.year,
      requestBody.session,
      requestBody.timezone || requestBody.tz
    ].filter(Boolean).join(' · ');

    const pageNums = requestBody.pageRange || requestBody.pageNumbers || '';
    const prompt = requestBody.prompt || (
      'Mark the student working on ' + (pageNums ? 'pages ' + pageNums + ' of ' : '') +
      'this exam paper' + (meta ? ' (' + meta + ')' : '') + '.'
    );

    content.push({ type: 'text', text: prompt });

    if (content.length < 2) {
      return new Response(
        JSON.stringify({ error: { message: 'No page images provided' } }),
        { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    messages = [{ role: 'user', content: content }];
  }

  const finalBody = {
    model:      PINNED_MODEL,
    max_tokens: MAX_TOKENS,
    system:     MARK_SYSTEM_PROMPT,
    stream:     true,
    messages:   messages,
  };

  const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
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
      'Content-Type':                'text/event-stream',
      'Cache-Control':               'no-cache',
      'X-Accel-Buffering':           'no',
      'Access-Control-Allow-Origin': '*',
    },
  });
};
