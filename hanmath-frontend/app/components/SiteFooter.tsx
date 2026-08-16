// Same mailto: convention hanmath.com already uses for its "Book a Trial
// Lesson" button (prefilled subject + body, no backend needed) -- reused
// here for the feedback link so early testers have a zero-friction way to
// flag something confusing or broken. Swap for a real form/issue tracker
// later without touching the rest of the page.
const FEEDBACK_SUBJECT = encodeURIComponent('Han Math Practice -- feedback');
const FEEDBACK_BODY = encodeURIComponent(
  `Hi Han,\n\nI found something worth flagging on the practice tool:\n\nPage/topic: \nWhat happened: \n\nThanks!`
);
const FEEDBACK_HREF = `mailto:hello@hanmath.com?subject=${FEEDBACK_SUBJECT}&body=${FEEDBACK_BODY}`;

export function SiteFooter() {
  return (
    <footer className="hm-footer">
      <a href={FEEDBACK_HREF} className="hm-feedback-link">
        Report an issue
      </a>
    </footer>
  );
}
