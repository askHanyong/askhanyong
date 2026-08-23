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

// Extracted from OUTPUT_FORMAT_SPEC (below) so standalone re-tagging tools
// that only need the secondary-topic step -- not a full question generation
// -- can reuse the exact production format instead of retyping it (a
// retyped copy is exactly the kind of thing that silently drifts from the
// merged mechanism, which is what a re-tagging tool exists to test against).
export const SECONDARY_TOPICS_FORMAT_BLOCK = `@@@SECONDARY_TOPICS@@@
<(none), OR one triplet per proposed secondary topic, in EXACTLY this order -- justification and name FIRST, code LAST:>
<@@@SECONDARY_JUSTIFICATION@@@>
<<one sentence naming the specific step in proposed_solution (e.g. "part (c)") and the specific technique that step actually uses -- not a topic name and not shared vocabulary. Write this BEFORE you have decided on a code -- reason your way to the topic, don't justify a code you've already picked. See the secondary-topic justification rule for the bar this must clear.>>
<@@@SECONDARY_NAME@@@>
<<the syllabus topic's name, in your own words, e.g. "Binomial distribution" -- the specific topic the justification above actually points to.>>
<@@@SECONDARY_CODE@@@>
<<that topic's real code, e.g. AA4.8 -- must be the code for the topic named directly above, not a different one. Repeat the JUSTIFICATION/NAME/CODE triplet for a second topic if used.>>`;

export const SECONDARY_TOPICS_CRITICAL_NOTE = `CRITICAL for @@@SECONDARY_TOPICS@@@: the three sub-markers must appear in this exact order -- JUSTIFICATION, then NAME, then CODE -- for every proposed topic. This order is deliberate: write the justification and name the topic BEFORE typing its code, so the code is the last thing you commit to, not the first thing you justify after the fact. If you have nothing specific enough to write for JUSTIFICATION, do not open a @@@SECONDARY_JUSTIFICATION@@@ block at all -- write (none) instead. The code in @@@SECONDARY_CODE@@@ must be the real code for the exact topic named in the immediately preceding @@@SECONDARY_NAME@@@ -- if you are unsure of the precise code for that topic, do not guess a nearby one.
Correct:   @@@SECONDARY_JUSTIFICATION@@@ then on the next line: part (c) computes $P(W>7)$ using the binomial probability formula. Then @@@SECONDARY_NAME@@@ then: Binomial distribution. Then @@@SECONDARY_CODE@@@ then: AA4.8
WRONG:     @@@SECONDARY_CODE@@@ opened before @@@SECONDARY_JUSTIFICATION@@@ -- code before justification defeats the whole point of this ordering.
WRONG:     @@@SECONDARY_JUSTIFICATION@@@ then: this question involves probability.   <- true but generic, names no specific step or technique, not acceptable`;

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
${SECONDARY_TOPICS_FORMAT_BLOCK}
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
WRONG:     @@@MARK M1A1 modulus of z 2@@@ then: Correct method...   <- description leaked into the marker line itself, this breaks parsing

${SECONDARY_TOPICS_CRITICAL_NOTE}`;

// Scope fidelity is deliberately a GLOBAL rule, not a per-topic patch --
// TOPIC_CONSTRAINTS above still exists for specific confirmed drift patterns
// (AA3.13, AA4.1), but every topic is exposed to the same failure mode
// (inventing a scenario/technique the syllabus point doesn't actually cover),
// so the general guard belongs in the shared prompt, checked against
// whatever real reference examples are available for THIS call.
const SCOPE_FIDELITY_RULE =
  '- Scope fidelity: this question must test ONLY what the primary topic\'s syllabus point actually examines. Use the reference examples below (real exam parts already tagged to this topic) as your guide to what is actually in scope, not just format -- if you find yourself reaching for a technique, framing, or scenario type that isn\'t reflected in those real examples (e.g. introducing time-dependence/motion into a topic that is inherently static, or a quantitative correction formula where real papers only ask for a qualitative explanation), stop and choose a scenario that stays within the topic\'s real content instead. When zero reference examples are available, be conservative: prefer the most literal reading of the syllabus point\'s name over an inventive scenario.';

// Given values and equation targets/RHS -- numbers the question-writer
// chooses, as opposed to numbers the student computes -- must be clean.
// Distinct from final-answer precision instructions (e.g. "correct to 3
// s.f."), which stay correct when the answer itself is a genuine GDC output.
const CLEAN_NUMBERS_RULE =
  '- Numbers YOU choose (given data, an equation\'s target/RHS -- anything that is not a value the student computes) must be clean: integers or simple fractions, never an arbitrary decimal like 0.147 or 2.87. If you want the underlying algebra to factor cleanly, choose the exact fraction/integer that produces that clean algebra -- do not invent a rounded decimal and then wave away the rounding. This does NOT apply to a genuinely GDC-computed final answer correctly reported to a stated precision (e.g. "x = 10.4 (3 s.f.)") -- that is the answer, not a value you invented.';

// Real IB papers state the goal, never the method -- choosing the approach
// is part of what is being assessed.
const NO_METHOD_HINTS_RULE =
  '- Never give a parenthetical method hint in question_text -- no "(for example, by graphing...)", "(hint: ...)", "(you may wish to...)", or similar. State the goal only; let the student choose the approach.';

// Refines the secondary-topic mechanism above (the ONLY prior gate was "the
// code resolves to a real syllabus_topics row"). Manual review of a pilot
// batch found that gate let through a 50% false-positive rate: real topics
// that share surface vocabulary or a similar-looking shape with the question,
// but whose own defining technique never actually appears in the solution.
// A bare "be careful" instruction did not close this kind of gap in an
// earlier prompt fix this session (sympy-tolerance rule) -- concrete
// right/wrong worked examples did, so that's the approach here too.
//
// A first version of this rule required a justification but put it AFTER
// the code in the output format (@@@SECONDARY <code>@@@ then justification).
// Blind re-test against 8 already-reviewed questions found that ordering is
// a structural setup for post-hoc rationalization: because generation is
// autoregressive, the code is necessarily committed before the justification
// is written, so the justification explains a decision already locked in
// rather than gating it. This version fixes that two ways in the same call:
// (1) the output format now requires JUSTIFICATION, then NAME, then CODE, in
// that order, so the model has to articulate the topic before it can name a
// code for it; (2) the model also states the topic's name in its own words,
// which pilotShared.ts's runOne() cross-checks server-side against the real
// syllabus_topics.subtopic_name for that code -- catching the case where the
// reasoning/name is right but the final code is mistyped, deterministically,
// without trusting another round of model output to get it right.
export const SECONDARY_TOPIC_JUSTIFICATION_RULE = `- Secondary-topic justification: every topic you propose as a secondary topic must be REASONED TO, not reasoned FROM. Follow the output format's JUSTIFICATION -> NAME -> CODE order exactly: first write a justification that names the SPECIFIC STEP in proposed_solution (e.g. "part (c)") AND the specific technique from that topic's own syllabus point that step genuinely uses -- not the topic's name alone, and not a word the question merely shares with that topic -- then name the topic, then and only then commit to its code. Do not decide on a code first and write a justification to fit it. If you cannot point to a specific step that actually executes the technique, do not open a secondary-topic block at all -- leave it out rather than force a tag. A missing secondary tag costs almost nothing; a wrong one actively misleads anyone using it for topic-targeted practice. When in doubt, leave secondary_topic_codes empty. The code you type for @@@SECONDARY_CODE@@@ must be the actual code for the topic you just named in @@@SECONDARY_NAME@@@ -- if you are not confident of the exact code for that topic, do not guess a nearby one.

Legitimate examples (the technique is genuinely present, not just implied):
- A discrete-probability question (primary AA4.7) whose part (c) states $W \\sim B(12, 0.4)$ and computes a binomial probability -- correctly tagged AA4.8 (Binomial distribution), justification: "part (c) computes $P(W>7)$ using the binomial probability formula."
- A question comparing an arithmetic salary scheme against a geometric one, with both sequences explicit and both formulas actually used in the solution -- correctly tagged AA1.3 (Geometric sequences) alongside primary AA1.2, justification: "part (b) models the second scheme as a geometric sequence and applies the geometric sum formula to it."

Wrong examples (a loose thematic link, not the topic's actual technique -- never do this):
- A quadratics/discriminant question (primary AA2.7) tagged with AA1.9 (Binomial theorem) or AA1.10 (Counting principles) with no connection anywhere in the question or solution -- complete mismatch.
- A calculus optimization question (primary AA3.4) that justifies a local maximum using the second-derivative test, tagged AA5.2 (Increasing and decreasing functions) -- WRONG: the solution never analyzes sign/intervals of increase-decrease, which is what AA5.2 actually teaches. The second-derivative test is a different technique that happens to solve a similar-looking problem.
- A sector-geometry question (primary AA3.4) that solves a quadratic via the formula and rejects one root on a domain constraint, tagged AA2.7 (Discriminant and nature of roots) -- WRONG: using the quadratic formula to get numeric roots is not AA2.7's actual content (analyzing the discriminant to determine the nature of roots). "This uses a quadratic equation" is too generic to justify AA2.7 -- almost any AA2.x question could claim it; "this explicitly uses the discriminant to determine whether roots are real, complex, or repeated" is the specific bar AA2.7 requires.`;

const SYSTEM_PROMPT = `You write original IB Diploma Programme Mathematics: Analysis and Approaches (AA) exam-style questions.

Rules:
- This is an ORIGINAL question -- never copy, paraphrase closely, or reuse specific numbers/context from any reference material you are given. References are for FORMAT and TYPICAL MARK ALLOCATION only.
- Section A questions are short and single-skill: one command term chain testing the primary topic directly, no blending of unrelated topics.
- Section B questions are longer and multi-part (use part labels like (a), (b)(i), (b)(ii) inside question_text): they may blend in ONE OR TWO closely related secondary topics the way real IB Section B questions do, building toward a final part that draws on earlier results. When the question genuinely spans another syllabus point (not just borrows a number from it), name that topic's real code in secondary_topic_codes -- don't leave it empty just because it wasn't suggested to you. See the secondary-topic justification rule below for exactly what "genuinely spans" requires and the format for stating it.
- marks_breakdown marks must sum to the total marks implied by the question's difficulty/section (Section A: 3-6 total; Section B: 12-20 total).
- proposed_solution must show full working consistent with marks_breakdown, ending in a value that matches final_answer exactly.
- calculator_allowed governs the correct SOLUTION PATH, not just a label: if false (non-calculator/Paper 1 style), every intermediate and final value must be exact and reachable by hand (clean factorisations, standard exact angles/logs, no numerical root-finding unless it reduces to something factorable) -- do not require a GDC anywhere. If true (calculator/Paper 2 style), numerical methods are expected and should be used where they are the natural approach (solving equations numerically, numerical integration, decimal answers given to a stated degree of accuracy e.g. "correct to 3 s.f.") -- do not force an unnecessary exact hand-derivation where a direct GDC step is the real exam technique. Calibrate difficulty RELATIVE to calculator_allowed: a step that is hard by hand (e.g. splitting a distance integral around sign changes and evaluating exactly in terms of e) can be a single easy GDC step once calculator_allowed is true -- do not keep the hand-derivation's difficulty rating once the calculator makes it trivial.
${SCOPE_FIDELITY_RULE}
${CLEAN_NUMBERS_RULE}
${NO_METHOD_HINTS_RULE}
${SECONDARY_TOPIC_JUSTIFICATION_RULE}

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
        ? `You may blend in 0-2 of these closely related topics if it makes for a natural multi-part question: ${secondaryCandidates.map((t) => `${t.code} (${t.subtopic_name})`).join('; ')}. This list is a starting suggestion, not exhaustive -- if the question you write naturally spans a different closely-related syllabus point instead, use that real topic code rather than forcing in one of these. Only tag a code if you can name the specific step in proposed_solution that genuinely uses that topic's own technique (see the secondary-topic justification rule and its worked examples in the system prompt) -- default to leaving secondary_topic_codes empty when uncertain rather than forcing a loose thematic connection.`
        : `No pre-curated secondary-topic suggestions exist for ${topic.code} yet -- that does not mean this question must stay single-topic. If it naturally spans another closely-related IB AA syllabus point (not just borrows a number from it) AND you can name the specific step in proposed_solution that genuinely uses that topic's own technique, name that topic's real code (the same AA<n>.<n> format as ${topic.code}) with its justification. Default to leaving secondary_topic_codes empty rather than guess or force a loose thematic connection.`,
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

export interface SecondaryTopicEntry {
  justification: string;
  statedName: string;
  code: string;
}

const SECONDARY_SUBMARKER_RE = /@@@SECONDARY_(JUSTIFICATION|NAME|CODE)@@@\r?\n/g;

// Parses the JUSTIFICATION -> NAME -> CODE triplet format (see
// SECONDARY_TOPIC_JUSTIFICATION_RULE for why this order, not a comma-separated
// code list or a single code+justification pair): reasoning and the topic's
// name must appear before the code that's supposedly for that topic, so the
// code can't be decided first and rationalized afterward. Exported so
// standalone re-tagging/spot-check tools (re-run just this step against
// existing question/solution text) reuse the real parser instead of
// re-implementing it.
export function parseSecondaryTopics(text: string): SecondaryTopicEntry[] {
  const trimmed = text.trim();
  if (trimmed === '' || /^\(none\)$/i.test(trimmed)) return [];

  SECONDARY_SUBMARKER_RE.lastIndex = 0;
  const found: { kind: 'JUSTIFICATION' | 'NAME' | 'CODE'; matchStart: number; contentStart: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = SECONDARY_SUBMARKER_RE.exec(text)) !== null) {
    found.push({ kind: m[1] as 'JUSTIFICATION' | 'NAME' | 'CODE', matchStart: m.index, contentStart: m.index + m[0].length });
  }
  if (found.length === 0) {
    throw new Error(`@@@SECONDARY_TOPICS@@@ was non-empty but had no @@@SECONDARY_JUSTIFICATION/NAME/CODE@@@ blocks:\n${text.slice(0, 1500)}`);
  }
  if (found.length % 3 !== 0) {
    throw new Error(`@@@SECONDARY_TOPICS@@@ sub-markers did not come in complete JUSTIFICATION/NAME/CODE triplets (found ${found.length}):\n${text.slice(0, 1500)}`);
  }

  const values = found.map((f, i) => {
    const end = i + 1 < found.length ? found[i + 1].matchStart : text.length;
    return text.slice(f.contentStart, end).replace(/\r?\n+$/, '').trim();
  });

  const entries: SecondaryTopicEntry[] = [];
  for (let i = 0; i < found.length; i += 3) {
    if (found[i].kind !== 'JUSTIFICATION' || found[i + 1].kind !== 'NAME' || found[i + 2].kind !== 'CODE') {
      throw new Error(`@@@SECONDARY_TOPICS@@@ sub-markers out of order -- expected JUSTIFICATION, NAME, CODE in that order:\n${text.slice(0, 1500)}`);
    }
    // Defensive: the CODE field is free text (not embedded in a marker name
    // like the old format), so a model that adds trailing commentary
    // ("AA4.8 (Binomial distribution)") shouldn't corrupt the code lookup --
    // take the first whitespace-delimited token.
    const code = values[i + 2].split(/\s+/)[0] ?? '';
    entries.push({ justification: values[i], statedName: values[i + 1], code });
  }
  return entries;
}

function normalizeTopicName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const TOPIC_NAME_STOPWORDS = new Set(['the', 'a', 'an', 'of', 'and', 'to', 'in', 'for', 'using', 'with', 'on', 'by']);

function significantWords(s: string): string[] {
  return normalizeTopicName(s).split(' ').filter((w) => w.length > 0 && !TOPIC_NAME_STOPWORDS.has(w));
}

// Deterministic cross-check, not another model call: reordering the prompt
// (justification -> name -> code) fixes post-hoc rationalization of the
// CHOICE of topic, but it doesn't stop the model mistyping the CODE for a
// topic it named correctly -- the last token in the triplet can still slip.
// Since the model already stated the topic's name in its own words
// (secondary_topic_stated_names), that name can be checked mechanically
// against the real syllabus_topics.subtopic_name for the code it typed --
// no further model output is trusted for this check. Word-overlap, not exact
// match, since "in your own words" won't equal the DB string verbatim;
// checked against the REAL name's significant words specifically (not the
// stated name's) so a stated name that's a superset of the real name still
// passes, but a stated name missing the real name's defining words fails.
// Exported so pilotShared.ts's runOne() (where the equivalent "resolves to a
// real row" check already lived) and standalone re-tagging tools share one
// implementation.
export function stateAndCodeAgree(statedName: string, realName: string): boolean {
  const stated = new Set(significantWords(statedName));
  const real = significantWords(realName);
  if (real.length === 0) return false;
  const overlap = real.filter((w) => stated.has(w)).length;
  return overlap / real.length >= 0.5;
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

  const secondaryTopics = parseSecondaryTopics(section(raw, 'SECONDARY_TOPICS'));

  return {
    section: sectionVal,
    difficulty: difficultyVal,
    level: levelVal,
    calculator_allowed: calcVal === 'true',
    primary_topic_code: section(raw, 'PRIMARY_TOPIC').trim(),
    secondary_topic_codes: secondaryTopics.map((e) => e.code),
    secondary_topic_justifications: Object.fromEntries(secondaryTopics.map((e) => [e.code, e.justification])),
    secondary_topic_stated_names: Object.fromEntries(secondaryTopics.map((e) => [e.code, e.statedName])),
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

  // Defensive backstop only -- catches an empty/placeholder justification
  // outright. It cannot verify the justification is actually TRUE (that a
  // model-authored justification actually holds up against the real
  // solution text is exactly what the manual spot-check after the next
  // batch is for); it only enforces that one exists and clears a minimal
  // specificity bar, per the "name a specific step, not just the topic
  // name" requirement in SECONDARY_TOPIC_JUSTIFICATION_RULE.
  for (const code of q.secondary_topic_codes) {
    const justification = (q.secondary_topic_justifications ?? {})[code];
    if (!justification || justification.trim().length === 0) {
      notes.push(`secondary_topic_codes includes ${code} with no justification -- either name the specific step/technique or drop the tag.`);
      continue;
    }
    if (justification.trim().split(/\s+/).length < 8) {
      notes.push(`Justification for secondary topic ${code} is too short to name a specific step and technique ("${justification}") -- either be specific or drop the tag.`);
    }
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
