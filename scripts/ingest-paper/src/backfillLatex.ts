// Backfills LaTeX math notation into already-ingested question_parts.part_text
// and markscheme_parts.markscheme_text/marks_breakdown[].desc, WITHOUT
// re-ingesting: this only sends existing stored text through Claude to add
// $...$/$$...$$ markup, then UPDATEs just those text columns. marks,
// command_term, part_label, order_index, note, and everything else are left
// untouched.
//
// Usage:
//   tsx src/backfillLatex.ts --test <paper_id>   -- dry run, one paper, prints before/after, no DB writes
//   tsx src/backfillLatex.ts --run <paper_id>    -- writes one paper
//   tsx src/backfillLatex.ts --run --all         -- writes every paper in the DB
import Anthropic from '@anthropic-ai/sdk';
import { env } from './env.js';
import { supabase } from './supabaseIngest.js';

const client = new Anthropic({ apiKey: env.anthropicApiKey });

const LATEXIFY_RULES = `LaTeX conventions to use: \\frac{a}{b} for every fraction, \\sqrt{...} and \\sqrt[n]{...} for roots, x^{2} and x_{i} for exponents/subscripts -- braces REQUIRED whenever more than one character (x^{n+1}, not x^n+1), \\int \\sum \\lim_{x \\to 0} \\sin \\cos \\tan \\ln \\log \\pi \\theta \\alpha \\beta \\leq \\geq \\neq \\in \\mathbb{R} \\mathbb{Z} \\mathbb{C} \\times \\cdot \\div \\infty, \\begin{pmatrix}...\\end{pmatrix} (rows separated by \\\\, entries by &) for vectors/matrices.
Inline math (embedded in a sentence): wrap in single dollar signs, $...$. Standalone/display equations (an equation on its own line, not mid-sentence): wrap in double dollar signs, $$...$$.
Regular prose stays plain text -- wrap ONLY the mathematical notation itself, not the words around it.`;

const LATEXIFY_SYSTEM_PROMPT = `You convert existing IB Diploma Mathematics exam text from a plain-text math notation (e.g. x^2, √(x+1), (a+b)/c, lim(x->0)) into the SAME text with proper LaTeX math notation.

CRITICAL -- this is a pure notation conversion, not a rewrite:
- Do NOT change any wording, numbers, variable names, ordering, punctuation, or meaning.
- Do NOT add, remove, merge, split, or rephrase any content.
- Do NOT fix errors, typos, or ambiguities in the source text -- preserve it exactly as given, only re-notate the math.
- The ONLY change allowed: replacing plain-text math notation with equivalent LaTeX, wrapped in $...$ or $$...$$.

${LATEXIFY_RULES}

You will be given a JSON array of {"id": string, "text": string} objects. Return ONLY a single JSON array of the same shape, same ids, same order, same length -- with "text" updated to include LaTeX markup. No prose, no markdown fences, no explanation.
Remember you are producing JSON: every backslash in a LaTeX command must be written as TWO backslash characters in the JSON text you output, so it decodes to a single backslash. Double-check this before finishing -- a single un-escaped backslash breaks JSON parsing entirely.`;

const LATEXIFY_MARKSCHEME_SYSTEM_PROMPT = `You convert existing IB Diploma Mathematics markscheme text from a plain-text math notation into the SAME text with proper LaTeX math notation.

CRITICAL -- this is a pure notation conversion, not a rewrite:
- Do NOT change any wording, numbers, variable names, ordering, punctuation, or meaning.
- Do NOT add, remove, merge, split, or rephrase any content, and do NOT touch the "note" field (M1, A1, AG, etc.) at all.
- Do NOT fix errors, typos, or ambiguities in the source text -- preserve it exactly as given, only re-notate the math.
- The ONLY change allowed: replacing plain-text math notation with equivalent LaTeX, wrapped in $...$ or $$...$$, inside "markscheme_text" and each "marks_breakdown[].desc".

${LATEXIFY_RULES}

You will be given a JSON array of {"id": string, "markscheme_text": string, "marks_breakdown": [{"note": string, "desc": string}]} objects.
Return ONLY a single JSON array of the same shape, same ids, same order, same length, same number of marks_breakdown entries in the same order with "note" unchanged -- with "markscheme_text" and every "desc" updated to include LaTeX markup. No prose, no markdown fences, no explanation.
Remember you are producing JSON: every backslash in a LaTeX command must be written as TWO backslash characters in the JSON text you output, so it decodes to a single backslash. Double-check this before finishing.`;

function extractJsonArray<T>(text: string): T[] {
  const trimmed = text.trim();
  const start = trimmed.indexOf('[');
  const end = trimmed.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`No JSON array found in response:\n---\n${trimmed.slice(0, 1000)}`);
  }
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as T[];
  } catch (err) {
    throw new Error(`Failed to parse JSON array: ${(err as Error).message}\n---\n${trimmed.slice(0, 1000)}`);
  }
}

async function callForJsonArray<T>(system: string, userText: string): Promise<T[]> {
  const resp = await client.messages
    .stream({
      model: env.claudeModel,
      max_tokens: 16000,
      system,
      messages: [{ role: 'user', content: [{ type: 'text', text: userText }] }],
    })
    .finalMessage();
  if (resp.stop_reason === 'max_tokens') {
    throw new Error(`Response truncated (hit 16000 output-token cap) -- reduce batch size.`);
  }
  const textBlock = resp.content.find((b): b is Anthropic.Messages.TextBlock => b.type === 'text');
  if (!textBlock) throw new Error('Claude returned no text content block.');
  return extractJsonArray<T>(textBlock.text);
}

// Cheap drift check: every standalone number in the old text should still
// appear somewhere in the new text. Doesn't prove nothing else changed, but
// catches the most concerning failure mode (a value getting altered).
function numbersChanged(oldText: string, newText: string): boolean {
  const extract = (s: string) => new Set((s.match(/\d+(\.\d+)?/g) ?? []));
  const oldNums = extract(oldText);
  const newNums = extract(newText);
  for (const n of oldNums) {
    if (!newNums.has(n)) return true;
  }
  return false;
}

interface QuestionPartRow {
  id: string;
  part_text: string;
}

interface MarkschemePartRow {
  id: string;
  markscheme_text: string;
  marks_breakdown: Array<{ note: string; desc: string }> | null;
}

const BATCH_SIZE = 12;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export interface LatexifyResult {
  questionParts: Array<{ id: string; oldText: string; newText: string; numbersDrifted: boolean }>;
  markschemeParts: Array<{
    id: string;
    oldText: string;
    newText: string;
    oldBreakdown: Array<{ note: string; desc: string }> | null;
    newBreakdown: Array<{ note: string; desc: string }> | null;
    numbersDrifted: boolean;
  }>;
}

export async function latexifyPaper(paperId: string): Promise<LatexifyResult> {
  const { data: qParts, error: qErr } = await supabase
    .from('question_parts')
    .select('id, part_text, questions!inner(paper_id)')
    .eq('questions.paper_id', paperId);
  if (qErr) throw new Error(`Failed to fetch question_parts: ${qErr.message}`);

  const { data: msParts, error: msErr } = await supabase
    .from('markscheme_parts')
    .select('id, markscheme_text, marks_breakdown, question_parts!inner(question_id, questions!inner(paper_id))')
    .eq('question_parts.questions.paper_id', paperId);
  if (msErr) throw new Error(`Failed to fetch markscheme_parts: ${msErr.message}`);

  const questionParts: LatexifyResult['questionParts'] = [];
  for (const batch of chunk((qParts ?? []) as unknown as QuestionPartRow[], BATCH_SIZE)) {
    const input = batch.map((p) => ({ id: p.id, text: p.part_text }));
    const output = await callForJsonArray<{ id: string; text: string }>(
      LATEXIFY_SYSTEM_PROMPT,
      JSON.stringify(input)
    );
    const outputById = new Map(output.map((o) => [o.id, o.text]));
    for (const p of batch) {
      const newText = outputById.get(p.id);
      if (newText === undefined) {
        throw new Error(`Batch response missing id ${p.id} -- refusing to proceed on this batch.`);
      }
      questionParts.push({ id: p.id, oldText: p.part_text, newText, numbersDrifted: numbersChanged(p.part_text, newText) });
    }
  }

  const markschemeParts: LatexifyResult['markschemeParts'] = [];
  for (const batch of chunk((msParts ?? []) as unknown as MarkschemePartRow[], BATCH_SIZE)) {
    const input = batch.map((p) => ({
      id: p.id,
      markscheme_text: p.markscheme_text,
      marks_breakdown: p.marks_breakdown ?? [],
    }));
    const output = await callForJsonArray<{
      id: string;
      markscheme_text: string;
      marks_breakdown: Array<{ note: string; desc: string }>;
    }>(LATEXIFY_MARKSCHEME_SYSTEM_PROMPT, JSON.stringify(input));
    const outputById = new Map(output.map((o) => [o.id, o]));
    for (const p of batch) {
      const out = outputById.get(p.id);
      if (!out) {
        throw new Error(`Batch response missing id ${p.id} -- refusing to proceed on this batch.`);
      }
      const oldCombined = p.markscheme_text + ' ' + (p.marks_breakdown ?? []).map((b) => b.desc).join(' ');
      const newCombined = out.markscheme_text + ' ' + out.marks_breakdown.map((b) => b.desc).join(' ');
      markschemeParts.push({
        id: p.id,
        oldText: p.markscheme_text,
        newText: out.markscheme_text,
        oldBreakdown: p.marks_breakdown,
        newBreakdown: out.marks_breakdown,
        numbersDrifted: numbersChanged(oldCombined, newCombined),
      });
    }
  }

  return { questionParts, markschemeParts };
}

export async function writeLatexifyResult(result: LatexifyResult): Promise<void> {
  for (const p of result.questionParts) {
    const { error } = await supabase.from('question_parts').update({ part_text: p.newText }).eq('id', p.id);
    if (error) throw new Error(`Failed to update question_parts ${p.id}: ${error.message}`);
  }
  for (const p of result.markschemeParts) {
    const { error } = await supabase
      .from('markscheme_parts')
      .update({ markscheme_text: p.newText, marks_breakdown: p.newBreakdown })
      .eq('id', p.id);
    if (error) throw new Error(`Failed to update markscheme_parts ${p.id}: ${error.message}`);
  }
}

async function fetchAllPaperIds(): Promise<string[]> {
  const { data, error } = await supabase.from('papers').select('id');
  if (error) throw new Error(`Failed to fetch paper ids: ${error.message}`);
  return (data ?? []).map((r) => r.id as string);
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0];

  if (mode === '--test') {
    const paperId = args[1];
    if (!paperId) throw new Error('Usage: tsx src/backfillLatex.ts --test <paper_id>');
    console.log(`Dry run on paper ${paperId} (no DB writes)...`);
    const result = await latexifyPaper(paperId);
    console.log(`\n${result.questionParts.length} question_parts, ${result.markschemeParts.length} markscheme_parts processed.`);
    const drifted = [
      ...result.questionParts.filter((p) => p.numbersDrifted).map((p) => `question_parts ${p.id}`),
      ...result.markschemeParts.filter((p) => p.numbersDrifted).map((p) => `markscheme_parts ${p.id}`),
    ];
    console.log(`Number-drift flags: ${drifted.length === 0 ? 'none' : drifted.join(', ')}`);
    console.log('\n=== SAMPLE (first 4 question_parts) ===');
    for (const p of result.questionParts.slice(0, 4)) {
      console.log(`\n--- ${p.id} ---`);
      console.log('BEFORE:', p.oldText);
      console.log('AFTER: ', p.newText);
    }
    console.log('\n=== SAMPLE (first 3 markscheme_parts) ===');
    for (const p of result.markschemeParts.slice(0, 3)) {
      console.log(`\n--- ${p.id} ---`);
      console.log('BEFORE markscheme_text:', p.oldText);
      console.log('AFTER  markscheme_text:', p.newText);
      console.log('BEFORE marks_breakdown:', JSON.stringify(p.oldBreakdown));
      console.log('AFTER  marks_breakdown:', JSON.stringify(p.newBreakdown));
    }
    const outPath = '/tmp/claude-0/-home-user-askhanyong/8a784320-b9e5-5fee-88d1-412ba4674873/scratchpad/backfill_latex_test_result.json';
    const fs = await import('node:fs/promises');
    await fs.writeFile(outPath, JSON.stringify(result, null, 2), 'utf8');
    console.log(`\nWrote full result to ${outPath}`);
    return;
  }

  if (mode === '--run') {
    const target = args[1];
    const paperIds = target === '--all' ? await fetchAllPaperIds() : [target];
    if (!target) throw new Error('Usage: tsx src/backfillLatex.ts --run <paper_id> | --run --all');
    let totalQ = 0;
    let totalMs = 0;
    let totalDrift = 0;
    for (const paperId of paperIds) {
      console.log(`Processing paper ${paperId}...`);
      const result = await latexifyPaper(paperId);
      const drift = [...result.questionParts, ...result.markschemeParts].filter((p) => p.numbersDrifted).length;
      if (drift > 0) {
        console.log(`  WARNING: ${drift} part(s) flagged for number drift -- writing anyway, but review these ids after.`);
      }
      await writeLatexifyResult(result);
      totalQ += result.questionParts.length;
      totalMs += result.markschemeParts.length;
      totalDrift += drift;
      console.log(`  updated ${result.questionParts.length} question_parts, ${result.markschemeParts.length} markscheme_parts.`);
    }
    console.log(`\nDone. ${paperIds.length} paper(s), ${totalQ} question_parts, ${totalMs} markscheme_parts updated. ${totalDrift} number-drift flag(s) total.`);
    return;
  }

  console.error('Usage: tsx src/backfillLatex.ts --test <paper_id> | --run <paper_id> | --run --all');
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
