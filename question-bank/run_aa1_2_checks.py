"""Consolidated check run over all AA1.2 questions in batch_id='prod_aa1_2'
(60 template + 15 bespoke). Updates check_status/check_log in bank.db.

Template rows: check_code self-reports PASS/FAIL (runner.run_check).
Bespoke rows: check_code was written by an independent subagent (stem/parts
only) and prints its OWN computed answer; the comparison against the
stored answer happens here via an explicit per-question validator.
"""
import json
import sqlite3
from pathlib import Path

from sympy import Rational, simplify, sympify

from runner import run_check
from run_bespoke_checks import run_bespoke_code

DB_PATH = Path(__file__).parent / "bank.db"
BATCH_ID = "prod_aa1_2"


def _num_eq(a, b, tol=1e-9):
    return abs(float(a) - float(b)) < tol


def validate_0(c):  # Gauss pairing: d=4, sum=987
    return c["a"] == 4 and c["b"] == 987, f"d={c['a']}, sum={c['b']}"


def validate_1(c):  # membership: 100 is a term, 101 is not
    return c["a"] is True and c["b"] is False, f"100 is term: {c['a']}, 101 is term: {c['b']}"


def validate_2(c):  # ratio condition: d=4, u1=6, u15=62
    a = c["a"]
    return a["d"] == 4 and a["u1"] == 6 and c["b"] == 62, f"d={a['d']}, u1={a['u1']}, u15={c['b']}"


def validate_3(c):  # two-sum: u1=2, d=4, u15=58
    a = c["a"]
    return a["u1"] == 2 and a["d"] == 4 and c["b"] == 58, f"u1={a['u1']}, d={a['d']}, u15={c['b']}"


def validate_4(c):  # theatre seats: u25=66, total=1050, n0(S_n>1200)=28
    return c["a"] == 66 and c["b"] == 1050 and c.get("c") == 28, \
        f"u25={c['a']}, total={c['b']}, n0={c.get('c')}"


def validate_5(c):  # first negative term: expr equiv to 45-4(n-1), n=13, value=-3
    expr_match = simplify(sympify(c["a"]) - sympify("45-4*(n-1)")) == 0
    b = c["b"]
    return expr_match and b["n"] == 13 and b["value"] == -3, \
        f"expr={c['a']} (equiv to 45-4(n-1): {expr_match}), n={b['n']}, value={b['value']}"


def validate_6(c):  # simultaneous sums: u1=6, d=5
    b = c["b"]
    return b["u1"] == 6 and b["d"] == 5, f"u1={b['u1']}, d={b['d']}"


def validate_7(c):  # integer d: d=4, n=18 (was d=2.3, n=22; retagged gdc->none)
    return c["a"] == 4 and c["b"] == 18, f"d={c['a']}, n={c['b']}"


def validate_8(c):  # odd sum proof: True, 900
    return c["a"] is True and c["b"] == 900, f"formula_holds={c['a']}, sum30={c['b']}"


def validate_9(c):  # product condition: u1 in {-9,1}, u7 in {15,25} correspondingly
    a_sorted = sorted(float(x) for x in c["a"])
    b_sorted = sorted(float(x) for x in c["b"])
    return a_sorted == [-9.0, 1.0] and b_sorted == [15.0, 25.0], f"u1={c['a']}, u7={c['b']}"


def validate_10(c):  # symmetric 3-term: a=7, d in {-2,2}
    d_sorted = sorted(float(x) for x in c["b"])
    return c["a"] == 7 and d_sorted == [-2.0, 2.0], f"a={c['a']}, d={c['b']}"


def validate_11(c):  # two-sequence crossing: un_A=6n-1, un_B=2n+7, n=2
    a_match = simplify(sympify(c["a"]["un_A"]) - sympify("6*n-1")) == 0
    b_match = simplify(sympify(c["a"]["un_B"]) - sympify("2*n+7")) == 0
    return a_match and b_match and c["b"] == 2, \
        f"un_A={c['a']['un_A']} (==6n-1: {a_match}), un_B={c['a']['un_B']} (==2n+7: {b_match}), n={c['b']}"


def validate_12(c):  # salary crossing: Deborah=300n+1700, Edward=150n+2650, n=7
    a = c["a"]
    d_match = simplify(sympify(a["Deborah"]) - sympify("300*n+1700")) == 0
    e_match = simplify(sympify(a["Edward"]) - sympify("150*n+2650")) == 0
    return d_match and e_match and c["b"] == 7, \
        f"Deborah={a['Deborah']} (match: {d_match}), Edward={a['Edward']} (match: {e_match}), n={c['b']}"


def validate_13(c):  # savings crossing: SA=50n^2+450n, SB=10n^2+990n, n=14
    a = c["a"]
    sa_match = simplify(sympify(a["SA"]) - sympify("50*n**2+450*n")) == 0
    sb_match = simplify(sympify(a["SB"]) - sympify("10*n**2+990*n")) == 0
    return sa_match and sb_match and c["b"] == 14, \
        f"SA={a['SA']} (match: {sa_match}), SB={a['SB']} (match: {sb_match}), n={c['b']}"


def validate_14(c):  # integer d: d=6, n=17 (was d=2.5, n=24)
    return c["a"] == 6 and c["b"] == 17, f"d={c['a']}, n={c['b']}"


VALIDATORS = [
    validate_0, validate_1, validate_2, validate_3, validate_4, validate_5, validate_6,
    validate_7, validate_8, validate_9, validate_10, validate_11, validate_12, validate_13, validate_14,
]


def main():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    template_rows = conn.execute(
        "select id, mode, blueprint_cell, check_code, check_log from questions "
        "where batch_id=? and mode='template' order by rowid",
        (BATCH_ID,),
    ).fetchall()
    bespoke_rows = conn.execute(
        "select id, mode, blueprint_cell, check_code from questions "
        "where batch_id=? and mode='bespoke' order by rowid",
        (BATCH_ID,),
    ).fetchall()
    assert len(template_rows) == 24 and len(bespoke_rows) == 15, \
        f"expected 24 template (post-cap) + 15 bespoke, found {len(template_rows)} + {len(bespoke_rows)}"

    results = []
    for row in template_rows:
        result = run_check(row["check_code"])
        old_params = {}
        try:
            old_log = json.loads(row["check_log"]) if row["check_log"] else {}
            old_params = old_log.get("params", {}) if isinstance(old_log, dict) else {}
        except (json.JSONDecodeError, TypeError):
            old_params = {}
        conn.execute(
            "update questions set check_status=?, check_log=? where id=?",
            (result["status"], json.dumps({"params": old_params, "stdout": result["stdout"], "stderr": result["stderr"]}), row["id"]),
        )
        results.append(("template", row["blueprint_cell"], result["status"], ""))

    for i, row in enumerate(bespoke_rows):
        exec_result = run_bespoke_code(row["check_code"])
        if not exec_result["ok"]:
            status, detail = "error", exec_result["error"]
        else:
            computed = exec_result["computed"]
            try:
                passed, detail = VALIDATORS[i](computed)
                status = "passed" if passed else "failed"
            except Exception as e:
                status, detail = "error", f"validator raised {type(e).__name__}: {e}"
        conn.execute(
            "update questions set check_status=?, check_log=? where id=?",
            (status, json.dumps({"detail": detail}), row["id"]),
        )
        results.append(("bespoke", row["blueprint_cell"], status, detail))

    conn.commit()

    print(f"{'mode':10s} {'blueprint_cell':30s} {'status':8s} detail")
    for mode, cell, status, detail in results:
        print(f"{mode:10s} {cell:30s} {status:8s} {detail}")

    by_mode_status = conn.execute(
        "select mode, check_status, count(*) from questions where batch_id=? group by mode, check_status", (BATCH_ID,)
    ).fetchall()
    print(f"\nSummary (mode, check_status, count): {[tuple(r) for r in by_mode_status]}")
    conn.close()


if __name__ == "__main__":
    main()
