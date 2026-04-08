// ════════════════════════════════════════════════════════════════
// Assignment Create — Netlify Edge Function (Deno runtime)
// Creates a homework/test assignment: stores metadata in Supabase,
// uploads solution PDF (and optional question paper PDF) to
// Supabase Storage.
//
// POST /api/assignment-create
// Body: {
//   token,
//   name,          // e.g. "Chapter 5 Integration Homework"
//   type,          // 'homework' | 'internal_test' | 'ib_paper'
//   subject,       // e.g. "IB Math MAA HL"
//   totalMarks,    // integer
//   structure,     // [{q:"1", label:"(a)", marks:3}, ...]  — optional
//   solutionPdf,   // base64 string
//   paperPdf,      // base64 string — optional
// }
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

// Upload a base64 PDF to Supabase Storage, return the storage path
async function uploadPdf(supabaseUrl, supabaseKey, bucket, path, base64Data) {
  // Convert base64 → binary
  const binary = atob(base64Data);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const res = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: {
      'Authorization':  `Bearer ${supabaseKey}`,
      'apikey':         supabaseKey,
      'Content-Type':   'application/pdf',
      'x-upsert':       'true',
    },
    body: bytes,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Storage upload failed (${res.status}): ${errText}`);
  }
  return path;
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

    const { token, name, type, subject, totalMarks, structure, solutionPdf, paperPdf } = body;

    if (!token)       return jsonErr(401, 'token required');
    if (!name)        return jsonErr(400, 'name required');
    if (!type)        return jsonErr(400, 'type required');
    if (!totalMarks)  return jsonErr(400, 'totalMarks required');
    if (!solutionPdf) return jsonErr(400, 'solutionPdf required');

    const email = await verifyTeacherToken(token, sessionSecret);
    if (!email) return jsonErr(401, 'Invalid or expired teacher session');

    // Generate a stable assignment ID slug from the name + timestamp
    const slug    = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const ts      = Date.now();
    const assignId = `${slug}-${ts}`;

    // Upload solution PDF to Supabase Storage
    const solutionPath = await uploadPdf(
      supabaseUrl, supabaseKey,
      'assignments',
      `${assignId}/solution.pdf`,
      solutionPdf,
    );

    // Upload optional question paper
    let paperPath = null;
    if (paperPdf) {
      paperPath = await uploadPdf(
        supabaseUrl, supabaseKey,
        'assignments',
        `${assignId}/paper.pdf`,
        paperPdf,
      );
    }

    // Insert assignment record into Supabase
    const insertRes = await fetch(`${supabaseUrl}/rest/v1/assignments`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer':        'return=representation',
      },
      body: JSON.stringify({
        id:            assignId,
        created_by:    email,
        name,
        type,
        subject:       subject || 'IB Math',
        total_marks:   totalMarks,
        structure:     structure || null,
        solution_path: solutionPath,
        paper_path:    paperPath,
      }),
    });

    if (!insertRes.ok) {
      let detail = '';
      try { const d = await insertRes.json(); detail = d.message || d.error || JSON.stringify(d); } catch {}
      return jsonErr(insertRes.status, `DB insert failed: ${detail}`);
    }

    const rows = await insertRes.json();
    const saved = Array.isArray(rows) ? rows[0] : rows;

    return jsonOk({ ok: true, id: saved.id, name: saved.name });

  } catch (err) {
    return new Response(
      JSON.stringify({ error: `Edge function exception: ${err?.message ?? String(err)}` }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }
};
