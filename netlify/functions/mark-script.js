const https = require('https');
const crypto = require('crypto');

const MARK_SYSTEM_PROMPT = `You are HAN, an IB Mathematics examiner with 20+ years of experience marking IB exam scripts. You are marking a student's written exam paper.

MARKING INSTRUCTIONS:
1. Go through every page of the document carefully.
2. For each page with student working visible:
   - Identify which question/part the student is answering (e.g. "Question 3(b)")
   - Read and transcribe their key working steps briefly
   - Mark it against the IB mark scheme using standard codes:
     M1 = method mark, A1 = answer mark, R1 = reasoning mark, ft = follow-through
   - State which marks are earned and which are lost
   - Note specific errors or where marks were lost

3. If a page is blank, contains only a printed question with no student working, or is a cover page, say "No student working on this page." and move on quickly.

4. Be precise and specific — reference the exact line or step where errors occur.

5. After going through ALL pages, output a FINAL SUMMARY with:
   - Total marks earned vs total available
   - Key strengths in the student's work
   - Most important areas for improvement

TONE: Professional, precise, encouraging. Point out what the student did well, not just errors.`;

const PINNED_MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS  = 8000;

// HMAC session token verification
function verifySessionToken(token, secret) {
  try {
    const parts = token.split(':');
    if (parts.length < 3) return null;
    const hmac    = parts[parts.length - 1];
    const payload = parts.slice(0, -1).join(':');
    const [emailB64, expiry] = payload.split(':');
    if (!emailB64 || !expiry || !hmac) return null;
    if (Date.now() > Number(expiry)) return null;

    const expectedHex = crypto.createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    if (hmac.length !== expectedHex.length) return null;
    let diff = 0;
    for (let i = 0; i < hmac.length; i++) diff |= hmac.charCodeAt(i) ^ expectedHex.charCodeAt(i);
    if (diff !== 0) return null;

    return Buffer.from(emailB64, 'base64').toString('utf8');
  } catch (e) {
    return null;
  }
}

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, X-HAN-Token',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: { message: 'ANTHROPIC_API_KEY not set' } })
    };
  }

  // Authentication
  const sessionSecret = process.env.SESSION_SECRET;
  if (sessionSecret) {
    const token = (event.headers['x-han-token'] || event.headers['X-HAN-Token'] || '');
    const email = verifySessionToken(token, sessionSecret);
    if (!email) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: { message: 'Unauthorized. Please sign in.' } })
      };
    }
  }

  // Parse request body
  let requestBody;
  try {
    const bodyStr = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body;
    requestBody = JSON.parse(bodyStr);
  } catch (e) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: { message: 'Invalid JSON body' } })
    };
  }

  // Build Claude messages from the request
  // Support multiple formats:
  //   { pdf: "base64...", course, paper, year, session, tz }
  //   { messages: [...] }
  //   { pages: [{ image: "base64", type: "..." }], ... }
  //   { images: ["base64", ...], ... }
  let messages;

  if (requestBody.messages && Array.isArray(requestBody.messages)) {
    messages = requestBody.messages.map(function(m) { return { role: m.role, content: m.content }; });
  } else {
    const content = [];
    const meta = [
      requestBody.course,
      requestBody.paper,
      requestBody.year,
      requestBody.session,
      requestBody.timezone || requestBody.tz
    ].filter(Boolean).join(' \u00b7 ');

    if (requestBody.pdf) {
      // Raw PDF base64 — use Claude's native document support
      content.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: requestBody.pdf }
      });
    } else if (requestBody.pages && Array.isArray(requestBody.pages)) {
      for (var i = 0; i < requestBody.pages.length; i++) {
        var pg = requestBody.pages[i];
        var imgData = pg.image || pg.base64 || pg.data;
        var imgType = pg.type || pg.media_type || 'image/jpeg';
        if (imgData) {
          content.push({ type: 'image', source: { type: 'base64', media_type: imgType, data: imgData } });
        }
      }
    } else if (requestBody.images && Array.isArray(requestBody.images)) {
      for (var j = 0; j < requestBody.images.length; j++) {
        var img = requestBody.images[j];
        var data = typeof img === 'string' ? img : (img && img.data);
        var type = (img && img.type) || 'image/jpeg';
        if (data) {
          content.push({ type: 'image', source: { type: 'base64', media_type: type, data: data } });
        }
      }
    }

    if (content.length === 0) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: { message: 'No PDF or page images provided' } })
      };
    }

    var prompt = requestBody.prompt || (
      'Mark this student exam paper' + (meta ? ' (' + meta + ')' : '') +
      '. Go through every page and mark all student working you find.'
    );
    content.push({ type: 'text', text: prompt });

    messages = [{ role: 'user', content: content }];
  }

  const finalPayload = {
    model: PINNED_MODEL,
    max_tokens: MAX_TOKENS,
    system: MARK_SYSTEM_PROMPT,
    stream: false,
    messages: messages
  };

  const finalBody = Buffer.from(JSON.stringify(finalPayload), 'utf8');

  return new Promise(function(resolve) {
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25',
        'Content-Length': finalBody.length
      }
    };

    const req = https.request(options, function(res) {
      const chunks = [];
      res.on('data', function(chunk) { chunks.push(chunk); });
      res.on('end', function() {
        const responseBody = Buffer.concat(chunks).toString('utf8');
        resolve({
          statusCode: res.statusCode,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: responseBody
        });
      });
    });

    req.on('error', function(e) {
      resolve({
        statusCode: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: { message: 'Network error: ' + e.message } })
      });
    });

    req.write(finalBody);
    req.end();
  });
};
