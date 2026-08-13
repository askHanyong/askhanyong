// Re-runs sympy/independent/diagram verification against the EXISTING stored
// content of specific generated_questions rows (no regeneration) -- used to
// confirm an infra fix (stray "python" line, SVG extraction, missing numpy,
// judge token cap) actually resolves a false-positive flag on the same
// content, rather than just generating different content that happens to pass.
import { supabase } from './db.js';
import { verifyWithSympy } from './verifySympy.js';
import { verifyIndependently } from './verifyIndependent.js';
import { generateDiagram } from './diagram.js';
import type { GeneratedQuestionJson } from './types.js';

async function main() {
  const ids = process.argv.slice(2);
  if (ids.length === 0) {
    console.error('Usage: tsx src/reverify.ts <generated_question_id> [...]');
    process.exit(1);
  }

  for (const id of ids) {
    const { data: row, error } = await supabase
      .from('generated_questions')
      .select('id, section, difficulty, level, calculator_allowed, question_text, proposed_solution, final_answer, needs_diagram, diagram_description')
      .eq('id', id)
      .single();
    if (error || !row) {
      console.error(`  ${id}: failed to fetch (${error?.message ?? 'not found'})`);
      continue;
    }

    const q: GeneratedQuestionJson = {
      section: row.section,
      difficulty: row.difficulty,
      level: row.level,
      calculator_allowed: row.calculator_allowed,
      primary_topic_code: '',
      secondary_topic_codes: [],
      question_text: row.question_text,
      proposed_solution: row.proposed_solution,
      final_answer: row.final_answer,
      command_terms_used: [],
      marks_breakdown: [],
      needs_diagram: row.needs_diagram,
      diagram_description: row.diagram_description,
    };

    console.log(`\n=== ${id} (${row.section}/${row.difficulty}, calc=${row.calculator_allowed}, diagram=${row.needs_diagram}) ===`);

    const [sympyCheck, independentCheck, diagram] = await Promise.all([
      verifyWithSympy(q),
      verifyIndependently(q),
      q.needs_diagram ? generateDiagram(q.diagram_description ?? '', q.question_text) : Promise.resolve({ attempted: false, passed: true, svg: null, note: 'not needed' }),
    ]);

    console.log(`  sympy: ${sympyCheck.passed ? 'PASS' : 'FAIL'} -- ${sympyCheck.note}`);
    console.log(`  independent: ${independentCheck.passed ? 'PASS' : 'FAIL'} -- ${independentCheck.note}`);
    if (q.needs_diagram) console.log(`  diagram: ${diagram.passed ? 'PASS' : 'FAIL'} -- ${diagram.note}`);

    const newStatus = sympyCheck.passed && independentCheck.passed && diagram.passed ? 'verified' : 'flagged';

    // Replace the old verification rows with the fresh results and update status.
    await supabase.from('generated_question_verification').delete().eq('generated_question_id', id);
    await supabase.from('generated_question_verification').insert([
      { generated_question_id: id, method: 'sympy', passed: sympyCheck.passed, result: { note: sympyCheck.note, stdout: sympyCheck.stdout, stderr: sympyCheck.stderr, script: sympyCheck.script } },
      { generated_question_id: id, method: 'llm_independent', passed: independentCheck.passed, result: { note: independentCheck.note, independentAnswer: independentCheck.independentAnswer } },
    ]);
    const updatePayload: Record<string, unknown> = { status: newStatus };
    if (q.needs_diagram && diagram.svg) updatePayload.diagram_svg = diagram.svg;
    await supabase.from('generated_questions').update(updatePayload).eq('id', id);

    console.log(`  -> status updated to ${newStatus}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
