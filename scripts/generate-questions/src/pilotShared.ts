import {
  fetchTopicsByCode,
  insertGeneratedQuestion,
  type TopicRow,
  type ReferencePart,
} from './db.js';
import { generateQuestion, stateAndCodeAgree } from './generate.js';
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
    secondaryCrossCheckNotes: [],
  };

  try {
    const { question, cheapChecks, regenerated } = await generateQuestion(spec, topic, secondaryCandidateRows, refs);

    if (!cheapChecks.passed) {
      // Previously returned here without ever calling insertGeneratedQuestion
      // -- every OTHER failure mode (sympy mismatch, independent-LLM
      // disagreement, sympy timeout, bad diagram) happens after cheap checks
      // pass and goes through the normal insert path below with
      // status='flagged', but a cheap-check failure that survives
      // generateQuestion's one internal retry silently produced no DB row at
      // all. Found via a batch/DB row-count mismatch (49 rows for 50
      // attempted specs) -- the spec was silently dropped with only the
      // markdown report (not durable storage) as any record it was ever
      // attempted. Insert it too, with status='flagged' and empty
      // verifications (sympy/independent checks never ran on content that
      // already failed structurally), so every attempted spec leaves a row
      // and per-topic/per-batch row counts stay predictable.
      const cheapFailTotalMarks = question.marks_breakdown.reduce((acc, m) => acc + m.marks, 0);
      const generatedQuestionId = await insertGeneratedQuestion({
        subject_id: subjectId,
        primary_topic_id: topic.id,
        secondary_topic_ids: [],
        level: question.level,
        section: question.section,
        difficulty: question.difficulty,
        calculator_allowed: question.calculator_allowed,
        question_text: question.question_text,
        proposed_solution: question.proposed_solution,
        final_answer: question.final_answer,
        total_marks: cheapFailTotalMarks,
        marks_breakdown: question.marks_breakdown,
        needs_diagram: question.needs_diagram,
        diagram_description: question.diagram_description,
        diagram_svg: null,
        status: 'flagged',
        verifications: [],
      });

      return {
        ...base,
        generated: question,
        cheapChecks: { ...cheapChecks, regenerated },
        status: 'flagged',
        generatedQuestionId,
        error: `Cheap checks failed after ${regenerated ? 'one regeneration' : 'generation'}: ${cheapChecks.notes.join(' | ')}`,
      };
    }

    // Promise.all here previously meant ANY rejection from these three calls
    // -- not just a normal {passed:false} result, an actual thrown exception
    // -- skipped straight to runOne's outer catch block, which discards the
    // already-generated `question` (it replaces it with a synthetic
    // '(generation failed)' placeholder) and never calls
    // insertGeneratedQuestion. Found via a second batch/DB row-count
    // mismatch after the cheap-check-failure fix above: verifyWithSympy and
    // verifyIndependently each have an UNGUARDED first API call (only their
    // second call is wrapped in try/catch) -- a truncated response there
    // throws straight out. A question that already passed cheap checks has
    // real content worth keeping a record of even if verification itself
    // couldn't complete, so Promise.allSettled converts a thrown rejection
    // into the same {passed:false, note: ...} shape a normal verification
    // failure already produces, and the insert below always runs.
    const settled = await Promise.allSettled([
      verifyWithSympy(question),
      verifyIndependently(question),
      question.needs_diagram
        ? generateDiagram(question.diagram_description ?? '', question.question_text)
        : Promise.resolve(NOT_ATTEMPTED_DIAGRAM),
    ]);
    const sympyCheck =
      settled[0].status === 'fulfilled'
        ? settled[0].value
        : { passed: false, script: '', stdout: '', stderr: '', note: `Sympy verification call threw: ${(settled[0].reason as Error).message}` };
    const independentCheck =
      settled[1].status === 'fulfilled'
        ? settled[1].value
        : { passed: false, independentAnswer: '', note: `Independent-LLM verification call threw: ${(settled[1].reason as Error).message}` };
    const diagram =
      settled[2].status === 'fulfilled'
        ? settled[2].value
        : { attempted: true, passed: false, svg: null, note: `Diagram generation call threw: ${(settled[2].reason as Error).message}` };

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
    // runCheapChecks already caps Section A to 0 and Section B to 2, and
    // buildUserPrompt tells the model to leave this empty rather than guess.
    //
    // A code resolving to a real syllabus_topics row is necessary but not
    // sufficient -- it doesn't catch a code mistyped after otherwise correct
    // reasoning (the model names the right topic, then types the wrong
    // number for it). stateAndCodeAgree cross-checks the model's own stated
    // name for each code against that code's real subtopic_name and drops
    // the code deterministically on a mismatch, without trusting another
    // round of model output to get it right.
    // Same reasoning as the Promise.allSettled above: this is another DB
    // call sitting between "cheap checks passed" and "insert" that could
    // throw (a transient network/DB error) and, if unguarded, would destroy
    // the whole question the same way the verification calls did.
    const secondaryIds: string[] = [];
    const secondaryCrossCheckNotes: string[] = [];
    let secondaryLookupFailed = false;
    let secondaryTopicRows = new Map<string, { id: string; subtopic_name: string }>();
    try {
      secondaryTopicRows = await fetchTopicsByCode(question.secondary_topic_codes);
    } catch (err) {
      secondaryLookupFailed = true;
      secondaryCrossCheckNotes.push(`Secondary-topic cross-check could not run (topic lookup failed: ${(err as Error).message}) -- all proposed codes dropped rather than trusted unchecked.`);
    }
    if (!secondaryLookupFailed) {
      for (const code of question.secondary_topic_codes) {
        const row = secondaryTopicRows.get(code);
        if (!row) {
          secondaryCrossCheckNotes.push(`${code}: does not resolve to a real syllabus_topics row -- dropped.`);
          continue;
        }
        const statedName = (question.secondary_topic_stated_names ?? {})[code] ?? '';
        if (!stateAndCodeAgree(statedName, row.subtopic_name)) {
          secondaryCrossCheckNotes.push(`${code}: stated name "${statedName}" does not match real topic name "${row.subtopic_name}" -- dropped (deterministic cross-check).`);
          continue;
        }
        secondaryIds.push(row.id);
      }
    }

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
      secondaryCrossCheckNotes,
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
      const secondaryWithJustification = g.secondary_topic_codes
        .map((c) => `${c} (${(g.secondary_topic_justifications ?? {})[c] ?? 'no justification recorded'})`)
        .join('; ');
      lines.push(`**Primary topic:** ${g.primary_topic_code}${g.secondary_topic_codes.length ? ` | **Secondary:** ${secondaryWithJustification}` : ''}`);
      if (r.secondaryCrossCheckNotes.length > 0) {
        lines.push(`**Secondary-topic cross-check dropped:** ${r.secondaryCrossCheckNotes.join(' | ')}`);
      }
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
