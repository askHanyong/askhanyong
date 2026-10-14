"""Builds the review sheet (self-contained HTML, one question per printed
page, KaTeX bundled offline) + review.csv for a batch of questions in
bank.db. No PDF toolchain -- HTML is the deliverable per instruction.

Usage: python3 -I generate_review_sheet.py <batch_id> [--out-dir DIR]

Math rendering is delegated to review_sheet_tool/render_math_batch.mjs
(KaTeX's Node API, pre-rendered to static HTML -- no client-side JS needed
to view the result correctly, which matters for a file a teacher opens
offline/prints). Everything else (querying bank.db, HTML/CSS assembly,
review.csv) is plain Python, no dependencies.
"""
import html
import json
import re
import shutil
import sqlite3
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent
DB_PATH = ROOT / "bank.db"
TOOL_DIR = ROOT / "review_sheet_tool"
KATEX_CSS_SRC = TOOL_DIR / "node_modules" / "katex" / "dist" / "katex.min.css"
KATEX_FONTS_SRC = TOOL_DIR / "node_modules" / "katex" / "dist" / "fonts"

# Delimiters must not be preceded by a backslash, so an escaped literal dollar
# sign (e.g. the currency amount in "$\$215$") is never mistaken for a span
# boundary -- without this, "$\$215$" splits as span="\" + stray literal "215$".
MATH_SPAN_RE = re.compile(r"(?<!\\)\$\$(.+?)(?<!\\)\$\$|(?<!\\)\$(.+?)(?<!\\)\$", re.DOTALL)


def split_math_spans(text: str, counter: list) -> tuple[str, list[dict]]:
    """Replaces $$...$$/$...$ spans in `text` with placeholder tokens, HTML-escapes
    the surrounding prose, and returns (templated_html, [{id, latex, display}, ...]).
    `counter` is a single-element mutable list used as a shared, ever-increasing
    id source across the whole batch so every math span gets a unique token."""
    if text is None:
        return "", []
    jobs = []
    pieces = []
    last_end = 0
    for m in MATH_SPAN_RE.finditer(text):
        pieces.append(html.escape(text[last_end:m.start()]))
        display = m.group(1) is not None
        latex = m.group(1) if display else m.group(2)
        counter[0] += 1
        token = f"@@MATH{counter[0]}@@"
        jobs.append({"id": token, "latex": latex, "display": display})
        pieces.append(token)
        last_end = m.end()
    pieces.append(html.escape(text[last_end:]))
    return "".join(pieces), jobs


def render_all_math(all_jobs: list[dict]) -> dict[str, str]:
    if not all_jobs:
        return {}
    in_path = ROOT / "_math_batch_in.json"
    out_path = ROOT / "_math_batch_out.json"
    in_path.write_text(json.dumps(all_jobs))
    result = subprocess.run(
        ["node", str(TOOL_DIR / "render_math_batch.mjs"), str(in_path), str(out_path)],
        capture_output=True, text=True,
    )
    print(result.stdout, end="")
    if result.returncode != 0:
        raise RuntimeError(f"render_math_batch.mjs failed:\n{result.stderr}")
    if result.stderr:
        print(result.stderr, file=sys.stderr, end="")
    rendered = json.loads(out_path.read_text())
    in_path.unlink()
    out_path.unlink()
    return rendered


def substitute_tokens(templated: str, rendered: dict[str, str]) -> str:
    for token, html_out in rendered.items():
        templated = templated.replace(token, html_out)
    return templated


STATUS_LABEL = {
    "passed": ("PASS", "status-pass"),
    "failed": ("FAIL", "status-fail"),
    "error": ("ERROR", "status-error"),
    "pending": ("NOT YET CHECKED", "status-pending"),
}

PRINT_CSS = """
:root {
  --ink: #1c2a33;
  --muted: #6b7680;
  --border: #d7dde2;
  --pass: #1a7f4e;
  --fail: #b3261e;
  --error: #b3261e;
  --pending: #8a6d1a;
  --pass-bg: #e8f6ef;
  --fail-bg: #fbeceb;
  --error-bg: #fbeceb;
  --pending-bg: #fbf3e1;
}
* { box-sizing: border-box; }
body {
  font-family: Georgia, 'Times New Roman', serif;
  color: var(--ink);
  margin: 0;
  background: #f4f6f7;
}
.batch-header {
  padding: 1.5rem 2rem;
  background: #fff;
  border-bottom: 2px solid var(--ink);
}
.batch-header h1 { margin: 0 0 0.25rem; font-size: 1.5rem; }
.batch-header p { margin: 0; color: var(--muted); font-family: Helvetica, Arial, sans-serif; font-size: 0.9rem; }

.question-page {
  max-width: 760px;
  margin: 1.5rem auto;
  padding: 1.75rem 2rem 2rem;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 6px;
  break-after: page;
  page-break-after: always;
}
.question-page:last-child { break-after: auto; page-break-after: auto; }

.q-meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  align-items: center;
  font-family: Helvetica, Arial, sans-serif;
  font-size: 0.8rem;
  color: var(--muted);
  margin-bottom: 0.75rem;
  border-bottom: 1px solid var(--border);
  padding-bottom: 0.75rem;
}
.q-id { font-family: 'Courier New', monospace; font-size: 0.78rem; }
.q-badge {
  font-family: Helvetica, Arial, sans-serif;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  border: 1px solid currentColor;
}
.status-pass { color: var(--pass); background: var(--pass-bg); }
.status-fail { color: var(--fail); background: var(--fail-bg); }
.status-error { color: var(--error); background: var(--error-bg); }
.status-pending { color: var(--pending); background: var(--pending-bg); }

h2.q-heading { font-size: 1.1rem; margin: 0 0 0.75rem; }
.q-section { margin-bottom: 1.1rem; }
.q-section > .label {
  font-family: Helvetica, Arial, sans-serif;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 0.3rem;
}
.q-stem, .q-part-text { line-height: 1.6; }
.q-parts-list { padding-left: 0; list-style: none; margin: 0; }
.q-parts-list > li { margin-bottom: 0.9rem; padding-left: 1rem; border-left: 2px solid var(--border); }
.q-part-label { font-weight: 700; margin-right: 0.3rem; }
.q-part-marks { color: var(--muted); font-family: Helvetica, Arial, sans-serif; font-size: 0.8rem; }
.q-part-answer { margin-top: 0.3rem; font-style: italic; }
.q-markscheme-lines { margin: 0.3rem 0 0; padding-left: 1.2rem; font-family: Helvetica, Arial, sans-serif; font-size: 0.85rem; color: #3a4750; }
.q-markscheme-lines li { margin-bottom: 0.15rem; }
.q-markscheme-note { font-weight: 700; margin-right: 0.3rem; }

.q-params-table { border-collapse: collapse; font-family: 'Courier New', monospace; font-size: 0.85rem; }
.q-params-table td { padding: 0.15rem 0.6rem 0.15rem 0; }
.q-params-table td:first-child { color: var(--muted); }

.q-check-log {
  background: #f7f8f9;
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.6rem 0.8rem;
  font-family: 'Courier New', monospace;
  font-size: 0.78rem;
  white-space: pre-wrap;
  word-break: break-word;
}

.katex-render-error { color: var(--fail); background: var(--fail-bg); border: 1px dashed var(--fail); padding: 0 0.2rem; }

@media print {
  body { background: #fff; }
  .batch-header { display: none; }
  .question-page {
    margin: 0;
    border: none;
    border-radius: 0;
    max-width: none;
    box-shadow: none;
  }
  .q-badge, .status-pass, .status-fail, .status-error, .status-pending {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}
"""


def render_question(q: dict, counter: list) -> tuple[str, list[dict]]:
    jobs = []
    stem_html, j = split_math_spans(q["stem_latex"], counter)
    jobs += j

    parts = json.loads(q["parts_json"]) if q["parts_json"] else []
    parts_html_items = []
    for part in parts:
        text_html, j = split_math_spans(part.get("text", ""), counter)
        jobs += j
        answer_html, j = split_math_spans(part.get("answer", ""), counter)
        jobs += j
        ms_lines = part.get("markscheme_lines", []) or []
        ms_items = []
        for line in ms_lines:
            desc_html, j = split_math_spans(line.get("desc", ""), counter)
            jobs += j
            ms_items.append(
                f'<li><span class="q-markscheme-note">{html.escape(line.get("note", ""))}</span>{desc_html}</li>'
            )
        label = html.escape(part.get("label", ""))
        marks = part.get("marks", "")
        parts_html_items.append(
            f'<li><span class="q-part-label">({label})</span>'
            f'<span class="q-part-marks">[{marks}]</span>'
            f'<div class="q-part-text">{text_html}</div>'
            f'<div class="q-part-answer">Answer: {answer_html}</div>'
            f'<ul class="q-markscheme-lines">{"".join(ms_items)}</ul></li>'
        )

    status_label, status_class = STATUS_LABEL.get(q["check_status"], (q["check_status"].upper(), "status-pending"))

    params_html = ""
    if q["mode"] == "template":
        params = {}
        try:
            parsed = json.loads(q["check_log"]) if q["check_log"] else {}
            params = parsed.get("params", {}) if isinstance(parsed, dict) else {}
        except (json.JSONDecodeError, TypeError):
            params = {}
        if params:
            rows = "".join(f"<tr><td>{html.escape(str(k))}</td><td>{html.escape(str(v))}</td></tr>" for k, v in params.items())
            params_html = f'<div class="q-section"><div class="label">Template parameters</div><table class="q-params-table">{rows}</table></div>'

    check_log_text = "(none)"
    if q["check_log"]:
        try:
            parsed_log = json.loads(q["check_log"])
        except (json.JSONDecodeError, TypeError):
            parsed_log = None
        if isinstance(parsed_log, dict) and q["mode"] == "bespoke" and "detail" in parsed_log:
            check_log_text = parsed_log["detail"]
        elif isinstance(parsed_log, dict) and q["mode"] == "template":
            check_log_text = f"stdout: {parsed_log.get('stdout', '').strip()}\nstderr: {parsed_log.get('stderr', '').strip() or '(none)'}"
        else:
            check_log_text = q["check_log"]
    check_log_html = f'<div class="q-section"><div class="label">Check result (independent for bespoke; self-reported for template)</div><div class="q-check-log">{html.escape(check_log_text)}</div></div>'

    block = f"""
<section class="question-page">
  <div class="q-meta-row">
    <span class="q-id">{html.escape(q['id'])}</span>
    <span>{html.escape(q['topic_code'])}</span>
    <span>{html.escape(q['level'])} &middot; {html.escape(q['paper_type'])} &middot; {html.escape(q['calculator'])} &middot; Section {html.escape(q['section'])}</span>
    <span>{q['total_marks']} marks</span>
    <span>{html.escape(q['mode'])}</span>
    <span>{html.escape(q['difficulty'] or '')}</span>
    <span class="q-badge {status_class}">{status_label}</span>
  </div>
  <h2 class="q-heading">Blueprint cell: {html.escape(q['blueprint_cell'])}</h2>
  <div class="q-section">
    <div class="label">Stem</div>
    <div class="q-stem">{stem_html}</div>
  </div>
  <div class="q-section">
    <div class="label">Parts, answers &amp; mark scheme</div>
    <ol class="q-parts-list">{"".join(parts_html_items)}</ol>
  </div>
  {params_html}
  {check_log_html}
</section>
"""
    return block, jobs


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 -I generate_review_sheet.py <batch_id> [--out-dir DIR]")
        sys.exit(1)
    batch_id = sys.argv[1]
    out_dir = ROOT / "review_output" / batch_id
    if "--out-dir" in sys.argv:
        out_dir = Path(sys.argv[sys.argv.index("--out-dir") + 1])

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "select * from questions where batch_id = ? order by topic_code, blueprint_cell, id", (batch_id,)
    ).fetchall()
    conn.close()

    if not rows:
        print(f"No questions found in bank.db for batch_id='{batch_id}'. Nothing to render.")
        sys.exit(1)

    counter = [0]
    blocks = []
    all_jobs = []
    for row in rows:
        q = dict(row)
        block, jobs = render_question(q, counter)
        blocks.append((q["id"], block))
        all_jobs += jobs

    rendered_math = render_all_math(all_jobs)
    final_blocks = [substitute_tokens(block, rendered_math) for _, block in blocks]

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
<title>Review sheet -- batch {html.escape(batch_id)}</title>
<link rel="stylesheet" href="assets/katex/katex.min.css">
<style>{PRINT_CSS}</style>
</head>
<body>
<div class="batch-header">
  <h1>Review sheet &mdash; batch {html.escape(batch_id)}</h1>
  <p>{len(rows)} question(s). Self-contained: open this file directly, no network needed. One question per printed page.</p>
</div>
{"".join(final_blocks)}
</body>
</html>
"""
    (out_dir / "review.html").write_text(html_doc, encoding="utf-8")

    import csv
    with open(out_dir / "review.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["id", "decision", "note"])
        for row in rows:
            writer.writerow([row["id"], "", ""])

    print(f"\nWrote {out_dir / 'review.html'} ({len(rows)} questions) and {out_dir / 'review.csv'}.")
    print(f"KaTeX assets copied to {assets_dir} (offline, no CDN).")


if __name__ == "__main__":
    main()
