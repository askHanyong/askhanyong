// Re-runs just the 3 Section B specs that failed on the pilot run (all hit the
// old 8000-token cap mid-JSON before it was raised to 16000 for Section B --
// see generate.ts MAX_TOKENS_BY_SECTION). Does not touch the 12 rows already
// inserted successfully; only inserts these 3.
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  fetchSubjectId,
  fetchTopic,
  fetchReferenceParts,
  type TopicRow,
} from './db.js';
import type { PilotResult, QuestionSpec } from './types.js';
import { runOne, renderMarkdown, SECONDARY_CANDIDATES } from './pilotShared.js';

const FAILED_SPECS: Array<{ topicCode: string; spec: QuestionSpec }> = [
  { topicCode: 'AA5.8', spec: { topicCode: 'AA5.8', section: 'B', difficulty: 'hard', level: 'HL', marksRange: [16, 20] } },
  { topicCode: 'AA5.9', spec: { topicCode: 'AA5.9', section: 'B', difficulty: 'medium', level: 'SL', marksRange: [12, 16] } },
  { topicCode: 'AA5.9', spec: { topicCode: 'AA5.9', section: 'B', difficulty: 'hard', level: 'HL', marksRange: [16, 20] } },
];

async function main() {
  const subjectId = await fetchSubjectId('MAA');
  const topicCache = new Map<string, TopicRow>();
  const results: PilotResult[] = [];

  for (const { topicCode, spec } of FAILED_SPECS) {
    if (!topicCache.has(topicCode)) {
      topicCache.set(topicCode, await fetchTopic(topicCode));
    }
    const topic = topicCache.get(topicCode)!;
    const secondaryCandidateCodes = SECONDARY_CANDIDATES[topicCode] ?? [];
    const secondaryCandidateRows = await Promise.all(secondaryCandidateCodes.map((c) => fetchTopic(c)));
    const refs = await fetchReferenceParts(topic.id, 8);

    console.log(`generating ${topicCode} Section ${spec.section} / ${spec.difficulty} / ${spec.level} ...`);
    const result = await runOne(spec, topic, subjectId, secondaryCandidateRows, refs);
    console.log(`  -> ${result.status}${result.error ? ` (${result.error})` : ''}`);
    results.push(result);
  }

  const outDir = '/tmp/claude-0/-home-user-askhanyong/8a784320-b9e5-5fee-88d1-412ba4674873/scratchpad';
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, 'pilot_backfill_section_b_report.md');
  await fs.writeFile(outPath, renderMarkdown(results), 'utf8');
  console.log(`\nWrote report to ${outPath}`);
  console.log(`${results.filter((r) => r.status === 'verified').length}/${results.length} verified.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
