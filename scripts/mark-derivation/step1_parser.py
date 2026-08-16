import re, json, sys

ROMAN = ['viii','vii','iii','iv','vi','ix','ii','v','i']  # longest-first for regex alternation; 'x' excluded — "f (x)"/"g (x)" false-positives constantly
ROMAN_ALT = '|'.join(ROMAN)

def _is_citation(text, pos):
    """True if the marker at `pos` is a backreference like '...from part (b) (i)...'
    rather than a genuine structural marker. These can land at true line-start
    after PDF text wrapping, so line-anchoring alone doesn't filter them out."""
    preceding = text[max(0, pos - 25):pos].lower()
    return re.search(r'\bparts?\b', preceding) is not None

def parse_paper(text):
    """Returns {question_number: {'max_mark': int, 'parts': {part_label: {'own_bracket':int|None, 'group_combined_bracket':int|None, 'group_siblings':[labels]}}}}"""
    q_pattern = re.compile(r'^(\d{1,2})\.\s*\[Maximum mark:\s*(\d+)\]', re.MULTILINE)
    headers = [(m.start(), int(m.group(1)), int(m.group(2))) for m in q_pattern.finditer(text)]
    result = {}
    for idx, (start, qnum, maxmark) in enumerate(headers):
        end = headers[idx+1][0] if idx+1 < len(headers) else len(text)
        chunk = text[start:end]
        parts = parse_question_chunk(chunk)
        result[qnum] = {'max_mark': maxmark, 'parts': parts}
    return result

def find_sub_markers(tspan):
    """Returns sorted list of (start_pos, roman_label) for genuine sub-part markers.

    Sub-part markers normally start their own line: "^(i) ...". The one
    exception is the FIRST sub-marker sitting glued to the top-level marker's
    own line, e.g. "(c) (i)  State...". That glued form is only accepted at
    the very start of the span — allowing it anywhere later would also match
    backreferences like "...from part (a)(i)." appearing deep inside a
    different part's own prose, which are citations, not structural markers.
    """
    markers = [(m.start(), m.group(1)) for m in re.finditer(r'^\((' + ROMAN_ALT + r')\)', tspan, re.MULTILINE)
               if not _is_citation(tspan, m.start())]

    glued = re.match(r'^\([a-h]\)\s*\((' + ROMAN_ALT + r')\)', tspan)
    if glued:
        pos = glued.start(1) - 1  # position of the "(" before the roman numeral
        if not markers or pos < markers[0][0]:
            markers.insert(0, (pos, glued.group(1)))

    markers.sort(key=lambda t: t[0])
    return markers

def parse_question_chunk(chunk):
    top_pattern = re.compile(r'^\(([a-h])\)', re.MULTILINE)
    top_matches = [m for m in top_pattern.finditer(chunk) if not _is_citation(chunk, m.start())]
    parts = {}
    for i, tm in enumerate(top_matches):
        letter = tm.group(1)
        tstart = tm.start()
        tend = top_matches[i+1].start() if i+1 < len(top_matches) else len(chunk)
        tspan = chunk[tstart:tend]

        sub_matches = find_sub_markers(tspan)

        if not sub_matches:
            brackets = re.findall(r'\[(\d+)\]', tspan)
            own = int(brackets[-1]) if brackets else None
            parts[letter] = {'own_bracket': own, 'group_combined_bracket': None, 'group_siblings': [letter]}
        else:
            sub_labels = []
            sub_spans = []
            for j, (sstart, roman) in enumerate(sub_matches):
                send = sub_matches[j+1][0] if j+1 < len(sub_matches) else len(tspan)
                sub_labels.append(f"{letter}.{roman}")
                sub_spans.append(tspan[sstart:send])

            per_sub_brackets = [re.findall(r'\[(\d+)\]', s) for s in sub_spans]
            n_with_bracket = sum(1 for b in per_sub_brackets if b)

            if n_with_bracket == len(sub_labels):
                for lbl, b in zip(sub_labels, per_sub_brackets):
                    parts[lbl] = {'own_bracket': int(b[-1]), 'group_combined_bracket': None, 'group_siblings': sub_labels}
            elif n_with_bracket == 1 and per_sub_brackets[-1]:
                combined = int(per_sub_brackets[-1][-1])
                for lbl in sub_labels:
                    parts[lbl] = {'own_bracket': None, 'group_combined_bracket': combined, 'group_siblings': sub_labels}
            else:
                for lbl, b in zip(sub_labels, per_sub_brackets):
                    parts[lbl] = {'own_bracket': int(b[-1]) if b else None, 'group_combined_bracket': None, 'group_siblings': sub_labels, 'ambiguous': True}
    return parts

if __name__ == '__main__':
    infile = sys.argv[1]
    outfile = sys.argv[2]
    text = open(infile, encoding='utf-8').read()
    result = parse_paper(text)
    json.dump(result, open(outfile, 'w'), indent=2)
    print(f"parsed {len(result)} questions from {infile}")
