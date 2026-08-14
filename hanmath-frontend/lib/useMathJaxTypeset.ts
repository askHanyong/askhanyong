'use client';

import { useEffect, type DependencyList } from 'react';

declare global {
  interface Window {
    MathJax?: {
      typesetPromise?: (elements?: Element[]) => Promise<void>;
      startup?: { promise: Promise<void> };
    };
  }
}

// Re-typesets MathJax whenever `deps` changes -- needed because MathJax only
// scans the DOM on load; content that appears later (fetched questions,
// revealed solutions) has to be typeset explicitly.
export function useMathJaxTypeset(deps: DependencyList) {
  useEffect(() => {
    const mj = window.MathJax;
    if (!mj) return;
    const run = () => mj.typesetPromise?.();
    if (mj.startup?.promise) {
      mj.startup.promise.then(run).catch(() => {});
    } else {
      run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
