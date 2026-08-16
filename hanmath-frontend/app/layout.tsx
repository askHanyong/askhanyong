import Script from 'next/script';
import type { ReactNode } from 'react';
import './globals.css';
import { SiteHeader } from './components/SiteHeader';
import { SiteFooter } from './components/SiteFooter';
import { AuthGate } from './components/AuthGate';

export const metadata = {
  title: 'Han Math Practice',
  description: 'Practice IB Mathematics AA questions, by topic.',
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
        {/* Same two typefaces as hanmath.com's main site: Inter for nav/body/
            labels, Cormorant Garamond for serif display headings. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Cormorant+Garamond:wght@600;700&display=swap"
          rel="stylesheet"
        />
        <Script id="mathjax-config" strategy="beforeInteractive">
          {MATHJAX_CONFIG}
        </Script>
        <Script
          id="mathjax-src"
          src="https://cdnjs.cloudflare.com/ajax/libs/mathjax/3.2.2/es5/tex-svg.min.js"
          strategy="beforeInteractive"
        />
      </head>
      <body>
        <AuthGate>
          <SiteHeader />
          {children}
          <SiteFooter />
        </AuthGate>
      </body>
    </html>
  );
}
