# askhanyong — Claude Code Context

## Project
`askhanyong.com` — AI-powered teacher marking platform. Netlify Edge Functions (Deno) + Supabase + Claude API. Main file: `teacher.html` (~3,800 lines).

## Active Branch
Development: `claude/fix-bulk-marking-issue-urUsg`

---

## Build Backlog

### P0 — Fix Before Next Teacher Session (DONE ✓)

- [x] **Autosave Q-review state to localStorage** — 30s checkpoint save of `bulkAssignQueue` + `questionIndex`. On next load, detect saved state and prompt teacher to restore. Prevents losing 20+ marked scripts on browser crash.
- [x] **Script upload confirmation** — `_uploadScriptPdf` now awaited; failures surface per-student warning with names listed. In-review "⬇ PDF" button as fallback.
- [x] **Re-mark / edit saved markings** — "✏ Edit" button on every dashboard row. Loads marking back into Q-review (fetches stored PDF from Supabase Storage). Saves via PATCH (update, not insert) in `teacher-save.js`.

### P1 — Core Workflow Completeness (DONE ✓)

- [x] **Keyboard shortcuts in Q-review** — `A` accept AI mark, `0–9` set mark, `→` next student, `←` prev student, `T` drop tick annotation, `X` drop cross annotation. Single biggest time-saver.
- [x] **Bulk report sharing** — at save time, collect report tokens → downloadable CSV (`Name, Score, Report URL`). "⬇ Report Links" button appears after save.
- [x] **Class management** — datalist-backed autocomplete input; class names sourced from existing markings. Class filter dropdown in dashboard.
- [x] **Question-level score distribution** — per-question horizontal bar chart in dashboard (avg/max, green/amber/red by threshold).

### P2 & P3 — Partially Built

- [x] **P2.8 Comment bank** — `#` trigger in notes textarea, floating dropdown, localStorage persistence, harvested on save.
- [x] **P2.11 AI confidence highlighting** — `cf` field in tool schema; amber row + badge in Q-review for low-confidence marks.
- [x] **P3.15 Tablet optimisation** — CSS media queries; script panel becomes bottom sheet at ≤1024px; touch-friendly buttons.
- [x] **P3.17 AI accuracy self-improvement loop** — "📊 AI Accuracy" button in dashboard; per-question AI avg vs final avg chart with delta and accuracy %; downloadable CSV report.

#### Still KIV (remind when asked "what's next to build"):
- Anonymous marking toggle during Q-review
- Structured rubric builder (replace solution PDF with explicit criteria)
- Student regrade request button on report page
- Loading skeletons + toast notifications
- Rubber-stamp cursors in annotation mode
- Multi-teacher / TA collaboration + moderation

---

## Architecture Notes

- Edge functions: `netlify/edge-functions/` (Deno runtime)
- Supabase tables: `markings` (JSONB columns: `question_marks`, `annotations`), `assignments`
- Supabase Storage bucket: `assignments` (stores student script PDFs at `script_path`)
- Key functions in `teacher.html`:
  - `doBulkAssignMark()` — bulk marking loop with client retry
  - `startQReview()` / `renderQReviewTable()` — Q-by-Q review
  - `saveAllBulkAssign()` — saves to Supabase + triggers PDF upload
  - `_uploadScriptPdf()` — awaited PDF upload; failures listed by student name
  - `_renderAnnotatedPdfBytes()` — renders annotated PDF from canvas
  - `downloadAllAnnotatedPDFs()` / `downloadCurrentScriptPDF()` — in-memory download (bypasses Supabase)
  - `openScriptPanel()` — opens sticky PDF side panel for a student
