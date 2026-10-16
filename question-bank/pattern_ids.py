"""Pattern ID assignment for the question bank. A "pattern" is a
structural problem shape: each template-generator function gets its own
pattern ID, and every bespoke question is mapped either onto the
template pattern it structurally matches (if it was checked against that
template's cap -- see the "duplicated ..." comments in the template
modules) or onto its own bespoke-only pattern ID if its shape has no
template analogue.

Cap: 3 per pattern per level_scope, bespoke and template counted
together (enforced for AA1.2 in this round; AA5.6 is a smaller seed
batch with 1 variant per pattern, well under cap).

This mapping is built by reading each topic's templates_*.py
(build_all_*_templates insertion order) and bespoke_questions*.py (stem
text, in insertion order) -- not guessed.
"""

PATTERNS = {
    # ---- AA1.2 (38 rows after the pattern-cap trim + d89f3d18/cb9e2803 fixes) ----
    "AA1.2-P01": "two_terms_given_find_n_and_target",
    "AA1.2-P02": "three_terms_linear_ap_solve",
    "AA1.2-P03": "sum_solve_n_linear_gdc",
    "AA1.2-P04": "sum_quadratic_reverse_engineer",
    "AA1.2-P05": "sigma_notation_sum",
    "AA1.2-P06": "equally_spaced_terms",
    "AA1.2-P07": "savings_threshold_gdc",
    "AA1.2-P08": "sum_quadratic_word_problem",
    "AA1.2-P11": "multiples_of_7_range",            # bespoke-only
    "AA1.2-P15": "membership_check",                 # bespoke-only
    "AA1.2-P16": "two_condition_solve_u1_d",         # bespoke-only
    "AA1.2-P17": "two_sum_condition_simultaneous",   # bespoke-only (two instances)
    "AA1.2-P19": "first_negative_term",              # bespoke-only (retagged gdc->none)
    "AA1.2-P21": "integer_d_search_gdc",             # bespoke-only (two instances)
    "AA1.2-P22": "odd_sum_proof",                    # bespoke-only
    "AA1.2-P23": "product_condition",                # bespoke-only
    "AA1.2-P24": "symmetric_three_term",             # bespoke-only
    "AA1.2-P25": "two_sequence_crossing_linear",     # bespoke-only (two instances)
    "AA1.2-P26": "nth_term_exceeds_threshold",       # bespoke-only (d89f3d18's replacement shape)

    # ---- AA5.6 (9 rows: 6 Section A template + 3 Section B bespoke, 1 each) ----
    "AA5.6-P01": "power_rule_stationary_point",
    "AA5.6-P02": "chain_rule_linear_power",
    "AA5.6-P03": "chain_rule_exponential_tangent",
    "AA5.6-P04": "chain_rule_trig_second_derivative",
    "AA5.6-P05": "product_rule_poly_times_trig",
    "AA5.6-P06": "quotient_rule_linear_over_linear",
    "AA5.6-P07": "sectionB_product_chain_stationary_points",
    "AA5.6-P08": "sectionB_quotient_rule_stationary_tangent",
    "AA5.6-P09": "sectionB_chain_rule_double_angle",
}

# AA1.2 template rows: 19 rows (after the pattern-cap trim), in
# build_all_aa1_2_templates() insertion order (confirmed against
# bank.db rowid order).
_AA1_2_TEMPLATE_FN_ORDER = (
    ["aa1_2_two_terms_given"] * 2
    + ["aa1_2_three_terms_ap_linear"] * 3
    + ["aa1_2_sum_solve_n"] * 3
    + ["aa1_2_sum_quadratic_reverse"] * 2
    + ["aa1_2_sigma_notation"] * 3
    + ["aa1_2_equally_spaced_terms"] * 3
    + ["aa1_2_savings_threshold"] * 1
    + ["aa1_2_sum_quadratic_word"] * 2
)
_AA1_2_FN_TO_PATTERN = {
    "aa1_2_two_terms_given": "AA1.2-P01",
    "aa1_2_three_terms_ap_linear": "AA1.2-P02",
    "aa1_2_sum_solve_n": "AA1.2-P03",
    "aa1_2_sum_quadratic_reverse": "AA1.2-P04",
    "aa1_2_sigma_notation": "AA1.2-P05",
    "aa1_2_equally_spaced_terms": "AA1.2-P06",
    "aa1_2_savings_threshold": "AA1.2-P07",
    "aa1_2_sum_quadratic_word": "AA1.2-P08",
}

# AA1.2 bespoke rows, by id, in the order they appear in
# bespoke_questions.py (5 pilot1 rows) and bespoke_questions_aa1_2.py
# (14 prod_aa1_2 rows, after cb9e2803's deletion).
AA1_2_BESPOKE_PATTERN = {
    # pilot1_bespoke_* (bespoke_questions.py, AA1.2 section, in file order)
    "pilot1_bespoke_d89f3d18": "AA1.2-P26",  # replaced: nth-term-exceeds-threshold (was a P01 duplicate of b55c448c)
    "pilot1_bespoke_3c160636": "AA1.2-P08",  # two-company Sn crossing, rewritten with setup cost -- counts vs P08 cap
    "pilot1_bespoke_f403298a": "AA1.2-P11",  # multiples-of-7 range -- no template analogue
    "pilot1_bespoke_b4e45bf7": "AA1.2-P07",  # savings u12 + Sn threshold -- counts vs P07 cap
    "pilot1_bespoke_4a6da53a": "AA1.2-P04",  # Sn=n^2+3n reverse-engineer -- counts vs P04 cap
    # prod_aa1_2_bespoke_* (bespoke_questions_aa1_2.py, in file order)
    "prod_aa1_2_bespoke_b55c448c": "AA1.2-P01",  # 21 terms given first/last -> n, sum
    "prod_aa1_2_bespoke_a580335a": "AA1.2-P15",  # membership check (100 is/101 isn't a term)
    "prod_aa1_2_bespoke_8b194c39": "AA1.2-P16",  # two-condition ratio solve for u1, d
    "prod_aa1_2_bespoke_7c968f5e": "AA1.2-P17",  # two given partial sums -> u1, d, u15
    "prod_aa1_2_bespoke_a6267c35": "AA1.2-P07",  # theatre-seats Sn threshold -- counts vs P07 cap
    "prod_aa1_2_bespoke_ee8b6b0a": "AA1.2-P19",  # first negative term (retagged gdc->none)
    "prod_aa1_2_bespoke_61e7bc5a": "AA1.2-P17",  # S5, S8 simultaneous -> u1, d (same shape as P17)
    "prod_aa1_2_bespoke_2d4511f2": "AA1.2-P21",  # integer-d search (retagged gdc->none)
    "prod_aa1_2_bespoke_f7248ee5": "AA1.2-P22",  # odd-integers sum formula proof
    "prod_aa1_2_bespoke_27b4d948": "AA1.2-P23",  # product condition u1*u3=9
    "prod_aa1_2_bespoke_033fac72": "AA1.2-P24",  # symmetric 3-term a-d,a,a+d
    "prod_aa1_2_bespoke_dad1a49f": "AA1.2-P25",  # two linear Sn sequences crossing
    "prod_aa1_2_bespoke_74c37af9": "AA1.2-P25",  # Deborah/Edward salary crossing (retagged gdc->none; same shape as P25)
    "prod_aa1_2_bespoke_04337825": "AA1.2-P21",  # integer-d search (same shape as P21)
    # cb9e2803 ("SA/SB savings quadratic crossing") was DELETED -- see
    # bespoke_questions_aa1_2.py's comment -- so it has no entry here.
}


def aa1_2_pattern_id(row_id: str, mode: str, template_rowid_index: int = None) -> str:
    """row_id: the question's id. mode: 'template' or 'bespoke'.
    For template rows, pass template_rowid_index (0-based position in the
    prod_aa1_2 template insertion order, i.e. its rowid-ordered position
    among the 19 template rows) since template ids don't encode the
    generating function name."""
    if mode == "bespoke":
        return AA1_2_BESPOKE_PATTERN[row_id]
    fn = _AA1_2_TEMPLATE_FN_ORDER[template_rowid_index]
    return _AA1_2_FN_TO_PATTERN[fn]


# AA5.6: 6 Section A template rows (1 variant per pattern) + 3 Section B
# bespoke rows (1 per pattern), in insertion order.
_AA5_6_TEMPLATE_FN_ORDER = [
    "aa5_6_power_rule_stationary",
    "aa5_6_chain_power",
    "aa5_6_chain_exp",
    "aa5_6_chain_trig",
    "aa5_6_product_rule_poly_trig",
    "aa5_6_quotient_rule_linear",
]
_AA5_6_FN_TO_PATTERN = {
    "aa5_6_power_rule_stationary": "AA5.6-P01",
    "aa5_6_chain_power": "AA5.6-P02",
    "aa5_6_chain_exp": "AA5.6-P03",
    "aa5_6_chain_trig": "AA5.6-P04",
    "aa5_6_product_rule_poly_trig": "AA5.6-P05",
    "aa5_6_quotient_rule_linear": "AA5.6-P06",
}
_AA5_6_BESPOKE_PATTERN_ORDER = ["AA5.6-P07", "AA5.6-P08", "AA5.6-P09"]


def aa5_6_pattern_id(mode: str, rowid_index: int) -> str:
    if mode == "bespoke":
        return _AA5_6_BESPOKE_PATTERN_ORDER[rowid_index]
    fn = _AA5_6_TEMPLATE_FN_ORDER[rowid_index]
    return _AA5_6_FN_TO_PATTERN[fn]
