'use client';

import { useEffect, useState } from 'react';
import {
  fetchEnabledTopics,
  fetchPublishedQuestionsForTopic,
  type SyllabusTopic,
  type GeneratedQuestion,
} from '@/lib/supabaseClient';
import { useMathJaxTypeset } from '@/lib/useMathJaxTypeset';

// syllabus_topics.level_scope is stored as 'SL' | 'AHL' (unchanged) --
// this only maps it to the label shown in the UI. SL content is studied by
// both SL and HL students, so 'SL' reads as "HL/SL"; 'AHL' (additional HL
// content) reads as "HL only".
function levelScopeLabel(levelScope: SyllabusTopic['level_scope']): string {
  return levelScope === 'AHL' ? 'HL only' : 'HL/SL';
}

export default function Home() {
  const [topics, setTopics] = useState<SyllabusTopic[]>([]);
  const [topicsError, setTopicsError] = useState<string | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);

  const [questions, setQuestions] = useState<GeneratedQuestion[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [questionsError, setQuestionsError] = useState<string | null>(null);

  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchEnabledTopics()
      .then(setTopics)
      .catch((err) => setTopicsError(err.message));
  }, []);

  useEffect(() => {
    if (!selectedTopicId) {
      setQuestions([]);
      return;
    }
    setQuestionsLoading(true);
    setQuestionsError(null);
    setRevealed(new Set());
    fetchPublishedQuestionsForTopic(selectedTopicId)
      .then(setQuestions)
      .catch((err) => setQuestionsError(err.message))
      .finally(() => setQuestionsLoading(false));
  }, [selectedTopicId]);

  // Re-typeset whenever the visible math content changes: new questions
  // loaded, or a solution gets revealed.
  useMathJaxTypeset([questions, revealed]);

  const toggleReveal = (id: string) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <main className="page-main" style={{ maxWidth: 760, margin: '0 auto', padding: '2.5rem 1.25rem 4rem' }}>
      <h1
        style={{
          fontFamily: 'var(--hm-font-serif)',
          fontWeight: 700,
          fontSize: '2rem',
          color: 'var(--hm-navy)',
          margin: '0 0 0.4rem',
        }}
      >
        Practice Questions
      </h1>
      <p style={{ color: 'var(--hm-body)', marginTop: 0, marginBottom: '2.5rem', fontSize: '0.95rem' }}>
        Pick a topic, work through the question, then reveal the worked solution when you&rsquo;re ready.
      </p>

      <section style={{ marginBottom: '2.5rem' }}>
        <h2 className="hm-overline">Pick a topic</h2>
        {topicsError && <p style={{ color: 'crimson' }}>Failed to load topics: {topicsError}</p>}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {topics.map((t) => (
            <button
              key={t.id}
              className="topic-btn"
              data-selected={t.id === selectedTopicId}
              onClick={() => setSelectedTopicId(t.id)}
            >
              <div className="topic-btn-name">{t.subtopic_name}</div>
              <div className="topic-btn-meta">
                {t.code} &middot; {levelScopeLabel(t.level_scope)}
              </div>
            </button>
          ))}
          {topics.length === 0 && !topicsError && <p>Loading topics&hellip;</p>}
        </div>
      </section>

      {selectedTopicId && (
        <section>
          <h2 className="hm-overline">Questions</h2>
          {questionsLoading && <p>Loading questions&hellip;</p>}
          {questionsError && <p style={{ color: 'crimson' }}>Failed to load questions: {questionsError}</p>}
          {!questionsLoading && !questionsError && questions.length === 0 && (
            <p>No published questions for this topic yet.</p>
          )}
          {questions.map((q) => (
            <article
              key={q.id}
              className="question-card"
              style={{ padding: '1.25rem 1.4rem', marginBottom: '1.25rem', maxWidth: '100%' }}
            >
              <div className="question-meta" style={{ marginBottom: '0.75rem' }}>
                Section {q.section} &middot; {q.difficulty} &middot; {q.level} &middot;{' '}
                {q.calculator_allowed ? 'calculator' : 'non-calculator'} &middot; {q.total_marks} marks
              </div>

              <div className="math-block" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                {q.question_text}
              </div>

              {q.needs_diagram && q.diagram_svg && (
                <div
                  className="diagram-wrap"
                  style={{ margin: '1rem 0', maxWidth: 420 }}
                  // Diagram SVGs are admin-authored content from our own
                  // generation pipeline (see generated_questions.diagram_svg),
                  // never user-supplied -- safe to inject.
                  dangerouslySetInnerHTML={{ __html: q.diagram_svg }}
                />
              )}

              <button
                className="reveal-btn"
                data-revealed={revealed.has(q.id)}
                onClick={() => toggleReveal(q.id)}
                style={{ marginTop: '0.9rem' }}
              >
                {revealed.has(q.id) ? 'Hide solution' : 'Reveal solution'}
              </button>

              {revealed.has(q.id) && (
                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: `1px dashed var(--hm-border)` }}>
                  <div className="math-block" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                    {q.proposed_solution}
                  </div>
                  <div style={{ marginTop: '0.75rem', fontWeight: 700, color: 'var(--hm-navy)' }}>
                    Final answer: {q.final_answer}
                  </div>
                </div>
              )}
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
