import {
  fetchTopicIdsByCode,
  insertGeneratedQuestion,
  type TopicRow,
  type ReferencePart,
} from './db.js';
import { generateQuestion } from './generate.js';
import { verifyWithSympy } from './verifySympy.js';
import { verifyIndependently } from './verifyIndependent.js';
import { generateDiagram } from './diagram.js';
import type { DiagramResult, PilotResult, QuestionSpec } from './types.js';

export const SECONDARY_CANDIDATES: Record<string, string[]> = {
  'AA5.8': ['AA5.6', 'AA5.4', 'AA2.4'],
  'AA5.9': ['AA5.11', 'AA5.6', 'AA5.7'],
  'AA1.13': ['AA1.14', 'AA1.12'],
  // AA4.1 (sampling/bias) is never a standalone exam question -- it's always
  // folded into a broader stats question testing central tendency/dispersion
  // (see TOPIC_CONSTRAINTS['AA4.1'] in generate.ts). Without an entry here,
  // buildUserPrompt's allowedSecondaryCodes filter silently discarded any
  // AA4.2/AA4.3 tagging the model correctly proposed -- root cause of
  // 878ca3a5's missing secondary_topic_ids despite genuinely covering that
  // content (found in teacher review).
  'AA4.1': ['AA4.2', 'AA4.3'],
};

const NOT_ATTEMPTED_DIAGRAM: DiagramResult = { attempted: false, passed: true, svg: null, note: 'not needed' };

// calculator_allowed is an independent axis from section/difficulty/level --
// mirrors IB's P1 (non-calc) / P2 (calc) split. Not a 50/50 split: real IB
// papers weight P1 and P2 roughly evenly, so 2 non-calc / 3 calc per topic is
// a reasonable pilot mix, not an exact target.
export function buildSpecs(topic: TopicRow): QuestionSpec[] {
  const isAhlOnly = topic.level_scope === 'AHL';
  const commonLevel: 'SL' | 'HL' = isAhlOnly ? 'HL' : 'SL';
  return [
    { topicCode: topic.code, section: 'A', difficulty: 'easy', level: commonLevel, calculatorAllowed: false, marksRange: [3, 4] },
    { topicCode: topic.code, section: 'A', difficulty: 'medium', level: commonLevel, calculatorAllowed: true, marksRange: [4, 5] },
    { topicCode: topic.code, section: 'A', difficulty: 'hard', level: 'HL', calculatorAllowed: false, marksRange: [5, 6] },
    { topicCode: topic.code, section: 'B', difficulty: 'medium', level: commonLevel, calculatorAllowed: true, marksRange: [12, 16] },
    { topicCode: topic.code, section: 'B', difficulty: 'hard', level: 'HL', calculatorAllowed: true, marksRange: [16, 20] },
  ];
}

export async function runOne(
  spec: QuestionSpec,
  topic: TopicRow,
  subjectId: string,
  secondaryCandidateRows: TopicRow[],
  refs: ReferencePart[]
): Promise<PilotResult> {
  const base: Omit<PilotResult, 'generated' | 'cheapChecks'> = {
    spec,
    sympyCheck: { passed: false, script: '', stdout: '', stderr: '', note: 'not run' },
    independentCheck: { passed: false, independentAnswer: '', note: 'not run' },
    diagram: NOT_ATTEMPTED_DIAGRAM,
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

    const [sympyCheck, independentCheck, diagram] = await Promise.all([
      verifyWithSympy(question),
      verifyIndependently(question),
      question.needs_diagram
        ? generateDiagram(question.diagram_description ?? '', question.question_text)
        : Promise.resolve(NOT_ATTEMPTED_DIAGRAM),
    ]);

    // A missing/malformed diagram is a review-worthy gap, not a math error --
    // it doesn't affect mathematical status, but it does mean the question
    // isn't ready to publish as-is, so it still forces a flag.
    const status: 'verified' | 'flagged' =
      sympyCheck.passed && independentCheck.passed && diagram.passed ? 'verified' : 'flagged';

    // secondaryCandidateRows (from SECONDARY_CANDIDATES) is a prompt-time
    // suggestion only, not a hard post-hoc allowlist -- gating accepted
    // codes to that curated list silently dropped legitimate secondary tags
    // on any topic without a curated entry (found in teacher review: a
    // question that genuinely covered AA4.2/AA4.3 content had empty
    // secondary_topic_ids because AA4.1 had no SECONDARY_CANDIDATES entry).
    // Any code the model returns is accepted as long as it resolves to a
    // real syllabus_topics row; runCheapChecks already caps Section A to 0
    // and Section B to 2, and buildUserPrompt tells the model to leave this
    // empty rather than guess an invalid code.
    const secondaryIdMap = await fetchTopicIdsByCode(question.secondary_topic_codes);
    const secondaryIds = question.secondary_topic_codes.map((c) => secondaryIdMap.get(c)).filter((v): v is string => !!v);

    const totalMarks = question.marks_breakdown.reduce((acc, m) => acc + m.marks, 0);

    const generatedQuestionId = await insertGeneratedQuestion({
      subject_id: subjectId,
      primary_topic_id: topic.id,
      secondary_topic_ids: secondaryIds,
      level: question.level,
      section: question.section,
      difficulty: question.difficulty,
      calculator_allowed: question.calculator_allowed,
      question_text: question.question_text,
      proposed_solution: question.proposed_solution,
      final_answer: question.final_answer,
      total_marks: totalMarks,
      marks_breakdown: question.marks_breakdown,
      needs_diagram: question.needs_diagram,
      diagram_description: question.diagram_description,
      diagram_svg: diagram.svg,
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
      diagram,
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
        calculator_allowed: spec.calculatorAllowed,
        primary_topic_code: spec.topicCode,
        secondary_topic_codes: [],
        question_text: '(generation failed)',
        proposed_solution: '',
        final_answer: '',
        command_terms_used: [],
        marks_breakdown: [],
        needs_diagram: false,
        diagram_description: null,
      },
      cheapChecks: { passed: false, notes: [(err as Error).message], regenerated: false },
      status: 'flagged',
      error: (err as Error).message,
    };
  }
}

export function renderMarkdown(results: PilotResult[]): string {
  const lines: string[] = ['# Pilot question generation report', ''];
  const byTopic = new Map<string, PilotResult[]>();
  for (const r of results) {
    const list = byTopic.get(r.spec.topicCode) ?? [];
    list.push(r);
    byTopic.set(r.spec.topicCode, list);
  }

  const verifiedCount = results.filter((r) => r.status === 'verified').length;
  lines.push(`**${verifiedCount}/${results.length} verified** (sympy + independent-LLM checks passed, and the diagram -- if one was needed -- generated cleanly). The rest are \`flagged\` for manual review -- nothing was auto-published.`, '');

  for (const [code, list] of byTopic) {
    lines.push(`## ${code}`, '');
    for (const r of list) {
      const g = r.generated;
      lines.push(`### Section ${r.spec.section} / ${r.spec.difficulty} / ${r.spec.level} / ${g.calculator_allowed ? 'calculator (P2-style)' : 'non-calculator (P1-style)'} -- status: **${r.status}**`, '');
      if (r.error) lines.push(`> Error: ${r.error}`, '');
      lines.push(`**Primary topic:** ${g.primary_topic_code}${g.secondary_topic_codes.length ? ` | **Secondary:** ${g.secondary_topic_codes.join(', ')}` : ''}`);
      lines.push(`**Marks:** ${g.marks_breakdown.reduce((a, m) => a + m.marks, 0)}  |  **Generated question id:** ${r.generatedQuestionId ?? 'not inserted'}`, '');
      lines.push('**Question:**', '', '```', g.question_text, '```', '');
      lines.push('**Proposed solution:**', '', '```', g.proposed_solution, '```', '');
      lines.push(`**Final answer:** ${g.final_answer}`, '');
      lines.push('**Marks breakdown:**', '');
      for (const m of g.marks_breakdown) lines.push(`- ${m.note} (${m.marks}): ${m.desc}`);
      lines.push('');
      if (g.needs_diagram) {
        lines.push(`**Diagram description:** ${g.diagram_description}`);
        lines.push(`**Diagram generation:** ${r.diagram.attempted ? (r.diagram.passed ? 'PASS' : 'FAIL') : 'not attempted'} -- ${r.diagram.note}`);
        if (r.diagram.svg) {
          lines.push('', '<details><summary>SVG markup</summary>', '', '```svg', r.diagram.svg, '```', '</details>');
        }
        lines.push('');
      } else {
        lines.push('**Diagram:** not needed for this question.', '');
      }
      lines.push(`**Cheap checks:** ${r.cheapChecks.passed ? 'PASS' : 'FAIL'}${r.cheapChecks.regenerated ? ' (after 1 regeneration)' : ''}${r.cheapChecks.notes.length ? ` -- ${r.cheapChecks.notes.join(' | ')}` : ''}`);
      lines.push(`**Sympy check:** ${r.sympyCheck.passed ? 'PASS' : 'FAIL'} -- ${r.sympyCheck.note}`);
      lines.push(`**Independent LLM check:** ${r.independentCheck.passed ? 'PASS' : 'FAIL'} -- independent answer: \`${r.independentCheck.independentAnswer}\` -- ${r.independentCheck.note}`);
      lines.push('', '---', '');
    }
  }
  return lines.join('\n');
}
