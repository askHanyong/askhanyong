// Wordmark treatment mirrors hanmath.com's own header (see hm-brand-wordmark
// / hm-brand-subtitle in the live site's bundle): sans-serif bold navy
// wordmark with a small uppercase gold subtitle underneath. "PRACTICE" here
// stands in for hanmath.com's "Premium IB Mathematics Coaching" subtitle --
// same lockup, distinct label, so this reads as the same brand's practice
// tool rather than a separate product.
export function SiteHeader() {
  return (
    <header className="hm-nav">
      <div className="hm-nav-inner">
        <a href="/" className="hm-brand-lockup" aria-label="Han Math Practice home">
          <span className="hm-brand-wordmark">HAN MATH</span>
          <span className="hm-brand-subtitle">Practice</span>
        </a>
      </div>
    </header>
  );
}
