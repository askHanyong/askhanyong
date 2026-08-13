// Re-runs the 5-question spec set for specific topics after a pipeline
// change, to demonstrate the fix against the topics that prompted it. Takes
// topic codes as CLI args, e.g.: tsx src/regenerate.ts AA5.8 AA5.9
import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchSubjectId, fetchTopic, fetchReferenceParts } from './db.js';
import { buildSpecs, runOne, renderMarkdown, SECONDARY_CANDIDATES } from './pilotShared.js';
import type { PilotResult } from './types.js';

async function main() {
  const topicCodes = process.argv.slice(2);
  if (topicCodes.length === 0) {
    console.error('Usage: tsx src/regenerate.ts <TOPIC_CODE> [TOPIC_CODE...]');
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
      process.stdout.write(`  generating Section ${spec.section} / ${spec.difficulty} / ${spec.level} / ${spec.calculatorAllowed ? 'calc' : 'non-calc'} ... `);
      const result = await runOne(spec, topic, subjectId, secondaryCandidateRows, refs);
      console.log(`${result.status}${result.generated.needs_diagram ? ' (diagram: ' + (result.diagram.passed ? 'ok' : 'FAILED') + ')' : ''}`);
      results.push(result);
    }
  }

  const outDir = '/tmp/claude-0/-home-user-askhanyong/8a784320-b9e5-5fee-88d1-412ba4674873/scratchpad';
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `regenerate_${topicCodes.join('_')}_report.md`);
  await fs.writeFile(outPath, renderMarkdown(results), 'utf8');

  console.log(`\nWrote report to ${outPath}`);
  console.log(`${results.filter((r) => r.status === 'verified').length}/${results.length} verified.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
