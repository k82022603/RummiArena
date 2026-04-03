#!/usr/bin/env python3
"""
AI Battle Test - DeepSeek Reasoner Round 3

Round 2 결과 (2026-03-31): 5% place rate (2 place / 14 tiles / 80 turns)
최적화 사항 (2026-04-01~02):
  1. 영문 전용 프롬프트 (~1200 토큰, 기존 ~3000 한국어 대비 60% 절감)
  2. 4단계 JSON 추출 (content -> regex -> reasoning_content -> fallback)
  3. Temperature 제거 (결정적 출력)
  4. JSON 수리 (trailing comma, 코드블록, 중괄호 매칭)
  5. 게임 버그 24건 수정 (INVALID_MOVE 후 랙 복원 등)

목표: place rate 15%+ (12회 이상 배치)

실행:
  # game-server NodePort(30080)으로 직접 접속
  python3 scripts/ai-battle-deepseek-r3.py

  # port-forward 사용 시
  python3 scripts/ai-battle-deepseek-r3.py --port 18089
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
    "label": "DeepSeek Reasoner (Round 3)",
    "aiType": "AI_DEEPSEEK",
    "persona": "calculator",
    "difficulty": "expert",
    "psychologyLevel": 2,
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
    room_name = f"R3-DeepSeek-{int(time.time())}"
    body = {
        "name": room_name,
        "playerCount": 2,
        "turnTimeoutSec": 120,  # 2분 (서버 max=120, DeepSeek adapter timeout=150s 별도)
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
    print(f"  Model: deepseek-reasoner (optimized prompt)")
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
    }

    start_time = time.time()

    try:
        user_id = f"auto-r3-{uuid.uuid4().hex[:8]}"
        token = dev_login(base_url, user_id, "AutoDraw-R3")
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
    else:
        avg_time = max_time = min_time = 0

    print(f"\n{'='*70}")
    print(f"  ROUND 3 RESULT SUMMARY")
    print(f"{'='*70}")
    print(f"  Model      : DeepSeek Reasoner (optimized)")
    print(f"  Total Turns : {stats['total_turns']}")
    print(f"  AI Place    : {stats['ai_place']} (tiles: {stats['ai_tiles_placed']})")
    print(f"  AI Draw     : {stats['ai_draw']}")
    print(f"  Fallback    : {stats['ai_fallback']}")
    print(f"  Place Rate  : {rate:.1f}%")
    print(f"  Elapsed     : {stats['elapsed']}s")
    print(f"  Result      : {stats['result']}")
    print(f"  Response Time: avg={avg_time}s, min={min_time}s, max={max_time}s")

    # Round 2 comparison
    print(f"\n  --- Comparison with Round 2 ---")
    r2_place = 2
    r2_tiles = 14
    r2_rate = 5.0
    r2_elapsed = 1995.0
    print(f"  {'Metric':<16} {'Round 2':>10} {'Round 3':>10} {'Delta':>10}")
    print(f"  {'-'*48}")
    print(
        f"  {'Place count':<16} {r2_place:>10} {stats['ai_place']:>10} {stats['ai_place']-r2_place:>+10}"
    )
    print(
        f"  {'Tiles placed':<16} {r2_tiles:>10} {stats['ai_tiles_placed']:>10} {stats['ai_tiles_placed']-r2_tiles:>+10}"
    )
    print(
        f"  {'Place Rate':<16} {r2_rate:>9.1f}% {rate:>9.1f}% {rate-r2_rate:>+9.1f}%"
    )
    print(
        f"  {'Elapsed (s)':<16} {r2_elapsed:>10.1f} {stats['elapsed']:>10.1f} {stats['elapsed']-r2_elapsed:>+10.1f}"
    )
    print(
        f"  {'Fallback':<16} {'0':>10} {stats['ai_fallback']:>10} {stats['ai_fallback']:>+10}"
    )
    est_cost = stats["total_turns"] * 0.001 / 2  # AI turns only (half)
    print(f"  {'Est. cost ($)':<16} {'0.040':>10} {est_cost:>10.3f}")

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

    print(f"\n  Test completed at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*70}")

    return stats


async def main():
    parser = argparse.ArgumentParser(
        description="AI Battle: DeepSeek Reasoner Round 3"
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
    print("  DeepSeek Reasoner Round 3 - AI Battle Test")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  Server: {base_url}")
    print(f"  Max turns: {MAX_TURNS}, WS timeout: {WS_TIMEOUT}s")
    print(f"  Optimizations applied:")
    print(f"    - English-only system prompt (~1200 tokens, -60%)")
    print(f"    - 4-stage JSON extraction (content/regex/reasoning/fallback)")
    print(f"    - Temperature removed (deterministic output)")
    print(f"    - JSON repair (trailing comma, code blocks)")
    print(f"    - 24 game bugs fixed (INVALID_MOVE rack restore, etc.)")
    print("=" * 70)

    # Health check
    try:
        resp = requests.get(f"{base_url}/health", timeout=5)
        health = resp.json()
        print(f"\n  Health check: {health.get('status', 'unknown')}")
    except Exception as e:
        print(f"\n  WARNING: Health check failed: {e}")
        print(f"  Attempting battle anyway...")

    stats = await run_battle(base_url, ws_url, DEEPSEEK_CONFIG)

    return stats


if __name__ == "__main__":
    asyncio.run(main())
