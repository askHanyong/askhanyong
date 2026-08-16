import { supabase } from '../ingest-paper/src/supabaseIngest.ts';
import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const outdir = process.argv[3];
fs.mkdirSync(outdir, { recursive: true });

for (const p of manifest) {
  for (const [kind, bucket, path] of [['paper','papers-private',p.paper_path], ['ms','markschemes-private',p.ms_path]]) {
    const { data, error } = await supabase.storage.from(bucket).download(path);
    if (error) { console.error('FAIL', kind, p.id, error.message); continue; }
    const buf = Buffer.from(await data.arrayBuffer());
    fs.writeFileSync(`${outdir}/${p.id}_${kind}.pdf`, buf);
    console.log('ok', kind, p.id, buf.length);
  }
}
