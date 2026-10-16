"""The 1 AHL-differentiation Section B bespoke question: a guided proof
of d/dx(arcsin x) = 1/sqrt(1-x^2) via implicit differentiation, then
applying it. This question legitimately sets scaffold=True under Rule
6.2: parts (a)-(d) build up the method (write sin(y)=x, differentiate
implicitly, resolve cos(y), combine), which part (e)-(f) then apply --
an explicit scaffold, not a bare method-naming shortcut, so part (b)'s
"By differentiating implicitly" is permitted (Section B scaffold, not
Section A).

`check_code` is deliberately NOT included here -- it comes from a
separate, independent subagent that saw ONLY the stem/parts (never
`answer` or `markscheme_lines`), per the independence ground rule; see
check_code_bespoke_ahl_diff.py.
"""
import json


def _part(label, marks, text, answer, markscheme_lines):
    return {
        "label": label, "marks": marks, "text": text, "answer": answer,
        "markscheme_lines": [{"note": n, "desc": d} for n, d in markscheme_lines],
    }


BESPOKE = [
    {
        "topic_code": "AA5.15", "level": "HL", "paper_type": "P1", "calculator": "none",
        "section": "B", "total_marks": 16, "difficulty": "hard", "level_scope": "HL-only",
        "scaffold": 1,
        "scaffold_reason": "guided proof: parts (a)-(d) build the implicit-differentiation "
                            "derivation of d/dx(arcsin x) step by step before it is applied in (e)-(f)",
        "blueprint_cell": "AA5.15|HL-only|none|bespoke",
        "stem_latex": "Let $y = \\arcsin(x)$, for $-1 \\leq x \\leq 1$ and $-\\dfrac{\\pi}{2} \\leq y \\leq \\dfrac{\\pi}{2}$.",
        "parts": [
            _part("a", 2, "Write down an equivalent equation relating $x$ and $y$ that does not involve $\\arcsin$.",
                  "$\\sin y = x$",
                  [("M1", "recognizing $y=\\arcsin x \\iff \\sin y = x$ on the given range"),
                   ("A1", "$\\sin y = x$")]),
            _part("b", 3, "By differentiating implicitly with respect to $x$, show that $\\dfrac{dy}{dx}\\cos y = 1$.",
                  "shown",
                  [("M1", "differentiating $\\sin y = x$ implicitly with respect to $x$"),
                   ("A1", "$\\cos y \\cdot \\dfrac{dy}{dx} = 1$"),
                   ("AG", "so $\\dfrac{dy}{dx}\\cos y = 1$")]),
            _part("c", 3, "Show that $\\cos y = \\sqrt{1-x^{2}}$ for $-\\dfrac{\\pi}{2} \\leq y \\leq \\dfrac{\\pi}{2}$.",
                  "shown",
                  [("M1", "using $\\sin^{2}y + \\cos^{2}y = 1$ and $\\sin y = x$ to write $\\cos y = \\pm\\sqrt{1-x^{2}}$"),
                   ("R1", "$\\cos y \\geq 0$ for $-\\frac{\\pi}{2} \\leq y \\leq \\frac{\\pi}{2}$, so the positive root is taken"),
                   ("AG", "$\\cos y = \\sqrt{1-x^{2}}$")]),
            _part("d", 2, "Hence show that $\\dfrac{d}{dx}(\\arcsin x) = \\dfrac{1}{\\sqrt{1-x^{2}}}$.",
                  "shown",
                  [("M1", "substituting $\\cos y = \\sqrt{1-x^{2}}$ into $\\dfrac{dy}{dx}\\cos y = 1$"),
                   ("AG", "$\\dfrac{dy}{dx} = \\dfrac{1}{\\sqrt{1-x^{2}}}$")]),
            _part("e", 3, "Hence find the derivative of $\\arcsin(2x)$.",
                  "$\\dfrac{2}{\\sqrt{1-4x^{2}}}$",
                  [("M1", "recognizing the chain rule with outer function $\\arcsin(u)$, $u=2x$"),
                   ("A1", "$\\dfrac{d}{dx}\\arcsin(2x) = \\dfrac{2}{\\sqrt{1-(2x)^{2}}}$"),
                   ("A1", "$\\dfrac{2}{\\sqrt{1-4x^{2}}}$")]),
            _part("f", 3, "Find the equation of the tangent to the curve $y=\\arcsin(x)$ at the point where $x=0$.",
                  "$y = x$",
                  [("M1", "finding $\\arcsin(0) = 0$"),
                   ("M1", "finding $\\dfrac{d}{dx}(\\arcsin x)$ at $x=0$, equal to $1$"),
                   ("A1", "$y = x$")]),
        ],
    },
]


def build_all_ahl_diff_bespoke() -> list[dict]:
    out = []
    for q in BESPOKE:
        out.append({
            "level": q["level"], "paper_type": q["paper_type"], "calculator": q["calculator"],
            "section": q["section"], "total_marks": q["total_marks"], "topic_code": q["topic_code"],
            "blueprint_cell": q["blueprint_cell"], "mode": "bespoke", "difficulty": q["difficulty"],
            "level_scope": q["level_scope"], "scaffold": q["scaffold"], "scaffold_reason": q["scaffold_reason"],
            "stem_latex": q["stem_latex"], "parts": q["parts"],
        })
    return out


def stem_only_text(q: dict) -> str:
    lines = [f"QUESTION STEM:\n{q['stem_latex']}", "\nPARTS:"]
    for p in q["parts"]:
        lines.append(f"({p['label']}) [{p['marks']} marks] {p['text']}")
    return "\n".join(lines)


if __name__ == "__main__":
    qs = build_all_ahl_diff_bespoke()
    print(f"{len(qs)} AHL-diff bespoke questions authored.")
