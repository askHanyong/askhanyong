"""Validates the 3 AA5.6 bespoke questions' independently-computed
check_code output (check_code_bespoke_aa5_6.py) against the stored
answers (bespoke_questions_aa5_6.py), same convention as
run_all_pilot1_checks.py / run_aa1_2_checks.py's bespoke branch.
"""
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from sympy import Rational, simplify, sympify

from bespoke_questions_aa5_6 import build_all_aa5_6_bespoke
from check_code_bespoke_aa5_6 import CHECK_CODE
from run_bespoke_checks import run_bespoke_code

DB_PATH = Path(__file__).parent / "bank.db"


def validate_0(c):  # product+chain, x^2 e^{2x}: roots {-1,0}, f''(0)=2 min, f''(-1)=-2/e^2 max, asymptote y=0
    b = c["b"]
    roots_ok = b["all_real_roots_of_f_prime"] == [-1.0, 0.0] and b["confirms_only_two_stationary_points"]
    d = c["d"]
    e = c["e"]
    d_ok = d["f_double_prime_at_0"] == 2.0 and d["nature"] == "local min"
    e_val = simplify(sympify(e["f_double_prime_at_neg1"]) - sympify("-2/exp(2)")) == 0
    e_ok = e_val and e["nature"] == "local max"
    f_ok = c["f"] == 0.0
    detail = f"roots={b['all_real_roots_of_f_prime']}, f''(0)={d['f_double_prime_at_0']} ({d['nature']}), f''(-1)={e['f_double_prime_at_neg1']} ({e['nature']}), asymptote={c['f']}"
    return (roots_ok and d_ok and e_ok and f_ok), detail


def validate_1(c):  # quotient, (x+3)/(x^2+16): stationary {-8,2}, f(2)=1/4, f(-8)=-1/16, nature min/max, tangent x/16+3/16
    b_sorted = sorted(float(v) for v in c["b"])
    b_ok = b_sorted == [-8.0, 2.0]
    cc = c["c"]
    c_ok = simplify(sympify(cc["f(2)"]) - Rational(1, 4)) == 0 and simplify(sympify(cc["f(-8)"]) - Rational(-1, 16)) == 0
    # c["b"] order determines which nature corresponds to which point
    order = [float(v) for v in c["b"]]
    nature_by_point = dict(zip(order, c["d"]))
    d_ok = nature_by_point.get(-8.0) == "local min" and nature_by_point.get(2.0) == "local max"
    e_ok = simplify(sympify(c["e"]) - sympify("x/16 + 3/16")) == 0
    detail = f"stationary={c['b']}, f(2)/f(-8)={cc}, nature={c['d']}, tangent={c['e']}"
    return (b_ok and c_ok and d_ok and e_ok), detail


def validate_2(c):  # double angle, sin^2(2x): f'=2sin(4x) confirmed, f''=8cos(4x), zeros {0,pi/4,pi/2}, nature min/max/min, range [0,1], max 1 at pi/4
    a_ok = c["a"]["matches_claimed_2sin4x"] is True
    b_ok = simplify(sympify(c["b"]) - sympify("8*cos(4*x)")) == 0
    c_sorted = sorted(sympify(v) for v in c["c"])
    c_ok = c_sorted == [sympify("0"), sympify("pi/4"), sympify("pi/2")]
    d_ok = c["d"] == ["local min", "local max", "local min"]
    e_ok = c["e"] == ["0", "1"]
    f_ok = sympify(c["f"][0]) == 1 and sympify(c["f"][1]) == sympify("pi/4")
    detail = f"f'_matches={c['a']['matches_claimed_2sin4x']}, f''={c['b']}, zeros={c['c']}, nature={c['d']}, range={c['e']}, max={c['f']}"
    return (a_ok and b_ok and c_ok and d_ok and e_ok and f_ok), detail


VALIDATORS = [validate_0, validate_1, validate_2]


def main():
    qs = build_all_aa5_6_bespoke()
    assert len(qs) == len(CHECK_CODE) == len(VALIDATORS) == 3

    conn = sqlite3.connect(DB_PATH)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    results = []
    for i, (q, code) in enumerate(zip(qs, CHECK_CODE)):
        exec_result = run_bespoke_code(code)
        if not exec_result["ok"]:
            status, detail = "error", exec_result["error"]
        else:
            computed = exec_result["computed"]
            try:
                passed, detail = VALIDATORS[i](computed)
                status = "passed" if passed else "failed"
            except Exception as e:
                status, detail = "error", f"validator raised {type(e).__name__}: {e}"
        results.append((q["blueprint_cell"], status, detail))
        print(f"[{i}] {q['blueprint_cell']}: {status}\n    {detail}")

    conn.close()
    return results


if __name__ == "__main__":
    main()
