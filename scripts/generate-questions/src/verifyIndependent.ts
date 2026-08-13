import { callForJson, callForText } from './claudeClient.js';
import type { GeneratedQuestionJson } from './types.js';

const SOLVE_SYSTEM_PROMPT = `You are an expert IB Diploma Mathematics AA teacher. Solve the given exam question from scratch.
Return ONLY a single JSON object, no prose, no markdown fences:
{ "work": string, "final_answer": string }
"work" only needs to be BRIEF working notes (short bullet-style lines, key equations and substitutions only) -- this is purely to sanity-check your method, not a teaching write-up, so do not write full prose explanations or restate the question. For a multi-part question, one terse line per part is enough.
Give the single concise final result(s) in final_answer, in the same style a markscheme would (e.g. "k = 3", "z = 4(cos(pi/3) + i sin(pi/3))"), covering every part.`;

const JUDGE_SYSTEM_PROMPT = `You judge whether two final answers to the same IB Math question are mathematically equivalent (same value/set, allowing different but equivalent forms, e.g. exact vs decimal, different but equal simplifications, reordered set elements).
Return ONLY a single JSON object, no prose: { "equivalent": boolean, "reason": string }
"reason" must be ONE short sentence, even if the question has many parts -- do not enumerate or compare part-by-part (e.g. "All parts match" or "Part (d)(ii) differs: ..." is enough, never a part-by-part breakdown). Set equivalent to false as a whole if even one part disagrees. Do not restate or quote the question or either answer back in full -- go straight to the verdict.`;

export interface IndependentVerification {
  passed: boolean;
  independentAnswer: string;
  note: string;
}

// Same failure mode as the main generation call (see generate.ts
// MAX_TOKENS_BY_SECTION): "show full working" on a 12-20 mark multi-part
// Section B question can itself run past 8000 tokens.
const SOLVE_MAX_TOKENS_BY_SECTION: Record<GeneratedQuestionJson['section'], number> = {
  A: 8000,
  B: 24000,
};

export async function verifyIndependently(q: GeneratedQuestionJson): Promise<IndependentVerification> {
  const solve = await callForJson<{ work: string; final_answer: string }>(
    SOLVE_SYSTEM_PROMPT,
    `QUESTION:\n${q.question_text}`,
    SOLVE_MAX_TOKENS_BY_SECTION[q.section]
  );

  const judgePrompt = [
    `QUESTION:\n${q.question_text}`,
    `ANSWER A (from the question's author):\n${q.final_answer}`,
    `ANSWER B (independently solved, no access to Answer A):\n${solve.final_answer}`,
  ].join('\n\n');

  try {
    const verdict = await callForJson<{ equivalent: boolean; reason: string }>(JUDGE_SYSTEM_PROMPT, judgePrompt, 6000);
    return { passed: verdict.equivalent, independentAnswer: solve.final_answer, note: verdict.reason };
  } catch (err) {
    return {
      passed: false,
      independentAnswer: solve.final_answer,
      note: `Judge call failed: ${(err as Error).message}`,
    };
  }
}
