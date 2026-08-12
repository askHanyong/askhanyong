# ingest-paper

Ingests one IB Math past paper (question paper + markscheme PDFs) into the
Supabase question bank: uploads both PDFs to private storage, segments them
into questions/parts via Claude, matches paper parts to markscheme parts, and
writes everything in a single DB transaction.

## Setup

```bash
cd scripts/ingest-paper
npm install
```

Requires `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY` in
the repo root `.env` (three levels up from `src/`) -- see `supabase/README.md`.

## Run

```bash
npm run ingest -- \
  --paper /path/to/paper.pdf --markscheme /path/to/markscheme.pdf \
  --subject MAA --level HL --year 2021 --session May \
  --paper-number 1 --calculator false [--timezone TZ1]
```

## Design notes / known limitations

- **Segmentation uses Claude's native PDF input, not the pdf-parse text.**
  `pdf-parse` extraction still runs (as originally asked for) and is printed
  as a char-count sanity check, but the actual `segmentPaper`/
  `segmentMarkscheme` calls send the raw PDF to Claude as a `document`
  content block. Plain text extraction mangles IB math notation
  (fractions, integrals, matrices) and can't see diagrams at all, and the
  spec explicitly requires noting diagram *position* -- native PDF input
  handles both correctly in one pass. `pdf-parse` is deliberately pinned to
  the 1.x line for its stable, documented `pagerender` API (2.x is an
  unrelated rewrite).
- **"Extracted diagram images" are position notes, not cropped images.**
  `image_refs` is a list of short text descriptions + approximate position
  (e.g. `"page 4, graph of f(x) below part (b)"`), not actual image files.
  Precise diagram cropping would need page rendering + region detection,
  which is out of scope here -- flagging this rather than silently shipping
  something that looks like image extraction but isn't.
- **Transaction scope is DB-only.** `ingest_paper` (the Postgres function
  this calls) is one implicit transaction: paper/questions/parts/markscheme
  either all land or none do. The two `uploadPdf()` calls happen *before*
  that transaction and are not part of it -- if the DB insert fails after
  a successful upload, the PDF is left in storage unreferenced by any
  `papers` row. True cross-system atomicity isn't available through the
  Supabase client SDK.
- **Mismatch handling.** Paper parts with no matching markscheme label, and
  markscheme parts/questions with no matching paper counterpart, are logged
  to `review_queue` rather than silently guessed. Orphan markscheme content
  is inserted as a stub `question_parts` row (placeholder `part_text`) so
  `review_queue.question_part_id` (`NOT NULL` in the schema) has something
  concrete to point at -- look for `[unresolved: ...]` placeholder text.
