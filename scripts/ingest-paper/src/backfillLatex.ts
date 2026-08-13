// Backfills LaTeX math notation into already-ingested question_parts.part_text
// and markscheme_parts.markscheme_text/marks_breakdown[].desc, WITHOUT
// re-ingesting: this only sends existing stored text through Claude to add
// $...$/$$...$$ markup, then UPDATEs just those text columns. marks,
// command_term, part_label, order_index, note, and everything else are left
// untouched.
//
// Usage:
//   tsx src/backfillLatex.ts --test <paper_id>                    -- dry run, one paper, prints before/after, no DB writes
//   tsx src/backfillLatex.ts --run <paper_id>                     -- writes one paper
//   tsx src/backfillLatex.ts --run --all [--skip id1,id2,...]     -- writes every paper (optionally excluding already-done ones)
import Anthropic from '@anthropic-ai/sdk';
import { env } from './env.js';
import { supabase } from './supabaseIngest.js';

const client = new Anthropic({ apiKey: env.anthropicApiKey });

const LATEXIFY_RULES = `LaTeX conventions to use: \\frac{a}{b} for every fraction, \\sqrt{...} and \\sqrt[n]{...} for roots, x^{2} and x_{i} for exponents/subscripts -- braces REQUIRED whenever more than one character (x^{n+1}, not x^n+1), \\int \\sum \\lim_{x \\to 0} \\sin \\cos \\tan \\ln \\log \\pi \\theta \\alpha \\beta \\leq \\geq \\neq \\in \\mathbb{R} \\mathbb{Z} \\mathbb{C} \\times \\cdot \\div \\infty, \\begin{pmatrix}...\\end{pmatrix} (rows separated by \\\\, entries by &) for vectors/matrices.
Inline math (embedded in a sentence): wrap in single dollar signs, $...$. Standalone/display equations (an equation on its own line, not mid-sentence): wrap in double dollar signs, $$...$$.
Regular prose stays plain text -- wrap ONLY the mathematical notation itself, not the words around it.`;

// Output is a custom @@@-delimited plain-text format, NOT JSON. A first pass
// of this backfill used JSON in/out and intermittently failed: the model
// sometimes emitted a single backslash instead of the JSON-required double
// backslash inside a LaTeX command (e.g. \Pi instead of \\Pi), which either
// threw a JSON parse error outright or -- worse -- silently parsed as the
// wrong character for commands starting with a letter that collides with a
// JSON escape (\frac -> \f + "rac", \begin -> \b + "egin", \tan -> \t + "an").
// A delimited format sidesteps this class of bug entirely: the model just
// echoes LaTeX literally, no escaping required at all.
const LATEXIFY_SYSTEM_PROMPT = `You convert existing IB Diploma Mathematics exam text from a plain-text math notation (e.g. x^2, √(x+1), (a+b)/c, lim(x->0)) into the SAME text with proper LaTeX math notation.

CRITICAL -- this is a pure notation conversion, not a rewrite:
- Do NOT change any wording, numbers, variable names, ordering, punctuation, or meaning.
- Do NOT add, remove, merge, split, or rephrase any content.
- Do NOT fix errors, typos, or ambiguities in the source text -- preserve it exactly as given, only re-notate the math.
- The ONLY change allowed: replacing plain-text math notation with equivalent LaTeX, wrapped in $...$ or $$...$$.

${LATEXIFY_RULES}

INPUT FORMAT: a JSON array of {"id": string, "text": string} objects.

OUTPUT FORMAT -- this is NOT JSON, do not produce JSON, do not use markdown code fences. For each item, in the same order as given, output exactly:
@@@PART <id>@@@
<the converted text, LaTeX included, written literally with single backslashes -- no escaping of any kind needed>

After the very last item, output a final line containing only: @@@DONE@@@
Do not add any other text, prose, or explanation anywhere. Do not skip or reorder any items. The <id> on each @@@PART line must exactly match the id given in the input, character for character.`;

const LATEXIFY_MARKSCHEME_SYSTEM_PROMPT = `You convert existing IB Diploma Mathematics markscheme text from a plain-text math notation into the SAME text with proper LaTeX math notation.

CRITICAL -- this is a pure notation conversion, not a rewrite:
- Do NOT change any wording, numbers, variable names, ordering, punctuation, or meaning.
- Do NOT add, remove, merge, split, or rephrase any content, and do NOT touch the note values (M1, A1, AG, etc.) at all.
- Do NOT fix errors, typos, or ambiguities in the source text -- preserve it exactly as given, only re-notate the math.
- The ONLY change allowed: replacing plain-text math notation with equivalent LaTeX, wrapped in $...$ or $$...$$, inside markscheme_text and each marks_breakdown desc.

${LATEXIFY_RULES}

INPUT FORMAT: a JSON array of {"id": string, "markscheme_text": string, "marks_breakdown": [{"note": string, "desc": string}]} objects.

OUTPUT FORMAT -- this is NOT JSON, do not produce JSON, do not use markdown code fences. For each item, in the same order as given, output exactly:
@@@ITEM <id>@@@
@@@TEXT@@@
<the converted markscheme_text, LaTeX included, written literally with single backslashes -- can span multiple lines>
@@@BREAKDOWN@@@
@@@NOTE <note>@@@
<the converted desc for this marks_breakdown entry, written literally>
@@@NOTE <note>@@@
<the converted desc for the next entry>
(one @@@NOTE <note>@@@ block per marks_breakdown entry given for this item, same notes, same order, same count -- if an item has zero marks_breakdown entries, omit the @@@BREAKDOWN@@@ section entirely for that item)

After the very last item, output a final line containing only: @@@DONE@@@
Do not add any other text, prose, or explanation anywhere. The <id> on each @@@ITEM line and the <note> on each @@@NOTE line must exactly match what was given in the input, character for character.`;

async function callForDelimitedText(system: string, userText: string): Promise<string> {
  const resp = await client.messages
    .stream({
      model: env.claudeModel,
      max_tokens: 32000,
      system,
      messages: [{ role: 'user', content: [{ type: 'text', text: userText }] }],
    })
    .finalMessage();
  if (resp.stop_reason === 'max_tokens') {
    throw new Error(`Response truncated (hit 32000 output-token cap) -- reduce batch size.`);
  }
  const textBlock = resp.content.find((b): b is Anthropic.Messages.TextBlock => b.type === 'text');
  if (!textBlock) throw new Error('Claude returned no text content block.');
  return textBlock.text;
}

const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

function parseDelimitedParts(text: string): Map<string, string> {
  const markerRe = new RegExp(`@@@PART (${UUID})@@@\\r?\\n`, 'g');
  const matches: { id: string; matchStart: number; contentStart: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = markerRe.exec(text)) !== null) {
    matches.push({ id: m[1], matchStart: m.index, contentStart: m.index + m[0].length });
  }
  const doneIdx = text.indexOf('@@@DONE@@@');
  const result = new Map<string, string>();
  for (let i = 0; i < matches.length; i++) {
    const end = i + 1 < matches.length ? matches[i + 1].matchStart : doneIdx !== -1 ? doneIdx : text.length;
    const content = text.slice(matches[i].contentStart, end).replace(/\r?\n+$/, '');
    result.set(matches[i].id, content);
  }
  return result;
}

interface ParsedMsItem {
  markscheme_text: string;
  breakdown: Array<{ note: string; desc: string }>;
}

function parseItemBlock(block: string): ParsedMsItem {
  const textMarker = '@@@TEXT@@@\n';
  const breakdownMarker = '@@@BREAKDOWN@@@';
  const textStart = block.indexOf(textMarker);
  if (textStart === -1) {
    throw new Error(`Malformed item block, missing @@@TEXT@@@ marker:\n${block.slice(0, 300)}`);
  }
  const breakdownStart = block.indexOf(breakdownMarker);
  const textEnd = breakdownStart === -1 ? block.length : breakdownStart;
  const markscheme_text = block.slice(textStart + textMarker.length, textEnd).replace(/\r?\n+$/, '');

  const breakdown: Array<{ note: string; desc: string }> = [];
  if (breakdownStart !== -1) {
    const breakdownBlock = block.slice(breakdownStart + breakdownMarker.length);
    const noteRe = /@@@NOTE (.+?)@@@\r?\n/g;
    const notes: { note: string; matchStart: number; contentStart: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = noteRe.exec(breakdownBlock)) !== null) {
      notes.push({ note: m[1], matchStart: m.index, contentStart: m.index + m[0].length });
    }
    for (let i = 0; i < notes.length; i++) {
      const end = i + 1 < notes.length ? notes[i + 1].matchStart : breakdownBlock.length;
      const desc = breakdownBlock.slice(notes[i].contentStart, end).replace(/\r?\n+$/, '');
      breakdown.push({ note: notes[i].note, desc });
    }
  }
  return { markscheme_text, breakdown };
}

function parseDelimitedMarkschemeItems(text: string): Map<string, ParsedMsItem> {
  const itemRe = new RegExp(`@@@ITEM (${UUID})@@@\\r?\\n`, 'g');
  const items: { id: string; matchStart: number; contentStart: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(text)) !== null) {
    items.push({ id: m[1], matchStart: m.index, contentStart: m.index + m[0].length });
  }
  const doneIdx = text.indexOf('@@@DONE@@@');
  const result = new Map<string, ParsedMsItem>();
  for (let i = 0; i < items.length; i++) {
    const end = i + 1 < items.length ? items[i + 1].matchStart : doneIdx !== -1 ? doneIdx : text.length;
    const block = text.slice(items[i].contentStart, end);
    result.set(items[i].id, parseItemBlock(block));
  }
  return result;
}

// Cheap drift check: every standalone number in the old text should still
// appear somewhere in the new text. Doesn't prove nothing else changed, but
// catches the most concerning failure mode (a value getting altered).
function numbersChanged(oldText: string, newText: string): boolean {
  const extract = (s: string) => new Set(s.match(/\d+(\.\d+)?/g) ?? []);
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

const BATCH_SIZE = 8;

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
    const raw = await callForDelimitedText(LATEXIFY_SYSTEM_PROMPT, JSON.stringify(input));
    const parsed = parseDelimitedParts(raw);
    for (const p of batch) {
      const newText = parsed.get(p.id);
      if (newText === undefined) {
        throw new Error(`Batch response missing id ${p.id} -- refusing to proceed on this batch.\n---\n${raw.slice(0, 2000)}`);
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
    const raw = await callForDelimitedText(LATEXIFY_MARKSCHEME_SYSTEM_PROMPT, JSON.stringify(input));
    const parsed = parseDelimitedMarkschemeItems(raw);
    for (const p of batch) {
      const out = parsed.get(p.id);
      if (!out) {
        throw new Error(`Batch response missing id ${p.id} -- refusing to proceed on this batch.\n---\n${raw.slice(0, 2000)}`);
      }
      const expectedCount = (p.marks_breakdown ?? []).length;
      if (out.breakdown.length !== expectedCount) {
        throw new Error(
          `Batch response for ${p.id} has ${out.breakdown.length} marks_breakdown entries, expected ${expectedCount} -- refusing to proceed on this batch.`
        );
      }
      const oldCombined = p.markscheme_text + ' ' + (p.marks_breakdown ?? []).map((b) => b.desc).join(' ');
      const newCombined = out.markscheme_text + ' ' + out.breakdown.map((b) => b.desc).join(' ');
      markschemeParts.push({
        id: p.id,
        oldText: p.markscheme_text,
        newText: out.markscheme_text,
        oldBreakdown: p.marks_breakdown,
        newBreakdown: out.breakdown,
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
    if (!target) throw new Error('Usage: tsx src/backfillLatex.ts --run <paper_id> | --run --all [--skip id1,id2,...]');
    const skipIdx = args.indexOf('--skip');
    const skipIds = new Set(skipIdx !== -1 ? (args[skipIdx + 1] ?? '').split(',').filter(Boolean) : []);
    const allIds = target === '--all' ? await fetchAllPaperIds() : [target];
    const paperIds = allIds.filter((id) => !skipIds.has(id));
    if (skipIds.size > 0) {
      console.log(`Skipping ${allIds.length - paperIds.length} paper(s) already done: ${[...skipIds].join(', ')}`);
    }

    let totalQ = 0;
    let totalMs = 0;
    let totalDrift = 0;
    const failures: Array<{ paperId: string; error: string }> = [];

    for (const paperId of paperIds) {
      console.log(`Processing paper ${paperId}...`);
      try {
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
      } catch (err) {
        // One paper's failure must not take down the whole run -- log it and
        // move on so the remaining ~29 papers still get processed. Nothing
        // is written for a paper that throws (the fetch/convert step runs
        // entirely before writeLatexifyResult is called).
        console.error(`  FAILED: ${(err as Error).message}`);
        failures.push({ paperId, error: (err as Error).message });
      }
    }

    console.log(
      `\nDone. ${paperIds.length - failures.length}/${paperIds.length} paper(s) succeeded, ${totalQ} question_parts, ${totalMs} markscheme_parts updated. ${totalDrift} number-drift flag(s) total.`
    );
    if (failures.length > 0) {
      console.log(`\n${failures.length} paper(s) FAILED and were left untouched:`);
      for (const f of failures) console.log(`  ${f.paperId}: ${f.error.split('\n')[0]}`);
    }
    return;
  }

  console.error('Usage: tsx src/backfillLatex.ts --test <paper_id> | --run <paper_id> | --run --all [--skip id1,id2,...]');
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
