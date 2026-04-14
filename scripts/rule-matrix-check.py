#!/usr/bin/env python3
"""
rule-matrix-check.py — Verify game-rule traceability matrix integrity.

Parses docs/02-design/31-game-rule-traceability.md and for every rule whose
"종합" column is ✅ (all-green), confirms that every backtick-quoted code
reference in its Engine/Engine-test/UI/E2E columns can be located in the repo.

Exit 0 — all green rules verified
Exit 1 — one or more references missing OR matrix structure invalid
Exit 2 — invocation error
"""
from __future__ import annotations

import argparse
import dataclasses
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import List, Optional

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_MATRIX = REPO_ROOT / "docs" / "02-design" / "31-game-rule-traceability.md"

# Columns in the 7-col matrix (after the leading empty pipe + rule_id + name)
# | rule_id | name | Engine 구현 | Engine 테스트 | UI 구현 | UI 테스트(E2E) | Playtest | 종합 |
COL_RULE = 0
COL_NAME = 1
COL_ENGINE_IMPL = 2
COL_ENGINE_TEST = 3
COL_UI_IMPL = 4
COL_UI_E2E = 5
COL_PLAYTEST = 6
COL_OVERALL = 7

# Regex to pull `backticked` references
BACKTICK_RE = re.compile(r"`([^`]+)`")
# Drop trailing `:line[,line2-line3]` ranges so we only verify file existence
LINE_SUFFIX_RE = re.compile(r":[0-9,\-]+$")
# Match a markdown row that starts with `| **V-` (rule rows only, skips dividers/headers)
RULE_ROW_RE = re.compile(r"^\|\s*\*\*(V-[0-9a-z]+)\*\*\s*\|")

# Status markers
GREEN = "✅"
PARTIAL_MARKERS = {"⚠️", "❌", "**부분**", "**미완**"}


@dataclasses.dataclass
class RuleRow:
    rule_id: str
    name: str
    cells: List[str]
    line_no: int

    @property
    def overall(self) -> str:
        return self.cells[COL_OVERALL].strip() if len(self.cells) > COL_OVERALL else ""

    @property
    def is_green(self) -> bool:
        ov = self.overall
        if not ov:
            return False
        if any(m in ov for m in PARTIAL_MARKERS):
            return False
        return ov == GREEN


@dataclasses.dataclass
class CheckFailure:
    rule_id: str
    column: str
    reference: str
    reason: str


def parse_matrix(matrix_path: Path) -> List[RuleRow]:
    rows: List[RuleRow] = []
    if not matrix_path.exists():
        raise FileNotFoundError(f"matrix not found: {matrix_path}")
    with matrix_path.open("r", encoding="utf-8") as fh:
        for lineno, line in enumerate(fh, start=1):
            m = RULE_ROW_RE.match(line)
            if not m:
                continue
            rule_id = m.group(1)
            # Split on '|' and drop the leading/trailing empty cells
            raw_cells = [c.strip() for c in line.strip().split("|")]
            if raw_cells and raw_cells[0] == "":
                raw_cells = raw_cells[1:]
            if raw_cells and raw_cells[-1] == "":
                raw_cells = raw_cells[:-1]
            # Strip the **bold** wrap from the rule id cell so cells line up
            # First cell: "**V-01**" → "V-01"
            if raw_cells:
                raw_cells[0] = raw_cells[0].replace("**", "").strip()
            name = raw_cells[1] if len(raw_cells) > 1 else ""
            rows.append(RuleRow(rule_id=rule_id, name=name, cells=raw_cells, line_no=lineno))
    return rows


def normalize_reference(ref: str) -> Optional[str]:
    """Strip line-number suffixes; return None if the ref isn't a file-ish path."""
    ref = ref.strip()
    # Drop `:NN[,NN-NN]` line suffixes
    ref = LINE_SUFFIX_RE.sub("", ref)
    # Drop trailing `()` or arguments such as `ValidateTable()`
    if ref.endswith("()"):
        return None  # function name, not a path
    # Filter obvious non-file references: spaces, commas, identifiers without dots
    if " " in ref or "," in ref:
        return None
    if "." not in ref:
        # No file extension — likely a function/identifier (e.g. `ValidateTable`)
        return None
    # Reject things like `ErrInitialMeldSource` (no slash, no extension we know)
    return ref


KNOWN_BASE_DIRS = [
    "src/game-server",
    "src/game-server/internal",
    "src/ai-adapter",
    "src/ai-adapter/src",
    "src/frontend",
    "src/frontend/src",
    "src/admin",
    "src/admin/src",
    "src",
    ".",
]


def reference_exists(ref: str) -> bool:
    """Try multiple resolution strategies for the ref:
    1. Treat as repo-relative path.
    2. Prefix with each KNOWN_BASE_DIR.
    3. Fall back to basename search (using `git ls-files`)."""
    # 1 + 2 — direct path probes
    candidates: List[Path] = [REPO_ROOT / ref]
    for base in KNOWN_BASE_DIRS:
        candidates.append(REPO_ROOT / base / ref)
    for c in candidates:
        if c.exists():
            return True
    # 3 — basename search via git ls-files (cheap, scoped to tracked files)
    basename = os.path.basename(ref)
    if not basename:
        return False
    try:
        out = subprocess.run(
            ["git", "-C", str(REPO_ROOT), "ls-files", f"**/{basename}"],
            capture_output=True,
            text=True,
            check=False,
        )
        if out.returncode == 0 and out.stdout.strip():
            return True
        # Some shells/git versions don't expand ** for ls-files; try a literal
        out2 = subprocess.run(
            ["git", "-C", str(REPO_ROOT), "ls-files"],
            capture_output=True,
            text=True,
            check=False,
        )
        if out2.returncode == 0:
            for tracked in out2.stdout.splitlines():
                if tracked.endswith("/" + basename) or tracked == basename:
                    return True
    except FileNotFoundError:
        pass
    return False


def extract_refs(cell: str) -> List[str]:
    """Pull backticked file-ish references out of a markdown cell."""
    out: List[str] = []
    for raw in BACKTICK_RE.findall(cell):
        norm = normalize_reference(raw)
        if norm:
            out.append(norm)
    return out


COLUMN_LABELS = {
    COL_ENGINE_IMPL: "Engine 구현",
    COL_ENGINE_TEST: "Engine 테스트",
    COL_UI_IMPL: "UI 구현",
    COL_UI_E2E: "UI 테스트(E2E)",
}


def verify_row(row: RuleRow) -> List[CheckFailure]:
    failures: List[CheckFailure] = []
    for col_idx, label in COLUMN_LABELS.items():
        if col_idx >= len(row.cells):
            continue
        cell = row.cells[col_idx]
        # An "all-green" row must start with ✅ in every checked column
        if GREEN not in cell:
            failures.append(
                CheckFailure(
                    rule_id=row.rule_id,
                    column=label,
                    reference="(no ✅ marker)",
                    reason=f"row marked all-green but {label} cell lacks ✅",
                )
            )
            continue
        refs = extract_refs(cell)
        for ref in refs:
            if not reference_exists(ref):
                failures.append(
                    CheckFailure(
                        rule_id=row.rule_id,
                        column=label,
                        reference=ref,
                        reason="file not found in repo",
                    )
                )
    return failures


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--matrix",
        default=str(DEFAULT_MATRIX),
        help="Path to traceability matrix markdown",
    )
    parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Print every reference checked, not just failures",
    )
    args = parser.parse_args()

    matrix_path = Path(args.matrix).resolve()
    try:
        rows = parse_matrix(matrix_path)
    except FileNotFoundError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    if not rows:
        print(f"ERROR: no rule rows parsed from {matrix_path}", file=sys.stderr)
        return 1

    # V-13 parent row is a decomposition stub — its sub-rules V-13a..V-13e carry
    # the real status. Matrix §11 explicitly excludes it from counts.
    rows = [r for r in rows if r.rule_id != "V-13"]

    green_rows = [r for r in rows if r.is_green]
    partial_rows = [r for r in rows if not r.is_green]

    try:
        display_path = matrix_path.relative_to(REPO_ROOT)
    except ValueError:
        display_path = matrix_path
    print(f"[rule-matrix-check] matrix: {display_path}")
    print(
        f"[rule-matrix-check] parsed {len(rows)} rule rows "
        f"({len(green_rows)} all-green, {len(partial_rows)} partial)"
    )

    all_failures: List[CheckFailure] = []
    for row in green_rows:
        if args.verbose:
            print(f"  -> {row.rule_id} ({row.name})")
        failures = verify_row(row)
        if failures:
            all_failures.extend(failures)
        elif args.verbose:
            print(f"     OK")

    if all_failures:
        print("")
        print(f"[rule-matrix-check] FAIL — {len(all_failures)} reference(s) missing")
        for f in all_failures:
            print(f"  - {f.rule_id} | {f.column} | `{f.reference}` | {f.reason}")
        print("")
        print("Hint: update docs/02-design/31-game-rule-traceability.md or fix the")
        print("      backtick file path so it resolves under src/ or repo root.")
        return 1

    print(
        f"[rule-matrix-check] PASS — {len(rows)}/{len(rows)} rules verified, "
        f"{len(green_rows)} all-green, {len(partial_rows)} partial"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
