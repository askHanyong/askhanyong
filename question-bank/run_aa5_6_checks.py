"""Consolidated check run over all AA5.6 questions in batch_id='prod_aa5_6'
(30 template, 0 bespoke -- this batch is template-only, so there is no
independence concern: I authored both the questions and their check_code,
but every check_code re-derives the claimed result from a fresh SymPy
symbolic computation, never a hardcoded PASS. Updates check_status/
check_log/last_checked_at in bank.db."""
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from runner import run_check

DB_PATH = Path(__file__).parent / "bank.db"
BATCH_ID = "prod_aa5_6"


def main():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "select id, mode, blueprint_cell, check_code from questions where batch_id=? order by rowid",
        (BATCH_ID,),
    ).fetchall()
    assert len(rows) == 30, f"expected 30 rows, found {len(rows)}"

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    results = []
    for row in rows:
        result = run_check(row["check_code"])
        conn.execute(
            "update questions set check_status=?, check_log=?, last_checked_at=? where id=?",
            (result["status"], json.dumps({"stdout": result["stdout"], "stderr": result["stderr"]}), now, row["id"]),
        )
        results.append((row["blueprint_cell"], result["status"]))

    conn.commit()

    print(f"{'blueprint_cell':35s} status")
    for cell, status in results:
        print(f"{cell:35s} {status}")

    by_status = conn.execute(
        "select check_status, count(*) from questions where batch_id=? group by check_status", (BATCH_ID,)
    ).fetchall()
    print(f"\nSummary (check_status, count): {[tuple(r) for r in by_status]}")
    conn.close()


if __name__ == "__main__":
    main()
