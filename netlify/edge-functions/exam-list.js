// ════════════════════════════════════════════════════════════════
// Exam List — Netlify Edge Function (Deno runtime)
// Returns available IB papers from Supabase. Always includes the
// hardcoded default (MAA-HL-M24-P1-TZ1) so the UI shows at least
// one paper even before the exams table is seeded.
//
// POST /api/exam-list
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

// The built-in paper — always available even if exams table is empty
const DEFAULT_EXAM = {
  id:          'MAA-HL-M24-P1-TZ1',
  label:       'IB MAA HL May 2024 Paper 1 TZ1',
  subject:     'Mathematics: Analysis and Approaches',
  level:       'HL',
  session:     'May 2024',
  paper:       'Paper 1',
  timezone:    'TZ1',
  total_marks: 110,
  is_default:  true,
};

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

    let body;
    try { body = await request.json(); }
    catch { return jsonErr(400, 'Invalid JSON'); }

    const email = await verifyTeacherToken(body.token, sessionSecret);
    if (!email) return jsonErr(401, 'Invalid or expired teacher session');

    // Start with the default hardcoded paper
    const exams = [DEFAULT_EXAM];

    // Append any additional papers from Supabase (best-effort)
    if (supabaseUrl && supabaseKey) {
      try {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/exams?is_active=eq.true&order=created_at.desc&select=id,label,subject,level,session,paper,timezone,total_marks`,
          { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } },
        );
        if (res.ok) {
          const rows = await res.json();
          rows.forEach(row => {
            // Don't duplicate the default
            if (row.id !== DEFAULT_EXAM.id) exams.push(row);
          });
        }
      } catch {}
    }

    return new Response(
      JSON.stringify({ exams }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: `Exception: ${err?.message ?? String(err)}` }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }
};
