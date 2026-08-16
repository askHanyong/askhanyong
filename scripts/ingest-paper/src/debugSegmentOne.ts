import { segmentMarkscheme } from './claudeSegment.js';
import { supabase } from './supabaseIngest.js';
import type { PaperSegmentation } from './types.js';
import fs from 'node:fs';

function mkPart(part_label: string, order_index: number) {
  return { part_label, part_text: '', image_refs: [], marks: 0, command_term: null, depends_on_part_label: null, order_index };
}

async function buildPaperSeg(paperId: string): Promise<PaperSegmentation> {
  const { data: questions } = await supabase.from('questions').select('id, question_number').eq('paper_id', paperId);
  const qIdToNumber = new Map((questions as any[]).map((q) => [q.id, q.question_number]));
  const { data: parts } = await supabase.from('question_parts').select('question_id, part_label, order_index').in('question_id', [...qIdToNumber.keys()]);
  const byQuestion = new Map<number, { part_label: string; order_index: number }[]>();
  for (const row of parts as any[]) {
    const qn = qIdToNumber.get(row.question_id)!;
    if (!byQuestion.has(qn)) byQuestion.set(qn, []);
    byQuestion.get(qn)!.push({ part_label: row.part_label, order_index: row.order_index });
  }
  const result = [...byQuestion.entries()].sort((a, b) => a[0] - b[0]).map(([question_number, ps]) => ({
    question_number, total_marks: null,
    parts: ps.sort((a, b) => a.order_index - b.order_index).map((p) => mkPart(p.part_label, p.order_index)),
  }));
  return { questions: result };
}

const pdfPath = process.argv[2];
const { data: paperRow } = await supabase.from('papers').select('id')
  .eq('level', 'SL').eq('year', 2021).eq('session', 'Nov').eq('time_zone', 'TZ1').eq('paper_number', 1).single();
const paperSeg = await buildPaperSeg(paperRow!.id);
console.log('paper structure:', JSON.stringify(paperSeg.questions.map(q => ({n: q.question_number, parts: q.parts.map(p=>p.part_label)}))));
try {
  const result = await segmentMarkscheme(pdfPath, paperSeg);
  fs.writeFileSync('debug_segment_output.json', JSON.stringify(result, null, 2));
  console.log('SUCCESS');
} catch (err) {
  console.error('FAILED:', (err as Error).message);
}
