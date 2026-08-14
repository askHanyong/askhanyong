import Script from 'next/script';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'hanmath.com (proof of concept)',
};

// Same MathJax config as askhanyong.com's index.html (inline: \(...\) or
// $...$, display: \[...\] or $$...$$, processEscapes so a literal \$ in
// question text renders as a dollar sign instead of closing math mode) --
// this is the exact convention the ingestion/generation pipeline's LaTeX
// output was built against.
const MATHJAX_CONFIG = `
  window.MathJax = {
    tex: { inlineMath: [['\\\\(','\\\\)'], ['$','$']], displayMath: [['\\\\[','\\\\]'],['$$','$$']], processEscapes: true },
    svg: { fontCache: 'none' },
    options: { skipHtmlTags: ['script','noscript','style','textarea','pre'] }
  };
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <Script id="mathjax-config" strategy="beforeInteractive">
          {MATHJAX_CONFIG}
        </Script>
        <Script
          id="mathjax-src"
          src="https://cdnjs.cloudflare.com/ajax/libs/mathjax/3.2.2/es5/tex-svg.min.js"
          strategy="beforeInteractive"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
