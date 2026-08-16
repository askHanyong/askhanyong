import pdf from '../ingest-paper/node_modules/pdf-parse/index.js';
import fs from 'node:fs';

const indir = process.argv[2];
const outdir = process.argv[3];
fs.mkdirSync(outdir, { recursive: true });

const files = fs.readdirSync(indir).filter(f => f.endsWith('.pdf'));
for (const f of files) {
  const buf = fs.readFileSync(`${indir}/${f}`);
  const data = await pdf(buf);
  const outfile = `${outdir}/${f.replace('.pdf', '.txt')}`;
  fs.writeFileSync(outfile, data.text);
  console.log('extracted', f, data.text.length, 'chars');
}
