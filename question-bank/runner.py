"""Executes a question's check_code in an isolated subprocess (its own fresh
Python interpreter -- not exec() in-process) with a 10s timeout. Per the
brief: "Execute check_code in a restricted namespace (sympy, scipy.stats,
math, fractions) with a 10s timeout."

A subprocess is the actual isolation boundary (crashes/hangs/runaway memory
in check_code can't touch the caller). "Restricted namespace" is enforced
as a static source scan for `import X` / `from X import ...` statements in
check_code itself, rejecting anything outside the allowed set BEFORE
execution -- not a runtime __import__ override, which was tried first and
broke: it also intercepts sympy's own internal transitive imports (e.g.
`_io`), since Python re-resolves submodule imports through __import__ too.
A static scan only restricts what check_code's own source text may name.
"""
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ALLOWED_IMPORTS = {"sympy", "scipy", "math", "fractions"}

IMPORT_RE = re.compile(r"^\s*(?:import|from)\s+([a-zA-Z_][a-zA-Z0-9_.]*)", re.MULTILINE)


def _disallowed_imports(code: str) -> list[str]:
    bad = []
    for m in IMPORT_RE.finditer(code):
        top = m.group(1).split(".")[0]
        if top not in ALLOWED_IMPORTS:
            bad.append(top)
    return bad


def run_check(check_code: str, timeout_s: int = 10) -> dict:
    """Returns {status: 'passed'|'failed'|'error', stdout, stderr}."""
    bad_imports = _disallowed_imports(check_code)
    if bad_imports:
        return {
            "status": "error", "stdout": "",
            "stderr": f"check_code imports disallowed module(s): {sorted(set(bad_imports))} (allowed: {sorted(ALLOWED_IMPORTS)})",
        }

    with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False) as f:
        f.write(check_code)
        script_path = f.name

    try:
        proc = subprocess.run(
            [sys.executable, script_path],
            capture_output=True, text=True, timeout=timeout_s,
        )
        stdout, stderr = proc.stdout, proc.stderr
        timed_out = False
    except subprocess.TimeoutExpired as e:
        stdout = (e.stdout or b"").decode() if isinstance(e.stdout, bytes) else (e.stdout or "")
        stderr = (e.stderr or b"").decode() if isinstance(e.stderr, bytes) else (e.stderr or "")
        timed_out = True
    finally:
        Path(script_path).unlink(missing_ok=True)

    if timed_out:
        return {"status": "error", "stdout": stdout, "stderr": stderr or f"Timed out after {timeout_s}s."}

    last_line = stdout.strip().split("\n")[-1].strip() if stdout.strip() else ""
    if last_line.upper().startswith("PASS"):
        return {"status": "passed", "stdout": stdout, "stderr": stderr}
    if last_line.upper().startswith("FAIL"):
        return {"status": "failed", "stdout": stdout, "stderr": stderr}
    # Non-zero exit or no recognizable PASS/FAIL line -- an exception or
    # assertion escaped rather than being reported as a controlled FAIL.
    return {"status": "error", "stdout": stdout, "stderr": stderr or f"No PASS/FAIL line; exit handled, last line: {last_line!r}"}

