// Re-runs ONLY the secondary-topic tagging step against the EXISTING
// question_text/proposed_solution of already-generated rows -- imports the
// real production constants/functions from generate.ts so this is a
// faithful test of the merged mechanism, not a re-typed approximation that
// can silently drift from it. Read-only: does not touch generated_questions
// or any other table. Usage: tsx src/retagSecondaryDryRun.ts <id> [...]
import { supabase, fetchTopicsByCode } from './db.js';
import { callForDelimitedText } from './claudeClient.js';
import {
  SECONDARY_TOPIC_JUSTIFICATION_RULE,
  SECONDARY_TOPICS_FORMAT_BLOCK,
  SECONDARY_TOPICS_CRITICAL_NOTE,
  parseSecondaryTopics,
  stateAndCodeAgree,
} from './generate.js';

const SYSTEM_PROMPT = `You are re-tagging an EXISTING, already-written IB Diploma Programme Mathematics: Analysis and Approaches (AA) exam-style question with secondary syllabus topics. You did NOT write this question and must not edit it -- your only job is to decide whether the question, as written, genuinely also tests a second syllabus point besides its stated primary topic.

${SECONDARY_TOPIC_JUSTIFICATION_RULE}

Return your answer in this exact delimited plain-text format -- NOT JSON, no markdown fences, no prose outside the markers:

${SECONDARY_TOPICS_FORMAT_BLOCK}
@@@END@@@

Do not add any text before @@@SECONDARY_TOPICS@@@ or after @@@END@@@.

${SECONDARY_TOPICS_CRITICAL_NOTE}`;

async function main() {
  const ids = process.argv.slice(2);
  if (ids.length === 0) {
    console.error('Usage: tsx src/retagSecondaryDryRun.ts <generated_question_id> [...]');
    process.exit(1);
  }

  const { data: rows, error } = await supabase
    .from('generated_questions')
    .select('id, question_text, proposed_solution, primary_topic_id, syllabus_topics!generated_questions_primary_topic_id_fkey(code, subtopic_name)')
    .in('id', ids);
  if (error) throw new Error(`Failed to fetch rows: ${error.message}`);
  if (!rows || rows.length !== ids.length) {
    const found = new Set((rows ?? []).map((r: any) => r.id));
    const missing = ids.filter((id) => !found.has(id));
    throw new Error(`Expected ${ids.length} rows, got ${rows?.length ?? 0}. Missing: ${missing.join(', ')}`);
  }
  const byId = new Map((rows as any[]).map((r) => [r.id, r]));

  const results: Array<{ id: string; primaryCode: string; entries: ReturnType<typeof parseSecondaryTopics> }> = [];

  for (const id of ids) {
    const row = byId.get(id);
    const primaryCode = row.syllabus_topics.code;
    const primaryName = row.syllabus_topics.subtopic_name;
    const userPrompt = [
      `Primary topic (already assigned, do not change): ${primaryCode} -- ${primaryName}.`,
      `QUESTION TEXT:\n${row.question_text}`,
      `PROPOSED SOLUTION:\n${row.proposed_solution}`,
      `\nDecide whether this question also genuinely tests a second syllabus point, per the secondary-topic justification rule in the system prompt. Respond with ONLY the delimited-format answer -- start with @@@SECONDARY_TOPICS@@@ and end with @@@END@@@.`,
    ].join('\n\n');

    process.stdout.write(`Tagging ${id} (primary ${primaryCode}) ... `);
    const raw = await callForDelimitedText(SYSTEM_PROMPT, userPrompt, 8000);
    const sectionMatch = /@@@SECONDARY_TOPICS@@@\r?\n([\s\S]*?)\r?\n@@@END@@@/.exec(raw);
    if (!sectionMatch) throw new Error(`Malformed response for ${id}, missing markers:\n${raw.slice(0, 1500)}`);
    const entries = parseSecondaryTopics(sectionMatch[1]);
    console.log(entries.length === 0 ? 'none proposed' : entries.map((e) => e.code).join(', '));
    results.push({ id, primaryCode, entries });
  }

  // Deterministic cross-check pass (the second half of the fix): resolve
  // each proposed code's real subtopic_name and check it against what the
  // model stated for that code, same as pilotShared.ts's runOne() does
  // before accepting a code for insertion.
  const allCodes = [...new Set(results.flatMap((r) => r.entries.map((e) => e.code)))];
  const realTopics = await fetchTopicsByCode(allCodes);

  console.log('\n\n=== FULL RESULTS ===\n');
  for (const r of results) {
    console.log(`--- ${r.id} (primary ${r.primaryCode}) ---`);
    if (r.entries.length === 0) {
      console.log('none proposed');
    } else {
      for (const e of r.entries) {
        const realTopic = realTopics.get(e.code);
        const crossCheck = !realTopic
          ? 'FAIL -- code does not resolve to a real syllabus_topics row'
          : stateAndCodeAgree(e.statedName, realTopic.subtopic_name)
            ? `PASS (real name: "${realTopic.subtopic_name}")`
            : `FAIL -- stated name does not match real name "${realTopic.subtopic_name}"`;
        console.log(`  code: ${e.code}`);
        console.log(`  stated name: ${e.statedName}`);
        console.log(`  justification: ${e.justification}`);
        console.log(`  cross-check: ${crossCheck}`);
      }
    }
    console.log('');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
