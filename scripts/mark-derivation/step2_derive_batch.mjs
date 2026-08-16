import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL_SIMPLE = 'claude-sonnet-5';
const MODEL_HARD = 'claude-opus-5';

const SYSTEM = `You are deriving the true mark allocation for one part of an IB Mathematics AA exam question, by reading its markscheme text.

Rules, in priority order:
1. If the markscheme shows multiple METHODs (METHOD 1, METHOD 2, ...), these are ALTERNATIVE solution paths for the SAME part — use only ONE method's marks for the total. Do not add marks across methods.
2. If there is an EITHER/OR structure (standalone, or nested inside a METHOD block), count marks from only ONE of the branches, then add any marks from a THEN section that follows (a THEN section may be worth 0 marks if it's just a narrative conclusion, or may carry real marks — read it, don't assume).
3. Mark codes: M1/A1/A2/R1/G1 etc are each worth the digit shown. A code repeated with no separator in one line, e.g. "A1A1" or "(A1)(A1)", is worth 2 marks (one for each occurrence), not 1. AG (answer given) is worth 0 marks.
4. Cross-check your derived value against the context you're given: sibling parts already known for this question, the question's own stated maximum mark, and (if this part shares a printed paper bracket with sibling parts) whether your value plus the known siblings' values reconciles with that combined bracket. If something doesn't add up, say so explicitly in tally_notes rather than silently picking a number.

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
    .map(s => `  - part (${s.part_label}): ${s.known_value !== null ? s.known_value + ' marks (confirmed)' : 'not yet determined'}`)
    .join('\n');
  let groupLine = 'This part does not share a printed paper mark-bracket with any sibling.';
  if (job.group_combined_bracket !== null && job.group_combined_bracket !== undefined) {
    groupLine = `This part is one of a group [${job.group_siblings.join(', ')}] that together share ONE printed paper bracket of [${job.group_combined_bracket}] marks total — your derived value plus the other group members' values should sum to ${job.group_combined_bracket}.`;
  }
  return `Paper: ${job.paper_label}, Question ${job.question_number}, Part (${job.part_label})
Question's own stated maximum mark: ${job.question_max_mark}
${groupLine}

Other parts of this same question:
${siblingLines || '  (none)'}

Raw markscheme text for THIS part (${job.part_label}):
"""
${job.markscheme_text}
"""

Structured marks_breakdown as currently stored (for reference only — it may be wrong; derive independently from the raw text above):
${JSON.stringify(job.marks_breakdown, null, 2)}

Derive the true mark value for part (${job.part_label}) following the rules in the system prompt.`;
}

async function main() {
  const jobs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const tiers = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  const outfile = process.argv[4];

  const requests = [];
  for (const job of jobs) {
    const model = tiers[job.part_id] === 'hard' ? MODEL_HARD : MODEL_SIMPLE;
    for (const run of [1, 2]) {
      requests.push({
        custom_id: `${job.part_id}__run${run}`,
        params: {
          model,
          max_tokens: 2000,
          system: SYSTEM,
          messages: [{ role: 'user', content: buildUserPrompt(job) }],
        },
      });
    }
  }
  console.log(`Submitting batch of ${requests.length} requests (${jobs.length} jobs x 2 runs)...`);

  const batch = await client.messages.batches.create({ requests });
  console.log('Batch created:', batch.id, 'status:', batch.processing_status);
  fs.writeFileSync(outfile + '.batchid', batch.id);

  // poll
  let status = batch;
  while (status.processing_status !== 'ended') {
    await new Promise(r => setTimeout(r, 15000));
    status = await client.messages.batches.retrieve(batch.id);
    console.log(new Date().toISOString(), 'status:', status.processing_status, JSON.stringify(status.request_counts));
  }

  console.log('Batch ended. Fetching results...');
  const results = {};
  for await (const entry of await client.messages.batches.results(batch.id)) {
    results[entry.custom_id] = entry;
  }
  fs.writeFileSync(outfile, JSON.stringify(results, null, 2));
  console.log(`Wrote ${Object.keys(results).length} results to ${outfile}`);
}

main();
