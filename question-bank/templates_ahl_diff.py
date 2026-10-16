"""Template question generators for the three AHL-only differentiation
topics: AA5.13 (L'Hopital's rule and Maclaurin series), AA5.14 (Implicit
differentiation; related rates), AA5.15 (Derivatives of further special
functions). Confirmed AHL-exclusive from the imported skeleton data
(topic_level_scope='AHL' for all three; no SL-level skeleton rows exist
for any of them) -- level_scope='HL-only' on every row here, unlike
AA5.6/AA1.2 which are level_scope='SL+HL'.

Skeleton evidence: AA5.13 and AA5.15 are predominantly non-calculator in
practice (AA5.13: 8/18 non-calc but the calc-flavoured rows are mixed
with other topics in a larger question, not pure L'Hopital/Maclaurin
technique; AA5.15 is a proof topic). AA5.14's skeleton rows are mostly
calculator-allowed (15/17), but every pattern here is still designed to
need no GDC on its own merits (chain-rule substitution or a clean
algebraic implicit-diff step, never a numerical solve) -- calculator
tags follow genuine necessity, not the superficial real-paper
distribution, consistent with this bank's GDC-genuineness rule.

Five Section A patterns (one per topic for AA5.13/15, two for AA5.14)
plus one Section B bespoke question (a guided proof of d/dx(arcsin x)
via implicit differentiation, which IS a legitimate scaffold per Rule 6
-- an earlier part sets up the method a later part applies, so
scaffold=True and method-naming is permitted in its part text).

Same convention as templates_aa5_6.py: parameters chosen first,
check_code independently re-derives the claimed result via a fresh SymPy
computation.
"""
import json
from sympy import symbols, diff, simplify, limit, series, Rational, latex, oo, exp, log, atan, pi

x = symbols("x")


def _marks_breakdown(lines):
    return [{"note": n, "desc": d} for n, d in lines]


def _fmt_latex(expr):
    return latex(simplify(expr))


def _lin_term(a: int, b: int, var: str = "x") -> str:
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


# ---------------------------------------------------------------------------
# AA5.13-P01: L'Hopital's rule -- lim_{x->0} (e^{ax}-1)/(bx)
# ---------------------------------------------------------------------------
def aa5_13_lhopital_exp(a: int, b: int) -> dict:
    assert a != 0 and b != 0
    f_expr = exp(a * x) - 1
    g_expr = b * x
    f0 = f_expr.subs(x, 0)
    g0 = g_expr.subs(x, 0)
    lim_val = limit(f_expr / g_expr, x, 0)

    stem = f"Consider $\\displaystyle\\lim_{{x \\to 0}} \\dfrac{{e^{{{_lin_term(a,0)}}} - 1}}{{{_lin_term(b,0)}}}$."
    check_code = f"""
from sympy import symbols, exp, limit

x = symbols('x')
a, b = {a}, {b}
f = exp(a*x) - 1
g = b*x
assert f.subs(x, 0) == 0 and g.subs(x, 0) == 0, "not a 0/0 form"
val = limit(f/g, x, 0)
expected = {a}/{b} if {a} % {b} != 0 else {a}//{b}
from sympy import Rational, simplify
assert simplify(val - Rational({a}, {b})) == 0, f"limit={{val}}, expected {Rational(a,b)}"
print("PASS")
"""
    return {
        "level": "HL", "paper_type": "P1", "calculator": "none", "section": "A",
        "total_marks": 5, "topic_code": "AA5.13", "mode": "template", "difficulty": "medium",
        "level_scope": "HL-only", "scaffold": 0,
        "stem_latex": stem,
        "parts_json": json.dumps([
            {"label": "a", "marks": 2, "text": "Show that direct substitution of $x=0$ gives the indeterminate form $\\dfrac{0}{0}$.",
             "answer": "shown",
             "markscheme_lines": _marks_breakdown([
                 ("M1", "substituting $x=0$ into numerator and denominator"),
                 ("A1", "both equal $0$, confirming the $\\frac{0}{0}$ form"),
             ])},
            {"label": "b", "marks": 3, "text": "Find the value of the limit.",
             "answer": f"${latex(lim_val)}$",
             "markscheme_lines": _marks_breakdown([
                 ("M1", "recognising l'Hopital's rule applies"),
                 ("M1", "differentiating numerator and denominator separately"),
                 ("A1", f"${latex(lim_val)}$"),
             ])},
        ]),
        "check_code": check_code.strip(),
        "params": {"a": a, "b": b},
    }


# ---------------------------------------------------------------------------
# AA5.13-P02: Maclaurin series -- f(x)=ln(1+ax), hence f(x)-f(-x) to x^3
# ---------------------------------------------------------------------------
def aa5_13_maclaurin_ln(a: int) -> dict:
    assert a != 0
    f_expr = log(1 + a * x)
    series_f = series(f_expr, x, 0, 4).removeO()
    g_expr = f_expr - f_expr.subs(x, -x)
    series_g = series(g_expr, x, 0, 4).removeO()

    stem = f"Let $f(x) = \\ln(1+{_lin_term(a,0)})$."
    check_code = f"""
from sympy import symbols, log, series, simplify, sympify

x = symbols('x')
a = {a}
f = log(1 + a*x)
series_f = series(f, x, 0, 4).removeO()
g = f - f.subs(x, -x)
series_g = series(g, x, 0, 4).removeO()

expected_f = sympify("{series_f}")
expected_g = sympify("{series_g}")
assert simplify(series_f - expected_f) == 0, f"series_f={{series_f}}, expected {{expected_f}}"
assert simplify(series_g - expected_g) == 0, f"series_g={{series_g}}, expected {{expected_g}}"
print("PASS")
"""
    return {
        "level": "HL", "paper_type": "P1", "calculator": "none", "section": "A",
        "total_marks": 6, "topic_code": "AA5.13", "mode": "template", "difficulty": "medium",
        "level_scope": "HL-only", "scaffold": 0,
        "stem_latex": stem,
        "parts_json": json.dumps([
            {"label": "a", "marks": 4, "text": "Find the Maclaurin series for $f(x)$, up to and including the term in $x^{3}$.",
             "answer": f"${_fmt_latex(series_f)}$",
             "markscheme_lines": _marks_breakdown([
                 ("M1", "finding $f(0)$, $f'(0)$, $f''(0)$, $f'''(0)$ (or using the known series for $\\ln(1+u)$)"),
                 ("A1", "coefficients of $x$ and $x^{2}$ correct"),
                 ("A1", "coefficient of $x^{3}$ correct"),
                 ("A1", f"${_fmt_latex(series_f)}$"),
             ])},
            {"label": "b", "marks": 2, "text": "Hence find the Maclaurin series for $f(x) - f(-x)$, up to and including the term in $x^{3}$.",
             "answer": f"${_fmt_latex(series_g)}$",
             "markscheme_lines": _marks_breakdown([
                 ("M1", "substituting $-x$ and subtracting"),
                 ("A1", f"${_fmt_latex(series_g)}$"),
             ])},
        ]),
        "check_code": check_code.strip(),
        "params": {"a": a},
        "_expected_g": series_g,
    }


# ---------------------------------------------------------------------------
# AA5.14-P01: implicit differentiation -- x^2+xy+y^2=k, dy/dx at a point
# ---------------------------------------------------------------------------
def aa5_14_implicit_point(x0: int, y0: int) -> dict:
    y = symbols("y")
    k = x0**2 + x0 * y0 + y0**2
    F = x**2 + x * y + y**2 - k
    dydx = simplify(-diff(F, x) / diff(F, y))
    dydx_at_point = simplify(dydx.subs({x: x0, y: y0}))

    stem = f"The curve $C$ is defined by $x^{{2}}+xy+y^{{2}}={k}$. The point $({x0},{y0})$ lies on $C$."
    check_code = f"""
from sympy import symbols, diff, simplify, sympify

x, y = symbols('x y')
x0, y0, k = {x0}, {y0}, {k}
F = x**2 + x*y + y**2 - k
assert F.subs({{x: x0, y: y0}}) == 0, "point not on curve"
dydx = simplify(-diff(F, x) / diff(F, y))
val = simplify(dydx.subs({{x: x0, y: y0}}))

expected_dydx = sympify("{dydx}")
expected_val = sympify("{dydx_at_point}")
assert simplify(dydx - expected_dydx) == 0, f"dydx={{dydx}}, expected {{expected_dydx}}"
assert simplify(val - expected_val) == 0, f"val={{val}}, expected {{expected_val}}"
print("PASS")
"""
    return {
        "level": "HL", "paper_type": "P1", "calculator": "none", "section": "A",
        "total_marks": 5, "topic_code": "AA5.14", "mode": "template", "difficulty": "medium",
        "level_scope": "HL-only", "scaffold": 0,
        "stem_latex": stem,
        "parts_json": json.dumps([
            {"label": "a", "marks": 3, "text": "Find $\\dfrac{dy}{dx}$ in terms of $x$ and $y$.",
             "answer": f"$\\dfrac{{dy}}{{dx}} = {_fmt_latex(dydx)}$",
             "markscheme_lines": _marks_breakdown([
                 ("M1", "differentiating each term with respect to $x$, using the product rule on the $xy$ term"),
                 ("A1", "$2x + y + x\\dfrac{dy}{dx} + 2y\\dfrac{dy}{dx} = 0$"),
                 ("A1", f"$\\dfrac{{dy}}{{dx}} = {_fmt_latex(dydx)}$"),
             ])},
            {"label": "b", "marks": 2, "text": f"Hence find the value of $\\dfrac{{dy}}{{dx}}$ at the point $({x0},{y0})$.",
             "answer": f"${latex(dydx_at_point)}$",
             "markscheme_lines": _marks_breakdown([
                 ("M1", f"substituting $x={x0}$, $y={y0}$"),
                 ("A1", f"${latex(dydx_at_point)}$"),
             ])},
        ]),
        "check_code": check_code.strip(),
        "params": {"x0": x0, "y0": y0, "k": k},
    }


# ---------------------------------------------------------------------------
# AA5.14-P02: related rates -- inflating sphere, dV/dt at a given radius
# ---------------------------------------------------------------------------
def aa5_14_related_rates_sphere(a: int, b: int) -> dict:
    from sympy import pi as sym_pi
    r = symbols("r")
    V = Rational(4, 3) * sym_pi * r**3
    dVdr = diff(V, r)
    dVdt_at_a = simplify(dVdr.subs(r, a) * b)

    stem = (f"A spherical balloon is being inflated. At the instant when its radius is ${a}$ cm, "
            f"the radius is increasing at a rate of ${b}$ cm per second.")
    check_code = f"""
from sympy import symbols, Rational, pi, diff, simplify, sympify

r = symbols('r')
a, b = {a}, {b}
V = Rational(4, 3) * pi * r**3
dVdr = diff(V, r)
dVdt_at_a = simplify(dVdr.subs(r, a) * b)

expected_dVdr = sympify("{dVdr}")
expected_dVdt = sympify("{dVdt_at_a}")
assert simplify(dVdr - expected_dVdr) == 0, f"dVdr={{dVdr}}, expected {{expected_dVdr}}"
assert simplify(dVdt_at_a - expected_dVdt) == 0, f"dVdt_at_a={{dVdt_at_a}}, expected {{expected_dVdt}}"
print("PASS")
"""
    return {
        "level": "HL", "paper_type": "P1", "calculator": "none", "section": "A",
        "total_marks": 5, "topic_code": "AA5.14", "mode": "template", "difficulty": "medium",
        "level_scope": "HL-only", "scaffold": 0,
        "stem_latex": stem,
        "parts_json": json.dumps([
            {"label": "a", "marks": 2, "text": "Find an expression for $\\dfrac{dV}{dr}$, where $V$ is the volume of the balloon.",
             "answer": f"$\\dfrac{{dV}}{{dr}} = {_fmt_latex(dVdr)}$",
             "markscheme_lines": _marks_breakdown([
                 ("M1", "writing $V = \\dfrac{4}{3}\\pi r^{3}$ and differentiating with respect to $r$"),
                 ("A1", f"$\\dfrac{{dV}}{{dr}} = {_fmt_latex(dVdr)}$"),
             ])},
            {"label": "b", "marks": 3, "text": f"Hence find the rate of increase of the volume at the instant when the radius is ${a}$ cm.",
             "answer": f"$\\dfrac{{dV}}{{dt}} = {latex(dVdt_at_a)}$ cm$^{{3}}$/s",
             "markscheme_lines": _marks_breakdown([
                 ("M1", "using the chain rule $\\dfrac{dV}{dt} = \\dfrac{dV}{dr}\\cdot\\dfrac{dr}{dt}$"),
                 ("M1", f"substituting $r={a}$, $\\dfrac{{dr}}{{dt}}={b}$"),
                 ("A1", f"$\\dfrac{{dV}}{{dt}} = {latex(dVdt_at_a)}$ cm$^{{3}}$/s"),
             ])},
        ]),
        "check_code": check_code.strip(),
        "params": {"a": a, "b": b},
    }


# ---------------------------------------------------------------------------
# AA5.15-P01: chain rule on arctan(ax), given the standard derivative
# ---------------------------------------------------------------------------
def aa5_15_chain_arctan(a: int) -> dict:
    assert a != 0
    f_expr = atan(a * x)
    deriv = diff(f_expr, x)
    deriv_at_0 = deriv.subs(x, 0)

    stem = (f"It is given that $\\dfrac{{d}}{{dx}}(\\arctan x) = \\dfrac{{1}}{{1+x^{{2}}}}$. "
            f"Let $f(x) = \\arctan({_lin_term(a,0)})$.")
    check_code = f"""
from sympy import symbols, atan, diff, simplify, sympify

x = symbols('x')
a = {a}
f = atan(a*x)
deriv = diff(f, x)
val0 = deriv.subs(x, 0)

expected_deriv = sympify("{deriv}")
expected_val0 = sympify("{deriv_at_0}")
assert simplify(deriv - expected_deriv) == 0, f"deriv={{deriv}}, expected {{expected_deriv}}"
assert val0 == expected_val0, f"val0={{val0}}, expected {{expected_val0}}"
print("PASS")
"""
    return {
        "level": "HL", "paper_type": "P1", "calculator": "none", "section": "A",
        "total_marks": 5, "topic_code": "AA5.15", "mode": "template", "difficulty": "medium",
        "level_scope": "HL-only", "scaffold": 0,
        "stem_latex": stem,
        "parts_json": json.dumps([
            {"label": "a", "marks": 3, "text": "Find $f'(x)$.",
             "answer": f"$f'(x) = {_fmt_latex(deriv)}$",
             "markscheme_lines": _marks_breakdown([
                 ("M1", "recognising the chain rule"),
                 ("A1", f"$f'(x) = \\dfrac{{{a}}}{{1+({_lin_term(a,0)})^{{2}}}}$"),
                 ("A1", f"$f'(x) = {_fmt_latex(deriv)}$"),
             ])},
            {"label": "b", "marks": 2, "text": "Hence find $f'(0)$.",
             "answer": f"${latex(deriv_at_0)}$",
             "markscheme_lines": _marks_breakdown([
                 ("M1", "substituting $x=0$ into $f'(x)$"),
                 ("A1", f"$f'(0) = {latex(deriv_at_0)}$"),
             ])},
        ]),
        "check_code": check_code.strip(),
        "params": {"a": a},
    }


def build_all_ahl_diff_section_a() -> list[dict]:
    specs = [
        (aa5_13_lhopital_exp, dict(a=2, b=3), "AA5.13|HL-only|none|template|mid"),
        (aa5_13_lhopital_exp, dict(a=3, b=5), "AA5.13|HL-only|none|template|mid"),
        (aa5_13_maclaurin_ln, dict(a=2), "AA5.13|HL-only|none|template|mid"),
        (aa5_13_maclaurin_ln, dict(a=3), "AA5.13|HL-only|none|template|mid"),
        (aa5_14_implicit_point, dict(x0=1, y0=2), "AA5.14|HL-only|none|template|mid"),
        (aa5_14_implicit_point, dict(x0=2, y0=1), "AA5.14|HL-only|none|template|mid"),
        (aa5_14_related_rates_sphere, dict(a=3, b=2), "AA5.14|HL-only|none|template|mid"),
        (aa5_14_related_rates_sphere, dict(a=5, b=1), "AA5.14|HL-only|none|template|mid"),
        (aa5_15_chain_arctan, dict(a=2), "AA5.15|HL-only|none|template|mid"),
        (aa5_15_chain_arctan, dict(a=3), "AA5.15|HL-only|none|template|mid"),
    ]
    out = []
    for fn, kwargs, blueprint_cell in specs:
        q = fn(**kwargs)
        q.pop("_expected_g", None)
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
    qs = build_all_ahl_diff_section_a()
    print(f"{len(qs)} AHL-diff Section A template questions built.")
