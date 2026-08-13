// Dry-run tool: generates one question via generateQuestion() and prints the
// result -- no DB writes (fetchTopic/fetchReferenceParts are reads only).
// Usage: tsx src/testGenerate.ts <topic_code> <A|B> <easy|medium|hard> <SL|HL> <true|false>
import { fetchTopic, fetchReferenceParts } from './db.js';
import { generateQuestion } from './generate.js';
import type { QuestionSpec } from './types.js';

async function main() {
  const [topicCode, sectionArg, difficultyArg, levelArg, calcArg] = process.argv.slice(2);
  if (!topicCode) throw new Error('Usage: tsx src/testGenerate.ts <topic_code> [A|B] [easy|medium|hard] [SL|HL] [true|false]');

  const topic = await fetchTopic(topicCode);
  const refs = await fetchReferenceParts(topic.id);

  const spec: QuestionSpec = {
    topicCode: topic.code,
    section: (sectionArg as 'A' | 'B') ?? 'B',
    difficulty: (difficultyArg as 'easy' | 'medium' | 'hard') ?? 'medium',
    level: (levelArg as 'SL' | 'HL') ?? (topic.level_scope === 'AHL' ? 'HL' : 'SL'),
    calculatorAllowed: calcArg === undefined ? true : calcArg === 'true',
    marksRange: (sectionArg ?? 'B') === 'A' ? [4, 5] : [12, 16],
  };

  console.log(`Generating: ${topic.code} (${topic.subtopic_name}) -- Section ${spec.section}, ${spec.difficulty}, ${spec.level}, calculator_allowed=${spec.calculatorAllowed}`);
  console.log(`${refs.length} reference part(s) found.\n`);

  const { question, cheapChecks, regenerated } = await generateQuestion(spec, topic, [], refs);

  console.log(`Cheap checks: ${cheapChecks.passed ? 'PASS' : 'FAIL'}${regenerated ? ' (after 1 regeneration)' : ''}`);
  if (!cheapChecks.passed) console.log(`  Notes: ${cheapChecks.notes.join(' | ')}`);

  console.log('\n=== question_text ===\n' + question.question_text);
  console.log('\n=== proposed_solution ===\n' + question.proposed_solution);
  console.log('\n=== final_answer ===\n' + question.final_answer);
  console.log('\n=== marks_breakdown ===');
  for (const m of question.marks_breakdown) console.log(`  ${m.note} (${m.marks}): ${m.desc}`);
  console.log(`\n=== needs_diagram: ${question.needs_diagram} ===`);
  if (question.needs_diagram) console.log(question.diagram_description);

  const fs = await import('node:fs/promises');
  const outPath = '/tmp/claude-0/-home-user-askhanyong/8a784320-b9e5-5fee-88d1-412ba4674873/scratchpad/test_generate_result.json';
  await fs.writeFile(outPath, JSON.stringify(question, null, 2), 'utf8');
  console.log(`\nWrote full result to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
