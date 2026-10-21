# Topical question book (personal use)

Builds, for HL and SL separately, a **questions PDF** and a **solutions PDF** from the past-paper
data already in your Supabase project.

Scope: May 2021 to May 2024 and Nov 2021 to Nov 2023, Paper 1 and Paper 2.
Layout: Topic 1 to 5, then Paper 1 (Non-GDC) and Paper 2 (GDC), then Section A, then Section B.
Each question appears once, under the topic with the most marks, with a "see Topic X" line elsewhere.
Order inside a block: subtopic, then date.

## One-time setup

1. **Install** Python 3.10+ and a TeX distribution that includes `xelatex`
   (MacTeX on Mac, MiKTeX or TeX Live on Windows, `texlive-xetex` on Linux).
   Check with `python --version` and `xelatex --version`.
2. **Get the Supabase secret key** (Supabase dashboard, your project, Settings, API keys:
   the `service_role` / secret key). Put it in an environment variable, not in a file:
   - Mac/Linux: `export SUPABASE_SERVICE_ROLE_KEY="paste-key-here"`
   - Windows PowerShell: `$env:SUPABASE_SERVICE_ROLE_KEY="paste-key-here"`

   Security: this key bypasses all row-level security. Keep it on this machine only. Never put it in
   the Hanmath frontend, in Netlify variables (and never in anything starting with `NEXT_PUBLIC_`),
   in git, or in a chat. If it is ever exposed, rotate it in the dashboard.
3. **Open this folder in Claude Code** and ask it to run steps below and fix anything that fails.

## Run

```
python export.py                       # downloads the tables to data/raw/
python build_book.py --levels SL HL    # builds PDFs and out/checks.txt
```

Outputs in `out/`: `SL_topical_questions.pdf`, `SL_topical_solutions.pdf`, `HL_...` the same,
and `checks.txt`.

## What to look at first

1. `out/checks.txt`. Everything should say "none" or match. In particular:
   - questions/parts rendered must equal questions/parts in scope;
   - "Section A/B order violations" should be none (Section B = 11+ marks);
   - the list of AHL-scope tags on SL questions needs your review (possible mis-tags).
2. **Diagrams.** `export.py` prints how `image_refs` look. The build looks for each image in
   `data/images/`. Any it cannot find is printed as a warning and shown as a "diagram missing" box.
   Ask Claude Code to fetch or map the images once so those warnings go to zero.
   File names the build looks for: `<LEVEL>_<YEAR>_<SESSION>_<TZ>_P<n>_Q<n>_<part>_<k>.png`
   (also `.jpg`/`.pdf`), for example `SL_2023_May_TZ2_P1_Q1_a_1.png`. The warning prints the exact name.
3. Skim a few pages in each PDF against the original papers (about 5% of questions).

## Test without a database

```
python tests/make_mock.py
python build_book.py --raw tests/mock_raw --out tests/mock_out --levels SL
```

## Not built yet

- Yearly practice volume (May 2025 to May 2026, Nov 2024 to Nov 2025, and all Paper 3): plan is to merge the
  original paper and markscheme PDFs from Drive as they are.
- Optional: one PDF per topic.

Keep `data/` and `out/` private. They contain IB material and are for your own study only.
