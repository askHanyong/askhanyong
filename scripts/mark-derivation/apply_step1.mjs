import { supabase } from '../ingest-paper/src/supabaseIngest.js';
import fs from 'node:fs';

const rows = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
let ok = 0, fail = 0;
for (const r of rows) {
  const { error } = await supabase
    .from('question_parts')
    .update({
      marks: r.step1.own_bracket,
      derivation_method: 'paper_explicit',
      derivation_reasoning: [{ source: 'STEP1 paper-bracket parser', paper_bracket: r.step1.own_bracket }],
    })
    .eq('id', r.part_id);
  if (error) { console.error('FAIL', r.part_id, error.message); fail++; }
  else ok++;
}
console.log(`Applied ${ok}, failed ${fail}`);
