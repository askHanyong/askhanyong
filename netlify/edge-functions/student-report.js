// ════════════════════════════════════════════════════════════════
// Student Report — Netlify Edge Function (Deno runtime)
// PUBLIC endpoint — no auth required. Fetches a verified marking
// record by its report_token so students can view their results.
//
// GET /api/student-report?t=<report_token>
// ════════════════════════════════════════════════════════════════

export default async (request) => {
  const CORS = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };
  const jsonErr = (status, msg) => new Response(
    JSON.stringify({ error: msg }),
    { status, headers: { ...CORS, 'Content-Type': 'application/json' } },
  );

  try {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method !== 'GET')    return new Response('Method Not Allowed', { status: 405, headers: CORS });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')?.replace(/\/$/, '');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_KEY');
    if (!supabaseUrl || !supabaseKey) return jsonErr(500, 'Supabase not configured');

    const url   = new URL(request.url);
    const token = url.searchParams.get('t');
    if (!token) return jsonErr(400, 'Report token required (?t=...)');

    // Validate token is UUID-shaped to prevent injection
    if (!/^[0-9a-f-]{36}$/i.test(token)) return jsonErr(400, 'Invalid token format');

    // Fetch the marking record
    const res = await fetch(
      `${supabaseUrl}/rest/v1/markings?report_token=eq.${token}&select=student_name,exam_id,final_score,ai_score,question_marks,created_at`,
      { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } },
    );
    if (!res.ok) return jsonErr(502, 'Database error');

    const rows = await res.json();
    if (!rows.length) return jsonErr(404, 'Report not found or link has expired');

    const marking = rows[0];

    // Try to fetch exam label from exams table (best-effort)
    let examLabel = marking.exam_id || 'Exam';
    try {
      const examRes = await fetch(
        `${supabaseUrl}/rest/v1/exams?id=eq.${encodeURIComponent(marking.exam_id)}&select=label`,
        { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } },
      );
      if (examRes.ok) {
        const examRows = await examRes.json();
        if (examRows.length) examLabel = examRows[0].label;
      }
    } catch {}

    return new Response(JSON.stringify({
      studentName:   marking.student_name,
      examId:        marking.exam_id,
      examLabel,
      finalScore:    marking.final_score,
      aiScore:       marking.ai_score,
      questionMarks: marking.question_marks,
      markedAt:      marking.created_at,
    }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(
      JSON.stringify({ error: `Exception: ${err?.message ?? String(err)}` }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }
};
