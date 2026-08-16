import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-5'; // matches env.claudeModel default, used historically

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

async function pdfDocumentBlock(filePath) {
  const buf = fs.readFileSync(filePath);
  return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') } };
}

function paperStructureSummary(questionsByNum) {
  const lines = [];
  for (const qnum of Object.keys(questionsByNum).sort((a,b)=>a-b)) {
    const labels = questionsByNum[qnum].parts.map(p => p.part_label === '' ? '""' : p.part_label);
    lines.push(`Q${qnum}: ${labels.join(', ')}`);
  }
  return `CONFIRMED PAPER STRUCTURE (one line per question, exact part labels in order):\n${lines.join('\n')}`;
}

function reconstructPaperJSON(questionsByNum) {
  const questions = Object.keys(questionsByNum).sort((a,b)=>a-b).map(qnum => {
    const q = questionsByNum[qnum];
    return {
      question_number: Number(qnum),
      total_marks: q.total_marks,
      parts: q.parts.map(p => ({
        part_label: p.part_label,
        part_text: p.part_text,
        image_refs: p.image_refs || [],
        marks: p.marks,
        command_term: p.command_term,
        depends_on_part_label: p.depends_on_part_label,
        order_index: p.order_index,
      })),
    };
  });
  return JSON.stringify({ questions });
}

function reconstructMarkschemeDelimited(questionsByNum) {
  const lines = [];
  for (const qnum of Object.keys(questionsByNum).sort((a,b)=>a-b)) {
    lines.push(`@@@QUESTION ${qnum}@@@`);
    for (const p of questionsByNum[qnum].parts) {
      lines.push(`@@@PART ${p.part_label}@@@`);
      lines.push(`@@@TEXT@@@`);
      lines.push(p.markscheme_text || '');
      if (p.marks_breakdown && p.marks_breakdown.length > 0) {
        lines.push(`@@@BREAKDOWN@@@`);
        for (const entry of p.marks_breakdown) {
          lines.push(`@@@NOTE ${entry.note}@@@`);
          lines.push(entry.desc);
        }
      }
    }
  }
  lines.push('@@@DONE@@@');
  return lines.join('\n');
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const rows = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  const pdfDir = process.argv[4];
  const outfile = process.argv[5];

  const byPaper = {};
  for (const r of rows) {
    byPaper[r.paper_id] ??= {};
    byPaper[r.paper_id][r.question_number] ??= { total_marks: r.total_marks, parts: [] };
    byPaper[r.paper_id][r.question_number].parts.push(r);
  }

  const results = [];
  for (const p of manifest) {
    const questionsByNum = byPaper[p.id];

    const paperDoc = await pdfDocumentBlock(`${pdfDir}/${p.id}_paper.pdf`);
    const paperInputCount = await client.messages.countTokens({
      model: MODEL,
      system: PAPER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: [
        paperDoc,
        { type: 'text', text: 'Segment this IB Math exam paper. Respond with ONLY the JSON object described in the system prompt -- start your reply with { and end with }, no markdown code fences, no explanation before or after.' },
      ] }],
    });

    const msDoc = await pdfDocumentBlock(`${pdfDir}/${p.id}_ms.pdf`);
    const msInputCount = await client.messages.countTokens({
      model: MODEL,
      system: MARKSCHEME_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: [
        msDoc,
        { type: 'text', text: paperStructureSummary(questionsByNum) },
        { type: 'text', text: 'Segment this IB Math markscheme against the confirmed paper structure given above. Respond with ONLY the delimited-format answer described in the system prompt -- start with @@@QUESTION@@@ and end with @@@DONE@@@.' },
      ] }],
    });

    const paperOutputText = reconstructPaperJSON(questionsByNum);
    const paperOutputCount = await client.messages.countTokens({ model: MODEL, messages: [{ role: 'user', content: paperOutputText }] });

    const msOutputText = reconstructMarkschemeDelimited(questionsByNum);
    const msOutputCount = await client.messages.countTokens({ model: MODEL, messages: [{ role: 'user', content: msOutputText }] });

    results.push({
      id: p.id, label: p.label,
      paper_input_tokens: paperInputCount.input_tokens,
      paper_output_tokens: paperOutputCount.input_tokens,
      ms_input_tokens: msInputCount.input_tokens,
      ms_output_tokens: msOutputCount.input_tokens,
    });
    console.log('done', p.label);
  }

  fs.writeFileSync(outfile, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
}

main();
