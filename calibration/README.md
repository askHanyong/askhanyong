# Calibration Files

This folder contains the reference materials used to calibrate the AI marking engine.
These files are private and must never be made publicly accessible.

## Files

| File | Description |
|---|---|
| `M24 MAAHL P1 TZ1.pdf` | IB AA HL May 2024 Paper 1 TZ1 question paper |
| `M24 MAAHL P1 TZ1_markscheme.pdf` | Official IB markscheme for the same paper |
| `MAA HL May 24 P1 TZ1 student a-compressed.pdf` | High-scoring student script (109/110) |
| `MAA HL May 24 P1 TZ1 student b_compressed.pdf` | Mid-range student script (77/110) |
| `MAA HL May 24 P1 TZ1 student c_compressed.pdf` | Lower-scoring student script (43/110) |

## Correct marks

- Student A: **109 / 110**
- Student B: **77 / 110**
- Student C: **43 / 110**

## Usage

These files are read by the marking engine at the start of each session to
inject few-shot calibration examples into the marking prompt. They are never
sent to students or exposed via any API endpoint.
