// ════════════════════════════════════════════════════════════════
// Assignment Mark — Netlify Edge Function (Deno runtime)
// Marks a student script against a teacher-uploaded solution set.
// Unlike teacher-mark.js (hardcoded IB markscheme), this function:
//   - Fetches the solution PDF from Supabase Storage
//   - Builds the system prompt dynamically from assignment metadata
//   - Sends solution PDF + student PDF to Anthropic for marking
//
// POST /api/assignment-mark
// Body: { token, assignmentId, studentName, studentPdf }
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

// Fetch a PDF from Supabase Storage and return as base64
async function fetchPdfAsBase64(supabaseUrl, supabaseKey, storagePath) {
  const res = await fetch(
    `${supabaseUrl}/storage/v1/object/assignments/${storagePath}`,
    { headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey } },
  );
  if (!res.ok) throw new Error(`Storage fetch failed (${res.status}): ${storagePath}`);
  const buffer = await res.arrayBuffer();
  const bytes  = new Uint8Array(buffer);
  let binary   = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// Build the dynamic system prompt for solution-based marking
function buildSystemPrompt(assignment) {
  const { name, type, subject, total_marks, structure } = assignment;

  const typeLabel = type === 'homework'      ? 'homework assignment'
                  : type === 'internal_test' ? 'internal test'
                  : 'exam paper';

  let structureBlock = '';
  if (structure && structure.length > 0) {
    const lines = structure.map(s => {
      const label = s.label ? ` ${s.label}` : '';
      return `Q${s.q}${label}: ${s.marks} mark${s.marks !== 1 ? 's' : ''}`;
    });
    structureBlock = `\n\n## MARK ALLOCATION\n${lines.join('\n')}\nTotal: ${total_marks} marks`;
  } else {
    structureBlock = `\n\nTotal marks: ${total_marks}`;
  }

  return `You are an experienced mathematics teacher marking a ${subject} ${typeLabel}.
The assignment is: "${name}".${structureBlock}

## YOUR JOB
You have been given:
1. The SOLUTION SET — the correct answers for this assignment
2. The STUDENT SCRIPT — the student's handwritten answers

Compare each student answer against the corresponding solution. Award marks based on correctness and quality of working shown.

## STRICT MARKING POLICY
- Award a mark ONLY if you can clearly see the required working or answer.
- When in doubt, do NOT award the mark.
- Do NOT give benefit of the doubt for illegible or ambiguous working.
- A blank space, crossed-out work, or unclear notation means the mark is NOT awarded.

## MARK TYPES
- **Method marks (M)**: for correct method or approach, even if answer is wrong
- **Accuracy marks (A)**: for correct answer — only award if method is also correct
- **Follow-through (FT)**: award if student's method is correct despite an earlier error

## KEY RULES
1. If no working is shown for a multi-step problem, award 0 even if the answer is correct
2. A correct answer with wrong/no method earns 0 method marks but may earn accuracy mark
3. Do not penalise the same error twice
4. If a student's answer differs from the solution in a minor way (sign error, arithmetic slip), deduct the accuracy mark but award method marks if the approach is correct
5. Accept equivalent correct forms of an answer (e.g. different but equivalent algebraic expressions)
6. Partially correct answers can earn partial marks — do not penalise unless specifically required

## OUTPUT FORMAT
Use the submit_marks tool. For each question/part:
- Award marks based on the structure provided
- Keep notes to 5 words max; omit if full marks awarded
- Be conservative — your first instinct is usually too generous

## ANNOTATIONS
Also include an \`annotations\` array. For each region of the student script:
- Place a \`tick\` where a mark-worthy step or answer is correct
- Place a \`cross\` where the student made an error that cost marks
- \`page\`: page number of the student script (1-indexed)
- \`y_zone\`: vertical position 1 (top of page) to 10 (bottom of page)
- \`x_zone\`: horizontal position 1 (left margin) to 10 (right edge) — place near the actual working
- \`symbol\`: "tick" or "cross"
- \`comment\`: reason for cross only, max 8 words; empty string for ticks
- Aim for 1–3 annotations per question; place each symbol next to the relevant line of working`;
}

// The marking tool schema (same structure as IB marking but flexible totals)
function buildMarkingTool(structure, totalMarks) {
  // Build the parts array for the tool schema based on the assignment structure
  if (!structure || structure.length === 0) {
    // No structure defined — use a flat list of questions with free-form marks
    return {
      name:        'submit_marks',
      description: 'Submit the final marks for all questions in the assignment.',
      input_schema: {
        type: 'object',
        properties: {
          questions: {
            type:  'array',
            items: {
              type: 'object',
              properties: {
                q:    { type: 'string', description: 'Question number or label' },
                pts:  {
                  type:  'array',
                  items: {
                    type: 'object',
                    properties: {
                      p:  { type: 'string', description: 'Part label e.g. (a), (b), or empty for whole question' },
                      mi: { type: 'integer', description: 'Marks awarded' },
                      ma: { type: 'integer', description: 'Marks available' },
                      n:  { type: 'string',  description: 'Brief note (5 words max) — omit if full marks' },
                    },
                    required: ['mi', 'ma'],
                  },
                },
              },
              required: ['q', 'pts'],
            },
          },
          examiner_summary: {
            type:        'string',
            description: 'One sentence summary of the student\'s overall performance.',
          },
          annotations: {
            type:  'array',
            description: 'Tick/cross positions on the student script pages.',
            items: {
              type: 'object',
              properties: {
                page:    { type: 'integer', description: 'Page number (1-indexed)' },
                y_zone:  { type: 'integer', description: '1=top of page, 10=bottom of page', minimum: 1, maximum: 10 },
                x_zone:  { type: 'integer', description: '1=left margin, 10=right edge — place near the relevant working', minimum: 1, maximum: 10 },
                symbol:  { type: 'string', enum: ['tick', 'cross'] },
                comment: { type: 'string', description: 'Reason for cross, max 8 words. Empty string for ticks.' },
              },
              required: ['page', 'y_zone', 'x_zone', 'symbol'],
            },
          },
        },
        required: ['questions', 'annotations'],
      },
    };
  }

  // Structure is defined — build a stricter schema with known question list
  const qNums = [...new Set(structure.map(s => String(s.q)))];
  return {
    name:        'submit_marks',
    description: 'Submit the final marks for all questions.',
    input_schema: {
      type: 'object',
      properties: {
        questions: {
          type:  'array',
          items: {
            type: 'object',
            properties: {
              q:    { type: 'string', description: `Question number. Expected: ${qNums.join(', ')}` },
              pts:  {
                type:  'array',
                items: {
                  type: 'object',
                  properties: {
                    p:  { type: 'string',  description: 'Part label' },
                    mi: { type: 'integer', description: 'Marks awarded' },
                    ma: { type: 'integer', description: 'Marks available' },
                    n:  { type: 'string',  description: 'Brief note (5 words max)' },
                  },
                  required: ['mi', 'ma'],
                },
              },
            },
            required: ['q', 'pts'],
          },
        },
        examiner_summary: { type: 'string' },
        annotations: {
          type:  'array',
          description: 'Tick/cross positions on the student script pages.',
          items: {
            type: 'object',
            properties: {
              page:    { type: 'integer', description: 'Page number (1-indexed)' },
              y_zone:  { type: 'integer', description: '1=top of page, 10=bottom of page', minimum: 1, maximum: 10 },
              symbol:  { type: 'string', enum: ['tick', 'cross'] },
              comment: { type: 'string', description: 'Reason for cross, max 8 words. Empty string for ticks.' },
            },
            required: ['page', 'y_zone', 'symbol'],
          },
        },
      },
      required: ['questions', 'annotations'],
    },
  };
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

    const apiKey        = Deno.env.get('ANTHROPIC_API_KEY')?.trim();
    const sessionSecret = Deno.env.get('SESSION_SECRET');
    const supabaseUrl   = Deno.env.get('SUPABASE_URL')?.replace(/\/$/, '');
    const supabaseKey   = Deno.env.get('SUPABASE_SERVICE_KEY');

    if (!apiKey)                      return jsonErr(500, 'API key not configured');
    if (!supabaseUrl || !supabaseKey) return jsonErr(500, 'Supabase not configured');

    let body;
    try { body = await request.json(); }
    catch { return jsonErr(400, 'Invalid JSON'); }

    const { token, assignmentId, studentName, studentPdf } = body;

    if (!token)        return jsonErr(401, 'token required');
    if (!assignmentId) return jsonErr(400, 'assignmentId required');
    if (!studentName)  return jsonErr(400, 'studentName required');
    if (!studentPdf)   return jsonErr(400, 'studentPdf required');

    const email = await verifyTeacherToken(token, sessionSecret);
    if (!email) return jsonErr(401, 'Invalid or expired teacher session');

    // Fetch assignment metadata from Supabase
    const asgRes = await fetch(
      `${supabaseUrl}/rest/v1/assignments?id=eq.${encodeURIComponent(assignmentId)}&select=*`,
      { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } },
    );
    if (!asgRes.ok) return jsonErr(502, 'Failed to fetch assignment');
    const asgRows = await asgRes.json();
    if (!asgRows.length) return jsonErr(404, 'Assignment not found');
    const assignment = asgRows[0];

    // Fetch the solution PDF from Supabase Storage
    const solutionBase64 = await fetchPdfAsBase64(supabaseUrl, supabaseKey, assignment.solution_path);

    // Build dynamic system prompt and tool from assignment metadata
    const systemPrompt  = buildSystemPrompt(assignment);
    const markingTool   = buildMarkingTool(assignment.structure, assignment.total_marks);

    // Compose the Anthropic message content
    const content = [
      {
        type: 'text',
        text: `Mark the following student script for "${studentName}". Compare their answers against the solution set provided. Use the submit_marks tool. Notes field: 5 words max, omit if full marks. No text outside the tool call.`,
      },
      {
        type:  'document',
        source: { type: 'base64', media_type: 'application/pdf', data: solutionBase64 },
        title: 'Solution Set',
      },
      {
        type:  'document',
        source: { type: 'base64', media_type: 'application/pdf', data: studentPdf },
        title: `Student Script: ${studentName}`,
      },
    ];

    // Call Anthropic with streaming
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta':    'pdfs-2024-09-25',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:       'claude-sonnet-4-6',
        max_tokens:  8000,
        temperature: 0,
        stream:      true,
        system:      systemPrompt,
        tools:       [markingTool],
        tool_choice: { type: 'tool', name: 'submit_marks' },
        messages:    [{ role: 'user', content }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      if (errText.includes('prompt is too long') || errText.includes('too many tokens')) {
        return jsonErr(413, 'Script PDFs are too large for AI marking. Reduce file sizes or use fewer pages.');
      }
      return jsonErr(502, `Anthropic ${anthropicRes.status}: ${errText}`);
    }

    // Collect streaming response
    const reader   = anthropicRes.body.getReader();
    const decoder  = new TextDecoder();
    let buf        = '';
    let jsonStr    = '';
    let stopReason = null;
    let streamErr  = null;

    outer: while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        let evt;
        try { evt = JSON.parse(raw); } catch { continue; }

        if (evt.type === 'error') {
          streamErr = evt.error?.message || JSON.stringify(evt.error);
          break outer;
        }
        if (evt.type === 'content_block_delta' && evt.delta?.type === 'input_json_delta') {
          jsonStr += evt.delta.partial_json ?? '';
        }
        if (evt.type === 'message_delta') {
          stopReason = evt.delta?.stop_reason ?? stopReason;
        }
      }
    }

    if (streamErr) {
      if (streamErr.includes('prompt is too long') || streamErr.includes('too many tokens')) {
        return jsonErr(413, 'Script PDFs are too large for AI marking. Reduce file sizes or use fewer pages.');
      }
      return jsonErr(502, `Anthropic error: ${streamErr}`);
    }
    if (!jsonStr)  return jsonErr(502, `No tool call received (stop_reason: ${stopReason ?? 'unknown'})`);

    let markResult;
    try { markResult = JSON.parse(jsonStr); }
    catch (e) { return jsonErr(502, `Could not parse marking result: ${e.message}`); }

    return new Response(JSON.stringify({
      assignmentId,
      assignmentName: assignment.name,
      totalMarks:     assignment.total_marks,
      studentName,
      markedBy:       email,
      timestamp:      new Date().toISOString(),
      result:         markResult,
      annotations:    Array.isArray(markResult.annotations) ? markResult.annotations : [],
    }), {
      status:  200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(
      JSON.stringify({ error: `Edge function exception: ${err?.message ?? String(err)}` }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }
};
