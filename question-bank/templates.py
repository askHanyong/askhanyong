"""Template question generators for the pilot blueprint.

Each function picks clean parameters first, builds the question text
backward from them, and computes/verifies the answer with SymPy -- "answers
are correct by construction" per the brief. check_code is still a REAL,
runnable SymPy verification (not a hardcoded print("PASS")) so it would
catch a bug in the template's own arithmetic, not just rubber-stamp it.

Returns dicts matching the `questions` table shape (minus id/created_at,
added at insert time).
"""
import json


def _marks_breakdown(lines):
    return [{"note": n, "desc": d} for n, d in lines]


# ---------------------------------------------------------------------------
# Template 1: AA2.7 -- quadratic equation, given roots -> discriminant & nature
# Blueprint slots #6, #7 (SL, non-GDC, 4 marks, easy)
# ---------------------------------------------------------------------------
def aa2_7_roots_given_discriminant(root1: int, root2: int) -> dict:
    assert root1 != root2
    b = -(root1 + root2)
    c = root1 * root2
    disc = b * b - 4 * c

    b_str = f"{b}x" if b != 1 else "x"
    if b == -1:
        b_str = "-x"
    b_term = f" + {b_str}" if b > 0 else (f" - {abs(b)}x" if b < 0 and b != -1 else " - x")
    if b == 0:
        b_term = ""
    c_term = f" + {c}" if c >= 0 else f" - {abs(c)}"
    stem = f"Consider the equation $x^{{2}}{b_term}{c_term} = 0$."

    check_code = f"""
from sympy import symbols, Eq, discriminant, solve, Rational
x = symbols('x')
b, c = {b}, {c}
expr = x**2 + b*x + c
d = discriminant(expr, x)
roots = solve(Eq(expr, 0), x)
assert d == {disc}, f"discriminant mismatch: computed {{d}}, expected {disc}"
assert len(set(roots)) == 2, f"expected 2 distinct real roots, got {{roots}}"
assert all(r.is_real for r in roots), f"expected real roots, got {{roots}}"
print("PASS")
"""
    return {
        "level": "SL", "paper_type": "P1", "calculator": "none", "section": "A",
        "total_marks": 4, "topic_code": "AA2.7",
        "mode": "template", "difficulty": "easy",
        "stem_latex": stem,
        "parts_json": json.dumps([
            {
                "label": "a", "marks": 2,
                "text": "Find the discriminant of the equation.",
                "answer": f"$\\Delta = {disc}$",
                "markscheme_lines": _marks_breakdown([
                    ("M1", "attempt to use $b^{2}-4ac$"),
                    ("A1", f"$\\Delta = {disc}$"),
                ]),
            },
            {
                "label": "b", "marks": 2,
                "text": "Hence state, with a reason, the nature of the roots of the equation.",
                "answer": f"Real and distinct roots, since $\\Delta = {disc} > 0$",
                "markscheme_lines": _marks_breakdown([
                    ("R1", f"valid reason -- $\\Delta > 0$"),
                    ("A1", "real and distinct roots"),
                ]),
            },
        ]),
        "check_code": check_code.strip(),
        "params": {"root1": root1, "root2": root2, "b": b, "c": c, "discriminant": disc},
    }


# ---------------------------------------------------------------------------
# Template 2: AA2.7 -- find k for repeated root (discriminant = 0)
# Blueprint slots #8, #9 (HL, non-GDC, 5 marks, medium)
# ---------------------------------------------------------------------------
def aa2_7_repeated_root(repeated_root: int, b_coeff_half: int) -> dict:
    # x^2 + Bx + (k + C) = 0 with B = 2*b_coeff_half chosen so the repeated
    # root is a clean integer: completing the square gives repeated root at
    # x = -b_coeff_half when k makes the constant term equal b_coeff_half^2.
    B = 2 * b_coeff_half
    target_root = -b_coeff_half
    assert target_root == repeated_root, "internal: root/coefficient mismatch"
    C = 3  # arbitrary clean offset so "k" isn't the bare constant term
    target_k = b_coeff_half * b_coeff_half - C

    b_term = f" + {B}x" if B > 0 else (f" - {abs(B)}x" if B < 0 else "")
    c_term = f" + (k + {C})" if C >= 0 else f" + (k - {abs(C)})"
    stem = f"The equation $x^{{2}}{b_term}{c_term} = 0$, where $k \\in \\mathbb{{R}}$, has exactly one real root."

    check_code = f"""
from sympy import symbols, Eq, discriminant, solve
x, k = symbols('x k')
B, C = {B}, {C}
expr = x**2 + B*x + (k + C)
d = discriminant(expr, x)
sols = solve(Eq(d, 0), k)
assert len(sols) == 1, f"expected exactly one k solving discriminant=0, got {{sols}}"
k_val = sols[0]
assert k_val == {target_k}, f"computed k={{k_val}}, expected {target_k}"
root = solve(Eq(expr.subs(k, k_val), 0), x)
assert len(set(root)) == 1, f"expected a single repeated root, got {{root}}"
assert root[0] == {target_root}, f"computed root={{root[0]}}, expected {target_root}"
print("PASS")
"""
    return {
        "level": "HL", "paper_type": "P1", "calculator": "none", "section": "A",
        "total_marks": 5, "topic_code": "AA2.7",
        "mode": "template", "difficulty": "medium",
        "stem_latex": stem,
        "parts_json": json.dumps([
            {
                "label": "a", "marks": 2,
                "text": "Find the discriminant of the equation in terms of $k$.",
                "answer": f"$\\Delta = {B}^{{2}} - 4(k+{C})$",
                "markscheme_lines": _marks_breakdown([
                    ("M1", "attempt to use $b^{2}-4ac$ with the given coefficients"),
                    ("A1", "correct discriminant expression in terms of $k$"),
                ]),
            },
            {
                "label": "b", "marks": 3,
                "text": "Hence find the value of $k$, and state the repeated root of the equation.",
                "answer": f"$k = {target_k}$, repeated root $x = {target_root}$",
                "markscheme_lines": _marks_breakdown([
                    ("M1", "setting $\\Delta = 0$"),
                    ("A1", f"$k = {target_k}$"),
                    ("A1", f"$x = {target_root}$"),
                ]),
            },
        ]),
        "check_code": check_code.strip(),
        "params": {"repeated_root": repeated_root, "B": B, "C": C, "target_k": target_k},
    }


# ---------------------------------------------------------------------------
# Template 3: AA5.8 -- clean critical point, verify maximum via 2nd derivative
# Blueprint slots #16, #17 (SL, non-GDC, 5 marks, easy/medium)
# ---------------------------------------------------------------------------
def aa5_8_clean_critical_point(a: int) -> dict:
    # f(x) = 3a^2 x - x^3, x>0: f'(x) = 3a^2 - 3x^2 = 0 -> x = a (x>0),
    # f''(x) = -6x -> f''(a) = -6a < 0 for a>0 -- always a maximum.
    assert a > 0
    c = 3 * a * a
    f_at_a = c * a - a ** 3

    stem = f"Let $f(x) = {c}x - x^{{3}}$ for $x > 0$."
    check_code = f"""
from sympy import symbols, diff, solve, Eq
x = symbols('x', positive=True)
c = {c}
f = c*x - x**3
fp = diff(f, x)
crit = solve(Eq(fp, 0), x)
assert len(crit) == 1, f"expected one positive critical point, got {{crit}}"
a_val = crit[0]
assert a_val == {a}, f"computed critical point {{a_val}}, expected {a}"
fpp = diff(f, x, 2)
fpp_at_a = fpp.subs(x, a_val)
assert fpp_at_a < 0, f"expected f''(a)<0 (maximum), got {{fpp_at_a}}"
f_max = f.subs(x, a_val)
assert f_max == {f_at_a}, f"computed f(a)={{f_max}}, expected {f_at_a}"
print("PASS")
"""
    return {
        "level": "SL", "paper_type": "P1", "calculator": "none", "section": "A",
        "total_marks": 5, "topic_code": "AA5.8",
        "mode": "template", "difficulty": "easy",
        "stem_latex": stem,
        "parts_json": json.dumps([
            {
                "label": "a", "marks": 2,
                "text": "Find $f'(x)$, and show that $x = " + str(a) + "$ is a stationary point of $f$.",
                "answer": f"$f'(x) = {c} - 3x^{{2}}$; shown",
                "markscheme_lines": _marks_breakdown([
                    ("A1", f"$f'(x) = {c} - 3x^{{2}}$"),
                    ("M1", f"setting $f'(x)=0$ and showing $x={a}$ satisfies it"),
                ]),
            },
            {
                "label": "b", "marks": 3,
                "text": "Use the second derivative to show that this stationary point is a local maximum, and find the maximum value of $f$.",
                "answer": f"$f''(x) = -6x$, $f''({a}) = {-6*a} < 0$, so local maximum; $f({a}) = {f_at_a}$",
                "markscheme_lines": _marks_breakdown([
                    ("M1", "attempt to find $f''(x)$ and evaluate at the stationary point"),
                    ("R1", f"$f''({a}) < 0$, hence a local maximum"),
                    ("A1", f"$f({a}) = {f_at_a}$"),
                ]),
            },
        ]),
        "check_code": check_code.strip(),
        "params": {"a": a, "c": c, "f_max": f_at_a},
    }


# ---------------------------------------------------------------------------
# Template 4: AA5.8 -- constrained optimization, GDC-scale numbers
# Blueprint slots #18, #19 (HL, GDC, 6 marks, medium)
# ---------------------------------------------------------------------------
def aa5_8_constrained_optimization(volume: int) -> dict:
    # Open box, square base side x, volume V = x^2 h -> h = V/x^2.
    # Surface area (base + 4 sides, open top): S(x) = x^2 + 4V/x.
    # S'(x) = 2x - 4V/x^2 = 0 -> x^3 = 2V -> x = (2V)^(1/3).
    # Chosen so 2V is a perfect cube -> clean x.
    cube = 2 * volume
    x_min = round(cube ** (1 / 3))
    assert x_min ** 3 == cube, f"internal: volume {volume} does not give a clean cube root"
    # S(x_min) = x_min^2 + 4*volume/x_min; since volume = x_min^3/2, this
    # simplifies to x_min^2 + 2*x_min^2 = 3*x_min^2 exactly -- avoids a
    # true-division float (4*volume/x_min) landing as e.g. 300.0 and
    # mismatching sympy's exact Integer(300) in the check_code comparison.
    s_min = 3 * x_min * x_min

    stem = (
        f"An open rectangular box has a square base of side $x$ cm and volume ${volume}\\text{{ cm}}^{{3}}$."
    )
    check_code = f"""
from sympy import symbols, diff, solve, Eq, Rational
x = symbols('x', positive=True)
V = {volume}
S = x**2 + 4*V/x
Sp = diff(S, x)
crit = solve(Eq(Sp, 0), x)
assert len(crit) == 1, f"expected one positive critical point, got {{crit}}"
x_val = crit[0]
assert x_val == {x_min}, f"computed x={{x_val}}, expected {x_min}"
Spp = diff(S, x, 2)
assert Spp.subs(x, x_val) > 0, "expected a minimum (S''(x)>0)"
S_min = S.subs(x, x_val)
assert S_min == {s_min}, f"computed S_min={{S_min}}, expected {s_min}"
print("PASS")
"""
    return {
        "level": "HL", "paper_type": "P2", "calculator": "gdc", "section": "A",
        "total_marks": 6, "topic_code": "AA5.8",
        "mode": "template", "difficulty": "medium",
        "stem_latex": stem,
        "parts_json": json.dumps([
            {
                "label": "a", "marks": 2,
                "text": "Show that the total external surface area, $S\\text{ cm}^2$, of the box (open top) is given by $$S(x) = x^{2} + \\frac{" + str(4 * volume) + "}{x}.$$",
                "answer": "shown",
                "markscheme_lines": _marks_breakdown([
                    ("M1", f"height $= V/x^{{2}} = {volume}/x^{{2}}$"),
                    ("A1", "substituted into $S = x^{2} + 4xh$ to obtain the given expression"),
                ]),
            },
            {
                "label": "b", "marks": 4,
                "text": "Find the value of $x$ that minimizes $S$, and the minimum surface area.",
                "answer": f"$x = {x_min}$, $S_{{\\min}} = {s_min:.0f}\\text{{ cm}}^2$",
                "markscheme_lines": _marks_breakdown([
                    ("M1", "$S'(x) = 0$"),
                    ("A1", f"$x = {x_min}$"),
                    ("R1", "second derivative (or sign change) confirms a minimum"),
                    ("A1", f"$S_{{\\min}} = {s_min:.0f}$"),
                ]),
            },
        ]),
        "check_code": check_code.strip(),
        "params": {"volume": volume, "x_min": x_min, "s_min": s_min},
    }


def build_all_templates() -> list[dict]:
    specs = [
        (aa2_7_roots_given_discriminant, dict(root1=5, root2=-2), "AA2.7|SL|none|template|low"),
        (aa2_7_roots_given_discriminant, dict(root1=7, root2=3), "AA2.7|SL|none|template|low"),
        (aa2_7_repeated_root, dict(repeated_root=-3, b_coeff_half=3), "AA2.7|HL|none|template|mid"),
        (aa2_7_repeated_root, dict(repeated_root=-5, b_coeff_half=5), "AA2.7|HL|none|template|mid"),
        (aa5_8_clean_critical_point, dict(a=2), "AA5.8|SL|none|template|low"),
        (aa5_8_clean_critical_point, dict(a=3), "AA5.8|SL|none|template|low"),
        (aa5_8_constrained_optimization, dict(volume=500), "AA5.8|HL|gdc|template|mid"),
        (aa5_8_constrained_optimization, dict(volume=4000), "AA5.8|HL|gdc|template|mid"),
    ]
    out = []
    for fn, kwargs, blueprint_cell in specs:
        q = fn(**kwargs)
        q["blueprint_cell"] = blueprint_cell
        out.append(q)
    return out


if __name__ == "__main__":
    import sys
    for q in build_all_templates():
        print(f"{q['blueprint_cell']}: {q['stem_latex'][:70]}...  params={q['params']}")
