#!/usr/bin/env python3
"""AI Battle Test - 3 models sequential 1v1 vs Human(auto-draw)"""

import asyncio
import json
import time
import uuid
import requests
import websockets
from datetime import datetime, timezone
from collections import Counter

BASE_URL = "http://localhost:18089"
WS_URL = "ws://localhost:18089/ws"
MAX_TURNS = 80
WS_TIMEOUT = 150  # seconds

# Model configurations
MODELS = [
    {
        "name": "gpt-5-mini",
        "label": "GPT-5-mini",
        "aiType": "AI_OPENAI",
        "persona": "shark",
        "difficulty": "expert",
        "psychologyLevel": 2,
    },
    {
        "name": "claude-opus",
        "label": "Claude Opus",
        "aiType": "AI_CLAUDE",
        "persona": "calculator",
        "difficulty": "expert",
        "psychologyLevel": 2,
    },
    {
        "name": "deepseek-reasoner",
        "label": "DeepSeek Rsn",
        "aiType": "AI_DEEPSEEK",
        "persona": "calculator",
        "difficulty": "expert",
        "psychologyLevel": 2,
    },
]


def dev_login(user_id, display_name):
    """Get auth token via dev-login"""
    resp = requests.post(
        f"{BASE_URL}/api/auth/dev-login",
        json={"userId": user_id, "displayName": display_name},
    )
    resp.raise_for_status()
    data = resp.json()
    # API returns {"token": "...", ...} at top level
    token = data.get("token") or data.get("data", {}).get("token", "")
    if not token:
        print(f"  WARNING: No token in response: {json.dumps(data)[:200]}")
    return token


def create_room(token, model_config):
    """Create a 2-player room with 1 AI"""
    room_name = f"Battle-{model_config['name']}-{int(time.time())}"
    body = {
        "name": room_name,
        "playerCount": 2,
        "turnTimeoutSec": 120,
        "displayName": "Auto",
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
    resp = requests.post(f"{BASE_URL}/api/rooms", json=body, headers=headers)
    resp.raise_for_status()
    data = resp.json()
    # API returns {"id": "...", ...} at top level
    room_id = data.get("id") or data.get("roomId") or data.get("data", {}).get("id", "")
    if not room_id:
        print(f"  WARNING: Could not extract room_id from: {json.dumps(data)[:200]}")
    print(f"  Room created: {room_id}")
    return str(room_id)


def start_game(token, room_id):
    """Start the game"""
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.post(f"{BASE_URL}/api/rooms/{room_id}/start", headers=headers)
    resp.raise_for_status()
    print(f"  Game started")


async def run_battle(model_config):
    """Run a single battle: Human(auto-draw) vs AI"""
    label = model_config["label"]
    print(f"\n{'='*60}")
    print(f"  BATTLE: Human vs {label}")
    print(f"{'='*60}")

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
    }

    start_time = time.time()

    try:
        user_id = f"auto-{uuid.uuid4().hex[:8]}"
        token = dev_login(user_id, "Auto")
        print(f"  Logged in as {user_id}")

        room_id = create_room(token, model_config)
        # Start game FIRST via REST, then connect WS
        start_game(token, room_id)

        ws_uri = f"{WS_URL}?roomId={room_id}"
        async with websockets.connect(ws_uri, ping_interval=30, ping_timeout=60, close_timeout=10) as ws:
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
                        print(f"  GAME_STATE received - hand: {hand_count} tiles, currentSeat: {current_seat}")
                        # If it's my turn and we haven't handled first turn yet, auto-draw
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
                            print(f"  T{turn_count:02d} AI(seat {current_seat}): thinking...", end="", flush=True)

                    elif msg_type == "TURN_END":
                        seat = payload.get("seat", -1)
                        action = payload.get("action", "")
                        if seat != my_seat:
                            tiles_placed = payload.get("tilesPlacedCount", 0)
                            is_fallback = payload.get("isFallbackDraw", False)
                            fallback_reason = payload.get("fallbackReason", "")

                            if action == "PLACE_TILES":
                                stats["ai_place"] += 1
                                stats["ai_tiles_placed"] += tiles_placed
                                print(f" PLACE ({tiles_placed} tiles)")
                            elif action in ("DRAW", "DRAW_TILE", "TIMEOUT"):
                                stats["ai_draw"] += 1
                                if is_fallback:
                                    stats["ai_fallback"] += 1
                                    stats["fallback_reasons"].append(fallback_reason)
                                    print(f" DRAW (fallback: {fallback_reason})")
                                else:
                                    print(f" DRAW")
                            else:
                                print(f" {action}")

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
                        print(f"  ERROR: [{code}] {message}")

                    elif msg_type in ("PLAYER_JOINED", "PLAYER_LEFT", "ROOM_STATE"):
                        pass

                    else:
                        if msg_type not in ("PING", "PONG"):
                            print(f"  [{msg_type}] {json.dumps(payload)[:100]}")

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
        stats["result"] = f"ERROR: {str(e)[:40]}"

    stats["elapsed"] = round(time.time() - start_time, 1)

    total_ai = stats["ai_place"] + stats["ai_draw"]
    rate = (stats["ai_place"] / total_ai * 100) if total_ai > 0 else 0
    stats["rate"] = round(rate, 1)
    print(f"\n  Summary: Place={stats['ai_place']}, Draw={stats['ai_draw']}, "
          f"Fallback={stats['ai_fallback']}, Rate={rate:.1f}%, "
          f"Turns={stats['total_turns']}, Time={stats['elapsed']}s")

    return stats


async def main():
    print("=" * 60)
    print("  AI BATTLE TEST - 3 Models Sequential")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  Max turns: {MAX_TURNS}, WS timeout: {WS_TIMEOUT}s")
    print("=" * 60)

    all_stats = []

    for i, model in enumerate(MODELS):
        if i > 0:
            print(f"\n  Waiting 5s between tests...")
            await asyncio.sleep(5)

        stats = await run_battle(model)
        all_stats.append(stats)

    print(f"\n\n{'='*80}")
    print("  FINAL COMPARISON TABLE")
    print(f"{'='*80}")
    header = f"{'Model':<16} {'Place':>5} {'Tiles':>5} {'Draw':>5} {'FBack':>5} {'Rate':>6} {'Turns':>5} {'Time':>7} {'Result'}"
    print(header)
    print("-" * 80)
    for s in all_stats:
        row = (
            f"{s['model']:<16} "
            f"{s['ai_place']:>5} "
            f"{s['ai_tiles_placed']:>5} "
            f"{s['ai_draw']:>5} "
            f"{s['ai_fallback']:>5} "
            f"{s['rate']:>5.1f}% "
            f"{s['total_turns']:>5} "
            f"{s['elapsed']:>6.1f}s "
            f"{s['result']}"
        )
        print(row)
    print("-" * 80)

    has_fallback = any(s["fallback_reasons"] for s in all_stats)
    if has_fallback:
        print("\n  Fallback Reasons:")
        for s in all_stats:
            if s["fallback_reasons"]:
                reasons = Counter(s["fallback_reasons"])
                for reason, count in reasons.most_common():
                    print(f"    {s['model']}: {reason} x{count}")

    print(f"\n  Test completed at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")


if __name__ == "__main__":
    asyncio.run(main())
