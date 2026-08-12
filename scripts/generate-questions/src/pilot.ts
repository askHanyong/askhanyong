import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchSubjectId, fetchTopic, fetchReferenceParts } from './db.js';
import { buildSpecs, runOne, renderMarkdown, SECONDARY_CANDIDATES } from './pilotShared.js';
import type { PilotResult } from './types.js';

async function main() {
  const topicCodes = ['AA5.8', 'AA5.9', 'AA1.13'];
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

  const outDir = '/tmp/claude-0/-home-user-askhanyong/8a784320-b9e5-5fee-88d1-412ba4674873/scratchpad';
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, 'pilot_question_generation_report.md');
  await fs.writeFile(outPath, renderMarkdown(results), 'utf8');

  console.log(`\nWrote report to ${outPath}`);
  const verified = results.filter((r) => r.status === 'verified').length;
  console.log(`${verified}/${results.length} verified.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
