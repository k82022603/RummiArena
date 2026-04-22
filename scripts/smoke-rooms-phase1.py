#!/usr/bin/env python3
"""
smoke-rooms-phase1.py — PR #42 Phase 1 Dual-Write 최소 smoke 테스트
- UUID 형식 userId로 dev-login → 방 생성 → 게임 시작 → WS 자동 드로우로 진행
- rooms 테이블 dual-write 트리거 검증
- Ollama (AI_LLAMA) 사용, 비용 $0
"""
import asyncio
import json
import time
import uuid
import sys
import requests
import websockets

BASE_URL = "http://localhost:30080"
WS_URL   = "ws://localhost:30080/ws"
MAX_TURNS = 30          # smoke: 30턴으로 제한 (충분한 시간 내 완료)
WS_TIMEOUT = 90         # 90초 타임아웃 (Ollama가 느릴 수 있으므로)

def dev_login_uuid(user_id: str, display_name: str) -> str:
    resp = requests.post(
        f"{BASE_URL}/api/auth/dev-login",
        json={"userId": user_id, "displayName": display_name},
        timeout=10
    )
    resp.raise_for_status()
    data = resp.json()
    token = data.get("token") or data.get("data", {}).get("token", "")
    return token

def create_room(token: str, room_name: str) -> str:
    headers = {"Authorization": f"Bearer {token}"}
    body = {
        "name": room_name,
        "playerCount": 2,
        "turnTimeoutSec": 120,
        "displayName": "Smoke-Host",
        "aiPlayers": [{
            "type": "AI_LLAMA",
            "persona": "calculator",
            "difficulty": "beginner",
            "psychologyLevel": 0,
        }]
    }
    resp = requests.post(f"{BASE_URL}/api/rooms", json=body, headers=headers, timeout=10)
    resp.raise_for_status()
    data = resp.json()
    room_id = data.get("id") or data.get("roomId") or data.get("data", {}).get("id", "")
    return str(room_id)

def start_game(token: str, room_id: str):
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.post(f"{BASE_URL}/api/rooms/{room_id}/start", headers=headers, timeout=10)
    resp.raise_for_status()

async def run_ws_autodraw(token: str, room_id: str) -> dict:
    """자동 드로우로 최대 MAX_TURNS 진행"""
    ws_uri = f"{WS_URL}?roomId={room_id}"
    stats = {"turns": 0, "result": "TIMEOUT", "game_over": False}

    try:
        async with websockets.connect(ws_uri, open_timeout=15, close_timeout=10) as ws:
            # AUTH — envelope format: {type, payload: {token}}
            auth_msg = {"type": "AUTH", "payload": {"token": token}, "seq": 0}
            await ws.send(json.dumps(auth_msg))

            start_t = time.time()
            my_seat = None
            turn_count = 0

            while time.time() - start_t < WS_TIMEOUT:
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=30)
                except asyncio.TimeoutError:
                    print("  WS recv timeout — assuming game ended or stalled")
                    break

                msg = json.loads(raw)
                mtype = msg.get("type", "")

                if mtype == "AUTH_OK":
                    my_seat = msg.get("seat", 0)
                    print(f"  AUTH_OK seat={my_seat}")

                elif mtype == "GAME_STATE":
                    # Initial game state — check if it's our turn (seat 0 goes first usually)
                    gs = msg.get("payload", msg.get("gameState", msg))
                    current = gs.get("currentSeat", gs.get("currentPlayer", -1))
                    if current == my_seat and turn_count == 0:
                        turn_count += 1
                        stats["turns"] = turn_count
                        draw_msg = {"type": "DRAW_TILE", "payload": {}, "seq": turn_count}
                        await ws.send(json.dumps(draw_msg))
                        print(f"  T{turn_count:02d} seat={my_seat}: DRAW_TILE (from GAME_STATE)")

                elif mtype == "TURN_START":
                    payload = msg.get("payload", {})
                    current = payload.get("seat", -1)
                    turn_count += 1
                    stats["turns"] = turn_count

                    if turn_count > MAX_TURNS:
                        print(f"  Reached MAX_TURNS={MAX_TURNS}, stopping")
                        break

                    if current == my_seat:
                        # 항상 DRAW_TILE (auto-draw 전략)
                        draw_msg = {"type": "DRAW_TILE", "payload": {}, "seq": turn_count}
                        await ws.send(json.dumps(draw_msg))
                        print(f"  T{turn_count:02d} seat={my_seat}: DRAW_TILE")
                    else:
                        print(f"  T{turn_count:02d} AI thinking...")

                elif mtype == "GAME_OVER":
                    stats["result"] = "GAME_OVER"
                    stats["game_over"] = True
                    print(f"  GAME_OVER received: {json.dumps(msg)[:200]}")
                    break

                elif mtype == "ERROR":
                    print(f"  ERROR: {msg}")

    except Exception as e:
        print(f"  WS exception: {e}")
        stats["result"] = f"ERROR: {e}"

    return stats

async def main():
    host_uuid = str(uuid.uuid4())
    print(f"\n{'='*60}")
    print(f"  PR #42 Phase 1 Rooms Dual-Write Smoke Test")
    print(f"  host_uuid={host_uuid}")
    print(f"{'='*60}\n")

    # 1) dev-login with UUID
    print("[1] dev-login with UUID userId...")
    token = dev_login_uuid(host_uuid, "SmokeHost-Phase1")
    print(f"  token obtained: {token[:30]}...")

    # 2) create room
    room_name = f"smoke-phase1-{int(time.time())}"
    print(f"[2] creating room '{room_name}'...")
    room_id = create_room(token, room_name)
    print(f"  room_id={room_id}")

    if not room_id:
        print("FATAL: room_id is empty")
        sys.exit(1)

    # 3) start game
    print("[3] starting game...")
    start_game(token, room_id)
    print("  game started")

    # 4) run WS auto-draw
    print(f"[4] running WS auto-draw (max {MAX_TURNS} turns, timeout {WS_TIMEOUT}s)...")
    t0 = time.time()
    stats = await run_ws_autodraw(token, room_id)
    elapsed = time.time() - t0
    print(f"  result={stats['result']} turns={stats['turns']} elapsed={elapsed:.1f}s")

    print(f"\n{'='*60}")
    print(f"  room_id : {room_id}")
    print(f"  host_id : {host_uuid}")
    print(f"  result  : {stats['result']}")
    print(f"  turns   : {stats['turns']}")
    print(f"  elapsed : {elapsed:.1f}s")
    print(f"{'='*60}")
    print(f"\nROOM_ID={room_id}")  # for shell capture

if __name__ == "__main__":
    asyncio.run(main())
