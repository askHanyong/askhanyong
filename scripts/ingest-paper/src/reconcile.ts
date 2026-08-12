import type {
  PaperSegmentation,
  MarkschemeSegmentation,
  QuestionPartSeg,
  MarksBreakdownEntry,
} from './types.js';

export type MismatchKind =
  | 'missing_markscheme'
  | 'orphan_markscheme_part'
  | 'orphan_markscheme_question'
  | 'part_count_mismatch';

export interface Mismatch {
  kind: MismatchKind;
  question_number: number;
  part_label?: string;
  reason: string;
}

export type ReconciledPart = QuestionPartSeg & {
  markscheme?: { markscheme_text: string; marks_breakdown: MarksBreakdownEntry[] };
  mismatch_reason?: string;
};

export interface OrphanStubPart {
  part_label: string;
  markscheme_text: string;
  marks_breakdown: MarksBreakdownEntry[];
  order_index: number;
  mismatch_reason: string;
}

export interface ReconciledQuestion {
  question_number: number;
  total_marks: number | null;
  parts: ReconciledPart[];
  orphan_markscheme_parts: OrphanStubPart[];
}

export interface OrphanQuestion {
  question_number: number;
  parts: OrphanStubPart[];
}

export interface ReconciledPayload {
  questions: ReconciledQuestion[];
  orphan_markscheme_questions: OrphanQuestion[];
  mismatches: Mismatch[];
}

/**
 * Joins paper parts to markscheme parts by (question_number, part_label).
 * Every mismatch is both logged in the returned `mismatches` list (for console
 * output) AND, where there's a concrete part to attach it to, written as
 * `mismatch_reason` directly on that part object so the ingest_paper SQL
 * function can insert a review_queue row right after inserting the part.
 */
export function reconcile(paper: PaperSegmentation, ms: MarkschemeSegmentation): ReconciledPayload {
  const mismatches: Mismatch[] = [];
  const msByQuestion = new Map(ms.questions.map((q) => [q.question_number, q]));
  const paperQuestionNumbers = new Set(paper.questions.map((q) => q.question_number));

  const questions: ReconciledQuestion[] = paper.questions.map((pq) => {
    const msq = msByQuestion.get(pq.question_number);
    const msPartsByLabel = new Map((msq?.parts ?? []).map((p) => [p.part_label, p]));
    const usedLabels = new Set<string>();

    const parts: ReconciledPart[] = pq.parts.map((part) => {
      const match = msPartsByLabel.get(part.part_label);
      if (match) {
        usedLabels.add(part.part_label);
        return {
          ...part,
          markscheme: { markscheme_text: match.markscheme_text, marks_breakdown: match.marks_breakdown },
        };
      }
      const reason = `Paper part "${part.part_label}" in Q${pq.question_number} has no matching markscheme part label.`;
      mismatches.push({ kind: 'missing_markscheme', question_number: pq.question_number, part_label: part.part_label, reason });
      return { ...part, mismatch_reason: reason };
    });

    const orphanParts: OrphanStubPart[] = (msq?.parts ?? [])
      .filter((p) => !usedLabels.has(p.part_label))
      .map((p, i) => {
        const reason = `Markscheme part "${p.part_label}" in Q${pq.question_number} has no matching paper part -- inserted as a stub for manual review.`;
        mismatches.push({ kind: 'orphan_markscheme_part', question_number: pq.question_number, part_label: p.part_label, reason });
        return {
          part_label: p.part_label,
          markscheme_text: p.markscheme_text,
          marks_breakdown: p.marks_breakdown,
          order_index: pq.parts.length + i,
          mismatch_reason: reason,
        };
      });

    const paperCount = pq.parts.length;
    const msCount = msq?.parts.length ?? 0;
    if (paperCount !== msCount) {
      mismatches.push({
        kind: 'part_count_mismatch',
        question_number: pq.question_number,
        reason: `Paper Q${pq.question_number} has ${paperCount} part(s), markscheme has ${msCount}.`,
      });
    }

    return {
      question_number: pq.question_number,
      total_marks: pq.total_marks,
      parts,
      orphan_markscheme_parts: orphanParts,
    };
  });

  const orphanQuestions: OrphanQuestion[] = ms.questions
    .filter((q) => !paperQuestionNumbers.has(q.question_number))
    .map((q) => {
      const reason = `Markscheme has Q${q.question_number} but the paper segmentation found no matching question -- inserted as a stub question for manual review.`;
      mismatches.push({ kind: 'orphan_markscheme_question', question_number: q.question_number, reason });
      return {
        question_number: q.question_number,
        parts: q.parts.map((p, i) => ({
          part_label: p.part_label,
          markscheme_text: p.markscheme_text,
          marks_breakdown: p.marks_breakdown,
          order_index: i,
          mismatch_reason: reason,
        })),
      };
    });

  return { questions, orphan_markscheme_questions: orphanQuestions, mismatches };
}
