# Calibration Files

This folder contains the reference materials used to calibrate the AI marking engine.
These files are private and must never be made publicly accessible.

## Required files

| File | Description |
|---|---|
| `question_paper.pdf` | The IB question paper for the calibration exam |
| `markscheme.pdf` | The official IB markscheme for the same paper |
| `student_A.pdf` | High-scoring student script (109/110) |
| `student_B.pdf` | Mid-range student script (77/110) |
| `student_C.pdf` | Lower-scoring student script (43/110) |

## Correct marks

- Student A: **109 / 110**
- Student B: **77 / 110**
- Student C: **43 / 110**

## Usage

These files are read by the marking engine at the start of each session to
inject few-shot calibration examples into the marking prompt. They are never
sent to students or exposed via any API endpoint.
