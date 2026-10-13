"""Creates bank.db with the schema from the brief and loads the `skeletons`
table from the one-off Supabase past-paper structural export (approved
query, run via execute_sql). Reads the saved tool-result file directly --
the export is ~1.75M chars, too large to round-trip through chat context.

Usage: python3 -I init_and_load_skeletons.py <result_file_path>
"""
import json
import re
import sqlite3
import sys
from pathlib import Path

RESULT_FILE = sys.argv[1]
DB_PATH = Path(__file__).parent / "bank.db"

SCHEMA = """
create table if not exists skeletons (
  id integer primary key autoincrement,
  part_id text not null,
  question_id text not null,
  question_number integer not null,
  part_label text not null,
  order_index integer not null,
  marks integer not null,
  command_term text,
  depends_on_part_id text,
  has_diagram integer,
  level text not null,          -- paper level: SL/HL
  year integer not null,
  session text not null,        -- May/Nov
  paper_number integer not null,
  calculator_allowed integer not null,
  topic_code text,
  topic_subtopic_name text,
  topic_level_scope text,       -- topic's own SL/AHL scope (distinct from paper level above)
  topic_is_primary integer,
  marks_breakdown_json text,    -- mark-scheme line items (note, desc) for this part, structure only
  unique (part_id, topic_code)  -- a part can have multiple topic tags (fan-out from the join); not multiple rows per same tag
);

create table if not exists questions (
  id text primary key,
  level text not null check (level in ('SL','HL')),
  paper_type text not null check (paper_type in ('P1','P2','EXT','P3')),
  calculator text not null check (calculator in ('none','gdc')),
  section text not null check (section in ('A','B')),
  total_marks integer not null,
  topic_code text not null,
  blueprint_cell text not null,
  mode text not null check (mode in ('template','bespoke')),
  difficulty text,
  stem_latex text not null,
  parts_json text not null,     -- per-part text, marks, answer, mark-scheme lines
  check_code text,
  check_status text not null default 'pending' check (check_status in ('pending','passed','failed','error')),
  check_log text,
  review_status text not null default 'pending' check (review_status in ('pending','approved','rejected')),
  review_note text,
  mock_reserved integer not null default 0,
  created_at text not null default (datetime('now')),
  batch_id text not null
);
"""


def extract_rows(raw_text: str) -> list[dict]:
    outer = json.loads(raw_text)
    result_str = outer["result"]
    # Strip the tool's untrusted-data wrapper prose; the payload is the JSON
    # array between the opening and closing <untrusted-data-...> tags.
    m = re.search(r"<untrusted-data-[0-9a-f-]+>\n(.*)\n</untrusted-data-[0-9a-f-]+>", result_str, re.DOTALL)
    if not m:
        raise ValueError("Could not find <untrusted-data-...> payload in result file")
    return json.loads(m.group(1))


def main():
    raw_text = Path(RESULT_FILE).read_text()
    rows = extract_rows(raw_text)
    print(f"Parsed {len(rows)} skeleton rows from the export.")

    conn = sqlite3.connect(DB_PATH)
    conn.executescript(SCHEMA)

    inserted = 0
    skipped_dupe = 0
    for r in rows:
        try:
            conn.execute(
                """insert into skeletons
                   (part_id, question_id, question_number, part_label, order_index, marks,
                    command_term, depends_on_part_id, has_diagram, level, year, session,
                    paper_number, calculator_allowed, topic_code, topic_subtopic_name,
                    topic_level_scope, topic_is_primary, marks_breakdown_json)
                   values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    r["part_id"], r["question_id"], r["question_number"], r["part_label"], r["order_index"],
                    r["marks"], r["command_term"], r["depends_on_part_id"],
                    1 if r["has_diagram"] else (0 if r["has_diagram"] is not None else None),
                    r["level"], r["year"], r["session"], r["paper_number"],
                    1 if r["calculator_allowed"] else 0,
                    r["topic_code"], r["topic_subtopic_name"], r["topic_level_scope"],
                    (1 if r["topic_is_primary"] else 0) if r["topic_is_primary"] is not None else None,
                    json.dumps(r["marks_breakdown"]) if r["marks_breakdown"] is not None else None,
                ),
            )
            inserted += 1
        except sqlite3.IntegrityError:
            skipped_dupe += 1
    conn.commit()

    total = conn.execute("select count(*) from skeletons").fetchone()[0]
    distinct_parts = conn.execute("select count(distinct part_id) from skeletons").fetchone()[0]
    untagged = conn.execute("select count(*) from skeletons where topic_code is null").fetchone()[0]
    print(f"Inserted {inserted} rows ({skipped_dupe} exact (part_id, topic_code) duplicates skipped).")
    print(f"skeletons table now has {total} rows covering {distinct_parts} distinct question_parts ({untagged} rows with no topic tag at all).")
    conn.close()


if __name__ == "__main__":
    main()
