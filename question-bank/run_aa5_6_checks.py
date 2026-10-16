"""Consolidated check run over all AA5.6 questions in batch_id='prod_aa5_6'
(6 template Section A + 3 bespoke Section B, rebuilt after the Rule 6 /
monotonicity / template-leak / triviality correction round). Template
rows self-report PASS/FAIL (runner.run_check, self-authored + self-
verifying). Bespoke rows' check_code was independently written (see
check_code_bespoke_aa5_6.py); the comparison against the stored answer
is in run_bespoke_aa5_6_checks.py's validators -- this script re-runs
that and folds the verdict into check_status/check_log/last_checked_at
here too, so bank.db always reflects the latest run."""
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from runner import run_check
from run_bespoke_aa5_6_checks import main as run_bespoke_main, VALIDATORS
from check_code_bespoke_aa5_6 import CHECK_CODE
from run_bespoke_checks import run_bespoke_code

DB_PATH = Path(__file__).parent / "bank.db"
BATCH_ID = "prod_aa5_6"


def main():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    tmpl_rows = conn.execute(
        "select id, blueprint_cell, check_code from questions where batch_id=? and mode='template' order by rowid",
        (BATCH_ID,),
    ).fetchall()
    bespoke_rows = conn.execute(
        "select id, blueprint_cell, check_code from questions where batch_id=? and mode='bespoke' order by rowid",
        (BATCH_ID,),
    ).fetchall()
    assert len(tmpl_rows) == 6 and len(bespoke_rows) == 3, \
        f"expected 6 template + 3 bespoke, found {len(tmpl_rows)} + {len(bespoke_rows)}"

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    results = []
    for row in tmpl_rows:
        result = run_check(row["check_code"])
        conn.execute(
            "update questions set check_status=?, check_log=?, last_checked_at=? where id=?",
            (result["status"], json.dumps({"stdout": result["stdout"], "stderr": result["stderr"]}), now, row["id"]),
        )
        results.append((row["blueprint_cell"], result["status"], ""))

    for i, row in enumerate(bespoke_rows):
        exec_result = run_bespoke_code(row["check_code"])
        if not exec_result["ok"]:
            status, detail = "error", exec_result["error"]
        else:
            try:
                passed, detail = VALIDATORS[i](exec_result["computed"])
                status = "passed" if passed else "failed"
            except Exception as e:
                status, detail = "error", f"validator raised {type(e).__name__}: {e}"
        conn.execute(
            "update questions set check_status=?, check_log=?, last_checked_at=? where id=?",
            (status, json.dumps({"detail": detail}), now, row["id"]),
        )
        results.append((row["blueprint_cell"], status, detail))

    conn.commit()

    print(f"{'blueprint_cell':30s} status    detail")
    for cell, status, detail in results:
        print(f"{cell:30s} {status:9s} {detail}")

    by_status = conn.execute(
        "select check_status, count(*) from questions where batch_id=? group by check_status", (BATCH_ID,)
    ).fetchall()
    print(f"\nSummary (check_status, count): {[tuple(r) for r in by_status]}")
    conn.close()


if __name__ == "__main__":
    main()
