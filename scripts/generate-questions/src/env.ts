import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// repo root .env: src -> generate-questions -> scripts -> repo root
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required env var: ${name}. Set it in the repo root .env (see supabase/README.md).`
    );
  }
  return value;
}

export const env = {
  supabaseUrl: required('SUPABASE_URL'),
  supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  anthropicApiKey: required('ANTHROPIC_API_KEY'),
  claudeModel: process.env.CLAUDE_MODEL ?? 'claude-sonnet-5',
};
