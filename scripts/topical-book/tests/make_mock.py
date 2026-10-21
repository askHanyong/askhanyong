#!/usr/bin/env python3
"""Write a small fake export to tests/mock_raw/ so build_book.py can run without a database.

Covers: multi-topic questions (cross-refs), Section A and B, Paper 1 and 2,
display math with mark codes, an unmatched $, a diagram ref, an AHL tag on an
SL question, a deliberately broken LaTeX part (should fall back to raw text),
and an out-of-scope paper (Nov 2024, should be excluded).
"""
import json
import uuid
from pathlib import Path

OUT = Path(__file__).resolve().parent / "mock_raw"


def uid():
    return str(uuid.uuid4())


subject = {"id": uid(), "code": "MAA", "name": "Mathematics: Analysis and Approaches"}
topics = {}
for code, n, tname, sub, scope in [
    ("AA1.2", 1, "Number and Algebra", "Arithmetic sequences and series", "SL"),
    ("AA1.12", 1, "Number and Algebra", "Complex numbers", "AHL"),
    ("AA2.6", 2, "Functions", "Quadratic functions", "SL"),
    ("AA3.2", 3, "Geometry and Trigonometry", "Sine and cosine rule", "SL"),
    ("AA3.4", 3, "Geometry and Trigonometry", "Radian measure; arc length and sector area", "SL"),
    ("AA4.7", 4, "Statistics and Probability", "Discrete random variables", "SL"),
    ("AA5.3", 5, "Calculus", "Derivatives of polynomials", "SL"),
    ("AA5.8", 5, "Calculus", "Local maxima/minima; optimization", "SL"),
]:
    topics[code] = {"id": uid(), "subject_id": subject["id"], "code": code, "topic_number": n,
                    "topic_name": tname, "subtopic_name": sub, "level_scope": scope,
                    "parent_topic_id": None, "topics_enabled": False}

papers, questions, parts, ms_rows, tags = [], [], [], [], []


def paper(year, session, number, tz="TZ1"):
    p = {"id": uid(), "subject_id": subject["id"], "level": "SL", "year": year, "session": session,
         "paper_number": number, "time_zone": tz, "calculator_allowed": number == 2,
         "total_marks": None, "paper_file_path": None, "markscheme_file_path": None}
    papers.append(p)
    return p


def question(p, num, spec):
    """spec: list of (label, marks, text, markscheme, primary_code, [secondary codes], image_refs)."""
    q = {"id": uid(), "paper_id": p["id"], "question_number": num,
         "total_marks": sum(s[1] for s in spec)}
    questions.append(q)
    for i, (label, marks, text, ms, prim, sec, imgs) in enumerate(spec):
        qp = {"id": uid(), "question_id": q["id"], "part_label": label, "part_text": text,
              "image_refs": imgs, "marks": marks, "command_term": None,
              "depends_on_part_id": None, "order_index": i}
        parts.append(qp)
        ms_rows.append({"id": uid(), "question_part_id": qp["id"], "markscheme_text": ms,
                        "marks_breakdown": []})
        for code, primary in [(prim, True)] + [(c, False) for c in sec]:
            tags.append({"id": uid(), "question_part_id": qp["id"], "topic_id": topics[code]["id"],
                         "is_primary": primary, "confidence": 0.9, "tagged_by": "ai", "reviewed": False})


p1 = paper(2023, "May", 1, "TZ2")
question(p1, 1, [
    ("a", 2, "The following diagram shows a circle with centre $O$ and radius $4$ cm. "
             "The length of arc $PQR$ is $10$ cm. Find the perimeter of the shaded sector.",
     "attempts to find perimeter (M1)\narc + 2 radius OR $10 + 4 + 4$\n$=18$ (cm) A1\n[2 marks]",
     "AA3.4", [], ["page 3, circle diagram with centre O, radius 4, shaded sector POR with angle θ"]),
    ("b", 2, "Find $\\theta$.",
     "$10 = 4\\theta$ (A1)\n$$\\theta = \\frac{10}{4} \\left( = \\frac{5}{2}, 2.5 \\right)$$\nA1\n[2 marks]",
     "AA3.4", [], []),
])
question(p1, 2, [
    ("a", 2, "Consider an arithmetic sequence with $u_{1} = 0.6$ and $u_{4} = 0.15$. Find $d$.",
     "$u_{1} + 3d = u_{4}$ (M1)\n$d = -0.15$ A1\n[2 marks]", "AA1.2", [], []),
    ("b", 4, "Given $P(X=n) = \\frac{u_{n}}{k}$ for $1 \\leq n \\leq 4$, find $k$. It costs $5 & 50% #1_ok~",
     "summing probabilities to 1 (M1)\n$$\\frac{1.5}{k} = 1$$ (A1)\n$k = 1.5$ A1\nTotal [6 marks]",
     "AA4.7", ["AA1.2"], []),
])
question(p1, 8, [
    ("a", 6, "Let $f(x) = x^{2} - 4x + 1$. Show that $f(x) = (x-2)^{2} - 3$.",
     "attempt to complete the square (M1)\n$$\\begin{aligned} f(x) &= x^2-4x+4-3 \\\\ &= (x-2)^2-3 \\end{aligned}$$ AG",
     "AA2.6", [], []),
    ("b", 8, "Find the minimum value of $f$ and the value of $x$ where it occurs (θ ≤ 2π, x⁻¹).",
     "$f'(x) = 2x - 4 = 0$ M1\n$x = 2$, minimum $-3$ A1A1\n\nNote: award R1 for reasoning. R1",
     "AA5.8", ["AA5.3"], []),
])
p2 = paper(2022, "Nov", 2, "TZ0")
question(p2, 3, [
    ("", 5, "A broken part: $\\frac{1}{2$ and \\undefinedcommand.",
     "$z = 1 + i$ is a complex root. A1 (AHL tag on SL question)", "AA1.12", [], []),
])
question(p2, 9, [
    ("a", 7, "In triangle $ABC$, $AB = 5$, $BC = 7$, $\\hat{B} = 60°$. Find $AC$.",
     "$AC^2 = 25 + 49 - 70\\cos 60°$ M1A1\n$AC = \\sqrt{39}$ A1", "AA3.2", [], []),
    ("b", 6, "Find the rate of change of $y = 3x^{3}$ at $x = 1$.",
     "$\\frac{dy}{dx} = 9x^{2}$ A1\n$= 9$ A1", "AA5.3", [], []),
])
question(paper(2024, "Nov", 1), 1, [  # out of scope
    ("a", 3, "Out-of-scope question.", "A1", "AA1.2", [], []),
])

OUT.mkdir(parents=True, exist_ok=True)
for name, rows in [("subjects", [subject]), ("syllabus_topics", list(topics.values())),
                   ("papers", papers), ("questions", questions), ("question_parts", parts),
                   ("markscheme_parts", ms_rows), ("part_topic_tags", tags)]:
    (OUT / f"{name}.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"Mock data written to {OUT}")
