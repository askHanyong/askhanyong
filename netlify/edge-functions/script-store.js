// ════════════════════════════════════════════════════════════════
// Script Store — Netlify Edge Function (Deno runtime)
// Uploads a student script PDF to Supabase Storage and records
// the path in the markings row. Called after saving a marking.
//
// POST /api/script-store
// Body: { token, markingId, scriptPath }
// Returns: { ok, storagePath }
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
      'raw', new TextEncoder().encode(secret + ':teacher'),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${emailB64}:${expiry}`));
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
  const jsonOk  = (data) => new Response(
    JSON.stringify(data),
    { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } },
  );

  try {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method !== 'POST')    return new Response('Method Not Allowed', { status: 405, headers: CORS });

    const sessionSecret = Deno.env.get('SESSION_SECRET');
    const supabaseUrl   = Deno.env.get('SUPABASE_URL')?.replace(/\/$/, '');
    const supabaseKey   = Deno.env.get('SUPABASE_SERVICE_KEY');
    if (!supabaseUrl || !supabaseKey) return jsonErr(500, 'Supabase not configured');

    let body;
    try { body = await request.json(); } catch { return jsonErr(400, 'Invalid JSON'); }

    const { token, markingId, scriptPath } = body;
    if (!token)        return jsonErr(401, 'token required');
    if (!markingId)    return jsonErr(400, 'markingId required');
    if (!scriptPath)   return jsonErr(400, 'scriptPath required');

    const email = await verifyTeacherToken(token, sessionSecret);
    if (!email) return jsonErr(401, 'Invalid or expired teacher session');

    // Verify this marking belongs to the teacher
    const sbHeaders = { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` };
    const checkRes  = await fetch(
      `${supabaseUrl}/rest/v1/markings?id=eq.${encodeURIComponent(markingId)}&marked_by=eq.${encodeURIComponent(email)}&select=id`,
      { headers: sbHeaders },
    );
    const rows = checkRes.ok ? await checkRes.json() : [];
    if (!rows.length) return jsonErr(403, 'Marking not found or access denied');

    const storagePath = String(scriptPath).trim();
    if (!storagePath.endsWith('.pdf') || storagePath.includes('..')) {
      return jsonErr(400, 'Invalid scriptPath');
    }

    // Update marking.script_path
    await fetch(
      `${supabaseUrl}/rest/v1/markings?id=eq.${encodeURIComponent(markingId)}&marked_by=eq.${encodeURIComponent(email)}`,
      {
        method:  'PATCH',
        headers: { ...sbHeaders, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body:    JSON.stringify({ script_path: storagePath }),
      },
    );

    return jsonOk({ ok: true, storagePath });

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || 'Internal error' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }
};
