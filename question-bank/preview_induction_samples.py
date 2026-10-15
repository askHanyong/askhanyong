"""Renders 10 sample variants of the new aa1_2_proof_by_induction template
to a standalone review HTML (reusing generate_review_sheet's rendering
helpers) WITHOUT touching bank.db -- for human review before the first
real batch, per the "10 sample renders" rule.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from templates_aa1_15 import aa1_15_series_sum_induction as aa1_2_proof_by_induction
from generate_review_sheet import render_question, render_all_math, substitute_tokens, PRINT_CSS
import html
import shutil

ROOT = Path(__file__).parent
TOOL_DIR = ROOT / "review_sheet_tool"
KATEX_CSS_SRC = TOOL_DIR / "node_modules" / "katex" / "dist" / "katex.min.css"
KATEX_FONTS_SRC = TOOL_DIR / "node_modules" / "katex" / "dist" / "fonts"

VARIANTS = [
    dict(p=2, q=-1), dict(p=3, q=0), dict(p=4, q=-2), dict(p=5, q=1), dict(p=2, q=3),
    dict(p=3, q=-4), dict(p=6, q=-3), dict(p=1, q=2), dict(p=4, q=0), dict(p=7, q=-5),
]


def main():
    out_dir = ROOT / "review_output" / "preview_induction"
    qs = []
    for i, kwargs in enumerate(VARIANTS):
        q = aa1_2_proof_by_induction(**kwargs)
        q["blueprint_cell"] = "AA1.2|HL|none|template|hard"
        q["id"] = f"preview_induction_{i}"
        q["check_status"] = "passed"
        q["check_log"] = None
        qs.append(q)

    counter = [0]
    blocks = []
    all_jobs = []
    for q in qs:
        block, jobs = render_question(q, counter)
        blocks.append(block)
        all_jobs += jobs

    rendered_math = render_all_math(all_jobs)
    final_blocks = [substitute_tokens(b, rendered_math) for b in blocks]

    out_dir.mkdir(parents=True, exist_ok=True)
    assets_dir = out_dir / "assets" / "katex"
    assets_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy(KATEX_CSS_SRC, assets_dir / "katex.min.css")
    fonts_dest = assets_dir / "fonts"
    if fonts_dest.exists():
        shutil.rmtree(fonts_dest)
    shutil.copytree(KATEX_FONTS_SRC, fonts_dest)

    html_doc = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>PREVIEW -- aa1_2_proof_by_induction (not in bank.db)</title>
<link rel="stylesheet" href="assets/katex/katex.min.css">
<style>{PRINT_CSS}</style>
</head>
<body>
<div class="batch-header">
  <h1>PREVIEW &mdash; aa1_2_proof_by_induction (10 samples, NOT inserted into bank.db)</h1>
  <p>{len(qs)} sample question(s) for review before the first real batch.</p>
</div>
{"".join(final_blocks)}
</body>
</html>
"""
    (out_dir / "preview.html").write_text(html_doc, encoding="utf-8")
    print(f"Wrote {out_dir / 'preview.html'} ({len(qs)} samples).")


if __name__ == "__main__":
    main()
