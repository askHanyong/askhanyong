"""The 12 bespoke pilot questions, fully authored (stem, parts, solutions,
mark schemes) -- original content, Step 0 checklist applied, GDC questions
written to need a GDC without saying "use technology". `check_code` is
deliberately NOT included here -- it comes from a separate, independent
subagent that sees only the stem/parts (never `answer` or
`markscheme_lines`), per the independence ground rule.

One scope note caught while writing these: AA4.7 is "Discrete random
variables; expected value" -- formal variance (Var(X) = E(X^2) - E(X)^2)
belongs to AA4.14, a different, HL-only syllabus point. The original
blueprint's "Var(X)/SD" slot (#15) would have drifted off-topic, so it's
replaced here with E(aX+b), which genuinely is AA4.7-scope content.
"""
import json


def _part(label, marks, text, answer, markscheme_lines):
    return {
        "label": label, "marks": marks, "text": text, "answer": answer,
        "markscheme_lines": [{"note": n, "desc": d} for n, d in markscheme_lines],
    }


BESPOKE = [
    # ---- AA1.2 (Number and Algebra -- Arithmetic sequences), 5 questions ----
    {
        "topic_code": "AA1.2", "level": "SL", "paper_type": "P1", "calculator": "none",
        "section": "A", "total_marks": 5, "difficulty": "easy",
        "blueprint_cell": "AA1.2|SL|none|bespoke",
        "stem_latex": "In an arithmetic sequence, $u_3 = 11$ and $u_7 = 27$.",
        "parts": [
            _part("a", 3, "Find the common difference $d$ and the first term $u_1$.",
                  "$d = 4$, $u_1 = 3$",
                  [("M1", "attempt to form a system from $u_3=11$, $u_7=27$ (e.g. subtracting to eliminate $u_1$)"),
                   ("A1", "$d = 4$"), ("A1", "$u_1 = 3$")]),
            _part("b", 2, "Find $u_{20}$.", "$u_{20} = 79$",
                  [("M1", "correct substitution into $u_n = u_1 + (n-1)d$"), ("A1", "$u_{20} = 79$")]),
        ],
    },
    {
        "topic_code": "AA1.2", "level": "SL", "paper_type": "P2", "calculator": "gdc",
        "section": "A", "total_marks": 4, "difficulty": "medium",
        "blueprint_cell": "AA1.2|SL|gdc|bespoke",
        "stem_latex": "In an arithmetic sequence, the first term is $4$ and the common difference is $6$. The sum of the first $n$ terms is $690$.",
        "parts": [
            _part("a", 1, "Write down an expression for $S_n$ in terms of $n$.",
                  "$S_n = 3n^{2} + n$",
                  [("A1", "$S_n = \\frac{n}{2}(8 + 6(n-1))$ or equivalent, e.g. $3n^{2}+n$")]),
            _part("b", 3, "Find the value of $n$.", "$n = 15$",
                  [("M1", "setting $S_n = 690$ to form a quadratic in $n$"),
                   ("M1", "solving the quadratic (e.g. via GDC)"),
                   ("A1", "$n = 15$ (rejecting the negative root)")]),
        ],
    },
    {
        "topic_code": "AA1.2", "level": "HL", "paper_type": "P1", "calculator": "none",
        "section": "A", "total_marks": 6, "difficulty": "medium",
        "blueprint_cell": "AA1.2|HL|none|bespoke",
        "stem_latex": "Consider the arithmetic series $\\sum_{r=1}^{n} (5r - 3)$.",
        "parts": [
            _part("a", 2, "Find the first term and the common difference of the series.",
                  "first term $= 2$, common difference $= 5$",
                  [("M1", "evaluating at least two consecutive terms (e.g. $r=1,2$)"),
                   ("A1", "first term $2$, common difference $5$")]),
            _part("b", 2, "Show that $\\sum_{r=1}^{n}(5r-3) = \\dfrac{n(5n-1)}{2}$.", "shown",
                  [("M1", "correct use of $S_n = \\frac{n}{2}(2u_1+(n-1)d)$"),
                   ("A1", "algebra leading to the given result (AG)")]),
            _part("c", 2, "Hence find the value of $n$ for which the sum equals $632$.", "$n = 16$",
                  [("M1", "setting $\\frac{n(5n-1)}{2}=632$ and forming a quadratic"),
                   ("A1", "$n = 16$ (rejecting the negative root)")]),
        ],
    },
    {
        "topic_code": "AA1.2", "level": "HL", "paper_type": "P2", "calculator": "gdc",
        "section": "A", "total_marks": 5, "difficulty": "medium",
        "blueprint_cell": "AA1.2|HL|gdc|bespoke",
        "stem_latex": "Hanyong saves money each month. In the first month he saves $\\$50$, and each following month he saves $\\$15$ more than the previous month.",
        "parts": [
            _part("a", 2, "Find the amount Hanyong saves in the 12th month.", "$\\$215$",
                  [("M1", "correct substitution into $u_n = u_1+(n-1)d$"), ("A1", "$u_{12} = 215$")]),
            _part("b", 3, "Find the smallest value of $n$ for which the total amount saved after $n$ months first exceeds $\\$3000$.",
                  "$n = 18$",
                  [("M1", "correct expression for $S_n$"),
                   ("M1", "solving/trialling $S_n > 3000$ (e.g. via GDC)"),
                   ("A1", "$n = 18$")]),
        ],
    },
    {
        "topic_code": "AA1.2", "level": "HL", "paper_type": "P2", "calculator": "gdc",
        "section": "A", "total_marks": 4, "difficulty": "medium",
        "blueprint_cell": "AA1.2|HL|gdc|bespoke",
        "stem_latex": "For an arithmetic sequence, $S_n = n^{2} + 3n$ for all positive integers $n$, where $S_n$ denotes the sum of the first $n$ terms.",
        "parts": [
            _part("a", 2, "Find $u_1$ and $u_2$, and hence state the common difference $d$.",
                  "$u_1 = 4$, $u_2 = 6$, $d = 2$",
                  [("M1", "$u_1 = S_1$, $u_2 = S_2 - S_1$"), ("A1", "$u_1=4$, $u_2=6$, $d=2$")]),
            _part("b", 2, "Find $u_{10}$.", "$u_{10} = 22$",
                  [("M1", "$u_{10} = S_{10}-S_9$ or $u_1+9d$"), ("A1", "$u_{10} = 22$")]),
        ],
    },
    # ---- AA2.7 (Functions -- Quadratics), 1 question ----
    {
        "topic_code": "AA2.7", "level": "SL", "paper_type": "P2", "calculator": "gdc",
        "section": "A", "total_marks": 4, "difficulty": "easy",
        "blueprint_cell": "AA2.7|SL|gdc|bespoke",
        "stem_latex": "Consider the equation $2.5x^{2} - 7x + 3.2 = 0$.",
        "parts": [
            _part("a", 2, "Find the discriminant of the equation.", "$\\Delta = 17$",
                  [("M1", "attempt to use $b^{2}-4ac$"), ("A1", "$\\Delta = 17$")]),
            _part("b", 2, "Hence state, with a reason, the nature of the roots of the equation.",
                  "Real and distinct (irrational) roots, since $\\Delta = 17 > 0$ and not a perfect square",
                  [("R1", "valid reason -- $\\Delta > 0$"), ("A1", "real, distinct (irrational) roots")]),
        ],
    },
    # ---- AA4.7 (Statistics -- Discrete random variables), 5 questions ----
    {
        "topic_code": "AA4.7", "level": "SL", "paper_type": "P1", "calculator": "none",
        "section": "A", "total_marks": 5, "difficulty": "easy",
        "blueprint_cell": "AA4.7|SL|none|bespoke",
        "stem_latex": (
            "The discrete random variable $X$ has probability distribution given in the table below, "
            "where $p$ is a constant."
            "$$\\begin{array}{c|cccc} x & 1 & 2 & 3 & 4 \\\\ \\hline P(X=x) & 0.1 & p & 0.3 & 0.2 \\end{array}$$"
        ),
        "parts": [
            _part("a", 2, "Find the value of $p$.", "$p = 0.4$",
                  [("M1", "$\\sum P(X=x) = 1$"), ("A1", "$p = 0.4$")]),
            _part("b", 3, "Find $E(X)$.", "$E(X) = 2.6$",
                  [("M1", "attempt to sum $x \\cdot P(X=x)$"), ("A1", "correct terms"), ("A1", "$E(X) = 2.6$")]),
        ],
    },
    {
        "topic_code": "AA4.7", "level": "SL", "paper_type": "P2", "calculator": "gdc",
        "section": "A", "total_marks": 5, "difficulty": "medium",
        "blueprint_cell": "AA4.7|SL|gdc|bespoke",
        "stem_latex": "The discrete random variable $Y$ has probability distribution given by $P(Y=y) = ky$ for $y = 1, 2, 3, 4, 5$, where $k$ is a constant.",
        "parts": [
            _part("a", 2, "Show that $k = \\dfrac{1}{15}$.", "shown",
                  [("M1", "$\\sum P(Y=y) = 1 \\Rightarrow 15k = 1$"), ("AG", "$k = 1/15$")]),
            _part("b", 3, "Find $E(Y)$.", "$E(Y) = \\dfrac{11}{3} \\approx 3.67$",
                  [("M1", "attempt to sum $y \\cdot P(Y=y)$"), ("A1", "$E(Y) = \\frac{55}{15}$"), ("A1", "$E(Y)=\\frac{11}{3}$")]),
        ],
    },
    {
        "topic_code": "AA4.7", "level": "HL", "paper_type": "P1", "calculator": "none",
        "section": "A", "total_marks": 6, "difficulty": "medium",
        "blueprint_cell": "AA4.7|HL|none|bespoke",
        "stem_latex": (
            "In a game costing $\\$5$ to play, a fair six-sided die is rolled once. If a $6$ is obtained, the "
            "player receives $\\$20$. If a $4$ or a $5$ is obtained, the player receives $\\$2$. Otherwise, the "
            "player receives nothing. Let $X$ be the player's net profit from playing the game once (the amount "
            "received minus the $\\$5$ cost)."
        ),
        "parts": [
            _part("a", 3, "Show that the probability distribution of $X$ is given by the table below."
                           "$$\\begin{array}{c|ccc} x & 15 & -3 & -5 \\\\ \\hline P(X=x) & 1/6 & 1/3 & 1/2 \\end{array}$$",
                  "shown",
                  [("M1", "correct net-profit values ($15, -3, -5$)"),
                   ("A1", "correct probabilities"), ("A1", "fully correct table")]),
            _part("b", 3, "Find $E(X)$, and state whether the game favors the player or the organizer, justifying your answer.",
                  "$E(X) = -1$; favors the organizer, since $E(X) < 0$",
                  [("M1", "correct substitution into $E(X) = \\sum x P(X=x)$"),
                   ("A1", "$E(X) = -1$"), ("R1", "favors the organizer, since $E(X) < 0$")]),
        ],
    },
    {
        "topic_code": "AA4.7", "level": "HL", "paper_type": "P2", "calculator": "gdc",
        "section": "A", "total_marks": 5, "difficulty": "medium",
        "blueprint_cell": "AA4.7|HL|gdc|bespoke",
        "stem_latex": "The discrete random variable $Z$ has probability distribution given by $P(Z=z) = \\dfrac{z^{2}}{50}$ for $z = 1, 2, 3, 4$, and $P(Z=5) = c$ for some constant $c$.",
        "parts": [
            _part("a", 2, "Show that $c = 0.4$.", "shown",
                  [("M1", "$\\sum P(Z=z) = 1$"), ("AG", "$c = 0.4$")]),
            _part("b", 3, "Find $P(2 \\leq Z \\leq 4)$.", "$P(2 \\leq Z \\leq 4) = 0.58$",
                  [("M1", "identifying the relevant $z$ values"),
                   ("A1", "correct sum of probabilities"), ("A1", "$0.58$")]),
        ],
    },
    {
        "topic_code": "AA4.7", "level": "HL", "paper_type": "P2", "calculator": "gdc",
        "section": "A", "total_marks": 4, "difficulty": "medium",
        "blueprint_cell": "AA4.7|HL|gdc|bespoke",
        "stem_latex": (
            "The discrete random variable $W$ has probability distribution given by $P(W=0)=0.2$, $P(W=1)=0.5$, "
            "$P(W=2)=0.3$. A new random variable is defined by $T = 10W + 4$."
        ),
        "parts": [
            _part("a", 2, "Find $E(W)$.", "$E(W) = 1.1$",
                  [("M1", "attempt to sum $w \\cdot P(W=w)$"), ("A1", "$E(W) = 1.1$")]),
            _part("b", 2, "Hence find $E(T)$.", "$E(T) = 15$",
                  [("M1", "$E(T) = 10E(W)+4$"), ("A1", "$E(T) = 15$")]),
        ],
    },
    # ---- AA5.8 (Calculus -- Optimization), 1 question ----
    {
        "topic_code": "AA5.8", "level": "SL", "paper_type": "P2", "calculator": "gdc",
        "section": "A", "total_marks": 5, "difficulty": "medium",
        "blueprint_cell": "AA5.8|SL|gdc|bespoke",
        "stem_latex": (
            "A company manufactures cylindrical tins with volume $600\\pi \\text{ cm}^{3}$. The material for the "
            "circular top and bottom costs $\\$0.05$ per $\\text{cm}^{2}$, and the material for the curved side "
            "costs $\\$0.03$ per $\\text{cm}^{2}$. Let $r$ cm be the radius of the tin."
        ),
        "parts": [
            _part("a", 2, "Show that the total cost of materials, $C$ dollars, is given by "
                           "$$C(r) = 0.1\\pi r^{2} + \\frac{36\\pi}{r}.$$", "shown",
                  [("M1", "height $h = 600/r^{2}$"), ("A1", "substituted into $C = 2(\\pi r^{2})(0.05) + (2\\pi rh)(0.03)$ to obtain the given expression")]),
            _part("b", 3, "Find the value of $r$ that minimizes the cost, correct to 3 significant figures, "
                           "and find the minimum cost, correct to 2 decimal places.",
                  "$r \\approx 5.65$, minimum cost $\\approx \\$30.04$",
                  [("M1", "$C'(r) = 0$"), ("A1", "$r \\approx 5.65$"), ("A1", "minimum cost $\\approx \\$30.04$")]),
        ],
    },
]


def build_all_bespoke() -> list[dict]:
    out = []
    for q in BESPOKE:
        out.append({
            "level": q["level"], "paper_type": q["paper_type"], "calculator": q["calculator"],
            "section": q["section"], "total_marks": q["total_marks"], "topic_code": q["topic_code"],
            "blueprint_cell": q["blueprint_cell"], "mode": "bespoke", "difficulty": q["difficulty"],
            "stem_latex": q["stem_latex"], "parts": q["parts"],
        })
    return out


def stem_only_text(q: dict) -> str:
    """The ONLY view given to the independent check-writing subagent -- stem +
    part wording + marks, deliberately excluding `answer` and `markscheme_lines`."""
    lines = [f"QUESTION STEM:\n{q['stem_latex']}", "\nPARTS:"]
    for p in q["parts"]:
        lines.append(f"({p['label']}) [{p['marks']} marks] {p['text']}")
    return "\n".join(lines)


if __name__ == "__main__":
    qs = build_all_bespoke()
    print(f"{len(qs)} bespoke questions authored.")
    for q in qs:
        print(f"  {q['blueprint_cell']:28s} {q['total_marks']} marks  {len(q['parts'])} parts")
