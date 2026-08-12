// IB Diploma Programme Mathematics: official command term glossary (Group 5).
// Used only for the cheap sanity check in step 3 -- confirms the model used
// recognized IB command terms rather than inventing its own vocabulary.
export const IB_COMMAND_TERMS = new Set(
  [
    'Calculate', 'Compare', 'Compare and contrast', 'Construct', 'Deduce', 'Demonstrate',
    'Describe', 'Determine', 'Differentiate', 'Distinguish', 'Draw', 'Estimate', 'Explain',
    'Find', 'Hence', 'Hence or otherwise', 'Identify', 'Integrate', 'Interpret', 'Investigate',
    'Justify', 'Label', 'List', 'Plot', 'Predict', 'Prove', 'Show', 'Show that', 'Sketch',
    'Solve', 'State', 'Suggest', 'Verify', 'Write down', 'Comment', 'Outline', 'Represent',
  ].map((t) => t.toLowerCase())
);

export function isValidCommandTerm(term: string): boolean {
  return IB_COMMAND_TERMS.has(term.trim().toLowerCase());
}

export function findInvalidCommandTerms(terms: string[]): string[] {
  return terms.filter((t) => !isValidCommandTerm(t));
}
