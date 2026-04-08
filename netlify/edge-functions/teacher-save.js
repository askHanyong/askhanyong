// ════════════════════════════════════════════════════════════════
// Teacher Save — Netlify Edge Function (Deno runtime)
// Stores a verified marking record in Supabase for future
// calibration and fine-tuning (Phase 1 learning pipeline).
//
// POST /api/teacher-save
// Body: { token, studentName, aiScore, finalScore, questionMarks }
// questionMarks: [{ q, p, ma, ai, final, delta, notes }, ...]
// ════════════════════════════════════════════════════════════════

// ── Teacher token verification (same as teacher-mark.js) ─────────
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
    return decoded.slice(2); // email address
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

    if (!supabaseUrl || !supabaseKey) return jsonErr(500, 'Supabase not configured');

    let body;
    try { body = await request.json(); }
    catch { return jsonErr(400, 'Invalid JSON'); }

    const { token, studentName, aiScore, finalScore, questionMarks, examId, annotations, classLabel } = body;

    if (!token)         return jsonErr(401, 'token required');
    if (!studentName)   return jsonErr(400, 'studentName required');
    if (finalScore === undefined || finalScore === null) return jsonErr(400, 'finalScore required');
    if (!Array.isArray(questionMarks) || questionMarks.length === 0) return jsonErr(400, 'questionMarks required');

    const email = await verifyTeacherToken(token, sessionSecret);
    if (!email) return jsonErr(401, 'Invalid or expired teacher session');

    // Insert into Supabase via REST API
    const insertRes = await fetch(`${supabaseUrl}/rest/v1/markings`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer':        'return=representation',
      },
      body: JSON.stringify({
        exam_id:        examId || 'MAA-HL-M24-P1-TZ1',
        student_name:   studentName,
        marked_by:      email,
        ai_score:       typeof aiScore === 'number' ? aiScore : null,
        final_score:    finalScore,
        question_marks: questionMarks,
        ...(Array.isArray(annotations) && annotations.length > 0 ? { annotations } : {}),
        ...(classLabel ? { class_label: String(classLabel).trim().slice(0, 60) } : {}),
      }),
    });

    if (!insertRes.ok) {
      let errDetail = '';
      try { const d = await insertRes.json(); errDetail = d.message || d.error || JSON.stringify(d); } catch {}
      return jsonErr(insertRes.status, `Supabase error: ${errDetail}`);
    }

    const rows = await insertRes.json();
    const saved = Array.isArray(rows) ? rows[0] : rows;

    return jsonOk({
      ok:           true,
      id:           saved?.id ?? null,
      report_token: saved?.report_token ?? null,
      message:      'Marking saved successfully.',
    });

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || 'Internal error' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }
};
