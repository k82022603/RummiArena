#!/usr/bin/env python3
"""
AI Battle Multi-Run Statistics Collector
v2 프롬프트 다회 실행으로 통계적 유의성 확보

실행 계획:
  - GPT-5-mini:       3회 (예상 $0.98/회 x3 = ~$2.94)
  - DeepSeek Reasoner: 3회 (예상 $0.04/회 x3 = ~$0.12)
  - Claude Sonnet 4:   1회 (예상 $2.22/회 x1 = ~$2.22)
  - 총 예상 비용: ~$5.28 (실제는 더 적을 수 있음)

출력:
  - 모델별 mean, std, min, max, median
  - 결과 JSON: scripts/ai-battle-multirun-results.json
  - 실행 로그: work_logs/ai-battle-multirun-{timestamp}.log

Usage:
  # DeepSeek 3회 (가장 저렴, 검증용으로 먼저 실행)
  python3 scripts/ai-battle-multirun.py --model deepseek --runs 3

  # GPT 3회
  python3 scripts/ai-battle-multirun.py --model openai --runs 3

  # Claude 1회
  python3 scripts/ai-battle-multirun.py --model claude --runs 1

  # 전체 실행 (DeepSeek 3 + GPT 3 + Claude 1)
  python3 scripts/ai-battle-multirun.py --plan full

  # 기존 결과 파일들을 모아서 통계 계산만
  python3 scripts/ai-battle-multirun.py --aggregate-only

  # 드라이런 (설정 확인만)
  python3 scripts/ai-battle-multirun.py --plan full --dry-run

  # 커스텀 포트/호스트
  python3 scripts/ai-battle-multirun.py --model deepseek --runs 3 --port 8080
"""

import asyncio
import json
import os
import sys
import time
import uuid
import argparse
import signal
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

# Add parent dir so we can import the battle script logic
SCRIPT_DIR = Path(__file__).parent.resolve()
PROJECT_ROOT = SCRIPT_DIR.parent
RESULTS_DIR = SCRIPT_DIR
LOGS_DIR = PROJECT_ROOT / "work_logs"

# ─── Configuration ───────────────────────────────────────────────────────

# Default multi-run plan
DEFAULT_PLAN = {
    "deepseek": 3,
    "openai": 3,
    "claude": 1,
}

# Budget constraints
MAX_BUDGET_USD = 20.0  # DAILY_COST_LIMIT_USD

# Model cost estimates (per full 80-turn game, AI gets ~40 turns)
COST_ESTIMATES = {
    "openai":   {"per_turn": 0.025, "per_game_est": 0.98},
    "claude":   {"per_turn": 0.074, "per_game_est": 2.22},
    "deepseek": {"per_turn": 0.001, "per_game_est": 0.04},
    "ollama":   {"per_turn": 0.000, "per_game_est": 0.00},
}

# Historical data (Round 4 + v2 cross-model experiment, 2026-04-06/07)
# These are single-run results to be included in aggregate if --include-historical
HISTORICAL_RUNS = {
    "openai": [
        # Round 4 v2 cross-model (2026-04-06)
        {
            "run_id": "R4-v2-cross-gpt-20260406",
            "date": "2026-04-06",
            "place_rate": 30.8,
            "ai_place": 12,
            "ai_tiles_placed": 29,
            "ai_draw": 27,
            "ai_fallback": 0,
            "total_turns": 80,
            "elapsed": 2518.0,
            "est_cost": 0.975,
            "result": "TIMEOUT",
            "resp_avg": 64.6,
            "resp_p50": 57.8,
            "resp_min": 18.8,
            "resp_max": 174.8,
            "source": "v2-prompt-crossmodel",
        },
        # Round 4 rerun (2026-04-07) - GPT 30.8%, 80 turns complete
        {
            "run_id": "R4-gpt-rerun-20260407",
            "date": "2026-04-07",
            "place_rate": 30.8,
            "ai_place": 12,
            "ai_tiles_placed": 32,
            "ai_draw": 27,
            "ai_fallback": 0,
            "total_turns": 80,
            "elapsed": 2400.0,
            "est_cost": 0.975,
            "result": "TIMEOUT",
            "resp_avg": 60.0,
            "resp_p50": 55.0,
            "resp_min": 15.0,
            "resp_max": 170.0,
            "source": "round4-rerun",
        },
    ],
    "claude": [
        # Round 4 v2 cross-model (2026-04-06) - 33.3%, 62 turns
        {
            "run_id": "R4-v2-cross-claude-20260406",
            "date": "2026-04-06",
            "place_rate": 33.3,
            "ai_place": 10,
            "ai_tiles_placed": 26,
            "ai_draw": 20,
            "ai_fallback": 0,
            "total_turns": 62,
            "elapsed": 2094.0,
            "est_cost": 2.220,
            "result": "WS_TIMEOUT",
            "resp_avg": 63.8,
            "resp_p50": 44.6,
            "resp_min": 14.4,
            "resp_max": 170.5,
            "source": "v2-prompt-crossmodel",
        },
    ],
    "deepseek": [
        # Round 4 3-model tournament (2026-04-06) - 30.8%, 80 turns
        {
            "run_id": "R4-3model-deepseek-20260406",
            "date": "2026-04-06",
            "place_rate": 30.8,
            "ai_place": 12,
            "ai_tiles_placed": 32,
            "ai_draw": 27,
            "ai_fallback": 0,
            "total_turns": 80,
            "elapsed": 5127.0,
            "est_cost": 0.039,
            "result": "TIMEOUT",
            "resp_avg": 131.5,
            "resp_p50": 123.5,
            "resp_min": 50.4,
            "resp_max": 200.3,
            "source": "round4-3model",
        },
        # Round 4 v2 cross-model (2026-04-06) - 17.9%, 80 turns
        {
            "run_id": "R4-v2-cross-deepseek-20260406",
            "date": "2026-04-06",
            "place_rate": 17.9,
            "ai_place": 7,
            "ai_tiles_placed": 29,
            "ai_draw": 32,
            "ai_fallback": 0,
            "total_turns": 80,
            "elapsed": 5763.0,
            "est_cost": 0.039,
            "result": "TIMEOUT",
            "resp_avg": 147.8,
            "resp_p50": 167.6,
            "resp_min": 54.6,
            "resp_max": 200.3,
            "source": "v2-prompt-crossmodel",
        },
    ],
}

# ─── Battle Runner (delegates to ai-battle-3model-r4.py subprocess) ─────

async def run_single_battle(model_key: str, run_number: int, host: str, port: int, max_turns: int) -> dict:
    """Run a single battle using the existing battle script and capture results."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    run_id = f"multirun-{model_key}-run{run_number}-{timestamp}"

    # Result file for this specific run
    result_file = RESULTS_DIR / f"ai-battle-multirun-{model_key}-run{run_number}-{timestamp}.json"

    print(f"\n{'='*70}")
    print(f"  RUN {run_number}: {model_key}")
    print(f"  ID: {run_id}")
    print(f"  Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*70}")

    # Import the battle functions directly from the existing script
    # We'll run as subprocess to keep isolation and capture the JSON output
    cmd = [
        sys.executable,
        str(SCRIPT_DIR / "ai-battle-3model-r4.py"),
        "--models", model_key,
        "--host", host,
        "--port", str(port),
        "--max-turns", str(max_turns),
        "--delay", "0",
    ]

    start_time = time.time()

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=str(PROJECT_ROOT),
        )

        stdout, _ = await proc.communicate()
        output = stdout.decode("utf-8", errors="replace")
        elapsed = time.time() - start_time

        # Save raw output log
        log_file = LOGS_DIR / f"ai-battle-multirun-{model_key}-run{run_number}-{timestamp}.log"
        log_file.parent.mkdir(parents=True, exist_ok=True)
        with open(log_file, "w") as f:
            f.write(output)
        print(f"  Log saved: {log_file}")

        # Parse the JSON result file that ai-battle-3model-r4.py saves
        # The script saves to scripts/ai-battle-3model-r4-results.json (overwritten each run)
        default_result_path = SCRIPT_DIR / "ai-battle-3model-r4-results.json"
        if default_result_path.exists():
            with open(default_result_path) as f:
                battle_result = json.load(f)

            # Extract the model's data
            model_data = None
            for m in battle_result.get("models", []):
                if m.get("modelKey") == model_key:
                    model_data = m
                    break

            if model_data:
                result = {
                    "run_id": run_id,
                    "run_number": run_number,
                    "date": datetime.now().strftime("%Y-%m-%d"),
                    "model_key": model_key,
                    "place_rate": model_data.get("placeRate", 0),
                    "ai_place": model_data.get("aiPlace", 0),
                    "ai_tiles_placed": model_data.get("aiTilesPlaced", 0),
                    "ai_draw": model_data.get("aiDraw", 0),
                    "ai_fallback": model_data.get("aiFallback", 0),
                    "total_turns": model_data.get("totalTurns", 0),
                    "elapsed": model_data.get("elapsed", elapsed),
                    "est_cost": model_data.get("estimatedCost", 0),
                    "result": model_data.get("result", "UNKNOWN"),
                    "resp_avg": model_data.get("responseTime", {}).get("avg", 0),
                    "resp_p50": model_data.get("responseTime", {}).get("p50", 0),
                    "resp_min": model_data.get("responseTime", {}).get("min", 0),
                    "resp_max": model_data.get("responseTime", {}).get("max", 0),
                    "place_details": model_data.get("placeDetails", []),
                    "fallback_reasons": model_data.get("fallbackReasons", []),
                    "errors": model_data.get("errors", []),
                    "source": "multirun",
                }

                # Save individual run result
                with open(result_file, "w") as f:
                    json.dump(result, f, indent=2, ensure_ascii=False)
                print(f"  Result saved: {result_file}")

                # Copy results to avoid overwriting
                import shutil
                backup = SCRIPT_DIR / f"ai-battle-3model-r4-results-{model_key}-run{run_number}-{timestamp}.json"
                shutil.copy2(default_result_path, backup)

                return result
            else:
                print(f"  WARNING: Model {model_key} not found in result JSON")
        else:
            print(f"  WARNING: Result file not found: {default_result_path}")

    except Exception as e:
        print(f"  ERROR: {e}")
        import traceback
        traceback.print_exc()

    # Return empty result on failure
    return {
        "run_id": run_id,
        "run_number": run_number,
        "date": datetime.now().strftime("%Y-%m-%d"),
        "model_key": model_key,
        "place_rate": 0,
        "ai_place": 0,
        "ai_tiles_placed": 0,
        "ai_draw": 0,
        "ai_fallback": 0,
        "total_turns": 0,
        "elapsed": time.time() - start_time,
        "est_cost": 0,
        "result": "SCRIPT_ERROR",
        "resp_avg": 0,
        "resp_p50": 0,
        "resp_min": 0,
        "resp_max": 0,
        "source": "multirun",
    }


# ─── Statistics Calculator ───────────────────────────────────────────────

def calc_stats(values: list, label: str = "") -> dict:
    """Calculate descriptive statistics for a list of numeric values."""
    if not values:
        return {"n": 0, "mean": 0, "std": 0, "min": 0, "max": 0, "median": 0, "values": []}

    arr = np.array(values, dtype=float)
    return {
        "n": len(arr),
        "mean": round(float(np.mean(arr)), 2),
        "std": round(float(np.std(arr, ddof=1)) if len(arr) > 1 else 0.0, 2),
        "min": round(float(np.min(arr)), 2),
        "max": round(float(np.max(arr)), 2),
        "median": round(float(np.median(arr)), 2),
        "values": [round(float(v), 2) for v in arr],
    }


def aggregate_model_results(runs: list, model_key_override: str = None) -> dict:
    """Aggregate multiple run results for a single model."""
    if not runs:
        return {}

    model_key = model_key_override or runs[0].get("model_key", "unknown")

    # Filter out failed runs (SCRIPT_ERROR) for statistics but count them
    valid_runs = [r for r in runs if r.get("result") not in ("SCRIPT_ERROR",)]
    completed_runs = [r for r in valid_runs if r.get("total_turns", 0) >= 60]  # At least 60 turns
    all_runs = runs

    stats = {
        "model_key": model_key,
        "total_runs": len(all_runs),
        "valid_runs": len(valid_runs),
        "completed_runs": len(completed_runs),
        "failed_runs": len(all_runs) - len(valid_runs),

        # Use valid runs for main stats
        "place_rate": calc_stats([r["place_rate"] for r in valid_runs]),
        "ai_place": calc_stats([r["ai_place"] for r in valid_runs]),
        "ai_tiles_placed": calc_stats([r["ai_tiles_placed"] for r in valid_runs]),
        "ai_draw": calc_stats([r["ai_draw"] for r in valid_runs]),
        "ai_fallback": calc_stats([r["ai_fallback"] for r in valid_runs]),
        "total_turns": calc_stats([r["total_turns"] for r in valid_runs]),
        "elapsed": calc_stats([r["elapsed"] for r in valid_runs]),
        "est_cost": calc_stats([r["est_cost"] for r in valid_runs]),
        "resp_avg": calc_stats([r["resp_avg"] for r in valid_runs if r.get("resp_avg", 0) > 0]),
        "resp_p50": calc_stats([r["resp_p50"] for r in valid_runs if r.get("resp_p50", 0) > 0]),

        # Result distribution
        "result_distribution": {},

        # Individual run summaries
        "runs": [],
    }

    # Result distribution
    for r in all_runs:
        res = r.get("result", "UNKNOWN")
        stats["result_distribution"][res] = stats["result_distribution"].get(res, 0) + 1

    # Run summaries
    for r in all_runs:
        stats["runs"].append({
            "run_id": r.get("run_id", ""),
            "date": r.get("date", ""),
            "place_rate": r.get("place_rate", 0),
            "total_turns": r.get("total_turns", 0),
            "elapsed": r.get("elapsed", 0),
            "est_cost": r.get("est_cost", 0),
            "result": r.get("result", ""),
            "source": r.get("source", ""),
        })

    return stats


# ─── Report Printer ──────────────────────────────────────────────────────

def print_multirun_report(all_model_stats: dict, include_historical: bool):
    """Print the comprehensive multi-run statistics report."""
    print(f"\n\n{'='*100}")
    print(f"  v2 PROMPT MULTI-RUN STATISTICS REPORT")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    if include_historical:
        print(f"  (Including historical runs from Round 4)")
    print(f"{'='*100}")

    # ── 1. Summary Table ──
    print(f"\n  1. SUMMARY BY MODEL")
    print(f"  {'Model':<22} {'N':>3} {'Rate Mean':>10} {'Rate Std':>9} {'Rate Min':>9} {'Rate Max':>9} {'Rate Med':>9} {'Cost Mean':>10}")
    print(f"  {'-'*85}")
    for model_key, stats in all_model_stats.items():
        pr = stats["place_rate"]
        cost = stats["est_cost"]
        print(
            f"  {model_key:<22} "
            f"{pr['n']:>3} "
            f"{pr['mean']:>8.1f}% "
            f"{pr['std']:>8.1f} "
            f"{pr['min']:>7.1f}% "
            f"{pr['max']:>7.1f}% "
            f"{pr['median']:>7.1f}% "
            f"${cost['mean']:>8.3f}"
        )
    print(f"  {'-'*85}")

    # ── 2. Detailed Statistics ──
    print(f"\n  2. DETAILED STATISTICS")
    for model_key, stats in all_model_stats.items():
        print(f"\n  --- {model_key.upper()} ({stats['total_runs']} runs, {stats['valid_runs']} valid, {stats['completed_runs']} completed) ---")

        metrics = [
            ("Place Rate (%)", stats["place_rate"]),
            ("AI Place Count", stats["ai_place"]),
            ("AI Tiles Placed", stats["ai_tiles_placed"]),
            ("AI Draw Count", stats["ai_draw"]),
            ("AI Fallback", stats["ai_fallback"]),
            ("Total Turns", stats["total_turns"]),
            ("Elapsed (s)", stats["elapsed"]),
            ("Est Cost ($)", stats["est_cost"]),
            ("Resp Avg (s)", stats["resp_avg"]),
            ("Resp P50 (s)", stats["resp_p50"]),
        ]

        print(f"  {'Metric':<22} {'N':>3} {'Mean':>10} {'Std':>8} {'Min':>10} {'Max':>10} {'Median':>10}")
        print(f"  {'-'*75}")
        for label, m in metrics:
            if m["n"] > 0:
                print(
                    f"  {label:<22} "
                    f"{m['n']:>3} "
                    f"{m['mean']:>10.2f} "
                    f"{m['std']:>8.2f} "
                    f"{m['min']:>10.2f} "
                    f"{m['max']:>10.2f} "
                    f"{m['median']:>10.2f}"
                )

        # Individual runs
        print(f"\n  Individual Runs:")
        print(f"  {'Run ID':<45} {'Rate':>7} {'Turns':>6} {'Time':>8} {'Cost':>7} {'Result':<15} {'Source':<20}")
        print(f"  {'-'*115}")
        for r in stats["runs"]:
            print(
                f"  {r['run_id']:<45} "
                f"{r['place_rate']:>5.1f}% "
                f"{r['total_turns']:>6} "
                f"{r['elapsed']:>7.0f}s "
                f"${r['est_cost']:>5.3f} "
                f"{r['result']:<15} "
                f"{r['source']:<20}"
            )

    # ── 3. Cross-Model Comparison ──
    print(f"\n\n  3. CROSS-MODEL COMPARISON")
    print(f"  {'Metric':<25}", end="")
    for model_key in all_model_stats:
        print(f" {model_key:>20}", end="")
    print()
    print(f"  {'-'*(25 + 21 * len(all_model_stats))}")

    comparison_metrics = [
        ("Place Rate Mean", "place_rate", "%", 1),
        ("Place Rate Std", "place_rate", " ", 1),
        ("Tiles Placed Mean", "ai_tiles_placed", " ", 1),
        ("Avg Resp Time (s)", "resp_avg", "s", 1),
        ("Cost per Game ($)", "est_cost", " ", 3),
        ("Turns Completed", "total_turns", " ", 0),
    ]

    for label, key, unit, decimals in comparison_metrics:
        print(f"  {label:<25}", end="")
        for model_key, stats in all_model_stats.items():
            m = stats[key]
            if "Std" in label:
                val = m["std"]
            else:
                val = m["mean"]
            fmt = f"{{:>{19}.{decimals}f}}{unit}"
            print(fmt.format(val), end="")
        print()

    # ── 4. Cost Summary ──
    print(f"\n\n  4. COST SUMMARY")
    total_cost = sum(
        stats["est_cost"]["mean"] * stats["total_runs"]
        for stats in all_model_stats.values()
    )
    print(f"  Total estimated cost across all runs: ${total_cost:.2f}")
    for model_key, stats in all_model_stats.items():
        model_total = stats["est_cost"]["mean"] * stats["total_runs"]
        print(f"    {model_key}: {stats['total_runs']} runs x ${stats['est_cost']['mean']:.3f}/game = ${model_total:.2f}")

    # ── 5. Statistical Significance Notes ──
    print(f"\n\n  5. STATISTICAL NOTES")
    for model_key, stats in all_model_stats.items():
        n = stats["place_rate"]["n"]
        if n < 3:
            print(f"  WARNING: {model_key} has only {n} runs. Minimum 3 recommended for std dev.")
        elif n >= 3:
            mean = stats["place_rate"]["mean"]
            std = stats["place_rate"]["std"]
            se = std / np.sqrt(n) if n > 0 else 0
            ci_lo = mean - 1.96 * se
            ci_hi = mean + 1.96 * se
            print(f"  {model_key}: 95% CI for Place Rate = [{ci_lo:.1f}%, {ci_hi:.1f}%] (n={n}, SE={se:.1f})")

    print(f"\n{'='*100}")


# ─── Result Aggregation from Files ───────────────────────────────────────

def load_existing_multirun_results() -> dict:
    """Load any existing multirun result JSON files."""
    results_by_model = {}

    # Look for individual run result files
    for f in sorted(RESULTS_DIR.glob("ai-battle-multirun-*-run*.json")):
        try:
            with open(f) as fh:
                data = json.load(fh)
            model_key = data.get("model_key", "unknown")
            if model_key not in results_by_model:
                results_by_model[model_key] = []
            results_by_model[model_key].append(data)
        except Exception as e:
            print(f"  Warning: Failed to load {f}: {e}")

    return results_by_model


# ─── Main ────────────────────────────────────────────────────────────────

async def main():
    parser = argparse.ArgumentParser(
        description="AI Battle Multi-Run Statistics Collector"
    )
    parser.add_argument(
        "--model", type=str, default=None,
        help="Single model to run (openai, claude, deepseek, ollama)"
    )
    parser.add_argument(
        "--runs", type=int, default=3,
        help="Number of runs for the selected model (default: 3)"
    )
    parser.add_argument(
        "--plan", type=str, default=None,
        choices=["full", "cheap", "deepseek-only"],
        help="Predefined execution plan (full: D3+G3+C1, cheap: D3, deepseek-only: D3)"
    )
    parser.add_argument(
        "--host", type=str, default="localhost",
        help="Game server host (default: localhost)"
    )
    parser.add_argument(
        "--port", type=int, default=30080,
        help="Game server port (default: 30080)"
    )
    parser.add_argument(
        "--max-turns", type=int, default=80,
        help="Max turns per game (default: 80)"
    )
    parser.add_argument(
        "--delay", type=int, default=15,
        help="Delay in seconds between runs (default: 15)"
    )
    parser.add_argument(
        "--include-historical", action="store_true", default=True,
        help="Include historical Round 4 data in statistics (default: True)"
    )
    parser.add_argument(
        "--no-historical", action="store_true",
        help="Exclude historical data, only use new runs"
    )
    parser.add_argument(
        "--aggregate-only", action="store_true",
        help="Skip running battles, only aggregate existing results"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Print plan and exit"
    )
    args = parser.parse_args()

    include_historical = not args.no_historical

    # Determine execution plan
    plan = {}
    if args.plan == "full":
        plan = {"deepseek": 3, "openai": 3, "claude": 1}
    elif args.plan in ("cheap", "deepseek-only"):
        plan = {"deepseek": 3}
    elif args.model:
        plan = {args.model: args.runs}

    # ── Print Plan ──
    print("=" * 70)
    print("  AI BATTLE MULTI-RUN STATISTICS COLLECTOR")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  Server: http://{args.host}:{args.port}")
    print(f"  Max turns: {args.max_turns}")
    print(f"  Include historical: {include_historical}")
    print("=" * 70)

    if plan and not args.aggregate_only:
        total_est_cost = 0
        total_runs = 0
        total_est_time = 0
        print(f"\n  Execution Plan:")
        for model_key, num_runs in plan.items():
            ce = COST_ESTIMATES.get(model_key, {})
            cost = ce.get("per_game_est", 0) * num_runs
            est_time_min = num_runs * 40  # ~40 min per game
            total_est_cost += cost
            total_runs += num_runs
            total_est_time += est_time_min
            print(f"    {model_key:<15} {num_runs} runs x ${ce.get('per_game_est', 0):.2f}/game = ${cost:.2f} (~{est_time_min}min)")
        print(f"\n  Total: {total_runs} battles, ~${total_est_cost:.2f}, ~{total_est_time}min ({total_est_time/60:.1f}h)")

    if include_historical:
        print(f"\n  Historical data to include:")
        for model_key, runs in HISTORICAL_RUNS.items():
            rates = [r["place_rate"] for r in runs]
            print(f"    {model_key}: {len(runs)} runs, rates={rates}")

    if args.dry_run:
        print(f"\n  [DRY RUN] Exiting.")
        return

    # ── Execute Battles ──
    new_results_by_model = {}

    if not args.aggregate_only and plan:
        # Health check first
        import requests
        base_url = f"http://{args.host}:{args.port}"
        try:
            resp = requests.get(f"{base_url}/health", timeout=5)
            health = resp.json()
            print(f"\n  Health check: {health.get('status', 'unknown')}")
        except Exception as e:
            print(f"\n  ERROR: Game server not available at {base_url}: {e}")
            print(f"  Cannot run battles. Use --aggregate-only to analyze existing data.")
            print(f"\n  To start services:")
            print(f"    Option 1: Start Docker Desktop -> Enable Kubernetes")
            print(f"    Option 2: docker compose -f docker-compose.dev.yml up -d")
            print(f"    Option 3: Run game-server and ai-adapter locally")

            # Fall through to aggregate-only mode
            args.aggregate_only = True

        if not args.aggregate_only:
            # Execute plan in order: cheapest first
            execution_order = sorted(plan.keys(), key=lambda k: COST_ESTIMATES.get(k, {}).get("per_game_est", 999))

            for model_key in execution_order:
                num_runs = plan[model_key]
                new_results_by_model[model_key] = []

                for run_num in range(1, num_runs + 1):
                    if run_num > 1:
                        print(f"\n  Waiting {args.delay}s before next run...")
                        await asyncio.sleep(args.delay)

                    result = await run_single_battle(
                        model_key=model_key,
                        run_number=run_num,
                        host=args.host,
                        port=args.port,
                        max_turns=args.max_turns,
                    )
                    new_results_by_model[model_key].append(result)

                    # Print running tally
                    rates = [r["place_rate"] for r in new_results_by_model[model_key]]
                    print(f"\n  {model_key} running tally: {rates} (mean={np.mean(rates):.1f}%)")

    # ── Load existing multirun results from files ──
    existing_results = load_existing_multirun_results()

    # ── Combine all data ──
    combined_by_model = {}

    # 1. Historical data
    if include_historical:
        for model_key, runs in HISTORICAL_RUNS.items():
            if model_key not in combined_by_model:
                combined_by_model[model_key] = []
            combined_by_model[model_key].extend(runs)

    # 2. Previously saved multirun results
    for model_key, runs in existing_results.items():
        if model_key not in combined_by_model:
            combined_by_model[model_key] = []
        # Deduplicate by run_id
        existing_ids = {r.get("run_id") for r in combined_by_model[model_key]}
        for r in runs:
            if r.get("run_id") not in existing_ids:
                combined_by_model[model_key].append(r)
                existing_ids.add(r.get("run_id"))

    # 3. New runs from this execution
    for model_key, runs in new_results_by_model.items():
        if model_key not in combined_by_model:
            combined_by_model[model_key] = []
        existing_ids = {r.get("run_id") for r in combined_by_model[model_key]}
        for r in runs:
            if r.get("run_id") not in existing_ids:
                combined_by_model[model_key].append(r)

    # ── Compute Aggregated Statistics ──
    all_model_stats = {}
    for model_key in ["openai", "claude", "deepseek", "ollama"]:
        if model_key in combined_by_model and combined_by_model[model_key]:
            all_model_stats[model_key] = aggregate_model_results(combined_by_model[model_key], model_key_override=model_key)

    # ── Print Report ──
    if all_model_stats:
        print_multirun_report(all_model_stats, include_historical)

    # ── Save Aggregate Results ──
    output = {
        "report": "v2 Prompt Multi-Run Statistics",
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "config": {
            "max_turns": args.max_turns,
            "include_historical": include_historical,
            "plan": plan if plan else "aggregate-only",
        },
        "models": {},
    }

    for model_key, stats in all_model_stats.items():
        output["models"][model_key] = stats

    result_path = RESULTS_DIR / "ai-battle-multirun-results.json"
    try:
        with open(result_path, "w") as f:
            json.dump(output, f, indent=2, ensure_ascii=False)
        print(f"\n  Aggregate results saved: {result_path}")
    except Exception as e:
        print(f"\n  WARNING: Failed to save aggregate results: {e}")

    print(f"\n  Done at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")


if __name__ == "__main__":
    asyncio.run(main())
