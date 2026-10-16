"""Independently-written check_code for the 1 AHL-differentiation
Section B bespoke question (guided arcsin-derivative proof). Written by
a subagent that saw ONLY stem_only_text(q) -- never `answer` or
`markscheme_lines` -- per the independence ground rule.
"""

CHECK_CODE_0 = """
import sympy as sp

x = sp.symbols('x', real=True)

y_expr = sp.asin(x)
check_a1 = sp.simplify(sp.sin(y_expr) - x)
a_sin_identity_ok = (check_a1 == 0)
a_range_lower = sp.asin(-1)
a_range_upper = sp.asin(1)
a_range_ok = (a_range_lower == -sp.pi/2) and (a_range_upper == sp.pi/2)
part_a_ok = bool(a_sin_identity_ok and a_range_ok)

yf = sp.Function('y')(x)
lhs = sp.sin(yf)
rhs = x
lhs_diff = sp.diff(lhs, x)
rhs_diff = sp.diff(rhs, x)
ydot = sp.Function('y')(x).diff(x)
solved = sp.solve(sp.Eq(lhs_diff, rhs_diff), ydot)
dydx_from_b = solved[0] if solved else None

b_chain_rule_ok = sp.simplify(lhs_diff - sp.cos(yf) * ydot) == 0
b_equation_ok = sp.simplify(sp.cos(yf) * dydx_from_b - 1) == 0 if dydx_from_b is not None else False
part_b_ok = bool(b_chain_rule_ok and b_equation_ok)
b_result_str = "cos(y)*dy/dx = 1"

y_sym = sp.symbols('y', real=True)
sample_ys = [sp.Rational(-1, 1) * sp.pi/2, -sp.pi/3, -sp.pi/6, 0, sp.pi/6, sp.pi/3, sp.pi/2]
cos_values = [sp.cos(val) for val in sample_ys]
c_nonneg_on_samples = all(sp.simplify(v) >= 0 for v in cos_values)
cos_roots = sp.solveset(sp.cos(y_sym), y_sym, domain=sp.Interval(-sp.pi/2, sp.pi/2))
interior_roots = [r for r in cos_roots if sp.simplify(r - (-sp.pi/2)) != 0 and sp.simplify(r - sp.pi/2) != 0]
c_no_interior_sign_change = (len(interior_roots) == 0)
pythagorean_check = sp.simplify(sp.cos(y_sym)**2 + sp.sin(y_sym)**2 - 1) == 0
part_c_ok = bool(pythagorean_check and c_nonneg_on_samples and c_no_interior_sign_change)
c_cos_y_formula = sp.sqrt(1 - x**2)

dydx_combined = sp.simplify(dydx_from_b.subs(sp.cos(yf), c_cos_y_formula))
dydx_d_formula = 1 / sp.sqrt(1 - x**2)
sympy_asin_diff = sp.diff(sp.asin(x), x)
d_match = sp.simplify(dydx_combined - sympy_asin_diff) == 0
d_match_formula = sp.simplify(dydx_d_formula - sympy_asin_diff) == 0
part_d_ok = bool(d_match and d_match_formula)
d_formula_str = "dy/dx = 1/sqrt(1 - x**2)"

e_expr = sp.diff(sp.asin(2*x), x)
e_expr_simplified = sp.simplify(e_expr)
e_expected = 2 / sp.sqrt(1 - 4*x**2)
e_match = sp.simplify(e_expr_simplified - e_expected) == 0
e_str = str(e_expected) if e_match else str(e_expr_simplified)

f_func = sp.asin(x)
f_at_0 = f_func.subs(x, 0)
fprime = sp.diff(f_func, x)
fprime_at_0 = fprime.subs(x, 0)
tangent_line = f_at_0 + fprime_at_0 * x
tangent_line_simplified = sp.simplify(tangent_line)
f_str = f"y = {tangent_line_simplified}"

result = {
    "a": "sin(y)=x confirmed equivalent" if part_a_ok else "sin(y)=x equivalence FAILED",
    "b": (b_result_str, part_b_ok),
    "c": part_c_ok,
    "d": (d_formula_str, part_d_ok),
    "e": e_str,
    "f": f_str,
}

print(result)
"""

CHECK_CODE = [CHECK_CODE_0.strip()]
