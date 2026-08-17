import { callForDelimitedText } from './claudeClient.js';
import { findInvalidCommandTerms } from './commandTerms.js';
import type { GeneratedQuestionJson, MarksBreakdownItem, QuestionSpec } from './types.js';
import type { ReferencePart, TopicRow } from './db.js';

const MATH_NOTATION_RULES = [
  'Math notation style -- follow exactly, matching the rest of the question bank:',
  '- ALL mathematical notation must be valid LaTeX. Inline math (a symbol or expression sitting within a sentence): wrap in single dollar signs, e.g. "the function $f(x) = x^{2} + 3x - 4$ has roots". Standalone/display equations (an equation shown on its own line, not embedded mid-sentence): wrap in double dollar signs, e.g. $$\\int_{0}^{1} x^{2} \\, dx = \\frac{1}{3}$$.',
  '- Use proper LaTeX commands, never plain-text approximations: \\frac{a}{b} for every fraction (never a/b), \\sqrt{...} and \\sqrt[n]{...} for roots (never √(...)), x^{2} and x_{i} for exponents/subscripts -- braces are REQUIRED whenever the exponent/subscript is more than one character (x^{n+1}, not x^n+1), \\int \\sum \\lim_{x \\to 0} \\sin \\cos \\tan \\ln \\log \\pi \\theta \\alpha \\beta \\leq \\geq \\neq \\in \\mathbb{R} \\mathbb{Z} \\mathbb{C} \\times \\cdot \\div \\infty, and \\begin{pmatrix} ... \\end{pmatrix} (rows separated by \\\\, entries by &) for vectors and matrices.',
  '- Regular prose -- the words of the question itself -- stays plain text, NOT wrapped in math delimiters. Only the mathematical expressions go inside $...$ or $$...$$.',
  '- This applies to question_text, proposed_solution, final_answer, and every marks_breakdown desc.',
  '- Write every backslash literally, single, exactly as a LaTeX command needs it (\\frac, not \\\\frac) -- the output format below is plain text, not JSON, so no escaping of any kind is needed or wanted.',
  '- Complements: always use IB\'s standard prime notation for "not A" -- $A\'$ -- never $\\overline{A}$ or other overline notation.',
].join('\n');

// Real papers never spell out calculator use ("use technology/a GDC to find...")
// -- it's implied by which paper the question is on. Found baked into generic
// generation output across unrelated topics (AA1.9, AA5.8), so this is a
// global phrasing rule, not a topic-specific fix.
const PHRASING_RULES = [
  'Phrasing style -- match how real IB papers write numeric-answer steps:',
  '- NEVER write "use technology to find...", "use your GDC to find...", "using a calculator, find..." or similar -- real papers never spell out calculator use, it\'s implied by the paper (P1 = no calculator, P2/P3 = calculator). Phrase the step the way real papers do: "Find, correct to <n> decimal places/significant figures, ..." or just "Find ..." when no rounding is needed.',
].join('\n');

// Per-topic guardrails for scope drift the generic prompt doesn't otherwise
// prevent -- each entry was added after a specific confirmed drift pattern
// found in review, not speculative. Keep entries narrow and evidence-based;
// this is not a place to pre-emptively constrain every topic.
const TOPIC_CONSTRAINTS: Record<string, string> = {
  'AA3.13':
    'TOPIC-SPECIFIC CONSTRAINT: stay strictly within the static scalar (dot) product / angle-between-vectors syllabus point -- vectors here are fixed, not moving. Do NOT use vector-valued functions of time, relative velocity, minimum-distance-via-calculus, or any other relative-motion framing; that content belongs to kinematics (AA5.9), not this topic.',
  'AA4.1':
    "TOPIC-SPECIFIC CONSTRAINT: real AA4.1 exam content is never a standalone question -- it always appears folded into a broader statistics question that also tests central tendency/dispersion (AA4.3: mean, median, standard deviation; AA4.2: box-and-whisker/histograms). Build this question around such a broader scenario, with the sampling/bias content as one or more parts within it, not the whole question -- and tag AA4.2/AA4.3 in secondary_topic_codes since the question genuinely covers that content. Any part on bias or data reliability must stay qualitative: name the bias and explain its likely direction/effect on the data or conclusion. Never invent a quantitative bias-correction formula or calculation -- that is not examined at this level.",
};

const OUTPUT_FORMAT_SPEC = `Return your answer in this exact delimited plain-text format -- NOT JSON, no markdown fences, no prose outside the markers:

@@@SECTION@@@
A or B
@@@DIFFICULTY@@@
easy or medium or hard
@@@LEVEL@@@
SL or HL
@@@CALCULATOR_ALLOWED@@@
true or false
@@@PRIMARY_TOPIC@@@
<topic code>
@@@SECONDARY_TOPICS@@@
<comma-separated topic codes, or (none)>
@@@QUESTION_TEXT@@@
<the full question text, LaTeX included>
@@@PROPOSED_SOLUTION@@@
<full worked solution, LaTeX included>
@@@FINAL_ANSWER@@@
<the single concise final result(s), e.g. "$k = 3$" -- must be independently checkable>
@@@COMMAND_TERMS@@@
<comma-separated IB command terms that open a scored part, e.g. Find, Hence>
@@@MARKS_BREAKDOWN@@@
@@@MARK <note> <marks>@@@
<desc for this mark, e.g. valid attempt to differentiate -- one block per mark note, e.g. @@@MARK M1 1@@@ then @@@MARK A1 1@@@>
@@@NEEDS_DIAGRAM@@@
true or false
@@@DIAGRAM_DESCRIPTION@@@
<REQUIRED, non-empty, precise description (dimensions/angles/labels/what's marked) when needs_diagram is true -- otherwise write (none)>
@@@END@@@

Every marker line must appear exactly once (except @@@MARK ...@@@, one per marks_breakdown entry, at least one required). Do not add any text before @@@SECTION@@@ or after @@@END@@@.

CRITICAL for @@@MARK <note> <marks>@@@ lines specifically: <note> must be ONLY a short IB mark code with no spaces and no description -- M1, A1, R1, AG, G1, or a combined code like M1A1 if one point genuinely covers both a method and answer mark. <marks> must be ONLY the integer point value. The description of what earns the mark goes on the line(s) AFTER the marker, never inside the marker line itself.
Correct:   @@@MARK M1A1 2@@@ then on the next line: Correct method (Pythagorean form) leading to the modulus of z
WRONG:     @@@MARK M1A1 modulus of z 2@@@ then: Correct method...   <- description leaked into the marker line itself, this breaks parsing`;

const SYSTEM_PROMPT = `You write original IB Diploma Programme Mathematics: Analysis and Approaches (AA) exam-style questions.

Rules:
- This is an ORIGINAL question -- never copy, paraphrase closely, or reuse specific numbers/context from any reference material you are given. References are for FORMAT and TYPICAL MARK ALLOCATION only.
- Section A questions are short and single-skill: one command term chain testing the primary topic directly, no blending of unrelated topics.
- Section B questions are longer and multi-part (use part labels like (a), (b)(i), (b)(ii) inside question_text): they may blend in ONE OR TWO closely related secondary topics the way real IB Section B questions do, building toward a final part that draws on earlier results.
- marks_breakdown marks must sum to the total marks implied by the question's difficulty/section (Section A: 3-6 total; Section B: 12-20 total).
- proposed_solution must show full working consistent with marks_breakdown, ending in a value that matches final_answer exactly.
- calculator_allowed governs the correct SOLUTION PATH, not just a label: if false (non-calculator/Paper 1 style), every intermediate and final value must be exact and reachable by hand (clean factorisations, standard exact angles/logs, no numerical root-finding unless it reduces to something factorable) -- do not require a GDC anywhere. If true (calculator/Paper 2 style), numerical methods are expected and should be used where they are the natural approach (solving equations numerically, numerical integration, decimal answers given to a stated degree of accuracy e.g. "correct to 3 s.f.") -- do not force an unnecessary exact hand-derivation where a direct GDC step is the real exam technique. Calibrate difficulty RELATIVE to calculator_allowed: a step that is hard by hand (e.g. splitting a distance integral around sign changes and evaluating exactly in terms of e) can be a single easy GDC step once calculator_allowed is true -- do not keep the hand-derivation's difficulty rating once the calculator makes it trivial.

${MATH_NOTATION_RULES}

${PHRASING_RULES}

${OUTPUT_FORMAT_SPEC}`;

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
    spec.section === 'A'
      ? `This is Section A: primary_topic_code must be ${topic.code} and secondary_topic_codes must be (none).`
      : secondaryCandidates.length > 0
        ? `You may blend in 0-2 of these closely related topics if it makes for a natural multi-part question (use their exact codes in secondary_topic_codes if used, else leave empty): ${secondaryCandidates.map((t) => `${t.code} (${t.subtopic_name})`).join('; ')}.`
        : `No pre-approved secondary topics are available for this Section B question -- primary_topic_code must be ${topic.code} and secondary_topic_codes must be (none).`,
    `Target total marks: ${spec.marksRange[0]}-${spec.marksRange[1]}.`,
    referenceSummary(topic, refs),
  ];
  const topicConstraint = TOPIC_CONSTRAINTS[topic.code];
  if (topicConstraint) parts.push(topicConstraint);
  if (regenerationFeedback) {
    parts.push(`\nYOUR PREVIOUS ATTEMPT FAILED VALIDATION -- fix these issues and regenerate from scratch:\n${regenerationFeedback}`);
  }
  parts.push('\nRespond with ONLY the delimited-format answer described in the system prompt -- start with @@@SECTION@@@ and end with @@@END@@@.');
  return parts.join('\n\n');
}

// Explicit allowlist of top-level marker names -- deliberately excludes
// "MARK" (the inner @@@MARK <note> <marks>@@@ sub-markers inside
// MARKS_BREAKDOWN) so scanning for "the next top-level marker" doesn't
// truncate the marks_breakdown block at its first entry.
const TOP_LEVEL_MARKERS = [
  'SECTION', 'DIFFICULTY', 'LEVEL', 'CALCULATOR_ALLOWED', 'PRIMARY_TOPIC',
  'SECONDARY_TOPICS', 'QUESTION_TEXT', 'PROPOSED_SOLUTION', 'FINAL_ANSWER',
  'COMMAND_TERMS', 'MARKS_BREAKDOWN', 'NEEDS_DIAGRAM', 'DIAGRAM_DESCRIPTION', 'END',
].join('|');
const NEXT_TOP_LEVEL_MARKER_RE = new RegExp(`\\r?\\n@@@(?:${TOP_LEVEL_MARKERS})@@@(?:\\r?\\n|$)`);

function section(block: string, marker: string, required = true): string {
  const re = new RegExp(`@@@${marker}@@@\\r?\\n`);
  const m = re.exec(block);
  if (!m) {
    if (required) throw new Error(`Malformed generation response, missing @@@${marker}@@@ marker:\n${block.slice(0, 1500)}`);
    return '';
  }
  const start = m.index + m[0].length;
  // Value runs until the next top-level marker line or end of string.
  const rest = block.slice(start);
  const nextMarker = NEXT_TOP_LEVEL_MARKER_RE.exec(rest);
  const value = nextMarker ? rest.slice(0, nextMarker.index) : rest;
  return value.replace(/\r?\n+$/, '');
}

function splitCommaList(s: string): string[] {
  const trimmed = s.trim();
  if (trimmed === '' || /^\(none\)$/i.test(trimmed)) return [];
  return trimmed.split(',').map((v) => v.trim()).filter(Boolean);
}

function parseMarksBreakdown(text: string): MarksBreakdownItem[] {
  const markRe = /@@@MARK ([^\s@]+) (-?\d+(?:\.\d+)?)@@@\r?\n/g;
  const marks: { note: string; markValue: number; matchStart: number; contentStart: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = markRe.exec(text)) !== null) {
    marks.push({ note: m[1], markValue: Number(m[2]), matchStart: m.index, contentStart: m.index + m[0].length });
  }
  if (marks.length === 0) {
    throw new Error(`marks_breakdown had no @@@MARK <note> <marks>@@@ entries:\n${text.slice(0, 1500)}`);
  }
  const items: MarksBreakdownItem[] = [];
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].matchStart : text.length;
    const desc = text.slice(marks[i].contentStart, end).replace(/\r?\n+$/, '');
    items.push({ note: marks[i].note, desc, marks: marks[i].markValue });
  }
  return items;
}

function parseGeneratedQuestion(raw: string): GeneratedQuestionJson {
  const sectionVal = section(raw, 'SECTION').trim();
  if (sectionVal !== 'A' && sectionVal !== 'B') {
    throw new Error(`@@@SECTION@@@ must be A or B, got: "${sectionVal}"`);
  }
  const difficultyVal = section(raw, 'DIFFICULTY').trim();
  if (difficultyVal !== 'easy' && difficultyVal !== 'medium' && difficultyVal !== 'hard') {
    throw new Error(`@@@DIFFICULTY@@@ must be easy/medium/hard, got: "${difficultyVal}"`);
  }
  const levelVal = section(raw, 'LEVEL').trim();
  if (levelVal !== 'SL' && levelVal !== 'HL') {
    throw new Error(`@@@LEVEL@@@ must be SL or HL, got: "${levelVal}"`);
  }
  const calcVal = section(raw, 'CALCULATOR_ALLOWED').trim().toLowerCase();
  if (calcVal !== 'true' && calcVal !== 'false') {
    throw new Error(`@@@CALCULATOR_ALLOWED@@@ must be true/false, got: "${calcVal}"`);
  }

  const marksBreakdownBlock = section(raw, 'MARKS_BREAKDOWN');
  const needsDiagramVal = section(raw, 'NEEDS_DIAGRAM').trim().toLowerCase();
  if (needsDiagramVal !== 'true' && needsDiagramVal !== 'false') {
    throw new Error(`@@@NEEDS_DIAGRAM@@@ must be true/false, got: "${needsDiagramVal}"`);
  }
  const diagramDescRaw = section(raw, 'DIAGRAM_DESCRIPTION').trim();
  const needsDiagram = needsDiagramVal === 'true';

  return {
    section: sectionVal,
    difficulty: difficultyVal,
    level: levelVal,
    calculator_allowed: calcVal === 'true',
    primary_topic_code: section(raw, 'PRIMARY_TOPIC').trim(),
    secondary_topic_codes: splitCommaList(section(raw, 'SECONDARY_TOPICS')),
    question_text: section(raw, 'QUESTION_TEXT'),
    proposed_solution: section(raw, 'PROPOSED_SOLUTION'),
    final_answer: section(raw, 'FINAL_ANSWER'),
    command_terms_used: splitCommaList(section(raw, 'COMMAND_TERMS')),
    marks_breakdown: parseMarksBreakdown(marksBreakdownBlock),
    needs_diagram: needsDiagram,
    diagram_description: needsDiagram ? diagramDescRaw : null,
  };
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
// off mid-response on the pilot run (3/6 Section B calls truncated). Section A's
// 3-6 mark single-skill questions never came close to 8000, so only Section B
// needs the higher cap.
const MAX_TOKENS_BY_SECTION: Record<QuestionSpec['section'], number> = {
  A: 12000,
  B: 24000,
};

export async function generateQuestion(
  spec: QuestionSpec,
  topic: TopicRow,
  secondaryCandidates: TopicRow[],
  refs: ReferencePart[]
): Promise<{ question: GeneratedQuestionJson; cheapChecks: CheapCheckResult; regenerated: boolean }> {
  const maxTokens = MAX_TOKENS_BY_SECTION[spec.section];
  const firstPrompt = buildUserPrompt(spec, topic, secondaryCandidates, refs);
  let question = parseGeneratedQuestion(await callForDelimitedText(SYSTEM_PROMPT, firstPrompt, maxTokens));
  let checks = runCheapChecks(question, spec);
  let regenerated = false;

  if (!checks.passed) {
    regenerated = true;
    const retryPrompt = buildUserPrompt(spec, topic, secondaryCandidates, refs, checks.notes.join('\n'));
    question = parseGeneratedQuestion(await callForDelimitedText(SYSTEM_PROMPT, retryPrompt, maxTokens));
    checks = runCheapChecks(question, spec);
  }

  return { question, cheapChecks: checks, regenerated };
}
