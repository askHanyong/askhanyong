"""Inserts the 8 template pilot questions into bank.db's `questions` table,
runs each one's check via runner.run_check, and sets check_status/check_log
accordingly. Real pilot data -- batch_id='pilot1' -- not synthetic test rows.

The 12 bespoke questions (AA1.2 x5, AA4.7 x5, AA2.7 x1, AA5.8 x1) are NOT
included here -- blocked on an ANTHROPIC_API_KEY, which this fresh
container doesn't have (no .env, no `ant` CLI, no env var). See the task
report for what's still needed.
"""
import json
import sqlite3
import uuid
from pathlib import Path

from templates import build_all_templates
from runner import run_check

DB_PATH = Path(__file__).parent / "bank.db"
BATCH_ID = "pilot1"


def main():
    conn = sqlite3.connect(DB_PATH)
    questions = build_all_templates()

    for q in questions:
        check_result = run_check(q["check_code"])
        qid = f"pilot1_tmpl_{uuid.uuid4().hex[:8]}"
        conn.execute(
            """insert into questions
               (id, level, paper_type, calculator, section, total_marks, topic_code,
                blueprint_cell, mode, difficulty, stem_latex, parts_json, check_code,
                check_status, check_log, review_status, review_note, mock_reserved, batch_id)
               values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                qid, q["level"], q["paper_type"], q["calculator"], q["section"], q["total_marks"],
                q["topic_code"], q["blueprint_cell"], q["mode"], q["difficulty"],
                q["stem_latex"], q["parts_json"], q["check_code"],
                check_result["status"],
                json.dumps({"params": q["params"], "stdout": check_result["stdout"], "stderr": check_result["stderr"]}),
                "pending", None, 0, BATCH_ID,
            ),
        )
        print(f"{qid}  {q['blueprint_cell']:28s} -> {check_result['status']}")

    conn.commit()
    n = conn.execute("select count(*) from questions where batch_id=?", (BATCH_ID,)).fetchone()[0]
    by_status = conn.execute(
        "select check_status, count(*) from questions where batch_id=? group by check_status", (BATCH_ID,)
    ).fetchall()
    print(f"\n{n} rows inserted under batch_id='{BATCH_ID}'. By check_status: {dict(by_status)}")
    conn.close()


if __name__ == "__main__":
    main()
