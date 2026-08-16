import { supabase } from './db.js';
import { verifyWithSympy } from './verifySympy.js';
import type { GeneratedQuestionJson } from './types.js';

// Explicitly approved for auto-apply (status flip to 'verified' if the re-run
// passes) -- user's instruction #3 for these 2 specific pilot-2 questions.
const AUTO_APPLY_IDS = new Set([
  'ade513fa-c2bb-4593-ba41-cc41df297134', // AA1.9 pilot2 -- k=+-4.60
  '79dedd36-dfd0-461a-b5ad-fb26eab62a61', // AA3.13 pilot2 -- angle 114 deg
]);

// Investigate-only (user's instruction #4 was "check whether", not "apply") --
// re-run and log a new verification row for audit, but leave status alone
// regardless of outcome; report back for the user's own decision.
const INVESTIGATE_ONLY_IDS = new Set([
  'e687c61d-3afd-4402-80e1-ddd30fba3171', // AA1.13 original pilot -- z=2e^{-i pi/3}
  '9232bb2b-6608-465f-9b08-bcd0822c18b1', // AA1.13 original pilot -- w=3-4i
]);

const TARGET_IDS = [...AUTO_APPLY_IDS, ...INVESTIGATE_ONLY_IDS];

async function main() {
  const { data: rows, error } = await supabase
    .from('generated_questions')
    .select('id, status, question_text, proposed_solution, final_answer, section')
    .in('id', TARGET_IDS);
  if (error || !rows) throw new Error(`Fetch failed: ${error?.message}`);

  for (const row of rows) {
    console.log(`\n=== ${row.id} (current status: ${row.status}) ===`);
    const q: GeneratedQuestionJson = {
      section: row.section,
      difficulty: 'medium',
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
    console.log(`  sympy (re-run with fixed prompt): ${result.passed ? 'PASS' : 'FAIL'} -- ${result.note}`);

    const { error: insErr } = await supabase.from('generated_question_verification').insert({
      generated_question_id: row.id,
      method: 'sympy',
      passed: result.passed,
      result: {
        note: result.note,
        stdout: result.stdout,
        stderr: result.stderr,
        script: result.script,
        rerun_reason:
          'Re-verification after fixing verifySympy.ts SYMPY_SYSTEM_PROMPT (rule 4): original FAIL was traced to the LLM-authored check script comparing a full-precision computed value against a stated-precision (rounded) claimed answer using an arbitrary tolerance too tight for the amount of rounding involved, or amplifying that rounding error through a nonlinear operation before comparing. See conversation for the two confirmed cases (k^4 amplification, angle-vs-114deg comparison).',
      },
    });
    if (insErr) {
      console.log(`  FAILED to insert new verification row: ${insErr.message}`);
      continue;
    }

    if (!AUTO_APPLY_IDS.has(row.id)) {
      console.log(`  investigate-only id -- leaving status as ${row.status}, reporting back for manual decision.`);
      continue;
    }

    if (result.passed && row.status === 'flagged') {
      const { error: updErr } = await supabase
        .from('generated_questions')
        .update({ status: 'verified' })
        .eq('id', row.id);
      if (updErr) console.log(`  FAILED to update status: ${updErr.message}`);
      else console.log(`  status: flagged -> verified`);
    } else if (!result.passed) {
      console.log(`  still FAIL after fix -- leaving status as ${row.status}, NOT auto-changing.`);
    } else {
      console.log(`  status already ${row.status}, not touching.`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
