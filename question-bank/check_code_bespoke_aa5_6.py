"""Independently-written check_code for the 3 AA5.6 Section B bespoke
questions (rebuilt from 8-mark templates into genuine 15-mark multi-part
structures). Each script was written by a separate Agent-tool subagent
that saw ONLY stem_only_text(q) (stem + part label/marks/text) -- never
`answer` or `markscheme_lines` -- per the independence ground rule. Each
prints its own independently-computed dict; the comparison against the
stored answer happens in run_bespoke_aa5_6_checks.py's validators.
"""

# [0] prod_aa5_6_bespoke_product_chain -- f(x) = x^2 e^{2x}
CHECK_CODE_0 = """
import sympy as sp

x = sp.symbols('x', real=True)

f = x**2 * sp.exp(2*x)
fprime = sp.diff(f, x)
fprime_simplified = sp.simplify(fprime)

val_at_0 = sp.simplify(fprime.subs(x, 0))
val_at_neg1 = sp.simplify(fprime.subs(x, -1))

all_roots = sp.solve(sp.Eq(fprime, 0), x)
real_roots = sorted(set(r for r in all_roots if r.is_real))
real_roots_numeric = sorted(float(r) for r in real_roots)

fdoubleprime = sp.diff(f, x, 2)
fdoubleprime_simplified = sp.simplify(fdoubleprime)

fpp_at_0 = sp.simplify(fdoubleprime.subs(x, 0))
nature_0 = "local min" if fpp_at_0 > 0 else ("local max" if fpp_at_0 < 0 else "inconclusive")

fpp_at_neg1 = sp.simplify(fdoubleprime.subs(x, -1))
nature_neg1 = "local min" if fpp_at_neg1 > 0 else ("local max" if fpp_at_neg1 < 0 else "inconclusive")

asymptote_limit = sp.limit(f, x, -sp.oo)

result = {
    "a": str(fprime_simplified),
    "b": {
        "f_prime_at_0": float(val_at_0),
        "f_prime_at_neg1": float(val_at_neg1),
        "all_real_roots_of_f_prime": real_roots_numeric,
        "confirms_only_two_stationary_points": (real_roots_numeric == [-1.0, 0.0]),
    },
    "c": str(fdoubleprime_simplified),
    "d": {"f_double_prime_at_0": float(fpp_at_0), "nature": nature_0},
    "e": {"f_double_prime_at_neg1": str(sp.nsimplify(fpp_at_neg1)), "nature": nature_neg1},
    "f": float(asymptote_limit) if asymptote_limit.is_number else str(asymptote_limit),
}
print(result)
"""

# [1] prod_aa5_6_bespoke_quotient_stationary -- f(x) = (x+3)/(x^2+16)
CHECK_CODE_1 = """
import sympy as sp

x = sp.symbols('x', real=True)

f = (x + 3) / (x**2 + 16)

fprime_raw = sp.diff(f, x)
fprime = sp.together(sp.simplify(fprime_raw))

numerator = sp.numer(fprime)
denominator = sp.denom(fprime)

candidates = sp.solve(sp.Eq(numerator, 0), x)
stationary_points = sorted(
    [sp.nsimplify(c) for c in candidates
     if c.is_real and sp.simplify(denominator.subs(x, c)) != 0],
    key=lambda v: float(v)
)

f_at_2 = sp.nsimplify(f.subs(x, 2))
f_at_neg8 = sp.nsimplify(f.subs(x, -8))

fsecond = sp.diff(f, x, 2)
nature_list = []
for s in stationary_points:
    val = sp.simplify(fsecond.subs(x, s))
    nature_list.append("local min" if val > 0 else ("local max" if val < 0 else "inconclusive"))

f0 = sp.nsimplify(f.subs(x, 0))
fprime0 = sp.nsimplify(fprime.subs(x, 0))
tangent_expr = sp.expand(fprime0 * x + f0)

result = {
    "a": str(fprime),
    "b": [str(s) for s in stationary_points],
    "c": {"f(2)": str(f_at_2), "f(-8)": str(f_at_neg8)},
    "d": nature_list,
    "e": str(tangent_expr),
}
print(result)
"""

# [2] prod_aa5_6_bespoke_double_angle -- f(x) = sin^2(2x)
CHECK_CODE_2 = """
import sympy as sp

x = sp.symbols('x', real=True)

f = sp.sin(2*x)**2

fprime_raw = sp.diff(f, x)
fprime_simplified = sp.simplify(sp.trigsimp(fprime_raw))

claimed_a = 2*sp.sin(4*x)
matches_claim = sp.simplify(fprime_simplified - claimed_a) == 0

fdoubleprime_raw = sp.diff(f, x, 2)
fdoubleprime_simplified = sp.simplify(sp.trigsimp(fdoubleprime_raw))
from sympy.simplify.fu import TR8
fdoubleprime_compact = TR8(fdoubleprime_raw)
if sp.simplify(fdoubleprime_compact - fdoubleprime_raw) == 0:
    fdoubleprime_simplified = fdoubleprime_compact

domain = sp.Interval(0, sp.pi/2)
solset = sp.solveset(sp.Eq(fprime_simplified, 0), x, domain=domain)
sol_list = sorted(list(solset), key=lambda v: float(v))

classifications = []
point_values = []
for s in sol_list:
    second_val = sp.simplify(fdoubleprime_simplified.subs(x, s))
    f_val = sp.simplify(f.subs(x, s))
    point_values.append(f_val)
    classifications.append("local min" if second_val > 0 else ("local max" if second_val < 0 else "undetermined"))

y = sp.symbols('y', real=True)
f_full = sp.sin(y)**2
range_low = sp.Rational(0)
range_high = sp.Rational(1)

candidates = sol_list + [sp.Integer(0), sp.pi/2]
candidate_vals = [(c, sp.simplify(f.subs(x, c))) for c in candidates]
max_val = max(v for _, v in candidate_vals)
max_x_candidates = [c for c, v in candidate_vals if sp.simplify(v - max_val) == 0]
max_x = max_x_candidates[0]

result = {
    "a": {"f_prime_derived": str(fprime_simplified), "matches_claimed_2sin4x": bool(matches_claim)},
    "b": str(fdoubleprime_simplified),
    "c": [str(s) for s in sol_list],
    "d": classifications,
    "e": [str(range_low), str(range_high)],
    "f": [str(max_val), str(max_x)],
    "point_values": [str(v) for v in point_values],
}
print(result)
"""

CHECK_CODE = [CHECK_CODE_0.strip(), CHECK_CODE_1.strip(), CHECK_CODE_2.strip()]
