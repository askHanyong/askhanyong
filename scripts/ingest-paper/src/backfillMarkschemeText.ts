// Batched markscheme_text backfill: re-runs segmentMarkscheme() (now fixed to
// keep inline codes in TEXT) against each paper's already-downloaded
// markscheme PDF and overwrites ONLY markscheme_text for the target part_ids
// -- marks, marks_breakdown, derivation_method, derivation_reasoning are left
// untouched (marks_breakdown is already verified reliable; this backfill is
// scoped to the free-text field only).
import { segmentMarkscheme } from './claudeSegment.js';
import { supabase } from './supabaseIngest.js';
import type { PaperSegmentation } from './types.js';
import fs from 'node:fs';

interface TargetSpec {
  paper: { level: string; year: number; session: string; time_zone: string; paper_number: number };
  markscheme_pdf_path: string; // local path, already downloaded
  targets: { part_id: string; question_number: number; part_label: string }[];
}

function mkPart(part_label: string, order_index: number) {
  return { part_label, part_text: '', image_refs: [], marks: 0, command_term: null, depends_on_part_label: null, order_index };
}

async function buildPaperSeg(paperId: string): Promise<PaperSegmentation> {
  const { data: questions, error: qErr } = await supabase
    .from('questions')
    .select('id, question_number')
    .eq('paper_id', paperId);
  if (qErr) throw qErr;
  const qIdToNumber = new Map((questions as any[]).map((q) => [q.id, q.question_number]));

  const { data: parts, error: pErr } = await supabase
    .from('question_parts')
    .select('question_id, part_label, order_index')
    .in('question_id', [...qIdToNumber.keys()]);
  if (pErr) throw pErr;

  const byQuestion = new Map<number, { part_label: string; order_index: number }[]>();
  for (const row of parts as any[]) {
    const qn = qIdToNumber.get(row.question_id)!;
    if (!byQuestion.has(qn)) byQuestion.set(qn, []);
    byQuestion.get(qn)!.push({ part_label: row.part_label, order_index: row.order_index });
  }
  const result = [...byQuestion.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([question_number, ps]) => ({
      question_number,
      total_marks: null,
      parts: ps.sort((a, b) => a.order_index - b.order_index).map((p) => mkPart(p.part_label, p.order_index)),
    }));
  return { questions: result };
}

async function backfillOne(spec: TargetSpec, apply: boolean) {
  const { level, year, session, time_zone, paper_number } = spec.paper;
  const { data: paperRow, error: paperErr } = await supabase
    .from('papers')
    .select('id')
    .eq('level', level).eq('year', year).eq('session', session).eq('time_zone', time_zone).eq('paper_number', paper_number)
    .single();
  if (paperErr || !paperRow) throw new Error(`Paper lookup failed: ${JSON.stringify(spec.paper)} -- ${paperErr?.message}`);

  const paperSeg = await buildPaperSeg(paperRow.id);
  console.log(`[${level}${year}${session}${time_zone}P${paper_number}] segmenting (${paperSeg.questions.length} questions)...`);
  const result = await segmentMarkscheme(spec.markscheme_pdf_path, paperSeg);

  const report: any[] = [];
  for (const t of spec.targets) {
    const q = result.questions.find((q) => q.question_number === t.question_number);
    const p = q?.parts.find((p) => p.part_label === t.part_label);
    if (!p) {
      report.push({ part_id: t.part_id, question_number: t.question_number, part_label: t.part_label, status: 'NOT_FOUND' });
      continue;
    }
    report.push({
      part_id: t.part_id,
      question_number: t.question_number,
      part_label: t.part_label,
      status: 'ok',
      new_text_preview: p.markscheme_text.slice(0, 200),
    });
    if (apply) {
      const { error: updErr } = await supabase
        .from('markscheme_parts')
        .update({ markscheme_text: p.markscheme_text })
        .eq('question_part_id', t.part_id);
      if (updErr) throw updErr;
    }
  }
  return report;
}

async function main() {
  const specsFile = process.argv[2];
  const apply = process.argv[3] === 'apply';
  const specs: TargetSpec[] = JSON.parse(fs.readFileSync(specsFile, 'utf8'));
  const allReports: Record<string, any> = {};
  for (const spec of specs) {
    const key = `${spec.paper.level}${spec.paper.year}${spec.paper.session}${spec.paper.time_zone}P${spec.paper.paper_number}`;
    try {
      allReports[key] = await backfillOne(spec, apply);
      console.log(`  -> ${allReports[key].length} parts ${apply ? 'updated' : 'previewed'}`);
    } catch (err) {
      console.error(`  -> FAILED: ${(err as Error).message}`);
      allReports[key] = { error: String(err) };
    }
  }
  fs.writeFileSync('backfill_report.json', JSON.stringify(allReports, null, 2));
  console.log(`Done. Wrote backfill_report.json (apply=${apply})`);
}

main();
