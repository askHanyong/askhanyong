// ── Mark My Script — Netlify Function v2 (streaming) ──────────────
// Accepts a full PDF as base64 and sends it to Claude for IB-examiner
// marking using Claude's native PDF/document support.
//
// Netlify Functions v2:
//   - 6 MB request body (enough for compressed PDFs)
//   - Streaming response (60s timeout on Pro with streaming)
//   - Web-standard Request/Response API

import { createHmac } from 'node:crypto';

const MARK_SYSTEM_PROMPT = `You are HAN, an IB Mathematics examiner with 20+ years of experience marking IB exam scripts. You are marking a student's written exam paper.

MARKING INSTRUCTIONS:
1. Go through every page of the document carefully.
2. For each page with student working visible:
   - Identify which question/part the student is answering (e.g. "Question 3(b)")
   - Read and transcribe their key working steps briefly
   - Mark it against the IB mark scheme using standard codes:
     M1 = method mark, A1 = answer mark, R1 = reasoning mark, ft = follow-through
   - State which marks are earned (✓) and which are lost (✗)
   - Note specific errors or where marks were lost

3. If a page is blank, contains only a printed question with no student working, or is a cover page, say "No student working on this page." and move on quickly.

4. Be precise and specific — reference the exact line or step where errors occur.

5. After going through ALL pages, output a FINAL SUMMARY with:
   - Total marks earned vs total available
   - Key strengths in the student's work
   - Most important areas for improvement
   - Overall grade boundary estimate if enough data

TONE: Professional, precise, encouraging. Point out what the student did well, not just errors.`;

const PINNED_MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS  = 8000;  // full-paper marking needs generous token limit

// ── HMAC session token verification ──
function verifySessionToken(token, secret) {
  try {
    const parts = token.split(':');
    if (parts.length < 3) return null;
    const hmac    = parts[parts.length - 1];
    const payload = parts.slice(0, -1).join(':');
    const [emailB64, expiry] = payload.split(':');
    if (!emailB64 || !expiry || !hmac) return null;
    if (Date.now() > Number(expiry))  return null;

    const expectedHex = createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    // Constant-time comparison
    if (hmac.length !== expectedHex.length) return null;
    let diff = 0;
    for (let i = 0; i < hmac.length; i++) diff |= hmac.charCodeAt(i) ^ expectedHex.charCodeAt(i);
    if (diff !== 0) return null;

    return Buffer.from(emailB64, 'base64').toString('utf8');
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

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: { message: 'ANTHROPIC_API_KEY not set' } }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }

  // Authentication
  const sessionSecret = process.env.SESSION_SECRET;
  if (sessionSecret) {
    const token = request.headers.get('X-HAN-Token') || '';
    const email = verifySessionToken(token, sessionSecret);
    if (!email) {
      return new Response(
        JSON.stringify({ error: { message: 'Unauthorized. Please sign in.' } }),
        { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }
  }

  // Parse request body
  let requestBody;
  try {
    requestBody = await request.json();
  } catch (e) {
    return new Response(
      JSON.stringify({ error: { message: 'Invalid JSON body' } }),
      { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }

  // Build Claude messages from the request
  // Support multiple formats:
  //   Format A: { pdf: "base64...", course, paper, year, session, tz }
  //   Format B: { messages: [...] }  (pass-through)
  //   Format C: { pages: [{ image: "base64", type: "..." }], ... }  (page images)
  //   Format D: { images: ["base64", ...], ... }
  let messages;

  if (requestBody.messages && Array.isArray(requestBody.messages)) {
    // Format B: pass-through
    messages = requestBody.messages.map(m => ({ role: m.role, content: m.content }));
  } else {
    const content = [];
    const meta = [
      requestBody.course,
      requestBody.paper,
      requestBody.year,
      requestBody.session,
      requestBody.timezone || requestBody.tz
    ].filter(Boolean).join(' · ');

    if (requestBody.pdf) {
      // Format A: raw PDF base64
      content.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: requestBody.pdf }
      });
    } else if (requestBody.pages && Array.isArray(requestBody.pages)) {
      // Format C: page images
      for (const pg of requestBody.pages) {
        const imgData = pg.image || pg.base64 || pg.data;
        const imgType = pg.type || pg.media_type || 'image/jpeg';
        if (imgData) {
          content.push({
            type: 'image',
            source: { type: 'base64', media_type: imgType, data: imgData }
          });
        }
      }
    } else if (requestBody.images && Array.isArray(requestBody.images)) {
      // Format D: flat images array
      for (const img of requestBody.images) {
        const data = typeof img === 'string' ? img : (img && img.data);
        const type = (img && img.type) || 'image/jpeg';
        if (data) {
          content.push({
            type: 'image',
            source: { type: 'base64', media_type: type, data: data }
          });
        }
      }
    }

    if (content.length === 0) {
      return new Response(
        JSON.stringify({ error: { message: 'No PDF or page images provided' } }),
        { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    const prompt = requestBody.prompt || (
      'Mark this student exam paper' + (meta ? ' (' + meta + ')' : '') +
      '. Go through every page and mark all student working you find.'
    );
    content.push({ type: 'text', text: prompt });

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

  // Stream the response back
  return new Response(claudeResponse.body, {
    headers: {
      'Content-Type':                'text/event-stream',
      'Cache-Control':               'no-cache',
      'X-Accel-Buffering':           'no',
      'Access-Control-Allow-Origin': '*',
    },
  });
};

export const config = {
  path: "/api/mark-script",
};
