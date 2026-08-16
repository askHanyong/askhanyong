import pdf from 'pdf-parse';
import fs from 'node:fs';

const file = process.argv[2];
const buf = fs.readFileSync(file);
const data = await pdf(buf);
fs.writeFileSync(file.replace('.pdf', '.txt'), data.text);
console.log('pages:', data.numpages, 'chars:', data.text.length);
