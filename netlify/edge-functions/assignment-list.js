// ════════════════════════════════════════════════════════════════
// Assignment List — Netlify Edge Function (Deno runtime)
// Returns all assignments created by the logged-in teacher.
//
// POST /api/assignment-list
// Body: { token }
// ════════════════════════════════════════════════════════════════

async function verifyTeacherToken(token, secret) {
  try {
    if (!token || !secret) return null;
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

    if (hmac.length !== expectedHex.length) return null;
    let diff = 0;
    for (let i = 0; i < hmac.length; i++) diff |= hmac.charCodeAt(i) ^ expectedHex.charCodeAt(i);
    if (diff !== 0) return null;

    const decoded = atob(emailB64);
    if (!decoded.startsWith('T:')) return null;
    return decoded.slice(2);
  } catch { return null; }
}

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

  try {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method !== 'POST')    return new Response('Method Not Allowed', { status: 405, headers: CORS });

    const sessionSecret = Deno.env.get('SESSION_SECRET');
    const supabaseUrl   = Deno.env.get('SUPABASE_URL')?.replace(/\/$/, '');
    const supabaseKey   = Deno.env.get('SUPABASE_SERVICE_KEY');

    if (!supabaseUrl || !supabaseKey) return jsonErr(500, 'Supabase not configured');

    let body;
    try { body = await request.json(); }
    catch { return jsonErr(400, 'Invalid JSON'); }

    const email = await verifyTeacherToken(body.token, sessionSecret);
    if (!email) return jsonErr(401, 'Invalid or expired teacher session');

    // Fetch assignments for this teacher, most recent first
    const res = await fetch(
      `${supabaseUrl}/rest/v1/assignments?created_by=eq.${encodeURIComponent(email)}&order=created_at.desc&select=id,name,type,subject,total_marks,structure,created_at`,
      { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } },
    );

    if (!res.ok) {
      const errText = await res.text();
      return jsonErr(res.status, `DB query failed: ${errText}`);
    }

    const assignments = await res.json();
    return new Response(
      JSON.stringify({ assignments }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: `Edge function exception: ${err?.message ?? String(err)}` }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }
};
