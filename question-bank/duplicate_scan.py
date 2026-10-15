"""Numeric-signature duplicate scanner (issue 5): extracts the underlying
arithmetic-sequence parameters (a1, d) from a question -- via its stored
`params` (templates) or by pattern-matching common stem/answer phrasings
(bespoke) -- and flags any two AA1.2 questions of the same (level,
calculator) that reduce to the identical (a1, d) pair, regardless of how
differently they're worded or which sub-quantities they ask for.

This is necessarily a best-effort extractor, not a full parser: a hit
means "these two likely test the identical underlying sequence, worth a
human look", and a miss (signature=None) means "couldn't determine the
signature from text alone", not "confirmed distinct". The raw digit-
scraping approach this replaces produced a false positive (n^2-3n vs
3n^2+n matched on shared digits from a coefficient vs an exponent); this
version only compares genuine (a1, d) pairs.
"""
import json
import re
import sqlite3
from fractions import Fraction
from pathlib import Path

DB_PATH = Path(__file__).parent / "bank.db"


def _frac(s: str):
    s = s.strip()
    return Fraction(s) if "." not in s and "/" in s else Fraction(s)


def extract_a1_d(row: dict) -> tuple | None:
    """Returns (a1, d) as Fractions if derivable, else None."""
    # 1. Template rows: params already has it directly, or via A,B (Sn=An^2+Bn).
    if row["check_log"]:
        try:
            log = json.loads(row["check_log"])
            params = log.get("params") if isinstance(log, dict) else None
        except (json.JSONDecodeError, TypeError):
            params = None
        if params:
            if "u1" in params and "d" in params:
                return (Fraction(params["u1"]), Fraction(params["d"]))
            if "a1" in params and "d" in params:
                return (Fraction(params["a1"]), Fraction(params["d"]))
            if "A" in params and "B" in params:
                A, B = params["A"], params["B"]
                return (Fraction(A + B), Fraction(2 * A))

    stem = row["stem_latex"]

    # 2. "S_n = A n^{2} (+/-) B n" pattern in the stem.
    m = re.search(r"S_n\s*=\s*(-?\d+)?n\^\{2\}\s*([+-])\s*(\d+)n", stem)
    if m:
        A = int(m.group(1)) if m.group(1) not in (None, "") else 1
        B = int(m.group(3)) * (1 if m.group(2) == "+" else -1)
        return (Fraction(A + B), Fraction(2 * A))

    # 3. "first term is $A$ and ... common difference is $D$" pattern.
    m = re.search(r"first term is \$(-?\d+\.?\d*)\$.*?common difference is \$(-?\d+\.?\d*)\$", stem)
    if m:
        return (Fraction(m.group(1)), Fraction(m.group(2)))

    # 4. "u_1 = X" and "u_{K} = Y" pattern (solve for a1,d from two terms).
    m1 = re.search(r"u_1\s*=\s*(-?\d+\.?\d*)", stem)
    m2 = re.search(r"u_\{?(\d+)\}?\s*=\s*(-?\d+\.?\d*)", stem.replace("u_1", "", 1))
    if m1 and m2 and m2.group(1) != "1":
        u1 = Fraction(m1.group(1))
        k, uk = int(m2.group(1)), Fraction(m2.group(2))
        d = (uk - u1) / (k - 1)
        return (u1, d)

    # 5. "it receives $X, ... $Y more" / "saves $X, ... $Y more" word-problem pattern.
    m = re.search(r"\$(\d+\.?\d*)\$.*?\$(\d+\.?\d*)\$ more", stem)
    if m:
        return (Fraction(m.group(1)), Fraction(m.group(2)))

    return None


def scan(topic_code: str = "AA1.2") -> dict:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute("select * from questions where topic_code=?", (topic_code,)).fetchall()
    conn.close()

    sigs = {}
    undetermined = []
    for row in rows:
        row = dict(row)
        ad = extract_a1_d(row)
        if ad is None:
            undetermined.append(row["id"])
            continue
        key = (row["level"], row["calculator"], ad)
        sigs.setdefault(key, []).append((row["id"], row["mode"]))

    dupes = {k: v for k, v in sigs.items() if len(v) > 1}
    return {"duplicates": dupes, "undetermined": undetermined, "total": len(rows)}


if __name__ == "__main__":
    result = scan()
    print(f"{result['total']} AA1.2 rows scanned; {len(result['undetermined'])} had no extractable (a1,d) signature.")
    print(f"{len(result['duplicates'])} duplicate (level, calculator, a1, d) groups found:")
    for key, ids in result["duplicates"].items():
        print(f"  {key}: {ids}")
