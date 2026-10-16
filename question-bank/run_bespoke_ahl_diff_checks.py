"""Validates the 1 AHL-differentiation bespoke question's independently-
computed check_code output against the stored answers, same convention
as run_bespoke_aa5_6_checks.py."""
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from bespoke_questions_ahl_diff import build_all_ahl_diff_bespoke
from check_code_bespoke_ahl_diff import CHECK_CODE
from run_bespoke_checks import run_bespoke_code

DB_PATH = Path(__file__).parent / "bank.db"


def validate_0(c):  # arcsin derivative proof
    a_ok = c["a"] == "sin(y)=x confirmed equivalent"
    b_ok = c["b"][1] is True
    c_ok = c["c"] is True
    d_ok = c["d"][1] is True
    e_ok = c["e"].replace(" ", "") == "2/sqrt(1-4*x**2)"
    f_ok = c["f"].replace(" ", "") == "y=x"
    detail = f"a={c['a']}, b={c['b']}, c={c['c']}, d={c['d']}, e={c['e']}, f={c['f']}"
    return (a_ok and b_ok and c_ok and d_ok and e_ok and f_ok), detail


VALIDATORS = [validate_0]


def main():
    qs = build_all_ahl_diff_bespoke()
    assert len(qs) == len(CHECK_CODE) == len(VALIDATORS) == 1

    conn = sqlite3.connect(DB_PATH)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    results = []
    for i, (q, code) in enumerate(zip(qs, CHECK_CODE)):
        exec_result = run_bespoke_code(code)
        if not exec_result["ok"]:
            status, detail = "error", exec_result["error"]
        else:
            try:
                passed, detail = VALIDATORS[i](exec_result["computed"])
                status = "passed" if passed else "failed"
            except Exception as e:
                status, detail = "error", f"validator raised {type(e).__name__}: {e}"
        results.append((q["blueprint_cell"], status, detail))
        print(f"[{i}] {q['blueprint_cell']}: {status}\n    {detail}")

    conn.close()
    return results


if __name__ == "__main__":
    main()
