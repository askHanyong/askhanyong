"""Pattern ID assignment for AA1.2 questions (and the scheme to extend to
future topics). A "pattern" is a structural problem shape: all 8 template
functions each get their own pattern ID, and every bespoke question is
mapped either onto the template pattern it structurally matches (if it
was checked against that template's 3-variant cap -- see
templates_aa1_2.py comments referencing "duplicated pilot1_bespoke_...")
or onto its own bespoke-only pattern ID if its shape has no template
analogue.

This mapping was built by reading templates_aa1_2.py (build_all_aa1_2_templates
insertion order, cross-checked against the "duplicated pilot1_bespoke_X"
comments that recorded template-family collisions) and bespoke_questions.py /
bespoke_questions_aa1_2.py (stem text, in insertion order) -- not guessed.
"""

# Pattern catalog: pattern_id -> (name, origin)
PATTERNS = {
    "AA1.2-P01": "two_terms_given_find_n_and_target",
    "AA1.2-P02": "three_terms_linear_ap_solve",
    "AA1.2-P03": "sum_solve_n_linear_gdc",
    "AA1.2-P04": "sum_quadratic_reverse_engineer",
    "AA1.2-P05": "sigma_notation_sum",
    "AA1.2-P06": "equally_spaced_terms",
    "AA1.2-P07": "savings_threshold_gdc",
    "AA1.2-P08": "sum_quadratic_word_problem",
    "AA1.2-P11": "multiples_of_7_range",          # bespoke-only, no template analogue
    "AA1.2-P15": "membership_check",               # bespoke-only
    "AA1.2-P16": "two_condition_solve_u1_d",        # bespoke-only
    "AA1.2-P17": "two_sum_condition_simultaneous",  # bespoke-only (two instances)
    "AA1.2-P19": "first_negative_term",             # bespoke-only (retagged gdc->none)
    "AA1.2-P21": "integer_d_search_gdc",            # bespoke-only (two instances)
    "AA1.2-P22": "odd_sum_proof",                   # bespoke-only
    "AA1.2-P23": "product_condition",               # bespoke-only
    "AA1.2-P24": "symmetric_three_term",            # bespoke-only
    "AA1.2-P25": "two_sequence_crossing_linear",     # bespoke-only (two instances)
}

# Template rows: 24 rows = 8 functions x 3 variants, in build_all_aa1_2_templates()
# insertion order (confirmed against bank.db rowid order).
_TEMPLATE_FN_ORDER = [
    "aa1_2_two_terms_given", "aa1_2_two_terms_given", "aa1_2_two_terms_given",
    "aa1_2_three_terms_ap_linear", "aa1_2_three_terms_ap_linear", "aa1_2_three_terms_ap_linear",
    "aa1_2_sum_solve_n", "aa1_2_sum_solve_n", "aa1_2_sum_solve_n",
    "aa1_2_sum_quadratic_reverse", "aa1_2_sum_quadratic_reverse", "aa1_2_sum_quadratic_reverse",
    "aa1_2_sigma_notation", "aa1_2_sigma_notation", "aa1_2_sigma_notation",
    "aa1_2_equally_spaced_terms", "aa1_2_equally_spaced_terms", "aa1_2_equally_spaced_terms",
    "aa1_2_savings_threshold", "aa1_2_savings_threshold", "aa1_2_savings_threshold",
    "aa1_2_sum_quadratic_word", "aa1_2_sum_quadratic_word", "aa1_2_sum_quadratic_word",
]
_FN_TO_PATTERN = {
    "aa1_2_two_terms_given": "AA1.2-P01",
    "aa1_2_three_terms_ap_linear": "AA1.2-P02",
    "aa1_2_sum_solve_n": "AA1.2-P03",
    "aa1_2_sum_quadratic_reverse": "AA1.2-P04",
    "aa1_2_sigma_notation": "AA1.2-P05",
    "aa1_2_equally_spaced_terms": "AA1.2-P06",
    "aa1_2_savings_threshold": "AA1.2-P07",
    "aa1_2_sum_quadratic_word": "AA1.2-P08",
}

# Bespoke rows, by id, in the order they appear in bespoke_questions.py
# (5 pilot1 rows) and bespoke_questions_aa1_2.py (15 prod_aa1_2 rows).
# pattern assignment documents which template-family cap (if any) each
# bespoke question counts against, per the "template family cap" rule.
BESPOKE_PATTERN = {
    # pilot1_bespoke_* (bespoke_questions.py, AA1.2 section, in file order)
    "pilot1_bespoke_d89f3d18": "AA1.2-P01",  # two given terms -> n, sum (counts vs P01 cap)
    "pilot1_bespoke_3c160636": "AA1.2-P08",  # two-company Sn crossing (quadratic word) -- counts vs P08 cap
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
    "prod_aa1_2_bespoke_cb9e2803": "AA1.2-P08",  # SA/SB savings quadratic crossing -- counts vs P08 cap
    "prod_aa1_2_bespoke_04337825": "AA1.2-P21",  # integer-d search (same shape as P21)
}


def pattern_id_for(row_id: str, mode: str, rowid_index_within_template_batch: int = None) -> str:
    """row_id: the question's id. mode: 'template' or 'bespoke'.
    For template rows, pass rowid_index_within_template_batch (0-based position
    in the prod_aa1_2 template insertion order) since template ids don't encode
    the generating function name."""
    if mode == "bespoke":
        return BESPOKE_PATTERN[row_id]
    fn = _TEMPLATE_FN_ORDER[rowid_index_within_template_batch]
    return _FN_TO_PATTERN[fn]


# ---------------------------------------------------------------------------
# AA5.6 pattern catalog (prod_aa5_6 batch, 30 rows = 9 template functions x
# their variant counts, in templates_aa5_6.build_all_aa5_6_templates()
# insertion order -- confirmed against that function's spec-list order).
# ---------------------------------------------------------------------------
PATTERNS.update({
    "AA5.6-P01": "power_rule_gradient",
    "AA5.6-P02": "chain_rule_linear_power",
    "AA5.6-P03": "chain_rule_exponential",
    "AA5.6-P04": "chain_rule_trig_second_derivative",
    "AA5.6-P05": "product_rule_poly_times_trig",
    "AA5.6-P06": "quotient_rule_linear_over_linear",
    "AA5.6-P07": "sectionB_product_chain_stationary_points",
    "AA5.6-P08": "sectionB_quotient_rule_tangent_line",
    "AA5.6-P09": "sectionB_chain_rule_double_angle",
})

_AA5_6_FN_ORDER = (
    ["aa5_6_power_rule_gradient"] * 4
    + ["aa5_6_chain_power"] * 4
    + ["aa5_6_chain_exp"] * 4
    + ["aa5_6_chain_trig"] * 4
    + ["aa5_6_product_rule_poly_trig"] * 4
    + ["aa5_6_quotient_rule_linear"] * 4
    + ["aa5_6_sectionB_product_stationary"] * 2
    + ["aa5_6_sectionB_quotient_tangent"] * 2
    + ["aa5_6_sectionB_double_angle"] * 2
)
_AA5_6_FN_TO_PATTERN = {
    "aa5_6_power_rule_gradient": "AA5.6-P01",
    "aa5_6_chain_power": "AA5.6-P02",
    "aa5_6_chain_exp": "AA5.6-P03",
    "aa5_6_chain_trig": "AA5.6-P04",
    "aa5_6_product_rule_poly_trig": "AA5.6-P05",
    "aa5_6_quotient_rule_linear": "AA5.6-P06",
    "aa5_6_sectionB_product_stationary": "AA5.6-P07",
    "aa5_6_sectionB_quotient_tangent": "AA5.6-P08",
    "aa5_6_sectionB_double_angle": "AA5.6-P09",
}


def pattern_id_for_aa5_6(rowid_index_within_batch: int) -> str:
    fn = _AA5_6_FN_ORDER[rowid_index_within_batch]
    return _AA5_6_FN_TO_PATTERN[fn]
