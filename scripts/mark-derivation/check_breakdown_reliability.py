#!/usr/bin/env python3
"""
Root-cause check for the 231 markscheme_text gaps found by scan_markscheme_gaps.py.

Question: did the segmentation call actually fail to READ the mark codes off the
PDF (a real data-loss bug), or did it read them fine and only omit them from the
free-text markscheme_text field while still placing them correctly in the
structured marks_breakdown field (a prompt-output-shape ambiguity, not data loss)?

Method: for the same 231 flagged part_ids, independently digit-sum
marks_breakdown (note field, same code rules as scan_markscheme_gaps.py) and
compare against the already-confirmed-correct marks value.

Input: JSON array of {part_id, marks, marks_breakdown} for the 231 flagged rows
(pulled via execute_sql: select qp.id as part_id, qp.marks, mp.marks_breakdown
from question_parts qp join markscheme_parts mp on mp.question_part_id = qp.id
where qp.id in (<231 ids from gaps_flagged.json>)).

Result (2026-08-16, all 1151 paper_explicit rows' 231 flagged): 228/231 (98.7%)
of marks_breakdown entries digit-sum correctly to marks -- proving the codes
were read correctly from the PDF and only dropped from markscheme_text. Only 3
rows have a genuinely wrong marks_breakdown (oversummed -- the same
duplicate-METHOD-branch conflation bug as the earlier 17-row backfill, a
different and separate failure mode from the markscheme_text gap).
"""
import json
import re
import sys

CODE_RE = re.compile(r'(?<![A-Za-z])(AG|[MARGNC])(\d)?')

def breakdown_sum(entries):
    total = 0
    for e in entries:
        for m in CODE_RE.finditer(e.get('note', '')):
            if m.group(1) != 'AG' and m.group(2):
                total += int(m.group(2))
    return total

def main():
    infile = sys.argv[1]
    rows = json.load(open(infile))

    correct, empty, wrong = 0, 0, []
    for r in rows:
        bd = r['marks_breakdown']
        if not bd:
            empty += 1
            wrong.append(r)
            continue
        s = breakdown_sum(bd)
        if s == r['marks']:
            correct += 1
        else:
            wrong.append({**r, 'computed_breakdown_sum': s})

    print(f"Total: {len(rows)}")
    print(f"marks_breakdown correctly sums to marks: {correct}")
    print(f"marks_breakdown empty: {empty}")
    print(f"marks_breakdown present but WRONG sum: {len(wrong) - empty}")
    for w in wrong:
        print(f"  {w['part_id']} marks={w['marks']} breakdown_sum={w.get('computed_breakdown_sum', 0)} "
              f"notes={[e['note'] for e in w['marks_breakdown']]}")

if __name__ == '__main__':
    main()
