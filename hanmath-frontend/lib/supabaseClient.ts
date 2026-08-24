import { createClient } from '@supabase/supabase-js';

// Public anon/publishable key -- safe to expose in the browser bundle by
// design (this is exactly what a publishable key is for). Actual access
// scoping happens entirely via RLS: this client can only ever read
// syllabus_topics, subjects, and generated_questions WHERE status='published'.
// See supabase/migrations/20260813120000_hanmath_tables.sql for the policies.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY -- set them in .env.local (see .env.example).'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
});

export interface SyllabusTopic {
  id: string;
  code: string;
  subtopic_name: string;
  topic_name: string;
  /** The AA course's fixed 1-5 theme ordering (1 = Number and Algebra ... 5 = Calculus)
   *  -- used to sort themes into the canonical syllabus order, since `topic_name` sorts
   *  alphabetically instead ("Calculus" before "Functions"). */
  topic_number: number;
  level_scope: 'SL' | 'AHL';
}

export interface MarksBreakdownItem {
  note: string;
  desc: string;
  marks: number;
}

export interface GeneratedQuestion {
  id: string;
  section: 'A' | 'B';
  difficulty: 'easy' | 'medium' | 'hard';
  level: 'SL' | 'HL';
  calculator_allowed: boolean;
  question_text: string;
  proposed_solution: string;
  final_answer: string;
  total_marks: number;
  marks_breakdown: MarksBreakdownItem[];
  needs_diagram: boolean;
  diagram_svg: string | null;
}

export async function fetchEnabledTopics(): Promise<SyllabusTopic[]> {
  const { data, error } = await supabase
    .from('syllabus_topics')
    .select('id, code, subtopic_name, topic_name, topic_number, level_scope')
    .eq('topics_enabled', true)
    .order('topic_number')
    .order('code');
  if (error) throw new Error(`Failed to fetch topics: ${error.message}`);
  return data ?? [];
}

export async function fetchPublishedQuestionsForTopic(topicId: string): Promise<GeneratedQuestion[]> {
  const { data, error } = await supabase
    .from('generated_questions')
    .select(
      'id, section, difficulty, level, calculator_allowed, question_text, proposed_solution, final_answer, total_marks, marks_breakdown, needs_diagram, diagram_svg'
    )
    .eq('primary_topic_id', topicId)
    .eq('status', 'published')
    .order('section')
    .order('difficulty');
  if (error) throw new Error(`Failed to fetch questions: ${error.message}`);
  return data ?? [];
}
