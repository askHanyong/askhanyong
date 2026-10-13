// Pre-renders a batch of LaTeX spans to static HTML via KaTeX's Node API --
// used so the review sheet needs NO client-side JS to display correctly
// (more robust for offline viewing/printing than shipping katex.js +
// auto-render and hoping it finishes before the page is printed).
//
// Usage: node render_math_batch.mjs <input.json> <output.json>
//   input.json:  [{ "id": "...", "latex": "...", "display": true|false }, ...]
//   output.json: { "<id>": "<rendered HTML string>", ... }
import katex from 'katex';
import { readFileSync, writeFileSync } from 'node:fs';

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error('Usage: node render_math_batch.mjs <input.json> <output.json>');
  process.exit(1);
}

const jobs = JSON.parse(readFileSync(inPath, 'utf8'));
const out = {};
const errors = [];

for (const job of jobs) {
  try {
    out[job.id] = katex.renderToString(job.latex, {
      displayMode: !!job.display,
      throwOnError: true,
      strict: 'warn',
    });
  } catch (err) {
    errors.push({ id: job.id, latex: job.latex, error: err.message });
    // Fall back to showing the raw source so a bad span is visible/fixable
    // in the review sheet rather than silently vanishing.
    const esc = job.latex.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    out[job.id] = `<span class="katex-render-error" title="KaTeX render failed: ${esc.replace(/"/g, '&quot;')}">${job.display ? '$$' : '$'}${esc}${job.display ? '$$' : '$'}</span>`;
  }
}

writeFileSync(outPath, JSON.stringify(out));
if (errors.length > 0) {
  console.error(`${errors.length} LaTeX span(s) failed to render (fell back to raw source, see .katex-render-error in the HTML):`);
  for (const e of errors) console.error(`  [${e.id}] ${e.error} -- source: ${e.latex.slice(0, 80)}`);
}
console.log(`Rendered ${Object.keys(out).length - errors.length}/${jobs.length} math spans cleanly.`);
