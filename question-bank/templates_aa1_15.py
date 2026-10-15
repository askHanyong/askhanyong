"""Template question generators for AA1.15 (Proof by induction and by
contradiction, AHL -- confirmed from the imported skeleton data:
topic_level_scope='AHL', 15/15 sample parts are HL, command terms
'Prove' / 'Use mathematical induction to prove', mostly non-calculator
(11/15), typically a single large part worth 5-10 marks).

Four distinct induction "domains", matching real IB variety rather than
a single repeated shape: a series-sum identity (moved here from
templates_aa1_2.py, where it was mis-filed -- induction is its own
syllabus point, not an AA1.2 sub-skill, regardless of what the summed
series looks like), a divisibility result, an nth-derivative result, and
the geometric series sum formula. Same convention as the other template
modules: parameters chosen first, check_code independently re-verifies
both the base case and the inductive step via SymPy (not a hardcoded
PASS).
"""
import json


def _marks_breakdown(lines):
    return [{"note": n, "desc": d} for n, d in lines]


def _signed_term(coeff, var, const):
    """Formats 'coeff*var + const' as e.g. '3x - 2' with clean signs."""
    if coeff == 1:
        term = var
    elif coeff == -1:
        term = f"-{var}"
    else:
        term = f"{coeff}{var}"
    if const > 0:
        return f"{term} + {const}"
    elif const < 0:
        return f"{term} - {abs(const)}"
    return term


# ---------------------------------------------------------------------------
# Domain 1: series sum -- prove sum_{r=1}^n (pr+q) = n(pn+p+2q)/2
# ---------------------------------------------------------------------------
def aa1_15_series_sum_induction(p: int, q: int) -> dict:
    assert p != 0
    b_term = f" + {q}" if q > 0 else (f" - {abs(q)}" if q < 0 else "")
    closed_form_numerator = _signed_term(p, "n", p + 2 * q)
    closed_form_numerator_k = _signed_term(p, "k", p + 2 * q)

    stem = f"Consider the series $\\sum_{{r=1}}^{{n}} ({p}r{b_term})$, where $n$ is a positive integer."
    check_code = f"""
from sympy import symbols, simplify, Rational

p, q, k = {p}, {q}, symbols('k', positive=True, integer=True)

def rhs(n):
    return Rational(1, 2) * n * (p*n + p + 2*q)

lhs_1 = p*1 + q
assert simplify(lhs_1 - rhs(1)) == 0, f"base case fails: LHS(1)={{lhs_1}}, RHS(1)={{rhs(1)}}"

next_term = p*(k+1) + q
step_diff = simplify((rhs(k) + next_term) - rhs(k+1))
assert step_diff == 0, f"inductive step fails: difference = {{step_diff}}, expected 0"
print("PASS")
"""
    return {
        "level": "HL", "paper_type": "P1", "calculator": "none", "section": "A",
        "total_marks": 7, "topic_code": "AA1.15",
        "mode": "template", "difficulty": "hard",
        "stem_latex": stem,
        "parts_json": json.dumps([
            {
                "label": "a", "marks": 7,
                "text": f"Prove by mathematical induction that $\\displaystyle\\sum_{{r=1}}^{{n}} ({p}r{b_term}) = \\dfrac{{n({closed_form_numerator})}}{{2}}$ for all positive integers $n$.",
                "answer": "shown by induction",
                "markscheme_lines": _marks_breakdown([
                    ("M1", f"showing the statement is true for $n=1$: LHS $= {p+q}$, RHS $= {p+q}$"),
                    ("A1", "stating the inductive hypothesis: assume true for $n=k$, i.e. "
                           f"$\\sum_{{r=1}}^{{k}}({p}r{b_term}) = \\dfrac{{k({closed_form_numerator_k})}}{{2}}$"),
                    ("M1", f"considering $n=k+1$: $\\sum_{{r=1}}^{{k+1}}({p}r{b_term}) = \\sum_{{r=1}}^{{k}}({p}r{b_term}) + ({p}(k+1){b_term})$"),
                    ("M1", "substituting the inductive hypothesis for the first term"),
                    ("A1", "correct algebraic simplification"),
                    ("A1", "showing this equals the claimed closed form with $n=k+1$ (AG)"),
                    ("R1", "since true for $n=1$, and true for $n=k \\Rightarrow$ true for $n=k+1$, the statement is "
                           "true for all positive integers $n$ by the principle of mathematical induction"),
                ]),
            },
        ]),
        "check_code": check_code.strip(),
        "params": {"p": p, "q": q},
    }


# ---------------------------------------------------------------------------
# Domain 2: divisibility -- prove (1+D)^n - 1 is divisible by D
# General family: f(k+1) = (1+D)*f(k) + D, so D|f(k) => D|f(k+1); base
# case f(1)=D is trivially divisible by D. Parameterized by D alone, so
# every variant is a genuinely different concrete divisibility claim
# (e.g. D=3 -> "4^n-1 divisible by 3", D=8 -> "9^n-1 divisible by 8").
# ---------------------------------------------------------------------------
def aa1_15_divisibility_induction(D: int) -> dict:
    assert D >= 2
    base = D + 1

    stem = f"Let $f(n) = {base}^{{n}} - 1$ for $n \\in \\mathbb{{Z}}^{{+}}$."
    check_code = f"""
from sympy import symbols, simplify

D = {D}
base = D + 1
k = symbols('k', positive=True, integer=True)

f1 = base**1 - 1
assert f1 % D == 0, f"base case fails: f(1)={{f1}} not divisible by {{D}}"

# identity: f(k+1) = base*f(k) + D  (so D | f(k) => D | f(k+1), since both
# terms on the right are then multiples of D)
fk_symbolic = base**k - 1
identity_diff = simplify((base**(k+1) - 1) - (base*fk_symbolic + D))
assert identity_diff == 0, f"recurrence identity fails: difference = {{identity_diff}}, expected 0"
print("PASS")
"""
    return {
        "level": "HL", "paper_type": "P1", "calculator": "none", "section": "A",
        "total_marks": 7, "topic_code": "AA1.15",
        "mode": "template", "difficulty": "hard",
        "stem_latex": stem,
        "parts_json": json.dumps([
            {
                "label": "a", "marks": 7,
                "text": f"Prove by mathematical induction that $f(n)$ is divisible by ${D}$ for all $n \\in \\mathbb{{Z}}^{{+}}$.",
                "answer": "shown by induction",
                "markscheme_lines": _marks_breakdown([
                    ("M1", f"showing the statement is true for $n=1$: $f(1) = {base}-1 = {base-1}$, divisible by ${D}$"),
                    ("A1", f"stating the inductive hypothesis: assume $f(k) = {base}^{{k}}-1$ is divisible by ${D}$ for some $k \\in \\mathbb{{Z}}^{{+}}$"),
                    ("M1", f"considering $f(k+1) = {base}^{{k+1}}-1 = {base}\\cdot {base}^{{k}} - 1$"),
                    ("M1", f"rewriting as $f(k+1) = {base}(f(k)+1) - 1 = {base}f(k) + {D}$"),
                    ("A1", "correct algebraic simplification"),
                    ("A1", f"both ${base}f(k)$ and ${D}$ are divisible by ${D}$ (using the inductive hypothesis), so $f(k+1)$ is divisible by ${D}$"),
                    ("R1", "since true for $n=1$, and true for $n=k \\Rightarrow$ true for $n=k+1$, the statement is "
                           "true for all positive integers $n$ by the principle of mathematical induction"),
                ]),
            },
        ]),
        "check_code": check_code.strip(),
        "params": {"D": D, "base": base},
    }


# ---------------------------------------------------------------------------
# Domain 3: differentiation -- prove the nth derivative of e^{ax} is a^n e^{ax}
# ---------------------------------------------------------------------------
def aa1_15_derivative_induction(a: int) -> dict:
    assert a != 0
    exponent = "x" if a == 1 else ("-x" if a == -1 else f"{a}x")

    stem = f"Let $f(x) = e^{{{exponent}}}$, and let $f^{{(n)}}(x)$ denote the $n$th derivative of $f$."

    check_code = f"""
from sympy import symbols, exp, diff, simplify

x, m = symbols('x m', real=True)
a = {a}

f = exp(a*x)

base_diff = simplify(diff(f, x, 1) - a*exp(a*x))
assert base_diff == 0, f"base case fails: f'(x) - a*e^{{{{a*x}}}} = {{base_diff}}, expected 0"

hypothesis_form = a**m * exp(a*x)
step_diff = simplify(diff(hypothesis_form, x) - a**(m+1)*exp(a*x))
assert step_diff == 0, f"inductive step fails: difference = {{step_diff}}, expected 0"
print("PASS")
"""
    return {
        "level": "HL", "paper_type": "P1", "calculator": "none", "section": "A",
        "total_marks": 6, "topic_code": "AA1.15",
        "mode": "template", "difficulty": "hard",
        "stem_latex": stem,
        "parts_json": json.dumps([
            {
                "label": "a", "marks": 6,
                "text": f"Prove by mathematical induction that $f^{{(n)}}(x) = {a}^{{n}} e^{{{exponent}}}$ for all positive integers $n$.",
                "answer": "shown by induction",
                "markscheme_lines": _marks_breakdown([
                    ("M1", "attempting to find $f'(x)$"),
                    ("A1", f"$f'(x) = {a}e^{{{exponent}}}$, matching the claimed form with $n=1$"),
                    ("A1", f"stating the inductive hypothesis: assume $f^{{(k)}}(x) = {a}^{{k}} e^{{{exponent}}}$ for some $k \\in \\mathbb{{Z}}^{{+}}$"),
                    ("M1", f"considering $f^{{(k+1)}}(x) = \\dfrac{{d}}{{dx}}\\left[{a}^{{k}} e^{{{exponent}}}\\right]$"),
                    ("A1", f"correctly differentiating to obtain ${a}^{{k+1}} e^{{{exponent}}}$"),
                    ("R1", "since true for $n=1$, and true for $n=k \\Rightarrow$ true for $n=k+1$, the statement is "
                           "true for all positive integers $n$ by the principle of mathematical induction"),
                ]),
            },
        ]),
        "check_code": check_code.strip(),
        "params": {"a": a},
    }


# ---------------------------------------------------------------------------
# Domain 4: geometric series -- prove sum_{r=1}^n a*x^{r-1} = a(x^n-1)/(x-1)
# ---------------------------------------------------------------------------
def aa1_15_geometric_series_induction(a: int, x: int) -> dict:
    assert x not in (0, 1) and a != 0

    stem = (
        f"Consider the geometric series with first term ${a}$ and common ratio ${x}$, "
        f"i.e. $\\displaystyle\\sum_{{r=1}}^{{n}} {a}\\cdot{x}^{{r-1}}$, where $n$ is a positive integer."
    )
    check_code = f"""
from sympy import symbols, simplify, Rational

from sympy import Integer
a, x, k = Integer({a}), Integer({x}), symbols('k', positive=True, integer=True)

def rhs(n):
    return (a*(x**n - 1)) / (x - 1)

assert simplify(a - rhs(1)) == 0, f"base case fails: LHS(1)={{a}}, RHS(1)={{rhs(1)}}"

next_term = a * x**k
step_diff = simplify((rhs(k) + next_term) - rhs(k+1))
assert step_diff == 0, f"inductive step fails: difference = {{step_diff}}, expected 0"
print("PASS")
"""
    return {
        "level": "HL", "paper_type": "P1", "calculator": "none", "section": "A",
        "total_marks": 7, "topic_code": "AA1.15",
        "mode": "template", "difficulty": "hard",
        "stem_latex": stem,
        "parts_json": json.dumps([
            {
                "label": "a", "marks": 7,
                "text": f"Prove by mathematical induction that $\\displaystyle\\sum_{{r=1}}^{{n}} {a}\\cdot{x}^{{r-1}} = \\dfrac{{{a}({x}^{{n}}-1)}}{{{x}-1}}$ for all positive integers $n$.",
                "answer": "shown by induction",
                "markscheme_lines": _marks_breakdown([
                    ("M1", f"showing the statement is true for $n=1$: LHS $= {a}$, RHS $= {a}$"),
                    ("A1", "stating the inductive hypothesis: assume true for $n=k$, i.e. "
                           f"$\\sum_{{r=1}}^{{k}} {a}\\cdot{x}^{{r-1}} = \\dfrac{{{a}({x}^{{k}}-1)}}{{{x}-1}}$"),
                    ("M1", f"considering $n=k+1$: adding the $(k+1)$th term, ${a}\\cdot{x}^{{k}}$, to both sides"),
                    ("M1", "substituting the inductive hypothesis and combining over a common denominator"),
                    ("A1", "correct algebraic simplification"),
                    ("A1", "showing this equals the claimed closed form with $n=k+1$ (AG)"),
                    ("R1", "since true for $n=1$, and true for $n=k \\Rightarrow$ true for $n=k+1$, the statement is "
                           "true for all positive integers $n$ by the principle of mathematical induction"),
                ]),
            },
        ]),
        "check_code": check_code.strip(),
        "params": {"a": a, "x": x},
    }


if __name__ == "__main__":
    import sys
    from runner import run_check

    samples = [
        aa1_15_series_sum_induction(2, -1),
        aa1_15_divisibility_induction(3),
        aa1_15_derivative_induction(2),
        aa1_15_geometric_series_induction(3, 2),
    ]
    for q in samples:
        r = run_check(q["check_code"])
        print(q["params"], "->", r["status"])
        if r["status"] != "passed":
            print(r["stderr"])
