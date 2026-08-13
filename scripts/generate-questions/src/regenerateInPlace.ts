// Regenerates the CONTENT of existing generated_questions rows in place
// (same row id, same primary/secondary topics, same section/difficulty/level,
// same calculator_allowed) so the 25 pilot questions produced under the old
// plain-text notation get fresh question_text/proposed_solution/final_answer/
// marks_breakdown under the new LaTeX convention -- unlike regenerate.ts,
// which always INSERTs new rows, this UPDATEs the existing ones.
//
// Usage:
//   tsx src/regenerateInPlace.ts --all
//   tsx src/regenerateInPlace.ts <generated_question_id> [...]
import { supabase, fetchTopic, fetchReferenceParts, fetchTopicIdsByCode } from './db.js';
import { generateQuestion } from './generate.js';
import { verifyWithSympy } from './verifySympy.js';
import { verifyIndependently } from './verifyIndependent.js';
import { generateDiagram } from './diagram.js';
import { buildSpecs, SECONDARY_CANDIDATES } from './pilotShared.js';
import type { QuestionSpec } from './types.js';

interface ExistingRow {
  id: string;
  section: 'A' | 'B';
  difficulty: 'easy' | 'medium' | 'hard';
  level: 'SL' | 'HL';
  calculator_allowed: boolean | null;
  primary_topic_id: string;
  primary_topic_code: string;
}

async function fetchRows(ids: string[] | null): Promise<ExistingRow[]> {
  let query = supabase
    .from('generated_questions')
    .select('id, section, difficulty, level, calculator_allowed, primary_topic_id, syllabus_topics!generated_questions_primary_topic_id_fkey(code)');
  if (ids) query = query.in('id', ids);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch existing rows: ${error.message}`);
  return (data ?? []).map((r: any) => ({
    id: r.id,
    section: r.section,
    difficulty: r.difficulty,
    level: r.level,
    calculator_allowed: r.calculator_allowed,
    primary_topic_id: r.primary_topic_id,
    primary_topic_code: r.syllabus_topics.code,
  }));
}

async function regenerateOne(row: ExistingRow): Promise<{ id: string; status: string; error: string | null }> {
  const topic = await fetchTopic(row.primary_topic_code);
  const template = buildSpecs(topic).find((s) => s.section === row.section && s.difficulty === row.difficulty);
  if (!template) {
    throw new Error(`No spec template matches section=${row.section} difficulty=${row.difficulty} for topic ${row.primary_topic_code}`);
  }
  const spec: QuestionSpec = {
    topicCode: row.primary_topic_code,
    section: row.section,
    difficulty: row.difficulty,
    level: row.level,
    calculatorAllowed: row.calculator_allowed ?? template.calculatorAllowed,
    marksRange: template.marksRange,
  };

  const secondaryCandidateCodes = SECONDARY_CANDIDATES[row.primary_topic_code] ?? [];
  const secondaryCandidateRows = await Promise.all(secondaryCandidateCodes.map((c) => fetchTopic(c)));
  const refs = await fetchReferenceParts(topic.id, 8);

  // generateQuestion already retries once internally on cheap-check failure;
  // one more outer retry here before giving up and leaving the row untouched
  // -- regenerating 25 rows makes a transient bad draw more likely to occur
  // somewhere in the batch, and we'd rather retry than silently skip.
  let question, cheapChecks;
  ({ question, cheapChecks } = await generateQuestion(spec, topic, secondaryCandidateRows, refs));
  if (!cheapChecks.passed) {
    ({ question, cheapChecks } = await generateQuestion(spec, topic, secondaryCandidateRows, refs));
  }
  if (!cheapChecks.passed) {
    throw new Error(`Cheap checks failed twice, leaving row content untouched: ${cheapChecks.notes.join(' | ')}`);
  }

  const [sympyCheck, independentCheck, diagram] = await Promise.all([
    verifyWithSympy(question),
    verifyIndependently(question),
    question.needs_diagram
      ? generateDiagram(question.diagram_description ?? '', question.question_text)
      : Promise.resolve({ attempted: false, passed: true, svg: null, note: 'not needed' }),
  ]);

  const status: 'verified' | 'flagged' = sympyCheck.passed && independentCheck.passed && diagram.passed ? 'verified' : 'flagged';

  const allowedSecondaryCodes = new Set(secondaryCandidateRows.map((t) => t.code));
  const usedSecondaryCodes = question.secondary_topic_codes.filter((c) => allowedSecondaryCodes.has(c));
  const secondaryIdMap = await fetchTopicIdsByCode(usedSecondaryCodes);
  const secondaryIds = usedSecondaryCodes.map((c) => secondaryIdMap.get(c)).filter((v): v is string => !!v);

  const totalMarks = question.marks_breakdown.reduce((acc, m) => acc + m.marks, 0);

  const { error: updateErr } = await supabase
    .from('generated_questions')
    .update({
      secondary_topic_ids: secondaryIds,
      calculator_allowed: question.calculator_allowed,
      question_text: question.question_text,
      proposed_solution: question.proposed_solution,
      final_answer: question.final_answer,
      total_marks: totalMarks,
      marks_breakdown: question.marks_breakdown,
      needs_diagram: question.needs_diagram,
      diagram_description: question.diagram_description,
      diagram_svg: diagram.svg,
      status,
    })
    .eq('id', row.id);
  if (updateErr) throw new Error(`Failed to update generated_questions ${row.id}: ${updateErr.message}`);

  const { error: delErr } = await supabase.from('generated_question_verification').delete().eq('generated_question_id', row.id);
  if (delErr) throw new Error(`Failed to clear old verification rows for ${row.id}: ${delErr.message}`);
  const { error: insErr } = await supabase.from('generated_question_verification').insert([
    { generated_question_id: row.id, method: 'sympy', passed: sympyCheck.passed, result: { note: sympyCheck.note, stdout: sympyCheck.stdout, stderr: sympyCheck.stderr, script: sympyCheck.script } },
    { generated_question_id: row.id, method: 'llm_independent', passed: independentCheck.passed, result: { note: independentCheck.note, independentAnswer: independentCheck.independentAnswer } },
  ]);
  if (insErr) throw new Error(`Failed to insert fresh verification rows for ${row.id}: ${insErr.message}`);

  return { id: row.id, status, error: null };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: tsx src/regenerateInPlace.ts --all | <generated_question_id> [...]');
    process.exit(1);
  }
  const rows = await fetchRows(args[0] === '--all' ? null : args);
  console.log(`Regenerating ${rows.length} row(s)...`);

  let succeeded = 0;
  const failures: Array<{ id: string; error: string }> = [];
  for (const row of rows) {
    process.stdout.write(`  ${row.id} (${row.primary_topic_code}, ${row.section}/${row.difficulty}/${row.level}) ... `);
    try {
      const result = await regenerateOne(row);
      console.log(result.status);
      succeeded++;
    } catch (err) {
      console.log(`FAILED: ${(err as Error).message}`);
      failures.push({ id: row.id, error: (err as Error).message });
    }
  }

  console.log(`\nDone. ${succeeded}/${rows.length} row(s) regenerated.`);
  if (failures.length > 0) {
    console.log(`\n${failures.length} row(s) FAILED and were left with their previous content:`);
    for (const f of failures) console.log(`  ${f.id}: ${f.error}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
