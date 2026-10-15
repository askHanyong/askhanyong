"""The ONLY sanctioned way to edit an existing question row in bank.db.

Mandatory pipeline rule: any edit to a question's content fields
(stem_latex, parts_json, check_code, total_marks, calculator, paper_type,
level, blueprint_cell) MUST reset check_status to 'pending' and clear
check_log, so a stale 'passed' verdict can never survive an edit without
being re-verified. update_question() enforces this unconditionally --
there is no parameter to skip it -- so it is not possible to touch a
question's content via this function and leave its old check_status in
place by omission.
"""
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "bank.db"

# Fields whose change invalidates a prior check_status/check_log verdict.
CONTENT_FIELDS = {
    "stem_latex", "parts_json", "check_code", "total_marks",
    "calculator", "paper_type", "level", "blueprint_cell", "section",
}


def update_question(conn: sqlite3.Connection, qid: str, **fields) -> None:
    """Updates the given fields on question `qid`. If any CONTENT_FIELDS
    key is present, check_status is forced to 'pending' and check_log to
    NULL as part of the same statement, regardless of whether the caller
    also passed check_status/check_log explicitly (those are ignored --
    pending/NULL always wins on a content edit)."""
    if not fields:
        return
    touches_content = bool(CONTENT_FIELDS & fields.keys())
    fields = dict(fields)
    if touches_content:
        fields["check_status"] = "pending"
        fields["check_log"] = None
    set_clause = ", ".join(f"{k}=?" for k in fields)
    values = list(fields.values()) + [qid]
    conn.execute(f"update questions set {set_clause} where id=?", values)


def flag_for_review(conn: sqlite3.Connection, qid: str, note: str) -> None:
    """Sets review_status='pending' (the schema's CHECK constraint only
    allows pending/approved/rejected -- there is no separate 'flagged'
    value) with the flag detail in review_note, WITHOUT touching
    check_status -- a review flag is a human-judgment request, not a
    content edit, so it must not invalidate an already-passed math/QA
    verdict."""
    conn.execute("update questions set review_status='pending', review_note=? where id=?", (note, qid))
