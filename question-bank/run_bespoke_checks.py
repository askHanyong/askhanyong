"""Runs each bespoke question's independently-written check_code (same
subprocess + import-allowlist isolation as runner.run_check, but bespoke
check_code prints a final dict of its OWN computed answer rather than a
self-reported PASS/FAIL -- there is no claimed answer for it to compare
against, by design. The comparison against the stored answer happens here,
separately, after the independent computation is already in hand.
"""
import ast
import re
import subprocess
import sys
import tempfile
from pathlib import Path

from runner import ALLOWED_IMPORTS, _disallowed_imports

from bespoke_questions import build_all_bespoke
from check_code_bespoke import CHECK_CODE


def run_bespoke_code(code: str, timeout_s: int = 10) -> dict:
    bad = _disallowed_imports(code)
    if bad:
        return {"ok": False, "error": f"disallowed imports: {bad}", "stdout": "", "stderr": ""}

    with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False) as f:
        f.write(code)
        path = f.name
    try:
        proc = subprocess.run([sys.executable, path], capture_output=True, text=True, timeout=timeout_s)
        stdout, stderr, rc = proc.stdout, proc.stderr, proc.returncode
        timed_out = False
    except subprocess.TimeoutExpired as e:
        stdout = e.stdout or ""
        stderr = e.stderr or f"Timed out after {timeout_s}s."
        rc = None
        timed_out = True
    finally:
        Path(path).unlink(missing_ok=True)

    if timed_out:
        return {"ok": False, "error": "timeout", "stdout": stdout, "stderr": stderr}
    if rc != 0:
        return {"ok": False, "error": f"nonzero exit ({rc})", "stdout": stdout, "stderr": stderr}

    last_line = stdout.strip().split("\n")[-1].strip() if stdout.strip() else ""
    try:
        computed = ast.literal_eval(last_line)
    except Exception as e:
        return {"ok": False, "error": f"could not parse final dict line: {e}", "stdout": stdout, "stderr": stderr}

    return {"ok": True, "computed": computed, "stdout": stdout, "stderr": stderr}


if __name__ == "__main__":
    qs = build_all_bespoke()
    assert len(qs) == len(CHECK_CODE), f"{len(qs)} questions but {len(CHECK_CODE)} check_code entries"
    for i, (q, code) in enumerate(zip(qs, CHECK_CODE)):
        result = run_bespoke_code(code)
        print(f"\n=== [{i}] {q['blueprint_cell']} ===")
        if not result["ok"]:
            print(f"  ERROR: {result['error']}")
            print(f"  stderr: {result['stderr'][:300]}")
            continue
        print(f"  computed: {result['computed']}")
        for p in q["parts"]:
            print(f"  stored answer ({p['label']}): {p['answer']}")
