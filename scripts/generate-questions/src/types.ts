export interface MarksBreakdownItem {
  note: string;
  desc: string;
  marks: number;
}

// The JSON shape requested from the generation call. `final_answer` and
// `command_terms_used` are additive beyond the originally specified fields --
// they exist purely so steps 3 (cheap checks) and 4 (verification) have
// something concrete to check without re-deriving it from prose.
// `calculator_allowed`, `needs_diagram`, and `diagram_description` are also
// additive: calculator_allowed changes the correct solution PATH and the
// difficulty bar (a numerical-methods step is trivial on a GDC but hard by
// hand), so it has to be an input the model reasons about while writing the
// solution, not a label applied afterwards. needs_diagram/diagram_description
// let the model flag when a question is materially harder to follow without
// a figure (mirrors question_parts.image_refs from the ingestion side).
export interface GeneratedQuestionJson {
  section: 'A' | 'B';
  difficulty: 'easy' | 'medium' | 'hard';
  level: 'SL' | 'HL';
  calculator_allowed: boolean;
  primary_topic_code: string;
  secondary_topic_codes: string[];
  question_text: string;
  proposed_solution: string;
  final_answer: string;
  command_terms_used: string[];
  marks_breakdown: MarksBreakdownItem[];
  needs_diagram: boolean;
  diagram_description: string | null;
}

export interface QuestionSpec {
  topicCode: string;
  section: 'A' | 'B';
  difficulty: 'easy' | 'medium' | 'hard';
  level: 'SL' | 'HL';
  calculatorAllowed: boolean;
  marksRange: [number, number];
}

export interface DiagramResult {
  attempted: boolean;
  passed: boolean;
  svg: string | null;
  note: string;
}

export interface PilotResult {
  spec: QuestionSpec;
  generated: GeneratedQuestionJson;
  cheapChecks: { passed: boolean; notes: string[]; regenerated: boolean };
  sympyCheck: { passed: boolean; script: string; stdout: string; stderr: string; note: string };
  independentCheck: { passed: boolean; independentAnswer: string; note: string };
  diagram: DiagramResult;
  status: 'verified' | 'flagged';
  generatedQuestionId: string | null;
  error: string | null;
}
