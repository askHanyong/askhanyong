# Step 0 global checklist

Applies to every question in `bank.db`, template or bespoke, on every edit —
not just at authoring time. `qa_checks.py` enforces what's mechanically
checkable; this file is the canonical list of *why* those checks exist.

1. **Originality** — no past-paper reproduction. Parameterize or restructure;
   flag anything that still reads as a known textbook-standard problem via
   `flag_for_review(conn, qid, "textbook-standard, needs originality check")`.
2. **Independence** — bespoke `check_code` must come from a separate
   Agent-tool subagent that sees ONLY `stem_only_text(q)` (stem + part
   label/marks/text), never `answer` or `markscheme_lines`. Template mode
   (self-authored, self-verifying via a fresh SymPy computation, never a
   hardcoded PASS) has no independence concern.
3. **Security** — no secrets committed.
4. **Mandatory edit pipeline** — any edit to a CONTENT_FIELDS column
   (`stem_latex`, `parts_json`, `check_code`, `total_marks`, `calculator`,
   `paper_type`, `level`, `blueprint_cell`, `section`) via `db_edit.update_question`
   unconditionally resets `check_status` to `pending` and clears `check_log`.
   There is no bypass.
5. **GDC genuineness** — a `calculator: gdc` tag requires a real solve/search
   step over a degree>=2 expression (see `qa_checks.check_gdc_necessity`);
   a linear threshold or a comparison of two linear expressions does not
   genuinely need a GDC, regardless of context dressing.
6. **Section A mark ceiling** — `total_marks <= 6` for `section='A'`
   (`SECTION_A_MARK_CEILING`).
7. **Section B mark floor/ceiling** — `15 <= total_marks <= 20` for
   `section='B'` (`check_section_b_mark_range`). A Section B question must be
   a genuine multi-part structure, not a padded Section A question.
8. **No method-naming outside a scaffold (Rule 6)** — Section A stems and
   part text must say *what* to find, never *how*: no "using the
   quotient/product/chain rule", "by differentiating using...", "use the
   formula for...", "by completing the square", etc. (`check_method_naming`).
   - Method-naming is allowed only inside an explicit **scaffold**: a
     Section B multi-part question where an earlier part sets up the method
     for a later one, or whose stem says outright that the question is
     guided. Such questions set `scaffold=true` and a `scaffold_reason`.
   - `scaffold=true` is invalid on a Section A question
     (`check_scaffold_section_a`).
   - Mark schemes may still name the method (e.g. "M1 recognising the
     quotient rule") — only stem/part text is checked. "Hence" chains are
     always fine, since they don't name a method.
9. **No domain-gap monotonicity overclaims** — never state a function is
   "increasing/decreasing for all x in its domain" when the domain has a
   gap (e.g. an excluded point from a quotient's denominator); say
   "...on each interval of its domain" instead (`check_monotonicity_domain_gap`).
10. **No template leaks** — a generated question's rendered text must never
    contain an unsubstituted generic template symbol (e.g. a literal `a`,
    `k` meant to have been replaced by a concrete number), a double sign
    (`+ -`, ASCII or Unicode minus), or a degenerate power/coefficient
    artifact (`x^1`, `x^0`, `1x`) (`check_template_leakage`).
11. **No trivial filler parts** — a part shouldn't be answerable by a fact
    independent of the question's own parameters (e.g. "state f'(0)" when
    the answer is always 0 regardless of the parameter) or be a bare
    single-rule application with no further reasoning (e.g. a lone
    power-rule polynomial with no stationary-point/tangent/relation
    follow-up). Second-derivative parts must award marks for the act of
    differentiating again (an M1), not just for the evaluated number.
