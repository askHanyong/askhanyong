import { supabase } from './db.js';
import { verifyWithSympy } from './verifySympy.js';
import type { GeneratedQuestionJson } from './types.js';

const ID = '79dedd36-dfd0-461a-b5ad-fb26eab62a61';

async function main() {
  const { data: row, error } = await supabase
    .from('generated_questions')
    .select('id, status, question_text, proposed_solution, final_answer, section')
    .eq('id', ID)
    .single();
  if (error || !row) throw new Error(`Fetch failed: ${error?.message}`);

  const q: GeneratedQuestionJson = {
    section: row.section,
    difficulty: 'hard',
    level: 'HL',
    calculator_allowed: true,
    primary_topic_code: '',
    secondary_topic_codes: [],
    question_text: row.question_text,
    proposed_solution: row.proposed_solution,
    final_answer: row.final_answer,
    command_terms_used: [],
    marks_breakdown: [],
    needs_diagram: false,
    diagram_description: null,
  };

  const result = await verifyWithSympy(q);
  console.log(`sympy re-run #2 (sharpened prompt): ${result.passed ? 'PASS' : 'FAIL'} -- ${result.note}`);

  const { error: insErr } = await supabase.from('generated_question_verification').insert({
    generated_question_id: ID,
    method: 'sympy',
    passed: result.passed,
    result: {
      note: result.note,
      stdout: result.stdout,
      stderr: result.stderr,
      script: result.script,
      rerun_reason:
        'Second re-verification attempt after sharpening verifySympy.ts rule 4 with a worked 114deg/3sf example (first re-run after the initial fix still picked tolerance 0.05).',
    },
  });
  if (insErr) throw new Error(`Insert failed: ${insErr.message}`);

  if (result.passed && row.status === 'flagged') {
    const { error: updErr } = await supabase.from('generated_questions').update({ status: 'verified' }).eq('id', ID);
    if (updErr) throw new Error(`Status update failed: ${updErr.message}`);
    console.log('status: flagged -> verified');
  } else if (!result.passed) {
    console.log('still FAIL -- leaving status as flagged.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
