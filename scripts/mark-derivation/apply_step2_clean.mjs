import { supabase } from '../ingest-paper/src/supabaseIngest.js';
import fs from 'node:fs';

const rows = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const results = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const resultsById = Object.fromEntries(results.map((r) => [r.part_id, r]));

let ok = 0, fail = 0;
for (const row of rows) {
  const r = resultsById[row.part_id];
  const { error } = await supabase
    .from('question_parts')
    .update({
      marks: row.derived_value,
      derivation_method: 'markscheme_derived_confirmed',
      derivation_reasoning: [
        { run: 1, method_used: r.run1.method_used, branch_chosen: r.run1.branch_chosen, steps: r.run1.steps, derived_value: r.run1.derived_value, tally_notes: r.run1.tally_notes },
        { run: 2, method_used: r.run2.method_used, branch_chosen: r.run2.branch_chosen, steps: r.run2.steps, derived_value: r.run2.derived_value, tally_notes: r.run2.tally_notes },
      ],
    })
    .eq('id', row.part_id);
  if (error) { console.error('FAIL', row.part_id, error.message); fail++; }
  else ok++;
}
console.log(`Applied ${ok}, failed ${fail}`);
