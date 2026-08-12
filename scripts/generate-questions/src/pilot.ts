import fs from 'node:fs/promises';
import path from 'node:path';
import {
  fetchSubjectId,
  fetchTopic,
  fetchTopicIdsByCode,
  fetchReferenceParts,
  insertGeneratedQuestion,
  type TopicRow,
} from './db.js';
import { generateQuestion } from './generate.js';
import { verifyWithSympy } from './verifySympy.js';
import { verifyIndependently } from './verifyIndependent.js';
import type { PilotResult, QuestionSpec } from './types.js';

const SECONDARY_CANDIDATES: Record<string, string[]> = {
  'AA5.8': ['AA5.6', 'AA5.4', 'AA2.4'],
  'AA5.9': ['AA5.11', 'AA5.6', 'AA5.7'],
  'AA1.13': ['AA1.14', 'AA1.12'],
};

function buildSpecs(topic: TopicRow): QuestionSpec[] {
  const isAhlOnly = topic.level_scope === 'AHL';
  const commonLevel: 'SL' | 'HL' = isAhlOnly ? 'HL' : 'SL';
  return [
    { topicCode: topic.code, section: 'A', difficulty: 'easy', level: commonLevel, marksRange: [3, 4] },
    { topicCode: topic.code, section: 'A', difficulty: 'medium', level: commonLevel, marksRange: [4, 5] },
    { topicCode: topic.code, section: 'A', difficulty: 'hard', level: 'HL', marksRange: [5, 6] },
    { topicCode: topic.code, section: 'B', difficulty: 'medium', level: commonLevel, marksRange: [12, 16] },
    { topicCode: topic.code, section: 'B', difficulty: 'hard', level: 'HL', marksRange: [16, 20] },
  ];
}

async function runOne(
  spec: QuestionSpec,
  topic: TopicRow,
  subjectId: string,
  secondaryCandidateRows: TopicRow[],
  refs: Awaited<ReturnType<typeof fetchReferenceParts>>
): Promise<PilotResult> {
  const base: Omit<PilotResult, 'generated' | 'cheapChecks'> = {
    spec,
    sympyCheck: { passed: false, script: '', stdout: '', stderr: '', note: 'not run' },
    independentCheck: { passed: false, independentAnswer: '', note: 'not run' },
    status: 'flagged',
    generatedQuestionId: null,
    error: null,
  } as PilotResult;

  try {
    const { question, cheapChecks, regenerated } = await generateQuestion(spec, topic, secondaryCandidateRows, refs);

    if (!cheapChecks.passed) {
      return {
        ...base,
        generated: question,
        cheapChecks: { ...cheapChecks, regenerated },
        status: 'flagged',
        error: `Cheap checks failed after ${regenerated ? 'one regeneration' : 'generation'}: ${cheapChecks.notes.join(' | ')}`,
      };
    }

    const [sympyCheck, independentCheck] = await Promise.all([
      verifyWithSympy(question),
      verifyIndependently(question),
    ]);

    const status: 'verified' | 'flagged' = sympyCheck.passed && independentCheck.passed ? 'verified' : 'flagged';

    const allowedSecondaryCodes = new Set(secondaryCandidateRows.map((t) => t.code));
    const usedSecondaryCodes = question.secondary_topic_codes.filter((c) => allowedSecondaryCodes.has(c));
    const secondaryIdMap = await fetchTopicIdsByCode(usedSecondaryCodes);
    const secondaryIds = usedSecondaryCodes.map((c) => secondaryIdMap.get(c)).filter((v): v is string => !!v);

    const totalMarks = question.marks_breakdown.reduce((acc, m) => acc + m.marks, 0);

    const generatedQuestionId = await insertGeneratedQuestion({
      subject_id: subjectId,
      primary_topic_id: topic.id,
      secondary_topic_ids: secondaryIds,
      level: question.level,
      section: question.section,
      difficulty: question.difficulty,
      question_text: question.question_text,
      proposed_solution: question.proposed_solution,
      final_answer: question.final_answer,
      total_marks: totalMarks,
      marks_breakdown: question.marks_breakdown,
      status,
      verifications: [
        { method: 'sympy', passed: sympyCheck.passed, result: { note: sympyCheck.note, stdout: sympyCheck.stdout, stderr: sympyCheck.stderr, script: sympyCheck.script } },
        { method: 'llm_independent', passed: independentCheck.passed, result: { note: independentCheck.note, independentAnswer: independentCheck.independentAnswer } },
      ],
    });

    return {
      ...base,
      generated: question,
      cheapChecks: { ...cheapChecks, regenerated },
      sympyCheck,
      independentCheck,
      status,
      generatedQuestionId,
    };
  } catch (err) {
    return {
      ...base,
      generated: {
        section: spec.section,
        difficulty: spec.difficulty,
        level: spec.level,
        primary_topic_code: spec.topicCode,
        secondary_topic_codes: [],
        question_text: '(generation failed)',
        proposed_solution: '',
        final_answer: '',
        command_terms_used: [],
        marks_breakdown: [],
      },
      cheapChecks: { passed: false, notes: [(err as Error).message], regenerated: false },
      status: 'flagged',
      error: (err as Error).message,
    };
  }
}

function renderMarkdown(results: PilotResult[]): string {
  const lines: string[] = ['# Pilot question generation report', ''];
  const byTopic = new Map<string, PilotResult[]>();
  for (const r of results) {
    const list = byTopic.get(r.spec.topicCode) ?? [];
    list.push(r);
    byTopic.set(r.spec.topicCode, list);
  }

  const verifiedCount = results.filter((r) => r.status === 'verified').length;
  lines.push(`**${verifiedCount}/${results.length} verified** (both sympy and independent-LLM checks passed). The rest are \`flagged\` for manual review -- nothing was auto-published.`, '');

  for (const [code, list] of byTopic) {
    lines.push(`## ${code}`, '');
    for (const r of list) {
      const g = r.generated;
      lines.push(`### Section ${r.spec.section} / ${r.spec.difficulty} / ${r.spec.level} -- status: **${r.status}**`, '');
      if (r.error) lines.push(`> Error: ${r.error}`, '');
      lines.push(`**Primary topic:** ${g.primary_topic_code}${g.secondary_topic_codes.length ? ` | **Secondary:** ${g.secondary_topic_codes.join(', ')}` : ''}`);
      lines.push(`**Marks:** ${g.marks_breakdown.reduce((a, m) => a + m.marks, 0)}  |  **Generated question id:** ${r.generatedQuestionId ?? 'not inserted'}`, '');
      lines.push('**Question:**', '', '```', g.question_text, '```', '');
      lines.push('**Proposed solution:**', '', '```', g.proposed_solution, '```', '');
      lines.push(`**Final answer:** ${g.final_answer}`, '');
      lines.push('**Marks breakdown:**', '');
      for (const m of g.marks_breakdown) lines.push(`- ${m.note} (${m.marks}): ${m.desc}`);
      lines.push('');
      lines.push(`**Cheap checks:** ${r.cheapChecks.passed ? 'PASS' : 'FAIL'}${r.cheapChecks.regenerated ? ' (after 1 regeneration)' : ''}${r.cheapChecks.notes.length ? ` -- ${r.cheapChecks.notes.join(' | ')}` : ''}`);
      lines.push(`**Sympy check:** ${r.sympyCheck.passed ? 'PASS' : 'FAIL'} -- ${r.sympyCheck.note}`);
      lines.push(`**Independent LLM check:** ${r.independentCheck.passed ? 'PASS' : 'FAIL'} -- independent answer: \`${r.independentCheck.independentAnswer}\` -- ${r.independentCheck.note}`);
      lines.push('', '---', '');
    }
  }
  return lines.join('\n');
}

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
