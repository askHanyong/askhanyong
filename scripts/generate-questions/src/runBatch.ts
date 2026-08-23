// Generalizes pilot.ts/pilot2.ts/pilot3.ts into a reusable batch runner --
// the scale-up phase runs ~7 batches over the 56 eligible topics, and a
// fresh hardcoded-topic-list file per batch would just be the same ~40
// lines duplicated 7 times. Same gate as every pilot batch before it:
// generateQuestion -> cheap checks -> sympy + independent-LLM verification
// -> insertGeneratedQuestion with status 'verified'/'flagged' only. Nothing
// is ever auto-published here -- that's a separate, explicit publish step
// after human review, same as the pilot.
//
// Usage: tsx src/runBatch.ts <topic code> [...]
import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchSubjectId, fetchTopic, fetchReferenceParts } from './db.js';
import { buildSpecs, runOne, renderMarkdown, SECONDARY_CANDIDATES } from './pilotShared.js';
import type { PilotResult } from './types.js';

const SCRATCH_DIR = '/tmp/claude-0/-home-user-askhanyong/8a784320-b9e5-5fee-88d1-412ba4674873/scratchpad';

async function main() {
  const topicCodes = process.argv.slice(2);
  if (topicCodes.length === 0) {
    console.error('Usage: tsx src/runBatch.ts <topic code> [...]');
    process.exit(1);
  }

  const subjectId = await fetchSubjectId('MAA');
  const results: PilotResult[] = [];

  for (const code of topicCodes) {
    console.log(`\n=== ${code} ===`);
    const topic = await fetchTopic(code);
    const secondaryCandidateCodes = SECONDARY_CANDIDATES[code] ?? [];
    const secondaryCandidateRows = await Promise.all(secondaryCandidateCodes.map((c) => fetchTopic(c)));
    const refs = await fetchReferenceParts(topic.id, 8);
    console.log(`  fetched ${refs.length} reference parts (level_scope=${topic.level_scope})`);

    const specs = buildSpecs(topic);
    for (const spec of specs) {
      process.stdout.write(`  generating Section ${spec.section} / ${spec.difficulty} / ${spec.level} ... `);
      const result = await runOne(spec, topic, subjectId, secondaryCandidateRows, refs);
      console.log(result.status);
      results.push(result);
    }
  }

  await fs.mkdir(SCRATCH_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(SCRATCH_DIR, `batch_${topicCodes[0]}_to_${topicCodes[topicCodes.length - 1]}_${stamp}.md`);
  await fs.writeFile(outPath, renderMarkdown(results), 'utf8');

  console.log(`\nWrote report to ${outPath}`);
  const verified = results.filter((r) => r.status === 'verified').length;
  console.log(`${verified}/${results.length} verified.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
