"""ONE-OFF: inserts synthetic test rows into bank.db's `questions` table under
batch_id='_smoke_test' to exercise generate_review_sheet.py end-to-end
(template + bespoke modes, passed/failed/error check statuses, inline +
display LaTeX, multi-part mark schemes) without waiting for real pilot
generation. Deleted by cleanup_smoke_test.py after visual verification --
bank.db's real `questions` table must stay empty until the blueprint is
approved and real generation runs.
"""
import json
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "bank.db"

ROWS = [
    {
        "id": "_smoke_test_1",
        "level": "SL", "paper_type": "P1", "calculator": "none", "section": "A",
        "total_marks": 4, "topic_code": "AA2.7", "blueprint_cell": "AA2.7|SL|none|template|low",
        "mode": "template", "difficulty": "easy",
        "stem_latex": "Consider the quadratic equation $x^{2} - 6x + k = 0$, where $k \\in \\mathbb{R}$.",
        "parts_json": json.dumps([
            {
                "label": "a", "marks": 2,
                "text": "Find the discriminant of the equation in terms of $k$.",
                "answer": "$\\Delta = 36 - 4k$",
                "markscheme_lines": [
                    {"note": "M1", "desc": "attempt to use $b^{2}-4ac$"},
                    {"note": "A1", "desc": "$\\Delta = 36 - 4k$"},
                ],
            },
            {
                "label": "b", "marks": 2,
                "text": "Hence find the value of $k$ for which the equation has exactly one real root.",
                "answer": "$k = 9$",
                "markscheme_lines": [
                    {"note": "M1", "desc": "setting $\\Delta = 0$"},
                    {"note": "A1", "desc": "$k = 9$"},
                ],
            },
        ]),
        "check_code": "from sympy import symbols, discriminant\nx, k = symbols('x k')\nprint('PASS')",
        "check_status": "passed",
        "check_log": json.dumps({"params": {"a": 1, "b": -6, "target_k": 9}, "stdout": "PASS", "stderr": ""}),
        "review_status": "pending", "review_note": None, "mock_reserved": 0, "batch_id": "_smoke_test",
    },
    {
        "id": "_smoke_test_2",
        "level": "HL", "paper_type": "P2", "calculator": "gdc", "section": "A",
        "total_marks": 5, "topic_code": "AA5.8", "blueprint_cell": "AA5.8|HL|gdc|template|mid",
        "mode": "template", "difficulty": "medium",
        "stem_latex": "An open rectangular box has a square base of side $x$ cm and volume $500\\text{ cm}^3$.",
        "parts_json": json.dumps([
            {
                "label": "a", "marks": 2,
                "text": "Show that the total external surface area, $S\\text{ cm}^2$, is given by $$S(x) = x^{2} + \\frac{2000}{x}.$$",
                "answer": "shown",
                "markscheme_lines": [{"note": "M1", "desc": "height $= 500/x^{2}$, substituted into $S = x^{2} + 4xh$"}],
            },
            {
                "label": "b", "marks": 3,
                "text": "Find the value of $x$ that minimizes $S$, and the minimum surface area, correct to $1$ decimal place.",
                "answer": "$x = 10.0$, $S_{\\min} = 300.0 \\text{ cm}^2$",
                "markscheme_lines": [
                    {"note": "M1", "desc": "$S'(x) = 0$"},
                    {"note": "A1", "desc": "$x = 10.0$"},
                    {"note": "A1", "desc": "$S_{\\min} = 300.0$"},
                ],
            },
        ]),
        "check_code": "from sympy import symbols, diff, solve\nx = symbols('x', positive=True)\nprint('FAIL: computed x=9.8 vs claimed 10.0')",
        "check_status": "failed",
        "check_log": json.dumps({"params": {"volume": 500}, "stdout": "FAIL: computed x=9.8 vs claimed 10.0", "stderr": ""}),
        "review_status": "pending", "review_note": None, "mock_reserved": 0, "batch_id": "_smoke_test",
    },
    {
        "id": "_smoke_test_3",
        "level": "SL", "paper_type": "P1", "calculator": "none", "section": "A",
        "total_marks": 5, "topic_code": "AA4.7", "blueprint_cell": "AA4.7|SL|none|bespoke",
        "mode": "bespoke", "difficulty": "medium",
        "stem_latex": "The discrete random variable $X$ has probability distribution given by the table below, where $p$ is a constant.",
        "parts_json": json.dumps([
            {
                "label": "a", "marks": 2,
                "text": "Show that $p = \\frac{1}{5}$.",
                "answer": "shown",
                "markscheme_lines": [{"note": "M1", "desc": "$\\sum P(X=x) = 1$"}, {"note": "AG", "desc": "$p = 1/5$"}],
            },
            {
                "label": "b", "marks": 3,
                "text": "Find $E(X)$.",
                "answer": "$E(X) = 2.4$",
                "markscheme_lines": [{"note": "M1", "desc": "attempt to sum $x \\cdot P(X=x)$"}, {"note": "A1", "desc": "$E(X) = 2.4$"}],
            },
        ]),
        "check_code": "raise RuntimeError('sympy timeout simulated')",
        "check_status": "error",
        "check_log": "Sympy script timed out after 15s.",
        "review_status": "pending", "review_note": None, "mock_reserved": 0, "batch_id": "_smoke_test",
    },
]


def main():
    conn = sqlite3.connect(DB_PATH)
    cols = list(ROWS[0].keys())
    placeholders = ",".join("?" for _ in cols)
    for row in ROWS:
        conn.execute(f"insert into questions ({','.join(cols)}) values ({placeholders})", [row[c] for c in cols])
    conn.commit()
    n = conn.execute("select count(*) from questions where batch_id='_smoke_test'").fetchone()[0]
    print(f"Inserted {n} synthetic test rows under batch_id='_smoke_test'.")
    conn.close()


if __name__ == "__main__":
    main()
