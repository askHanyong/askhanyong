import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs/promises';
import { env } from './env.js';
import type {
  PaperSegmentation,
  MarkschemeSegmentation,
  MarkschemeQuestionSeg,
  MarkschemePartSeg,
  MarksBreakdownEntry,
} from './types.js';

const client = new Anthropic({ apiKey: env.anthropicApiKey });

async function pdfDocumentBlock(filePath: string): Promise<Anthropic.Messages.DocumentBlockParam> {
  const buf = await fs.readFile(filePath);
  return {
    type: 'document',
    source: {
      type: 'base64',
      media_type: 'application/pdf',
      data: buf.toString('base64'),
    },
  };
}

/**
 * This model rejects assistant-message prefill ("conversation must end with
 * a user message"), so instead of forcing the reply open with "{" we rely on
 * the system prompt's "JSON only" instruction and extract the first {...}
 * object from whatever text comes back (tolerates stray markdown fences).
 */
function extractJson<T>(text: string): T {
  const trimmed = text.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Claude's response contained no JSON object:\n---\n${trimmed.slice(0, 1000)}`);
  }
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as T;
  } catch (err) {
    throw new Error(
      `Failed to parse Claude's JSON response: ${(err as Error).message}\n---\n${trimmed.slice(0, 1000)}`
    );
  }
}

async function callForJson<T>(
  system: string,
  doc: Anthropic.Messages.DocumentBlockParam,
  instruction: string,
  extraText?: string
): Promise<T> {
  const content: Anthropic.Messages.ContentBlockParam[] = [doc];
  if (extraText) content.push({ type: 'text', text: extraText });
  content.push({ type: 'text', text: instruction });

  // Streamed (not .create()): at max_tokens: 32000 the SDK refuses a plain
  // non-streaming call since generation could exceed Anthropic's 10-minute
  // non-streaming limit. .stream().finalMessage() gives the same Message
  // shape once the stream completes.
  const maxTokens = 48000;
  const resp = await client.messages
    .stream({
      model: env.claudeModel,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content }],
    })
    .finalMessage();
  if (resp.stop_reason === 'max_tokens') {
    throw new Error(
      `Claude's response was truncated (hit the ${maxTokens} output-token cap) before finishing the JSON -- ` +
      `this paper/markscheme has more content than the budget allows. Raise max_tokens in callForJson() and retry.`
    );
  }
  const textBlock = resp.content.find((b): b is Anthropic.Messages.TextBlock => b.type === 'text');
  if (!textBlock) throw new Error('Claude returned no text content block.');
  return extractJson<T>(textBlock.text);
}

// Markscheme segmentation switched from JSON to this delimited plain-text
// format for two reasons: (1) JSON-encoded LaTeX requires doubled backslashes,
// which inflates output tokens enough that a dense HL Paper 1 markscheme (12
// questions, heavy marks_breakdown) truncated even at a 48000-token cap; (2)
// this is the exact escaping-fragility class that already broke
// backfillLatex.ts in production (a single un-escaped backslash either throws
// a JSON parse error or silently decodes as the wrong text for LaTeX commands
// starting with f/b/n/r/t/u). A delimited format sidesteps both: the model
// writes LaTeX literally with no escaping, and it's meaningfully cheaper in
// tokens. segmentPaper() stays on JSON -- it has never truncated across 30+
// papers, so there's no reason to touch it.
async function callForDelimitedText(
  system: string,
  doc: Anthropic.Messages.DocumentBlockParam,
  instruction: string,
  extraText?: string
): Promise<string> {
  const content: Anthropic.Messages.ContentBlockParam[] = [doc];
  if (extraText) content.push({ type: 'text', text: extraText });
  content.push({ type: 'text', text: instruction });

  const maxTokens = 48000;
  const resp = await client.messages
    .stream({
      model: env.claudeModel,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content }],
    })
    .finalMessage();
  if (resp.stop_reason === 'max_tokens') {
    throw new Error(`Claude's response was truncated (hit the ${maxTokens} output-token cap) before finishing.`);
  }
  const textBlock = resp.content.find((b): b is Anthropic.Messages.TextBlock => b.type === 'text');
  if (!textBlock) throw new Error('Claude returned no text content block.');
  return textBlock.text;
}

const MATH_NOTATION_RULES = [
  'Math notation style -- follow exactly, ALL mathematical notation must be valid LaTeX wrapped in MathJax delimiters:',
  '- Inline math (a symbol or expression sitting within a sentence): wrap in single dollar signs, e.g. "the function $f(x) = x^{2} + 3x - 4$ has roots" or "so $\\frac{1}{2} < x < \\frac{3}{4}$".',
  '- Standalone/display equations (an equation shown on its own line, not embedded mid-sentence -- e.g. a definition line, a working step set apart on the page): wrap in double dollar signs, e.g. $$\\int_{0}^{1} x^{2} \\, dx = \\frac{1}{3}$$.',
  '- Use proper LaTeX commands, never plain-text approximations: \\frac{a}{b} for every fraction (never a/b), \\sqrt{...} and \\sqrt[n]{...} for roots (never √(...)), x^{2} and x_{i} for exponents/subscripts -- braces are REQUIRED whenever the exponent/subscript is more than one character (x^{n+1}, not x^n+1), \\int \\sum \\lim_{x \\to 0} \\sin \\cos \\tan \\ln \\log \\pi \\theta \\alpha \\beta \\leq \\geq \\neq \\in \\mathbb{R} \\mathbb{Z} \\mathbb{C} \\times \\cdot \\div \\infty, and \\begin{pmatrix} ... \\end{pmatrix} (rows separated by \\\\, entries by &) for vectors and matrices.',
  '- Regular prose -- the words of the question itself -- stays plain text, NOT wrapped in math delimiters. Only the mathematical expressions go inside $...$ or $$...$$.',
  '- You are producing valid JSON. Every literal backslash inside a LaTeX command must be written as TWO backslash characters in the JSON text you output, so it decodes to a single backslash (to represent $\\frac{1}{2}$, the JSON text you write must contain backslash-backslash-f-r-a-c, i.e. \\\\frac, not a single \\frac) -- this applies to every backslash in every LaTeX command you emit. Double-check this before finishing, since a single un-escaped backslash breaks JSON parsing entirely.',
  '- This applies to every text field you output (part_text, markscheme_text, desc), not just isolated formulas.',
].join('\n');

const PAPER_SYSTEM_PROMPT = `You segment IB Diploma Mathematics exam papers into questions and sub-parts.
Return ONLY a single JSON object, no prose, no markdown fences, matching exactly this shape:
{
  "questions": [
    {
      "question_number": number,
      "total_marks": number | null,
      "parts": [
        {
          "part_label": string,          // e.g. "a", "b", "b.i", "b.ii" -- lowercase, matching how the paper itself labels the part; use "" if the question has no sub-parts at all
          "part_text": string,           // the full text of this part, as written on the page
          "image_refs": string[],        // short description + approximate position of any diagram/graph belonging to this part, e.g. "page 4, graph of f(x) directly below part (b)"; [] if none
          "marks": number,
          "command_term": string | null, // the IB command term this part opens with (e.g. "Find", "Show that", "Hence"), null if none is obvious
          "depends_on_part_label": string | null, // set ONLY when this part explicitly reuses a result from an earlier part in the SAME question (e.g. "hence" referring back to part (a)); otherwise null
          "order_index": number          // 0-based order within the question, matching the part order on the page
        }
      ]
    }
  ]
}
Rules:
- Preserve mathematical content faithfully -- do not simplify, solve, or paraphrase anything.
- Question numbering and part labelling must match the paper exactly.
- Include every question on the paper, in order.
- Do not include any text outside the JSON object.

${MATH_NOTATION_RULES}`;

export async function segmentPaper(paperPdfPath: string): Promise<PaperSegmentation> {
  const doc = await pdfDocumentBlock(paperPdfPath);
  return callForJson<PaperSegmentation>(
    PAPER_SYSTEM_PROMPT,
    doc,
    'Segment this IB Math exam paper. Respond with ONLY the JSON object described in the system prompt -- start your reply with { and end with }, no markdown code fences, no explanation before or after.'
  );
}

const MARKSCHEME_OUTPUT_FORMAT = `Return your answer in this exact delimited plain-text format -- NOT JSON, no markdown fences, no prose outside the markers. Write every backslash literally, single, exactly as a LaTeX command needs it (\\frac, not \\\\frac) -- this format needs no escaping of any kind.

@@@QUESTION <question_number>@@@
@@@PART <part_label>@@@
@@@TEXT@@@
<the full markscheme text for this part, verbatim, LaTeX included -- can span multiple lines>
@@@BREAKDOWN@@@
@@@NOTE <note>@@@
<desc for this mark, e.g. valid attempt to substitute -- one block per mark note, e.g. @@@NOTE M1@@@ then @@@NOTE A1@@@>
(repeat @@@PART ...@@@ for every part in this question)
(repeat @@@QUESTION ...@@@ for every question)
@@@DONE@@@

Notes on the markers:
- <part_label> may be an empty string -- write it as @@@PART @@@ (nothing between "PART " and "@@@") for a question with no sub-parts.
- <note> is a short IB mark code only (M1, A1, R1, AG, G1, or a combined code like M1A1) -- never a description. The description goes on the line(s) after @@@NOTE ...@@@, never inside the marker line itself.
- If a part genuinely has zero marks_breakdown entries, omit the @@@BREAKDOWN@@@ section entirely for that part.
- Do not add any text before the first @@@QUESTION@@@ or after @@@DONE@@@.`;

const MARKSCHEME_SYSTEM_PROMPT = `You segment IB Diploma Mathematics exam markschemes into per-question, per-part marking notes.

Critical rule on part_label:
- You are given the CONFIRMED PAPER STRUCTURE below: the exact list of part labels the question paper uses for each question, already determined by segmenting the paper itself. Your job is to slot the markscheme's marking notes into that exact structure, not to re-derive part boundaries from how the markscheme happens to lay out its own working.
- For each question, produce exactly one @@@PART@@@ block per label in its confirmed list, using those exact label strings, in that exact order.
- If a question's confirmed list is a single empty label, produce exactly one @@@PART @@@ block covering that question's entire marking, even if the markscheme shows multiple METHODs or several marking lines for it -- multiple methods for one undivided question is not the same thing as sub-parts.
- If the markscheme's marking for two confirmed labels (e.g. "c.i" and "c.ii") appears together without a clear visual split, split the marking text between them as best you can rather than merging them into one label that isn't in the confirmed list.
- Do not add labels that aren't in the confirmed list, and do not omit any label that is in it.
Other rules:
- Preserve mathematical content faithfully.
- Include every question in the confirmed paper structure, in order.

${MATH_NOTATION_RULES}

${MARKSCHEME_OUTPUT_FORMAT}`;

function parseMarksBreakdown(block: string): MarksBreakdownEntry[] {
  const noteRe = /@@@NOTE ([^\n@]+)@@@\r?\n/g;
  const notes: { note: string; matchStart: number; contentStart: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = noteRe.exec(block)) !== null) {
    notes.push({ note: m[1].trim(), matchStart: m.index, contentStart: m.index + m[0].length });
  }
  const entries: MarksBreakdownEntry[] = [];
  for (let i = 0; i < notes.length; i++) {
    const end = i + 1 < notes.length ? notes[i + 1].matchStart : block.length;
    const desc = block.slice(notes[i].contentStart, end).replace(/\r?\n+$/, '');
    entries.push({ note: notes[i].note, desc });
  }
  return entries;
}

function parsePartBlock(block: string): { markscheme_text: string; marks_breakdown: MarksBreakdownEntry[] } {
  const textMarker = /@@@TEXT@@@\r?\n/;
  const breakdownMarker = /@@@BREAKDOWN@@@\r?\n?/;
  const textMatch = textMarker.exec(block);
  if (!textMatch) throw new Error(`Malformed part block, missing @@@TEXT@@@ marker:\n${block.slice(0, 500)}`);
  const breakdownMatch = breakdownMarker.exec(block);
  const textEnd = breakdownMatch ? breakdownMatch.index : block.length;
  const markscheme_text = block.slice(textMatch.index + textMatch[0].length, textEnd).replace(/\r?\n+$/, '');
  const marks_breakdown = breakdownMatch
    ? parseMarksBreakdown(block.slice(breakdownMatch.index + breakdownMatch[0].length))
    : [];
  return { markscheme_text, marks_breakdown };
}

function parseMarkschemeSegmentation(raw: string): MarkschemeSegmentation {
  const questionRe = /@@@QUESTION (\d+)@@@\r?\n/g;
  const questionMatches: { num: number; matchStart: number; contentStart: number }[] = [];
  let qm: RegExpExecArray | null;
  while ((qm = questionRe.exec(raw)) !== null) {
    questionMatches.push({ num: Number(qm[1]), matchStart: qm.index, contentStart: qm.index + qm[0].length });
  }
  if (questionMatches.length === 0) {
    throw new Error(`No @@@QUESTION <n>@@@ markers found in markscheme response:\n${raw.slice(0, 1500)}`);
  }
  const doneIdx = raw.indexOf('@@@DONE@@@');
  const questions: MarkschemeQuestionSeg[] = [];
  for (let i = 0; i < questionMatches.length; i++) {
    const qEnd = i + 1 < questionMatches.length ? questionMatches[i + 1].matchStart : doneIdx !== -1 ? doneIdx : raw.length;
    const qBlock = raw.slice(questionMatches[i].contentStart, qEnd);

    const partRe = /@@@PART ([^\n@]*)@@@\r?\n/g;
    const partMatches: { label: string; matchStart: number; contentStart: number }[] = [];
    let pm: RegExpExecArray | null;
    while ((pm = partRe.exec(qBlock)) !== null) {
      partMatches.push({ label: pm[1].trim(), matchStart: pm.index, contentStart: pm.index + pm[0].length });
    }
    if (partMatches.length === 0) {
      throw new Error(`Question ${questionMatches[i].num} has no @@@PART ...@@@ blocks:\n${qBlock.slice(0, 500)}`);
    }
    const parts: MarkschemePartSeg[] = [];
    for (let j = 0; j < partMatches.length; j++) {
      // Scan forward for the next @@@PART@@@/@@@QUESTION@@@ marker (not an
      // inner @@@NOTE@@@) to find where this part's content ends.
      const pBlockRaw = qBlock.slice(partMatches[j].contentStart);
      const nextPartMarker = /\r?\n@@@(?:PART|QUESTION)[^\n]*@@@(?:\r?\n|$)/.exec(pBlockRaw);
      const pBlock = nextPartMarker ? pBlockRaw.slice(0, nextPartMarker.index) : pBlockRaw;
      const { markscheme_text, marks_breakdown } = parsePartBlock(pBlock);
      parts.push({ part_label: partMatches[j].label, markscheme_text, marks_breakdown });
    }
    questions.push({ question_number: questionMatches[i].num, parts });
  }
  return { questions };
}

function paperStructureSummary(paper: PaperSegmentation): string {
  const lines = paper.questions.map((q) => {
    const labels = q.parts.map((p) => (p.part_label === '' ? '""' : p.part_label));
    return `Q${q.question_number}: ${labels.join(', ')}`;
  });
  return `CONFIRMED PAPER STRUCTURE (one line per question, exact part labels in order):\n${lines.join('\n')}`;
}

export async function segmentMarkscheme(
  markschemePdfPath: string,
  paperSeg: PaperSegmentation
): Promise<MarkschemeSegmentation> {
  const doc = await pdfDocumentBlock(markschemePdfPath);
  const raw = await callForDelimitedText(
    MARKSCHEME_SYSTEM_PROMPT,
    doc,
    'Segment this IB Math markscheme against the confirmed paper structure given above. Respond with ONLY the delimited-format answer described in the system prompt -- start with @@@QUESTION@@@ and end with @@@DONE@@@.',
    paperStructureSummary(paperSeg)
  );
  return parseMarkschemeSegmentation(raw);
}
