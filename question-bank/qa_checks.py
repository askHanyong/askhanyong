"""Structural/content QA checks for the question bank, run in addition to
(not instead of) the mathematical correctness check (check_code). These
catch authoring defects that a correct check_code cannot: mark-allocation
mismatches, trivial stem/answer overlap, raw LaTeX leaking into prose,
sloppy coefficient formatting, real names in stems, and GDC questions
that don't actually need a GDC.

Each check function takes a question dict (as loaded from the DB, with
`parts` already parsed from parts_json) and returns (passed: bool,
detail: str). Several of these are necessarily heuristic -- documented
inline -- and should be read as "worth a human look", not an infallible
verdict.
"""
import json
import re

MATH_SPAN_RE = re.compile(r"(?<!\\)\$\$(.+?)(?<!\\)\$\$|(?<!\\)\$(.+?)(?<!\\)\$", re.DOTALL)

# Common first names seen across IB past papers / generic word-problem
# characters, PLUS "Hanyong" -- previously exempted as this bank's own
# brand name, but that exemption was removed on explicit instruction:
# no real/specific names in stems, full stop.
NAME_BLOCKLIST = {
    "Deborah", "Edward", "John", "Maria", "Sarah", "Tom", "Anna", "David",
    "Peter", "Sam", "Amy", "James", "Claire", "Michael", "Sophie", "Daniel",
    "Emma", "Jack", "Lucy", "Ben", "Alice", "Bob", "Carlos", "Diego",
    "Fatima", "Wei", "Yuki", "Mohammed", "Priya", "Chen", "Kim", "Hanyong",
}


def _non_math_text(text: str) -> str:
    """Returns `text` with every $...$/$$...$$ span removed, i.e. the
    parts that would render as literal prose (not passed through KaTeX)."""
    if not text:
        return ""
    pieces = []
    last_end = 0
    for m in MATH_SPAN_RE.finditer(text):
        pieces.append(text[last_end:m.start()])
        last_end = m.end()
    pieces.append(text[last_end:])
    return "".join(pieces)


def _math_spans_text(text: str) -> list[str]:
    """Returns the content of every $...$/$$...$$ span in `text` (the
    parts that actually get typeset as math), as separate strings."""
    if not text:
        return []
    return [g1 if g1 is not None else g2 for g1, g2 in MATH_SPAN_RE.findall(text)]


def _all_text_blobs(q: dict) -> list[str]:
    blobs = [q["stem_latex"]]
    for p in q["parts"]:
        blobs.append(p.get("text", ""))
        blobs.append(p.get("answer", ""))
        for line in p.get("markscheme_lines", []) or []:
            blobs.append(line.get("desc", ""))
    return blobs


def check_marks_sum(q: dict) -> tuple[bool, str]:
    """Each part's markscheme_lines should have exactly as many lines as
    the part is worth (IB convention: each M/A/R/AG line = 1 mark), and
    the parts' marks should sum to total_marks."""
    issues = []
    part_sum = 0
    for p in q["parts"]:
        n_lines = len(p.get("markscheme_lines", []) or [])
        part_sum += p["marks"]
        if n_lines != p["marks"]:
            issues.append(f"part ({p['label']}): {p['marks']} marks but {n_lines} markscheme line(s)")
    if part_sum != q["total_marks"]:
        issues.append(f"parts sum to {part_sum} marks, total_marks={q['total_marks']}")
    return (len(issues) == 0), "; ".join(issues) if issues else "marks consistent"


def check_stem_unknown_overlap(q: dict) -> tuple[bool, str]:
    """Flags a part that asks the student to 'find' a quantity whose
    numeric value was already stated verbatim in the stem (e.g. stem
    gives "$u_1 = 0$" and a later part asks to "find ... $u_1$"). This is
    a simple substring heuristic on variable tokens like u_1, u_{1}, d,
    S_n -- it can miss paraphrased overlaps and can over-flag a variable
    that is named in the stem but not literally handed a value, so a hit
    is worth a human look rather than an automatic rejection."""
    stem = q["stem_latex"]
    given_tokens = set(re.findall(r"(u_\{?\d+\}?|S_\{?\d+\}?|d)\s*=", stem))
    if not given_tokens:
        return True, "no explicit givens detected in stem"
    hits = []
    for p in q["parts"]:
        text = p.get("text", "").replace("{", "").replace("}", "")
        for token in given_tokens:
            norm = token.replace("{", "").replace("}", "")
            # word-boundary + not-followed-by-another-digit, so "u_2" doesn't
            # false-positive match inside "u_20"
            pattern = r"find\b.*?\b" + re.escape(norm) + r"(?!\d)"
            if re.search(pattern, text, re.IGNORECASE):
                hits.append(f"part ({p['label']}) asks to find '{norm}', already given in stem as '{norm}='")
    return (len(hits) == 0), "; ".join(hits) if hits else "no overlap detected"


def check_latex_leakage(q: dict) -> tuple[bool, str]:
    """Flags any backslash LaTeX command (\\text, \\frac, \\$, etc.)
    appearing OUTSIDE a $...$/$$...$$ span -- such commands render as
    literal backslash-text in the review sheet instead of being
    typeset, since only math spans go through KaTeX."""
    hits = []
    for t in _all_text_blobs(q):
        leaked = re.findall(r"\\[a-zA-Z]+|\\\$", _non_math_text(t))
        if leaked:
            hits.append(f"{sorted(set(leaked))} in {t[:50]!r}...")
    return (len(hits) == 0), "; ".join(hits) if hits else "no leakage"


def check_formatting_patterns(q: dict) -> tuple[bool, str]:
    """Flags sloppy algebraic formatting WITHIN math spans only (prose can
    legitimately contain '--' as an em-dash, "u_1" is a legitimate label
    not a bare coefficient, etc. -- these patterns only indicate a bug
    inside an actual LaTeX expression): '+ -' (should be '-'), '+ 0' or
    '- 0' (a zero term should be omitted entirely), and a bare coefficient
    of 1 written out (e.g. '1n', '1x') instead of omitted."""
    hits = []
    for t in _all_text_blobs(q):
        for span in _math_spans_text(t):
            if re.search(r"[+-]\s*-", span):
                hits.append(f"'+-' / '+ -' / '--' in math span {span[:50]!r}")
            if re.search(r"[+-]\s*0\b(?!\.\d)", span):
                hits.append(f"'+ 0' / '- 0' in math span {span[:50]!r}")
            bare_one = re.search(r"(?<![a-zA-Z0-9_{])1([a-zA-Z])\b", span)
            if bare_one:
                hits.append(f"bare '1{bare_one.group(1)}' in math span {span[:50]!r}")
    return (len(hits) == 0), "; ".join(hits) if hits else "no formatting issues"


def check_name_blocklist(q: dict) -> tuple[bool, str]:
    """Flags real/common first names anywhere in the question -- stem,
    part text, answers, or markscheme lines (common IB-past-paper or
    generic word-problem character names, including this bank's own
    brand name "Hanyong" -- no exemptions). Checking the stem alone once
    missed an instance that only appeared in a part's text."""
    combined = " ".join(_all_text_blobs(q))
    hits = [name for name in NAME_BLOCKLIST if re.search(r"\b" + re.escape(name) + r"\b", combined)]
    return (len(hits) == 0), f"blocklisted name(s) found: {hits}" if hits else "no blocklisted names"


def check_gdc_necessity(q: dict) -> tuple[bool, str]:
    """For calculator='gdc' questions only: the check_code should show
    genuine evidence of a computation a GDC is actually needed for.

    Neither a solve()/nsolve()/inequality-solver call NOR a while/floor/
    ceiling trial-search is enough on its own -- sympy's solve() will
    happily solve a trivial LINEAR equation too (e.g. "u1+(n-1)*d=0"),
    and a threshold search over u_n (always linear in n for an arithmetic
    sequence, regardless of how the sequence was defined) is solvable by
    inspection without a GDC either way. Either marker additionally
    requires a degree>=2 term somewhere in the code -- an explicit power
    ("n**2") or the standard AP sum formula in factored form
    ("n*(2*a1+(n-1)*d)"), which is quadratic in n despite never writing
    "**2" literally.

    This is a heuristic proxy (string-matched against the check_code),
    not a judgment of the mathematics itself, so a failure should be read
    as 'looks too easy for a GDC paper', worth a human look, not an
    automatic rejection. Known limitation: the nonlinear-evidence check is
    scoped to the WHOLE check_code, not to the specific marker it's
    paired with -- a question with a genuinely quadratic part (a)/(b) and
    a separate, genuinely-linear threshold search in part (c) can still
    pass, since the quadratic evidence from the earlier part satisfies the
    global check. Such cases need a human pass per-part, not just this
    check's verdict."""
    if q.get("calculator") != "gdc":
        return True, "not a gdc question"
    code = q.get("check_code", "")
    solver_markers = ["solve(", "solve_univariate_inequality", "nsolve("]
    search_markers = ["while ", "floor(", "ceiling("]
    found_markers = [m for m in (solver_markers + search_markers) if m in code]

    # A 2-equation-in-2-unknowns linear system (solve([eq1, eq2], [x, y]))
    # is conventional GDC territory in IB practice even though each
    # equation is individually linear -- exempt it from the degree check.
    has_system_solve = bool(re.search(r"solve\(\s*\[", code))

    # Otherwise: an explicit power ("n**2"), or a defined function whose
    # OWN parameter appears 2+ times in its return expression (e.g.
    # "def S(n_val): return n_val*(2*a1+(n_val-1)*d)/2" -- the standard AP
    # sum formula, quadratic in n_val despite never writing "**2"
    # literally). A linear expression like "a1+(n-1)*d" references its
    # parameter only once.
    has_explicit_power = bool(re.search(r"\*\*\s*[2-9]", code))
    has_quadratic_function = False
    for fn_name, param in re.findall(r"def\s+(\w+)\s*\(\s*(\w+)", code):
        body_match = re.search(rf"def\s+{re.escape(fn_name)}\s*\(\s*{re.escape(param)}[^\n]*\n((?:[ \t]+.*\n?)+)", code)
        body = body_match.group(1) if body_match else ""
        if len(re.findall(rf"\b{re.escape(param)}\b", body)) >= 2:
            has_quadratic_function = True
            break
    # Inline formulas (no wrapping function -- e.g. a bare sympy Symbol
    # used directly: "n/2*(2*a1+(n-1)*d)") won't match the function-param
    # check above; catch those via the same identifier appearing both
    # right before "*(" and again inside the parens.
    has_inline_quadratic = bool(re.search(r"(\w+)\s*\*\s*\([^\n]*?\1", code))
    has_nonlinear = has_explicit_power or has_quadratic_function or has_inline_quadratic

    if has_system_solve:
        return True, "found a simultaneous 2-equation linear system (solve([eq1, eq2], ...)) -- conventional GDC territory"
    if found_markers and has_nonlinear:
        return True, f"found {found_markers} with a degree>=2 term"
    if found_markers and not has_nonlinear:
        return False, (f"found only {found_markers} with no squared-or-higher term -- "
                        f"looks like a linear (u_n-style) equation/threshold, solvable by inspection without a GDC")
    return False, "no solve/search marker in check_code -- looks like direct substitution only"


SECTION_A_MARK_CEILING = 6


def check_section_a_mark_ceiling(q: dict) -> tuple[bool, str]:
    """Section A questions are meant to be short/single-concept; enforce
    a ceiling on total_marks (currently 6)."""
    if q.get("section") != "A":
        return True, "not a Section A question"
    total = q.get("total_marks", 0)
    return (total <= SECTION_A_MARK_CEILING), f"total_marks={total} (ceiling={SECTION_A_MARK_CEILING})"


ALL_CHECKS = [
    ("marks_sum", check_marks_sum),
    ("stem_unknown_overlap", check_stem_unknown_overlap),
    ("latex_leakage", check_latex_leakage),
    ("formatting_patterns", check_formatting_patterns),
    ("name_blocklist", check_name_blocklist),
    ("gdc_necessity", check_gdc_necessity),
    ("section_a_mark_ceiling", check_section_a_mark_ceiling),
]


def run_all_qa_checks(q: dict) -> dict:
    """q must have a `parts` key (list of part dicts) in addition to the
    usual DB columns. Returns {check_name: (passed, detail), ...}."""
    return {name: fn(q) for name, fn in ALL_CHECKS}


def question_from_row(row: dict) -> dict:
    """Builds the dict shape ALL_CHECKS expects from a sqlite3.Row-derived
    dict with a JSON-encoded parts_json column."""
    q = dict(row)
    q["parts"] = json.loads(q["parts_json"]) if q.get("parts_json") else []
    return q
