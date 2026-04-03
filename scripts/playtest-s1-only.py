#!/usr/bin/env python3
"""
S1 playtest only -- Human(1) vs AI(1) via full WebSocket.
Uses unique timestamp-based user ID to avoid "already in room" conflict.
"""

import asyncio
import json
import time
import sys
import traceback
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

BASE_URL = "http://localhost:30080"
WS_URL = "ws://localhost:30080/ws"
WS_ORIGIN = "http://localhost:30000"
TS = str(int(time.time()))  # unique per run

def api_call(method, path, token=None, body=None):
    url = f"{BASE_URL}{path}"
    data = json.dumps(body).encode("utf-8") if body else None
    req = Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except HTTPError as e:
        raw = e.read().decode("utf-8")
        print(f"  [HTTP {e.code}] {path}: {raw[:300]}")
        try:
            return {"_error": e.code, **json.loads(raw)}
        except Exception:
            return {"_error": e.code, "_body": raw}
    except URLError as e:
        return {"_error": str(e.reason)}


class WSGameClient:
    def __init__(self):
        self.ws = None
        self.events = []
        self.seq = 0
        self.my_seat = -1
        self.my_rack = []
        self.draw_pile = 0
        self.current_seat = -1
        self.game_over_info = None
        self._recv_task = None

    async def connect(self, room_id, token):
        import websockets
        uri = f"{WS_URL}?roomId={room_id}"
        self.ws = await websockets.connect(
            uri, ping_interval=20, ping_timeout=10, close_timeout=5, max_size=2**20,
            additional_headers={"Origin": WS_ORIGIN}
        )
        self.seq += 1
        await self.ws.send(json.dumps({
            "type": "AUTH", "payload": {"token": token},
            "seq": self.seq, "timestamp": self._ts()
        }))
        self._recv_task = asyncio.create_task(self._recv_loop())
        # Wait for GAME_STATE
        for _ in range(50):
            await asyncio.sleep(0.2)
            if any(e.get("type") == "GAME_STATE" for e in self.events):
                break

    async def disconnect(self):
        if self._recv_task and not self._recv_task.done():
            self._recv_task.cancel()
            try: await self._recv_task
            except asyncio.CancelledError: pass
        if self.ws:
            await self.ws.close()

    async def send_draw(self):
        self.seq += 1
        await self.ws.send(json.dumps({"type": "DRAW_TILE", "payload": {}, "seq": self.seq, "timestamp": self._ts()}))

    async def wait_for_my_turn(self, timeout=120):
        deadline = time.time() + timeout
        while time.time() < deadline:
            if self.game_over_info:
                return "GAME_OVER"
            if self.current_seat == self.my_seat:
                return "MY_TURN"
            await asyncio.sleep(0.5)
        return "TIMEOUT"

    async def _recv_loop(self):
        try:
            while True:
                raw = await self.ws.recv()
                msg = json.loads(raw)
                self.events.append(msg)
                self._proc(msg)
        except Exception:
            pass

    def _proc(self, msg):
        t = msg.get("type", "")
        p = msg.get("payload", {})
        if t == "AUTH_OK":
            self.my_seat = p.get("seat", -1)
            print(f"  [WS] AUTH_OK: seat={self.my_seat}")
        elif t == "GAME_STATE":
            self.my_rack = p.get("myRack", [])
            self.draw_pile = p.get("drawPileCount", 0)
            self.current_seat = p.get("currentSeat", -1)
            print(f"  [WS] GAME_STATE: rack={len(self.my_rack)} dp={self.draw_pile} seat={self.current_seat}")
        elif t == "TURN_START":
            self.current_seat = p.get("seat", -1)
            print(f"  [WS] TURN_START: seat={self.current_seat} turn={p.get('turnNumber')} {p.get('playerType')} ({p.get('displayName','')})")
        elif t == "TURN_END":
            seat = p.get("seat", -1)
            my_rack = p.get("myRack")
            if my_rack is not None:
                self.my_rack = my_rack
            self.draw_pile = p.get("drawPileCount", 0)
            fb = f" FALLBACK={p.get('fallbackReason')}" if p.get("isFallbackDraw") else ""
            print(f"  [WS] TURN_END: seat={seat} action={p.get('action')} tiles={p.get('playerTileCount')} dp={self.draw_pile} next={p.get('nextSeat')}{fb}")
        elif t == "TILE_DRAWN":
            tile = p.get("drawnTile", "(hidden)")
            self.draw_pile = p.get("drawPileCount", 0)
            if tile and p.get("seat") == self.my_seat:
                print(f"  [WS] TILE_DRAWN: {tile} dp={self.draw_pile}")
        elif t == "GAME_OVER":
            self.game_over_info = p
            print(f"  [WS] GAME_OVER: {p.get('endType')} winner={p.get('winnerSeat')}")
            for r in p.get("results", []):
                print(f"    seat={r.get('seat')}: {r.get('playerType')} remaining={len(r.get('remainingTiles',[]))} winner={r.get('isWinner')}")
        elif t == "ERROR":
            print(f"  [WS] ERROR: {p.get('code')} - {p.get('message')}")
        elif t == "DRAW_PILE_EMPTY":
            print(f"  [WS] DRAW_PILE_EMPTY")
        elif t == "TILE_PLACED":
            print(f"  [WS] TILE_PLACED: seat={p.get('seat')} fromRack={p.get('tilesFromRackCount')}")
        elif t in ("PONG", "PLAYER_JOIN", "PLAYER_RECONNECT"):
            pass
        elif t == "INVALID_MOVE":
            for e in p.get("errors", []):
                print(f"  [WS] INVALID_MOVE: {e.get('code')} - {e.get('message')}")

    def _ts(self):
        return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


async def main():
    print("S1: Human(1) vs AI(1) Playtest")
    print(f"Started: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"User suffix: {TS}\n")

    checks = {}

    # Health
    h = api_call("GET", "/health")
    if h.get("status") != "ok":
        print(f"Not healthy"); sys.exit(1)

    # Login
    print("[1] Login...")
    token_resp = api_call("POST", "/api/auth/dev-login", body={
        "userId": f"s1-{TS}", "displayName": "S1 Human"
    })
    token = token_resp.get("token")
    if not token:
        print(f"Login failed: {token_resp}"); sys.exit(1)
    checks["login"] = "PASS"

    # Room
    print("[2] Create Room...")
    room = api_call("POST", "/api/rooms", token=token, body={
        "name": f"S1-{TS}", "playerCount": 2, "turnTimeoutSec": 60,
        "displayName": "S1 Human",
        "aiPlayers": [{"type": "AI_OLLAMA", "persona": "calculator", "difficulty": "intermediate", "psychologyLevel": 0}]
    })
    room_id = room.get("id")
    if not room_id:
        print(f"Room failed: {room}"); sys.exit(1)
    print(f"  Room: {room_id}")
    checks["room"] = "PASS"

    # Start
    print("[3] Start Game...")
    sr = api_call("POST", f"/api/rooms/{room_id}/start", token=token)
    game_id = sr.get("gameId")
    if not game_id:
        print(f"Start failed: {sr}"); sys.exit(1)
    print(f"  Game: {game_id}")
    checks["start"] = "PASS"

    # WS Connect
    print("[4] WebSocket Connect...")
    c = WSGameClient()
    await c.connect(room_id, token)
    checks["ws"] = "PASS" if c.my_seat >= 0 else "FAIL"
    checks["rack_14"] = "PASS" if len(c.my_rack) == 14 else f"FAIL ({len(c.my_rack)})"
    checks["dp_78"] = "PASS" if c.draw_pile == 78 else f"FAIL ({c.draw_pile})"
    print(f"  Rack: {c.my_rack}")

    # Play
    print("\n[5] Playing (Human=DRAW, max 10 turns, Ollama ~25-60s/turn)...")
    for turn in range(10):
        r = await c.wait_for_my_turn(timeout=120)
        if r == "GAME_OVER":
            print(f"  Game over at turn {turn}!"); break
        if r == "TIMEOUT":
            print(f"  Timeout at turn {turn}"); break
        print(f"\n  --- Human Turn {turn+1}: rack={len(c.my_rack)} dp={c.draw_pile} ---")
        await c.send_draw()
        # give time for draw + AI turn
        await asyncio.sleep(1)

    # Wait for final events
    await asyncio.sleep(5)

    # Analysis
    turn_ends = [e for e in c.events if e.get("type") == "TURN_END"]
    human_te = [e for e in turn_ends if e.get("payload", {}).get("seat") == 0]
    ai_te = [e for e in turn_ends if e.get("payload", {}).get("seat") == 1]
    ai_places = [e for e in ai_te if e.get("payload", {}).get("tilesPlacedCount", 0) > 0]
    ai_fallbacks = [e for e in ai_te if e.get("payload", {}).get("isFallbackDraw")]
    game_overs = [e for e in c.events if e.get("type") == "GAME_OVER"]

    # REST final
    final = api_call("GET", f"/api/games/{game_id}?seat=0", token=token)
    fs = final.get("status", "")
    fr = final.get("myRack", [])
    fd = final.get("drawPileCount", 0)
    ft = final.get("table", [])
    fp = final.get("players", [])

    checks["human_turns"] = f"PASS ({len(human_te)})" if len(human_te) > 0 else "FAIL"
    checks["ai_turns"] = f"PASS ({len(ai_te)})" if len(ai_te) > 0 else "FAIL"
    checks["alternation"] = "PASS" if len(human_te) > 0 and len(ai_te) > 0 else "FAIL"

    if len(ai_te) > 0:
        checks["ai_not_all_fallback"] = "PASS" if len(ai_fallbacks) < len(ai_te) else f"WARN ({len(ai_fallbacks)}/{len(ai_te)} fallback)"
    else:
        checks["ai_not_all_fallback"] = "SKIP"

    if game_overs or fs == "FINISHED":
        checks["game_complete"] = "PASS"
    else:
        checks["game_complete"] = f"INCOMPLETE ({fs}, {len(turn_ends)} turns)"

    # Timer check: TURN_END turnNumber should be > 0
    bad_turns = [e for e in turn_ends if e.get("payload", {}).get("turnNumber", 0) == 0]
    checks["turn_number_nonzero"] = "PASS" if len(bad_turns) == 0 else f"FAIL ({len(bad_turns)} turns with turnNumber=0)"

    # TURN_END should contain myRack for human
    human_te_with_rack = [e for e in human_te if e.get("payload", {}).get("myRack") is not None]
    checks["turn_end_has_myRack"] = "PASS" if len(human_te_with_rack) == len(human_te) else f"FAIL ({len(human_te_with_rack)}/{len(human_te)})"

    await c.disconnect()

    # Summary
    print("\n" + "=" * 70)
    print("S1 RESULTS")
    print("=" * 70)
    print(f"  Total TURN_END: {len(turn_ends)} (human={len(human_te)}, ai={len(ai_te)})")
    print(f"  AI places: {len(ai_places)}, AI fallbacks: {len(ai_fallbacks)}")
    print(f"  Game status: {fs}, rack={len(fr)}, dp={fd}, table={len(ft)}")
    for p in fp:
        print(f"    seat={p['seat']}: {p.get('playerType')} tiles={p.get('tileCount')} meld={p.get('hasInitialMeld')}")

    print(f"\n  Checks:")
    for k, v in checks.items():
        icon = "[OK]" if "PASS" in str(v) else "[!!]"
        print(f"    {icon} {k}: {v}")

    ok = sum(1 for v in checks.values() if "PASS" in str(v))
    print(f"\n  Result: {ok}/{len(checks)} PASS")
    print(f"  Done: {time.strftime('%Y-%m-%d %H:%M:%S')}")

    # Save
    out = "/mnt/d/Users/KTDS/Documents/06.과제/RummiArena/scripts/playtest-s1-results.json"
    with open(out, "w") as f:
        json.dump({"scenario": "S1", "checks": checks, "human_turns": len(human_te),
                    "ai_turns": len(ai_te), "ai_places": len(ai_places),
                    "ai_fallbacks": len(ai_fallbacks), "final_status": fs,
                    "status": "PASS" if ok == len(checks) else "PARTIAL"}, f, indent=2)
    print(f"  Results: {out}")

if __name__ == "__main__":
    asyncio.run(main())
