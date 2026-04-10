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

### P1 — Core Workflow Completeness (DO AFTER P0)

- [ ] **Keyboard shortcuts in Q-review** — `A` accept AI mark, `0–9` set mark, `→` next student, `←` prev student, `T` drop tick annotation, `X` drop cross annotation. Single biggest time-saver.
- [ ] **Bulk report sharing** — at save time, generate all report tokens and produce a downloadable sheet (`Name, Score, Report URL`) for teacher to distribute via email/WhatsApp.
- [ ] **Class management** — create named classes, assign students to a class. Replace free-text `class_label` field with a proper class selector tied to teacher account.
- [ ] **Question-level score distribution** — in the dashboard, show a per-question bar chart across the class (e.g. Q3 average: 1.2/4). Identifies where the class struggled.

### P2 & P3 — KIV (remind teacher when asked "what's next to build")

- Comment bank (`#` to search saved notes)
- Anonymous marking toggle during Q-review
- Structured rubric builder (replace solution PDF with explicit criteria)
- AI confidence highlighting (amber-flag low-confidence question parts)
- Student regrade request button on report page
- Loading skeletons + toast notifications
- Rubber-stamp cursors in annotation mode
- Mobile/tablet simplified view
- Multi-teacher / TA collaboration + moderation
- AI accuracy self-improvement loop (monthly AI vs. final score delta report)

---

## Architecture Notes

- Edge functions: `netlify/edge-functions/` (Deno runtime)
- Supabase tables: `markings` (JSONB columns: `question_marks`, `annotations`), `assignments`
- Supabase Storage bucket: `assignments` (stores student script PDFs at `script_path`)
- Key functions in `teacher.html`:
  - `doBulkAssignMark()` — bulk marking loop with client retry
  - `startQReview()` / `renderQReviewTable()` — Q-by-Q review
  - `saveAllBulkAssign()` — saves to Supabase + triggers PDF upload
  - `_uploadScriptPdf()` — fire-and-forget PDF upload (P0 fix needed)
  - `_renderAnnotatedPdfBytes()` — renders annotated PDF from canvas
  - `downloadAllAnnotatedPDFs()` / `downloadCurrentScriptPDF()` — in-memory download (bypasses Supabase)
  - `openScriptPanel()` — opens sticky PDF side panel for a student
