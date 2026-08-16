import { supabase } from '../ingest-paper/src/supabaseIngest.ts';
import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const outdir = process.argv[3];
fs.mkdirSync(outdir, { recursive: true });

for (const p of manifest) {
  const { data, error } = await supabase.storage.from('papers-private').download(p.path);
  if (error) { console.error('FAIL', p.path, error.message); continue; }
  const buf = Buffer.from(await data.arrayBuffer());
  const outfile = `${outdir}/${p.id}.pdf`;
  fs.writeFileSync(outfile, buf);
  console.log('ok', p.id, buf.length);
}
