// SUPERSEDED: this file is kept only as the original design reference.
// The real, deployed version is app/paper-builder/ResultsView.tsx, wired
// into page.tsx's "Generate paper" flow with the real assembleQuestions()
// response shape (CandidateQuestion, not the mock QUESTIONS array below),
// real --hm-* design tokens (not the placeholder hex T object), and an
// added empty-pool fallback state not covered by this mockup. Also uses
// plain CSS classes (.pb-*) in app/globals.css, not Tailwind -- same reason
// as PaperBuilderMockup.jsx: this project has no Tailwind dependency.

import React, { useState } from "react";
import { ArrowLeft, RefreshCw, AlertTriangle, Calculator, Clock, ChevronDown, ChevronUp, Download } from "lucide-react";

/* ---------------------------------------------------------
   TOKENS — corrected per Code's note: the real site uses a
   consistent 10px radius, not pill buttons. Swap in the exact
   hex values from the live hanmath.com CSS when wiring this in.
--------------------------------------------------------- */
const T = {
  cream: "#FAF6EC",
  creamDeep: "#F1EADA",
  navy: "#1C2A44",
  navySoft: "#2E3F63",
  ink: "#3A3226",
  inkSoft: "#7A6F5D",
  gold: "#C89B3C",
  goldLight: "#E4C878",
  goldPale: "#F4E9CC",
  line: "#E3D9C3",
};
const R = "10px"; // corrected radius, matches real site

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap');
`;

/* ---------------------------------------------------------
   MOCK assembled data — shape matches what the real
   assembleQuestions() output would need to provide.
   In the real build this comes from the Generate paper call,
   not a hardcoded array.
--------------------------------------------------------- */
const PAPER = {
  level: "HL",
  paper: "P2",
  minutes: 120,
  targetMarks: 110,
  assembledMarks: 45,
  calculator: true,
};

const QUESTIONS = [
  {
    id: 1,
    topicCode: "AA4.5",
    topicName: "Probability concepts",
    difficulty: "medium",
    marks: 12,
    text: "A bag contains 5 red balls and 3 blue balls. Two balls are drawn at random without replacement. Find the probability that both balls are the same colour.",
    solution:
      "P(same colour) = P(RR) + P(BB) = (5/8 × 4/7) + (3/8 × 2/7) = 20/56 + 6/56 = 26/56 = 13/28.",
  },
  {
    id: 2,
    topicCode: "AA3.13",
    topicName: "Scalar (dot) product",
    difficulty: "hard",
    marks: 15,
    text: "Vectors a and b satisfy |a| = 4, |b| = 5, and the angle between them is 60°. Find a · b, and hence find |a + b|.",
    solution:
      "a · b = |a||b|cos(60°) = 4 × 5 × 0.5 = 10.\n|a + b|² = |a|² + 2(a·b) + |b|² = 16 + 20 + 25 = 61, so |a + b| = √61 ≈ 7.81.",
  },
  {
    id: 3,
    topicCode: "AA4.1",
    topicName: "Sampling & bias",
    difficulty: "easy",
    marks: 8,
    text: "A researcher wants to survey 40 students from a school of 640, stratified by year group. Year 10 has 220 students. Calculate how many Year 10 students should be sampled.",
    solution: "220/640 × 40 = 13.75 ≈ 14 students.",
  },
  {
    id: 4,
    topicCode: "AA3.13",
    topicName: "Scalar (dot) product",
    difficulty: "medium",
    marks: 10,
    text: "Find the angle between the vectors u = (3, -1, 2) and v = (1, 4, -2), giving your answer correct to 1 decimal place.",
    solution:
      "u · v = 3 - 4 - 4 = -5. |u| = √14, |v| = √21.\ncos θ = -5 / (√14 × √21) ≈ -0.2915, so θ ≈ 107.0°.",
  },
];

function Eyebrow({ children }) {
  return (
    <div
      className="text-xs font-semibold mb-2"
      style={{
        fontFamily: "Inter, sans-serif",
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: T.gold,
      }}
    >
      {children}
    </div>
  );
}

function DifficultyBadge({ level }) {
  const map = {
    easy: { bg: "#E8EFE4", fg: "#4C6B3C", label: "Easy" },
    medium: { bg: T.goldPale, fg: "#8A6A1F", label: "Medium" },
    hard: { bg: "#F3E1DE", fg: "#A24A3A", label: "Hard" },
  };
  const s = map[level];
  return (
    <span
      className="text-xs font-semibold px-2 py-0.5"
      style={{
        background: s.bg,
        color: s.fg,
        borderRadius: R,
        letterSpacing: "0.04em",
      }}
    >
      {s.label.toUpperCase()}
    </span>
  );
}

function QuestionCard({ q, index, forcePrintSolution }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="print-card p-5 mb-4"
      style={{ background: "#fff", border: `1px solid ${T.line}`, borderRadius: R }}
    >
      <div
        className="flex flex-wrap items-center gap-2 mb-3 text-xs"
        style={{
          fontFamily: "Inter, sans-serif",
          letterSpacing: "0.06em",
          color: T.inkSoft,
        }}
      >
        <span className="font-semibold" style={{ color: T.navy }}>
          QUESTION {index + 1}
        </span>
        <span>·</span>
        <span>{q.topicCode} — {q.topicName}</span>
        <span>·</span>
        <DifficultyBadge level={q.difficulty} />
        <span>·</span>
        <span>{q.marks} MARKS</span>
      </div>

      <p style={{ fontFamily: "Inter, sans-serif", color: T.ink, lineHeight: 1.6 }}>
        {q.text}
      </p>

      <button
        onClick={() => setOpen((o) => !o)}
        className="no-print mt-4 px-4 py-2 text-sm font-semibold flex items-center gap-2 transition-all"
        style={{
          fontFamily: "Inter, sans-serif",
          background: open ? T.navy : "#fff",
          color: open ? T.cream : T.navy,
          border: `1.5px solid ${T.navy}`,
          borderRadius: R,
        }}
      >
        {open ? "Hide solution" : "Reveal solution"}
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {open && (
        <div
          className="no-print mt-4 p-4 text-sm"
          style={{
            background: T.creamDeep,
            borderRadius: R,
            color: T.ink,
            whiteSpace: "pre-line",
            lineHeight: 1.6,
          }}
        >
          {q.solution}
        </div>
      )}

      {/* Print-only solution block — independent of on-screen toggle state,
          controlled entirely by the "Include solutions" checkbox via CSS */}
      <div
        className="print-solution hidden mt-4 p-4 text-sm"
        style={{
          background: "#f5f5f5",
          borderRadius: R,
          color: T.ink,
          whiteSpace: "pre-line",
          lineHeight: 1.6,
        }}
      >
        <strong>Solution:</strong> {q.solution}
      </div>
    </div>
  );
}

export default function ResultsScreen() {
  const [includeSolutions, setIncludeSolutions] = useState(false);
  const shortfall = PAPER.targetMarks - PAPER.assembledMarks;
  const pct = Math.round((PAPER.assembledMarks / PAPER.targetMarks) * 100);

  const handleDownload = () => {
    window.print();
  };

  return (
    <div
      className="min-h-full w-full"
      style={{ background: T.cream, fontFamily: "Inter, sans-serif", color: T.ink }}
    >
      <style>{FONTS}</style>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .print-card { break-inside: avoid; border: 1px solid #ccc !important; }
          .print-solution { display: ${includeSolutions ? "block" : "none"} !important; }
        }
      `}</style>

      <div className="max-w-3xl mx-auto px-6 py-10">
        <button
          className="no-print flex items-center gap-1.5 text-sm font-medium mb-6"
          style={{ color: T.navySoft }}
        >
          <ArrowLeft size={15} /> Back to topic selection
        </button>

        <div className="flex flex-wrap items-start justify-between gap-4 mb-2">
          <div>
            <Eyebrow>Hanmath · Your Paper</Eyebrow>
            <h1
              style={{ fontFamily: "Fraunces, serif", fontWeight: 600, color: T.navy }}
              className="text-3xl"
            >
              {PAPER.level} · {PAPER.paper}
            </h1>
          </div>

          <div className="no-print flex items-center gap-3">
            <label
              className="flex items-center gap-2 text-sm px-3 py-2"
              style={{ background: "#fff", border: `1px solid ${T.line}`, borderRadius: R }}
            >
              <input
                type="checkbox"
                checked={includeSolutions}
                onChange={() => setIncludeSolutions((v) => !v)}
                className="w-4 h-4"
              />
              Include solutions
            </label>
            <button
              onClick={handleDownload}
              className="px-4 py-2 text-sm font-semibold flex items-center gap-2"
              style={{ background: T.navy, color: T.cream, borderRadius: R }}
            >
              <Download size={15} />
              Download PDF
            </button>
          </div>
        </div>

        <div
          className="flex flex-wrap items-center gap-4 text-sm mb-6 mt-4"
          style={{ color: T.inkSoft }}
        >
          <span className="flex items-center gap-1">
            <Clock size={14} /> {PAPER.minutes} min
          </span>
          <span className="flex items-center gap-1">
            <Calculator size={14} /> {PAPER.calculator ? "Calculator allowed" : "No calculator"}
          </span>
          <span>
            {PAPER.assembledMarks} of {PAPER.targetMarks} target marks assembled
          </span>
        </div>

        {/* Honest shortfall banner */}
        {shortfall > 0 && (
          <div
            className="no-print flex gap-3 p-4 mb-8"
            style={{ background: T.goldPale, borderRadius: R, border: `1px solid ${T.gold}` }}
          >
            <AlertTriangle size={18} color="#8A6A1F" style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ color: "#5C4A1C", fontSize: "0.9rem", lineHeight: 1.5 }}>
              <strong>This paper is shorter than a real exam.</strong> The question pool for your
              selected topics only had enough published questions to reach {pct}% of the target
              ({PAPER.assembledMarks} of {PAPER.targetMarks} marks). This will fill out as more
              questions are added — for now, treat this as focused topic practice rather than a
              full timed mock.
            </div>
          </div>
        )}

        {/* Questions */}
        <div>
          {QUESTIONS.map((q, i) => (
            <QuestionCard key={q.id} q={q} index={i} forcePrintSolution={includeSolutions} />
          ))}
        </div>

        {/* Footer actions */}
        <div className="no-print flex flex-wrap gap-3 mt-8">
          <button
            className="px-5 py-2.5 font-semibold flex items-center gap-2"
            style={{
              background: T.gold,
              color: T.navy,
              borderRadius: R,
            }}
          >
            <RefreshCw size={15} />
            Generate a new paper
          </button>
          <button
            className="px-5 py-2.5 font-semibold"
            style={{
              background: "#fff",
              color: T.navy,
              border: `1.5px solid ${T.line}`,
              borderRadius: R,
            }}
          >
            Change topics
          </button>
        </div>
      </div>
    </div>
  );
}
