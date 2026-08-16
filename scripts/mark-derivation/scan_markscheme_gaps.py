#!/usr/bin/env python3
"""
Deterministic (no-LLM) scan for markscheme_text gaps in derivation_method='paper_explicit'
question_parts. These parts never went through STEP2, so nobody has checked whether the
codes printed in markscheme_text actually reach the paper-confirmed `marks` value.

Method: extract every mark-code token found anywhere in markscheme_text (M/A/R/G/N/C + digit,
repeated codes like "A1A1" or "(A1)(A1)" each count separately, AG counts as 0) and sum them.
Because this sums across ALL methods/branches in the text (no METHOD/EITHER selection logic,
unlike STEP2), the computed total can only be an over-count relative to the "correct" single-path
total -- so total < marks is a safe, false-positive-free signal of a genuine gap (codes missing
from the extracted text), never a false alarm caused by counting extra alternative-method codes.

Input: JSON array of {part_id, level, year, session, paper_number, time_zone, paper_file_path,
markscheme_file_path, question_number, question_max_mark, part_label, marks, markscheme_text}

Output: JSON array of flagged rows with computed_sum, gap, and the codes found.
"""
import json
import re
import sys

CODE_RE = re.compile(r'\(?(?<![A-Za-z])(AG|[MARGNC])(\d)?\)?')

def extract_codes(text):
    if not text:
        return []
    codes = []
    for m in CODE_RE.finditer(text):
        label, digit = m.group(1), m.group(2)
        if label == 'AG':
            codes.append(('AG', 0))
        elif digit:
            codes.append((f'{label}{digit}', int(digit)))
    return codes

def main():
    infile, outfile = sys.argv[1], sys.argv[2]
    with open(infile) as f:
        rows = json.load(f)

    flagged = []
    no_digit = []
    for row in rows:
        codes = extract_codes(row['markscheme_text'])
        total = sum(v for _, v in codes)
        marks = row['marks']
        if not codes:
            no_digit.append(row)
            continue
        if total < marks:
            flagged.append({
                **{k: row[k] for k in row if k != 'markscheme_text'},
                'computed_sum': total,
                'gap': marks - total,
                'codes_found': [c for c, _ in codes],
                'markscheme_text': row['markscheme_text'],
            })

    flagged.sort(key=lambda r: (-r['gap'], r['year'], r['question_number']))

    print(f"Total rows scanned: {len(rows)}")
    print(f"Rows with zero mark-codes found at all: {len(no_digit)}")
    print(f"Rows flagged (computed_sum < marks): {len(flagged)}")
    print()
    print("Gap distribution:")
    from collections import Counter
    gap_counts = Counter(r['gap'] for r in flagged)
    for gap, n in sorted(gap_counts.items()):
        print(f"  gap={gap}: {n} rows")

    with open(outfile, 'w') as f:
        json.dump({'flagged': flagged, 'no_digit_at_all': no_digit}, f, indent=2)
    print(f"\nWrote {len(flagged)} flagged + {len(no_digit)} no-digit rows to {outfile}")

if __name__ == '__main__':
    main()
