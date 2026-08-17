import { supabase } from './supabaseClient';
import type { MarksBreakdownItem } from './supabaseClient';

// Backend logic for the paper-builder mockup (see conversation / design/
// PaperBuilderMockup.jsx) -- "begin scoping the backend assembly-logic
// query" per the teacher-approved mockup's placeholder #3. This is a first
// pass: real query + a real (if simple) selection algorithm, not wired into
// a deployed page yet. The actual results/output screen is explicitly
// "not yet designed" (needs its own mockup pass) -- this module stops at
// producing the assembled question list, not rendering it.

export type PaperCode = 'P1' | 'P2';
export type DifficultyMix = 'gentle' | 'balanced' | 'stretch';
export type Difficulty = 'easy' | 'medium' | 'hard';

// Real IB SL papers are 80 marks each (P1 no-calc, P2 calc); HL papers are
// 110 marks each. P3 (HL only, calculator, 55 marks) is deliberately
// excluded -- our generated_questions pool has no concept of P3's
// problem-solving-style extended questions, so faking P3 support here would
// silently produce a paper that isn't actually P3-shaped. Needs its own
// design/generation work before it can be offered as a paper choice.
const PAPER_MARKS: Record<'SL' | 'HL', Record<PaperCode, number>> = {
  SL: { P1: 80, P2: 80 },
  HL: { P1: 110, P2: 110 },
};

// Target share of the paper's marks drawn from each difficulty tier.
// "balanced" approximates a real paper's easy/medium/hard spread; "gentle"
// and "stretch" bias without excluding either end entirely -- a stretch
// paper should still open with something gettable, a gentle one should
// still have a stretch question or two.
const DIFFICULTY_WEIGHTS: Record<DifficultyMix, Record<Difficulty, number>> = {
  gentle: { easy: 0.5, medium: 0.35, hard: 0.15 },
  balanced: { easy: 0.3, medium: 0.4, hard: 0.3 },
  stretch: { easy: 0.15, medium: 0.35, hard: 0.5 },
};

export interface ThemeTopic {
  code: string;
  subtopic_name: string;
  live: boolean;
}
export interface Theme {
  name: string;
  topics: ThemeTopic[];
}

// Replaces the mockup's hardcoded THEMES sample (placeholder #2) with the
// real 83-topic taxonomy, grouped by the 5 broad theme names the builder UI
// shows, each subtopic flagged live/not via syllabus_topics.topics_enabled
// -- the same flag that gates the practice tool's topic picker.
export async function fetchThemes(): Promise<Theme[]> {
  const { data, error } = await supabase
    .from('syllabus_topics')
    .select('code, subtopic_name, topic_name, topics_enabled')
    .order('topic_name')
    .order('code');
  if (error) throw new Error(`Failed to fetch themes: ${error.message}`);

  const byTheme = new Map<string, ThemeTopic[]>();
  for (const row of data ?? []) {
    const list = byTheme.get(row.topic_name as string) ?? [];
    list.push({ code: row.code as string, subtopic_name: row.subtopic_name as string, live: row.topics_enabled as boolean });
    byTheme.set(row.topic_name as string, list);
  }
  return Array.from(byTheme.entries()).map(([name, topics]) => ({ name, topics }));
}

export interface AssembleParams {
  level: 'SL' | 'HL';
  paper: PaperCode;
  /** Broad syllabus_topics.topic_name values, e.g. "Statistics and Probability". */
  themeNames: string[];
  difficultyMix: DifficultyMix;
}

export interface CandidateQuestion {
  id: string;
  primary_topic_id: string;
  section: 'A' | 'B';
  difficulty: Difficulty;
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

export interface AssembledPaper {
  questions: CandidateQuestion[];
  totalMarks: number;
  targetMarks: number;
  /** True if the pool ran out before reaching targetMarks -- the caller
   *  should surface this rather than silently hand back a short paper. */
  shortOfTarget: boolean;
}

export async function fetchCandidateQuestions(params: AssembleParams): Promise<CandidateQuestion[]> {
  const calculatorAllowed = params.paper !== 'P1';

  const { data: topics, error: topicsErr } = await supabase
    .from('syllabus_topics')
    .select('id')
    .eq('topics_enabled', true)
    .in('topic_name', params.themeNames);
  if (topicsErr) throw new Error(`Failed to resolve themes: ${topicsErr.message}`);
  const topicIds = (topics ?? []).map((t) => t.id as string);
  if (topicIds.length === 0) return [];

  // An SL-level question is usable by both SL and HL takers (SL content is a
  // subset of the HL syllabus); an HL-level question only makes sense when
  // the requested paper level is HL. Mirrors the SL/AHL semantics already
  // used for levelScopeLabel in supabaseClient.ts, applied here to
  // generated_questions.level instead of syllabus_topics.level_scope.
  const allowedLevels = params.level === 'HL' ? ['SL', 'HL'] : ['SL'];

  const { data, error } = await supabase
    .from('generated_questions')
    .select(
      'id, primary_topic_id, section, difficulty, level, calculator_allowed, question_text, proposed_solution, final_answer, total_marks, marks_breakdown, needs_diagram, diagram_svg'
    )
    .in('primary_topic_id', topicIds)
    .eq('status', 'published')
    .eq('calculator_allowed', calculatorAllowed)
    .in('level', allowedLevels);
  if (error) throw new Error(`Failed to fetch candidate questions: ${error.message}`);
  return (data ?? []) as CandidateQuestion[];
}

export async function assembleQuestions(params: AssembleParams): Promise<AssembledPaper> {
  const targetMarks = PAPER_MARKS[params.level][params.paper];
  const candidates = await fetchCandidateQuestions(params);
  return selectByWeightedMarks(candidates, targetMarks, DIFFICULTY_WEIGHTS[params.difficultyMix]);
}

// Greedy weighted selection, not a true knapsack: repeatedly pick a random
// unused question from whichever difficulty tier is currently furthest
// below its target share of marks, until targetMarks is reached (within one
// question's overshoot) or every tier runs dry. Deliberately simple for a
// first pass over a still-small pool (~5 questions/topic) -- revisit with a
// tighter packing algorithm once the pool is large enough for it to matter.
function selectByWeightedMarks(
  candidates: CandidateQuestion[],
  targetMarks: number,
  weights: Record<Difficulty, number>
): AssembledPaper {
  const byTier: Record<Difficulty, CandidateQuestion[]> = {
    easy: shuffle(candidates.filter((q) => q.difficulty === 'easy')),
    medium: shuffle(candidates.filter((q) => q.difficulty === 'medium')),
    hard: shuffle(candidates.filter((q) => q.difficulty === 'hard')),
  };

  const selected: CandidateQuestion[] = [];
  let totalMarks = 0;
  const marksByTier: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0 };

  while (totalMarks < targetMarks) {
    const tiersWithStock = (Object.keys(byTier) as Difficulty[]).filter((t) => byTier[t].length > 0);
    if (tiersWithStock.length === 0) break;

    // Pick the tier whose current share of selected marks is furthest below
    // its target weight (a simple proportional-fair scheduler).
    const tier = tiersWithStock.reduce((worst, t) => {
      const shareGap = weights[t] - (totalMarks > 0 ? marksByTier[t] / totalMarks : 0);
      const worstGap = weights[worst] - (totalMarks > 0 ? marksByTier[worst] / totalMarks : 0);
      return shareGap > worstGap ? t : worst;
    }, tiersWithStock[0]);

    const q = byTier[tier].pop()!;
    selected.push(q);
    totalMarks += q.total_marks;
    marksByTier[tier] += q.total_marks;
  }

  return { questions: selected, totalMarks, targetMarks, shortOfTarget: totalMarks < targetMarks };
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
