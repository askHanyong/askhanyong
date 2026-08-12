import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs/promises';
import { env } from './env.js';

export const supabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

export async function resolveSubjectId(code: string): Promise<string> {
  const { data, error } = await supabase.from('subjects').select('id').eq('code', code).single();
  if (error || !data) {
    throw new Error(`Could not resolve subject_id for code "${code}": ${error?.message ?? 'not found'}`);
  }
  return data.id as string;
}

export async function uploadPdf(bucket: string, destPath: string, localFilePath: string): Promise<string> {
  const buf = await fs.readFile(localFilePath);
  const { error } = await supabase.storage.from(bucket).upload(destPath, buf, {
    contentType: 'application/pdf',
    upsert: false,
  });
  if (error) {
    throw new Error(`Upload to ${bucket}/${destPath} failed: ${error.message}`);
  }
  return destPath;
}

/**
 * Calls the ingest_paper Postgres function (see supabase/migrations/
 * 20260812000005_ingest_function.sql). That function body is one implicit
 * transaction, so this either fully succeeds or leaves no rows behind for
 * this paper. It does NOT cover the storage uploads that happen before this
 * call -- if this fails after uploadPdf() has already run, the uploaded
 * files are orphaned in storage (no papers row will reference them). True
 * cross-system (storage + DB) atomicity isn't achievable through the
 * Supabase client SDK; only the DB writes are transactional.
 */
export async function ingestPaper(payload: unknown): Promise<string> {
  const { data, error } = await supabase.rpc('ingest_paper', { payload });
  if (error) {
    throw new Error(`ingest_paper RPC failed (no rows were written -- the DB function is transactional): ${error.message}`);
  }
  return data as string;
}
