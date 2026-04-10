// ════════════════════════════════════════════════════════════════
// IA Verify — Netlify Edge Function (Deno runtime)
// Creates or fetches an ia_users record; resets daily call counter.
//
// POST /api/ia-verify
// Body: { email, name? }
// Returns: { premium, callsToday, callsLimit, callsRemaining, isNew }
//
// Supabase table required (run in SQL editor):
//   CREATE TABLE IF NOT EXISTS ia_users (
//     id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
//     email       text        NOT NULL UNIQUE,
//     name        text,
//     premium     boolean     NOT NULL DEFAULT false,
//     premium_note text,
//     calls_today integer     NOT NULL DEFAULT 0,
//     calls_date  date        NOT NULL DEFAULT CURRENT_DATE,
//     total_calls integer     NOT NULL DEFAULT 0,
//     created_at  timestamptz NOT NULL DEFAULT now()
//   );
//   ALTER TABLE ia_users ENABLE ROW LEVEL SECURITY;
// ════════════════════════════════════════════════════════════════

const FREE_LIMIT = 15;

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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')?.replace(/\/$/, '');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_KEY');
    if (!supabaseUrl || !supabaseKey) return jsonErr(500, 'Supabase not configured');

    let body;
    try { body = await request.json(); }
    catch { return jsonErr(400, 'Invalid JSON'); }

    const email = (body.email || '').trim().toLowerCase();
    const name  = (body.name  || '').trim().slice(0, 120);
    if (!email || !email.includes('@')) return jsonErr(400, 'Valid email required');

    const sbH = {
      'Content-Type':  'application/json',
      'apikey':        supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
    };

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // Helper: fetch with a 6-second abort so Supabase can't hang indefinitely
    const sbFetch = (url, opts = {}) => {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 6000);
      return fetch(url, { ...opts, signal: ctrl.signal });
    };

    // ── Fetch existing user ──────────────────────────────
    let selRes, selRows;
    try {
      selRes  = await sbFetch(
        `${supabaseUrl}/rest/v1/ia_users?email=eq.${encodeURIComponent(email)}&select=*&limit=1`,
        { headers: sbH },
      );
      selRows = selRes.ok ? await selRes.json() : [];
    } catch {
      // Supabase unreachable — return safe defaults so login still works
      return jsonOk({ premium: false, callsToday: 0, callsLimit: FREE_LIMIT, callsRemaining: FREE_LIMIT, isNew: false });
    }

    let user;
    let isNew = false;

    if (selRows.length === 0) {
      // ── Create new user ────────────────────────────────
      let insRes, insRows = [];
      try {
        insRes  = await sbFetch(`${supabaseUrl}/rest/v1/ia_users`, {
          method:  'POST',
          headers: { ...sbH, 'Prefer': 'return=representation' },
          body: JSON.stringify({
            email,
            name:        name || null,
            calls_today: 0,
            calls_date:  today,
            total_calls: 0,
          }),
        });
        insRows = insRes.ok ? await insRes.json() : [];
      } catch { /* table may not exist yet — fall through to safe defaults */ }
      user  = Array.isArray(insRows) ? insRows[0] : insRows;
      isNew = true;

      if (!user) {
        // Insert may have failed silently — return safe defaults
        return jsonOk({ premium: false, callsToday: 0, callsLimit: FREE_LIMIT, callsRemaining: FREE_LIMIT, isNew: true });
      }
    } else {
      user = selRows[0];

      // ── Reset daily counter if new day ─────────────────
      if (user.calls_date !== today) {
        let pRows = [];
        try {
          const patch = await sbFetch(
            `${supabaseUrl}/rest/v1/ia_users?email=eq.${encodeURIComponent(email)}`,
            {
              method:  'PATCH',
              headers: { ...sbH, 'Prefer': 'return=representation' },
              body: JSON.stringify({
                calls_today: 0,
                calls_date:  today,
                ...(name && !user.name ? { name } : {}),
              }),
            },
          );
          pRows = patch.ok ? await patch.json() : [];
        } catch { /* ignore patch failure — fall back to local reset */ }
        user = (Array.isArray(pRows) ? pRows[0] : pRows) || { ...user, calls_today: 0, calls_date: today };
      } else if (name && !user.name) {
        // Back-fill name if missing
        fetch(
          `${supabaseUrl}/rest/v1/ia_users?email=eq.${encodeURIComponent(email)}`,
          { method: 'PATCH', headers: sbH, body: JSON.stringify({ name }) },
        );
        user.name = name;
      }
    }

    const callsLimit     = user.premium ? 9999 : FREE_LIMIT;
    const callsToday     = user.calls_today  ?? 0;
    const callsRemaining = Math.max(0, callsLimit - callsToday);

    return jsonOk({ premium: !!user.premium, callsToday, callsLimit, callsRemaining, isNew });

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || 'Internal error' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }
};
