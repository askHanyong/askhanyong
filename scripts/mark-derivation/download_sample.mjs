import { supabase } from '../ingest-paper/src/supabaseIngest.ts';
import fs from 'node:fs';

const paths = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const outdir = process.argv[3];
fs.mkdirSync(outdir, { recursive: true });

for (const p of paths) {
  const bucket = p.includes('_markscheme') ? 'markschemes-private' : 'papers-private';
  const { data, error } = await supabase.storage.from(bucket).download(p);
  if (error) { console.error('FAIL', p, error.message); continue; }
  const buf = Buffer.from(await data.arrayBuffer());
  const outfile = `${outdir}/${p.split('/').pop()}`;
  fs.writeFileSync(outfile, buf);
  console.log('ok', p, '->', outfile, buf.length);
}
