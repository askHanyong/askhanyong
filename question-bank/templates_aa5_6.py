"""Template question generators for AA5.6 Section A (Derivatives of
elementary functions; chain/product/quotient rules). Confirmed from the
imported skeleton data: the topic appears in both SL- and HL-level
skeleton rows (23 SL + 43 HL sample parts) -- core content to both
levels, unlike AA1.15 (AHL-exclusive). All AA5.6 rows are tagged
level_scope='SL+HL'.

Rewritten after a correction round that found: (1) every Section A stem
named its own method ("using the chain/product/quotient rule") -- banned
by Rule 6, which requires saying what to find, never how (the mark
scheme may still name the method); (2) three "trivial" follow-up parts
that were independent of the question's own parameters (a always-true
identity, an always-0 evaluation) -- replaced with a genuine
tangent/evaluation follow-up each time; (3) the quotient-rule pattern's
monotonicity claim ("increasing for all x in its domain") overclaimed
across the excluded point's gap -- reworded to "on each interval of its
domain"; (4) several template-leak bugs in hand-written mark-scheme
strings (x^1, x^0, 1x, unsubstituted generic symbols, a literal "+ -").

Each pattern is kept as a template function (so a future batch can draw
further variants), but this batch calls each exactly once -- per the
"one per pattern" instruction, the earlier batch's separate SL and HL
copies of the same pattern were redundant twins for genuinely core
SL+HL content, not two different skills.

Same convention as templates_aa1_2.py / templates_aa1_15.py: parameters
chosen first, check_code independently re-derives the claimed result via
a *fresh* SymPy computation (diff/simplify/solve from the raw expression,
never a hardcoded PASS) -- template mode, so I author both the question
and the check, but the check is a genuine symbolic re-verification, not
an echo of my own arithmetic.
"""
import json
from sympy import symbols, diff, simplify, sin, cos, exp, latex, Rational, solve

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
    coefficient of +-1 and omits the exponent entirely when n==1
    (n==0 isn't expected to be passed here, but is handled the same way:
    no bare "x^1"/"x^0"/"1x" ever reaches rendered output)."""
    if n == 0:
        return str(coeff)
    base = var if n == 1 else f"{var}^{{{n}}}"
    if coeff == 1:
        return base
    if coeff == -1:
        return f"-{base}"
    return f"{coeff}{base}"


# ---------------------------------------------------------------------------
# A1: power rule, quadratic -- f'(x) and the stationary point's x-coordinate
# (replaces the earlier "find f'(1)" follow-up, which was independent of
# the shape of the curve; a stationary point is not).
# ---------------------------------------------------------------------------
def aa5_6_power_rule_stationary(a: int, b: int) -> dict:
    assert a != 0 and b != 0
    expr = a * x**2 + b * x
    deriv = diff(expr, x)
    stat_x = solve(deriv, x)[0]

    term1 = _power_term(a, "x", 2)
    stem = f"Let $f(x) = {term1}{' + ' if b > 0 else ' - '}{_power_term(abs(b), 'x', 1)}$."
    check_code = f"""
from sympy import symbols, diff, solve

x = symbols('x')
a, b = {a}, {b}
expr = a*x**2 + b*x
deriv = diff(expr, x)
roots = solve(deriv, x)
assert len(roots) == 1 and roots[0] == {stat_x}, f"stationary point(s) {{roots}}, expected [{stat_x}]"
print("PASS")
"""
    return {
        "level": "SL", "paper_type": "P1", "calculator": "none", "section": "A",
        "total_marks": 4, "topic_code": "AA5.6", "mode": "template", "difficulty": "easy",
        "level_scope": "SL+HL",
        "stem_latex": stem,
        "parts_json": json.dumps([
            {"label": "a", "marks": 2, "text": "Find $f'(x)$.",
             "answer": f"$f'(x) = {_fmt_latex(deriv)}$",
             "markscheme_lines": _marks_breakdown([
                 ("M1", "attempt to differentiate using the power rule on both terms"),
                 ("A1", f"$f'(x) = {_fmt_latex(deriv)}$"),
             ])},
            {"label": "b", "marks": 2,
             "text": "Find the $x$-coordinate of the point on the curve $y=f(x)$ where the gradient is zero.",
             "answer": f"$x = {latex(stat_x)}$",
             "markscheme_lines": _marks_breakdown([
                 ("M1", "setting $f'(x) = 0$ and solving for $x$"),
                 ("A1", f"$x = {latex(stat_x)}$"),
             ])},
        ]),
        "check_code": check_code.strip(),
        "params": {"a": a, "b": b},
    }


# ---------------------------------------------------------------------------
# A2: chain rule on a linear-inside-power -- f'(x) and f'(0)
# ---------------------------------------------------------------------------
def aa5_6_chain_power(a: int, b: int, n: int) -> dict:
    assert a != 0 and b != 0 and n >= 2
    expr = (a * x + b) ** n
    deriv = diff(expr, x)
    deriv_at_0 = int(deriv.subs(x, 0))
    inner = _lin_term(a, b)
    inner_pow_n_minus_1 = f"({inner})" + ("" if n - 1 == 1 else f"^{{{n-1}}}")

    stem = f"Let $f(x) = ({inner})^{{{n}}}$."
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
        "level": "SL", "paper_type": "P1", "calculator": "none", "section": "A",
        "total_marks": 4, "topic_code": "AA5.6", "mode": "template", "difficulty": "easy",
        "level_scope": "SL+HL",
        "stem_latex": stem,
        "parts_json": json.dumps([
            {"label": "a", "marks": 3, "text": "Find $f'(x)$.",
             "answer": f"$f'(x) = {_fmt_latex(deriv)}$",
             "markscheme_lines": _marks_breakdown([
                 ("M1", f"recognizing the chain rule with outer function $u^{{{n}}}$, $u = {inner}$"),
                 ("A1", f"$f'(x) = {n}{inner_pow_n_minus_1} \\cdot {a}$"),
                 ("A1", f"$f'(x) = {_fmt_latex(deriv)}$"),
             ])},
            {"label": "b", "marks": 1, "text": "Hence find $f'(0)$.",
             "answer": f"${deriv_at_0}$",
             "markscheme_lines": _marks_breakdown([("A1", f"$f'(0) = {deriv_at_0}$")])},
        ]),
        "check_code": check_code.strip(),
        "params": {"a": a, "b": b, "n": n},
    }


# ---------------------------------------------------------------------------
# A3: chain rule, exponential -- f'(x), and the tangent at x=0 (replaces
# the earlier "show that f'(x) = a f(x)" part, which is always true for
# ANY a and b -- independent of the question's own parameters, so it was
# a trivial identity rather than something the parameters determine).
# ---------------------------------------------------------------------------
def aa5_6_chain_exp(a: int) -> dict:
    assert a != 0
    f_expr = exp(a * x)
    deriv = diff(f_expr, x)
    f_at_0 = 1
    fprime_at_0 = a
    tangent_latex = latex(fprime_at_0 * x + f_at_0)

    stem = f"Let $f(x) = e^{{{_lin_term(a, 0)}}}$."
    check_code = f"""
from sympy import symbols, diff, exp

x = symbols('x')
a = {a}
f = exp(a*x)
deriv = diff(f, x)
f0 = f.subs(x, 0)
fp0 = deriv.subs(x, 0)
assert f0 == 1, f"f(0)={{f0}}, expected 1"
assert fp0 == a, f"f'(0)={{fp0}}, expected {{a}}"
print("PASS")
"""
    return {
        "level": "SL", "paper_type": "P1", "calculator": "none", "section": "A",
        "total_marks": 4, "topic_code": "AA5.6", "mode": "template", "difficulty": "easy",
        "level_scope": "SL+HL",
        "stem_latex": stem,
        "parts_json": json.dumps([
            {"label": "a", "marks": 2, "text": "Find $f'(x)$.",
             "answer": f"$f'(x) = {_fmt_latex(deriv)}$",
             "markscheme_lines": _marks_breakdown([
                 ("M1", "recognizing the chain rule on the exponent"),
                 ("A1", f"$f'(x) = {_fmt_latex(deriv)}$"),
             ])},
            {"label": "b", "marks": 2,
             "text": "Find the equation of the tangent to the curve $y=f(x)$ at the point where $x=0$.",
             "answer": f"$y = {tangent_latex}$",
             "markscheme_lines": _marks_breakdown([
                 ("M1", "finding $f(0) = 1$ and $f'(0)$"),
                 ("A1", f"$y = {tangent_latex}$"),
             ])},
        ]),
        "check_code": check_code.strip(),
        "params": {"a": a},
    }


# ---------------------------------------------------------------------------
# A4: chain rule, trig -- f'(x), and "show that f''(x) + a^2 f(x) = 0"
# ---------------------------------------------------------------------------
def aa5_6_chain_trig(a: int, b: int, use_sin: bool) -> dict:
    assert a != 0
    trig_fn = sin if use_sin else cos
    trig_name = "sin" if use_sin else "cos"
    f_expr = trig_fn(a * x + b)
    deriv = diff(f_expr, x)
    deriv2 = diff(f_expr, x, 2)

    inner = _lin_term(a, b)
    stem = f"Let $f(x) = \\{trig_name}({inner})$."
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
        "level": "SL", "paper_type": "P1", "calculator": "none", "section": "A",
        "total_marks": 5, "topic_code": "AA5.6", "mode": "template", "difficulty": "medium",
        "level_scope": "SL+HL",
        "stem_latex": stem,
        "parts_json": json.dumps([
            {"label": "a", "marks": 2, "text": "Find $f'(x)$.",
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
        "params": {"a": a, "b": b, "use_sin": use_sin},
    }


# ---------------------------------------------------------------------------
# A5: product rule -- f(x) = x^2 sin(ax); f'(x) and f'(pi/(2a)) (replaces
# the earlier "hence state f'(0)" follow-up, which is 0 for every n>=1 and
# every a -- independent of the question's own parameters).
# ---------------------------------------------------------------------------
def aa5_6_product_rule_poly_trig(a: int) -> dict:
    assert a > 0  # keep pi/(2a) a clean positive evaluation point
    f_expr = x**2 * sin(a * x)
    deriv = diff(f_expr, x)
    from sympy import pi
    eval_point = pi / (2 * a)
    deriv_at_point = simplify(deriv.subs(x, eval_point))

    stem = f"Let $f(x) = x^{{2}}\\sin({_lin_term(a, 0)})$."
    check_code = f"""
from sympy import symbols, diff, sin, pi, simplify, sympify

x = symbols('x')
a = {a}
f = x**2 * sin(a*x)
deriv = diff(f, x)
eval_point = pi/(2*a)
val = simplify(deriv.subs(x, eval_point))
expected = sympify("{deriv_at_point}")
assert simplify(val - expected) == 0, f"f'(pi/(2a))={{val}}, expected {{expected}}"
print("PASS")
"""
    return {
        "level": "SL", "paper_type": "P1", "calculator": "none", "section": "A",
        "total_marks": 5, "topic_code": "AA5.6", "mode": "template", "difficulty": "medium",
        "level_scope": "SL+HL",
        "stem_latex": stem,
        "parts_json": json.dumps([
            {"label": "a", "marks": 3, "text": "Find $f'(x)$.",
             "answer": f"$f'(x) = {_fmt_latex(deriv)}$",
             "markscheme_lines": _marks_breakdown([
                 ("M1", f"recognizing the product rule with $u=x^{{2}}$, $v=\\sin({_lin_term(a,0)})$"),
                 ("A1", f"$u' = 2x$, $v' = {a}\\cos({_lin_term(a,0)})$"),
                 ("A1", f"$f'(x) = {_fmt_latex(deriv)}$"),
             ])},
            {"label": "b", "marks": 2, "text": f"Find $f'\\left(\\dfrac{{\\pi}}{{{2*a}}}\\right)$.",
             "answer": f"${latex(deriv_at_point)}$",
             "markscheme_lines": _marks_breakdown([
                 ("M1", f"substituting $x=\\dfrac{{\\pi}}{{{2*a}}}$ into $f'(x)$"),
                 ("A1", f"${latex(deriv_at_point)}$"),
             ])},
        ]),
        "check_code": check_code.strip(),
        "params": {"a": a},
    }


# ---------------------------------------------------------------------------
# A6: quotient rule -- f(x) = (ax+b)/(cx+d); f'(x) and monotonicity
# (monotonicity wording fixed to not overclaim across the excluded
# point's gap: "on each interval of its domain", not "for all x in its
# domain").
# ---------------------------------------------------------------------------
def aa5_6_quotient_rule_linear(a: int, b: int, c: int, d: int) -> dict:
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
        "level": "SL", "paper_type": "P1", "calculator": "none", "section": "A",
        "total_marks": 5, "topic_code": "AA5.6", "mode": "template", "difficulty": "medium",
        "level_scope": "SL+HL",
        "stem_latex": stem,
        "parts_json": json.dumps([
            {"label": "a", "marks": 3, "text": "Find $f'(x)$.",
             "answer": f"$f'(x) = {_fmt_latex(deriv_simplified)}$",
             "markscheme_lines": _marks_breakdown([
                 ("M1", f"recognizing the quotient rule with $u={num_term}$, $v={den_term}$"),
                 ("A1", "correct substitution into $\\dfrac{u'v - uv'}{v^2}$"),
                 ("A1", f"$f'(x) = {_fmt_latex(deriv_simplified)}$"),
             ])},
            {"label": "b", "marks": 2,
             "text": "Hence state, with a reason, whether $f$ is increasing or decreasing on each interval of its domain.",
             "answer": f"{direction.capitalize()} on each interval of its domain, since the numerator of $f'(x)$ "
                       f"is the constant ${num_sign}$ and the denominator $({den_term})^{{2}} > 0$ wherever it is defined",
             "markscheme_lines": _marks_breakdown([
                 ("R1", "noting the numerator of $f'(x)$ is a nonzero constant, and the denominator is always positive where defined"),
                 ("A1", f"$f$ is {direction} on each interval of its domain"),
             ])},
        ]),
        "check_code": check_code.strip(),
        "params": {"a": a, "b": b, "c": c, "d": d},
    }


def build_all_aa5_6_section_a() -> list[dict]:
    """One variant per pattern -- the earlier batch's separate SL/HL
    copies of the same pattern were redundant twins for content that is
    core to both levels (level_scope='SL+HL' on every row here), not two
    different skills; this batch keeps exactly one representative per
    pattern."""
    specs = [
        (aa5_6_power_rule_stationary, dict(a=3, b=-12), "AA5.6|SL+HL|none|template|low"),
        (aa5_6_chain_power, dict(a=2, b=1, n=3), "AA5.6|SL+HL|none|template|low"),
        (aa5_6_chain_exp, dict(a=3), "AA5.6|SL+HL|none|template|low"),
        (aa5_6_chain_trig, dict(a=3, b=-2, use_sin=True), "AA5.6|SL+HL|none|template|mid"),
        (aa5_6_product_rule_poly_trig, dict(a=2), "AA5.6|SL+HL|none|template|mid"),
        (aa5_6_quotient_rule_linear, dict(a=1, b=2, c=1, d=3), "AA5.6|SL+HL|none|template|mid"),
    ]
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
    qs = build_all_aa5_6_section_a()
    print(f"{len(qs)} AA5.6 Section A template questions built.")
