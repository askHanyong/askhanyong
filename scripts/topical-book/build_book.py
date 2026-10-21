#!/usr/bin/env python3
"""Build topical question and solution books (PDF) from the exported tables.

Layout: Topic 1-5 > Paper 1 (Non-GDC) / Paper 2 (GDC) > Section A / Section B.
Each question appears once, under the topic with the most (primary-tagged)
marks; every other topic it touches gets a "see Topic X" line.
Inside a block: subtopic, then date.

Standard library only; needs xelatex on PATH.
"""
import argparse
import json
import re
import shutil
import os
import subprocess
import sys
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
TABLES = ["subjects", "syllabus_topics", "papers", "questions",
          "question_parts", "markscheme_parts", "part_topic_tags"]
SCOPE = {("May", y) for y in range(2021, 2025)} | {("Nov", y) for y in range(2021, 2024)}
PAPERS = {1: "Paper 1 (Non-GDC)", 2: "Paper 2 (GDC)"}
SESSION_ORDER = {"May": 0, "Nov": 1}
SECTION_B_MIN = 11
IMG_EXTS = (".png", ".jpg", ".jpeg", ".pdf")
MAX_FIX_ROUNDS = 8


# --------------------------------------------------------------------------- data

def load_raw(raw_dir):
    raw = {}
    for t in TABLES:
        f = Path(raw_dir) / f"{t}.json"
        if not f.exists():
            sys.exit(f"ERROR: {f} not found. Run export.py first.")
        raw[t] = json.loads(f.read_text(encoding="utf-8"))
    return raw


def code_key(code):
    m = re.search(r"(\d+)\.(\d+)", code or "")
    return (int(m.group(1)), int(m.group(2))) if m else (99, 99)


def build_model(raw, level):
    topics = {t["id"]: t for t in raw["syllabus_topics"]}
    topic_names = {t["topic_number"]: t["topic_name"] for t in raw["syllabus_topics"]}
    papers = {p["id"]: p for p in raw["papers"]
              if p["level"] == level and p["paper_number"] in PAPERS
              and (p["session"], p["year"]) in SCOPE}
    questions = {q["id"]: dict(q, parts=[], paper=papers[q["paper_id"]])
                 for q in raw["questions"] if q["paper_id"] in papers}
    parts = {}
    for qp in raw["question_parts"]:
        q = questions.get(qp["question_id"])
        if q:
            p = dict(qp, tags=[], ms=None)
            q["parts"].append(p)
            parts[p["id"]] = p
    for ms in raw["markscheme_parts"]:
        if ms["question_part_id"] in parts:
            parts[ms["question_part_id"]]["ms"] = ms
    for t in raw["part_topic_tags"]:
        if t["question_part_id"] in parts and t["topic_id"] in topics:
            parts[t["question_part_id"]]["tags"].append(dict(t, topic=topics[t["topic_id"]]))
    for q in questions.values():
        q["parts"].sort(key=lambda p: (p["order_index"], p["part_label"]))
        for p in q["parts"]:
            p["tags"].sort(key=lambda t: (not t["is_primary"], code_key(t["topic"]["code"])))
        analyse(q)
    return papers, questions, topic_names


def analyse(q):
    """Pick home topic, subtopic per touched topic, section and sort keys."""
    marks_by_topic = defaultdict(int)
    marks_by_code = defaultdict(int)
    first_seen = {}
    touched = defaultdict(set)  # topic_number -> codes (primary or secondary)
    for i, p in enumerate(q["parts"]):
        for t in p["tags"]:
            touched[t["topic"]["topic_number"]].add(t["topic"]["code"])
        if p["tags"]:
            top = p["tags"][0]["topic"]  # primary first after sort
            n = top["topic_number"]
            marks_by_topic[n] += p["marks"] or 0
            marks_by_code[top["code"]] += p["marks"] or 0
            first_seen.setdefault(n, i)

    q["home"] = (max(marks_by_topic, key=lambda n: (marks_by_topic[n], -first_seen[n], -n))
                 if marks_by_topic else None)
    q["sub"] = {}
    for n, codes in touched.items():
        q["sub"][n] = max(sorted(codes, key=code_key), key=lambda c: marks_by_code.get(c, 0))
    q["codes"] = sorted({c for cs in touched.values() for c in cs}, key=code_key)

    total = sum(p["marks"] or 0 for p in q["parts"])
    q["parts_total"] = total
    q["marks"] = q["total_marks"] if q.get("total_marks") is not None else total
    q["section"] = "B" if q["marks"] >= SECTION_B_MIN else "A"
    pp = q["paper"]
    q["date_key"] = (pp["year"], SESSION_ORDER[pp["session"]], pp.get("time_zone") or "",
                     pp["paper_number"], q["question_number"])
    tz = f" {pp['time_zone']}" if pp.get("time_zone") else ""
    q["label"] = f"{pp['session']} {pp['year']}{tz} · Paper {pp['paper_number']} · Question {q['question_number']}"
    q["short"] = f"{pp['session']} {pp['year']}{tz} P{pp['paper_number']} Q{q['question_number']}"
    q["img_key"] = (f"{pp['level']}_{pp['year']}_{pp['session']}_{pp.get('time_zone') or 'TZ0'}"
                    f"_P{pp['paper_number']}_Q{q['question_number']}")


def layout(questions):
    """blocks[(topic, paper, section)] -> sorted list of ("q"|"ref", question)."""
    blocks = defaultdict(list)
    for q in questions.values():
        if q["home"] is None:
            continue
        paper, sec = q["paper"]["paper_number"], q["section"]
        for n, code in q["sub"].items():
            kind = "q" if n == q["home"] else "ref"
            blocks[(n, paper, sec)].append(((code_key(code), q["date_key"], kind), kind, q))
    for k in blocks:
        blocks[k].sort(key=lambda e: e[0])
        blocks[k] = [(kind, q) for _, kind, q in blocks[k]]
    # item numbers "topic.k" in reading order
    for n in sorted({k[0] for k in blocks}):
        i = 0
        for paper in PAPERS:
            for sec in "AB":
                for kind, q in blocks.get((n, paper, sec), []):
                    if kind == "q":
                        i += 1
                        q["item"] = f"{n}.{i}"
    return blocks


# --------------------------------------------------------------------------- text -> LaTeX

TEXT_ESC = {"\\": r"\textbackslash{}", "&": r"\&", "%": r"\%", "#": r"\#", "_": r"\_",
            "{": r"\{", "}": r"\}", "~": r"\textasciitilde{}", "^": r"\textasciicircum{}",
            "$": r"\$", "<": r"\textless{}", ">": r"\textgreater{}", "|": r"\textbar{}"}
SUP = {"⁻": "-", "¹": "1", "²": "2", "³": "3", "⁰": "0", "⁴": "4", "⁵": "5"}
SUP_RE = re.compile("[" + "".join(SUP) + "]+")
# Characters Latin Modern text fonts lack: typeset them in math mode (unicode-math has them).
MATH_CHARS = set("αβγδεζηθικλμνξπρστυφχψωΓΔΘΛΞΠΣΦΨΩ⇒⇔→←↔≤≥≠≈∞∴∈∉⊂∪∩√∫∑′″−")
MARK_TAIL = re.compile(r"^(.*?)((?:\s*\(?(?:[AMRN]\d|AG)\)?)+)\s*$")
MARKS_LINE = re.compile(r"^\s*((?:Total\s*)?\[\s*\d+\s*marks?\s*\])\s*$", re.I)


def esc_text(s):
    out = []
    for ch in s:
        if ch in TEXT_ESC:
            out.append(TEXT_ESC[ch])
        elif ch in MATH_CHARS:
            out.append(f"${ch}$")
        else:
            out.append(ch)
    return SUP_RE.sub(lambda m: r"\textsuperscript{" + "".join(SUP[c] for c in m.group()) + "}",
                      "".join(out))


def fix_math(s):
    return SUP_RE.sub(lambda m: "^{" + "".join(SUP[c] for c in m.group()) + "}", s.strip())


def tokenize(s):
    """Split into ("text"|"inline"|"display", content). Unmatched $ stays literal text."""
    toks, buf, i, n = [], [], 0, len(s)
    while i < n:
        if s.startswith("\\$", i):
            buf.append("$")
            i += 2
            continue
        if s.startswith("$$", i):
            j = s.find("$$", i + 2)
            if j != -1:
                toks.append(("text", "".join(buf)))
                buf = []
                toks.append(("display", s[i + 2:j]))
                i = j + 2
                continue
        elif s[i] == "$":
            j = i + 1
            while j < n and not (s[j] == "$" and s[j - 1] != "\\"):
                j += 1
            if j < n and "\n\n" not in s[i:j] and s[i + 1:j].strip():
                toks.append(("text", "".join(buf)))
                buf = []
                toks.append(("inline", s[i + 1:j]))
                i = j + 1
                continue
        buf.append(s[i])
        i += 1
    toks.append(("text", "".join(buf)))
    return [t for t in toks if t[1]]


def display(m):
    m = fix_math(m)
    if ("\\\\" in m or "&" in m) and "\\begin{" not in m:
        return f"\\[\\begin{{aligned}}{m}\\end{{aligned}}\\]\n"
    return f"\\[{m}\\]\n"


def text_line(piece, ms):
    if ms:
        mm = MARKS_LINE.match(piece)
        if mm:
            return f"\\hspace*{{\\fill}}{{\\small\\itshape {esc_text(mm.group(1).strip())}}}"
        mt = MARK_TAIL.match(piece)
        if mt and (mt.group(1) == "" or mt.group(2)[:1].isspace()):
            return f"{esc_text(mt.group(1))}\\hspace*{{\\fill}}\\mk{{{esc_text(mt.group(2).strip())}}}"
    return esc_text(piece)


def to_latex(s, ms=False):
    """Markdown-ish text with $math$ to LaTeX. ms=True right-aligns mark codes (M1, A1, ...)."""
    s = (s or "").replace("\r\n", "\n")
    out = []
    toks = tokenize(s)
    for k, (kind, c) in enumerate(toks):
        if kind == "inline":
            out.append(f"${fix_math(c)}$")
        elif kind == "display":
            out.append(display(c))
        else:
            lines = c.split("\n")
            for li, piece in enumerate(lines):
                ends_line = li < len(lines) - 1 or k == len(toks) - 1
                out.append(text_line(piece, ms) if ends_line else esc_text(piece))
                if li < len(lines) - 1:
                    out.append("\\par\\smallskip\n" if piece.strip() == "" else "\\par\n")
    return "".join(out)


def to_safe(s):
    """Fallback: show the raw source as plain monospaced text (never fails to compile)."""
    lines = (s or "").replace("\r\n", "\n").split("\n")
    body = "\\par\n".join("".join(TEXT_ESC.get(ch, ch) for ch in ln) for ln in lines)
    return "{\\ttfamily\\small " + body + "}"


# --------------------------------------------------------------------------- document

PREAMBLE = r"""\documentclass[11pt,a4paper]{article}
\usepackage[margin=2cm,headheight=14pt]{geometry}
\usepackage{amsmath}
\usepackage{unicode-math}
\setmathfont{latinmodern-math.otf}
\usepackage{graphicx}
\usepackage{xcolor}
\usepackage[most]{tcolorbox}
\usepackage{fancyhdr}
\usepackage{needspace}
\usepackage[hidelinks,bookmarksnumbered]{hyperref}
\setlength{\parindent}{0pt}
\setlength{\parskip}{2pt}
\setcounter{secnumdepth}{0}
\setcounter{tocdepth}{2}
\pagestyle{fancy}\fancyhf{}
\fancyhead[L]{\small TITLE}\fancyhead[R]{\small\leftmark}
\fancyfoot[C]{\small\thepage}
\renewcommand{\sectionmark}[1]{\markboth{#1}{}}
\newcommand{\mk}[1]{\textbf{#1}}
\newcommand{\qhead}[4]{\par\needspace{6\baselineskip}\bigskip
  {\color{black!12}\hrule height 0.6pt}\smallskip
  \noindent{\large\bfseries #1}\quad\textbf{#2}\hfill[#3]\par
  {\footnotesize\color{black!55}#4}\par\nopagebreak\smallskip}
\newcommand{\xref}[3]{\par\smallskip\noindent{\small\itshape\color{black!60}%
  #1 \,---\, see Topic #2, item \hyperref[item-#3]{#3}}\par}
\newenvironment{qpart}[2]{\par\smallskip\begin{list}{}{\leftmargin=2.4em\labelwidth=2em
  \labelsep=0.4em\topsep=0pt\parsep=2pt}\item[\textbf{#1}]\def\qpmarks{#2}}%
  {\ifx\qpmarks\empty\else\hspace*{\fill}\mbox{[\qpmarks]}\fi\end{list}}
\newcommand{\nodiagram}[1]{\begin{tcolorbox}[colback=orange!6,colframe=orange!70!black,
  boxrule=0.5pt,left=4pt,right=4pt,top=2pt,bottom=2pt,fonttitle=\small\bfseries,
  title=Diagram missing]\small #1\end{tcolorbox}}
\newcommand{\fallback}{{\footnotesize\color{red!70!black}[shown as raw text: LaTeX error]}\par}
\begin{document}
"""


def find_image(images_dir, q, part, idx, ref):
    """Look for data/images/<key>_<part>_<n>.<ext>, <key>_<part>.<ext>, or a filename in the ref."""
    if not images_dir or not images_dir.is_dir():
        return None
    label = re.sub(r"[^A-Za-z0-9]+", "", part["part_label"]) or "x"
    stems = [f"{q['img_key']}_{label}_{idx}", f"{q['img_key']}_{label}"]
    if idx == 1:
        stems.append(q["img_key"])
    for stem in stems:
        for ext in IMG_EXTS:
            f = images_dir / f"{stem}{ext}"
            if f.exists():
                return f
    name = Path(ref.strip()).name
    if name.lower().endswith(IMG_EXTS) and (images_dir / name).exists():
        return images_dir / name
    return None


class Doc:
    def __init__(self, kind, level, images_dir, build_dir):
        self.kind, self.level, self.images_dir, self.build_dir = kind, level, images_dir, build_dir
        self.lines = []
        self.ranges = []      # (start_line, end_line, question_id)
        self.img_found, self.img_missing, self.copied = 0, [], {}
        self.q_rendered, self.parts_rendered, self.xrefs = set(), 0, 0

    def add(self, s):
        self.lines.extend(s.split("\n"))

    def image(self, f):
        if f not in self.copied:
            dst = self.build_dir / f"img_{len(self.copied) + 1:04d}{f.suffix.lower()}"
            shutil.copyfile(f, dst)
            self.copied[f] = dst.name
        return self.copied[f]

    def question(self, q, safe):
        start = len(self.lines) + 1
        conv = (lambda s, ms=False: to_safe(s)) if safe else to_latex
        codes = " · ".join(q["codes"])
        self.add(f"\\phantomsection\\label{{item-{q['item']}}}")
        self.add(f"\\qhead{{{q['item']}}}{{{esc_text(q['label'])}}}{{{q['marks']} marks}}{{{esc_text(codes)}}}")
        if safe:
            self.add("\\fallback")
        for p in q["parts"]:
            label = p["part_label"].strip()
            label = f"({label})" if label and label not in ("-", "0") else ""
            body = []
            if self.kind == "questions":
                for i, ref in enumerate(p.get("image_refs") or [], 1):
                    f = find_image(self.images_dir, q, p, i, ref)
                    if f:
                        self.img_found += 1
                        body.append(f"\\begin{{center}}\\includegraphics[width=0.75\\linewidth,"
                                    f"height=9cm,keepaspectratio]{{{self.image(f)}}}\\end{{center}}")
                    else:
                        self.img_missing.append(f"{q['img_key']}_{re.sub(r'[^A-Za-z0-9]+', '', p['part_label']) or 'x'}_{i}: {ref}")
                        body.append(f"\\nodiagram{{{esc_text(ref)}}}")
                body.append(conv(p["part_text"]))
                marks = str(p["marks"]) if p["marks"] is not None else ""
            else:
                ms = p["ms"]["markscheme_text"] if p["ms"] else "[no markscheme in database]"
                body.append(conv(ms, ms=True))
                marks = ""
            self.add(f"\\begin{{qpart}}{{{esc_text(label)}}}{{{marks}}}\n" + "\n".join(body) + "\n\\end{qpart}")
            self.parts_rendered += 1
        self.q_rendered.add(q["id"])
        self.ranges.append((start, len(self.lines), q["id"]))

    def build(self, blocks, topic_names, safe_ids):
        title = f"IB Mathematics AA {self.level} · Topical {self.kind}"
        self.add(PREAMBLE.replace("TITLE", esc_text(title)).rstrip("\n"))
        self.add("\\begin{titlepage}\\centering\\vspace*{6cm}"
                 f"{{\\Huge\\bfseries IB Mathematics AA {self.level}\\par}}\\vspace{{1cm}}"
                 f"{{\\LARGE Topical {self.kind}\\par}}\\vspace{{1cm}}"
                 "{\\large Paper 1 and Paper 2 · May 2021 to May 2024 · Nov 2021 to Nov 2023\\par}"
                 "\\vfill{\\small Personal study copy. Not for distribution.\\par}\\end{titlepage}")
        self.add("\\tableofcontents\\clearpage")
        for n in sorted({k[0] for k in blocks}):
            self.add(f"\\section{{Topic {n}: {esc_text(topic_names.get(n, ''))}}}")
            for paper, ptitle in PAPERS.items():
                if not any((n, paper, s) in blocks for s in "AB"):
                    continue
                self.add(f"\\subsection{{{ptitle}}}")
                for sec in "AB":
                    entries = blocks.get((n, paper, sec))
                    if not entries:
                        continue
                    self.add(f"\\subsubsection{{Section {sec}}}")
                    for kind, q in entries:
                        if kind == "q":
                            self.question(q, q["id"] in safe_ids)
                        else:
                            self.xrefs += 1
                            self.add(f"\\xref{{{esc_text(q['short'])}}}{{{q['home']}}}{{{q['item']}}}")
            self.add("\\clearpage")
        self.add("\\end{document}")
        return "\n".join(self.lines) + "\n"


def run_xelatex(build_dir, name):
    """Returns (error line numbers, any error at all, log)."""
    cmd = ["xelatex", "-interaction=nonstopmode", "-file-line-error", f"{name}.tex"]
    subprocess.run(cmd, cwd=build_dir, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    log_file = build_dir / f"{name}.log"
    log = log_file.read_text(encoding="utf-8", errors="replace") if log_file.exists() else "! no log"
    lines = [int(m.group(1)) for m in re.finditer(rf"^\./{re.escape(name)}\.tex:(\d+): ", log, re.M)]
    failed = bool(lines) or bool(re.search(r"^! ", log, re.M)) or not (build_dir / f"{name}.pdf").exists()
    return lines, failed, log


def isolate(kind, level, items, images_dir, build_dir):
    """Compile each question alone; return ids of those that fail."""
    def one(i_q):
        i, q = i_q
        doc = Doc(kind, level, images_dir, build_dir)
        doc.add(PREAMBLE.replace("TITLE", "").rstrip("\n"))
        doc.question(q, False)
        doc.add("\\end{document}")
        name = f"iso_{i:04d}"
        (build_dir / f"{name}.tex").write_text("\n".join(doc.lines) + "\n", encoding="utf-8")
        failed = run_xelatex(build_dir, name)[1]
        for f in build_dir.glob(f"{name}.*"):
            f.unlink()
        return q["id"] if failed else None

    with ThreadPoolExecutor(max_workers=os.cpu_count() or 4) as pool:
        return {r for r in pool.map(one, enumerate(items)) if r}


def make_pdf(kind, level, blocks, topic_names, images_dir, out_dir):
    name = f"{level}_topical_{kind}"
    build_dir = out_dir / "build" / name
    shutil.rmtree(build_dir, ignore_errors=True)
    build_dir.mkdir(parents=True)
    safe = set()
    for rnd in range(MAX_FIX_ROUNDS + 1):
        doc = Doc(kind, level, images_dir, build_dir)
        (build_dir / f"{name}.tex").write_text(doc.build(blocks, topic_names, safe), encoding="utf-8")
        lines, failed, log = run_xelatex(build_dir, name)
        if not failed:
            break
        bad = {qid for line in lines for a, b, qid in doc.ranges if a <= line <= b} - safe
        if not bad:
            # Fatal errors (e.g. an unclosed brace) carry no line number: test questions one by one.
            items = [q for es in blocks.values() for k, q in es if k == "q" and q["id"] not in safe]
            print(f"  round {rnd + 1}: locating LaTeX errors by compiling {len(items)} questions separately")
            bad = isolate(kind, level, items, images_dir, build_dir)
            if not bad:
                print(f"  ERROR: LaTeX errors outside any question; see {build_dir / (name + '.log')}")
                break
        print(f"  round {rnd + 1}: {len(bad)} question(s) fall back to raw text")
        safe |= bad
    run_xelatex(build_dir, name)  # second pass for TOC and links
    _, failed, log = run_xelatex(build_dir, name)
    missing_glyphs = sorted(set(re.findall(r"Missing character: There is no (.) ", log)))
    pdf = build_dir / f"{name}.pdf"
    if pdf.exists() and not failed:
        shutil.copyfile(pdf, out_dir / f"{name}.pdf")
        print(f"  wrote {out_dir / (name + '.pdf')}")
    else:
        print(f"  ERROR: no PDF produced; see {build_dir / (name + '.log')}")
    return doc, safe, missing_glyphs


# --------------------------------------------------------------------------- checks

def checks(level, papers, questions, docs, raw):
    L = [f"=== {level} ===", ""]
    found = {(p["session"], p["year"], p["paper_number"]) for p in papers.values()}
    missing = [f"{s} {y} P{n}" for s, y in sorted(SCOPE, key=lambda x: (x[1], SESSION_ORDER[x[0]]))
               for n in PAPERS if (s, y, n) not in found]
    L.append(f"Papers in scope: {len(papers)}")
    L.append(f"Sessions/papers with no paper in database: {', '.join(missing) or 'none'}")
    n_parts = sum(len(q["parts"]) for q in questions.values())
    for kind, (doc, safe, glyphs) in docs.items():
        L.append(f"[{kind}] questions in scope: {len(questions)} | rendered: {len(doc.q_rendered)}"
                 f"{'' if len(questions) == len(doc.q_rendered) else '   <-- MISMATCH'}")
        L.append(f"[{kind}] parts in scope: {n_parts} | rendered: {doc.parts_rendered}"
                 f"{'' if n_parts == doc.parts_rendered else '   <-- MISMATCH'}")
    L.append("")

    def lst(title, items):
        L.append(f"{title}: {len(items) if items else 'none'}")
        L.extend(f"  - {x}" for x in items)

    lst("Questions with no topic tag (not rendered)", [q["short"] for q in questions.values() if q["home"] is None])
    lst("Questions with no parts", [q["short"] for q in questions.values() if not q["parts"]])
    lst("Parts with no markscheme", [f"{q['short']} ({p['part_label']})" for q in questions.values()
                                     for p in q["parts"] if not p["ms"]])
    lst("Question total_marks differs from sum of part marks",
        [f"{q['short']}: total {q['total_marks']} vs parts {q['parts_total']}" for q in questions.values()
         if q.get("total_marks") is not None and q["total_marks"] != q["parts_total"]])

    viol = []
    by_paper = defaultdict(list)
    for q in questions.values():
        by_paper[q["paper_id"]].append(q)
    for qs in by_paper.values():
        qs.sort(key=lambda q: q["question_number"])
        first_b = next((q for q in qs if q["section"] == "B"), None)
        if first_b:
            for q in qs:
                if q["section"] == "A" and q["question_number"] > first_b["question_number"]:
                    viol.append(f"{q['short']} ({q['marks']} marks) comes after Section B question "
                                f"Q{first_b['question_number']} ({first_b['marks']} marks)")
    lst(f"Section A/B order violations (Section B = {SECTION_B_MIN}+ marks)", sorted(viol))

    ahl = []
    if level == "SL":
        for q in sorted(questions.values(), key=lambda q: q["date_key"]):
            for p in q["parts"]:
                for t in p["tags"]:
                    if t["topic"]["level_scope"] == "AHL":
                        ahl.append(f"{q['short']} ({p['part_label']}): {t['topic']['code']} "
                                   f"{t['topic']['subtopic_name']}{' [primary]' if t['is_primary'] else ''}")
        lst("AHL-scope tags on SL questions (review: possible mis-tags)", ahl)

    doc = docs["questions"][0]
    L.append("")
    L.append(f"Cross-reference ('see Topic X') lines: {doc.xrefs}")
    L.append(f"Diagrams: {doc.img_found + len(doc.img_missing)} refs, found {doc.img_found}, "
             f"missing {len(doc.img_missing)} (shown as 'Diagram missing' boxes)")
    for kind, (d, safe, glyphs) in docs.items():
        lst(f"[{kind}] LaTeX fallbacks (question shown as raw text)",
            sorted(questions[i]["short"] for i in safe))
        L.append(f"[{kind}] missing glyphs: {' '.join(glyphs) or 'none'}")
    L.append("")
    return L


# --------------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--raw", default=str(HERE / "data" / "raw"))
    ap.add_argument("--out", default=str(HERE / "out"))
    ap.add_argument("--images", default=str(HERE / "data" / "images"))
    ap.add_argument("--levels", nargs="+", default=["SL", "HL"], choices=["SL", "HL"])
    args = ap.parse_args()

    if not shutil.which("xelatex"):
        sys.exit("ERROR: xelatex not found. Install a TeX distribution (see README).")
    raw = load_raw(args.raw)
    out_dir = Path(args.out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    images_dir = Path(args.images).resolve()

    report = []
    for level in args.levels:
        print(f"{level}:")
        papers, questions, topic_names = build_model(raw, level)
        blocks = layout(questions)
        docs = {kind: make_pdf(kind, level, blocks, topic_names, images_dir, out_dir)
                for kind in ("questions", "solutions")}
        for m in docs["questions"][0].img_missing:
            print(f"  WARNING diagram missing: {m}")
        report += checks(level, papers, questions, docs, raw)

    (out_dir / "checks.txt").write_text("\n".join(report), encoding="utf-8")
    print(f"\nChecks written to {out_dir / 'checks.txt'}")


if __name__ == "__main__":
    main()
