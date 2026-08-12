import { callForJson, callForText } from './claudeClient.js';
import type { GeneratedQuestionJson } from './types.js';

const SOLVE_SYSTEM_PROMPT = `You are an expert IB Diploma Mathematics AA teacher. Solve the given exam question from scratch, showing full working.
Return ONLY a single JSON object, no prose, no markdown fences:
{ "work": string, "final_answer": string }
Give the single concise final result(s) in final_answer, in the same style a markscheme would (e.g. "k = 3", "z = 4(cos(pi/3) + i sin(pi/3))").`;

const JUDGE_SYSTEM_PROMPT = `You judge whether two final answers to the same IB Math question are mathematically equivalent (same value/set, allowing different but equivalent forms, e.g. exact vs decimal, different but equal simplifications, reordered set elements).
Return ONLY a single JSON object, no prose: { "equivalent": boolean, "reason": string }
"reason" must be one short sentence.`;

export interface IndependentVerification {
  passed: boolean;
  independentAnswer: string;
  note: string;
}

export async function verifyIndependently(q: GeneratedQuestionJson): Promise<IndependentVerification> {
  const solve = await callForJson<{ work: string; final_answer: string }>(
    SOLVE_SYSTEM_PROMPT,
    `QUESTION:\n${q.question_text}`
  );

  const judgePrompt = [
    `QUESTION:\n${q.question_text}`,
    `ANSWER A (from the question's author):\n${q.final_answer}`,
    `ANSWER B (independently solved, no access to Answer A):\n${solve.final_answer}`,
  ].join('\n\n');

  try {
    const verdict = await callForJson<{ equivalent: boolean; reason: string }>(JUDGE_SYSTEM_PROMPT, judgePrompt, 1000);
    return { passed: verdict.equivalent, independentAnswer: solve.final_answer, note: verdict.reason };
  } catch (err) {
    return {
      passed: false,
      independentAnswer: solve.final_answer,
      note: `Judge call failed: ${(err as Error).message}`,
    };
  }
}
