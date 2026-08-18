'use client';

import { useState } from 'react';
import { ArrowLeft, RefreshCw, AlertTriangle, Calculator, Clock, ChevronDown, ChevronUp, Download } from 'lucide-react';
import { useMathJaxTypeset } from '@/lib/useMathJaxTypeset';
import type { AssembledPaper, CandidateQuestion } from '@/lib/paperAssembly';

export type PaperKey = 'P1' | 'P2' | 'P3';
export type GenerateRow =
  | { paper: PaperKey; skipped: true }
  | ({ paper: PaperKey; skipped?: false } & AssembledPaper)
  | { error: string };

interface PaperMeta {
  minutes: number;
  calculatorAllowed: boolean;
}

function DifficultyBadge({ level }: { level: CandidateQuestion['difficulty'] }) {
  const label = level === 'easy' ? 'Easy' : level === 'medium' ? 'Medium' : 'Hard';
  return <span className={`pb-difficulty-badge pb-difficulty-${level}`}>{label.toUpperCase()}</span>;
}

function QuestionCard({ q, index }: { q: CandidateQuestion; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pb-question-card">
      <div className="pb-question-tag-row">
        <strong>QUESTION {index + 1}</strong>
        <span>&middot;</span>
        <span>
          {q.topic_code} &mdash; {q.topic_name}
        </span>
        <span>&middot;</span>
        <DifficultyBadge level={q.difficulty} />
        <span>&middot;</span>
        <span>{q.total_marks} MARKS</span>
      </div>

      <div className="math-block" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
        {q.question_text}
      </div>

      {q.needs_diagram && q.diagram_svg && (
        <div
          className="diagram-wrap"
          style={{ margin: '1rem 0', maxWidth: 420 }}
          // Diagram SVGs are admin-authored content from our own generation
          // pipeline, never user-supplied -- safe to inject (same as page.tsx).
          dangerouslySetInnerHTML={{ __html: q.diagram_svg }}
        />
      )}

      <button className="reveal-btn pb-no-print" data-revealed={open} onClick={() => setOpen((o) => !o)} style={{ marginTop: '0.9rem' }}>
        {open ? 'Hide solution' : 'Reveal solution'}
        {open ? <ChevronUp size={14} style={{ marginLeft: 4, verticalAlign: 'text-bottom' }} /> : <ChevronDown size={14} style={{ marginLeft: 4, verticalAlign: 'text-bottom' }} />}
      </button>

      {open && (
        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px dashed var(--hm-border)' }}>
          <div className="math-block" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
            {q.proposed_solution}
          </div>
          <div style={{ marginTop: '0.75rem', fontWeight: 700, color: 'var(--hm-navy)' }}>Final answer: {q.final_answer}</div>
        </div>
      )}

      {/* Print-only solution block -- independent of the on-screen Reveal
          toggle, controlled entirely by the "Include solutions" checkbox
          via the data-include-solutions attribute + CSS (see globals.css). */}
      <div className="pb-print-solution math-block" style={{ whiteSpace: 'pre-wrap' }}>
        <strong>Solution:</strong> {q.proposed_solution}
        <div style={{ marginTop: '0.5rem', fontWeight: 700 }}>Final answer: {q.final_answer}</div>
      </div>
    </div>
  );
}

function PaperSection({ paperCode, meta, assembled }: { paperCode: PaperKey; meta: PaperMeta; assembled: AssembledPaper }) {
  const { questions, totalMarks, targetMarks } = assembled;
  const shortfall = targetMarks - totalMarks;
  const pct = targetMarks > 0 ? Math.round((totalMarks / targetMarks) * 100) : 0;
  const isEmpty = questions.length === 0;

  return (
    <section className="pb-section">
      <h2 style={{ fontFamily: 'var(--hm-font-serif)', fontWeight: 700, fontSize: '1.4rem', color: 'var(--hm-navy)', margin: 0 }}>
        {paperCode === 'P1' ? 'Paper 1' : paperCode === 'P2' ? 'Paper 2' : 'Paper 3'}
      </h2>
      <div className="pb-paper-meta-row">
        <span>
          <Clock size={14} /> {meta.minutes} min
        </span>
        <span>
          <Calculator size={14} /> {meta.calculatorAllowed ? 'Calculator allowed' : 'No calculator'}
        </span>
        <span>
          {totalMarks} of {targetMarks} target marks assembled
        </span>
      </div>

      {isEmpty ? (
        <div className="pb-banner pb-banner-empty pb-no-print">
          <AlertTriangle size={18} color="#a24a3a" style={{ flexShrink: 0, marginTop: 2 }} />
          <p>
            <strong>No questions available yet for this selection.</strong> None of your chosen topics have published{' '}
            {meta.calculatorAllowed ? 'calculator' : 'non-calculator'} questions at this level yet. Try selecting different topics, or
            switch level/paper.
          </p>
        </div>
      ) : (
        shortfall > 0 && (
          <div className="pb-banner pb-banner-shortfall pb-no-print">
            <AlertTriangle size={18} color="#8a6a1f" style={{ flexShrink: 0, marginTop: 2 }} />
            <p>
              <strong>This paper is shorter than a real exam.</strong> The question pool for your selected topics only had enough
              published questions to reach {pct}% of the target ({totalMarks} of {targetMarks} marks). This will fill out as more
              questions are added &mdash; for now, treat this as focused topic practice rather than a full timed mock.
            </p>
          </div>
        )
      )}

      {questions.map((q, i) => (
        <QuestionCard key={q.id} q={q} index={i} />
      ))}
    </section>
  );
}

export function ResultsView({
  results,
  paperMeta,
  level,
  onBack,
  onRegenerate,
}: {
  results: GenerateRow[];
  paperMeta: Record<PaperKey, PaperMeta>;
  level: 'SL' | 'HL';
  onBack: () => void;
  onRegenerate: () => void;
}) {
  const [includeSolutions, setIncludeSolutions] = useState(false);
  useMathJaxTypeset([results]);

  const handleDownload = () => window.print();

  return (
    <main className="pb-container" data-include-solutions={includeSolutions} style={{ fontFamily: 'var(--hm-font-sans)', color: 'var(--hm-body)' }}>
      <button className="pb-back-link pb-no-print" onClick={onBack}>
        <ArrowLeft size={15} /> Back to topic selection
      </button>

      <div className="pb-row-between" style={{ marginBottom: '0.5rem', alignItems: 'flex-start' }}>
        <div>
          <h1 className="hm-overline" style={{ margin: '0 0 0.25rem' }}>
            Hanmath &middot; Your Paper
          </h1>
          <div style={{ fontFamily: 'var(--hm-font-serif)', fontWeight: 700, fontSize: '1.8rem', color: 'var(--hm-navy)' }}>{level}</div>
        </div>

        <div className="pb-results-toolbar pb-no-print">
          <label className="pb-solutions-toggle">
            <input type="checkbox" checked={includeSolutions} onChange={() => setIncludeSolutions((v) => !v)} style={{ width: 16, height: 16 }} />
            Include solutions
          </label>
          <button className="pb-download-btn" onClick={handleDownload}>
            <Download size={15} />
            Download PDF
          </button>
        </div>
      </div>

      {results.map((r, i) => {
        if ('error' in r) {
          return (
            <div key={i} className="pb-banner pb-banner-empty pb-no-print">
              <AlertTriangle size={18} color="#a24a3a" style={{ flexShrink: 0, marginTop: 2 }} />
              <p>
                <strong>Something went wrong generating this paper.</strong> {r.error}
              </p>
            </div>
          );
        }
        if (r.skipped) {
          return (
            <div key={i} className="pb-banner pb-banner-empty pb-no-print">
              <AlertTriangle size={18} color="#a24a3a" style={{ flexShrink: 0, marginTop: 2 }} />
              <p>
                <strong>{r.paper}: not generated.</strong> The question pool doesn&rsquo;t have Paper 3-shaped content yet.
              </p>
            </div>
          );
        }
        return <PaperSection key={i} paperCode={r.paper} meta={paperMeta[r.paper]} assembled={r} />;
      })}

      <div className="pb-footer-actions pb-no-print">
        <button className="pb-footer-btn-primary" onClick={onRegenerate}>
          <RefreshCw size={15} />
          Generate a new paper
        </button>
        <button className="pb-footer-btn-secondary" onClick={onBack}>
          Change topics
        </button>
      </div>
    </main>
  );
}
