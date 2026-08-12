export interface QuestionPartSeg {
  part_label: string;
  part_text: string;
  image_refs: string[];
  marks: number;
  command_term: string | null;
  depends_on_part_label: string | null;
  order_index: number;
}

export interface QuestionSeg {
  question_number: number;
  total_marks: number | null;
  parts: QuestionPartSeg[];
}

export interface PaperSegmentation {
  questions: QuestionSeg[];
}

export interface MarksBreakdownEntry {
  note: string;
  desc: string;
}

export interface MarkschemePartSeg {
  part_label: string;
  markscheme_text: string;
  marks_breakdown: MarksBreakdownEntry[];
}

export interface MarkschemeQuestionSeg {
  question_number: number;
  parts: MarkschemePartSeg[];
}

export interface MarkschemeSegmentation {
  questions: MarkschemeQuestionSeg[];
}
