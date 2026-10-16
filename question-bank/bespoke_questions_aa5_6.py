"""The 3 AA5.6 Section B bespoke questions -- rebuilt from the earlier
8-mark "Section B" templates (which were really padded Section A
content) into genuine 15-mark multi-part structures, per the
section_b_mark_range check (15-20 marks). Each extends the original
pattern with a second-derivative / stationary-point-classification /
asymptote-or-range tail, which is also where "add an M1 for second
differentiation in the f'' parts" is applied: every f''(x) part
explicitly credits the act of differentiating again, not just the
evaluated number.

`check_code` is deliberately NOT included here -- it comes from a
separate, independent subagent that saw ONLY the stem/parts (never
`answer` or `markscheme_lines`), per the independence ground rule; see
check_code_bespoke_aa5_6.py.
"""
import json


def _part(label, marks, text, answer, markscheme_lines):
    return {
        "label": label, "marks": marks, "text": text, "answer": answer,
        "markscheme_lines": [{"note": n, "desc": d} for n, d in markscheme_lines],
    }


BESPOKE = [
    # ---- product + chain rule, stationary points + asymptote ----
    {
        "topic_code": "AA5.6", "level": "SL", "paper_type": "P1", "calculator": "none",
        "section": "B", "total_marks": 15, "difficulty": "hard", "level_scope": "SL+HL",
        "blueprint_cell": "AA5.6|SL+HL|none|bespoke",
        "stem_latex": "Let $f(x) = x^{2}e^{2x}$.",
        "parts": [
            _part("a", 3, "Find $f'(x)$.", "$f'(x) = 2x(x+1)e^{2x}$",
                  [("M1", "recognizing the product rule with $u=x^{2}$, $v=e^{2x}$"),
                   ("A1", "$u'v+uv' = 2xe^{2x} + 2x^{2}e^{2x}$"),
                   ("A1", "$f'(x) = 2x(x+1)e^{2x}$")]),
            _part("b", 3, "Show that $f'(x) = 0$ when $x=0$ and when $x = -1$.", "shown",
                  [("M1", "factorizing $f'(x) = 2x(x+1)e^{2x}$"),
                   ("R1", "noting $e^{2x}$ is never zero"),
                   ("AG", "so $f'(x)=0 \\iff x=0$ or $x=-1$")]),
            _part("c", 2, "Find $f''(x)$.", "$f''(x) = (4x^{2}+8x+2)e^{2x}$",
                  [("M1", "differentiating $f'(x) = 2x(x+1)e^{2x}$ again, using the product rule"),
                   ("A1", "$f''(x) = (4x^{2}+8x+2)e^{2x}$")]),
            _part("d", 2, "Find $f''(0)$, and hence determine the nature of the stationary point at $x=0$.",
                  "$f''(0) = 2 > 0$, so $x=0$ is a local minimum",
                  [("A1", "$f''(0) = 2$"), ("R1", "since $f''(0) > 0$, $x=0$ is a local minimum")]),
            _part("e", 3, "Find $f''(-1)$, and hence determine the nature of the stationary point at $x=-1$.",
                  "$f''(-1) = -\\dfrac{2}{e^{2}} < 0$, so $x=-1$ is a local maximum",
                  [("M1", "substituting $x=-1$ into $f''(x)$"),
                   ("A1", "$f''(-1) = -\\dfrac{2}{e^{2}}$"),
                   ("R1", "since $f''(-1) < 0$, $x=-1$ is a local maximum")]),
            _part("f", 2, "Write down the equation of the horizontal asymptote of the curve as $x \\to -\\infty$.",
                  "$y = 0$",
                  [("A1", "recognizing $x^{2}e^{2x} \\to 0$ as $x \\to -\\infty$"), ("A1", "$y=0$")]),
        ],
    },
    # ---- quotient rule, stationary points + tangent ----
    {
        "topic_code": "AA5.6", "level": "SL", "paper_type": "P1", "calculator": "none",
        "section": "B", "total_marks": 15, "difficulty": "hard", "level_scope": "SL+HL",
        "blueprint_cell": "AA5.6|SL+HL|none|bespoke",
        "stem_latex": "Let $f(x) = \\dfrac{x+3}{x^{2}+16}$.",
        "parts": [
            _part("a", 3, "Find $f'(x)$, giving your answer as a single fraction.",
                  "$f'(x) = \\dfrac{16 - 6x - x^{2}}{(x^{2}+16)^{2}}$",
                  [("M1", "recognizing the quotient rule with $u=x+3$, $v=x^{2}+16$"),
                   ("A1", "correct substitution into $\\dfrac{u'v-uv'}{v^2}$"),
                   ("A1", "$f'(x) = \\dfrac{16-6x-x^{2}}{(x^{2}+16)^{2}}$")]),
            _part("b", 4, "Show that the $x$-coordinates of the stationary points of the curve $y=f(x)$ are $x=2$ and $x=-8$.",
                  "shown",
                  [("M1", "setting the numerator of $f'(x)$ equal to $0$"),
                   ("A1", "$x^{2}+6x-16=0$"),
                   ("M1", "solving the quadratic"),
                   ("AG", "$x=2$ or $x=-8$")]),
            _part("c", 2, "Find $f(2)$ and $f(-8)$.", "$f(2) = \\dfrac{1}{4}$, $f(-8) = -\\dfrac{1}{16}$",
                  [("A1", "$f(2) = \\dfrac{1}{4}$"), ("A1", "$f(-8) = -\\dfrac{1}{16}$")]),
            _part("d", 3, "Determine the nature of each stationary point.",
                  "$x=-8$ is a local minimum; $x=2$ is a local maximum",
                  [("M1", "using the second derivative (or a sign table) to test each stationary point"),
                   ("A1", "$x=-8$ is a local minimum"),
                   ("A1", "$x=2$ is a local maximum")]),
            _part("e", 3, "Find the equation of the tangent to the curve at the point where $x=0$.",
                  "$y = \\dfrac{x}{16} + \\dfrac{3}{16}$",
                  [("M1", "finding $f(0) = \\dfrac{3}{16}$"),
                   ("M1", "finding $f'(0) = \\dfrac{1}{16}$ and using $y=f(0)+f'(0)\\cdot x$"),
                   ("A1", "$y = \\dfrac{x}{16} + \\dfrac{3}{16}$")]),
        ],
    },
    # ---- chain rule, double angle, stationary points + range ----
    {
        "topic_code": "AA5.6", "level": "SL", "paper_type": "P1", "calculator": "none",
        "section": "B", "total_marks": 15, "difficulty": "hard", "level_scope": "SL+HL",
        "blueprint_cell": "AA5.6|SL+HL|none|bespoke",
        "stem_latex": "Let $f(x) = \\sin^{2}(2x)$.",
        "parts": [
            _part("a", 3, "Show that $f'(x) = 2\\sin(4x)$.", "shown",
                  [("M1", "writing $f'(x) = 2\\sin(2x) \\cdot 2\\cos(2x)$"),
                   ("M1", "using the double angle identity $2\\sin\\theta\\cos\\theta = \\sin 2\\theta$"),
                   ("AG", "$f'(x) = 2\\sin(4x)$")]),
            _part("b", 2, "Hence find $f''(x)$.", "$f''(x) = 8\\cos(4x)$",
                  [("M1", "differentiating $f'(x) = 2\\sin(4x)$ again"),
                   ("A1", "$f''(x) = 8\\cos(4x)$")]),
            _part("c", 3, "Find the values of $x$ in the interval $0 \\leq x \\leq \\dfrac{\\pi}{2}$ for which $f'(x)=0$.",
                  "$x = 0, \\dfrac{\\pi}{4}, \\dfrac{\\pi}{2}$",
                  [("M1", "setting $\\sin(4x)=0$"),
                   ("M1", "solving for $x$ within the given domain"),
                   ("A1", "$x = 0, \\dfrac{\\pi}{4}, \\dfrac{\\pi}{2}$")]),
            _part("d", 3, "Determine the nature of each of the stationary points found in part (c).",
                  "$x=0$ and $x=\\dfrac{\\pi}{2}$ are local minima; $x=\\dfrac{\\pi}{4}$ is a local maximum",
                  [("M1", "evaluating $f''(x)$ at each of the three values"),
                   ("A1", "$x=0$ and $x=\\dfrac{\\pi}{2}$ are local minima"),
                   ("A1", "$x=\\dfrac{\\pi}{4}$ is a local maximum")]),
            _part("e", 2, "Write down the range of $f$.", "$0 \\leq f(x) \\leq 1$",
                  [("A1", "lower bound $0$"), ("A1", "upper bound $1$")]),
            _part("f", 2, "State the maximum value of $f$, and one value of $x$ in the given interval at which it occurs.",
                  "Maximum value $1$, at $x = \\dfrac{\\pi}{4}$",
                  [("A1", "maximum value $1$"), ("A1", "$x = \\dfrac{\\pi}{4}$")]),
        ],
    },
]


def build_all_aa5_6_bespoke() -> list[dict]:
    out = []
    for q in BESPOKE:
        out.append({
            "level": q["level"], "paper_type": q["paper_type"], "calculator": q["calculator"],
            "section": q["section"], "total_marks": q["total_marks"], "topic_code": q["topic_code"],
            "blueprint_cell": q["blueprint_cell"], "mode": "bespoke", "difficulty": q["difficulty"],
            "level_scope": q["level_scope"],
            "stem_latex": q["stem_latex"], "parts": q["parts"],
        })
    return out


def stem_only_text(q: dict) -> str:
    """The ONLY view given to the independent check-writing subagent --
    stem + part wording + marks, deliberately excluding `answer` and
    `markscheme_lines`."""
    lines = [f"QUESTION STEM:\n{q['stem_latex']}", "\nPARTS:"]
    for p in q["parts"]:
        lines.append(f"({p['label']}) [{p['marks']} marks] {p['text']}")
    return "\n".join(lines)


if __name__ == "__main__":
    qs = build_all_aa5_6_bespoke()
    print(f"{len(qs)} AA5.6 bespoke questions authored.")
    for q in qs:
        print(f"  {q['blueprint_cell']:28s} {q['total_marks']} marks  {len(q['parts'])} parts")
