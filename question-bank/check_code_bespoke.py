"""check_code for the 12 bespoke questions, returned VERBATIM by independent
subagents that saw ONLY the stem/part text (bespoke_questions.stem_only_text)
-- never the answer or markscheme_lines. Index matches bespoke_questions.BESPOKE's
order exactly.

Two of the twelve subagent responses included one line of prose before the
code ("Verified: ..." / "Script verified and runs correctly ..."); that line
is stripped here since it isn't valid Python and the script won't run with
it in place -- this is extraction (making the response executable), not an
edit to the code's logic. No other changes were made to any of the 12.
"""

CHECK_CODE = [
# 0: AA1.2 SL none -- u3=11, u7=27
"""
from sympy import Rational, Eq, solve, symbols

u1, d = symbols('u1 d')

u3_val = Rational(11)
u7_val = Rational(27)

eq1 = Eq(u1 + 2*d, u3_val)
eq2 = Eq(u1 + 6*d, u7_val)

sol = solve([eq1, eq2], [u1, d])
u1_sol = sol[u1]
d_sol = sol[d]

u20 = u1_sol + 19*d_sol

def to_plain(x):
    if x.is_Integer:
        return int(x)
    return str(x)

result = {
    "a": {"d": to_plain(d_sol), "u1": to_plain(u1_sol)},
    "b": to_plain(u20)
}

print(result)
""",
# 1: AA1.2 SL gdc -- a1=4,d=6, Sn=690
"""
import sympy as sp

n = sp.symbols('n')
a1 = sp.Integer(4)
d = sp.Integer(6)

Sn_expr = sp.expand(n / 2 * (2 * a1 + (n - 1) * d))
Sn_str = str(Sn_expr)

solutions = sp.solve(sp.Eq(Sn_expr, 690), n)
positive_int_solutions = [s for s in solutions if s.is_real and s > 0 and s == sp.floor(s)]
n_value = int(positive_int_solutions[0])

result = {
    "a": Sn_str,
    "b": n_value
}
print(result)
""",
# 2: AA1.2 HL none -- sum(5r-3), sigma notation
"""
import sympy as sp

r, n = sp.symbols('r n', positive=True, integer=True)

term = lambda k: 5*k - 3

first_term = sp.Rational(term(1))
second_term = sp.Rational(term(2))
common_difference = sp.simplify(second_term - first_term)

sum_expr = sp.summation(5*r - 3, (r, 1, n))
sum_expr = sp.simplify(sum_expr)

claimed_formula = sp.Rational(1, 2) * n * (5*n - 1)

difference = sp.simplify(sum_expr - claimed_formula)
formula_holds = (difference == 0)

n_sym = sp.symbols('n_sym')
equation = sp.Eq(sp.Rational(1, 2) * n_sym * (5*n_sym - 1), 632)
solutions = sp.solve(equation, n_sym)

n_value = None
for sol in solutions:
    if sol.is_real and sol > 0 and sol == sp.floor(sol):
        n_value = int(sol)
        break

result = {
    "a": {"first_term": int(first_term), "common_difference": int(common_difference)},
    "b": bool(formula_holds),
    "c": n_value,
}

print(result)
""",
# 3: AA1.2 HL gdc -- Hanyong savings
"""
from sympy import symbols, solve, Rational

n = symbols('n', positive=True, integer=True)

a1 = 50
d = 15

a12 = a1 + (12 - 1) * d

def total_after(n_val):
    return n_val * (2 * a1 + (n_val - 1) * d) / 2

n_val = 1
while total_after(n_val) <= 3000:
    n_val += 1

b = n_val

print({"a": a12, "b": b})
""",
# 4: AA1.2 HL gdc -- Sn=n^2+3n (part (c) rewritten from a u_n threshold to
# an S_n threshold, since a u_n threshold is always linear in n for an AP
# and so doesn't genuinely need a GDC regardless of how the sequence was
# defined; re-verified by a fresh independent subagent against the
# rewritten part (c), after an earlier subagent attempt crashed on a
# sympy Union-type .start attribute error and was discarded rather than
# patched)
"""
import sympy as sp

n = sp.symbols('n', positive=True, integer=True)

def S(k):
    return k**2 + 3*k

u1 = S(1)
u2 = S(2) - S(1)
d = u2 - u1

u10 = S(10) - S(9)

k = sp.symbols('k', positive=True, integer=True)
u_k_general = sp.simplify(S(k) - S(k-1))
expected_general = u1 + (k - 1) * d
assert sp.simplify(u_k_general - expected_general) == 0

target = 300
smallest_n = None
candidate = 1
while True:
    if S(candidate) > target:
        smallest_n = candidate
        break
    candidate += 1

result = {
    "a": {"u1": int(u1), "u2": int(u2), "d": int(d)},
    "b": int(u10),
    "c": int(smallest_n)
}

print(result)
""",
# 5: AA2.7 SL gdc -- 2.5x^2-7x+3.2=0
"""
from sympy import Rational

a = Rational(5, 2)
b = Rational(-7, 1)
c = Rational(16, 5)

discriminant = b**2 - 4*a*c

if discriminant > 0:
    nature = "real and distinct"
elif discriminant == 0:
    nature = "real and equal"
else:
    nature = "complex"

print({"a": discriminant, "b": nature})
""",
# 6: AA4.7 SL none -- table with p
"""
from fractions import Fraction

p_values = {
    1: Fraction(1, 10),
    3: Fraction(3, 10),
    4: Fraction(2, 10),
}

known_sum = sum(p_values.values())
p = 1 - known_sum

distribution = {
    1: p_values[1],
    2: p,
    3: p_values[3],
    4: p_values[4],
}

assert sum(distribution.values()) == 1

E_X = sum(x * prob for x, prob in distribution.items())

a_val = float(p)
b_val = float(E_X)

print({"a": a_val, "b": b_val})
""",
# 7: AA4.7 SL gdc -- P(Y=y)=ky
"""
from sympy import Rational, symbols, Eq, solve, simplify

k = symbols('k')

y_values = [1, 2, 3, 4, 5]

total_prob = sum(k * y for y in y_values)
eq = Eq(total_prob, 1)
k_solution = solve(eq, k)[0]

k_exact = Rational(k_solution)

assert simplify(k_exact - Rational(1, 15)) == 0

E_Y = sum(y * (k_exact * y) for y in y_values)
E_Y = Rational(E_Y)

result = {"a": str(k_exact), "b": str(E_Y)}
print(result)
""",
# 8: AA4.7 HL none -- dice game
"""
from sympy import Rational

COST = 5

outcomes = {
    1: 0,
    2: 0,
    3: 0,
    4: 2,
    5: 2,
    6: 20,
}

profit_probs = {}
for face, payout in outcomes.items():
    net_profit = payout - COST
    p = Rational(1, 6)
    profit_probs[net_profit] = profit_probs.get(net_profit, Rational(0, 1)) + p

assert sum(profit_probs.values()) == 1

E_X = sum(x * p for x, p in profit_probs.items())

if E_X > 0:
    favors = "player"
elif E_X < 0:
    favors = "organizer"
else:
    favors = "neither"

a_result = {x: str(p) for x, p in sorted(profit_probs.items())}
b_result = {"E_X": str(E_X), "favors": favors}

result = {"a": a_result, "b": b_result}
print(result)
""",
# 9: AA4.7 HL gdc -- P(Z=z)=z^2/50
"""
from fractions import Fraction

probs = {z: Fraction(z**2, 50) for z in [1, 2, 3, 4]}

sum_known = sum(probs.values())
c = Fraction(1, 1) - sum_known

p_2_to_4 = probs[2] + probs[3] + probs[4]

a_answer = float(c)
b_answer = float(p_2_to_4)

print({"a": a_answer, "b": b_answer})
""",
# 10: AA4.7 HL gdc -- W distribution, T=10W+4
"""
from fractions import Fraction

p = {0: Fraction(2, 10), 1: Fraction(5, 10), 2: Fraction(3, 10)}

assert sum(p.values()) == 1

E_W = sum(w * prob for w, prob in p.items())

a_coef = 10
b_coef = 4
E_T = a_coef * E_W + b_coef

result = {"a": float(E_W), "b": float(E_T)}
print(result)
""",
# 11: AA5.8 SL gdc -- cylindrical tin cost minimization
"""
import sympy as sp

r = sp.symbols('r', positive=True)

h = 600 / r**2

cost_top_bottom = 2 * sp.pi * r**2 * sp.Rational(5, 100)
cost_side = 2 * sp.pi * r * h * sp.Rational(3, 100)

C_derived = sp.simplify(cost_top_bottom + cost_side)

C_stated = sp.Rational(1, 10) * sp.pi * r**2 + 36 * sp.pi / r

a_matches = sp.simplify(C_derived - C_stated) == 0

C = sp.Rational(1, 10) * sp.pi * r**2 + 36 * sp.pi / r

dC = sp.diff(C, r)
critical_points = sp.solve(sp.Eq(dC, 0), r)
critical_points = [cp for cp in critical_points if cp.is_real and cp > 0]

d2C = sp.diff(C, r, 2)

r_min = None
for cp in critical_points:
    if d2C.subs(r, cp) > 0:
        r_min = cp
        break

min_cost_exact = C.subs(r, r_min)

r_val = float(r_min)
min_cost_val = float(min_cost_exact)

r_rounded = float(f"{r_val:.3g}")
min_cost_rounded = round(min_cost_val, 2)

result = {
    "a": bool(a_matches),
    "b": {"r": r_rounded, "min_cost": min_cost_rounded}
}

print(result)
""",
]
