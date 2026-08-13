import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

export const supabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

export async function fetchSubjectId(code: string): Promise<string> {
  const { data, error } = await supabase.from('subjects').select('id').eq('code', code).single();
  if (error || !data) {
    throw new Error(`Could not resolve subject_id for code "${code}": ${error?.message ?? 'not found'}`);
  }
  return data.id as string;
}

export interface TopicRow {
  id: string;
  code: string;
  subtopic_name: string;
  level_scope: 'SL' | 'AHL';
  subject_id: string;
}

export async function fetchTopic(code: string): Promise<TopicRow> {
  const { data, error } = await supabase
    .from('syllabus_topics')
    .select('id, code, subtopic_name, level_scope, subject_id')
    .eq('code', code)
    .single();
  if (error || !data) {
    throw new Error(`Could not resolve syllabus_topics row for code "${code}": ${error?.message ?? 'not found'}`);
  }
  return data as TopicRow;
}

export async function fetchTopicIdsByCode(codes: string[]): Promise<Map<string, string>> {
  if (codes.length === 0) return new Map();
  const { data, error } = await supabase.from('syllabus_topics').select('id, code').in('code', codes);
  if (error) throw new Error(`Failed to resolve topic codes ${codes.join(', ')}: ${error.message}`);
  return new Map((data ?? []).map((r) => [r.code as string, r.id as string]));
}

export interface ReferencePart {
  part_text: string;
  marks: number;
  command_term: string | null;
  level: 'SL' | 'HL';
}

/**
 * Pulls real question_parts already tagged to this topic, for style/structure
 * reference only (format, typical mark allocation). Never surfaced verbatim in
 * generated output -- callers must not quote or copy part_text into prompts
 * that ask the model to produce publishable question_text.
 */
export async function fetchReferenceParts(topicId: string, limit = 8): Promise<ReferencePart[]> {
  const { data, error } = await supabase
    .from('part_topic_tags')
    .select('question_parts(part_text, marks, command_term, questions(papers(level)))')
    .eq('topic_id', topicId)
    .limit(limit);
  if (error) throw new Error(`Failed to fetch reference parts for topic ${topicId}: ${error.message}`);

  const rows = (data ?? []) as unknown as Array<{
    question_parts: {
      part_text: string;
      marks: number;
      command_term: string | null;
      questions: { papers: { level: 'SL' | 'HL' } };
    } | null;
  }>;

  return rows
    .filter((r) => r.question_parts !== null)
    .map((r) => ({
      part_text: r.question_parts!.part_text,
      marks: r.question_parts!.marks,
      command_term: r.question_parts!.command_term,
      level: r.question_parts!.questions.papers.level,
    }));
}

export interface VerificationInput {
  method: 'sympy' | 'llm_independent' | 'human';
  passed: boolean;
  result: unknown;
}

export interface GeneratedQuestionInput {
  subject_id: string;
  primary_topic_id: string;
  secondary_topic_ids: string[];
  level: 'SL' | 'HL';
  section: 'A' | 'B';
  difficulty: 'easy' | 'medium' | 'hard';
  calculator_allowed: boolean;
  question_text: string;
  proposed_solution: string;
  final_answer: string;
  total_marks: number;
  marks_breakdown: Array<{ note: string; desc: string; marks: number }>;
  needs_diagram: boolean;
  diagram_description: string | null;
  diagram_svg: string | null;
  status: 'verified' | 'flagged' | 'draft';
  verifications: VerificationInput[];
}

/**
 * One RPC call = one Postgres transaction: the generated_questions row and all
 * of its generated_question_verification rows are written atomically (see
 * insert_generated_question in supabase/migrations, mirrors ingest_paper's
 * one-call-one-transaction convention).
 */
export async function insertGeneratedQuestion(input: GeneratedQuestionInput): Promise<string> {
  const { data, error } = await supabase.rpc('insert_generated_question', { payload: input });
  if (error) {
    throw new Error(`insert_generated_question RPC failed (no rows were written): ${error.message}`);
  }
  return data as string;
}
