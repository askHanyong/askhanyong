"""check_code for the 15 new bespoke AA1.2 questions, returned VERBATIM by
independent subagents that saw ONLY the stem/part text
(bespoke_questions_aa1_2.stem_only_text) -- never the answer or
markscheme_lines. Index matches bespoke_questions_aa1_2.BESPOKE_AA1_2's
order exactly.

Several subagent responses included prose before and/or after the code
block (e.g. "Verified: output `{...}`." or a note about writing a
scratch file); that prose is stripped here since it isn't valid Python --
this is extraction (making the response executable), not an edit to the
code's logic, matching the precedent set for the pilot's bespoke
questions. A few responses also came back with their comparison operators
HTML-entity-escaped (`&gt;`, `&lt;`) by the notification transport layer;
those are decoded back to `>`/`<` here for the same reason -- the code as
actually written by the subagent uses plain Python operators, and the
escaped form would be a plain SyntaxError if executed as-is.
"""

CHECK_CODE = [
# 0: Gauss pairing -- 21 terms, u1=7, u21=87
"""
from fractions import Fraction

n = 21
a1 = Fraction(7)
an = Fraction(87)

d = (an - a1) / (n - 1)

S = Fraction(n, 2) * (a1 + an)

def to_num(x):
    if isinstance(x, Fraction) and x.denominator == 1:
        return int(x)
    return x

result = {"a": to_num(d), "b": to_num(S)}
print(result)
""",
# 1: membership test -- u1=4,d=6, is 100/101 a term?
"""
from sympy import symbols, Eq, solve, Integer
from fractions import Fraction

u1 = Integer(4)
d = Integer(6)

n = symbols('n')

def is_term(value):
    value = Integer(value)
    expr = Eq(u1 + (n - 1) * d, value)
    sols = solve(expr, n)
    if not sols:
        return False
    sol = sols[0]
    if not sol.is_rational:
        return False
    frac = Fraction(int(sol.p), int(sol.q)) if hasattr(sol, 'p') else Fraction(sol)
    if frac.denominator != 1:
        return False
    n_val = frac.numerator
    return n_val >= 1

result = {
    "a": is_term(100),
    "b": is_term(101),
}

print(result)
""",
# 2: ratio condition -- u4=3u1, u8-u2=24
"""
from sympy import symbols, Eq, solve, Rational

u1, d = symbols('u1 d')

eq1 = Eq(u1 + 3*d, 3*u1)
eq2 = Eq((u1 + 7*d) - (u1 + d), 24)

sol = solve([eq1, eq2], [u1, d], dict=True)[0]
u1_val = sol[u1]
d_val = sol[d]

u15_val = u1_val + 14 * d_val

result = {
    "a": {"d": d_val, "u1": u1_val},
    "b": u15_val
}

print(result)
""",
# 3: two-sum condition -- S6=72, S10=200 (part (b) rewritten from the
# redundant "find u1" to "find u15", re-verified by a fresh independent
# subagent against the rewritten part (b); an earlier subagent attempt
# crashed on a symbols() unpacking mismatch and was discarded rather
# than patched)
"""
import sympy as sp

u1, d, n = sp.symbols('u1 d n')

def S(n_val):
    return n_val * (2*u1 + (n_val - 1) * d) / 2

eq1 = sp.Eq(S(6), 72)
eq2 = sp.Eq(S(10), 200)

sol = sp.solve([eq1, eq2], [u1, d], dict=True)

sol0 = sol[0]
u1_val = sol0[u1]
d_val = sol0[d]

u1_val = sp.nsimplify(u1_val)
d_val = sp.nsimplify(d_val)

u15_val = u1_val + 14 * d_val
u15_val = sp.nsimplify(u15_val)

def to_native(x):
    x = sp.simplify(x)
    if x.is_Integer:
        return int(x)
    if x.is_Rational:
        return float(x)
    return float(x)

result = {
    "a": {"u1": to_native(u1_val), "d": to_native(d_val)},
    "b": to_native(u15_val)
}

print(result)
""",
# 4: theatre seats -- u1=18,d=2,n=25 (extended with part (c): smallest n with
# S_n>1200, re-verified by a fresh independent subagent after the
# GDC-necessity fix added part (c))
"""
from sympy import symbols, Eq, solve, nsimplify

a1 = 18
d = 2

n = symbols('n', positive=True, integer=True)

def nth_term(k):
    return a1 + (k - 1) * d

row25_seats = nth_term(25)

def sum_n_terms(k):
    return k * (2 * a1 + (k - 1) * d) / 2

total_25_rows = sum_n_terms(25)
total_25_rows = int(total_25_rows) if float(total_25_rows).is_integer() else total_25_rows

S_expr = n * (2 * a1 + (n - 1) * d) / 2

n_sym = symbols('x', positive=True, real=True)
S_real = n_sym * (2 * a1 + (n_sym - 1) * d) / 2
solutions = solve(Eq(S_real, 1200), n_sym)
positive_roots = [sol for sol in solutions if sol.is_real and sol > 0]
bound = max(positive_roots) if positive_roots else 0

candidate = max(1, int(bound) - 2)
while True:
    total = candidate * (2 * a1 + (candidate - 1) * d) / 2
    if total > 1200:
        smallest_n = candidate
        break
    candidate += 1

result = {
    "a": int(row25_seats),
    "b": int(total_25_rows),
    "c": int(smallest_n),
}
print(result)
""",
# 5: first negative term -- u1=45,d=-4 (retagged calculator gdc->none: a
# linear u_n<0 inequality doesn't genuinely need a GDC; code unchanged)
"""
from sympy import symbols, simplify, Eq, solve, ceiling, Rational

u1 = 45
d = -4

n = symbols('n', positive=True, integer=True)

un_expr = simplify(u1 + (n - 1) * d)

n_cont = symbols('n_cont', positive=True)
un_cont_expr = u1 + (n_cont - 1) * d
boundary = solve(Eq(un_cont_expr, 0), n_cont)[0]

if d < 0:
    first_n = int(ceiling(boundary)) if boundary != int(boundary) else int(boundary) + 1
else:
    first_n = int(ceiling(boundary)) if boundary != int(boundary) else int(boundary) + 1

while un_expr.subs(n, first_n) >= 0:
    first_n += 1
while first_n > 1 and un_expr.subs(n, first_n - 1) < 0:
    first_n -= 1

first_negative_value = int(un_expr.subs(n, first_n))

result = {
    "a": str(un_expr),
    "b": {"n": first_n, "value": first_negative_value}
}

print(result)
""",
# 6: simultaneous sums -- S5=80, S8=188
"""
import sympy as sp

u1, d, n = sp.symbols('u1 d n')

def S(n_val):
    return sp.simplify(sp.Rational(n_val, 2) * (2*u1 + (n_val - 1)*d))

S5_expr = sp.expand(S(5))
S8_expr = sp.expand(S(8))

part_a = {
    "S5": str(S5_expr),
    "S8": str(S8_expr),
}

eq1 = sp.Eq(S5_expr, 80)
eq2 = sp.Eq(S8_expr, 188)

sol = sp.solve([eq1, eq2], [u1, d], dict=True)[0]

u1_val = sol[u1]
d_val = sol[d]

part_b = {
    "u1": int(u1_val) if u1_val == int(u1_val) else float(u1_val),
    "d": int(d_val) if d_val == int(d_val) else float(d_val),
}

result = {"a": part_a, "b": part_b}
print(result)
""",
# 7: integer d threshold -- u1=10,u11=50 (was u1=12,u11=35,d=2.3; replaced
# with integer-d values and retagged calculator gdc->none, since a linear
# u_n threshold doesn't genuinely need a GDC regardless of d)
"""
from sympy import symbols, Eq, solve, Rational
from math import ceil, floor

n, d = symbols('n d')

u1 = 10
u11 = 50

d_val = solve(Eq(u1 + (11 - 1) * d, u11), d)[0]

n_sym = symbols('n_sym', positive=True)
expr = u1 + (n_sym - 1) * d_val
boundary = solve(Eq(expr, 75), n_sym)[0]

candidate = floor(boundary) + 1
if u1 + (candidate - 1) * d_val <= 75:
    candidate += 1

a_ans = d_val
b_ans = candidate

print({"a": a_ans, "b": b_ans})
""",
# 8: odd number sum proof
"""
from sympy import symbols, simplify, summation, Eq

n, k = symbols('n k', positive=True, integer=True)

kth_odd_term = 2*k - 1

general_sum = summation(kth_odd_term, (k, 1, n))
general_sum_simplified = simplify(general_sum)

claimed_expression = n**2
matches_claim = simplify(general_sum_simplified - claimed_expression) == 0

sum_first_30 = general_sum_simplified.subs(n, 30)

result = {
    "a": bool(matches_claim),
    "b": int(sum_first_30)
}

print(result)
""",
# 9: product condition quadratic -- d=4, u1*u3=9
"""
from sympy import symbols, Eq, solve, Rational

d = 4
u1 = symbols('u1', real=True)

u3 = u1 + (3 - 1) * d

eq = Eq(u1 * u3, 9)
sols_a = sorted(solve(eq, u1), key=lambda x: float(x))

results_b = []
for val in sols_a:
    u7 = val + (7 - 1) * d
    results_b.append(u7)
results_b = sorted(results_b, key=lambda x: float(x))

answer = {
    "a": sols_a,
    "b": results_b
}

print(answer)
""",
# 10: symmetric 3-term AP -- sum=21, sumsq=155
"""
from sympy import symbols, Eq, solve

a, d = symbols('a d', real=True)

t1, t2, t3 = a - d, a, a + d

eq_sum = Eq(t1 + t2 + t3, 21)

a_solution = solve(eq_sum, a)[0]

eq_sq = Eq(t1**2 + t2**2 + t3**2, 155)

eq_sq_sub = eq_sq.subs(a, a_solution)
d_solutions = sorted(solve(eq_sq_sub, d))

result = {
    "a": a_solution,
    "b": d_solutions
}

print(result)
""",
# 11: two-sequence crossing n -- SnA=3n^2+2n, SnB=n^2+8n
"""
import sympy as sp

n = sp.symbols('n', positive=True, integer=True)

S_A = 3*n**2 + 2*n
S_B = n**2 + 8*n

def nth_term(S_expr, n_sym):
    S_prev = S_expr.subs(n_sym, n_sym - 1)
    a_n = sp.expand(S_expr - S_prev)
    return a_n

a_A = nth_term(S_A, n)
a_B = nth_term(S_B, n)

assert sp.simplify(S_A.subs(n, 0)) == 0
assert sp.simplify(S_B.subs(n, 0)) == 0

un_A = sp.simplify(a_A)
un_B = sp.simplify(a_B)

sol = sp.solve(sp.Eq(un_A, un_B), n)
if len(sol) == 1:
    val = sol[0]
    if val.is_Integer:
        n_value = int(val)
    else:
        n_value = sp.nsimplify(val)
else:
    n_value = [s for s in sol]

result = {
    "a": {"un_A": str(un_A), "un_B": str(un_B)},
    "b": n_value
}

print(result)
""",
# 12: salary crossing -- Deborah a1=2000,d=300 vs Edward a1=2800,d=150
"""
import sympy as sp

n = sp.symbols('n', positive=True, integer=True)

deborah_year1 = 2000
deborah_diff = 300
edward_year1 = 2800
edward_diff = 150

deborah_expr = deborah_year1 + deborah_diff * (n - 1)
edward_expr = edward_year1 + edward_diff * (n - 1)

deborah_expr_simplified = sp.expand(deborah_expr)
edward_expr_simplified = sp.expand(edward_expr)

n_real = sp.symbols('n_real', real=True)
deborah_real = deborah_year1 + deborah_diff * (n_real - 1)
edward_real = edward_year1 + edward_diff * (n_real - 1)

solution_set = sp.solve_univariate_inequality(deborah_real > edward_real, n_real, relational=False)

first_year = None
candidate = 1
while candidate <= 10000:
    if deborah_year1 + deborah_diff * (candidate - 1) > edward_year1 + edward_diff * (candidate - 1):
        first_year = candidate
        break
    candidate += 1

result = {
    "a": {
        "Deborah": str(deborah_expr_simplified),
        "Edward": str(edward_expr_simplified),
    },
    "b": first_year,
}

print(result)
""",
# (index 13 was cb9e2803's "savings plan crossing" check_code -- removed
# along with the question: it was both over the P08 pattern cap and a
# near-twin of 3c160636's "A overtakes B" shape. See
# bespoke_questions_aa1_2.py's comment at the same spot.)
# 14 (now 13): integer d sum threshold -- u1=8,u11=68 (was u1=10,u11=35,d=2.5;
# replaced with integer-d values; still genuinely GDC-necessitating since
# the threshold is on S_n, quadratic in n)
"""
from fractions import Fraction

u1 = Fraction(8)
n_ref = 11
u_ref = Fraction(68)

d = (u_ref - u1) / (n_ref - 1)

def S(n):
    return Fraction(n, 2) * (2 * u1 + (n - 1) * d)

n = 1
while S(n) <= 900:
    n += 1

smallest_n = n

def simplify_value(x):
    if isinstance(x, Fraction):
        if x.denominator == 1:
            return int(x)
        return float(x)
    return x

result = {
    "a": simplify_value(d),
    "b": simplify_value(smallest_n),
}

print(result)
""",
]
