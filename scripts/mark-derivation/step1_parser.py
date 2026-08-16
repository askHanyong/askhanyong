import re, json, sys

ROMAN = ['viii','vii','iii','iv','vi','ix','ii','v','i']  # longest-first for regex alternation; 'x' excluded — "f (x)"/"g (x)" false-positives constantly
ROMAN_ALT = '|'.join(ROMAN)

def _is_citation(text, pos):
    """True if the marker at `pos` is a backreference like '...from part (b) (i)...'
    rather than a genuine structural marker. These can land at true line-start
    after PDF text wrapping, so line-anchoring alone doesn't filter them out.

    Anchored to END exactly at `pos` (only whitespace, or one "(letter)" hop,
    between "part" and the marker) -- a wider unanchored window over-matches
    unrelated prose that merely contains the word "part" earlier in the
    sentence, e.g. "a part-time employee. (d) Find ...".
    """
    preceding = text[max(0, pos - 40):pos]
    return re.search(r'\bpart\b\s*(\([a-h]\)\s*)?$', preceding, re.IGNORECASE) is not None

def parse_paper(text):
    """Returns {question_number: {'max_mark': int, 'parts': {part_label: {'own_bracket':int|None, 'group_combined_bracket':int|None, 'group_siblings':[labels]}}}}"""
    q_pattern = re.compile(r'^(\d{1,2})\.\s*\[Maximum marks?:\s*(\d+)\]', re.MULTILINE)
    headers = [(m.start(), int(m.group(1)), int(m.group(2))) for m in q_pattern.finditer(text)]
    result = {}
    for idx, (start, qnum, maxmark) in enumerate(headers):
        end = headers[idx+1][0] if idx+1 < len(headers) else len(text)
        chunk = text[start:end]
        parts = parse_question_chunk(chunk, maxmark)
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

    Whitespace is also allowed between the glued marker's own "(" and its
    roman label, e.g. "(d)(\ni)" -- some PDF extractions line-wrap mid-marker,
    splitting "(i)" itself across a newline right after the opening paren.
    """
    markers = [(m.start(), m.group(1)) for m in re.finditer(r'^\((' + ROMAN_ALT + r')\)', tspan, re.MULTILINE)
               if not _is_citation(tspan, m.start())]

    glued = re.match(r'^\([a-h]\)\s*(\(\s*(' + ROMAN_ALT + r')\))', tspan)
    if glued:
        pos = glued.start(1)  # position of the "(" before the roman numeral
        label = glued.group(2)
        if not markers or pos < markers[0][0]:
            markers.insert(0, (pos, label))

    markers.sort(key=lambda t: t[0])
    return markers

def parse_question_chunk(chunk, maxmark=None):
    top_pattern = re.compile(r'^\(([a-h])\)', re.MULTILINE)
    top_matches = [m for m in top_pattern.finditer(chunk) if not _is_citation(chunk, m.start())]
    parts = {}
    if not top_matches:
        # Undivided question -- no lettered sub-parts at all, so the DB stores
        # this question as a single part with a bare "" label. There's no
        # per-part bracket to find since the question's own header mark IS
        # the part's mark.
        parts[''] = {'own_bracket': maxmark, 'group_combined_bracket': None, 'group_siblings': ['']}
        return parts
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
