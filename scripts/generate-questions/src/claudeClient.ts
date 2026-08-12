import Anthropic from '@anthropic-ai/sdk';
import { env } from './env.js';

export const client = new Anthropic({ apiKey: env.anthropicApiKey });

/**
 * This model rejects assistant-message prefill ("conversation must end with
 * a user message"), so instead of forcing the reply open with "{" we rely on
 * the system prompt's "JSON only" instruction and extract the first {...}
 * object from whatever text comes back (tolerates stray markdown fences).
 * Mirrors scripts/ingest-paper/src/claudeSegment.ts.
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

export async function callForJson<T>(system: string, userText: string, maxTokens = 8000): Promise<T> {
  const resp = await client.messages
    .stream({
      model: env.claudeModel,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: [{ type: 'text', text: userText }] }],
    })
    .finalMessage();
  if (resp.stop_reason === 'max_tokens') {
    throw new Error(`Claude's response was truncated (hit the ${maxTokens} output-token cap) before finishing the JSON.`);
  }
  const textBlock = resp.content.find((b): b is Anthropic.Messages.TextBlock => b.type === 'text');
  if (!textBlock) throw new Error('Claude returned no text content block.');
  return extractJson<T>(textBlock.text);
}

export async function callForText(system: string, userText: string, maxTokens = 4000): Promise<string> {
  const resp = await client.messages
    .stream({
      model: env.claudeModel,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: [{ type: 'text', text: userText }] }],
    })
    .finalMessage();
  const textBlock = resp.content.find((b): b is Anthropic.Messages.TextBlock => b.type === 'text');
  if (!textBlock) throw new Error('Claude returned no text content block.');
  return textBlock.text.trim();
}
