export interface MarksBreakdownItem {
  note: string;
  desc: string;
  marks: number;
}

// The JSON shape requested from the generation call. `final_answer` and
// `command_terms_used` are additive beyond the originally specified fields --
// they exist purely so steps 3 (cheap checks) and 4 (verification) have
// something concrete to check without re-deriving it from prose.
export interface GeneratedQuestionJson {
  section: 'A' | 'B';
  difficulty: 'easy' | 'medium' | 'hard';
  level: 'SL' | 'HL';
  primary_topic_code: string;
  secondary_topic_codes: string[];
  question_text: string;
  proposed_solution: string;
  final_answer: string;
  command_terms_used: string[];
  marks_breakdown: MarksBreakdownItem[];
}

export interface QuestionSpec {
  topicCode: string;
  section: 'A' | 'B';
  difficulty: 'easy' | 'medium' | 'hard';
  level: 'SL' | 'HL';
  marksRange: [number, number];
}

export interface PilotResult {
  spec: QuestionSpec;
  generated: GeneratedQuestionJson;
  cheapChecks: { passed: boolean; notes: string[]; regenerated: boolean };
  sympyCheck: { passed: boolean; script: string; stdout: string; stderr: string; note: string };
  independentCheck: { passed: boolean; independentAnswer: string; note: string };
  status: 'verified' | 'flagged';
  generatedQuestionId: string | null;
  error: string | null;
}
