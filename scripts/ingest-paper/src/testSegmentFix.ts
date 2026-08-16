// One-off test harness for the markscheme_text verbatim-codes prompt fix.
// Re-runs segmentMarkscheme() against an already-ingested markscheme PDF
// (no DB writes) so the new output can be compared against what's currently
// stored, before the fix is trusted on any new ingestion.
import { segmentMarkscheme } from './claudeSegment.js';
import type { PaperSegmentation } from './types.js';
import fs from 'node:fs';

// SL 2022 Nov TZ0 P2 -- confirmed paper structure pulled from question_parts.
const paperSeg: PaperSegmentation = {
  questions: [
    { question_number: 1, total_marks: null, parts: ['a', 'b', 'c'].map(mkPart) },
    { question_number: 2, total_marks: null, parts: ['a', 'b'].map(mkPart) },
    { question_number: 3, total_marks: null, parts: ['a', 'b', 'c'].map(mkPart) },
    { question_number: 4, total_marks: null, parts: [''].map(mkPart) },
    { question_number: 5, total_marks: null, parts: [''].map(mkPart) },
    { question_number: 6, total_marks: null, parts: [''].map(mkPart) },
    { question_number: 7, total_marks: null, parts: ['a', 'b', 'c', 'd', 'e'].map(mkPart) },
    { question_number: 8, total_marks: null, parts: ['a', 'b.i', 'b.ii', 'c'].map(mkPart) },
    { question_number: 9, total_marks: null, parts: ['a', 'b', 'c.i', 'c.ii', 'd'].map(mkPart) },
  ],
};

function mkPart(part_label: string, order_index: number) {
  return { part_label, part_text: '', image_refs: [], marks: 0, command_term: null, depends_on_part_label: null, order_index };
}

const markschemePath = process.argv[2];
const result = await segmentMarkscheme(markschemePath, paperSeg);
fs.writeFileSync('segment_fix_test_output.json', JSON.stringify(result, null, 2));

const q6 = result.questions.find((q) => q.question_number === 6);
console.log('=== Q6 (undivided) new TEXT output ===');
console.log(q6?.parts[0]?.markscheme_text);
console.log('\n=== Q6 new BREAKDOWN ===');
console.log(JSON.stringify(q6?.parts[0]?.marks_breakdown, null, 2));
