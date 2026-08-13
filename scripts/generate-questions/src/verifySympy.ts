import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { callForText } from './claudeClient.js';
import type { GeneratedQuestionJson } from './types.js';

const SYMPY_SYSTEM_PROMPT = `You write short, self-contained Python 3 verification scripts using sympy.
Given an IB Math question and its claimed final answer, write a script that:
1. Reconstructs the mathematical content of the question using sympy symbols/expressions (do not just re-type the answer as a constant -- derive it from the question's stated conditions).
2. Independently checks whether the claimed final answer satisfies those conditions (e.g. substitute it back in, verify a derivative is zero at a claimed critical point, verify a modulus/argument pair matches the Cartesian value, etc.). Use sympy's exact arithmetic (Rational, sqrt, pi, I, simplify, nsimplify) where possible; fall back to numeric evaluation with a tolerance of 1e-6 only when an exact check isn't feasible.
3. For any equation that mixes polynomial/rational terms with transcendental constants or functions (e.g. r**2 and 1/r and pi together, or anything with exp/log/sin/cos where sp.solve has no closed form) -- sp.solve frequently returns an empty list even though real roots exist. In that situation use sp.nsolve with a numeric starting guess taken from the claimed answer (or scan a range with a numeric root finder) instead of treating an empty sp.solve result as a failure.
4. Prints ONLY "PASS" as its final line if the check succeeds, or "FAIL: <short reason>" as its final line if it does not.
Only import sympy, numpy, and Python's math/cmath standard library -- no other packages, no file or network access, no input().
Return ONLY the raw Python code -- the FIRST character of your response must be the start of the code itself (e.g. "import sympy" or a comment), with absolutely nothing before it: no markdown fences, no language tag like the word "python" on its own line, no prose.
If the question genuinely has no single checkable final answer (e.g. it only asks for a sketch or a verbal description with no numeric/symbolic result), the script should just print "PASS" with a comment explaining why no check was possible.`;

export interface SympyVerification {
  passed: boolean;
  script: string;
  stdout: string;
  stderr: string;
  note: string;
}

function runPython(scriptPath: string, timeoutMs = 15000): Promise<{ stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    const child = spawn('python3', [scriptPath], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('close', () => {
      clearTimeout(timer);
      resolve({ stdout, stderr, timedOut });
    });
  });
}

export async function verifyWithSympy(q: GeneratedQuestionJson): Promise<SympyVerification> {
  const userPrompt = [
    `QUESTION:\n${q.question_text}`,
    `CLAIMED FINAL ANSWER:\n${q.final_answer}`,
    `PROPOSED SOLUTION (for context on method, do not just trust its arithmetic):\n${q.proposed_solution}`,
  ].join('\n\n');

  const script = await callForText(SYMPY_SYSTEM_PROMPT, userPrompt, 3000);
  // Strip markdown fences AND a bare leading language tag (no backticks) --
  // seen in practice as a literal first line "python\n" that isn't inside a
  // fence, which crashes the script with NameError: name 'python' is not defined.
  const cleaned = script
    .replace(/^```(python)?\n?/i, '')
    .replace(/```$/, '')
    .replace(/^python\s*\n/i, '')
    .trim();

  const tmpFile = path.join(os.tmpdir(), `verify_${Date.now()}_${Math.random().toString(36).slice(2)}.py`);
  await fs.writeFile(tmpFile, cleaned, 'utf8');
  try {
    const { stdout, stderr, timedOut } = await runPython(tmpFile);
    await fs.unlink(tmpFile).catch(() => {});

    if (timedOut) {
      return { passed: false, script: cleaned, stdout, stderr, note: 'Sympy script timed out after 15s.' };
    }
    if (stderr.trim().length > 0 && !stdout.trim()) {
      return { passed: false, script: cleaned, stdout, stderr, note: 'Sympy script raised an exception before producing output.' };
    }
    const lastLine = stdout.trim().split('\n').filter(Boolean).pop() ?? '';
    const passed = lastLine.trim().toUpperCase().startsWith('PASS');
    return { passed, script: cleaned, stdout, stderr, note: lastLine };
  } catch (err) {
    await fs.unlink(tmpFile).catch(() => {});
    return { passed: false, script: cleaned, stdout: '', stderr: (err as Error).message, note: 'Failed to execute sympy script.' };
  }
}
