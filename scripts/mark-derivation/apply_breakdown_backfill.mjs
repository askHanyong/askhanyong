import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const envText = fs.readFileSync(path.resolve(__dirname, '../../.env'), 'utf8');
const env = {};
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
}

const SUPABASE_URL = env.SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const data = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'breakdown_backfill_2021_2022.json'), 'utf8'));

let ok = 0, fail = 0;
for (const [partId, breakdown] of Object.entries(data)) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/markscheme_parts?question_part_id=eq.${partId}`, {
    method: 'PATCH',
    headers: {
      'apikey': KEY,
      'Authorization': `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({ marks_breakdown: breakdown }),
  });
  const body = await res.json();
  if (!res.ok) {
    console.error('FAIL', partId, res.status, JSON.stringify(body));
    fail++;
  } else if (Array.isArray(body) && body.length === 1) {
    console.log('OK', partId);
    ok++;
  } else {
    console.error('UNEXPECTED', partId, res.status, JSON.stringify(body));
    fail++;
  }
}
console.log(`Done: ${ok} ok, ${fail} failed`);
