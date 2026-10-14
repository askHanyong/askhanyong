"""Inserts the 12 bespoke pilot questions into bank.db's `questions` table as
mode='bespoke', check_status='pending' -- per instruction, insertion happens
BEFORE the consolidated check run (run_all_pilot1_checks.py does that part
and updates check_status/check_log in place).
"""
import json
import sqlite3
import uuid
from pathlib import Path

from bespoke_questions import build_all_bespoke
from check_code_bespoke import CHECK_CODE

DB_PATH = Path(__file__).parent / "bank.db"
BATCH_ID = "pilot1"


def main():
    conn = sqlite3.connect(DB_PATH)
    questions = build_all_bespoke()
    assert len(questions) == len(CHECK_CODE), f"{len(questions)} questions but {len(CHECK_CODE)} check_code entries"

    for q, code in zip(questions, CHECK_CODE):
        qid = f"pilot1_bespoke_{uuid.uuid4().hex[:8]}"
        conn.execute(
            """insert into questions
               (id, level, paper_type, calculator, section, total_marks, topic_code,
                blueprint_cell, mode, difficulty, stem_latex, parts_json, check_code,
                check_status, check_log, review_status, review_note, mock_reserved, batch_id)
               values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                qid, q["level"], q["paper_type"], q["calculator"], q["section"], q["total_marks"],
                q["topic_code"], q["blueprint_cell"], q["mode"], q["difficulty"],
                q["stem_latex"], json.dumps(q["parts"]), code,
                "pending", None, "pending", None, 0, BATCH_ID,
            ),
        )
        print(f"{qid}  {q['blueprint_cell']:28s} -> inserted (pending)")

    conn.commit()
    n = conn.execute("select count(*) from questions where batch_id=? and mode='bespoke'", (BATCH_ID,)).fetchone()[0]
    print(f"\n{n} bespoke rows inserted under batch_id='{BATCH_ID}', check_status='pending'.")
    conn.close()


if __name__ == "__main__":
    main()
