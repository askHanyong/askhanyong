"""Replaces the old 60 AA1.2 template rows (pre-cap, with the sigma/
factory/unit/idx_a=1 bugs) with the new 24 (3-variant-per-template cap,
all bugs fixed). Only touches mode='template' rows in batch_id='prod_aa1_2'
-- the 20 bespoke rows are untouched by this script.
"""
import json
import sqlite3
import uuid
from pathlib import Path

from templates_aa1_2 import build_all_aa1_2_templates
from runner import run_check

DB_PATH = Path(__file__).parent / "bank.db"
BATCH_ID = "prod_aa1_2"


def main():
    conn = sqlite3.connect(DB_PATH)
    old_ids = [r[0] for r in conn.execute(
        "select id from questions where batch_id=? and mode='template'", (BATCH_ID,)
    ).fetchall()]
    conn.execute("delete from questions where batch_id=? and mode='template'", (BATCH_ID,))
    print(f"Deleted {len(old_ids)} old template rows.")

    questions = build_all_aa1_2_templates()
    for q in questions:
        check_result = run_check(q["check_code"])
        qid = f"prod_aa1_2_tmpl_{uuid.uuid4().hex[:8]}"
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

    conn.commit()
    n = conn.execute("select count(*) from questions where batch_id=? and mode='template'", (BATCH_ID,)).fetchone()[0]
    by_status = conn.execute(
        "select check_status, count(*) from questions where batch_id=? and mode='template' group by check_status", (BATCH_ID,)
    ).fetchall()
    by_cell = conn.execute(
        "select blueprint_cell, count(*) from questions where batch_id=? and mode='template' group by blueprint_cell", (BATCH_ID,)
    ).fetchall()
    print(f"\n{n} new template rows inserted. By check_status: {dict(by_status)}")
    print("By blueprint_cell:")
    for cell, count in by_cell:
        print(f"  {cell}: {count}")
    conn.close()


if __name__ == "__main__":
    main()
