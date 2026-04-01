// ════════════════════════════════════════════════════════════════
// Teacher Mark Status — reads job result from GAS
// ════════════════════════════════════════════════════════════════

const crypto = require('crypto');

const SESSION_SECRET   = process.env.SESSION_SECRET;
const SHEETS_URL       = process.env.SHEETS_URL;
const GAS_ADMIN_SECRET = process.env.GAS_ADMIN_SECRET;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS_HEADERS };
  if (event.httpMethod !== 'GET')     return { statusCode: 405, headers: CORS_HEADERS, body: 'Method not allowed' };

  const { jobId, token } = event.queryStringParameters || {};
  if (!jobId) return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'jobId required' }) };
  if (!token) return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'token required' }) };

  const email = verifyTeacherToken(token);
  if (!email) return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Invalid or expired session' }) };

  if (!SHEETS_URL || !GAS_ADMIN_SECRET) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'GAS not configured' }) };
  }

  try {
    const url = `${SHEETS_URL}?action=getMarkJob&jobId=${encodeURIComponent(jobId)}&secret=${encodeURIComponent(GAS_ADMIN_SECRET)}`;
    const res  = await fetch(url, { redirect: 'follow' });
    const gas  = await res.json();

    if (!gas.found) {
      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ ready: false }) };
    }

    const data = JSON.parse(gas.data);
    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(data) };

  } catch (err) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
