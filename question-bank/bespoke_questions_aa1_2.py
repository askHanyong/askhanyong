"""15 new bespoke AA1.2 questions, filling the remaining bespoke slots to
reach the ~5-bespoke-per-cell target (4 SL|none, 4 SL|gdc, 4 HL|none,
3 HL|gdc -- the pilot's existing 5 AA1.2 bespoke questions already cover
1 SL|none, 1 SL|gdc, 1 HL|none, 2 HL|gdc).

Deliberately distinct problem *structures* from both the pilot's bespoke
AA1.2 questions and the 60 AA1.2 templates (templates_aa1_2.py): Gauss
pairing-sum, sequence-membership tests, ratio/product conditions requiring
a nonlinear solve, symmetric 3-term representation, two-sequence
crossing/comparison problems, and non-integer common differences. As with
the pilot, `check_code` is NOT included here -- it comes from separate,
independent subagents that see only the stem/parts.
"""
import json


def _part(label, marks, text, answer, markscheme_lines):
    return {
        "label": label, "marks": marks, "text": text, "answer": answer,
        "markscheme_lines": [{"note": n, "desc": d} for n, d in markscheme_lines],
    }


BESPOKE_AA1_2 = [
    # ======================= SL | none (4) =======================
    {
        "topic_code": "AA1.2", "level": "SL", "paper_type": "P1", "calculator": "none",
        "section": "A", "total_marks": 5, "difficulty": "easy",
        "blueprint_cell": "AA1.2|SL|none|bespoke",
        "stem_latex": "An arithmetic sequence has $21$ terms. The first term is $7$ and the last (21st) term is $87$.",
        "parts": [
            _part("a", 2, "Find the common difference $d$.", "$d = 4$",
                  [("M1", "attempt to use $u_{21}=u_1+20d$"), ("A1", "$d = 4$")]),
            _part("b", 3, "Find the sum of all 21 terms.", "$987$",
                  [("M1", "correct use of $S_n = \\frac{n}{2}(u_1+u_n)$"),
                   ("A1", "correct substitution"), ("A1", "$S_{21} = 987$")]),
        ],
    },
    {
        "topic_code": "AA1.2", "level": "SL", "paper_type": "P1", "calculator": "none",
        "section": "A", "total_marks": 4, "difficulty": "easy",
        "blueprint_cell": "AA1.2|SL|none|bespoke",
        "stem_latex": "An arithmetic sequence has first term $u_1 = 4$ and common difference $d = 6$.",
        "parts": [
            _part("a", 2, "Determine whether $100$ is a term of this sequence, justifying your answer.",
                  "Yes -- $100 = u_{17}$",
                  [("M1", "setting $4+6(n-1)=100$ and solving for $n$"),
                   ("A1", "$n=17$ is a positive integer, so $100$ is a term ($u_{17}$)")]),
            _part("b", 2, "Determine whether $101$ is a term of this sequence, justifying your answer.",
                  "No",
                  [("M1", "setting $4+6(n-1)=101$ and solving for $n$"),
                   ("A1", "$n = \\frac{103}{6}$ is not a positive integer, so $101$ is not a term")]),
        ],
    },
    {
        "topic_code": "AA1.2", "level": "SL", "paper_type": "P1", "calculator": "none",
        "section": "A", "total_marks": 5, "difficulty": "medium",
        "blueprint_cell": "AA1.2|SL|none|bespoke",
        "stem_latex": "In an arithmetic sequence, the 4th term is three times the first term, and the 8th term exceeds the 2nd term by $24$.",
        "parts": [
            _part("a", 3, "Find the common difference $d$ and the first term $u_1$.", "$d = 4$, $u_1 = 6$",
                  [("M1", "forming $u_4 = 3u_1$ and $u_8-u_2=24$ as equations in $u_1,d$"),
                   ("A1", "$d = 4$"), ("A1", "$u_1 = 6$")]),
            _part("b", 2, "Find $u_{15}$.", "$u_{15} = 62$",
                  [("M1", "correct substitution into $u_n=u_1+(n-1)d$"), ("A1", "$u_{15} = 62$")]),
        ],
    },
    {
        "topic_code": "AA1.2", "level": "SL", "paper_type": "P1", "calculator": "none",
        "section": "A", "total_marks": 5, "difficulty": "medium",
        "blueprint_cell": "AA1.2|SL|none|bespoke",
        "stem_latex": "For an arithmetic sequence, the sum of the first $6$ terms is $72$, and the sum of the first $10$ terms is $200$.",
        "parts": [
            _part("a", 4, "Find the first term $u_1$ and the common difference $d$.", "$u_1 = 2$, $d = 4$",
                  [("M1", "correct expressions for $S_6$ and $S_{10}$ in terms of $u_1,d$"),
                   ("M1", "solving the resulting system"),
                   ("A1", "$u_1 = 2$"), ("A1", "$d = 4$")]),
            _part("b", 1, "Find $u_{15}$.", "$u_{15} = 58$",
                  [("A1", "$u_{15} = 58$")]),
        ],
    },
    # ======================= SL | gdc (4) =======================
    {
        "topic_code": "AA1.2", "level": "SL", "paper_type": "P2", "calculator": "gdc",
        "section": "A", "total_marks": 6, "difficulty": "medium",
        "blueprint_cell": "AA1.2|SL|gdc|bespoke",
        "stem_latex": (
            "A theatre has $25$ rows of seats. Row $1$ (nearest the stage) has $18$ seats, and each row behind it "
            "has $2$ more seats than the row in front. The theatre is planning to extend by adding further rows "
            "behind row $25$, continuing the same pattern."
        ),
        "parts": [
            _part("a", 1, "Find the number of seats in row $25$.", "$66$",
                  [("A1", "$u_{25} = 18+24(2) = 66$")]),
            _part("b", 2, "Find the total number of seats in the original $25$-row theatre.", "$1050$",
                  [("M1", "correct use of $S_n = \\frac{n}{2}(2u_1+(n-1)d)$"), ("A1", "$1050$")]),
            _part("c", 3, "Find the smallest total number of rows, $n$, for which the theatre's total seating capacity first exceeds $1200$.", "$n = 28$",
                  [("M1", "correct expression for $S_n$ extended beyond row 25"),
                   ("M1", "solving/trialling $S_n > 1200$ (e.g. via GDC)"),
                   ("A1", "$n = 28$")]),
        ],
    },
    {
        "topic_code": "AA1.2", "level": "SL", "paper_type": "P1", "calculator": "none",
        "section": "A", "total_marks": 4, "difficulty": "medium",
        "blueprint_cell": "AA1.2|SL|none|bespoke",
        "stem_latex": "An arithmetic sequence has first term $u_1 = 45$ and common difference $d = -4$.",
        "parts": [
            _part("a", 1, "Write down an expression for $u_n$ in terms of $n$.", "$u_n = 45-4(n-1)$",
                  [("A1", "$u_n = 45-4(n-1)$")]),
            _part("b", 3, "Find the first term of the sequence that is negative.", "$u_{13} = -3$",
                  [("M1", "setting $45-4(n-1)<0$ and solving algebraically"),
                   ("A1", "$n = 13$"), ("A1", "$u_{13} = -3$")]),
        ],
    },
    {
        "topic_code": "AA1.2", "level": "SL", "paper_type": "P2", "calculator": "gdc",
        "section": "A", "total_marks": 4, "difficulty": "medium",
        "blueprint_cell": "AA1.2|SL|gdc|bespoke",
        "stem_latex": "For an arithmetic sequence, $S_5 = 80$ and $S_8 = 188$, where $S_n$ denotes the sum of the first $n$ terms.",
        "parts": [
            _part("a", 1, "Write down expressions for $S_5$ and $S_8$ in terms of $u_1$ and $d$.",
                  "$S_5 = 5u_1+10d$, $S_8=8u_1+28d$",
                  [("A1", "both expressions correct")]),
            _part("b", 3, "Find $u_1$ and $d$.", "$u_1 = 6$, $d = 5$",
                  [("M1", "solving the system (e.g. via GDC)"), ("A1", "$u_1 = 6$"), ("A1", "$d = 5$")]),
        ],
    },
    {
        "topic_code": "AA1.2", "level": "SL", "paper_type": "P1", "calculator": "none",
        "section": "A", "total_marks": 5, "difficulty": "medium",
        "blueprint_cell": "AA1.2|SL|none|bespoke",
        "stem_latex": "An arithmetic sequence has $u_1 = 10$ and $u_{11} = 50$.",
        "parts": [
            _part("a", 2, "Find the common difference $d$.", "$d = 4$",
                  [("M1", "attempt to use $u_{11}=u_1+10d$"), ("A1", "$d = 4$")]),
            _part("b", 3, "Find the smallest value of $n$ for which $u_n$ first exceeds $75$.", "$n = 18$",
                  [("M1", "setting $10+4(n-1)>75$"),
                   ("M1", "solving the inequality"),
                   ("A1", "$n = 18$")]),
        ],
    },
    # ======================= HL | none (4) =======================
    {
        "topic_code": "AA1.2", "level": "HL", "paper_type": "P1", "calculator": "none",
        "section": "A", "total_marks": 6, "difficulty": "medium",
        "blueprint_cell": "AA1.2|HL|none|bespoke",
        "stem_latex": "The positive odd integers $1, 3, 5, 7, \\ldots$ form an arithmetic sequence with first term $1$ and common difference $2$.",
        "parts": [
            _part("a", 4, "Show that the sum of the first $n$ positive odd integers is $n^{2}$.", "shown",
                  [("M1", "correct use of $S_n = \\frac{n}{2}(2u_1+(n-1)d)$"),
                   ("A1", "correct substitution of $u_1=1$, $d=2$"),
                   ("M1", "expanding and simplifying $\\frac{n}{2}(2+2(n-1))$"),
                   ("A1", "simplifies to $n^{2}$ (AG)")]),
            _part("b", 2, "Hence find the sum of the first $30$ positive odd integers.", "$900$",
                  [("M1", "substituting $n=30$ into the result from (a)"), ("A1", "$900$")]),
        ],
    },
    {
        "topic_code": "AA1.2", "level": "HL", "paper_type": "P1", "calculator": "none",
        "section": "A", "total_marks": 6, "difficulty": "medium",
        "blueprint_cell": "AA1.2|HL|none|bespoke",
        "stem_latex": "In an arithmetic sequence, the common difference is $4$, and $u_1 \\times u_3 = 9$.",
        "parts": [
            _part("a", 3, "Find the possible value(s) of $u_1$.", "$u_1 = 1$ or $u_1 = -9$",
                  [("M1", "forming $u_1(u_1+8)=9$"),
                   ("M1", "solving the resulting quadratic"),
                   ("A1", "$u_1 = 1$ or $u_1=-9$")]),
            _part("b", 3, "Find the corresponding value(s) of $u_7$.", "$u_7 = 25$ or $u_7 = 15$",
                  [("M1", "substituting each value of $u_1$ into $u_7=u_1+6d$"),
                   ("A1", "$u_7=25$ (from $u_1=1$)"), ("A1", "$u_7=15$ (from $u_1=-9$)")]),
        ],
    },
    {
        "topic_code": "AA1.2", "level": "HL", "paper_type": "P1", "calculator": "none",
        "section": "A", "total_marks": 6, "difficulty": "medium",
        "blueprint_cell": "AA1.2|HL|none|bespoke",
        "stem_latex": "The first three terms of an arithmetic sequence are $a-d$, $a$, $a+d$. Their sum is $21$, and the sum of their squares is $155$.",
        "parts": [
            _part("a", 2, "Show that $a = 7$.", "shown",
                  [("M1", "$(a-d)+a+(a+d)=21$"), ("A1", "simplifies to $3a=21$, so $a=7$ (AG)")]),
            _part("b", 4, "Find the possible value(s) of $d$.", "$d = 2$ or $d = -2$",
                  [("M1", "$(a-d)^{2}+a^{2}+(a+d)^{2}=155$"),
                   ("M1", "substituting $a=7$ and simplifying to an equation in $d$"),
                   ("A1", "$d^{2}=4$"), ("A1", "$d = 2$ or $d=-2$")]),
        ],
    },
    {
        "topic_code": "AA1.2", "level": "HL", "paper_type": "P1", "calculator": "none",
        "section": "A", "total_marks": 6, "difficulty": "medium",
        "blueprint_cell": "AA1.2|HL|none|bespoke",
        "stem_latex": "Two arithmetic sequences have sums of their first $n$ terms given by $S_n^{A} = 3n^{2}+2n$ and $S_n^{B} = n^{2}+8n$.",
        "parts": [
            _part("a", 3, "Find expressions, in terms of $n$, for the $n$th term of each sequence.",
                  "$u_n^{A} = 6n-1$, $u_n^{B} = 2n+7$",
                  [("M1", "using $u_n = S_n - S_{n-1}$ for $n\\geq 2$ (or equivalent)"),
                   ("A1", "$u_n^{A} = 6n-1$"), ("A1", "$u_n^{B} = 2n+7$")]),
            _part("b", 3, "Find the value of $n$ for which the two sequences have the same $n$th term.", "$n = 2$",
                  [("M1", "setting $u_n^{A} = u_n^{B}$"), ("A1", "$4n=8$"), ("A1", "$n = 2$")]),
        ],
    },
    # ======================= HL | gdc (3) =======================
    {
        "topic_code": "AA1.2", "level": "HL", "paper_type": "P2", "calculator": "gdc",
        "section": "A", "total_marks": 5, "difficulty": "medium",
        "blueprint_cell": "AA1.2|HL|gdc|bespoke",
        "stem_latex": (
            "Two employees' annual salaries (in dollars) both increase arithmetically. In year $1$, "
            "Employee A earns $\\$2000$ and their salary increases by $\\$300$ each year. In year $1$, Employee B earns "
            "$\\$2800$ and their salary increases by $\\$150$ each year."
        ),
        "parts": [
            _part("a", 2, "Write down expressions for Employee A's and Employee B's salary in year $n$.",
                  "Employee A: $2000+300(n-1)$; Employee B: $2800+150(n-1)$",
                  [("A1", "Employee A's expression correct"), ("A1", "Employee B's expression correct")]),
            _part("b", 3, "Find the first year in which Employee A's salary exceeds Employee B's salary.", "Year $7$",
                  [("M1", "setting $2000+300(n-1) > 2800+150(n-1)$"),
                   ("M1", "solving/trialling (e.g. via GDC)"),
                   ("A1", "$n = 7$")]),
        ],
    },
    {
        "topic_code": "AA1.2", "level": "HL", "paper_type": "P2", "calculator": "gdc",
        "section": "A", "total_marks": 5, "difficulty": "medium",
        "blueprint_cell": "AA1.2|HL|gdc|bespoke",
        "stem_latex": (
            "Two savings plans accumulate arithmetically. Plan A deposits $\\$500$ in month $1$ and increases "
            "the monthly deposit by $\\$100$ each month thereafter. Plan B deposits $\\$1000$ in month $1$ and "
            "increases the monthly deposit by $\\$20$ each month thereafter."
        ),
        "parts": [
            _part("a", 2, "Write down expressions for the total amount saved under each plan after $n$ months.",
                  "Plan A: $S_n^{A} = 50n^{2}+450n$; Plan B: $S_n^{B}=10n^{2}+990n$",
                  [("A1", "Plan A's expression correct"), ("A1", "Plan B's expression correct")]),
            _part("b", 3, "Find the first month in which the total saved under Plan A exceeds the total saved under Plan B.",
                  "Month $14$",
                  [("M1", "setting $S_n^{A} > S_n^{B}$"),
                   ("M1", "solving/trialling (e.g. via GDC)"),
                   ("A1", "$n = 14$")]),
        ],
    },
    {
        "topic_code": "AA1.2", "level": "HL", "paper_type": "P2", "calculator": "gdc",
        "section": "A", "total_marks": 5, "difficulty": "medium",
        "blueprint_cell": "AA1.2|HL|gdc|bespoke",
        "stem_latex": "An arithmetic sequence has $u_1 = 8$ and $u_{11} = 68$.",
        "parts": [
            _part("a", 2, "Find the common difference $d$.", "$d = 6$",
                  [("M1", "attempt to use $u_{11}=u_1+10d$"), ("A1", "$d = 6$")]),
            _part("b", 3, "Find the smallest value of $n$ for which $S_n$ first exceeds $900$.", "$n = 17$",
                  [("M1", "correct expression for $S_n$"),
                   ("M1", "solving/trialling $S_n>900$ (e.g. via GDC)"),
                   ("A1", "$n = 17$")]),
        ],
    },
]


def build_all_bespoke_aa1_2() -> list[dict]:
    out = []
    for q in BESPOKE_AA1_2:
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
    qs = build_all_bespoke_aa1_2()
    print(f"{len(qs)} bespoke AA1.2 questions authored.")
    from collections import Counter
    print(Counter(q["blueprint_cell"] for q in qs))
