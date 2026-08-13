import { callForJson } from './claudeClient.js';
import { findInvalidCommandTerms } from './commandTerms.js';
import type { GeneratedQuestionJson, QuestionSpec } from './types.js';
import type { ReferencePart, TopicRow } from './db.js';

const MATH_NOTATION_RULES = [
  'Math notation style -- follow exactly, plain text only, NEVER LaTeX commands:',
  '- Never emit a backslash-prefixed LaTeX command: no \\frac, \\sqrt, \\left, \\right, \\begin, \\end, \\lim, \\int, \\times, or any other backslash+word token, and no {} used LaTeX-style for grouping exponents, subscripts, or fraction arguments.',
  '- Exponents: base^exponent, with parentheses around the exponent whenever it is more than one character, e.g. x^2, e^(-0.5x), c^(3/2). Never base^{exponent}.',
  '- Fractions: a/b for simple cases; wrap multi-term numerator/denominator in parentheses, e.g. (e+6)/2. Never \\frac{a}{b}.',
  '- Square/nth roots: √(...), e.g. √(1+x). Never \\sqrt{...}.',
  '- Unicode math symbols are fine and expected (root sign, pi, theta, integral/sum signs, inequality signs, degree sign, superscript/subscript digits).',
].join('\n');

const SYSTEM_PROMPT = `You write original IB Diploma Programme Mathematics: Analysis and Approaches (AA) exam-style questions.
Return ONLY a single JSON object, no prose, no markdown fences, matching exactly this shape:
{
  "section": "A" | "B",
  "difficulty": "easy" | "medium" | "hard",
  "level": "SL" | "HL",
  "calculator_allowed": boolean,
  "primary_topic_code": string,
  "secondary_topic_codes": string[],
  "question_text": string,
  "proposed_solution": string,
  "final_answer": string,          // the single concise final result(s), e.g. "k = 3" or "z = 4(cos(pi/3) + i sin(pi/3))" -- must be independently checkable
  "command_terms_used": string[],  // every IB command term that opens a scored part of the question, e.g. ["Find", "Hence"]
  "marks_breakdown": [ { "note": string, "desc": string, "marks": number } ],  // one entry per mark note, e.g. {"note":"M1","desc":"valid attempt to differentiate","marks":1}
  "needs_diagram": boolean,        // true if the question describes a physical construction, geometric figure, or graph that is materially harder to follow as text alone (e.g. "diagram not to scale" style content on a real paper) -- false for purely algebraic/computational questions
  "diagram_description": string | null  // REQUIRED, non-empty, and precise (dimensions/angles/labels/what's marked) when needs_diagram is true; null when false
}
Rules:
- This is an ORIGINAL question -- never copy, paraphrase closely, or reuse specific numbers/context from any reference material you are given. References are for FORMAT and TYPICAL MARK ALLOCATION only.
- Section A questions are short and single-skill: one command term chain testing the primary topic directly, no blending of unrelated topics.
- Section B questions are longer and multi-part (use part labels like (a), (b)(i), (b)(ii) inside question_text): they may blend in ONE OR TWO closely related secondary topics the way real IB Section B questions do, building toward a final part that draws on earlier results.
- marks_breakdown marks must sum to the total marks implied by the question's difficulty/section (Section A: 3-6 total; Section B: 12-20 total).
- proposed_solution must show full working consistent with marks_breakdown, ending in a value that matches final_answer exactly.
- calculator_allowed governs the correct SOLUTION PATH, not just a label: if false (non-calculator/Paper 1 style), every intermediate and final value must be exact and reachable by hand (clean factorisations, standard exact angles/logs, no numerical root-finding unless it reduces to something factorable) -- do not require a GDC anywhere. If true (calculator/Paper 2 style), numerical methods are expected and should be used where they are the natural approach (solving equations numerically, numerical integration, decimal answers given to a stated degree of accuracy e.g. "correct to 3 s.f.") -- do not force an unnecessary exact hand-derivation where a direct GDC step is the real exam technique. Calibrate difficulty RELATIVE to calculator_allowed: a step that is hard by hand (e.g. splitting a distance integral around sign changes and evaluating exactly in terms of e) can be a single easy GDC step once calculator_allowed is true -- do not keep the hand-derivation's difficulty rating once the calculator makes it trivial.
- Do not include any text outside the JSON object.

${MATH_NOTATION_RULES}`;

function referenceSummary(topic: TopicRow, refs: ReferencePart[]): string {
  if (refs.length === 0) {
    return `No existing reference parts are tagged to ${topic.code} yet -- use your own judgement for format and typical mark allocation.`;
  }
  const lines = refs.map(
    (r, i) => `  ${i + 1}. [${r.level}, ${r.marks} marks, command term: ${r.command_term ?? 'n/a'}] length ${r.part_text.length} chars, opens: "${r.part_text.slice(0, 70)}..."`
  );
  return [
    `STYLE/STRUCTURE REFERENCE ONLY (${refs.length} real exam parts already tagged to ${topic.code} -- do NOT copy, paraphrase, or reuse their specific numbers/context, use only for typical phrasing register, command-term choice, and mark allocation):`,
    ...lines,
  ].join('\n');
}

function buildUserPrompt(
  spec: QuestionSpec,
  topic: TopicRow,
  secondaryCandidates: TopicRow[],
  refs: ReferencePart[],
  regenerationFeedback?: string
): string {
  const parts = [
    `Generate ONE ${spec.section === 'A' ? 'Section A' : 'Section B'} IB Math AA question at ${spec.difficulty} difficulty, level ${spec.level}.`,
    `Primary topic: ${topic.code} -- ${topic.subtopic_name} (level_scope: ${topic.level_scope}).`,
    `calculator_allowed MUST be ${spec.calculatorAllowed} for this question -- ${spec.calculatorAllowed ? 'write it as a Paper 2 style question (numerical methods/decimal answers expected where natural)' : 'write it as a Paper 1 style question (everything must resolve exactly by hand, no GDC needed anywhere)'}.`,
    spec.section === 'B' && secondaryCandidates.length > 0
      ? `You may blend in 0-2 of these closely related topics if it makes for a natural multi-part question (use their exact codes in secondary_topic_codes if used, else leave empty): ${secondaryCandidates.map((t) => `${t.code} (${t.subtopic_name})`).join('; ')}.`
      : `This is Section A: primary_topic_code must be ${topic.code} and secondary_topic_codes must be [].`,
    `Target total marks: ${spec.marksRange[0]}-${spec.marksRange[1]}.`,
    referenceSummary(topic, refs),
  ];
  if (regenerationFeedback) {
    parts.push(`\nYOUR PREVIOUS ATTEMPT FAILED VALIDATION -- fix these issues and regenerate from scratch:\n${regenerationFeedback}`);
  }
  parts.push('\nRespond with ONLY the JSON object described in the system prompt -- start with { and end with }.');
  return parts.join('\n\n');
}

export interface CheapCheckResult {
  passed: boolean;
  notes: string[];
}

export function runCheapChecks(q: GeneratedQuestionJson, spec: QuestionSpec): CheapCheckResult {
  const notes: string[] = [];

  const sum = q.marks_breakdown.reduce((acc, m) => acc + (Number.isFinite(m.marks) ? m.marks : 0), 0);
  const [lo, hi] = spec.marksRange;
  if (sum < lo || sum > hi) {
    notes.push(`marks_breakdown sums to ${sum}, expected ${lo}-${hi} for ${spec.section === 'A' ? 'Section A' : 'Section B'}.`);
  }
  if (q.marks_breakdown.some((m) => !Number.isInteger(m.marks) || m.marks < 0 || m.marks > 3)) {
    notes.push('marks_breakdown contains an entry with a non-integer, negative, or implausibly large (>3) mark value.');
  }

  const invalidTerms = findInvalidCommandTerms(q.command_terms_used);
  if (invalidTerms.length > 0) {
    notes.push(`Unrecognized IB command term(s): ${invalidTerms.join(', ')}.`);
  }
  if (q.command_terms_used.length === 0) {
    notes.push('command_terms_used is empty.');
  }

  if (spec.section === 'A' && q.secondary_topic_codes.length > 0) {
    notes.push('Section A question has secondary_topic_codes but should test only the primary topic.');
  }
  if (spec.section === 'B' && q.secondary_topic_codes.length > 2) {
    notes.push('Section B question blends more than 2 secondary topics.');
  }

  if (q.calculator_allowed !== spec.calculatorAllowed) {
    notes.push(`calculator_allowed is ${q.calculator_allowed}, expected ${spec.calculatorAllowed}.`);
  }

  if (q.needs_diagram && (!q.diagram_description || q.diagram_description.trim().length === 0)) {
    notes.push('needs_diagram is true but diagram_description is empty.');
  }
  if (!q.needs_diagram && q.diagram_description) {
    notes.push('needs_diagram is false but diagram_description is non-null.');
  }

  return { passed: notes.length === 0, notes };
}

/**
 * Generates one question, runs the cheap checks, and regenerates exactly once
 * (with the failure notes fed back in) if they fail. Returns whatever the
 * second attempt produced even if it still fails -- the caller decides what
 * to do with a still-failing result (skip expensive verification, flag it).
 */
// Section B questions carry a full multi-part question_text, proposed_solution,
// and marks_breakdown for 12-20 marks -- 8000 output tokens was cutting these
// off mid-JSON on the pilot run (3/6 Section B calls truncated). Section A's
// 3-6 mark single-skill questions never came close to 8000, so only Section B
// needs the higher cap.
const MAX_TOKENS_BY_SECTION: Record<QuestionSpec['section'], number> = {
  A: 8000,
  B: 16000,
};

export async function generateQuestion(
  spec: QuestionSpec,
  topic: TopicRow,
  secondaryCandidates: TopicRow[],
  refs: ReferencePart[]
): Promise<{ question: GeneratedQuestionJson; cheapChecks: CheapCheckResult; regenerated: boolean }> {
  const maxTokens = MAX_TOKENS_BY_SECTION[spec.section];
  const firstPrompt = buildUserPrompt(spec, topic, secondaryCandidates, refs);
  let question = await callForJson<GeneratedQuestionJson>(SYSTEM_PROMPT, firstPrompt, maxTokens);
  let checks = runCheapChecks(question, spec);
  let regenerated = false;

  if (!checks.passed) {
    regenerated = true;
    const retryPrompt = buildUserPrompt(spec, topic, secondaryCandidates, refs, checks.notes.join('\n'));
    question = await callForJson<GeneratedQuestionJson>(SYSTEM_PROMPT, retryPrompt, maxTokens);
    checks = runCheapChecks(question, spec);
  }

  return { question, cheapChecks: checks, regenerated };
}
