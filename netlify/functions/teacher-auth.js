// ════════════════════════════════════════════════════════════════
// Teacher Auth — Netlify Function
// Handles teacher registration (invite-code gated) and login.
// Uses the same GAS/Sheets backend as student auth, in a separate
// "Teachers" sheet tab.
// ════════════════════════════════════════════════════════════════

const crypto = require('crypto');

const SHEETS_URL         = process.env.SHEETS_URL;
const GAS_ADMIN_SECRET   = process.env.GAS_ADMIN_SECRET;
const SESSION_SECRET     = process.env.SESSION_SECRET;
const TEACHER_INVITE_CODES = process.env.TEACHER_INVITE_CODES || '';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ── Password utilities ────────────────────────────────────────────
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  try {
    const [salt, hash] = stored.split(':');
    const inputHash = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(inputHash, 'hex'));
  } catch { return false; }
}

// ── Teacher session token (HMAC-SHA256, 30-day expiry) ────────────
// Distinguished from student tokens by 'T:' prefix inside the base64.
function signTeacherToken(email) {
  if (!SESSION_SECRET) return null;
  const expiry   = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const emailB64 = Buffer.from('T:' + email.toLowerCase()).toString('base64');
  const payload  = `${emailB64}:${expiry}`;
  const hmac     = crypto.createHmac('sha256', SESSION_SECRET + ':teacher').update(payload).digest('hex');
  return `${payload}:${hmac}`;
}

// GAS helper
async function callGAS(params) {
  const url = SHEETS_URL + '?' + new URLSearchParams(params).toString();
  const res  = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error('GAS ' + res.status);
  const txt = await res.text();
  try { return JSON.parse(txt); } catch { return { raw: txt }; }
}

// ── Handler ───────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS_HEADERS };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: CORS_HEADERS, body: 'Method not allowed' };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { action } = body;

  // ── Register ──────────────────────────────────────────────────
  if (action === 'register') {
    const { email, password, inviteCode, name } = body;
    if (!email || !password || !inviteCode || !name)
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'All fields required' }) };

    const validCodes = TEACHER_INVITE_CODES.split(',').map(c => c.trim()).filter(Boolean);
    if (!validCodes.includes(inviteCode.trim()))
      return { statusCode: 403, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Invalid invite code' }) };

    if (password.length < 8)
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Password must be at least 8 characters' }) };

    const passwordHash = hashPassword(password);
    const result = await callGAS({
      action: 'teacher_register',
      email: email.toLowerCase().trim(),
      passwordHash,
      name: name.trim(),
      secret: GAS_ADMIN_SECRET,
    });
    if (result.error) return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: result.error }) };

    const token = signTeacherToken(email);
    return { statusCode: 200, headers: CORS_HEADERS,
      body: JSON.stringify({ token, name: name.trim(), email: email.toLowerCase().trim() }) };
  }

  // ── Login ─────────────────────────────────────────────────────
  if (action === 'login') {
    const { email, password } = body;
    if (!email || !password)
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Email and password required' }) };

    const result = await callGAS({
      action: 'teacher_get',
      email: email.toLowerCase().trim(),
      secret: GAS_ADMIN_SECRET,
    });
    if (!result.found || !verifyPassword(password, result.passwordHash))
      return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Invalid email or password' }) };

    const token = signTeacherToken(email);
    return { statusCode: 200, headers: CORS_HEADERS,
      body: JSON.stringify({ token, name: result.name, email: email.toLowerCase().trim() }) };
  }

  // ── Verify token ──────────────────────────────────────────────
  if (action === 'verify') {
    const { token } = body;
    if (!token || !SESSION_SECRET)
      return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'No token' }) };
    try {
      const parts = token.split(':');
      if (parts.length < 3) throw new Error('bad format');
      const hmac    = parts.pop();
      const expiry  = parts.pop();
      const emailB64 = parts.join(':');
      const payload  = `${emailB64}:${expiry}`;
      const expected = crypto.createHmac('sha256', SESSION_SECRET + ':teacher').update(payload).digest('hex');
      if (!crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expected, 'hex'))) throw new Error('bad hmac');
      if (Date.now() > parseInt(expiry, 10)) throw new Error('expired');
      const decoded = Buffer.from(emailB64, 'base64').toString();
      if (!decoded.startsWith('T:')) throw new Error('not teacher');
      const email = decoded.slice(2);
      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ email, valid: true }) };
    } catch {
      return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Invalid or expired session' }) };
    }
  }

  return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Unknown action' }) };
};
