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
  const results = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  const resultsById = Object.fromEntries(results.map(r => [r.part_id, r]));

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const perJob = [];

  for (const job of jobs) {
    const userPrompt = buildUserPrompt(job);
    const inputCount = await client.messages.countTokens({
      model: MODEL,
      system: SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const inputTokensPerCall = inputCount.input_tokens;

    const r = resultsById[job.part_id];
    const out1 = JSON.stringify(r.run1);
    const out2 = JSON.stringify(r.run2);
    const outCount1 = await client.messages.countTokens({
      model: MODEL,
      messages: [{ role: 'user', content: 'x' }, { role: 'assistant', content: out1 }],
    });
    const outCount2 = await client.messages.countTokens({
      model: MODEL,
      messages: [{ role: 'user', content: 'x' }, { role: 'assistant', content: out2 }],
    });
    // subtract the 1-token placeholder user turn's contribution isn't separable via this endpoint,
    // so instead count output text alone as a standalone user-role message (tokenizer is symmetric
    // for plain text regardless of role) to get a clean, exact count of the response text itself.
    const outAlone1 = await client.messages.countTokens({ model: MODEL, messages: [{ role: 'user', content: out1 }] });
    const outAlone2 = await client.messages.countTokens({ model: MODEL, messages: [{ role: 'user', content: out2 }] });

    // two calls per job (run1, run2), each with identical input prompt
    totalInputTokens += inputTokensPerCall * 2;
    totalOutputTokens += outAlone1.input_tokens + outAlone2.input_tokens;

    perJob.push({
      part_id: job.part_id,
      input_tokens_per_call: inputTokensPerCall,
      output_tokens_run1: outAlone1.input_tokens,
      output_tokens_run2: outAlone2.input_tokens,
    });
    process.stdout.write('.');
  }
  console.log('');
  console.log('Total input tokens (156 calls, exact via tokenizer):', totalInputTokens);
  console.log('Total output tokens (156 calls, exact via tokenizer):', totalOutputTokens);
  fs.writeFileSync(process.argv[4], JSON.stringify({ totalInputTokens, totalOutputTokens, perJob }, null, 2));
}

main();
