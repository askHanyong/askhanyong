// ════════════════════════════════════════════════════════════════
// Teacher Auth — Netlify Edge Function (Deno runtime)
// Replaces the GAS/Sheets backend with Supabase.
// Handles: register (invite-code gated), login, verify token.
//
// POST /api/teacher-auth
// Body: { action: 'register'|'login'|'verify', ...fields }
// ════════════════════════════════════════════════════════════════

// ── Password hashing (PBKDF2 via WebCrypto) ───────────────────────
async function hashPassword(password) {
  const salt    = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = [...salt].map(b => b.toString(16).padStart(2, '0')).join('');
  const key     = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'],
  );
  const bits    = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' }, key, 256,
  );
  const hashHex = [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${saltHex}:${hashHex}`;
}

async function verifyPassword(password, stored) {
  try {
    const [saltHex, hashHex] = stored.split(':');
    const salt    = new Uint8Array(saltHex.match(/.{2}/g).map(h => parseInt(h, 16)));
    const key     = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'],
    );
    const bits    = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' }, key, 256,
    );
    const computed = [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
    if (computed.length !== hashHex.length) return false;
    let diff = 0;
    for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ hashHex.charCodeAt(i);
    return diff === 0;
  } catch { return false; }
}

// ── Session token (same format as all other edge functions) ───────
// Format: base64('T:email'):expiry:hmac
async function signTeacherToken(email, secret) {
  const expiry   = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
  const emailB64 = btoa('T:' + email.toLowerCase());
  const payload  = `${emailB64}:${expiry}`;
  const key      = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret + ':teacher'),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig      = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const hmac     = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${payload}:${hmac}`;
}

async function verifyTeacherToken(token, secret) {
  try {
    if (!token || !secret) return null;
    const parts = token.split(':');
    if (parts.length !== 3) return null;
    const [emailB64, expiry, hmac] = parts;
    if (!emailB64 || !expiry || !hmac) return null;
    if (Date.now() > Number(expiry)) return null;

    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret + ':teacher'),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const sig         = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${emailB64}:${expiry}`));
    const expectedHex = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');

    if (hmac.length !== expectedHex.length) return null;
    let diff = 0;
    for (let i = 0; i < hmac.length; i++) diff |= hmac.charCodeAt(i) ^ expectedHex.charCodeAt(i);
    if (diff !== 0) return null;

    const decoded = atob(emailB64);
    if (!decoded.startsWith('T:')) return null;
    return decoded.slice(2);
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
  const jsonOk = (data) => new Response(
    JSON.stringify(data),
    { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } },
  );

  try {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method !== 'POST')    return new Response('Method Not Allowed', { status: 405, headers: CORS });

    const sessionSecret = Deno.env.get('SESSION_SECRET');
    const supabaseUrl   = Deno.env.get('SUPABASE_URL')?.replace(/\/$/, '');
    const supabaseKey   = Deno.env.get('SUPABASE_SERVICE_KEY');
    const inviteCodes   = (Deno.env.get('TEACHER_INVITE_CODES') || '').split(',').map(c => c.trim()).filter(Boolean);

    if (!supabaseUrl || !supabaseKey) return jsonErr(500, 'Database not configured');
    if (!sessionSecret)               return jsonErr(500, 'Session secret not configured');

    let body;
    try { body = await request.json(); }
    catch { return jsonErr(400, 'Invalid JSON'); }

    const { action } = body;

    // ── Register ────────────────────────────────────────────────
    if (action === 'register') {
      const { email, password, name, inviteCode } = body;
      if (!email || !password || !name || !inviteCode)
        return jsonErr(400, 'All fields required');
      if (!inviteCodes.includes(inviteCode.trim()))
        return jsonErr(403, 'Invalid invite code');
      if (password.length < 8)
        return jsonErr(400, 'Password must be at least 8 characters');

      // Check if email already exists
      const checkRes = await fetch(
        `${supabaseUrl}/rest/v1/teachers?email=eq.${encodeURIComponent(email.toLowerCase().trim())}&select=id`,
        { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } },
      );
      const existing = await checkRes.json();
      if (existing.length > 0)
        return jsonErr(409, 'An account with this email already exists. Please log in.');

      const passwordHash = await hashPassword(password);

      const insertRes = await fetch(`${supabaseUrl}/rest/v1/teachers`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'apikey':        supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Prefer':        'return=representation',
        },
        body: JSON.stringify({
          email:         email.toLowerCase().trim(),
          name:          name.trim(),
          password_hash: passwordHash,
        }),
      });
      if (!insertRes.ok) {
        const err = await insertRes.text();
        return jsonErr(500, `Registration failed: ${err}`);
      }

      const token = await signTeacherToken(email, sessionSecret);
      return jsonOk({ token, name: name.trim(), email: email.toLowerCase().trim() });
    }

    // ── Login ────────────────────────────────────────────────────
    if (action === 'login') {
      const { email, password } = body;
      if (!email || !password) return jsonErr(400, 'Email and password required');

      const res = await fetch(
        `${supabaseUrl}/rest/v1/teachers?email=eq.${encodeURIComponent(email.toLowerCase().trim())}&select=name,password_hash`,
        { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } },
      );
      const rows = await res.json();
      if (!rows.length) return jsonErr(401, 'Invalid email or password');

      const teacher = rows[0];
      const valid   = await verifyPassword(password, teacher.password_hash);
      if (!valid)   return jsonErr(401, 'Invalid email or password');

      const token = await signTeacherToken(email, sessionSecret);
      return jsonOk({ token, name: teacher.name, email: email.toLowerCase().trim() });
    }

    // ── Verify ────────────────────────────────────────────────────
    if (action === 'verify') {
      const { token } = body;
      const email = await verifyTeacherToken(token, sessionSecret);
      if (!email) return jsonErr(401, 'Invalid or expired session');
      return jsonOk({ email, valid: true });
    }

    return jsonErr(400, 'Unknown action');

  } catch (err) {
    return new Response(
      JSON.stringify({ error: `Exception: ${err?.message ?? String(err)}` }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }
};
