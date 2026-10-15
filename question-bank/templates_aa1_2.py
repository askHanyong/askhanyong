"""Template question generators for AA1.2 (Arithmetic sequences and series;
sigma notation), scaling the pilot's single-question-per-cell sample up
toward the 20-per-blueprint-cell production target.

Two distinct template "shapes" per blueprint cell (AA1.2|SL|none,
AA1.2|SL|gdc, AA1.2|HL|none, AA1.2|HL|gdc), each run over several
hand-picked parameter tuples to produce many non-duplicate variants.
Same convention as templates.py: parameters are chosen first, the
question is built backward from them, and check_code is a real,
independently-runnable SymPy verification (not a hardcoded PASS).
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
# AA1.2 | SL | none -- Shape A: two known terms -> find d, u1, then u_target
# ---------------------------------------------------------------------------
def aa1_2_two_terms_given(u1: int, d: int, idx_a: int, idx_b: int, idx_target: int) -> dict:
    assert idx_a < idx_b
    u_a_val = u1 + (idx_a - 1) * d
    u_b_val = u1 + (idx_b - 1) * d
    u_target_val = u1 + (idx_target - 1) * d

    stem = f"In an arithmetic sequence, $u_{{{idx_a}}} = {u_a_val}$ and $u_{{{idx_b}}} = {u_b_val}$."
    check_code = f"""
from sympy import Eq, solve, symbols
u1_, d_ = symbols('u1 d')
eq1 = Eq(u1_ + ({idx_a}-1)*d_, {u_a_val})
eq2 = Eq(u1_ + ({idx_b}-1)*d_, {u_b_val})
sol = solve([eq1, eq2], [u1_, d_])
assert sol[u1_] == {u1}, f"computed u1={{sol[u1_]}}, expected {u1}"
assert sol[d_] == {d}, f"computed d={{sol[d_]}}, expected {d}"
u_target = sol[u1_] + ({idx_target}-1)*sol[d_]
assert u_target == {u_target_val}, f"computed u_target={{u_target}}, expected {u_target_val}"
print("PASS")
"""
    return {
        "level": "SL", "paper_type": "P1", "calculator": "none", "section": "A",
        "total_marks": 5, "topic_code": "AA1.2",
        "mode": "template", "difficulty": "easy",
        "stem_latex": stem,
        "parts_json": json.dumps([
            {
                "label": "a", "marks": 3,
                "text": "Find the common difference $d$ and the first term $u_1$.",
                "answer": f"$d = {d}$, $u_1 = {u1}$",
                "markscheme_lines": _marks_breakdown([
                    ("M1", f"attempt to form a system from $u_{{{idx_a}}}={u_a_val}$, $u_{{{idx_b}}}={u_b_val}$"),
                    ("A1", f"$d = {d}$"), ("A1", f"$u_1 = {u1}$"),
                ]),
            },
            {
                "label": "b", "marks": 2,
                "text": f"Find $u_{{{idx_target}}}$.",
                "answer": f"$u_{{{idx_target}}} = {u_target_val}$",
                "markscheme_lines": _marks_breakdown([
                    ("M1", "correct substitution into $u_n = u_1 + (n-1)d$"),
                    ("A1", f"$u_{{{idx_target}}} = {u_target_val}$"),
                ]),
            },
        ]),
        "check_code": check_code.strip(),
        "params": {"u1": u1, "d": d, "idx_a": idx_a, "idx_b": idx_b, "idx_target": idx_target},
    }


# ---------------------------------------------------------------------------
# AA1.2 | SL | none -- Shape B: three linear-in-x expressions in AP -> find x, d
# Slopes fixed at 1, 3, 4 (so 2*T2-T1-T3 has x-coefficient exactly 1,
# guaranteeing an integer solution for x for any integer offsets).
# ---------------------------------------------------------------------------
def aa1_2_three_terms_ap_linear(b_off: int, d_off: int, f_off: int) -> dict:
    x_val = b_off + f_off - 2 * d_off
    t1 = x_val + b_off
    t2 = 3 * x_val + d_off
    t3 = 4 * x_val + f_off
    common_diff = t2 - t1
    assert t3 - t2 == common_diff, "internal: not a valid AP"
    assert common_diff != 0, "internal: degenerate (zero common difference)"

    e1 = _signed_term(1, "x", b_off)
    e2 = _signed_term(3, "x", d_off)
    e3 = _signed_term(4, "x", f_off)
    stem = f"The numbers ${e1}$, ${e2}$, ${e3}$ (in that order) are consecutive terms of an arithmetic sequence."
    check_code = f"""
from sympy import symbols, Eq, solve
x = symbols('x')
T1 = x + ({b_off})
T2 = 3*x + ({d_off})
T3 = 4*x + ({f_off})
sols = solve(Eq(2*T2, T1 + T3), x)
assert len(sols) == 1, f"expected exactly one solution for x, got {{sols}}"
x_val = sols[0]
assert x_val == {x_val}, f"computed x={{x_val}}, expected {x_val}"
d_val = (T2 - T1).subs(x, x_val)
assert d_val == {common_diff}, f"computed d={{d_val}}, expected {common_diff}"
assert (T3 - T2).subs(x, x_val) == d_val, "inconsistent common difference"
print("PASS")
"""
    return {
        "level": "SL", "paper_type": "P1", "calculator": "none", "section": "A",
        "total_marks": 4, "topic_code": "AA1.2",
        "mode": "template", "difficulty": "easy",
        "stem_latex": stem,
        "parts_json": json.dumps([
            {
                "label": "a", "marks": 2,
                "text": "Find the value of $x$.",
                "answer": f"$x = {x_val}$",
                "markscheme_lines": _marks_breakdown([
                    ("M1", "setting (second term) $\\times 2 = $ (first term) + (third term)"),
                    ("A1", f"$x = {x_val}$"),
                ]),
            },
            {
                "label": "b", "marks": 2,
                "text": "Hence find the common difference of the sequence.",
                "answer": f"$d = {common_diff}$",
                "markscheme_lines": _marks_breakdown([
                    ("M1", "substituting the value of $x$ into two consecutive terms"),
                    ("A1", f"$d = {common_diff}$"),
                ]),
            },
        ]),
        "check_code": check_code.strip(),
        "params": {"b_off": b_off, "d_off": d_off, "f_off": f_off, "x": x_val, "d": common_diff},
    }


# ---------------------------------------------------------------------------
# AA1.2 | SL | gdc -- Shape A: a1, d given, Sn = target -> solve for n
# ---------------------------------------------------------------------------
def aa1_2_sum_solve_n(a1: int, d: int, target_n: int) -> dict:
    assert a1 > 0 and d > 0 and target_n > 0
    target_S = target_n * (2 * a1 + (target_n - 1) * d) // 2
    assert target_n * (2 * a1 + (target_n - 1) * d) % 2 == 0, "internal: non-integer sum"

    stem = (
        f"In an arithmetic sequence, the first term is ${a1}$ and the common difference is ${d}$. "
        f"The sum of the first $n$ terms is ${target_S}$."
    )
    check_code = f"""
import sympy as sp
n = sp.symbols('n')
a1, d = {a1}, {d}
Sn_expr = sp.expand(n/2*(2*a1+(n-1)*d))
sols = sp.solve(sp.Eq(Sn_expr, {target_S}), n)
pos_int_sols = [s for s in sols if s.is_real and s > 0 and s == sp.floor(s)]
assert len(pos_int_sols) == 1, f"expected exactly one positive integer root, got {{sols}}"
n_val = int(pos_int_sols[0])
assert n_val == {target_n}, f"computed n={{n_val}}, expected {target_n}"
print("PASS")
"""
    return {
        "level": "SL", "paper_type": "P2", "calculator": "gdc", "section": "A",
        "total_marks": 4, "topic_code": "AA1.2",
        "mode": "template", "difficulty": "medium",
        "stem_latex": stem,
        "parts_json": json.dumps([
            {
                "label": "a", "marks": 1,
                "text": "Write down an expression for $S_n$ in terms of $n$.",
                "answer": f"$S_n = \\dfrac{{n}}{{2}}(2({a1})+(n-1)({d}))$",
                "markscheme_lines": _marks_breakdown([
                    ("A1", "$S_n = \\frac{n}{2}(2a_1+(n-1)d)$ with the given values substituted"),
                ]),
            },
            {
                "label": "b", "marks": 3,
                "text": "Find the value of $n$.",
                "answer": f"$n = {target_n}$",
                "markscheme_lines": _marks_breakdown([
                    ("M1", f"setting $S_n = {target_S}$ to form a quadratic in $n$"),
                    ("M1", "solving the quadratic (e.g. via GDC)"),
                    ("A1", f"$n = {target_n}$ (rejecting the negative root)"),
                ]),
            },
        ]),
        "check_code": check_code.strip(),
        "params": {"a1": a1, "d": d, "target_n": target_n, "target_S": target_S},
    }


# ---------------------------------------------------------------------------
# AA1.2 | SL | gdc -- Shape B: Sn = An^2+Bn given -> find a1, d, u_k
# ---------------------------------------------------------------------------
def aa1_2_sum_quadratic_reverse(A: int, B: int, k: int, target_S: int) -> dict:
    assert A != 0 and k > 0
    a1 = A + B
    d = 2 * A
    u_k = a1 + (k - 1) * d

    def S(n):
        return a1 * n + d * n * (n - 1) // 2

    # Threshold is on S_n (quadratic in n), not u_n (always linear in n for
    # an AP) -- a u_n threshold is solvable by inspection/mental arithmetic
    # regardless of how the sequence was defined, so it doesn't genuinely
    # need a GDC. target_S is chosen directly (not via a "+1" boundary
    # trick) and checked not to land exactly on a term's running total.
    n0 = 1
    while S(n0) <= target_S:
        n0 += 1
    assert S(n0 - 1) != target_S, f"internal: target_S={target_S} lands exactly on S({n0-1}) -- boundary-hugging"

    # Build "A n^2 + B n" with proper omission of bare coefficient 1 and sign handling.
    a_term = "n^{2}" if A == 1 else ("-n^{2}" if A == -1 else f"{A}n^{{2}}")
    b_term = f" + {B}n" if B > 1 else (
        " + n" if B == 1 else (
            f" - {abs(B)}n" if B < -1 else (" - n" if B == -1 else "")
        )
    )
    stem = f"For an arithmetic sequence, $S_n = {a_term}{b_term}$ for all positive integers $n$, where $S_n$ denotes the sum of the first $n$ terms."
    check_code = f"""
import sympy as sp
n = sp.symbols('n', positive=True, integer=True)
S = {A}*n**2 + ({B})*n
def S_at(k):
    return S.subs(n, k)
u1 = sp.nsimplify(S_at(1))
u2 = sp.nsimplify(S_at(2)) - u1
d = u2 - u1
u_k = u1 + ({k}-1)*d
assert int(u1) == {a1}, f"computed u1={{u1}}, expected {a1}"
assert int(d) == {d}, f"computed d={{d}}, expected {d}"
assert int(u_k) == {u_k}, f"computed u_k={{u_k}}, expected {u_k}"
n_val = 1
while int(S_at(n_val)) <= {target_S}:
    n_val += 1
assert n_val == {n0}, f"computed smallest n={{n_val}}, expected {n0}"
print("PASS")
"""
    return {
        "level": "SL", "paper_type": "P2", "calculator": "gdc", "section": "A",
        "total_marks": 6, "topic_code": "AA1.2",
        "mode": "template", "difficulty": "medium",
        "stem_latex": stem,
        "parts_json": json.dumps([
            {
                "label": "a", "marks": 2,
                "text": "Find $u_1$ and the common difference $d$.",
                "answer": f"$u_1 = {a1}$, $d = {d}$",
                "markscheme_lines": _marks_breakdown([
                    ("M1", "$u_1 = S_1$, $d = (S_2-S_1) - S_1$"),
                    ("A1", f"$u_1={a1}$, $d={d}$"),
                ]),
            },
            {
                "label": "b", "marks": 2,
                "text": f"Find $u_{{{k}}}$.",
                "answer": f"$u_{{{k}}} = {u_k}$",
                "markscheme_lines": _marks_breakdown([
                    ("M1", f"$u_{{{k}}} = u_1+({k}-1)d$ or $S_{{{k}}}-S_{{{k-1}}}$"),
                    ("A1", f"$u_{{{k}}} = {u_k}$"),
                ]),
            },
            {
                "label": "c", "marks": 2,
                "text": f"Find the smallest value of $n$ for which $S_n$ first exceeds ${target_S}$.",
                "answer": f"$n = {n0}$",
                "markscheme_lines": _marks_breakdown([
                    ("M1", f"solving/trialling $S_n > {target_S}$ (e.g. via GDC)"),
                    ("A1", f"$n = {n0}$"),
                ]),
            },
        ]),
        "check_code": check_code.strip(),
        "params": {"A": A, "B": B, "k": k, "target_S": target_S, "u1": a1, "d": d, "u_k": u_k, "n0": n0},
    }


# ---------------------------------------------------------------------------
# AA1.2 | HL | none -- Shape A: sigma notation, show closed form, solve n
# ---------------------------------------------------------------------------
def aa1_2_sigma_notation(p: int, q: int, target_n: int) -> dict:
    import sympy as sp
    assert p > 0 and target_n > 0
    target_S = sum(p * r + q for r in range(1, target_n + 1))
    first_term = p + q
    b_term = f" + {q}" if q > 0 else (f" - {abs(q)}" if q < 0 else "")

    # Always display the fully simplified/factored closed form (e.g. "2n(n+1)"
    # or "3n^2", not an unreduced "n(4n+4)/2" or "n(6n)/2") -- delegated to
    # SymPy's own simplification rather than hand-built string templating,
    # which previously left fractions like n(4n+0)/2 unreduced.
    n_display = sp.symbols('n', positive=True, integer=True)
    closed_form_rhs = sp.factor(sp.expand(sp.Rational(1, 2) * n_display * (p * n_display + p + 2 * q)))
    closed_form_latex = sp.latex(closed_form_rhs)
    closed_form_latex_k = closed_form_latex.replace("n", "k")

    stem = f"Consider the arithmetic series $\\sum_{{r=1}}^{{n}} ({p}r{b_term})$."
    check_code = f"""
import sympy as sp
r, n = sp.symbols('r n', positive=True, integer=True)
p, q = {p}, {q}
first_term = sp.Rational(p*1+q)
second_term = sp.Rational(p*2+q)
common_difference = sp.simplify(second_term - first_term)
sum_expr = sp.simplify(sp.summation(p*r+q, (r, 1, n)))
claimed_formula = sp.Rational(1,2)*n*(p*n+p+2*q)
assert sp.simplify(sum_expr - claimed_formula) == 0, "closed form does not match the computed sum"
n_sym = sp.symbols('n_sym')
eq = sp.Eq(sp.Rational(1,2)*n_sym*(p*n_sym+p+2*q), {target_S})
sols = sp.solve(eq, n_sym)
pos_int = [s for s in sols if s.is_real and s > 0 and s == sp.floor(s)]
assert len(pos_int) == 1, f"expected one positive integer root, got {{sols}}"
n_val = int(pos_int[0])
assert n_val == {target_n}, f"computed n={{n_val}}, expected {target_n}"
assert int(first_term) == {first_term}, f"computed first term {{first_term}}, expected {first_term}"
assert int(common_difference) == {p}, f"computed common difference {{common_difference}}, expected {p}"
print("PASS")
"""
    return {
        "level": "HL", "paper_type": "P1", "calculator": "none", "section": "A",
        "total_marks": 6, "topic_code": "AA1.2",
        "mode": "template", "difficulty": "medium",
        "stem_latex": stem,
        "parts_json": json.dumps([
            {
                "label": "a", "marks": 2,
                "text": "Find the first term and the common difference of the series.",
                "answer": f"first term $= {first_term}$, common difference $= {p}$",
                "markscheme_lines": _marks_breakdown([
                    ("M1", "evaluating at least two consecutive terms (e.g. $r=1,2$)"),
                    ("A1", f"first term ${first_term}$, common difference ${p}$"),
                ]),
            },
            {
                "label": "b", "marks": 2,
                "text": f"Show that $\\sum_{{r=1}}^{{n}}({p}r{b_term}) = {closed_form_latex}$.",
                "answer": "shown",
                "markscheme_lines": _marks_breakdown([
                    ("M1", "correct use of $S_n = \\frac{n}{2}(2u_1+(n-1)d)$"),
                    ("A1", "algebra leading to the given result (AG)"),
                ]),
            },
            {
                "label": "c", "marks": 2,
                "text": f"Hence find the value of $n$ for which the sum equals ${target_S}$.",
                "answer": f"$n = {target_n}$",
                "markscheme_lines": _marks_breakdown([
                    ("M1", f"setting the closed form $= {target_S}$ and forming a quadratic"),
                    ("A1", f"$n = {target_n}$ (rejecting the negative root)"),
                ]),
            },
        ]),
        "check_code": check_code.strip(),
        "params": {"p": p, "q": q, "target_n": target_n, "target_S": target_S, "first_term": first_term},
    }


# ---------------------------------------------------------------------------
# AA1.2 | HL | none -- Shape B: equally-index-spaced terms -> u_mid via
# averaging, then d and u1
# ---------------------------------------------------------------------------
def aa1_2_equally_spaced_terms(u1: int, d: int, a_idx: int, mid_idx: int) -> dict:
    assert 1 < a_idx < mid_idx, "a_idx must be >= 2: a_idx=1 means u_{a_idx} IS u_1, which part (b) then asks to 'find' again"
    b_idx = 2 * mid_idx - a_idx
    u_a_val = u1 + (a_idx - 1) * d
    u_mid_val = u1 + (mid_idx - 1) * d
    u_b_val = u1 + (b_idx - 1) * d

    stem = (
        f"In an arithmetic sequence, $u_{{{a_idx}}} = {u_a_val}$ and $u_{{{b_idx}}} = {u_b_val}$."
    )
    check_code = f"""
from sympy import Rational, symbols, Eq, solve
u_mid_computed = Rational({u_a_val} + {u_b_val}, 2)
assert u_mid_computed == {u_mid_val}, f"computed u_mid={{u_mid_computed}}, expected {u_mid_val}"
u1_, d_ = symbols('u1 d')
eq1 = Eq(u1_ + ({a_idx}-1)*d_, {u_a_val})
eq2 = Eq(u1_ + ({b_idx}-1)*d_, {u_b_val})
sol = solve([eq1, eq2], [u1_, d_])
assert sol[u1_] == {u1}, f"computed u1={{sol[u1_]}}, expected {u1}"
assert sol[d_] == {d}, f"computed d={{sol[d_]}}, expected {d}"
print("PASS")
"""
    return {
        "level": "HL", "paper_type": "P1", "calculator": "none", "section": "A",
        "total_marks": 5, "topic_code": "AA1.2",
        "mode": "template", "difficulty": "medium",
        "stem_latex": stem,
        "parts_json": json.dumps([
            {
                "label": "a", "marks": 2,
                "text": f"Given that $u_{{{a_idx}}}$, $u_{{{mid_idx}}}$, $u_{{{b_idx}}}$ are equally spaced in index, find $u_{{{mid_idx}}}$ without first finding $d$ or $u_1$.",
                "answer": f"$u_{{{mid_idx}}} = {u_mid_val}$",
                "markscheme_lines": _marks_breakdown([
                    ("M1", f"recognizing $u_{{{mid_idx}}} = \\frac{{1}}{{2}}(u_{{{a_idx}}}+u_{{{b_idx}}})$ since the indices are equally spaced"),
                    ("A1", f"$u_{{{mid_idx}}} = {u_mid_val}$"),
                ]),
            },
            {
                "label": "b", "marks": 3,
                "text": "Hence, or otherwise, find the common difference $d$ and the first term $u_1$.",
                "answer": f"$d = {d}$, $u_1 = {u1}$",
                "markscheme_lines": _marks_breakdown([
                    ("M1", "forming a system of equations from two known terms"),
                    ("A1", f"$d = {d}$"), ("A1", f"$u_1 = {u1}$"),
                ]),
            },
        ]),
        "check_code": check_code.strip(),
        "params": {"u1": u1, "d": d, "a_idx": a_idx, "mid_idx": mid_idx, "b_idx": b_idx},
    }


# ---------------------------------------------------------------------------
# AA1.2 | HL | gdc -- Shape A: savings/threshold word problem -> u_k, smallest n
# ---------------------------------------------------------------------------
def aa1_2_savings_threshold(a1: int, d: int, k: int, target_S: int, context: dict) -> dict:
    assert a1 > 0 and d > 0
    u_k = a1 + (k - 1) * d

    def S(n):
        return n * (2 * a1 + (n - 1) * d) // 2

    # target_S is chosen directly (a round number) rather than derived from
    # a boundary (e.g. "previous total + 1") -- n0 is computed forward from
    # it. Assert it doesn't land exactly on a term's running total either
    # (a genuine "strict inequality" ambiguity), since that wasn't a
    # deliberately-designed trap here.
    n0 = 1
    while S(n0) <= target_S:
        n0 += 1
    assert S(n0 - 1) != target_S, f"internal: target_S={target_S} lands exactly on S({n0-1}) -- boundary-hugging"

    time_unit = context["time_unit"]
    time_unit_plural = context["time_unit_plural"]
    preposition = context.get("preposition", "in")
    quantity_label = context["quantity_label"]
    value_fmt = context["value_fmt"]
    stem = context["stem"].format(a1=a1, d=d)
    check_code = f"""
a1, d = {a1}, {d}
u_k = a1 + ({k}-1)*d
assert u_k == {u_k}, f"computed u_k={{u_k}}, expected {u_k}"
def S(n):
    return n*(2*a1+(n-1)*d)/2
n = 1
while S(n) <= {target_S}:
    n += 1
assert n == {n0}, f"computed smallest n={{n}}, expected {n0}"
print("PASS")
"""
    return {
        "level": "HL", "paper_type": "P2", "calculator": "gdc", "section": "A",
        "total_marks": 5, "topic_code": "AA1.2",
        "mode": "template", "difficulty": "medium",
        "stem_latex": stem,
        "parts_json": json.dumps([
            {
                "label": "a", "marks": 2,
                "text": f"Find {quantity_label} {preposition} {time_unit} {k}.",
                "answer": f"${value_fmt(u_k)}$",
                "markscheme_lines": _marks_breakdown([
                    ("M1", "correct substitution into $u_n=u_1+(n-1)d$"), ("A1", f"$u_{{{k}}} = {value_fmt(u_k)}$"),
                ]),
            },
            {
                "label": "b", "marks": 3,
                "text": f"Find the smallest value of $n$ for which the running total after $n$ {time_unit_plural} first exceeds ${value_fmt(target_S)}$.",
                "answer": f"$n = {n0}$",
                "markscheme_lines": _marks_breakdown([
                    ("M1", "correct expression for $S_n$"),
                    ("M1", f"solving/trialling $S_n > {value_fmt(target_S)}$ (e.g. via GDC)"),
                    ("A1", f"$n = {n0}$"),
                ]),
            },
        ]),
        "check_code": check_code.strip(),
        "params": {"a1": a1, "d": d, "k": k, "u_k": u_k, "n0": n0, "target_S": target_S},
    }


SAVINGS_CONTEXTS = [
    {
        "stem": "A charity's monthly donations form an arithmetic sequence. In the first month it receives $\\${a1}$, and each following month it receives $\\${d}$ more than the previous month.",
        "time_unit": "month", "time_unit_plural": "months",
        "quantity_label": "the amount received",
        "value_fmt": lambda v: f"\\${v}",
    },
    {
        "stem": "A gym's membership count increases arithmetically each month. In the first month there are {a1} members, and each following month there are {d} more members than the previous month.",
        "time_unit": "month", "time_unit_plural": "months",
        "quantity_label": "the number of members",
        "value_fmt": lambda v: f"{v}",
    },
    {
        "stem": "A runner's weekly distance (in km) forms an arithmetic sequence. In week 1 she runs ${a1}\\text{{ km}}$, and each following week she runs ${d}\\text{{ km}}$ more than the previous week.",
        "time_unit": "week", "time_unit_plural": "weeks",
        "quantity_label": "the distance run (in km)",
        "value_fmt": lambda v: f"{v}\\text{{ km}}",
    },
    {
        "stem": "A bookstore's daily sales form an arithmetic sequence. On day 1 it sells {a1} books, and each following day it sells {d} more books than the previous day.",
        "time_unit": "day", "time_unit_plural": "days", "preposition": "on",
        "quantity_label": "the number of books sold",
        "value_fmt": lambda v: f"{v}",
    },
    {
        "stem": "A company's number of app downloads per day forms an arithmetic sequence. On day 1 there are {a1} downloads, and each following day there are {d} more downloads than the previous day.",
        "time_unit": "day", "time_unit_plural": "days", "preposition": "on",
        "quantity_label": "the number of downloads",
        "value_fmt": lambda v: f"{v}",
    },
    {
        "stem": "A theatre's nightly ticket sales form an arithmetic sequence. On night 1 it sells {a1} tickets, and each following night it sells {d} more tickets than the previous night.",
        "time_unit": "night", "time_unit_plural": "nights", "preposition": "on",
        "quantity_label": "the number of tickets sold",
        "value_fmt": lambda v: f"{v}",
    },
    {
        "stem": "A farmer's weekly egg collection forms an arithmetic sequence. In week 1 she collects {a1} eggs, and each following week she collects {d} more eggs than the previous week.",
        "time_unit": "week", "time_unit_plural": "weeks",
        "quantity_label": "the number of eggs collected",
        "value_fmt": lambda v: f"{v}",
    },
    {
        "stem": "A school's monthly recycling (in kg) forms an arithmetic sequence. In month 1 it collects ${a1}\\text{{ kg}}$, and each following month it collects ${d}\\text{{ kg}}$ more than the previous month.",
        "time_unit": "month", "time_unit_plural": "months",
        "quantity_label": "the mass of recycling collected (in kg)",
        "value_fmt": lambda v: f"{v}\\text{{ kg}}",
    },
]


# ---------------------------------------------------------------------------
# AA1.2 | HL | gdc -- Shape B: Sn = An^2+Bn (word-dressed) -> a1, d, then
# smallest n with u_n > threshold (GDC)
# ---------------------------------------------------------------------------
def aa1_2_sum_quadratic_word(A: int, B: int, target_S: int) -> dict:
    assert A > 0
    a1 = A + B
    d = 2 * A

    def S(n):
        return A * n * n + B * n

    # Threshold on S_n (cumulative/total production), not u_n (daily
    # production, always linear in n for an AP and so solvable without a
    # GDC regardless of how the sequence was defined).
    n0 = 1
    while S(n0) <= target_S:
        n0 += 1
    assert S(n0 - 1) != target_S, f"internal: target_S={target_S} lands exactly on S({n0-1}) -- boundary-hugging"

    a_term = "n^{2}" if A == 1 else ("-n^{2}" if A == -1 else f"{A}n^{{2}}")
    b_term = f" + {B}n" if B > 1 else (
        " + n" if B == 1 else (
            f" - {abs(B)}n" if B < -1 else (" - n" if B == -1 else "")
        )
    )
    stem = (
        f"The total number of items produced by a factory in the first $n$ days is given by "
        f"$S_n = {a_term}{b_term}$, where $S_n$ is measured in units."
    )
    check_code = f"""
import sympy as sp
n = sp.symbols('n', positive=True, integer=True)
S = {A}*n**2 + ({B})*n
u1 = sp.nsimplify(S.subs(n, 1))
u2 = sp.nsimplify(S.subs(n, 2)) - u1
d = u2 - u1
assert int(u1) == {a1}, f"computed u1={{u1}}, expected {a1}"
assert int(d) == {d}, f"computed d={{d}}, expected {d}"
n_val = 1
while int(S.subs(n, n_val)) <= {target_S}:
    n_val += 1
assert n_val == {n0}, f"computed smallest n={{n_val}}, expected {n0}"
print("PASS")
"""
    return {
        "level": "HL", "paper_type": "P2", "calculator": "gdc", "section": "A",
        "total_marks": 5, "topic_code": "AA1.2",
        "mode": "template", "difficulty": "medium",
        "stem_latex": stem,
        "parts_json": json.dumps([
            {
                "label": "a", "marks": 2,
                "text": "Find the number of items produced on day 1, and the daily increase in production.",
                "answer": f"$u_1 = {a1}$, $d = {d}$",
                "markscheme_lines": _marks_breakdown([
                    ("M1", "$u_1 = S_1$, $d = (S_2-S_1)-S_1$"), ("A1", f"$u_1={a1}$, $d={d}$"),
                ]),
            },
            {
                "label": "b", "marks": 3,
                "text": f"Find the smallest value of $n$ for which the total (cumulative) production first exceeds ${target_S}$ units.",
                "answer": f"$n = {n0}$",
                "markscheme_lines": _marks_breakdown([
                    ("M1", "correct expression for $S_n$"),
                    ("M1", f"solving/trialling $S_n > {target_S}$ (e.g. via GDC)"),
                    ("A1", f"$n = {n0}$"),
                ]),
            },
        ]),
        "check_code": check_code.strip(),
        "params": {"A": A, "B": B, "target_S": target_S, "u1": a1, "d": d, "n0": n0},
    }


MAX_VARIANTS_PER_TEMPLATE = 3


def build_all_aa1_2_templates() -> list[dict]:
    specs = []

    # Capped at 3 variants per template function (MAX_VARIANTS_PER_TEMPLATE).
    # Each group below is hand-checked for distinct final answers across its
    # variants -- e.g. sl_none_b previously had two variants that both
    # produced x=6, d=11 (b_off=1,d_off=0,f_off=5 and b_off=0,d_off=-1,f_off=4);
    # the second was swapped out for b_off=5,d_off=2,f_off=-3 (x=-2, d=-7).

    sl_none_a = [
        dict(u1=5, d=3, idx_a=2, idx_b=6, idx_target=15),
        dict(u1=-2, d=5, idx_a=4, idx_b=9, idx_target=25),
        dict(u1=10, d=-2, idx_a=3, idx_b=8, idx_target=12),
    ]
    for kwargs in sl_none_a:
        specs.append((aa1_2_two_terms_given, kwargs, "AA1.2|SL|none|template|low"))

    sl_none_b = [
        dict(b_off=1, d_off=0, f_off=5),
        dict(b_off=-2, d_off=3, f_off=7),
        dict(b_off=5, d_off=2, f_off=-3),
    ]
    for kwargs in sl_none_b:
        specs.append((aa1_2_three_terms_ap_linear, kwargs, "AA1.2|SL|none|template|low"))

    sl_gdc_a = [
        dict(a1=5, d=4, target_n=12),
        dict(a1=2, d=7, target_n=9),
        dict(a1=10, d=3, target_n=14),
    ]
    for kwargs in sl_gdc_a:
        specs.append((aa1_2_sum_solve_n, kwargs, "AA1.2|SL|gdc|template|low"))

    sl_gdc_b = [
        # Targets raised so n lands roughly 10-20 (all three originally gave
        # n=6-10, below the target range) with >=5% margin above the
        # previous running total.
        dict(A=2, B=5, k=8, target_S=280),
        dict(A=1, B=-3, k=12, target_S=150),
        dict(A=4, B=-1, k=7, target_S=550),  # was A=3,B=1 (a1=4,d=6) -- duplicated pilot1_bespoke_3c160636
    ]
    for kwargs in sl_gdc_b:
        specs.append((aa1_2_sum_quadratic_reverse, kwargs, "AA1.2|SL|gdc|template|low"))

    hl_none_a = [
        dict(p=3, q=-1, target_n=14),
        dict(p=4, q=-2, target_n=10),
        dict(p=2, q=1, target_n=18),
    ]
    for kwargs in hl_none_a:
        specs.append((aa1_2_sigma_notation, kwargs, "AA1.2|HL|none|template|mid"))

    hl_none_b = [
        dict(u1=4, d=3, a_idx=2, mid_idx=5),
        dict(u1=-1, d=5, a_idx=3, mid_idx=6),
        dict(u1=10, d=-2, a_idx=2, mid_idx=4),
    ]
    for kwargs in hl_none_b:
        specs.append((aa1_2_equally_spaced_terms, kwargs, "AA1.2|HL|none|template|mid"))

    hl_gdc_a = [
        # Targets chosen so n lands roughly 10-20 and target_S is >=5% above
        # the previous running total (was a1=50,d=15 -- duplicated
        # pilot1_bespoke_b4e45bf7; targets originally landed n=7-8, too low).
        dict(a1=40, d=20, k=7, target_S=2900, context=SAVINGS_CONTEXTS[0]),
        dict(a1=20, d=8, k=7, target_S=1100, context=SAVINGS_CONTEXTS[2]),  # km context -- exercises the leakage fix
        dict(a1=100, d=25, k=5, target_S=3500, context=SAVINGS_CONTEXTS[7]),  # kg context -- exercises the leakage fix
    ]
    for kwargs in hl_gdc_a:
        specs.append((aa1_2_savings_threshold, kwargs, "AA1.2|HL|gdc|template|mid"))

    hl_gdc_b = [
        dict(A=3, B=2, target_S=700),  # target raised 150->700: n was 7, below the 10-20 target range
        dict(A=1, B=5, target_S=290),  # A=1 case -- exercises the bare-"1n" fix; was B=3 (a1=4,d=2) -- duplicated pilot1_bespoke_4a6da53a
        dict(A=4, B=5, target_S=950),
    ]
    for kwargs in hl_gdc_b:
        specs.append((aa1_2_sum_quadratic_word, kwargs, "AA1.2|HL|gdc|template|mid"))

    out = []
    for fn, kwargs, blueprint_cell in specs:
        q = fn(**kwargs)
        q["blueprint_cell"] = blueprint_cell
        q["_template_fn"] = fn.__name__
        out.append(q)

    # Flag (not silently drop) any two variants of the SAME template function
    # that land on an identical final answer -- the symptom the cap is meant
    # to prevent from going unnoticed (e.g. two variants both giving d=11).
    seen = {}
    for q in out:
        answer_fp = _answer_fingerprint(q)
        key = (q["_template_fn"], answer_fp)
        if key in seen:
            raise AssertionError(
                f"duplicate final answer within template {q['_template_fn']!r}: "
                f"{seen[key]['params']} and {q['params']} both give {answer_fp}"
            )
        seen[key] = q
    for q in out:
        del q["_template_fn"]
    return out


def _answer_fingerprint(q: dict) -> tuple:
    """A tuple of every part's `answer` string, used to detect two variants
    of the same template landing on an identical final answer."""
    parts = json.loads(q["parts_json"])
    return tuple(p["answer"] for p in parts)


if __name__ == "__main__":
    qs = build_all_aa1_2_templates()
    print(f"{len(qs)} AA1.2 template questions built.")
    from collections import Counter
    print(Counter(q["blueprint_cell"] for q in qs))
