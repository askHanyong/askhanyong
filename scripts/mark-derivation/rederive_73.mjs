// Re-verification for the 73 markscheme_derived_confirmed rows flagged as
// having (pre-backfill) gapped markscheme_text. Run AFTER backfillMarkschemeText
// has corrected markscheme_text for all these rows' papers. Uses the same
// dual-independent-run approach as step2_derive.mjs, with the now-fixed
// trust-hierarchy prompt, against the corrected text -- genuine
// re-derivation, not a re-read of the old cached reasoning.
import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-opus-5';

const SYSTEM = `You are deriving the true mark allocation for one part of an IB Mathematics AA exam question, by reading its markscheme text.

Rules, in priority order:
1. If the markscheme shows multiple METHODs (METHOD 1, METHOD 2, ...), these are ALTERNATIVE solution paths for the SAME part — use only ONE method's marks for the total. Do not add marks across methods.
2. If there is an EITHER/OR structure (standalone, or nested inside a METHOD block), count marks from only ONE of the branches, then add any marks from a THEN section that follows (a THEN section may be worth 0 marks if it's just a narrative conclusion, or may carry real marks — read it, don't assume).
3. Mark codes: M1/A1/A2/R1/G1 etc are each worth the digit shown. A code repeated with no separator in one line, e.g. "A1A1" or "(A1)(A1)", is worth 2 marks (one for each occurrence), not 1. AG (answer given) is worth 0 marks.
4. Cross-check your derived value against the context you're given: sibling parts already known for this question, and the question's own stated maximum mark. If something doesn't add up, say so explicitly in tally_notes rather than silently picking a number.
5. You are also given this part's structured marks_breakdown, extracted from the same markscheme PDF by the same segmentation pass that produced the free-text below. marks_breakdown is at least as trustworthy as the free text -- only depart from it on concrete contrary evidence from the text itself.

Respond with ONLY a JSON object, no markdown fences, no other text:
{
  "method_used": "which METHOD (if any) you used, or 'single path' if there's no METHOD split",
  "branch_chosen": "which EITHER/OR branch (if any) you used, or 'none'",
  "steps": ["short description of each mark-worthy step you counted, with its code and value"],
  "derived_value": <integer>,
  "tally_notes": "brief note on whether this reconciles with sibling/max-mark context, or any concern"
}`;

function buildUserPrompt(job) {
  const siblingLines = job.other_siblings_in_question
    .map((s) => `  - part (${s.part_label}): ${s.marks} marks (confirmed)`)
    .join('\n');
  return `Paper: ${job.paper_label}, Question ${job.question_number}, Part (${job.part_label})
Question's own stated maximum mark: ${job.question_max_mark ?? 'unknown'}

Other parts of this same question:
${siblingLines || '  (none)'}

Raw markscheme text for THIS part (${job.part_label}), re-extracted verbatim including inline codes:
"""
${job.markscheme_text}
"""

Structured marks_breakdown as currently stored, extracted independently by the same segmentation pass (treat as at least as authoritative as the free text above -- see rule 5):
${JSON.stringify(job.marks_breakdown, null, 2)}

Derive the true mark value for part (${job.part_label}) following the rules in the system prompt.`;
}

function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error(`No JSON in response: ${text.slice(0, 500)}`);
  return JSON.parse(text.slice(start, end + 1));
}

async function runOnce(job) {
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM,
    messages: [{ role: 'user', content: buildUserPrompt(job) }],
  });
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return extractJson(text);
}

async function processJob(job) {
  try {
    const [run1, run2] = await Promise.all([runOnce(job), runOnce(job)]);
    const agree = run1.derived_value === run2.derived_value;
    const matches_stored = agree && run1.derived_value === job.currently_stored_marks;
    return { part_id: job.part_id, job, run1, run2, agree, matches_stored, error: null };
  } catch (err) {
    return { part_id: job.part_id, job, run1: null, run2: null, agree: false, matches_stored: null, error: String(err) };
  }
}

async function main() {
  const jobs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const outfile = process.argv[3];
  const CONCURRENCY = 6;
  const results = [];

  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    const batch = jobs.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(processJob));
    results.push(...batchResults);
    console.log(`processed ${Math.min(i + CONCURRENCY, jobs.length)}/${jobs.length}`);
    fs.writeFileSync(outfile, JSON.stringify(results, null, 2));
  }

  const agreeCount = results.filter((r) => r.agree).length;
  const matchCount = results.filter((r) => r.matches_stored).length;
  const mismatch = results.filter((r) => r.agree && !r.matches_stored);
  const disagree = results.filter((r) => !r.agree && !r.error);
  const errorCount = results.filter((r) => r.error).length;
  console.log(`Done. ${results.length} jobs.`);
  console.log(`  Dual-run agreement: ${agreeCount}/${results.length}`);
  console.log(`  Matches currently-stored marks: ${matchCount}/${results.length}`);
  console.log(`  Dual-run agrees but DIFFERS from stored marks: ${mismatch.length}`);
  console.log(`  Dual-run DISAGREES (runs gave different values): ${disagree.length}`);
  console.log(`  Errors: ${errorCount}`);
  for (const r of mismatch) {
    console.log(`    MISMATCH ${r.part_id}: stored=${r.job.currently_stored_marks}, re-derived=${r.run1.derived_value}`);
  }
  for (const r of disagree) {
    console.log(`    DISAGREE ${r.part_id}: run1=${r.run1.derived_value}, run2=${r.run2.derived_value}, stored=${r.job.currently_stored_marks}`);
  }
}

main();
