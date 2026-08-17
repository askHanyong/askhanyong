// SUPERSEDED: this file is kept only as the original design reference.
// The real, deployed version is app/paper-builder/page.tsx -- built from
// this file, then corrected in one significant way: this file's Tailwind
// utility classes (grid, sm:grid-cols-2, etc.) are silent no-ops, since
// hanmath-frontend has no Tailwind dependency anywhere (confirmed: no
// config, no @tailwind directive, not in package.json). The deployed page
// uses plain CSS classes in app/globals.css (.pb-*) instead. If you start
// a new mockup from this file, convert its layout classes before assuming
// they'll render as shown here.

import React, { useState, useMemo, useEffect } from "react";
import { Check, Calculator, Clock, Sparkles, Lock, Shuffle, ChevronRight } from "lucide-react";
import { fetchThemes, assembleQuestions } from "../lib/paperAssembly";

/* ---------------------------------------------------------
   TOKENS -- pulled directly from hanmath.com's live production
   CSS/JS bundle (same extraction as the main practice-tool restyle,
   see hanmath-frontend/app/globals.css), NOT guessed. Two corrections
   from the original mockup's placeholder values worth noting:
   - Fraunces was a guess; the real serif is Cormorant Garamond.
   - "rounded-full" pill buttons were a guess; the real site uses a
     single consistent 10px radius everywhere (not fully rounded).
   chartMidNavy/goldLight/goldPale below have no direct real-site
   equivalent (the live site never puts gold-on-navy or a pale-gold
   fill) -- derived from the real design-system's own HSL chart
   tokens rather than invented from scratch, see conversation.
--------------------------------------------------------- */
const T = {
  cream: "#FAF8F4",
  creamDeep: "#E7E2DA",
  navy: "#0E2748",
  navySoft: "#3D5F8F", // derived from the real --chart-4 token (hsl(215 40% 40%))
  ink: "#444444",
  inkSoft: "#707070",
  gold: "#C59B45",
  goldLight: "#D9BC7A", // lightened gold for gold-on-navy contexts (no live-site precedent)
  goldPale: "#F4EDDD", // pale gold fill for the weighted-mix checkbox row (no live-site precedent)
  line: "#E7E2DA",
  radius: 10,
};

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Inter:wght@400;500;600;700&display=swap');
`;

/* ---------------------------------------------------------
   DATA -- paper structure (real IB AA timing/marks). Topic
   taxonomy is now fetched live from syllabus_topics (placeholder
   #2 resolved) instead of the hardcoded THEMES sample.
--------------------------------------------------------- */
const PAPER_INFO = {
  SL: {
    P1: { label: "Paper 1", sub: "No calculator", minutes: 90, marks: 80 },
    P2: { label: "Paper 2", sub: "Calculator allowed", minutes: 90, marks: 80 },
  },
  HL: {
    P1: { label: "Paper 1", sub: "No calculator", minutes: 120, marks: 110 },
    P2: { label: "Paper 2", sub: "Calculator allowed", minutes: 120, marks: 110 },
    P3: { label: "Paper 3", sub: "Calculator · HL only", minutes: 60, marks: 55 },
  },
};

function PillToggle({ options, value, onChange }) {
  return (
    <div
      className="inline-flex p-1"
      style={{ background: T.creamDeep, border: `1px solid ${T.line}`, borderRadius: T.radius }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className="px-5 py-2 text-sm font-semibold transition-all"
            style={{
              fontFamily: "Inter, sans-serif",
              background: active ? T.navy : "transparent",
              color: active ? T.cream : T.inkSoft,
              borderRadius: T.radius,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

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

export default function PaperBuilder() {
  const [level, setLevel] = useState("SL");
  const [papers, setPapers] = useState({ P1: true, P2: false, P3: false });
  const [themes, setThemes] = useState([]); // fetched from syllabus_topics
  const [themesLoading, setThemesLoading] = useState(true);
  const [themesError, setThemesError] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [weighted, setWeighted] = useState(true);
  const [difficulty, setDifficulty] = useState("balanced");
  const [generating, setGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState(null); // per-paper summary, not a full results screen -- that's a separate, not-yet-designed mockup pass

  useEffect(() => {
    fetchThemes()
      .then((t) => {
        setThemes(t);
        // Default selection: themes with at least one live topic, so the
        // builder opens usable rather than empty.
        setSelected(new Set(t.filter((th) => th.topics.some((x) => x.live)).map((th) => th.name)));
      })
      .catch((err) => setThemesError(err.message))
      .finally(() => setThemesLoading(false));
  }, []);

  const availablePapers = Object.keys(PAPER_INFO[level]);

  const togglePaper = (key) => {
    if (key === "P3" && level !== "HL") return;
    setPapers((p) => ({ ...p, [key]: !p[key] }));
  };

  const toggleTheme = (name) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const summary = useMemo(() => {
    const chosen = availablePapers.filter((k) => papers[k]);
    const minutes = chosen.reduce((s, k) => s + PAPER_INFO[level][k].minutes, 0);
    const marks = chosen.reduce((s, k) => s + PAPER_INFO[level][k].marks, 0);
    return { chosen, minutes, marks };
  }, [papers, level]);

  const themeStats = themes.map((theme) => ({
    ...theme,
    liveCount: theme.topics.filter((t) => t.live).length,
    totalCount: theme.topics.length,
  }));

  // Calls the real assembly query (paperAssembly.ts) per selected paper and
  // shows a plain count/marks summary inline -- deliberately NOT a designed
  // results screen (that's explicitly flagged as its own not-yet-started
  // mockup pass). P3 is skipped: the pool has no P3-shaped content yet.
  async function handleGenerate() {
    setGenerating(true);
    setGenerateResult(null);
    try {
      const themeNames = Array.from(selected);
      const results = [];
      for (const paper of summary.chosen) {
        if (paper === "P3") {
          results.push({ paper, skipped: true });
          continue;
        }
        const assembled = await assembleQuestions({ level, paper, themeNames, difficultyMix: difficulty });
        results.push({ paper, ...assembled });
      }
      setGenerateResult(results);
    } catch (err) {
      setGenerateResult([{ error: err.message }]);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div
      className="min-h-full w-full"
      style={{ background: T.cream, fontFamily: "Inter, sans-serif", color: T.ink }}
    >
      <style>{FONTS}</style>

      <div className="max-w-3xl mx-auto px-6 py-10">
        {/* Header */}
        <Eyebrow>Hanmath · Paper Generator</Eyebrow>
        <h1
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontWeight: 700,
            color: T.navy,
          }}
          className="text-4xl mb-2"
        >
          Build your paper
        </h1>
        <p className="mb-10" style={{ color: T.inkSoft }}>
          Choose your level, pick your papers, and curate the topics you want to
          practise. We'll assemble real exam-style questions to match.
        </p>

        {/* Level */}
        <section className="mb-9">
          <div className="flex items-center justify-between mb-3">
            <Eyebrow>Step 1 — Level</Eyebrow>
          </div>
          <PillToggle
            value={level}
            onChange={(v) => {
              setLevel(v);
              if (v === "SL") setPapers((p) => ({ ...p, P3: false }));
            }}
            options={[
              { value: "SL", label: "Standard Level" },
              { value: "HL", label: "Higher Level" },
            ]}
          />
        </section>

        {/* Papers */}
        <section className="mb-9">
          <Eyebrow>Step 2 — Paper</Eyebrow>
          <div className="grid gap-3 sm:grid-cols-3">
            {["P1", "P2", "P3"].map((key) => {
              const info = PAPER_INFO[level][key] ?? PAPER_INFO.HL[key];
              const disabled = key === "P3" && level !== "HL";
              const active = !disabled && papers[key];
              return (
                <button
                  key={key}
                  disabled={disabled}
                  onClick={() => togglePaper(key)}
                  className="text-left p-4 transition-all"
                  style={{
                    background: disabled ? T.creamDeep : active ? T.navy : "#fff",
                    border: `1.5px solid ${active ? T.navy : T.line}`,
                    borderRadius: T.radius,
                    opacity: disabled ? 0.45 : 1,
                    cursor: disabled ? "not-allowed" : "pointer",
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className="font-semibold"
                      style={{ color: active ? T.cream : T.navy }}
                    >
                      {info.label}
                    </span>
                    {active && <Check size={16} color={T.goldLight} />}
                  </div>
                  <div
                    className="flex items-center gap-1 text-xs mb-2"
                    style={{ color: active ? T.goldLight : T.inkSoft }}
                  >
                    <Calculator size={12} />
                    {info.sub}
                  </div>
                  <div
                    className="flex items-center gap-3 text-xs"
                    style={{ color: active ? "#C9D2E3" : T.inkSoft }}
                  >
                    <span className="flex items-center gap-1">
                      <Clock size={12} /> {info.minutes} min
                    </span>
                    <span>{info.marks} marks</span>
                  </div>
                  {disabled && (
                    <div className="text-xs mt-2" style={{ color: T.inkSoft }}>
                      HL only
                    </div>
                  )}
                  {key === "P3" && !disabled && (
                    <div className="text-xs mt-2" style={{ color: active ? T.goldLight : T.inkSoft }}>
                      Not yet generated from the pool
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* Topics */}
        <section className="mb-9">
          <div className="flex items-center justify-between mb-1">
            <Eyebrow>Step 3 — Choose topics</Eyebrow>
            <span className="text-xs" style={{ color: T.inkSoft }}>
              {selected.size} of {themes.length} selected
            </span>
          </div>
          <p className="text-sm mb-4" style={{ color: T.inkSoft }}>
            Pick the broad areas you want to practise. Behind the scenes we'll
            draw questions from the specific sub-topics tagged within each one.
          </p>

          {themesLoading && <p className="text-sm" style={{ color: T.inkSoft }}>Loading topics…</p>}
          {themesError && <p className="text-sm" style={{ color: "crimson" }}>Failed to load topics: {themesError}</p>}

          <div className="grid gap-3 sm:grid-cols-2">
            {themeStats.map((theme, i) => {
              const active = selected.has(theme.name);
              return (
                <button
                  key={theme.name}
                  onClick={() => toggleTheme(theme.name)}
                  className="text-left p-4 transition-all"
                  style={{
                    background: active ? T.navy : "#fff",
                    border: `1.5px solid ${active ? T.navy : T.line}`,
                    borderRadius: T.radius,
                  }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <span
                      className="text-xs font-semibold"
                      style={{
                        letterSpacing: "0.1em",
                        color: active ? T.goldLight : T.gold,
                      }}
                    >
                      TOPIC {i + 1}
                    </span>
                    {active && <Check size={16} color={T.goldLight} />}
                  </div>
                  <div
                    className="font-semibold mb-1.5"
                    style={{
                      fontFamily: "'Cormorant Garamond', serif",
                      fontSize: "1.05rem",
                      color: active ? T.cream : T.navy,
                    }}
                  >
                    {theme.name}
                  </div>
                  <div
                    className="text-xs"
                    style={{ color: active ? "#C9D2E3" : T.inkSoft }}
                  >
                    {theme.liveCount} of {theme.totalCount} sub-topics available now
                  </div>
                </button>
              );
            })}
          </div>

          <label
            className="mt-5 flex items-center gap-3 p-3 cursor-pointer"
            style={{ background: T.goldPale, borderRadius: T.radius }}
          >
            <input
              type="checkbox"
              checked={weighted}
              onChange={() => setWeighted((w) => !w)}
              className="w-4 h-4"
            />
            <Shuffle size={15} color={T.navy} />
            <span className="text-sm" style={{ color: T.navy }}>
              Within each topic, mix sub-topics by real exam frequency rather
              than evenly
            </span>
          </label>
        </section>

        {/* Difficulty */}
        <section className="mb-9">
          <Eyebrow>Step 4 — Difficulty mix</Eyebrow>
          <div className="flex gap-2">
            {[
              { v: "gentle", l: "Gentle" },
              { v: "balanced", l: "Exam-balanced" },
              { v: "stretch", l: "Stretch" },
            ].map((d) => (
              <button
                key={d.v}
                onClick={() => setDifficulty(d.v)}
                className="px-4 py-2 text-sm font-medium"
                style={{
                  background: difficulty === d.v ? T.navy : "#fff",
                  color: difficulty === d.v ? T.cream : T.ink,
                  border: `1px solid ${difficulty === d.v ? T.navy : T.line}`,
                  borderRadius: T.radius,
                }}
              >
                {d.l}
              </button>
            ))}
          </div>
        </section>

        {/* Summary + CTA */}
        <section
          className="p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
          style={{ background: T.navy, borderRadius: T.radius }}
        >
          <div>
            <div
              className="text-xs mb-1"
              style={{ letterSpacing: "0.1em", textTransform: "uppercase", color: T.goldLight }}
            >
              Your paper
            </div>
            <div className="text-sm" style={{ color: T.cream }}>
              {summary.chosen.length === 0
                ? "Select at least one paper to continue"
                : `${level} · ${summary.chosen.join(" + ")} · ${summary.minutes} min · ${summary.marks} marks`}
            </div>
          </div>
          <button
            disabled={summary.chosen.length === 0 || generating}
            onClick={handleGenerate}
            className="px-6 py-3 font-semibold flex items-center justify-center gap-2 transition-all"
            style={{
              background: summary.chosen.length === 0 ? T.navySoft : T.gold,
              color: summary.chosen.length === 0 ? "#8891A5" : T.navy,
              cursor: summary.chosen.length === 0 ? "not-allowed" : "pointer",
              borderRadius: T.radius,
            }}
          >
            <Sparkles size={16} />
            {generating ? "Generating…" : "Generate paper"}
            <ChevronRight size={16} />
          </button>
        </section>

        {/* Plain assembly summary -- placeholder for the real results screen,
            which needs its own design pass before this goes further. */}
        {generateResult && (
          <section className="mt-4 p-4 text-sm" style={{ background: "#fff", border: `1px solid ${T.line}`, borderRadius: T.radius }}>
            {generateResult.map((r, i) =>
              r.error ? (
                <div key={i} style={{ color: "crimson" }}>Error: {r.error}</div>
              ) : r.skipped ? (
                <div key={i} style={{ color: T.inkSoft }}>{r.paper}: not generated (no P3 content in the pool yet).</div>
              ) : (
                <div key={i} style={{ color: T.ink, marginBottom: 4 }}>
                  {r.paper}: assembled {r.questions.length} question(s), {r.totalMarks} of {r.targetMarks} target marks
                  {r.shortOfTarget ? " (pool ran out before reaching target -- expected while the pool is this small)" : ""}.
                </div>
              )
            )}
          </section>
        )}

        <div className="mt-4 text-xs flex items-center gap-1.5" style={{ color: T.inkSoft }}>
          <Lock size={11} /> 2 of 3 free papers used this month ·{" "}
          <span style={{ color: T.gold, fontWeight: 600, cursor: "pointer" }}>
            Upgrade for unlimited
          </span>
          {" "}(static -- reads/writes hanmath_usage_log once auth is wired, see AuthGate.tsx)
        </div>
      </div>
    </div>
  );
}
