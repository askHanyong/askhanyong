'use client';

import { useState, useMemo, useEffect } from 'react';
import { Check, Calculator, Clock, Sparkles, Lock, Shuffle, ChevronRight } from 'lucide-react';
import {
  fetchThemes,
  assembleQuestions,
  type Theme,
  type DifficultyMix,
  type PaperCode,
  type AssembledPaper,
} from '@/lib/paperAssembly';

// Colors/fonts/layout below reference the brand CSS custom properties and
// .pb-* classes defined in app/globals.css (pulled from hanmath.com's live
// production bundle, not guessed -- see that file's comments). This page
// deliberately uses plain CSS, not Tailwind: the project has no Tailwind
// dependency anywhere else (see .topic-btn/.question-card in globals.css),
// so Tailwind utility classes here would silently be no-ops. Two corrections
// from the original mockup's placeholder values worth noting: Fraunces was
// a guess (real serif is Cormorant Garamond), and "rounded-full" pill
// buttons were a guess (the real site uses one consistent 10px radius
// everywhere, not fully rounded).

type Level = 'SL' | 'HL';

const PAPER_INFO: Record<Level, Partial<Record<PaperCode | 'P3', { label: string; sub: string; minutes: number; marks: number }>>> = {
  SL: {
    P1: { label: 'Paper 1', sub: 'No calculator', minutes: 90, marks: 80 },
    P2: { label: 'Paper 2', sub: 'Calculator allowed', minutes: 90, marks: 80 },
  },
  HL: {
    P1: { label: 'Paper 1', sub: 'No calculator', minutes: 120, marks: 110 },
    P2: { label: 'Paper 2', sub: 'Calculator allowed', minutes: 120, marks: 110 },
    P3: { label: 'Paper 3', sub: 'Calculator · HL only', minutes: 60, marks: 55 },
  },
};

function PillToggle<V extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
}) {
  return (
    <div className="pb-pill-track">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className="pb-pill-btn"
            style={{ background: active ? 'var(--hm-navy)' : 'transparent', color: active ? 'var(--hm-cream)' : 'var(--hm-muted)' }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <h2 className="hm-overline">{children}</h2>;
}

type PaperKey = 'P1' | 'P2' | 'P3';
type GenerateRow =
  | { paper: PaperKey; skipped: true }
  | ({ paper: PaperKey; skipped?: false } & AssembledPaper)
  | { error: string };

export default function PaperBuilderPage() {
  const [level, setLevel] = useState<Level>('SL');
  const [papers, setPapers] = useState<Record<PaperKey, boolean>>({ P1: true, P2: false, P3: false });
  const [themes, setThemes] = useState<Theme[]>([]);
  const [themesLoading, setThemesLoading] = useState(true);
  const [themesError, setThemesError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [weighted, setWeighted] = useState(true);
  const [difficulty, setDifficulty] = useState<DifficultyMix>('balanced');
  const [generating, setGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState<GenerateRow[] | null>(null);

  useEffect(() => {
    fetchThemes()
      .then((t) => {
        setThemes(t);
        setSelected(new Set(t.filter((th) => th.topics.some((x) => x.live)).map((th) => th.name)));
      })
      .catch((err) => setThemesError(err.message))
      .finally(() => setThemesLoading(false));
  }, []);

  const availablePapers = Object.keys(PAPER_INFO[level]) as PaperKey[];

  const togglePaper = (key: PaperKey) => {
    if (key === 'P3' && level !== 'HL') return;
    setPapers((p) => ({ ...p, [key]: !p[key] }));
  };

  const toggleTheme = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const summary = useMemo(() => {
    const chosen = availablePapers.filter((k) => papers[k]);
    const minutes = chosen.reduce((s, k) => s + (PAPER_INFO[level][k]?.minutes ?? 0), 0);
    const marks = chosen.reduce((s, k) => s + (PAPER_INFO[level][k]?.marks ?? 0), 0);
    return { chosen, minutes, marks };
  }, [papers, level, availablePapers]);

  const themeStats = themes.map((theme) => ({
    ...theme,
    liveCount: theme.topics.filter((t) => t.live).length,
    totalCount: theme.topics.length,
  }));

  // Calls the real assembly query (lib/paperAssembly.ts) per selected paper
  // and shows a plain count/marks summary inline -- deliberately NOT a
  // designed results screen (explicitly flagged as its own not-yet-started
  // mockup pass). P3 is skipped: the pool has no P3-shaped content yet.
  async function handleGenerate() {
    setGenerating(true);
    setGenerateResult(null);
    try {
      const themeNames = Array.from(selected);
      const results: GenerateRow[] = [];
      for (const paper of summary.chosen) {
        if (paper === 'P3') {
          results.push({ paper, skipped: true });
          continue;
        }
        const assembled = await assembleQuestions({ level, paper, themeNames, difficultyMix: difficulty });
        results.push({ paper, ...assembled });
      }
      setGenerateResult(results);
    } catch (err) {
      setGenerateResult([{ error: (err as Error).message }]);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <main className="pb-container" style={{ fontFamily: 'var(--hm-font-sans)', color: 'var(--hm-body)' }}>
      <Eyebrow>Hanmath &middot; Paper Generator</Eyebrow>
      <h1 style={{ fontFamily: 'var(--hm-font-serif)', fontWeight: 700, fontSize: '2.25rem', color: 'var(--hm-navy)', margin: '0 0 0.5rem' }}>
        Build your paper
      </h1>
      <p style={{ color: 'var(--hm-muted)', marginTop: 0, marginBottom: '2.5rem' }}>
        Choose your level, pick your papers, and curate the topics you want to practise. We&rsquo;ll assemble real
        exam-style questions to match.
      </p>

      <section className="pb-section">
        <Eyebrow>Step 1 &mdash; Level</Eyebrow>
        <PillToggle
          value={level}
          onChange={(v) => {
            setLevel(v);
            if (v === 'SL') setPapers((p) => ({ ...p, P3: false }));
          }}
          options={[
            { value: 'SL', label: 'Standard Level' },
            { value: 'HL', label: 'Higher Level' },
          ]}
        />
      </section>

      <section className="pb-section">
        <Eyebrow>Step 2 &mdash; Paper</Eyebrow>
        <div className="pb-card-row">
          {(['P1', 'P2', 'P3'] as PaperKey[]).map((key) => {
            const info = PAPER_INFO[level][key] ?? PAPER_INFO.HL[key];
            if (!info) return null;
            const disabled = key === 'P3' && level !== 'HL';
            const active = !disabled && papers[key];
            return (
              <button
                key={key}
                disabled={disabled}
                onClick={() => togglePaper(key)}
                className="pb-paper-card"
                style={{
                  background: disabled ? 'var(--hm-border)' : active ? 'var(--hm-navy)' : '#fff',
                  border: `1.5px solid ${active ? 'var(--hm-navy)' : 'var(--hm-border)'}`,
                  opacity: disabled ? 0.45 : 1,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                }}
              >
                <div className="pb-row-between" style={{ marginBottom: '0.5rem' }}>
                  <span style={{ fontWeight: 600, color: active ? 'var(--hm-cream)' : 'var(--hm-navy)' }}>{info.label}</span>
                  {active && <Check size={16} color="var(--hm-gold-light)" />}
                </div>
                <div className="pb-flex-gap" style={{ fontSize: '0.75rem', marginBottom: '0.5rem', color: active ? 'var(--hm-gold-light)' : 'var(--hm-muted)' }}>
                  <Calculator size={12} />
                  {info.sub}
                </div>
                <div className="pb-flex-gap" style={{ fontSize: '0.75rem', gap: '0.75rem', color: active ? '#C9D2E3' : 'var(--hm-muted)' }}>
                  <span className="pb-flex-gap" style={{ gap: '0.25rem' }}>
                    <Clock size={12} /> {info.minutes} min
                  </span>
                  <span>{info.marks} marks</span>
                </div>
                {disabled && (
                  <div style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: 'var(--hm-muted)' }}>HL only</div>
                )}
                {key === 'P3' && !disabled && (
                  <div style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: active ? 'var(--hm-gold-light)' : 'var(--hm-muted)' }}>
                    Not yet generated from the pool
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <section className="pb-section">
        <div className="pb-row-between" style={{ marginBottom: '0.25rem' }}>
          <Eyebrow>Step 3 &mdash; Choose topics</Eyebrow>
          <span style={{ fontSize: '0.75rem', color: 'var(--hm-muted)' }}>
            {selected.size} of {themes.length} selected
          </span>
        </div>
        <p style={{ fontSize: '0.9rem', marginBottom: '1rem', color: 'var(--hm-muted)' }}>
          Pick the broad areas you want to practise. Behind the scenes we&rsquo;ll draw questions from the specific
          sub-topics tagged within each one.
        </p>

        {themesLoading && <p style={{ fontSize: '0.9rem', color: 'var(--hm-muted)' }}>Loading topics&hellip;</p>}
        {themesError && <p style={{ fontSize: '0.9rem', color: 'crimson' }}>Failed to load topics: {themesError}</p>}

        <div className="pb-card-row">
          {themeStats.map((theme, i) => {
            const active = selected.has(theme.name);
            return (
              <button
                key={theme.name}
                onClick={() => toggleTheme(theme.name)}
                className="pb-topic-card"
                style={{ background: active ? 'var(--hm-navy)' : '#fff', border: `1.5px solid ${active ? 'var(--hm-navy)' : 'var(--hm-border)'}` }}
              >
                <div className="pb-row-between" style={{ marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.1em', color: active ? 'var(--hm-gold-light)' : 'var(--hm-gold)' }}>
                    TOPIC {i + 1}
                  </span>
                  {active && <Check size={16} color="var(--hm-gold-light)" />}
                </div>
                <div style={{ fontFamily: 'var(--hm-font-serif)', fontWeight: 700, fontSize: '1.05rem', marginBottom: '0.4rem', color: active ? 'var(--hm-cream)' : 'var(--hm-navy)' }}>
                  {theme.name}
                </div>
                <div style={{ fontSize: '0.75rem', color: active ? '#C9D2E3' : 'var(--hm-muted)' }}>
                  {theme.liveCount} of {theme.totalCount} sub-topics available now
                </div>
              </button>
            );
          })}
        </div>

        <label className="pb-weighted-row" style={{ background: 'var(--hm-gold-pale)' }}>
          <input type="checkbox" checked={weighted} onChange={() => setWeighted((w) => !w)} style={{ width: 16, height: 16 }} />
          <Shuffle size={15} color="var(--hm-navy)" />
          <span style={{ fontSize: '0.9rem', color: 'var(--hm-navy)' }}>
            Within each topic, mix sub-topics by real exam frequency rather than evenly
          </span>
        </label>
      </section>

      <section className="pb-section">
        <Eyebrow>Step 4 &mdash; Difficulty mix</Eyebrow>
        <div className="pb-difficulty-row">
          {(
            [
              { v: 'gentle', l: 'Gentle' },
              { v: 'balanced', l: 'Exam-balanced' },
              { v: 'stretch', l: 'Stretch' },
            ] as { v: DifficultyMix; l: string }[]
          ).map((d) => (
            <button
              key={d.v}
              onClick={() => setDifficulty(d.v)}
              className="pb-difficulty-btn"
              style={{
                background: difficulty === d.v ? 'var(--hm-navy)' : '#fff',
                color: difficulty === d.v ? 'var(--hm-cream)' : 'var(--hm-body)',
                border: `1px solid ${difficulty === d.v ? 'var(--hm-navy)' : 'var(--hm-border)'}`,
              }}
            >
              {d.l}
            </button>
          ))}
        </div>
      </section>

      <section className="pb-summary-bar" style={{ background: 'var(--hm-navy)' }}>
        <div>
          <div style={{ fontSize: '0.75rem', marginBottom: '0.25rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--hm-gold-light)' }}>
            Your paper
          </div>
          <div style={{ fontSize: '0.9rem', color: 'var(--hm-cream)' }}>
            {summary.chosen.length === 0
              ? 'Select at least one paper to continue'
              : `${level} · ${summary.chosen.join(' + ')} · ${summary.minutes} min · ${summary.marks} marks`}
          </div>
        </div>
        <button
          disabled={summary.chosen.length === 0 || generating}
          onClick={handleGenerate}
          className="pb-generate-btn"
          style={{
            background: summary.chosen.length === 0 ? 'var(--hm-navy-soft)' : 'var(--hm-gold)',
            color: summary.chosen.length === 0 ? '#8891A5' : 'var(--hm-navy)',
            cursor: summary.chosen.length === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          <Sparkles size={16} />
          {generating ? 'Generating…' : 'Generate paper'}
          <ChevronRight size={16} />
        </button>
      </section>

      {generateResult && (
        <section className="pb-result-box">
          {generateResult.map((r, i) =>
            'error' in r ? (
              <div key={i} style={{ color: 'crimson' }}>
                Error: {r.error}
              </div>
            ) : r.skipped ? (
              <div key={i} style={{ color: 'var(--hm-muted)' }}>
                {r.paper}: not generated (no P3 content in the pool yet).
              </div>
            ) : (
              <div key={i} style={{ color: 'var(--hm-body)', marginBottom: 4 }}>
                {r.paper}: assembled {r.questions.length} question(s), {r.totalMarks} of {r.targetMarks} target marks
                {r.shortOfTarget ? ' (pool ran out before reaching target -- expected while the pool is this small)' : ''}.
              </div>
            )
          )}
        </section>
      )}

      <div className="pb-flex-gap" style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--hm-muted)' }}>
        <Lock size={11} /> 2 of 3 free papers used this month &middot;{' '}
        <span style={{ color: 'var(--hm-gold)', fontWeight: 600, cursor: 'pointer' }}>Upgrade for unlimited</span>{' '}
        (static &mdash; reads/writes hanmath_usage_log once auth is wired, see components/AuthGate.tsx)
      </div>
    </main>
  );
}
