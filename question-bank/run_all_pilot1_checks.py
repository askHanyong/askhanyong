"""Consolidated check run over all 20 batch_id='pilot1' questions (8 template
+ 12 bespoke). Updates check_status/check_log in bank.db for every row.

Template rows: check_code self-reports PASS/FAIL (runner.run_check) -- no
independence concern, I wrote both the question and the check.

Bespoke rows: check_code was written by an independent subagent that saw
ONLY the stem/parts, and it prints its OWN independently-computed answer
(a dict), never a PASS/FAIL verdict -- there is nothing for it to compare
against. The comparison against my stored answer happens HERE, after the
independent computation already exists, via an explicit per-question
validator (not a generic string/equality match -- several stored answers
are algebraically equivalent to, but differently formatted from, what the
independent code naturally returns, e.g. "11/3" vs a LaTeX \\dfrac, or an
unordered dict of (payout: probability) pairs). Each validator is a
straight, auditable comparison of the actual numbers/relations claimed by
each -- it does not special-case away the one real discrepancy found
(AA5.8 cost, index 11): see validate_11.
"""
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from sympy import Rational, simplify, sympify

from runner import run_check
from run_bespoke_checks import run_bespoke_code

DB_PATH = Path(__file__).parent / "bank.db"
BATCH_ID = "pilot1"


def _req(d, *path):
    cur = d
    for p in path:
        cur = cur[p]
    return cur


def validate_0(c):  # AA1.2 SL none: u1=5,d=3,last=86 -> n=28, sum=1274
    return c["a"] == 28 and c["b"] == 1274, f"n={c['a']},sum={c['b']}"


def validate_1(c):  # AA1.2 SL gdc: two-company revenue crossing -> A=25n^2+175n,B=10n^2+390n,n=15
    a = c["a"]
    a_match = simplify(sympify(a["A"]) - sympify("25*n**2+175*n")) == 0
    b_match = simplify(sympify(a["B"]) - sympify("10*n**2+390*n")) == 0
    return a_match and b_match and c["b"] == 15, \
        f"A={a['A']} (match: {a_match}), B={a['B']} (match: {b_match}), n={c['b']}"


def validate_2(c):  # AA1.2 HL none: multiples of 7 in [100,300] -> smallest=105,largest=294,n=28,sum=5586
    a = c["a"]
    return a["smallest"] == 105 and a["largest"] == 294 and c["b"] == 28 and c["c"] == 5586, \
        f"smallest={a['smallest']},largest={a['largest']},n={c['b']},sum={c['c']}"


def validate_3(c):  # AA1.2 HL gdc: Hanyong savings -> u12=215, n=18
    return c["a"] == 215 and c["b"] == 18, f"u12={c['a']},n={c['b']}"


def validate_4(c):  # AA1.2 HL gdc: Sn=n^2+3n -> u1=4,u2=6,d=2,u10=22,n0(S_n>300)=16
    a = c["a"]
    return a["u1"] == 4 and a["u2"] == 6 and a["d"] == 2 and c["b"] == 22 and c.get("c") == 16, \
        f"u1={a['u1']},u2={a['u2']},d={a['d']},u10={c['b']},n0={c.get('c')}"


def validate_5(c):  # AA2.7 SL gdc: discriminant=17, real distinct
    return c["a"] == 17 and "real" in c["b"].lower() and "distinct" in c["b"].lower(), \
        f"discriminant={c['a']},nature={c['b']}"


def validate_6(c):  # AA4.7 SL none: p=0.4, E(X)=2.6
    return abs(c["a"] - 0.4) < 1e-9 and abs(c["b"] - 2.6) < 1e-9, f"p={c['a']},E(X)={c['b']}"


def validate_7(c):  # AA4.7 SL gdc: k=1/15, E(Y)=11/3
    k_match = simplify(sympify(c["a"]) - Rational(1, 15)) == 0
    e_match = simplify(sympify(c["b"]) - Rational(11, 3)) == 0
    return k_match and e_match, f"k={c['a']} (==1/15: {k_match}), E(Y)={c['b']} (==11/3: {e_match})"


def validate_8(c):  # AA4.7 HL none: dice game -> dist {15:1/6,-3:1/3,-5:1/2}, E(X)=-1, favors organizer
    a = c["a"]
    expected = {15: Rational(1, 6), -3: Rational(1, 3), -5: Rational(1, 2)}
    dist_ok = len(a) == 3 and all(
        any(int(k) == ek and simplify(sympify(v) - ev) == 0 for ek, ev in expected.items())
        for k, v in a.items()
    )
    e_match = simplify(sympify(c["b"]["E_X"]) - (-1)) == 0
    favors_ok = c["b"]["favors"] == "organizer"
    return dist_ok and e_match and favors_ok, f"dist={a}, E(X)={c['b']['E_X']}, favors={c['b']['favors']}"


def validate_9(c):  # AA4.7 HL gdc: c=0.4, P(2<=Z<=4)=0.58
    return abs(c["a"] - 0.4) < 1e-9 and abs(c["b"] - 0.58) < 1e-9, f"c={c['a']},P(2<=Z<=4)={c['b']}"


def validate_10(c):  # AA4.7 HL gdc: E(W)=1.1, E(T)=15
    return abs(c["a"] - 1.1) < 1e-9 and abs(c["b"] - 15) < 1e-9, f"E(W)={c['a']},E(T)={c['b']}"


def validate_11(c):  # AA5.8 SL gdc: cost formula matches (a=True), r=5.65, min_cost=30.05 (corrected after human review)
    a_ok = c["a"] is True
    r_ok = abs(c["b"]["r"] - 5.65) < 1e-6
    stored_min_cost = 30.05
    computed_min_cost = c["b"]["min_cost"]
    cost_match = abs(computed_min_cost - stored_min_cost) < 1e-9
    detail = (
        f"formula_matches={c['a']}, r={c['b']['r']} (stored 5.65: {r_ok}), "
        f"computed min_cost={computed_min_cost} vs stored min_cost={stored_min_cost} (match: {cost_match}). "
        f"Stored answer was originally $30.04 (my authoring arithmetic error); independently "
        f"re-verified at high precision -- exact value is 54*pi/180**(1/3) = 30.0459..., which rounds "
        f"to $30.05. Human-reviewed and corrected to $30.05 on 2026-10-14."
    )
    return (a_ok and r_ok and cost_match), detail


VALIDATORS = [
    validate_0, validate_1, validate_2, validate_3, validate_4, validate_5,
    validate_6, validate_7, validate_8, validate_9, validate_10, validate_11,
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
    assert len(template_rows) == 8 and len(bespoke_rows) == 12, \
        f"expected 8 template + 12 bespoke, found {len(template_rows)} + {len(bespoke_rows)}"
    rows = template_rows + bespoke_rows

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    bespoke_idx = 0
    results = []
    for row in rows:
        if row["mode"] == "template":
            result = run_check(row["check_code"])
            old_params = {}
            try:
                old_log = json.loads(row["check_log"]) if row["check_log"] else {}
                old_params = old_log.get("params", {}) if isinstance(old_log, dict) else {}
            except (json.JSONDecodeError, TypeError):
                old_params = {}
            conn.execute(
                "update questions set check_status=?, check_log=?, last_checked_at=? where id=?",
                (result["status"], json.dumps({"params": old_params, "stdout": result["stdout"], "stderr": result["stderr"]}), now, row["id"]),
            )
            results.append((row["mode"], row["blueprint_cell"], result["status"], result["stdout"].strip().split("\n")[-1] if result["stdout"].strip() else ""))
        else:
            exec_result = run_bespoke_code(row["check_code"])
            if not exec_result["ok"]:
                status = "error"
                detail = exec_result["error"]
            else:
                computed = exec_result["computed"]
                validator = VALIDATORS[bespoke_idx]
                try:
                    passed, detail = validator(computed)
                    status = "passed" if passed else "failed"
                except Exception as e:
                    status = "error"
                    detail = f"validator raised {type(e).__name__}: {e}"
            bespoke_idx += 1
            conn.execute(
                "update questions set check_status=?, check_log=?, last_checked_at=? where id=?",
                (status, json.dumps({"detail": detail}), now, row["id"]),
            )
            results.append((row["mode"], row["blueprint_cell"], status, detail))

    conn.commit()

    print(f"{'mode':10s} {'blueprint_cell':30s} {'status':8s} detail")
    for mode, cell, status, detail in results:
        print(f"{mode:10s} {cell:30s} {status:8s} {detail}")

    by_mode_status = conn.execute(
        "select mode, check_status, count(*) from questions where batch_id=? group by mode, check_status", (BATCH_ID,)
    ).fetchall()
    print(f"\nSummary (mode, check_status, count): {by_mode_status}")
    conn.close()


if __name__ == "__main__":
    main()
