import { callForText } from './claudeClient.js';
import type { DiagramResult } from './types.js';

const DIAGRAM_SYSTEM_PROMPT = `You draw clean, minimal SVG diagrams for IB Diploma Mathematics exam questions.
Given a description of what the diagram must show, produce a single self-contained SVG element:
- viewBox in the range roughly 0 0 400 300 to 0 0 600 450, white background (an explicit white <rect> covering the viewBox), black strokes, black text.
- Label every quantity the description names (lengths, angles, variable names like x) directly on the diagram with <text> elements.
- Keep it geometrically accurate to the description's proportions (e.g. relative side lengths, angle sizes) -- this is a math diagram, not decorative art.
- No external references, no <script>, no <image>, no CSS classes -- only <svg>, <rect>, <circle>, <ellipse>, <line>, <polyline>, <polygon>, <path>, <text>, <g> with inline attributes/style.
Return ONLY the raw SVG markup, starting with <svg and ending with </svg>. No markdown fences, no prose before or after.`;

/**
 * Generates an SVG for a question that needs one, and does a cheap structural
 * sanity check (well-formed enough to embed) -- not a visual-correctness
 * check, which is out of scope for this pipeline (a human reviews the
 * rendered diagram, same as they review question_text/proposed_solution).
 */
export async function generateDiagram(diagramDescription: string, questionText: string): Promise<DiagramResult> {
  const userPrompt = [`QUESTION:\n${questionText}`, `DIAGRAM DESCRIPTION:\n${diagramDescription}`].join('\n\n');

  try {
    const raw = await callForText(DIAGRAM_SYSTEM_PROMPT, userPrompt, 6000);

    // Extract from the first <svg to the last </svg> rather than assuming the
    // response starts/ends exactly there -- tolerates stray preamble (a bare
    // language tag, a leading comment) the same way callForJson's brace
    // extraction tolerates prose around a JSON object.
    const openIdx = raw.search(/<svg[\s>]/i);
    const closeIdx = raw.toLowerCase().lastIndexOf('</svg>');
    if (openIdx === -1 || closeIdx === -1 || closeIdx < openIdx) {
      return {
        attempted: true,
        passed: false,
        svg: raw.trim(),
        note: `SVG failed structural check: no <svg>...</svg> element found in the response.`,
      };
    }
    const svg = raw.slice(openIdx, closeIdx + '</svg>'.length).trim();

    const openTags = (svg.match(/<svg[\s>]/gi) ?? []).length;
    const closeTags = (svg.match(/<\/svg>/gi) ?? []).length;
    if (openTags !== 1 || closeTags !== 1) {
      return {
        attempted: true,
        passed: false,
        svg,
        note: `SVG failed structural check (found ${openTags} <svg> tag(s) and ${closeTags} </svg> tag(s), expected exactly 1 of each -- likely nested or multiple diagrams in one response).`,
      };
    }

    return { attempted: true, passed: true, svg, note: 'SVG generated and passed structural check.' };
  } catch (err) {
    return { attempted: true, passed: false, svg: null, note: `Diagram generation failed: ${(err as Error).message}` };
  }
}
