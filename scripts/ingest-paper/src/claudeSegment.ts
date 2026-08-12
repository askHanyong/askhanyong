import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs/promises';
import { env } from './env.js';
import type { PaperSegmentation, MarkschemeSegmentation } from './types.js';

const client = new Anthropic({ apiKey: env.anthropicApiKey });

async function pdfDocumentBlock(filePath: string): Promise<Anthropic.Messages.DocumentBlockParam> {
  const buf = await fs.readFile(filePath);
  return {
    type: 'document',
    source: {
      type: 'base64',
      media_type: 'application/pdf',
      data: buf.toString('base64'),
    },
  };
}

/**
 * This model rejects assistant-message prefill ("conversation must end with
 * a user message"), so instead of forcing the reply open with "{" we rely on
 * the system prompt's "JSON only" instruction and extract the first {...}
 * object from whatever text comes back (tolerates stray markdown fences).
 */
function extractJson<T>(text: string): T {
  const trimmed = text.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Claude's response contained no JSON object:\n---\n${trimmed.slice(0, 1000)}`);
  }
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as T;
  } catch (err) {
    throw new Error(
      `Failed to parse Claude's JSON response: ${(err as Error).message}\n---\n${trimmed.slice(0, 1000)}`
    );
  }
}

async function callForJson<T>(system: string, doc: Anthropic.Messages.DocumentBlockParam, instruction: string): Promise<T> {
  const resp = await client.messages.create({
    model: env.claudeModel,
    max_tokens: 16000,
    system,
    messages: [{ role: 'user', content: [doc, { type: 'text', text: instruction }] }],
  });
  const textBlock = resp.content.find((b): b is Anthropic.Messages.TextBlock => b.type === 'text');
  if (!textBlock) throw new Error('Claude returned no text content block.');
  return extractJson<T>(textBlock.text);
}

const PAPER_SYSTEM_PROMPT = `You segment IB Diploma Mathematics exam papers into questions and sub-parts.
Return ONLY a single JSON object, no prose, no markdown fences, matching exactly this shape:
{
  "questions": [
    {
      "question_number": number,
      "total_marks": number | null,
      "parts": [
        {
          "part_label": string,          // e.g. "a", "b", "b.i", "b.ii" -- lowercase, matching how the paper itself labels the part; use "" if the question has no sub-parts at all
          "part_text": string,           // the full text of this part, as written on the page
          "image_refs": string[],        // short description + approximate position of any diagram/graph belonging to this part, e.g. "page 4, graph of f(x) directly below part (b)"; [] if none
          "marks": number,
          "command_term": string | null, // the IB command term this part opens with (e.g. "Find", "Show that", "Hence"), null if none is obvious
          "depends_on_part_label": string | null, // set ONLY when this part explicitly reuses a result from an earlier part in the SAME question (e.g. "hence" referring back to part (a)); otherwise null
          "order_index": number          // 0-based order within the question, matching the part order on the page
        }
      ]
    }
  ]
}
Rules:
- Preserve mathematical notation faithfully (e.g. x^2, \\frac{1}{2}, \\int, matrices as rows) -- do not simplify, solve, or paraphrase anything.
- Question numbering and part labelling must match the paper exactly.
- Include every question on the paper, in order.
- Do not include any text outside the JSON object.`;

export async function segmentPaper(paperPdfPath: string): Promise<PaperSegmentation> {
  const doc = await pdfDocumentBlock(paperPdfPath);
  return callForJson<PaperSegmentation>(
    PAPER_SYSTEM_PROMPT,
    doc,
    'Segment this IB Math exam paper. Respond with ONLY the JSON object described in the system prompt -- start your reply with { and end with }, no markdown code fences, no explanation before or after.'
  );
}

const MARKSCHEME_SYSTEM_PROMPT = `You segment IB Diploma Mathematics exam markschemes into per-question, per-part marking notes.
Return ONLY a single JSON object, no prose, no markdown fences, matching exactly this shape:
{
  "questions": [
    {
      "question_number": number,
      "parts": [
        {
          "part_label": string,        // must use the SAME labelling convention the question paper would use (lowercase letters/roman numerals like "a", "b.i"), not the markscheme's own formatting quirks -- these need to exact-match the paper's parts later
          "markscheme_text": string,   // the full markscheme text for this part, verbatim
          "marks_breakdown": [ { "note": string, "desc": string } ]
            // one entry per mark note in order, e.g. {"note": "M1", "desc": "valid attempt to substitute"}, {"note": "A1", "desc": "correct value"}, {"note": "AG", "desc": "answer given"}
        }
      ]
    }
  ]
}
Rules:
- Preserve mathematical notation faithfully.
- Include every question in the markscheme, in order.
- Do not include any text outside the JSON object.`;

export async function segmentMarkscheme(markschemePdfPath: string): Promise<MarkschemeSegmentation> {
  const doc = await pdfDocumentBlock(markschemePdfPath);
  return callForJson<MarkschemeSegmentation>(
    MARKSCHEME_SYSTEM_PROMPT,
    doc,
    'Segment this IB Math markscheme. Respond with ONLY the JSON object described in the system prompt -- start your reply with { and end with }, no markdown code fences, no explanation before or after.'
  );
}
