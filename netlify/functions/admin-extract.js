const https = require('https');

// Simple admin secret — set ADMIN_SECRET in Netlify environment variables
const ADMIN_SECRET = process.env.ADMIN_SECRET;

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Check admin secret
  if (!ADMIN_SECRET) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: { message: 'ADMIN_SECRET not configured in Netlify environment variables' } })
    };
  }
  const auth = (event.headers['authorization'] || event.headers['Authorization'] || '');
  if (auth !== 'Bearer ' + ADMIN_SECRET) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: { message: 'Unauthorized' } })
    };
  }

  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: { message: 'ANTHROPIC_API_KEY not set' } })
    };
  }

  let requestBody;
  try {
    const bodyBuffer = Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8');
    requestBody = JSON.parse(bodyBuffer.toString('utf8'));
  } catch (e) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: { message: 'Invalid JSON body' } })
    };
  }

  // system prompt is supplied by the caller (admin only)
  const finalBody = Buffer.from(JSON.stringify({
    model: requestBody.model || 'claude-haiku-4-5-20251001',
    max_tokens: requestBody.max_tokens || 1024,
    system: requestBody.system,
    messages: requestBody.messages
  }), 'utf8');

  return new Promise((resolve) => {
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': finalBody.length
      }
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const responseBody = Buffer.concat(chunks).toString('utf8');
        resolve({
          statusCode: res.statusCode,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: responseBody
        });
      });
    });

    req.on('error', (e) => {
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
