"""Template question generators for AA5.6 (Derivatives of elementary
functions; chain/product/quotient rules). Confirmed from the imported
skeleton data: topic_level_scope='SL', and the topic appears in both SL
and HL skeleton rows (23 SL + 43 HL sample parts) -- core content to both
levels, unlike AA1.15 (AHL-exclusive). Command terms seen: 'Find', 'Show
that', 'Verify', 'Hence'; the great majority of skeleton rows for this
topic have calculator_allowed=0 (Paper 1), confirming this is
fundamentally a non-calculator skill.

Six Section A patterns (one derivative rule each, 4-6 marks, capped at
SECTION_A_MARK_CEILING) and three Section B multi-part structures (8-9
marks, combining two rules + a follow-up). Every "evaluate" or "show
that" follow-up was deliberately chosen to collapse to a clean exact
value or an always-true identity -- no GDC, no messy trig angles -- so
every question genuinely is Paper 1 / no-calculator, consistent with the
skeleton evidence above.

Same convention as templates_aa1_2.py / templates_aa1_15.py: parameters
chosen first, check_code independently re-derives the claimed result via
a *fresh* SymPy computation (diff/simplify from the raw expression, never
a hardcoded PASS) -- template mode, so I author both the question and
the check, but the check is a genuine symbolic re-verification, not an
echo of my own arithmetic.
"""
import json
from sympy import symbols, diff, simplify, sin, cos, exp, latex, factor, Rational

x = symbols("x")


def _marks_breakdown(lines):
    return [{"note": n, "desc": d} for n, d in lines]


def _fmt_latex(expr):
    return latex(simplify(expr))


def _lin_term(a: int, b: int, var: str = "x") -> str:
    """Formats 'a*var + b' as e.g. '3x + 2', 'x - 2', '-x + 4' -- omits a
    coefficient of +-1 and gives the constant proper sign spacing."""
    if a == 1:
        term = var
    elif a == -1:
        term = f"-{var}"
    else:
        term = f"{a}{var}"
    if b > 0:
        return f"{term} + {b}"
    elif b < 0:
        return f"{term} - {abs(b)}"
    return term


def _power_term(coeff: int, var: str, n: int) -> str:
    """Formats 'coeff*var^n' as e.g. '3x^2', 'x^3', '-x^4' -- omits a
    coefficient of +-1 and omits the exponent entirely when n==1."""
    base = var if n == 1 else f"{var}^{{{n}}}"
    if coeff == 1:
        return base
    if coeff == -1:
        return f"-{base}"
    return f"{coeff}{base}"


# ---------------------------------------------------------------------------
# A1: power rule, two-term polynomial -- f'(x) and f'(1)
# ---------------------------------------------------------------------------
def aa5_6_power_rule_gradient(level: str, a: int, n: int, b: int, m: int) -> dict:
    assert n >= 2 and m >= 1 and n != m and a != 0 and b != 0
    expr = a * x**n + b * x**m
    deriv = diff(expr, x)
    deriv_at_1 = int(deriv.subs(x, 1))

    term1 = _power_term(a, "x", n)
    joiner = " + " if b > 0 else " - "
    term2_abs = _power_term(abs(b), "x", m)
    stem = f"Let $f(x) = {term1}{joiner}{term2_abs}$."
    check_code = f"""
from sympy import symbols, diff

x = symbols('x')
a, n, b, m = {a}, {n}, {b}, {m}
expr = a*x**n + b*x**m
deriv = diff(expr, x)
val = deriv.subs(x, 1)
assert val == {deriv_at_1}, f"f'(1)={{val}}, expected {deriv_at_1}"
print("PASS")
"""
    return {
        "level": level, "paper_type": "P1", "calculator": "none", "section": "A",
        "total_marks": 4, "topic_code": "AA5.6", "mode": "template", "difficulty": "easy",
        "stem_latex": stem,
        "parts_json": json.dumps([
            {"label": "a", "marks": 2, "text": "Find $f'(x)$.",
             "answer": f"$f'(x) = {_fmt_latex(deriv)}$",
             "markscheme_lines": _marks_breakdown([
                 ("M1", "attempt to differentiate using the power rule on both terms"),
                 ("A1", f"$f'(x) = {_fmt_latex(deriv)}$"),
             ])},
            {"label": "b", "marks": 2, "text": "Hence find $f'(1)$.",
             "answer": f"${deriv_at_1}$",
             "markscheme_lines": _marks_breakdown([
                 ("M1", "substituting $x=1$ into $f'(x)$"),
                 ("A1", f"$f'(1) = {deriv_at_1}$"),
             ])},
        ]),
        "check_code": check_code.strip(),
        "params": {"level": level, "a": a, "n": n, "b": b, "m": m},
    }


# ---------------------------------------------------------------------------
# A2: chain rule on a linear-inside-power -- f'(x) and f'(0)
# ---------------------------------------------------------------------------
def aa5_6_chain_power(level: str, a: int, b: int, n: int) -> dict:
    assert a != 0 and b != 0 and n >= 2
    expr = (a * x + b) ** n
    deriv = diff(expr, x)
    deriv_at_0 = int(deriv.subs(x, 0))

    stem = f"Let $f(x) = ({a}x + {b})^{{{n}}}$." if b > 0 else f"Let $f(x) = ({a}x - {abs(b)})^{{{n}}}$."
    check_code = f"""
from sympy import symbols, diff

x = symbols('x')
a, b, n = {a}, {b}, {n}
expr = (a*x + b)**n
deriv = diff(expr, x)
val = deriv.subs(x, 0)
assert val == {deriv_at_0}, f"f'(0)={{val}}, expected {deriv_at_0}"
print("PASS")
"""
    return {
        "level": level, "paper_type": "P1", "calculator": "none", "section": "A",
        "total_marks": 4, "topic_code": "AA5.6", "mode": "template", "difficulty": "easy",
        "stem_latex": stem,
        "parts_json": json.dumps([
            {"label": "a", "marks": 3, "text": "Find $f'(x)$, using the chain rule.",
             "answer": f"$f'(x) = {_fmt_latex(deriv)}$",
             "markscheme_lines": _marks_breakdown([
                 ("M1", f"recognizing the chain rule with outer function $u^{{{n}}}$, $u = {a}x{'+' if b>0 else '-'}{abs(b)}$"),
                 ("A1", f"$f'(x) = {n}({a}x{'+' if b>0 else '-'}{abs(b)})^{{{n-1}}} \\cdot {a}$"),
                 ("A1", f"$f'(x) = {_fmt_latex(deriv)}$"),
             ])},
            {"label": "b", "marks": 1, "text": "Hence find $f'(0)$.",
             "answer": f"${deriv_at_0}$",
             "markscheme_lines": _marks_breakdown([("A1", f"$f'(0) = {deriv_at_0}$")])},
        ]),
        "check_code": check_code.strip(),
        "params": {"level": level, "a": a, "b": b, "n": n},
    }


# ---------------------------------------------------------------------------
# A3: chain rule, exponential -- f'(x), and "show that f'(x) = a f(x)"
# ---------------------------------------------------------------------------
def aa5_6_chain_exp(level: str, a: int, b: int) -> dict:
    assert a != 0
    f_expr = exp(a * x + b)
    deriv = diff(f_expr, x)

    b_str = f" + {b}" if b > 0 else (f" - {abs(b)}" if b < 0 else "")
    stem = f"Let $f(x) = e^{{{a}x{b_str}}}$."
    check_code = f"""
from sympy import symbols, diff, exp, simplify

x = symbols('x')
a, b = {a}, {b}
f = exp(a*x + b)
deriv = diff(f, x)
diff_check = simplify(deriv - a*f)
assert diff_check == 0, f"f'(x) - a*f(x) = {{diff_check}}, expected 0"
print("PASS")
"""
    return {
        "level": level, "paper_type": "P1", "calculator": "none", "section": "A",
        "total_marks": 4, "topic_code": "AA5.6", "mode": "template", "difficulty": "easy",
        "stem_latex": stem,
        "parts_json": json.dumps([
            {"label": "a", "marks": 2, "text": "Find $f'(x)$, using the chain rule.",
             "answer": f"$f'(x) = {_fmt_latex(deriv)}$",
             "markscheme_lines": _marks_breakdown([
                 ("M1", "recognizing the chain rule on the exponent"),
                 ("A1", f"$f'(x) = {_fmt_latex(deriv)}$"),
             ])},
            {"label": "b", "marks": 2, "text": f"Show that $f'(x) = {a}f(x)$.",
             "answer": "shown",
             "markscheme_lines": _marks_breakdown([
                 ("M1", f"writing $f'(x) = {a}e^{{{a}x{b_str}}}$"),
                 ("AG", f"identifying this as ${a}f(x)$"),
             ])},
        ]),
        "check_code": check_code.strip(),
        "params": {"level": level, "a": a, "b": b},
    }


# ---------------------------------------------------------------------------
# A4: chain rule, trig -- f'(x), and "show that f''(x) = -a^2 f(x)"
# ---------------------------------------------------------------------------
def aa5_6_chain_trig(level: str, a: int, b: int, use_sin: bool) -> dict:
    assert a != 0
    trig_fn = sin if use_sin else cos
    trig_name = "sin" if use_sin else "cos"
    f_expr = trig_fn(a * x + b)
    deriv = diff(f_expr, x)
    deriv2 = diff(f_expr, x, 2)

    b_str = f" + {b}" if b > 0 else (f" - {abs(b)}" if b < 0 else "")
    stem = f"Let $f(x) = \\{trig_name}({a}x{b_str})$."
    check_code = f"""
from sympy import symbols, diff, sin, cos, simplify

x = symbols('x')
a, b = {a}, {b}
f = {"sin" if use_sin else "cos"}(a*x + b)
deriv2 = diff(f, x, 2)
diff_check = simplify(deriv2 + a**2 * f)
assert diff_check == 0, f"f''(x) + a^2*f(x) = {{diff_check}}, expected 0"
print("PASS")
"""
    return {
        "level": level, "paper_type": "P1", "calculator": "none", "section": "A",
        "total_marks": 5, "topic_code": "AA5.6", "mode": "template", "difficulty": "medium",
        "stem_latex": stem,
        "parts_json": json.dumps([
            {"label": "a", "marks": 2, "text": "Find $f'(x)$, using the chain rule.",
             "answer": f"$f'(x) = {_fmt_latex(deriv)}$",
             "markscheme_lines": _marks_breakdown([
                 ("M1", "recognizing the chain rule"),
                 ("A1", f"$f'(x) = {_fmt_latex(deriv)}$"),
             ])},
            {"label": "b", "marks": 3, "text": f"Show that $f''(x) + {a**2}f(x) = 0$.",
             "answer": "shown",
             "markscheme_lines": _marks_breakdown([
                 ("M1", "differentiating $f'(x)$ again using the chain rule"),
                 ("A1", f"$f''(x) = {_fmt_latex(deriv2)}$"),
                 ("AG", f"so $f''(x) + {a**2}f(x) = 0$"),
             ])},
        ]),
        "check_code": check_code.strip(),
        "params": {"level": level, "a": a, "b": b, "use_sin": use_sin},
    }


# ---------------------------------------------------------------------------
# A5: product rule -- f(x) = x^n sin(ax); f'(x) and f'(0) (always 0)
# ---------------------------------------------------------------------------
def aa5_6_product_rule_poly_trig(level: str, n: int, a: int) -> dict:
    assert n >= 1 and a != 0
    f_expr = x**n * sin(a * x)
    deriv = diff(f_expr, x)
    deriv_at_0 = int(deriv.subs(x, 0))
    assert deriv_at_0 == 0  # always true for n>=1 -- asserted at authoring time too

    x_term = _power_term(1, "x", n)
    a_x_term = _lin_term(a, 0)
    stem = f"Let $f(x) = {x_term}\\sin({a_x_term})$."
    check_code = f"""
from sympy import symbols, diff, sin

x = symbols('x')
n, a = {n}, {a}
f = x**n * sin(a*x)
deriv = diff(f, x)
val = deriv.subs(x, 0)
assert val == 0, f"f'(0)={{val}}, expected 0"
print("PASS")
"""
    return {
        "level": level, "paper_type": "P1", "calculator": "none", "section": "A",
        "total_marks": 4, "topic_code": "AA5.6", "mode": "template", "difficulty": "medium",
        "stem_latex": stem,
        "parts_json": json.dumps([
            {"label": "a", "marks": 3, "text": "Find $f'(x)$, using the product rule.",
             "answer": f"$f'(x) = {_fmt_latex(deriv)}$",
             "markscheme_lines": _marks_breakdown([
                 ("M1", f"recognizing the product rule with $u=x^{{{n}}}$, $v=\\sin({a}x)$"),
                 ("A1", f"$u' = {n}x^{{{n-1}}}$, $v' = {a}\\cos({a}x)$"),
                 ("A1", f"$f'(x) = {_fmt_latex(deriv)}$"),
             ])},
            {"label": "b", "marks": 1, "text": "Hence state $f'(0)$.",
             "answer": "$0$",
             "markscheme_lines": _marks_breakdown([("A1", "$f'(0) = 0$")])},
        ]),
        "check_code": check_code.strip(),
        "params": {"level": level, "n": n, "a": a},
    }


# ---------------------------------------------------------------------------
# A6: quotient rule -- f(x) = (ax+b)/(cx+d); f'(x) and monotonicity
# ---------------------------------------------------------------------------
def aa5_6_quotient_rule_linear(level: str, a: int, b: int, c: int, d: int) -> dict:
    assert c != 0 and a * d - b * c != 0
    num_sign = a * d - b * c
    expr = (a * x + b) / (c * x + d)
    deriv = diff(expr, x)
    deriv_simplified = simplify(deriv)

    num_term = _lin_term(a, b)
    den_term = _lin_term(c, d)
    excluded_x = -Rational(d, c)
    excluded_x_latex = latex(excluded_x)
    stem = f"Let $f(x) = \\dfrac{{{num_term}}}{{{den_term}}}$, for $x \\neq {excluded_x_latex}$."
    direction = "increasing" if num_sign > 0 else "decreasing"
    check_code = f"""
from sympy import symbols, diff, simplify

x = symbols('x')
a, b, c, d = {a}, {b}, {c}, {d}
expr = (a*x + b) / (c*x + d)
deriv = diff(expr, x)
num = simplify(deriv * (c*x + d)**2)
assert num == {num_sign}, f"numerator of f'(x)*(denominator)^2 = {{num}}, expected {num_sign}"
print("PASS")
"""
    return {
        "level": level, "paper_type": "P1", "calculator": "none", "section": "A",
        "total_marks": 5, "topic_code": "AA5.6", "mode": "template", "difficulty": "medium",
        "stem_latex": stem,
        "parts_json": json.dumps([
            {"label": "a", "marks": 3, "text": "Find $f'(x)$, using the quotient rule.",
             "answer": f"$f'(x) = {_fmt_latex(deriv_simplified)}$",
             "markscheme_lines": _marks_breakdown([
                 ("M1", f"recognizing the quotient rule with $u={num_term}$, $v={den_term}$"),
                 ("A1", "correct substitution into $\\dfrac{u'v - uv'}{v^2}$"),
                 ("A1", f"$f'(x) = {_fmt_latex(deriv_simplified)}$"),
             ])},
            {"label": "b", "marks": 2,
             "text": f"Hence state, with a reason, whether $f$ is increasing or decreasing for all $x$ in its domain.",
             "answer": f"{direction.capitalize()}, since the numerator of $f'(x)$ is the constant ${num_sign}$ "
                       f"and the denominator $({den_term})^{{2}} > 0$ for all $x$ in the domain",
             "markscheme_lines": _marks_breakdown([
                 ("R1", "noting the numerator of $f'(x)$ is a nonzero constant, and the denominator is always positive"),
                 ("A1", f"$f$ is {direction} for all $x$ in its domain"),
             ])},
        ]),
        "check_code": check_code.strip(),
        "params": {"level": level, "a": a, "b": b, "c": c, "d": d},
    }


# ---------------------------------------------------------------------------
# B1: product + chain rule -- f(x) = x^2 e^{ax}; stationary points + nature
# ---------------------------------------------------------------------------
def aa5_6_sectionB_product_stationary(level: str, a: int) -> dict:
    assert a != 0
    f_expr = x**2 * exp(a * x)
    deriv = diff(f_expr, x)
    deriv2 = diff(f_expr, x, 2)
    other_root = Rational(-2, a)
    f2_at_0 = int(deriv2.subs(x, 0))
    assert f2_at_0 == 2  # always true -- local min at x=0 regardless of a

    other_root_latex = latex(other_root)
    stem = f"Let $f(x) = x^{{2}}e^{{{_lin_term(a, 0)}}}$."
    check_code = f"""
from sympy import symbols, diff, exp, simplify, Rational

x = symbols('x')
a = {a}
f = x**2 * exp(a*x)
deriv = diff(f, x)
deriv2 = diff(f, x, 2)

assert simplify(deriv.subs(x, 0)) == 0, "f'(0) should be 0"
other_root = Rational(-2, a)
assert simplify(deriv.subs(x, other_root)) == 0, f"f'(-2/a) should be 0, got {{deriv.subs(x, other_root)}}"
val2 = deriv2.subs(x, 0)
assert val2 == 2, f"f''(0)={{val2}}, expected 2"
print("PASS")
"""
    return {
        "level": level, "paper_type": "P1", "calculator": "none", "section": "B",
        "total_marks": 8, "topic_code": "AA5.6", "mode": "template", "difficulty": "hard",
        "stem_latex": stem,
        "parts_json": json.dumps([
            {"label": "a", "marks": 3, "text": "Find $f'(x)$, using the product rule.",
             "answer": f"$f'(x) = {_fmt_latex(deriv)}$",
             "markscheme_lines": _marks_breakdown([
                 ("M1", f"recognizing the product rule with $u=x^{{2}}$, $v=e^{{{_lin_term(a,0)}}}$"),
                 ("A1", "$u' = 2x$, $v' = ae^{ax}$"),
                 ("A1", f"$f'(x) = {_fmt_latex(deriv)}$"),
             ])},
            {"label": "b", "marks": 3,
             "text": f"Show that $f'(x) = 0$ when $x=0$ and when $x = {other_root_latex}$.",
             "answer": "shown",
             "markscheme_lines": _marks_breakdown([
                 ("M1", f"factorizing $f'(x) = xe^{{{_lin_term(a,0)}}}(2 + {_lin_term(a,0)})$"),
                 ("R1", "noting $e^{ax}$ is never zero"),
                 ("AG", f"so $f'(x)=0 \\iff x=0$ or $x={other_root_latex}$"),
             ])},
            {"label": "c", "marks": 2,
             "text": "Find $f''(0)$, and hence determine the nature of the stationary point at $x=0$.",
             "answer": "$f''(0) = 2 > 0$, so $x=0$ is a local minimum",
             "markscheme_lines": _marks_breakdown([
                 ("A1", "$f''(0) = 2$"),
                 ("R1", "since $f''(0) > 0$, $x=0$ is a local minimum"),
             ])},
        ]),
        "check_code": check_code.strip(),
        "params": {"level": level, "a": a},
    }


# ---------------------------------------------------------------------------
# B2: quotient rule -- f(x) = (x+a)/(x^2+b), b>0; tangent at x=0
# ---------------------------------------------------------------------------
def aa5_6_sectionB_quotient_tangent(level: str, a: int, b: int) -> dict:
    assert b > 0
    f_expr = (x + a) / (x**2 + b)
    deriv = diff(f_expr, x)
    deriv_simplified = simplify(deriv)
    f_at_0 = Rational(a, b)
    fprime_at_0 = Rational(1, b)
    tangent_latex = latex(fprime_at_0 * x + f_at_0)

    stem = f"Let $f(x) = \\dfrac{{{_lin_term(1, a)}}}{{x^{{2}} + {b}}}$."
    check_code = f"""
from sympy import symbols, diff, simplify, Rational

x = symbols('x')
a, b = {a}, {b}
f = (x + a) / (x**2 + b)
deriv = diff(f, x)
f0 = f.subs(x, 0)
fp0 = deriv.subs(x, 0)
assert simplify(f0 - Rational(a, b)) == 0, f"f(0)={{f0}}, expected {{Rational(a,b)}}"
assert simplify(fp0 - Rational(1, b)) == 0, f"f'(0)={{fp0}}, expected {{Rational(1,b)}}"
print("PASS")
"""
    return {
        "level": level, "paper_type": "P1", "calculator": "none", "section": "B",
        "total_marks": 8, "topic_code": "AA5.6", "mode": "template", "difficulty": "hard",
        "stem_latex": stem,
        "parts_json": json.dumps([
            {"label": "a", "marks": 3, "text": "Find $f'(x)$, using the quotient rule.",
             "answer": f"$f'(x) = {_fmt_latex(deriv_simplified)}$",
             "markscheme_lines": _marks_breakdown([
                 ("M1", f"recognizing the quotient rule with $u={_lin_term(1,a)}$, $v=x^{{2}}+{b}$"),
                 ("A1", "correct substitution into $\\dfrac{u'v - uv'}{v^2}$"),
                 ("A1", f"$f'(x) = {_fmt_latex(deriv_simplified)}$"),
             ])},
            {"label": "b", "marks": 2, "text": "Find $f'(0)$.",
             "answer": f"$f'(0) = {latex(fprime_at_0)}$",
             "markscheme_lines": _marks_breakdown([
                 ("M1", "substituting $x=0$ into $f'(x)$"),
                 ("A1", f"$f'(0) = {latex(fprime_at_0)}$"),
             ])},
            {"label": "c", "marks": 3,
             "text": "Hence find the equation of the tangent to the curve $y=f(x)$ at the point where $x=0$.",
             "answer": f"$y = {tangent_latex}$",
             "markscheme_lines": _marks_breakdown([
                 ("M1", f"finding $f(0) = {latex(f_at_0)}$"),
                 ("M1", "using $y = f(0) + f'(0)(x-0)$"),
                 ("A1", f"$y = {tangent_latex}$"),
             ])},
        ]),
        "check_code": check_code.strip(),
        "params": {"level": level, "a": a, "b": b},
    }


# ---------------------------------------------------------------------------
# B3: chain rule (nested) -- f(x) = sin^2(ax), double-angle + solving f'=0
# ---------------------------------------------------------------------------
def aa5_6_sectionB_double_angle(level: str, a: int) -> dict:
    assert a > 0
    from sympy import pi, Interval, solveset, S

    f_expr = sin(a * x) ** 2
    deriv = diff(f_expr, x)
    deriv2 = diff(f_expr, x, 2)
    deriv_claim = a * sin(2 * a * x)
    deriv2_claim = 2 * a**2 * cos(2 * a * x)
    assert simplify(deriv - deriv_claim) == 0
    assert simplify(deriv2 - deriv2_claim) == 0

    domain = Interval(0, pi / a)
    sol = solveset(deriv_claim, x, domain=domain)
    expected_sol = {0, pi / (2 * a), pi / a}
    sol_values = set(sol)
    assert sol_values == expected_sol, f"solved {sol_values}, expected {expected_sol}"

    stem = f"Let $f(x) = \\sin^{{2}}({_lin_term(a, 0)})$."
    check_code = f"""
from sympy import symbols, diff, sin, cos, pi, Interval, solveset, simplify

x = symbols('x')
a = {a}
f = sin(a*x)**2
deriv = diff(f, x)
deriv2 = diff(f, x, 2)
assert simplify(deriv - a*sin(2*a*x)) == 0, "f'(x) != a*sin(2ax)"
assert simplify(deriv2 - 2*a**2*cos(2*a*x)) == 0, "f''(x) != 2a^2*cos(2ax)"

domain = Interval(0, pi/a)
sol = solveset(a*sin(2*a*x), x, domain=domain)
expected = {{0, pi/(2*a), pi/a}}
assert set(sol) == expected, f"solved {{set(sol)}}, expected {{expected}}"
print("PASS")
"""
    return {
        "level": level, "paper_type": "P1", "calculator": "none", "section": "B",
        "total_marks": 8, "topic_code": "AA5.6", "mode": "template", "difficulty": "hard",
        "stem_latex": stem,
        "parts_json": json.dumps([
            {"label": "a", "marks": 3, "text": f"Show that $f'(x) = {a}\\sin({latex(2*a)}x)$.",
             "answer": "shown",
             "markscheme_lines": _marks_breakdown([
                 ("M1", f"recognizing the chain rule: $f'(x) = 2\\sin({_lin_term(a,0)})\\cdot {a}\\cos({_lin_term(a,0)})$"),
                 ("M1", "using the double angle identity $2\\sin\\theta\\cos\\theta = \\sin 2\\theta$"),
                 ("AG", f"$f'(x) = {a}\\sin({latex(2*a)}x)$"),
             ])},
            {"label": "b", "marks": 2, "text": "Hence find $f''(x)$.",
             "answer": f"$f''(x) = {_fmt_latex(deriv2_claim)}$",
             "markscheme_lines": _marks_breakdown([
                 ("M1", "differentiating $f'(x)$ using the chain rule"),
                 ("A1", f"$f''(x) = {_fmt_latex(deriv2_claim)}$"),
             ])},
            {"label": "c", "marks": 3,
             "text": f"Find the values of $x$ in the interval $0 \\leq x \\leq \\dfrac{{\\pi}}{{{a}}}$ for which $f'(x)=0$.",
             "answer": f"$x = 0, \\dfrac{{\\pi}}{{{2*a}}}, \\dfrac{{\\pi}}{{{a}}}$",
             "markscheme_lines": _marks_breakdown([
                 ("M1", f"setting $\\sin({latex(2*a)}x)=0$"),
                 ("M1", f"solving for $x$ within the given domain"),
                 ("A1", f"$x = 0, \\dfrac{{\\pi}}{{{2*a}}}, \\dfrac{{\\pi}}{{{a}}}$"),
             ])},
        ]),
        "check_code": check_code.strip(),
        "params": {"level": level, "a": a},
    }


MAX_VARIANTS_PER_SECTION_A_PATTERN = 4
MAX_VARIANTS_PER_SECTION_B_PATTERN = 2


def build_all_aa5_6_templates() -> list[dict]:
    specs = []

    a1 = [
        dict(level="SL", a=3, n=2, b=4, m=1),
        dict(level="SL", a=2, n=3, b=-5, m=1),
        dict(level="HL", a=4, n=3, b=2, m=2),
        dict(level="HL", a=-1, n=4, b=6, m=2),
    ]
    for kw in a1:
        specs.append((aa5_6_power_rule_gradient, kw, f"AA5.6|{kw['level']}|none|template|low"))

    a2 = [
        dict(level="SL", a=2, b=1, n=3),
        dict(level="SL", a=3, b=-2, n=2),
        dict(level="HL", a=2, b=3, n=4),
        dict(level="HL", a=-3, b=5, n=3),
    ]
    for kw in a2:
        specs.append((aa5_6_chain_power, kw, f"AA5.6|{kw['level']}|none|template|low"))

    a3 = [
        dict(level="SL", a=2, b=0),
        dict(level="SL", a=3, b=1),
        dict(level="HL", a=-2, b=4),
        dict(level="HL", a=5, b=-3),
    ]
    for kw in a3:
        specs.append((aa5_6_chain_exp, kw, f"AA5.6|{kw['level']}|none|template|low"))

    a4 = [
        dict(level="SL", a=2, b=0, use_sin=True),
        dict(level="SL", a=3, b=1, use_sin=False),
        dict(level="HL", a=4, b=-2, use_sin=True),
        dict(level="HL", a=5, b=2, use_sin=False),
    ]
    for kw in a4:
        specs.append((aa5_6_chain_trig, kw, f"AA5.6|{kw['level']}|none|template|mid"))

    a5 = [
        dict(level="SL", n=1, a=2),
        dict(level="SL", n=2, a=3),
        dict(level="HL", n=3, a=2),
        dict(level="HL", n=2, a=-4),
    ]
    for kw in a5:
        specs.append((aa5_6_product_rule_poly_trig, kw, f"AA5.6|{kw['level']}|none|template|mid"))

    a6 = [
        dict(level="SL", a=1, b=2, c=1, d=3),
        dict(level="SL", a=2, b=-1, c=1, d=4),
        dict(level="HL", a=3, b=1, c=2, d=5),
        dict(level="HL", a=-1, b=4, c=3, d=2),
    ]
    for kw in a6:
        specs.append((aa5_6_quotient_rule_linear, kw, f"AA5.6|{kw['level']}|none|template|mid"))

    b1 = [
        dict(level="SL", a=2),
        dict(level="HL", a=-3),
    ]
    for kw in b1:
        specs.append((aa5_6_sectionB_product_stationary, kw, f"AA5.6|{kw['level']}|none|template|hard"))

    b2 = [
        dict(level="SL", a=1, b=4),
        dict(level="HL", a=-2, b=5),
    ]
    for kw in b2:
        specs.append((aa5_6_sectionB_quotient_tangent, kw, f"AA5.6|{kw['level']}|none|template|hard"))

    b3 = [
        dict(level="SL", a=2),
        dict(level="HL", a=3),
    ]
    for kw in b3:
        specs.append((aa5_6_sectionB_double_angle, kw, f"AA5.6|{kw['level']}|none|template|hard"))

    out = []
    for fn, kwargs, blueprint_cell in specs:
        q = fn(**kwargs)
        q["blueprint_cell"] = blueprint_cell
        q["_template_fn"] = fn.__name__
        out.append(q)

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
    parts = json.loads(q["parts_json"])
    return tuple(p["answer"] for p in parts)


if __name__ == "__main__":
    qs = build_all_aa5_6_templates()
    print(f"{len(qs)} AA5.6 Section A template questions built.")
