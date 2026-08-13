// Exports all generated_questions (+ verification rows + resolved topic
// codes) to a single JSON file for building a review artifact, without
// routing the (large) content through chat context.
import fs from 'node:fs/promises';
import { supabase } from './db.js';

async function main() {
  const { data: questions, error } = await supabase
    .from('generated_questions')
    .select(
      'id, primary_topic_id, secondary_topic_ids, level, section, difficulty, calculator_allowed, question_text, proposed_solution, final_answer, total_marks, marks_breakdown, needs_diagram, diagram_description, diagram_svg, status, created_at'
    )
    .order('created_at');
  if (error) throw new Error(error.message);

  const { data: topics, error: topicsError } = await supabase.from('syllabus_topics').select('id, code, subtopic_name');
  if (topicsError) throw new Error(topicsError.message);
  const topicById = new Map((topics ?? []).map((t) => [t.id, t]));

  const { data: verifications, error: vError } = await supabase
    .from('generated_question_verification')
    .select('generated_question_id, method, passed, result');
  if (vError) throw new Error(vError.message);
  const verificationsByQuestion = new Map<string, typeof verifications>();
  for (const v of verifications ?? []) {
    const list = verificationsByQuestion.get(v.generated_question_id) ?? [];
    list.push(v);
    verificationsByQuestion.set(v.generated_question_id, list);
  }

  const enriched = (questions ?? []).map((q) => ({
    ...q,
    primary_topic_code: topicById.get(q.primary_topic_id)?.code ?? '?',
    primary_topic_name: topicById.get(q.primary_topic_id)?.subtopic_name ?? '?',
    secondary_topic_codes: (q.secondary_topic_ids ?? []).map((id: string) => topicById.get(id)?.code ?? '?'),
    verifications: verificationsByQuestion.get(q.id) ?? [],
  }));

  const outPath = '/tmp/claude-0/-home-user-askhanyong/8a784320-b9e5-5fee-88d1-412ba4674873/scratchpad/generated_questions_export.json';
  await fs.writeFile(outPath, JSON.stringify(enriched, null, 2), 'utf8');
  console.log(`Wrote ${enriched.length} questions to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
