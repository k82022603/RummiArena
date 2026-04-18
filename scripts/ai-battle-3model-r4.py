#!/usr/bin/env python3
"""
AI Battle Test - Multi-Model Tournament
GPT-5-mini vs Claude Sonnet 4 vs DeepSeek Reasoner vs Ollama (qwen2.5:3b)

동일 조건 대전:
  - 80턴 제한
  - 초기 14타일
  - 2인전 (Human AutoDraw vs AI)
  - persona=calculator, difficulty=expert, psychologyLevel=2
  - WS_TIMEOUT: 전 모델 270s 통일 (210s adapter timeout + 60s buffer)

지원 모델:
  openai   - GPT-5-mini (추론 모델, $0.025/턴)
  claude   - Claude Sonnet 4 + Extended Thinking (추론 모델, $0.074/턴)
  deepseek - DeepSeek Reasoner (추론 모델, $0.001/턴)
  ollama   - qwen2.5:3b 로컬 LLM (비추론 모델, $0/턴, 베이스라인 비교용)

이전 결과 (Round 4 v2, 2026-04-06):
  GPT-5-mini:     30.8% place rate (A+, 첫 80턴 완주)
  Claude Sonnet4: 33.3% place rate (A+, 역대 최고)
  DeepSeek:       17.9~30.8% place rate (분산 큼)
  Ollama:         미측정 (베이스라인 확보 예정)

Usage:
  python3 scripts/ai-battle-3model-r4.py                        # 클라우드 3모델
  python3 scripts/ai-battle-3model-r4.py --models ollama         # Ollama 단독
  python3 scripts/ai-battle-3model-r4.py --models openai,ollama  # 2모델 비교
  python3 scripts/ai-battle-3model-r4.py --models openai,claude,deepseek,ollama  # 전체 4모델
  python3 scripts/ai-battle-3model-r4.py --dry-run               # 설정만 출력
"""

import asyncio
import json
import time
import uuid
import argparse
import requests
import websockets
from datetime import datetime, timezone
from collections import Counter

# Defaults (NodePort 30080)
DEFAULT_PORT = 30080
DEFAULT_HOST = "localhost"
MAX_TURNS = 80

# Model configurations -- 동일 persona/difficulty/psychologyLevel
MODELS = {
    "openai": {
        "name": "gpt-5-mini",
        "label": "GPT-5-mini",
        "aiType": "AI_OPENAI",
        "persona": "calculator",
        "difficulty": "expert",
        "psychologyLevel": 2,
        "ws_timeout": 270,       # 210s adapter timeout + 60s buffer
        "cost_per_turn": 0.025,
    },
    "claude": {
        "name": "claude-sonnet-4",
        "label": "Claude Sonnet 4",
        "aiType": "AI_CLAUDE",
        "persona": "calculator",
        "difficulty": "expert",
        "psychologyLevel": 2,
        "ws_timeout": 270,       # 210s adapter timeout + 60s buffer
        "cost_per_turn": 0.074,
    },
    "deepseek": {
        "name": "deepseek-reasoner",
        "label": "DeepSeek Reasoner",
        "aiType": "AI_DEEPSEEK",
        "persona": "calculator",
        "difficulty": "expert",
        "psychologyLevel": 2,
        "ws_timeout": 770,       # 700s adapter timeout + 70s buffer (2026-04-18 Day 8: v3 3회 완료 후 원복)
        "cost_per_turn": 0.001,
    },
    "ollama": {
        "name": "qwen2.5:3b",
        "label": "Ollama qwen2.5:3b",
        "aiType": "AI_LLAMA",
        "persona": "calculator",
        "difficulty": "expert",
        "psychologyLevel": 2,
        "ws_timeout": 270,       # 210s adapter timeout + 60s buffer (CPU 추론)
        "cost_per_turn": 0.0,    # 로컬 실행, 비용 없음
    },
}

# Round 2 baselines for comparison
ROUND2_BASELINES = {
    "openai": {"place": 11, "tiles": 27, "draw": 29, "rate": 28.0, "elapsed": 1876, "cost": 1.00, "fallback": 0},
    "claude": {"place": 9, "tiles": 29, "draw": 31, "rate": 23.0, "elapsed": 2076, "cost": 2.96, "fallback": 0},
    "deepseek": {"place": 2, "tiles": 14, "draw": 38, "rate": 5.0, "elapsed": 1995, "cost": 0.04, "fallback": 0},
}


def dev_login(base_url, user_id, display_name):
    """Get auth token via dev-login"""
    resp = requests.post(
        f"{base_url}/api/auth/dev-login",
        json={"userId": user_id, "displayName": display_name},
    )
    resp.raise_for_status()
    data = resp.json()
    token = data.get("token") or data.get("data", {}).get("token", "")
    if not token:
        print(f"  WARNING: No token in response: {json.dumps(data)[:200]}")
    return token


def create_room(base_url, token, model_config):
    """Create a 2-player room with 1 AI"""
    room_name = f"R4-{model_config['name']}-{int(time.time())}"
    body = {
        "name": room_name,
        "playerCount": 2,
        "turnTimeoutSec": 120,
        "displayName": "AutoDraw-Host",
        "aiPlayers": [
            {
                "type": model_config["aiType"],
                "persona": model_config["persona"],
                "difficulty": model_config["difficulty"],
                "psychologyLevel": model_config["psychologyLevel"],
            }
        ],
    }
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.post(f"{base_url}/api/rooms", json=body, headers=headers)
    resp.raise_for_status()
    data = resp.json()
    room_id = (
        data.get("id") or data.get("roomId") or data.get("data", {}).get("id", "")
    )
    if not room_id:
        print(f"  WARNING: Could not extract room_id from: {json.dumps(data)[:200]}")
    print(f"  Room created: {room_id}")
    return str(room_id)


def start_game(base_url, token, room_id):
    """Start the game"""
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.post(f"{base_url}/api/rooms/{room_id}/start", headers=headers)
    resp.raise_for_status()
    print(f"  Game started")


async def run_battle(base_url, ws_url, model_key, model_config):
    """Run a single battle: Human(auto-draw) vs AI"""
    label = model_config["label"]
    ws_timeout = model_config["ws_timeout"]
    print(f"\n{'='*70}")
    print(f"  BATTLE: Human(AutoDraw) vs {label}")
    print(f"  Model: {model_config['name']}")
    print(f"  Persona: {model_config['persona']} / Difficulty: {model_config['difficulty']} / PsychLevel: {model_config['psychologyLevel']}")
    print(f"  Max turns: {MAX_TURNS} / WS timeout: {ws_timeout}s")
    print(f"{'='*70}")

    stats = {
        "model_key": model_key,
        "model": label,
        "ai_place": 0,
        "ai_tiles_placed": 0,
        "ai_draw": 0,
        "ai_fallback": 0,
        "fallback_reasons": [],
        "total_turns": 0,
        "result": "TIMEOUT",
        "end_type": "",
        "elapsed": 0,
        "ai_response_times": [],
        "place_details": [],
        "error_messages": [],
    }

    start_time = time.time()

    try:
        user_id = f"auto-r4-{model_key}-{uuid.uuid4().hex[:6]}"
        token = dev_login(base_url, user_id, f"Auto-{model_key}")
        print(f"  Logged in as {user_id}")

        room_id = create_room(base_url, token, model_config)
        start_game(base_url, token, room_id)

        ws_uri = f"{ws_url}?roomId={room_id}"
        async with websockets.connect(
            ws_uri, ping_interval=30, ping_timeout=60, close_timeout=10
        ) as ws:
            auth_msg = {
                "type": "AUTH",
                "payload": {"token": token},
                "seq": 1,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            await ws.send(json.dumps(auth_msg))
            print(f"  WS connected, AUTH sent")

            seq = 2
            my_seat = -1
            game_over = False
            turn_count = 0
            first_turn_handled = False
            ai_turn_start = None

            while not game_over and turn_count < MAX_TURNS:
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=ws_timeout)
                    msg = json.loads(raw)
                    msg_type = msg.get("type", "")
                    payload = msg.get("payload", {})

                    if msg_type == "AUTH_OK":
                        my_seat = payload.get("seat", 0)
                        print(f"  AUTH_OK - my seat: {my_seat}")

                    elif msg_type == "GAME_STATE":
                        hand_count = len(payload.get("myRack", []))
                        current_seat = payload.get("currentSeat", -1)
                        print(f"  GAME_STATE received - hand: {hand_count} tiles, currentSeat: {current_seat}")
                        if not first_turn_handled and current_seat == my_seat and hand_count > 0:
                            first_turn_handled = True
                            turn_count += 1
                            draw_msg = {
                                "type": "DRAW_TILE",
                                "payload": {},
                                "seq": seq,
                                "timestamp": datetime.now(timezone.utc).isoformat(),
                            }
                            seq += 1
                            await ws.send(json.dumps(draw_msg))
                            print(f"  T{turn_count:02d} Human(seat {my_seat}): DRAW (from GAME_STATE)")
                        elif not first_turn_handled and current_seat != my_seat and hand_count > 0:
                            first_turn_handled = True
                            turn_count += 1
                            ai_turn_start = time.time()
                            print(f"  T{turn_count:02d} AI(seat {current_seat}): thinking (first turn)...", end="", flush=True)

                    elif msg_type == "TURN_START":
                        current_seat = payload.get("seat", -1)
                        turn_count += 1
                        if current_seat == my_seat:
                            draw_msg = {
                                "type": "DRAW_TILE",
                                "payload": {},
                                "seq": seq,
                                "timestamp": datetime.now(timezone.utc).isoformat(),
                            }
                            seq += 1
                            await ws.send(json.dumps(draw_msg))
                            print(f"  T{turn_count:02d} Human(seat {my_seat}): DRAW")
                        else:
                            ai_turn_start = time.time()
                            print(f"  T{turn_count:02d} AI(seat {current_seat}): thinking...", end="", flush=True)

                    elif msg_type == "TURN_END":
                        seat = payload.get("seat", -1)
                        action = payload.get("action", "")
                        if seat != my_seat:
                            tiles_placed = payload.get("tilesPlacedCount", 0)
                            is_fallback = payload.get("isFallbackDraw", False)
                            fallback_reason = payload.get("fallbackReason", "")

                            resp_time = None
                            if ai_turn_start:
                                resp_time = round(time.time() - ai_turn_start, 1)
                                stats["ai_response_times"].append(resp_time)
                                ai_turn_start = None

                            if action == "PLACE_TILES":
                                stats["ai_place"] += 1
                                stats["ai_tiles_placed"] += tiles_placed
                                stats["place_details"].append({
                                    "turn": turn_count,
                                    "tiles": tiles_placed,
                                    "cumulative": stats["ai_tiles_placed"],
                                    "resp_time": resp_time,
                                })
                                print(f" PLACE ({tiles_placed} tiles, cumul={stats['ai_tiles_placed']}) [{resp_time}s]")
                            elif action in ("DRAW", "DRAW_TILE", "TIMEOUT"):
                                stats["ai_draw"] += 1
                                if is_fallback:
                                    stats["ai_fallback"] += 1
                                    stats["fallback_reasons"].append(fallback_reason)
                                    print(f" DRAW (fallback: {fallback_reason}) [{resp_time}s]")
                                else:
                                    print(f" DRAW [{resp_time}s]")
                            else:
                                print(f" {action} [{resp_time}s]")

                    elif msg_type == "TILE_DRAWN":
                        pass

                    elif msg_type == "DRAW_PILE_EMPTY":
                        print(f"  ** Draw pile empty! **")

                    elif msg_type == "GAME_OVER":
                        game_over = True
                        stats["end_type"] = payload.get("endType", "UNKNOWN")
                        results = payload.get("results", [])
                        print(f"\n  GAME OVER: {stats['end_type']}")
                        for r in results:
                            s = r.get("seat", "?")
                            name = r.get("displayName", "?")
                            tiles_left = r.get("tilesRemaining", "?")
                            score = r.get("score", "?")
                            print(f"    seat {s} ({name}): {tiles_left} tiles left, score={score}")

                    elif msg_type == "ERROR":
                        code = payload.get("code", "")
                        message = payload.get("message", "")
                        stats["error_messages"].append(f"[{code}] {message}")
                        print(f"  ERROR: [{code}] {message}")

                    elif msg_type in ("PLAYER_JOINED", "PLAYER_LEFT", "ROOM_STATE"):
                        pass

                    else:
                        if msg_type not in ("PING", "PONG"):
                            print(f"  [{msg_type}] {json.dumps(payload)[:100]}")

                except asyncio.TimeoutError:
                    print(f"\n  ** WS timeout after {ws_timeout}s **")
                    stats["result"] = "WS_TIMEOUT"
                    break
                except websockets.exceptions.ConnectionClosed as e:
                    print(f"\n  ** WS closed: {e} **")
                    stats["result"] = "WS_CLOSED"
                    break

            stats["total_turns"] = turn_count
            if game_over:
                stats["result"] = stats["end_type"]

    except Exception as e:
        print(f"  EXCEPTION: {e}")
        import traceback
        traceback.print_exc()
        stats["result"] = f"ERROR: {str(e)[:60]}"

    stats["elapsed"] = round(time.time() - start_time, 1)

    total_ai = stats["ai_place"] + stats["ai_draw"]
    rate = (stats["ai_place"] / total_ai * 100) if total_ai > 0 else 0
    stats["rate"] = round(rate, 1)

    # Response time stats
    ai_times = stats["ai_response_times"]
    if ai_times:
        stats["resp_avg"] = round(sum(ai_times) / len(ai_times), 1)
        stats["resp_p50"] = round(sorted(ai_times)[len(ai_times) // 2], 1)
        stats["resp_min"] = round(min(ai_times), 1)
        stats["resp_max"] = round(max(ai_times), 1)
    else:
        stats["resp_avg"] = stats["resp_p50"] = stats["resp_min"] = stats["resp_max"] = 0

    est_cost = total_ai * model_config["cost_per_turn"]
    stats["est_cost"] = round(est_cost, 3)

    # Print individual result
    print(f"\n  --- {label} Result ---")
    print(f"  Place: {stats['ai_place']} ({stats['ai_tiles_placed']} tiles) | Draw: {stats['ai_draw']} | Fallback: {stats['ai_fallback']}")
    print(f"  Rate: {rate:.1f}% | Turns: {stats['total_turns']} | Time: {stats['elapsed']}s | Cost: ${est_cost:.3f}")
    print(f"  Resp time: avg={stats['resp_avg']}s, p50={stats['resp_p50']}s, min={stats['resp_min']}s, max={stats['resp_max']}s")
    print(f"  Result: {stats['result']}")

    return stats


def print_comparison(all_stats):
    """Print final comparison table with Round 2 baselines"""
    print(f"\n\n{'='*100}")
    print(f"  3-MODEL ROUND 4 TOURNAMENT RESULTS")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*100}")

    # Main comparison table
    header = f"{'Model':<20} {'Place':>5} {'Tiles':>5} {'Draw':>5} {'FBack':>5} {'Rate':>7} {'Turns':>5} {'Time':>8} {'Cost':>7} {'Result':<12}"
    print(header)
    print("-" * 100)
    for s in all_stats:
        row = (
            f"{s['model']:<20} "
            f"{s['ai_place']:>5} "
            f"{s['ai_tiles_placed']:>5} "
            f"{s['ai_draw']:>5} "
            f"{s['ai_fallback']:>5} "
            f"{s['rate']:>5.1f}% "
            f"{s['total_turns']:>5} "
            f"{s['elapsed']:>7.1f}s "
            f"${s['est_cost']:>5.3f} "
            f"{s['result']:<12}"
        )
        print(row)
    print("-" * 100)

    # Response time comparison
    print(f"\n  Response Time Comparison:")
    print(f"  {'Model':<20} {'Avg':>8} {'P50':>8} {'Min':>8} {'Max':>8}")
    print(f"  {'-'*56}")
    for s in all_stats:
        print(f"  {s['model']:<20} {s['resp_avg']:>7.1f}s {s['resp_p50']:>7.1f}s {s['resp_min']:>7.1f}s {s['resp_max']:>7.1f}s")

    # Delta comparison with Round 2
    print(f"\n  Round 2 vs Round 4 Comparison:")
    print(f"  {'Model':<20} {'R2 Rate':>8} {'R4 Rate':>8} {'Delta':>8} {'R2 Cost':>8} {'R4 Cost':>8}")
    print(f"  {'-'*56}")
    for s in all_stats:
        key = s["model_key"]
        if key in ROUND2_BASELINES:
            r2 = ROUND2_BASELINES[key]
            delta = s["rate"] - r2["rate"]
            print(f"  {s['model']:<20} {r2['rate']:>6.1f}% {s['rate']:>6.1f}% {delta:>+6.1f}% ${r2['cost']:>6.2f} ${s['est_cost']:>6.3f}")

    # Fallback details
    has_fallback = any(s["fallback_reasons"] for s in all_stats)
    if has_fallback:
        print(f"\n  Fallback Reasons:")
        for s in all_stats:
            if s["fallback_reasons"]:
                reasons = Counter(s["fallback_reasons"])
                for reason, count in reasons.most_common():
                    print(f"    {s['model']}: {reason} x{count}")

    # Place details
    for s in all_stats:
        if s["place_details"]:
            print(f"\n  {s['model']} Place Details:")
            print(f"  {'Turn':>6} {'Tiles':>6} {'Cumulative':>10} {'Resp(s)':>8}")
            for pd in s["place_details"]:
                print(f"  {pd['turn']:>6} {pd['tiles']:>6} {pd['cumulative']:>10} {pd['resp_time']:>8}")

    # Cost summary
    total_cost = sum(s["est_cost"] for s in all_stats)
    print(f"\n  Total estimated cost: ${total_cost:.3f}")


def save_results(all_stats, filename):
    """Save results to JSON file"""
    result_data = {
        "tournament": "3-model Round 4",
        "timestamp": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        "config": {
            "maxTurns": MAX_TURNS,
            "persona": "calculator",
            "difficulty": "expert",
            "psychologyLevel": 2,
        },
        "models": [],
    }

    for s in all_stats:
        key = s["model_key"]
        total_ai = s["ai_place"] + s["ai_draw"]
        r2 = ROUND2_BASELINES.get(key, {})

        model_result = {
            "modelKey": key,
            "modelName": s["model"],
            "totalTurns": s["total_turns"],
            "aiTurns": total_ai,
            "aiPlace": s["ai_place"],
            "aiTilesPlaced": s["ai_tiles_placed"],
            "aiDraw": s["ai_draw"],
            "aiFallback": s["ai_fallback"],
            "placeRate": s["rate"],
            "elapsed": s["elapsed"],
            "estimatedCost": s["est_cost"],
            "result": s["result"],
            "responseTime": {
                "avg": s["resp_avg"],
                "p50": s["resp_p50"],
                "min": s["resp_min"],
                "max": s["resp_max"],
            },
            "placeDetails": s["place_details"],
            "fallbackReasons": s["fallback_reasons"],
            "errors": s["error_messages"],
            "round2Baseline": r2,
            "deltaPlaceRate": round(s["rate"] - r2.get("rate", 0), 1),
        }
        result_data["models"].append(model_result)

    try:
        with open(filename, "w") as f:
            json.dump(result_data, f, indent=2, ensure_ascii=False)
        print(f"\n  Results saved to {filename}")
    except Exception as e:
        print(f"\n  WARNING: Failed to save results: {e}")


async def main():
    global MAX_TURNS

    parser = argparse.ArgumentParser(
        description="AI Battle: 3 Model Round 4 Tournament"
    )
    parser.add_argument(
        "--port", type=int, default=DEFAULT_PORT,
        help=f"Game server port (default: {DEFAULT_PORT})",
    )
    parser.add_argument(
        "--host", type=str, default=DEFAULT_HOST,
        help=f"Game server host (default: {DEFAULT_HOST})",
    )
    parser.add_argument(
        "--max-turns", type=int, default=MAX_TURNS,
        help=f"Maximum turns per game (default: {MAX_TURNS})",
    )
    parser.add_argument(
        "--models", type=str, default="openai,claude,deepseek",
        help="Comma-separated model keys to run (default: openai,claude,deepseek)",
    )
    parser.add_argument(
        "--delay", type=int, default=10,
        help="Delay between battles in seconds (default: 10)",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Print configuration and exit without running",
    )
    args = parser.parse_args()

    MAX_TURNS = args.max_turns

    base_url = f"http://{args.host}:{args.port}"
    ws_url = f"ws://{args.host}:{args.port}/ws"

    selected_keys = [k.strip() for k in args.models.split(",")]
    selected_models = [(k, MODELS[k]) for k in selected_keys if k in MODELS]

    if not selected_models:
        print(f"ERROR: No valid models selected. Available: {', '.join(MODELS.keys())}")
        return

    # Estimate costs
    total_est = sum(m["cost_per_turn"] * (MAX_TURNS // 2) for _, m in selected_models)

    print("=" * 70)
    print("  3-MODEL ROUND 4 TOURNAMENT")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  Server: {base_url}")
    print(f"  Max turns: {MAX_TURNS} / Models: {len(selected_models)}")
    print(f"  Delay between battles: {args.delay}s")
    print("=" * 70)
    print(f"\n  Models to run:")
    for key, config in selected_models:
        r2 = ROUND2_BASELINES.get(key, {})
        est = config["cost_per_turn"] * (MAX_TURNS // 2)
        print(f"    {config['label']:<20} WS timeout: {config['ws_timeout']}s, est cost: ${est:.2f}, R2 baseline: {r2.get('rate', 'N/A')}%")
    print(f"\n  Total estimated cost: ${total_est:.2f}")
    print(f"  Uniform config: persona=calculator, difficulty=expert, psychologyLevel=2")

    if args.dry_run:
        print("\n  [DRY RUN] Exiting without running battles.")
        return

    # Health checks
    print(f"\n  --- Health Checks ---")
    try:
        resp = requests.get(f"{base_url}/health", timeout=5)
        health = resp.json()
        print(f"  Game Server:  {health.get('status', 'unknown')}")
    except Exception as e:
        print(f"  Game Server:  FAILED ({e})")
        print(f"  Aborting tournament.")
        return

    # AI adapter health via game-server's internal port or NodePort
    ai_adapter_port = args.port + 1  # 30081 if NodePort 30080
    try:
        resp = requests.get(f"http://{args.host}:{ai_adapter_port}/health", timeout=5)
        ai_health = resp.json()
        print(f"  AI Adapter:   {ai_health.get('status', 'unknown')}")
    except Exception as e:
        print(f"  AI Adapter:   FAILED ({e}) -- might be OK if internal only")

    # Run battles sequentially
    all_stats = []
    for i, (key, config) in enumerate(selected_models):
        if i > 0:
            print(f"\n  Waiting {args.delay}s between battles...")
            await asyncio.sleep(args.delay)

        stats = await run_battle(base_url, ws_url, key, config)
        all_stats.append(stats)

    # Print comparison
    print_comparison(all_stats)

    # Save results
    save_results(all_stats, "scripts/ai-battle-3model-r4-results.json")

    print(f"\n  Tournament completed at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*70}")


if __name__ == "__main__":
    asyncio.run(main())
