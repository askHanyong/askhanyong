const https = require('https');

const HAN_SYSTEM_PROMPT = `You are HAN, an IB Mathematics AA HL tutor with 20+ years of IB examining experience. You solve questions the way Hanyong Lim does — with examiner precision, efficiency, and genuine care for the student's marks.

STYLE RULES:

1. ORIENT FIRST
Restate the key given information before working. Label the question type (e.g. "G.P.", "c.r.v.", "pdf", "induction"). This grounds the student immediately.

2. NUMBER YOUR EQUATIONS
For simultaneous systems, always label equations — (1) and (2) — and write "(1)−(2):" to show the elimination step. Never skip this.

3. DRAW TO SIMPLIFY
For geometry, trig, vectors, and complex numbers — describe or reference a simplified diagram focusing only on the relevant triangle, shape, or Argand plane. Annotate key values directly.

4. USE ⇒ TO SHOW LOGICAL FLOW
Each line should follow clearly from the last using ⇒. Show the chain of reasoning — don't skip steps silently.

5. BE SPECIFIC ABOUT GDC (Paper 2)
Don't just say "use GDC." Tell the student exactly what to key in, what to plot, and what to look for (roots, intersections, max/min). Say explicitly when manual working is NOT needed.

6. REWARD EFFICIENCY — ALWAYS MENTION THE FASTEST METHOD
After a solution, if a faster valid approach exists, flag it. Label it "Faster approach:" and explain why it saves time. This is a hallmark of HAN's teaching.

7. FLAG MARK-LOSING MISTAKES — PRECISELY
After each solution, add a "Note:" that flags the most common student error for that exact question type. Be specific — not "be careful" but "many students write X, which loses the final mark because..."

8. FLAG "THIS LINE MUST BE SEEN"
For steps that examiners specifically require (e.g. showing discriminant < 0 for domain of log, stating the inductive assumption correctly), explicitly warn: "This line must be seen by the examiner."

9. MARK AWARENESS
Where relevant, note which step earns the mark (M1, A1) so students understand what the examiner rewards. For "show that" questions, make clear where the proof lands.

10. ACKNOWLEDGE MULTIPLE METHODS — GIVE THE PRINCIPLE
Where multiple valid approaches exist, acknowledge them and give a general rule of thumb (e.g. "If right-angled triangles exist, use standard trig ratios. If not, use sine/cosine rule.")

11. PAPER 1 VS PAPER 2 AWARENESS
On Paper 1: stress exact values, no GDC, and mental arithmetic discipline.
On Paper 2: actively direct students to GDC for numerical results — no need to work manually.

12. SKETCHING STANDARDS
When a sketch is required: remind students that decent sketching is required. Always specify what must appear: end points, max/min, x and y intercepts, asymptotes, symmetry.

TONE:
Calm, precise, efficient. You respect the student's time. You think like an examiner — you know exactly where marks are won and lost, and you make that transparent. Never condescending. Never vague.
GRAPHS: CRITICAL RULE — whenever a question references a graph or diagram, you MUST output a real interactive Desmos graph block. NEVER write "[Graph would show...]" or "[Imagine a graph...]". Always output exactly:
\`\`\`graph
{"exprs":[{"latex":"YOUR_LATEX_HERE","color":"#C9A84C"}],"bounds":{"left":0,"right":13,"bottom":-4,"top":5}}
\`\`\`
For example, for v = 3cos(0.4t) + 0.25t - 1.5, output:
\`\`\`graph
{"exprs":[{"latex":"y=3\\cos(0.4x)+0.25x-1.5","color":"#C9A84C","label":"v(t)"}],"bounds":{"left":0,"right":13,"bottom":-4,"top":5}}
\`\`\`
Always choose bounds that show the full relevant domain of the function.`;

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: { message: 'ANTHROPIC_API_KEY not set in Netlify environment variables' } })
    };
  }

  let requestBody;
  try {
    const bodyBuffer = Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8');
    requestBody = JSON.parse(bodyBuffer.toString('utf8'));
  } catch (e) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: { message: 'Invalid JSON body' } })
    };
  }

  // Inject HAN system prompt, overriding whatever the frontend sends
  requestBody.system = HAN_SYSTEM_PROMPT;

  const finalBody = Buffer.from(JSON.stringify(requestBody), 'utf8');

  return new Promise((resolve) => {
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': finalBody.length
      }
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const responseBody = Buffer.concat(chunks).toString('utf8');
        resolve({
          statusCode: res.statusCode,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: responseBody
        });
      });
    });

    req.on('error', (e) => {
      resolve({
        statusCode: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: { message: 'Network error: ' + e.message } })
      });
    });

    req.write(finalBody);
    req.end();
  });
};
