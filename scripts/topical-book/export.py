#!/usr/bin/env python3
"""Download the past-paper tables from Supabase into data/raw/<table>.json.

Needs SUPABASE_SERVICE_ROLE_KEY in the environment (never in a file).
SUPABASE_URL is optional and defaults to the askhanyong project.
Standard library only.
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_URL = "https://sdcuiartqzhooogwuttv.supabase.co"
TABLES = [
    "subjects",
    "syllabus_topics",
    "papers",
    "questions",
    "question_parts",
    "markscheme_parts",
    "part_topic_tags",
]
PAGE = 1000


def fetch_table(base, key, table):
    headers = {"apikey": key, "Accept": "application/json"}
    # Legacy service_role keys are JWTs and also go in Authorization;
    # new sb_secret_ keys only go in the apikey header.
    if key.startswith("eyJ"):
        headers["Authorization"] = f"Bearer {key}"
    rows, offset = [], 0
    while True:
        url = f"{base}/rest/v1/{table}?select=*&order=id&limit={PAGE}&offset={offset}"
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                page = json.load(resp)
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")[:300]
            sys.exit(f"ERROR fetching {table}: HTTP {e.code} {body}")
        rows.extend(page)
        if len(page) < PAGE:
            return rows
        offset += PAGE


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", default=str(HERE / "data" / "raw"), help="output folder")
    args = ap.parse_args()

    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not key:
        sys.exit("ERROR: set SUPABASE_SERVICE_ROLE_KEY first (see README, One-time setup step 2).")
    base = os.environ.get("SUPABASE_URL", DEFAULT_URL).rstrip("/")

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    data = {}
    for table in TABLES:
        rows = fetch_table(base, key, table)
        (out / f"{table}.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
        data[table] = rows
        print(f"{table:18s} {len(rows):6d} rows")

    refs = [(qp["id"], r) for qp in data["question_parts"] for r in (qp.get("image_refs") or [])]
    print(f"\nimage_refs: {len(refs)} refs on "
          f"{sum(1 for qp in data['question_parts'] if qp.get('image_refs'))} parts. Examples:")
    for _, r in refs[:5]:
        print(f"  - {r}")
    print(f"\nSaved to {out}")


if __name__ == "__main__":
    main()
