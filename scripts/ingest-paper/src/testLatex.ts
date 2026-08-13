// Dry-run test of the updated LaTeX notation rules -- segments a paper AND its
// markscheme (no DB writes, no storage uploads) so we can inspect part_text /
// markscheme_text / marks_breakdown[].desc for correct $...$ / $$...$$ usage
// and valid LaTeX before running this at scale.
import { segmentPaper, segmentMarkscheme } from './claudeSegment.js';

async function main() {
  const paperPath = process.argv[2];
  const msPath = process.argv[3];
  if (!paperPath || !msPath) {
    console.error('Usage: tsx src/testLatex.ts <paper.pdf> <markscheme.pdf>');
    process.exit(1);
  }

  console.log('Segmenting paper...');
  const paperSeg = await segmentPaper(paperPath);
  console.log(`  found ${paperSeg.questions.length} question(s).`);

  console.log('Segmenting markscheme...');
  const msSeg = await segmentMarkscheme(msPath, paperSeg);
  console.log(`  found ${msSeg.questions.length} question(s).`);

  console.log('\n=== SAMPLE part_text (first 4 parts) ===');
  const allParts = paperSeg.questions.flatMap((q) => q.parts.map((p) => ({ q: q.question_number, ...p })));
  for (const p of allParts.slice(0, 4)) {
    console.log(`\n--- Q${p.q}${p.part_label ? ` (${p.part_label})` : ''} ---`);
    console.log(p.part_text);
  }

  console.log('\n\n=== SAMPLE markscheme_text + marks_breakdown (first 4 parts) ===');
  const allMsParts = msSeg.questions.flatMap((q) => q.parts.map((p) => ({ q: q.question_number, ...p })));
  for (const p of allMsParts.slice(0, 4)) {
    console.log(`\n--- Q${p.q}${p.part_label ? ` (${p.part_label})` : ''} ---`);
    console.log('markscheme_text:', p.markscheme_text);
    console.log('marks_breakdown:', JSON.stringify(p.marks_breakdown, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
