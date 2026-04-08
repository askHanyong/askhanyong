// ════════════════════════════════════════════════════════════════
// Markings List — Netlify Edge Function (Deno runtime)
// Returns all saved markings for the logged-in teacher, plus a
// lookup table of exam/assignment names and total marks.
//
// POST /api/markings-list
// Body: { token }
// Returns: { markings, lookup }
//   markings: most recent 200, ordered by created_at desc
//   lookup:   { [examId]: { name, totalMarks, type } }
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

    if (!supabaseUrl || !supabaseKey) return jsonErr(500, 'Supabase not configured');

    let body;
    try { body = await request.json(); }
    catch { return jsonErr(400, 'Invalid JSON'); }

    const email = await verifyTeacherToken(body.token, sessionSecret);
    if (!email) return jsonErr(401, 'Invalid or expired teacher session');

    const sbHeaders = { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` };

    // Fetch all three in parallel
    const [markingsRes, assignmentsRes, examsRes] = await Promise.all([
      fetch(
        `${supabaseUrl}/rest/v1/markings?marked_by=eq.${encodeURIComponent(email)}&order=created_at.desc&limit=200&select=id,exam_id,student_name,ai_score,final_score,question_marks,annotations,report_token,created_at`,
        { headers: sbHeaders },
      ),
      fetch(
        `${supabaseUrl}/rest/v1/assignments?created_by=eq.${encodeURIComponent(email)}&select=id,name,type,subject,total_marks`,
        { headers: sbHeaders },
      ),
      fetch(
        `${supabaseUrl}/rest/v1/exams?select=id,label,total_marks`,
        { headers: sbHeaders },
      ),
    ]);

    const markings    = markingsRes.ok    ? await markingsRes.json()    : [];
    const assignments = assignmentsRes.ok ? await assignmentsRes.json() : [];
    const exams       = examsRes.ok       ? await examsRes.json()       : [];

    // Build lookup: examId → { name, totalMarks, type }
    const lookup = {
      // Hardcoded known defaults
      'MAA-HL-M24-P1-TZ1': { name: 'IB MAA HL May 2024 Paper 1 TZ1', totalMarks: 110, type: 'ib' },
      'MAA-HL-M24-P2-TZ1': { name: 'IB MAA HL May 2024 Paper 2 TZ1', totalMarks: 110, type: 'ib' },
    };

    // Add from assignments table
    for (const a of (Array.isArray(assignments) ? assignments : [])) {
      if (a.id) lookup[a.id] = {
        name:       a.name || 'Untitled Assignment',
        totalMarks: a.total_marks || null,
        type:       a.type || 'assignment',
      };
    }

    // Add from exams table (overrides hardcoded if present)
    for (const e of (Array.isArray(exams) ? exams : [])) {
      if (e.id) lookup[e.id] = {
        name:       e.label || e.id,
        totalMarks: e.total_marks || null,
        type:       'ib',
      };
    }

    return jsonOk({ markings: Array.isArray(markings) ? markings : [], lookup });

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || 'Internal error' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }
};
