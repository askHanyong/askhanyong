// ════════════════════════════════════════════════════════════════
// Script Fetch — Netlify Edge Function (Deno runtime)
// Returns the stored student script PDF + annotations for a
// given marking, so the Dashboard can regenerate the annotated PDF.
//
// POST /api/script-fetch
// Body: { token, markingId }
// Returns: { scriptPdfB64, annotations, studentName, examId }
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

    const { token, markingId } = body;
    if (!token)     return jsonErr(401, 'token required');
    if (!markingId) return jsonErr(400, 'markingId required');

    const email = await verifyTeacherToken(token, sessionSecret);
    if (!email) return jsonErr(401, 'Invalid or expired teacher session');

    const sbHeaders = { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` };

    // Fetch marking (verify ownership + get script_path, annotations)
    const markRes = await fetch(
      `${supabaseUrl}/rest/v1/markings?id=eq.${encodeURIComponent(markingId)}&marked_by=eq.${encodeURIComponent(email)}&select=script_path,annotations,student_name,exam_id`,
      { headers: sbHeaders },
    );
    const markings = markRes.ok ? await markRes.json() : [];
    if (!markings.length) return jsonErr(404, 'Marking not found or access denied');
    const marking = markings[0];

    if (!marking.script_path) return jsonErr(404, 'No script stored for this marking. Re-mark to enable PDF download.');

    // Fetch PDF from Supabase Storage
    const pdfRes = await fetch(
      `${supabaseUrl}/storage/v1/object/assignments/${marking.script_path}`,
      { headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey } },
    );
    if (!pdfRes.ok) return jsonErr(502, `Storage fetch failed (${pdfRes.status})`);

    const buffer = await pdfRes.arrayBuffer();
    const bytes  = new Uint8Array(buffer);
    let binary   = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const scriptPdfB64 = btoa(binary);

    return jsonOk({
      scriptPdfB64,
      annotations:  marking.annotations  || [],
      studentName:  marking.student_name,
      examId:       marking.exam_id,
    });

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || 'Internal error' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }
};
