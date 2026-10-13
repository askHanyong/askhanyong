"""Computes per-topic skeleton coverage stats to ground the pilot topic
choice and blueprint grid proposal -- no guessing, just what's actually in
bank.db. Reads a small topic_name/level_scope lookup (verified via a direct
Supabase query, pasted in below rather than re-queried, since it's static
metadata not past-paper content) to group by theme.
"""
import json
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "bank.db"

# code -> (topic_name, subtopic_name) -- from a direct `select code, topic_name,
# subtopic_name, level_scope from syllabus_topics` run this session, not memory.
TOPIC_META = {
    "AA1.2": ("Number and Algebra", "Arithmetic sequences and series; sigma notation"),
    "AA1.3": ("Number and Algebra", "Geometric sequences and series"),
    "AA1.4": ("Number and Algebra", "Financial applications: compound interest and depreciation"),
    "AA1.6": ("Number and Algebra", "Simple deductive proof"),
    "AA1.7": ("Number and Algebra", "Laws of exponents and logarithms (rational exponents)"),
    "AA1.8": ("Number and Algebra", "Infinite geometric series"),
    "AA1.9": ("Number and Algebra", "Binomial theorem (positive integer exponent)"),
    "AA2.1": ("Functions", "Equations of a straight line"),
    "AA2.2": ("Functions", "Concept of a function; domain and range"),
    "AA2.3": ("Functions", "Graphing functions and sketching from context"),
    "AA2.4": ("Functions", "Key features of graphs; intersections"),
    "AA2.5": ("Functions", "Composite functions"),
    "AA2.6": ("Functions", "Quadratic functions: standard/factor/vertex forms"),
    "AA2.7": ("Functions", "Quadratic equations; discriminant and nature of roots"),
    "AA2.8": ("Functions", "Reciprocal and simple rational functions"),
    "AA2.9": ("Functions", "Exponential and logarithmic functions"),
    "AA2.10": ("Functions", "Solving equations graphically and analytically"),
    "AA2.11": ("Functions", "Transformations of graphs"),
    "AA4.1": ("Statistics and Probability", "Concepts of data; sampling and bias"),
    "AA4.2": ("Statistics and Probability", "Presentation of data: histograms; box-and-whisker"),
    "AA4.3": ("Statistics and Probability", "Measures of central tendency and dispersion"),
    "AA4.4": ("Statistics and Probability", "Linear correlation of bivariate data"),
    "AA4.5": ("Statistics and Probability", "Probability concepts and sample space"),
    "AA4.6": ("Statistics and Probability", "Probability diagrams: Venn; tree; sample space"),
    "AA4.7": ("Statistics and Probability", "Discrete random variables; expected value"),
    "AA4.8": ("Statistics and Probability", "Binomial distribution"),
    "AA4.9": ("Statistics and Probability", "Normal distribution"),
    "AA4.10": ("Statistics and Probability", "Regression line of x on y"),
    "AA4.11": ("Statistics and Probability", "Conditional probability (formal treatment)"),
    "AA4.12": ("Statistics and Probability", "Standardization of normal variables"),
    "AA5.1": ("Calculus", "Introduction to calculus: limits and derivative"),
    "AA5.2": ("Calculus", "Increasing and decreasing functions"),
    "AA5.3": ("Calculus", "Derivatives of polynomials"),
    "AA5.4": ("Calculus", "Tangents and normals"),
    "AA5.5": ("Calculus", "Introduction to integration"),
    "AA5.6": ("Calculus", "Derivatives of elementary functions; chain/product/quotient rules"),
    "AA5.7": ("Calculus", "Second derivative"),
    "AA5.8": ("Calculus", "Local maxima/minima; optimization"),
    "AA5.9": ("Calculus", "Kinematics problems"),
    "AA5.10": ("Calculus", "Indefinite integrals"),
    "AA5.11": ("Calculus", "Definite integrals; area under/between curves"),
}

THEMES = ["Number and Algebra", "Functions", "Statistics and Probability", "Calculus"]


def main():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    print("=== Per-SL/HL-scope-only, PRIMARY-tagged part counts, by theme ===\n")
    for theme in THEMES:
        codes = [c for c, (t, _) in TOPIC_META.items() if t == theme]
        print(f"--- {theme} ---")
        rows = conn.execute(
            f"""
            select topic_code,
                   count(*) as n_parts,
                   count(distinct level) as n_levels,
                   sum(case when calculator_allowed=1 then 1 else 0 end) as n_gdc,
                   sum(case when calculator_allowed=0 then 1 else 0 end) as n_nongdc,
                   min(marks) as min_marks, max(marks) as max_marks,
                   count(distinct command_term) as n_command_terms
            from skeletons
            where topic_is_primary = 1 and topic_code in ({",".join("?" for _ in codes)})
            group by topic_code
            order by n_parts desc
            """,
            codes,
        ).fetchall()
        for r in rows:
            name = TOPIC_META[r["topic_code"]][1]
            print(
                f"  {r['topic_code']:8s} n_parts={r['n_parts']:3d}  gdc={r['n_gdc']:3d}/nongdc={r['n_nongdc']:3d}  "
                f"marks={r['min_marks']}-{r['max_marks']}  distinct_command_terms={r['n_command_terms']:2d}  {name}"
            )
        print()

    conn.close()


if __name__ == "__main__":
    main()
