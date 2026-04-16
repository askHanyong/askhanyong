// ════════════════════════════════════════════════════════════════
// Assignment Upload URL — Netlify Edge Function (Deno runtime)
// Creates short-lived signed upload URLs for assignment PDFs.
//
// POST /api/assignment-upload-url
// Body: { token, assignmentId, filePath }
// filePath supports:
//   - <assignmentId>/solution.pdf
//   - <assignmentId>/paper.pdf
//   - <assignmentId>/student-scripts/<filename>.pdf
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
  } catch {
    return null;
  }
}

export default async (request) => {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
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
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: CORS });

    const sessionSecret = Deno.env.get('SESSION_SECRET');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')?.replace(/\/$/, '');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_KEY');
    if (!supabaseUrl || !supabaseKey) return jsonErr(500, 'Supabase not configured');

    let body;
    try { body = await request.json(); }
    catch { return jsonErr(400, 'Invalid JSON'); }

    const { token, assignmentId, filePath } = body;
    if (!token) return jsonErr(401, 'token required');
    if (!assignmentId) return jsonErr(400, 'assignmentId required');
    if (!filePath) return jsonErr(400, 'filePath required');
    if (!/^[a-z0-9-]+$/.test(assignmentId)) return jsonErr(400, 'Invalid assignmentId');
    const isCreateFlowPath =
      filePath === `${assignmentId}/solution.pdf` ||
      filePath === `${assignmentId}/paper.pdf`;
    const isMarkFlowPath = new RegExp(`^${assignmentId}/student-scripts/[a-z0-9._-]+\\.pdf$`).test(filePath);
    if (!isCreateFlowPath && !isMarkFlowPath) {
      return jsonErr(400, 'Invalid filePath');
    }

    const email = await verifyTeacherToken(token, sessionSecret);
    if (!email) return jsonErr(401, 'Invalid or expired teacher session');

    const signRes = await fetch(`${supabaseUrl}/storage/v1/object/upload/sign/assignments/${filePath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ expiresIn: 600 }),
    });

    const signData = await signRes.json().catch(() => ({}));
    if (!signRes.ok) {
      const detail = signData?.message || signData?.error || JSON.stringify(signData);
      return jsonErr(signRes.status, `Could not create signed upload URL: ${detail}`);
    }

    let uploadUrl = null;
    if (typeof signData.signedURL === 'string' && signData.signedURL) {
      uploadUrl = `${supabaseUrl}/storage/v1${signData.signedURL}`;
    } else if (typeof signData.url === 'string' && signData.url) {
      uploadUrl = signData.url.startsWith('http')
        ? signData.url
        : `${supabaseUrl}/storage/v1${signData.url}`;
    } else if (signData.token) {
      uploadUrl = `${supabaseUrl}/storage/v1/object/upload/sign/assignments/${filePath}?token=${encodeURIComponent(signData.token)}`;
    }

    if (!uploadUrl) return jsonErr(502, 'Signed URL format not recognized');
    return jsonOk({ ok: true, path: filePath, uploadUrl });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `Edge function exception: ${err?.message ?? String(err)}` }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }
};
