"""Renders sample variants of the 3 new AA1.15 induction domains
(divisibility, differentiation, geometric series) to a standalone review
HTML, WITHOUT touching bank.db -- for human review before the first real
batch, per the "10 sample renders" rule. The series-sum domain isn't
re-previewed here (relocated from AA1.2 with no content change; already
reviewed and approved).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from templates_aa1_15 import (
    aa1_15_divisibility_induction,
    aa1_15_derivative_induction,
    aa1_15_geometric_series_induction,
)
from generate_review_sheet import render_question, render_all_math, substitute_tokens, PRINT_CSS
import shutil

ROOT = Path(__file__).parent
TOOL_DIR = ROOT / "review_sheet_tool"
KATEX_CSS_SRC = TOOL_DIR / "node_modules" / "katex" / "dist" / "katex.min.css"
KATEX_FONTS_SRC = TOOL_DIR / "node_modules" / "katex" / "dist" / "fonts"

DIVISIBILITY_VARIANTS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
DERIVATIVE_VARIANTS = [2, 3, -2, 4, -3, 5, -4, 6, -5, 7]
GEOMETRIC_VARIANTS = [(2, 3), (5, 2), (1, 4), (3, -2), (4, 5), (2, -3), (6, 2), (1, -2), (5, 3), (3, 4)]


def main():
    out_dir = ROOT / "review_output" / "preview_aa1_15"
    qs = []
    i = 0
    for D in DIVISIBILITY_VARIANTS:
        q = aa1_15_divisibility_induction(D)
        q["blueprint_cell"] = "AA1.15|HL|none|template|hard|divisibility"
        q["id"] = f"preview_aa1_15_div_{i}"
        q["check_status"] = "passed"
        q["check_log"] = None
        qs.append(q)
        i += 1
    for a in DERIVATIVE_VARIANTS:
        q = aa1_15_derivative_induction(a)
        q["blueprint_cell"] = "AA1.15|HL|none|template|hard|derivative"
        q["id"] = f"preview_aa1_15_deriv_{i}"
        q["check_status"] = "passed"
        q["check_log"] = None
        qs.append(q)
        i += 1
    for a, x in GEOMETRIC_VARIANTS:
        q = aa1_15_geometric_series_induction(a, x)
        q["blueprint_cell"] = "AA1.15|HL|none|template|hard|geometric"
        q["id"] = f"preview_aa1_15_gp_{i}"
        q["check_status"] = "passed"
        q["check_log"] = None
        qs.append(q)
        i += 1

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
<title>PREVIEW -- AA1.15 new induction domains (not in bank.db)</title>
<link rel="stylesheet" href="assets/katex/katex.min.css">
<style>{PRINT_CSS}</style>
</head>
<body>
<div class="batch-header">
  <h1>PREVIEW &mdash; AA1.15 divisibility / differentiation / geometric-series induction (30 samples, NOT inserted into bank.db)</h1>
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
