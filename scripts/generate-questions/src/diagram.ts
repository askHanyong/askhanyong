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
    const raw = await callForText(DIAGRAM_SYSTEM_PROMPT, userPrompt, 3000);
    const svg = raw.replace(/^```(svg|xml|html)?\n?/i, '').replace(/```$/, '').trim();

    const looksWellFormed = /^<svg[\s>]/i.test(svg) && /<\/svg>\s*$/i.test(svg);
    const openTags = (svg.match(/<svg[\s>]/gi) ?? []).length;
    const closeTags = (svg.match(/<\/svg>/gi) ?? []).length;

    if (!looksWellFormed || openTags !== 1 || closeTags !== 1) {
      return {
        attempted: true,
        passed: false,
        svg,
        note: `SVG failed structural check (starts with <svg: ${/^<svg[\s>]/i.test(svg)}, ends with </svg>: ${/<\/svg>\s*$/i.test(svg)}, <svg> tags: ${openTags}, </svg> tags: ${closeTags}).`,
      };
    }

    return { attempted: true, passed: true, svg, note: 'SVG generated and passed structural check.' };
  } catch (err) {
    return { attempted: true, passed: false, svg: null, note: `Diagram generation failed: ${(err as Error).message}` };
  }
}
