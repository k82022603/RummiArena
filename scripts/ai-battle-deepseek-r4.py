#!/usr/bin/env python3
"""
AI Battle Test - DeepSeek Reasoner Round 4 (A/B Test)

Round 3 baseline (v1 prompt): 12.5% place rate (5 place / 22 tiles / 80 turns / 2450s / 55% invalid)
Round 4 (v2 prompt optimizations):
  1. Few-shot 5 examples (VALID/INVALID pairs)
  2. Pre-submission validation checklist (7 items)
  3. Step-by-step thinking procedure (9 steps)
  4. Tile encoding table format
  5. Detailed GROUP/RUN rules with VALID/INVALID examples

Target: Place rate 15%+ / Invalid rate 25~30% (down from 55%)

Usage:
  # game-server NodePort(30080) direct
  python3 scripts/ai-battle-deepseek-r4.py

  # custom port
  python3 scripts/ai-battle-deepseek-r4.py --port 18089
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
DEFAULT_BASE_URL = "http://localhost:30080"
DEFAULT_WS_URL = "ws://localhost:30080/ws"
MAX_TURNS = 80
WS_TIMEOUT = 180  # DeepSeek Reasoner: 150s adapter timeout + 30s buffer

# DeepSeek Reasoner configuration
DEEPSEEK_CONFIG = {
    "name": "deepseek-reasoner",
    "label": "DeepSeek Reasoner (v2 prompt)",
    "aiType": "AI_DEEPSEEK",
    "persona": "calculator",
    "difficulty": "expert",
    "psychologyLevel": 2,
}

# Round 3 baseline (v1 prompt) for comparison
ROUND3_BASELINE = {
    "place": 5,
    "tiles_placed": 22,
    "draw": 35,
    "fallback": 0,
    "rate": 12.5,
    "turns": 80,
    "elapsed": 2450.0,
    "cost": 0.066,
    "invalid_attempts": 11,
    "invalid_rejected": 4,  # 55% of 11 attempts had invalid moves rejected by engine
    "invalid_rate_pct": 55.0,
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
    room_name = f"R4-DeepSeek-{int(time.time())}"
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
    resp = requests.post(
        f"{base_url}/api/rooms/{room_id}/start", headers=headers
    )
    resp.raise_for_status()
    print(f"  Game started")


async def run_battle(base_url, ws_url, model_config):
    """Run a single battle: Human(auto-draw) vs DeepSeek Reasoner"""
    label = model_config["label"]
    print(f"\n{'='*70}")
    print(f"  BATTLE: Human(AutoDraw) vs {label}")
    print(f"  Model: deepseek-reasoner (v2 prompt: few-shot + validation checklist)")
    print(f"  Persona: calculator / Difficulty: expert / PsychLevel: 2")
    print(f"  Max turns: {MAX_TURNS} / WS timeout: {WS_TIMEOUT}s")
    print(f"{'='*70}")

    stats = {
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
        user_id = f"auto-r4-{uuid.uuid4().hex[:8]}"
        token = dev_login(base_url, user_id, "AutoDraw-R4")
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
                    raw = await asyncio.wait_for(ws.recv(), timeout=WS_TIMEOUT)
                    msg = json.loads(raw)
                    msg_type = msg.get("type", "")
                    payload = msg.get("payload", {})

                    if msg_type == "AUTH_OK":
                        my_seat = payload.get("seat", 0)
                        print(f"  AUTH_OK - my seat: {my_seat}")

                    elif msg_type == "GAME_STATE":
                        hand_count = len(payload.get("myRack", []))
                        current_seat = payload.get("currentSeat", -1)
                        print(
                            f"  GAME_STATE received - hand: {hand_count} tiles, currentSeat: {current_seat}"
                        )
                        if (
                            not first_turn_handled
                            and current_seat == my_seat
                            and hand_count > 0
                        ):
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
                            print(
                                f"  T{turn_count:02d} Human(seat {my_seat}): DRAW (from GAME_STATE)"
                            )
                        elif (
                            not first_turn_handled
                            and current_seat != my_seat
                            and hand_count > 0
                        ):
                            first_turn_handled = True
                            turn_count += 1
                            ai_turn_start = time.time()
                            print(
                                f"  T{turn_count:02d} AI(seat {current_seat}): thinking (first turn)...",
                                end="",
                                flush=True,
                            )

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
                            print(
                                f"  T{turn_count:02d} AI(seat {current_seat}): thinking...",
                                end="",
                                flush=True,
                            )

                    elif msg_type == "TURN_END":
                        seat = payload.get("seat", -1)
                        action = payload.get("action", "")
                        if seat != my_seat:
                            tiles_placed = payload.get("tilesPlacedCount", 0)
                            is_fallback = payload.get("isFallbackDraw", False)
                            fallback_reason = payload.get("fallbackReason", "")

                            # Record response time
                            resp_time = None
                            if ai_turn_start:
                                resp_time = round(time.time() - ai_turn_start, 1)
                                stats["ai_response_times"].append(resp_time)
                                ai_turn_start = None

                            if action == "PLACE_TILES":
                                stats["ai_place"] += 1
                                stats["ai_tiles_placed"] += tiles_placed
                                stats["place_details"].append(
                                    {
                                        "turn": turn_count,
                                        "tiles": tiles_placed,
                                        "cumulative": stats["ai_tiles_placed"],
                                        "resp_time": resp_time,
                                    }
                                )
                                print(
                                    f" PLACE ({tiles_placed} tiles, cumulative={stats['ai_tiles_placed']}) [{resp_time}s]"
                                )
                            elif action in ("DRAW", "DRAW_TILE", "TIMEOUT"):
                                stats["ai_draw"] += 1
                                if is_fallback:
                                    stats["ai_fallback"] += 1
                                    stats["fallback_reasons"].append(fallback_reason)
                                    print(
                                        f" DRAW (fallback: {fallback_reason}) [{resp_time}s]"
                                    )
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
                            print(
                                f"    seat {s} ({name}): {tiles_left} tiles left, score={score}"
                            )

                    elif msg_type == "ERROR":
                        code = payload.get("code", "")
                        message = payload.get("message", "")
                        stats["error_messages"].append(f"[{code}] {message}")
                        print(f"  ERROR: [{code}] {message}")

                    elif msg_type in (
                        "PLAYER_JOINED",
                        "PLAYER_LEFT",
                        "ROOM_STATE",
                    ):
                        pass

                    else:
                        if msg_type not in ("PING", "PONG"):
                            print(
                                f"  [{msg_type}] {json.dumps(payload)[:100]}"
                            )

                except asyncio.TimeoutError:
                    print(f"\n  ** WS timeout after {WS_TIMEOUT}s **")
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

    # Compute response time stats
    ai_times = stats["ai_response_times"]
    if ai_times:
        avg_time = round(sum(ai_times) / len(ai_times), 1)
        max_time = round(max(ai_times), 1)
        min_time = round(min(ai_times), 1)
        p50 = round(sorted(ai_times)[len(ai_times) // 2], 1)
    else:
        avg_time = max_time = min_time = p50 = 0

    est_cost = total_ai * 0.001 if total_ai > 0 else 0  # ~$0.001/turn for deepseek

    # Print result summary
    print(f"\n{'='*70}")
    print(f"  ROUND 4 RESULT SUMMARY (v2 prompt)")
    print(f"{'='*70}")
    print(f"  Model      : DeepSeek Reasoner (v2: few-shot + validation checklist)")
    print(f"  Total Turns : {stats['total_turns']}")
    print(f"  AI Turns    : {total_ai}")
    print(f"  AI Place    : {stats['ai_place']} (tiles: {stats['ai_tiles_placed']})")
    print(f"  AI Draw     : {stats['ai_draw']}")
    print(f"  Fallback    : {stats['ai_fallback']}")
    print(f"  Place Rate  : {rate:.1f}%")
    print(f"  Elapsed     : {stats['elapsed']}s")
    print(f"  Est. Cost   : ${est_cost:.3f}")
    print(f"  Result      : {stats['result']}")
    print(f"  Response Time: avg={avg_time}s, p50={p50}s, min={min_time}s, max={max_time}s")

    # A/B Comparison with Round 3 (v1 prompt)
    r3 = ROUND3_BASELINE
    print(f"\n  {'='*48}")
    print(f"  A/B COMPARISON: Round 3 (v1) vs Round 4 (v2)")
    print(f"  {'='*48}")
    print(f"  {'Metric':<20} {'R3 (v1)':>10} {'R4 (v2)':>10} {'Delta':>10}")
    print(f"  {'-'*52}")
    print(
        f"  {'Place count':<20} {r3['place']:>10} {stats['ai_place']:>10} {stats['ai_place']-r3['place']:>+10}"
    )
    print(
        f"  {'Tiles placed':<20} {r3['tiles_placed']:>10} {stats['ai_tiles_placed']:>10} {stats['ai_tiles_placed']-r3['tiles_placed']:>+10}"
    )
    print(
        f"  {'Draw count':<20} {r3['draw']:>10} {stats['ai_draw']:>10} {stats['ai_draw']-r3['draw']:>+10}"
    )
    print(
        f"  {'Fallback':<20} {r3['fallback']:>10} {stats['ai_fallback']:>10} {stats['ai_fallback']-r3['fallback']:>+10}"
    )
    print(
        f"  {'Place Rate (%)':<20} {r3['rate']:>9.1f}% {rate:>9.1f}% {rate-r3['rate']:>+9.1f}%"
    )
    print(
        f"  {'Elapsed (s)':<20} {r3['elapsed']:>10.1f} {stats['elapsed']:>10.1f} {stats['elapsed']-r3['elapsed']:>+10.1f}"
    )
    print(
        f"  {'Est. cost ($)':<20} {r3['cost']:>10.3f} {est_cost:>10.3f} {est_cost-r3['cost']:>+10.3f}"
    )
    print(
        f"  {'Avg resp time (s)':<20} {'~30':>10} {avg_time:>10.1f}"
    )

    # Quality assessment
    print(f"\n  {'='*48}")
    print(f"  QUALITY ASSESSMENT")
    print(f"  {'='*48}")
    if rate >= 20:
        grade = "A (Excellent)"
    elif rate >= 15:
        grade = "B (Good, target met)"
    elif rate >= 12.5:
        grade = "C (Baseline match)"
    elif rate >= 5:
        grade = "D (Below baseline)"
    else:
        grade = "F (Critical failure)"
    print(f"  Grade        : {grade}")
    print(f"  Target       : Place Rate >= 15%")
    print(f"  Baseline (R3): Place Rate = 12.5%")

    improvement = ""
    if rate > r3["rate"]:
        improvement = f"IMPROVED (+{rate - r3['rate']:.1f}pp from R3)"
    elif rate == r3["rate"]:
        improvement = "NO CHANGE (same as R3)"
    else:
        improvement = f"REGRESSION ({rate - r3['rate']:.1f}pp from R3)"
    print(f"  Verdict      : {improvement}")

    # Place details
    if stats["place_details"]:
        print(f"\n  --- Place Details ---")
        print(f"  {'Turn':>6} {'Tiles':>6} {'Cumulative':>10} {'Resp(s)':>8}")
        for pd in stats["place_details"]:
            print(
                f"  {pd['turn']:>6} {pd['tiles']:>6} {pd['cumulative']:>10} {pd['resp_time']:>8}"
            )

    if stats["fallback_reasons"]:
        print(f"\n  --- Fallback Reasons ---")
        reasons = Counter(stats["fallback_reasons"])
        for reason, count in reasons.most_common():
            print(f"    {reason} x{count}")

    if stats["error_messages"]:
        print(f"\n  --- Errors ({len(stats['error_messages'])}) ---")
        for err in stats["error_messages"][:10]:
            print(f"    {err}")

    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f"\n  Test completed at {timestamp}")
    print(f"{'='*70}")

    # Save results to JSON file
    result_data = {
        "round": 4,
        "version": "v2",
        "timestamp": timestamp,
        "config": {
            "model": "deepseek-reasoner",
            "persona": "calculator",
            "difficulty": "expert",
            "psychologyLevel": 2,
            "maxTurns": MAX_TURNS,
            "wsTimeout": WS_TIMEOUT,
        },
        "results": {
            "totalTurns": stats["total_turns"],
            "aiTurns": total_ai,
            "aiPlace": stats["ai_place"],
            "aiTilesPlaced": stats["ai_tiles_placed"],
            "aiDraw": stats["ai_draw"],
            "aiFallback": stats["ai_fallback"],
            "placeRate": round(rate, 1),
            "elapsed": stats["elapsed"],
            "estimatedCost": round(est_cost, 3),
            "result": stats["result"],
            "grade": grade,
        },
        "responseTime": {
            "avg": avg_time,
            "p50": p50,
            "min": min_time,
            "max": max_time,
        },
        "comparison": {
            "baselineRound": 3,
            "baselineVersion": "v1",
            "baselinePlaceRate": r3["rate"],
            "baselinePlaceCount": r3["place"],
            "deltaPlaceRate": round(rate - r3["rate"], 1),
            "deltaPlaceCount": stats["ai_place"] - r3["place"],
        },
        "placeDetails": stats["place_details"],
        "fallbackReasons": stats["fallback_reasons"],
        "errors": stats["error_messages"],
    }

    result_file = f"scripts/ai-battle-deepseek-r4-results.json"
    try:
        with open(result_file, "w") as f:
            json.dump(result_data, f, indent=2, ensure_ascii=False)
        print(f"  Results saved to {result_file}")
    except Exception as e:
        print(f"  WARNING: Failed to save results: {e}")

    return stats


async def main():
    parser = argparse.ArgumentParser(
        description="AI Battle: DeepSeek Reasoner Round 4 (A/B Test v1 vs v2 prompt)"
    )
    parser.add_argument(
        "--port",
        type=int,
        default=30080,
        help="Game server port (default: 30080 for NodePort)",
    )
    parser.add_argument(
        "--host",
        type=str,
        default="localhost",
        help="Game server host (default: localhost)",
    )
    parser.add_argument(
        "--max-turns",
        type=int,
        default=80,
        help="Maximum turns (default: 80)",
    )
    args = parser.parse_args()

    global MAX_TURNS
    MAX_TURNS = args.max_turns

    base_url = f"http://{args.host}:{args.port}"
    ws_url = f"ws://{args.host}:{args.port}/ws"

    print("=" * 70)
    print("  DeepSeek Reasoner Round 4 - A/B Test (v2 prompt)")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  Server: {base_url}")
    print(f"  Max turns: {MAX_TURNS}, WS timeout: {WS_TIMEOUT}s")
    print(f"  v2 prompt optimizations:")
    print(f"    - Few-shot 5 examples (VALID/INVALID pairs)")
    print(f"    - Pre-submission validation checklist (7 items)")
    print(f"    - Step-by-step thinking procedure (9 steps)")
    print(f"    - Tile encoding table format (Color|Number|Set)")
    print(f"    - Detailed GROUP/RUN rules with VALID/INVALID examples")
    print(f"  Baseline: Round 3 (v1) = 12.5% place rate / 55% invalid rate")
    print("=" * 70)

    # Health check
    try:
        resp = requests.get(f"{base_url}/health", timeout=5)
        health = resp.json()
        print(f"\n  Health check: {health.get('status', 'unknown')}")
    except Exception as e:
        print(f"\n  WARNING: Health check failed: {e}")
        print(f"  Attempting battle anyway...")

    # Check AI adapter health
    try:
        resp = requests.get("http://localhost:30081/health", timeout=5)
        ai_health = resp.json()
        print(f"  AI Adapter health: {ai_health.get('status', 'unknown')}")
    except Exception as e:
        print(f"  AI Adapter health check failed: {e}")

    stats = await run_battle(base_url, ws_url, DEEPSEEK_CONFIG)

    return stats


if __name__ == "__main__":
    asyncio.run(main())
