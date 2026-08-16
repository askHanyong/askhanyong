// Builds the job list for rederive_73.mjs by pulling CURRENT (post-backfill)
// markscheme_text/marks_breakdown plus sibling context from the DB, for the
// 73 flagged confirmed part_ids.
import { supabase } from '../ingest-paper/src/supabaseIngest.js';
import fs from 'node:fs';

const idsFile = process.argv[2];
const outfile = process.argv[3];
const ids = JSON.parse(fs.readFileSync(idsFile, 'utf8'));

const jobs = [];
for (const part_id of ids) {
  const { data: part, error } = await supabase
    .from('question_parts')
    .select('id, part_label, marks, question_id, questions(question_number, total_marks, paper_id, papers(level, year, session, time_zone, paper_number))')
    .eq('id', part_id)
    .single();
  if (error || !part) { console.error('FAIL lookup', part_id, error?.message); continue; }

  const { data: msPart } = await supabase.from('markscheme_parts').select('markscheme_text, marks_breakdown').eq('question_part_id', part_id).single();

  const { data: siblings } = await supabase
    .from('question_parts')
    .select('part_label, marks, id')
    .eq('question_id', part.question_id)
    .neq('id', part_id);

  const q = part.questions;
  const p = q.papers;
  jobs.push({
    part_id,
    paper_label: `${p.level}${String(p.year).slice(2)}${p.session}${p.time_zone}P${p.paper_number}`,
    question_number: q.question_number,
    question_max_mark: q.total_marks,
    part_label: part.part_label,
    markscheme_text: msPart.markscheme_text,
    marks_breakdown: msPart.marks_breakdown,
    currently_stored_marks: part.marks,
    other_siblings_in_question: (siblings || []).map((s) => ({ part_label: s.part_label, marks: s.marks })),
  });
}

fs.writeFileSync(outfile, JSON.stringify(jobs, null, 2));
console.log(`Wrote ${jobs.length} jobs to ${outfile}`);
