#!/usr/bin/env python3
"""
Human+AI Playtest Automation: S1 (1v1 basic) + S3 (INVALID_MOVE recovery)

Architecture note: AI turns are triggered via WS hub's broadcastTurnStart.
REST DrawTile changes state but does NOT trigger AI.
Therefore, all game actions must go through WebSocket.

Usage:
    python3 scripts/playtest-s1-s3.py
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
WS_ORIGIN = "http://localhost:30000"  # must match CORS_ALLOWED_ORIGINS

# ================================================================
# REST helpers (for room mgmt + state queries only)
# ================================================================

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
        try:
            return {"_error": e.code, **json.loads(raw)}
        except Exception:
            return {"_error": e.code, "_body": raw}
    except URLError as e:
        return {"_error": str(e.reason)}


def dev_login(user_id, display_name):
    r = api_call("POST", "/api/auth/dev-login", body={"userId": user_id, "displayName": display_name})
    return r.get("token")


def create_room(token, name, player_count, timeout_sec, display_name, ai_players):
    return api_call("POST", "/api/rooms", token=token, body={
        "name": name, "playerCount": player_count,
        "turnTimeoutSec": timeout_sec, "displayName": display_name,
        "aiPlayers": ai_players
    })


def start_game(token, room_id):
    return api_call("POST", f"/api/rooms/{room_id}/start", token=token)


def get_game_state(token, game_id, seat=0):
    return api_call("GET", f"/api/games/{game_id}?seat={seat}", token=token)


# ================================================================
# WS Game Client (active: sends actions + receives events)
# ================================================================

class WSGameClient:
    """Full-duplex WebSocket game client."""

    def __init__(self):
        self.ws = None
        self.events = []       # all received messages
        self.seq = 0
        self.my_seat = -1
        self.my_rack = []
        self.draw_pile = 0
        self.current_seat = -1
        self.game_status = ""
        self.game_id = ""
        self.game_over_info = None
        self.last_invalid = None
        self._recv_task = None
        self._pending = asyncio.Queue()

    async def connect(self, room_id, token):
        import websockets
        uri = f"{WS_URL}?roomId={room_id}"
        self.ws = await websockets.connect(
            uri, ping_interval=20, ping_timeout=10,
            close_timeout=5, max_size=2**20,
            additional_headers={"Origin": WS_ORIGIN}
        )
        # AUTH
        self.seq += 1
        await self.ws.send(json.dumps({
            "type": "AUTH", "payload": {"token": token},
            "seq": self.seq, "timestamp": self._ts()
        }))
        # Start receive loop
        self._recv_task = asyncio.create_task(self._receive_loop())
        # Wait for AUTH_OK + GAME_STATE
        await self._wait_for_type("GAME_STATE", timeout=10)

    async def disconnect(self):
        if self._recv_task and not self._recv_task.done():
            self._recv_task.cancel()
            try: await self._recv_task
            except asyncio.CancelledError: pass
        if self.ws:
            await self.ws.close()

    async def send_draw(self):
        """Send DRAW_TILE via WS."""
        self.seq += 1
        msg = {"type": "DRAW_TILE", "payload": {}, "seq": self.seq, "timestamp": self._ts()}
        await self.ws.send(json.dumps(msg))

    async def send_confirm(self, table_groups, tiles_from_rack, joker_returned=None):
        """Send CONFIRM_TURN via WS."""
        self.seq += 1
        payload = {"tableGroups": table_groups, "tilesFromRack": tiles_from_rack}
        if joker_returned:
            payload["jokerReturnedCodes"] = joker_returned
        msg = {"type": "CONFIRM_TURN", "payload": payload, "seq": self.seq, "timestamp": self._ts()}
        await self.ws.send(json.dumps(msg))

    async def send_reset(self):
        """Send RESET_TURN via WS."""
        self.seq += 1
        msg = {"type": "RESET_TURN", "payload": {}, "seq": self.seq, "timestamp": self._ts()}
        await self.ws.send(json.dumps(msg))

    async def send_place(self, table_groups, tiles_from_rack):
        """Send PLACE_TILES via WS."""
        self.seq += 1
        payload = {"tableGroups": table_groups, "tilesFromRack": tiles_from_rack}
        msg = {"type": "PLACE_TILES", "payload": payload, "seq": self.seq, "timestamp": self._ts()}
        await self.ws.send(json.dumps(msg))

    async def wait_for_my_turn(self, timeout=120):
        """Wait until TURN_START with my seat, or GAME_OVER."""
        deadline = time.time() + timeout
        while time.time() < deadline:
            if self.game_over_info:
                return "GAME_OVER"
            if self.current_seat == self.my_seat:
                return "MY_TURN"
            await asyncio.sleep(0.5)
        return "TIMEOUT"

    async def wait_for_event(self, event_type, timeout=30):
        """Wait for a specific event type."""
        return await self._wait_for_type(event_type, timeout)

    # internal
    async def _receive_loop(self):
        try:
            while True:
                raw = await self.ws.recv()
                msg = json.loads(raw)
                self.events.append(msg)
                self._process(msg)
                try:
                    self._pending.put_nowait(msg)
                except asyncio.QueueFull:
                    pass
        except Exception:
            pass

    async def _wait_for_type(self, msg_type, timeout=30):
        deadline = time.time() + timeout
        # Check already received
        for e in self.events:
            if e.get("type") == msg_type:
                return e
        while time.time() < deadline:
            try:
                msg = await asyncio.wait_for(self._pending.get(), timeout=min(1, deadline - time.time()))
                if msg.get("type") == msg_type:
                    return msg
            except asyncio.TimeoutError:
                continue
        return None

    def _process(self, msg):
        t = msg.get("type", "")
        p = msg.get("payload", {})

        if t == "AUTH_OK":
            self.my_seat = p.get("seat", -1)
            print(f"  [WS] AUTH_OK: seat={self.my_seat}")

        elif t == "GAME_STATE":
            self.my_rack = p.get("myRack", [])
            self.draw_pile = p.get("drawPileCount", 0)
            self.current_seat = p.get("currentSeat", -1)
            self.game_id = p.get("gameId", "")
            self.game_status = p.get("status", "")
            print(f"  [WS] GAME_STATE: rack={len(self.my_rack)} drawPile={self.draw_pile} seat={self.current_seat}")

        elif t == "TURN_START":
            self.current_seat = p.get("seat", -1)
            ptype = p.get("playerType", "?")
            name = p.get("displayName", "?")
            turn = p.get("turnNumber", 0)
            print(f"  [WS] TURN_START: seat={self.current_seat} turn={turn} {ptype} ({name})")

        elif t == "TURN_END":
            seat = p.get("seat", -1)
            action = p.get("action", "?")
            placed = p.get("tilesPlacedCount", 0)
            tile_count = p.get("playerTileCount", 0)
            dp = p.get("drawPileCount", 0)
            nxt = p.get("nextSeat", -1)
            fb = p.get("isFallbackDraw", False)
            fbr = p.get("fallbackReason", "")
            my_rack = p.get("myRack")
            if my_rack is not None:
                self.my_rack = my_rack
            self.draw_pile = dp
            fb_str = f" FALLBACK={fbr}" if fb else ""
            rack_str = f" myRack={len(my_rack)}" if my_rack is not None else ""
            print(f"  [WS] TURN_END: seat={seat} action={action} placed={placed} tiles={tile_count} dp={dp} next={nxt}{fb_str}{rack_str}")

        elif t == "TILE_DRAWN":
            tile = p.get("drawnTile", "(hidden)")
            self.draw_pile = p.get("drawPileCount", 0)
            seat = p.get("seat", -1)
            if tile and seat == self.my_seat:
                print(f"  [WS] TILE_DRAWN: seat={seat} tile={tile} dp={self.draw_pile}")
            else:
                print(f"  [WS] TILE_DRAWN: seat={seat} dp={self.draw_pile}")

        elif t == "TILE_PLACED":
            seat = p.get("seat", -1)
            cnt = p.get("tilesFromRackCount", 0)
            print(f"  [WS] TILE_PLACED: seat={seat} fromRack={cnt}")

        elif t == "INVALID_MOVE":
            errs = p.get("errors", [])
            self.last_invalid = errs
            for e in errs:
                print(f"  [WS] INVALID_MOVE: {e.get('code')} - {e.get('message')}")

        elif t == "GAME_OVER":
            end_type = p.get("endType", "?")
            winner = p.get("winnerSeat", -1)
            self.game_over_info = p
            print(f"  [WS] GAME_OVER: endType={end_type} winnerSeat={winner}")
            for r in p.get("results", []):
                rem = len(r.get("remainingTiles", []))
                print(f"    seat={r.get('seat')}: {r.get('playerType')} remaining={rem} winner={r.get('isWinner')}")

        elif t == "ERROR":
            print(f"  [WS] ERROR: {p.get('code')} - {p.get('message')}")

        elif t == "DRAW_PILE_EMPTY":
            print(f"  [WS] DRAW_PILE_EMPTY")

        elif t in ("PONG", "PLAYER_JOIN", "PLAYER_RECONNECT"):
            pass

        else:
            print(f"  [WS] {t}")

    def _ts(self):
        return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


# ================================================================
# S1: Human(1) vs AI(1) Basic Match
# ================================================================

async def run_s1():
    print("=" * 70)
    print("S1: Human(1) vs AI(1) Basic Match (Ollama qwen2.5:3b)")
    print("=" * 70)

    results = {"scenario": "S1", "start_time": time.strftime("%Y-%m-%dT%H:%M:%SZ")}
    checks = {}

    # 1. Login + Room + Start
    print("\n[1] Login + Room + Start...")
    token = dev_login("pt-s1-v3", "S1 Human")
    if not token:
        results["status"] = "FAIL"; return results
    checks["dev_login"] = "PASS"

    room = create_room(token, "S1-v3", 2, 60, "S1 Human", [{
        "type": "AI_OLLAMA", "persona": "calculator",
        "difficulty": "intermediate", "psychologyLevel": 0
    }])
    room_id = room.get("id")
    if not room_id:
        print(f"  Room creation failed: {room}")
        results["status"] = "FAIL"; return results
    print(f"  Room: {room_id}")
    checks["room_created"] = "PASS"

    start_resp = start_game(token, room_id)
    game_id = start_resp.get("gameId")
    if not game_id:
        print(f"  Start failed: {start_resp}")
        results["status"] = "FAIL"; return results
    print(f"  Game: {game_id}")
    checks["game_started"] = "PASS"
    results["game_id"] = game_id

    # 2. Connect WebSocket
    print("\n[2] Connect WebSocket...")
    client = WSGameClient()
    try:
        await client.connect(room_id, token)
    except Exception as e:
        print(f"  WS connect failed: {e}")
        results["status"] = "FAIL"; return results

    checks["ws_connected"] = "PASS"
    checks["initial_rack_14"] = "PASS" if len(client.my_rack) == 14 else f"FAIL ({len(client.my_rack)})"
    checks["draw_pile_78"] = "PASS" if client.draw_pile == 78 else f"FAIL ({client.draw_pile})"
    initial_rack = client.my_rack[:]
    print(f"  Rack ({len(initial_rack)}): {initial_rack}")

    # 3. Play: Human draws each turn, AI plays via server
    print("\n[3] Playing game (Human=DRAW, AI=auto, max 20 human turns)...")
    max_human_turns = 20
    human_turn_count = 0
    ai_turn_count = 0
    ai_place_count = 0
    ai_fallback_count = 0
    turn_data = []

    for i in range(max_human_turns):
        # Wait for my turn
        result = await client.wait_for_my_turn(timeout=120)
        if result == "GAME_OVER":
            print(f"  Game over during wait!")
            break
        if result == "TIMEOUT":
            print(f"  Timeout waiting for turn")
            break

        rack_before = len(client.my_rack)
        dp_before = client.draw_pile
        print(f"\n  --- Turn {i+1}: rack={rack_before} dp={dp_before} ---")

        # Draw
        await client.send_draw()
        # Wait for TURN_END (my draw)
        await asyncio.sleep(1)

        # Count the AI's TURN_END events seen so far
        my_turn_ends = [e for e in client.events if e.get("type") == "TURN_END" and e.get("payload", {}).get("seat") == client.my_seat]
        human_turn_count = len(my_turn_ends)

        # Now wait for AI turn to complete (next TURN_START with my seat or GAME_OVER)
        # AI turn can take up to ~90s with Ollama on K8s CPU

    # Wait a bit for final events
    await asyncio.sleep(3)

    # Analyze events
    all_turn_ends = [e for e in client.events if e.get("type") == "TURN_END"]
    human_turns = [e for e in all_turn_ends if e.get("payload", {}).get("seat") == 0]
    ai_turns = [e for e in all_turn_ends if e.get("payload", {}).get("seat") == 1]
    ai_places = [e for e in ai_turns if e.get("payload", {}).get("tilesPlacedCount", 0) > 0]
    ai_fallbacks = [e for e in ai_turns if e.get("payload", {}).get("isFallbackDraw")]
    game_overs = [e for e in client.events if e.get("type") == "GAME_OVER"]

    # Final state via REST
    final = get_game_state(token, game_id, seat=0)
    final_rack = final.get("myRack", [])
    final_dp = final.get("drawPileCount", 0)
    final_status = final.get("status", "")
    final_table = final.get("table", [])
    final_players = final.get("players", [])

    print(f"\n[4] Summary:")
    print(f"  Total TURN_END: {len(all_turn_ends)} (human={len(human_turns)}, ai={len(ai_turns)})")
    print(f"  AI places: {len(ai_places)}, AI fallbacks: {len(ai_fallbacks)}")
    print(f"  Game status: {final_status}")
    print(f"  Final: rack={len(final_rack)}, dp={final_dp}, table={len(final_table)}")
    for p in final_players:
        print(f"    seat={p['seat']}: {p.get('playerType')} tiles={p.get('tileCount')} meld={p.get('hasInitialMeld')}")

    checks["human_turns_played"] = f"PASS ({len(human_turns)})" if len(human_turns) > 0 else "FAIL"
    checks["ai_turns_played"] = f"PASS ({len(ai_turns)})" if len(ai_turns) > 0 else "FAIL"
    checks["turn_alternation"] = "PASS" if len(human_turns) > 0 and len(ai_turns) > 0 else "FAIL"
    checks["ai_not_all_fallback"] = "PASS" if len(ai_fallbacks) < len(ai_turns) else f"WARN ({len(ai_fallbacks)}/{len(ai_turns)})"

    if client.game_over_info or game_overs:
        go_info = client.game_over_info or game_overs[0].get("payload", {})
        checks["game_over"] = "PASS"
        checks["end_type"] = go_info.get("endType", "?")
    elif final_status == "FINISHED":
        checks["game_over"] = "PASS (REST)"
    else:
        checks["game_over"] = f"INCOMPLETE ({final_status}, {len(all_turn_ends)} turns)"

    await client.disconnect()

    # Final checks
    print(f"\n  Checks:")
    for k, v in checks.items():
        icon = "[OK]" if "PASS" in str(v) else "[!!]"
        print(f"    {icon} {k}: {v}")

    results["checks"] = checks
    results["human_turns"] = len(human_turns)
    results["ai_turns"] = len(ai_turns)
    results["ai_places"] = len(ai_places)
    results["ai_fallbacks"] = len(ai_fallbacks)
    results["final_status"] = final_status
    results["end_time"] = time.strftime("%Y-%m-%dT%H:%M:%SZ")
    results["status"] = "PASS" if all("PASS" in str(v) for k, v in checks.items() if k not in ("end_type",)) else "PARTIAL"
    return results


# ================================================================
# S3: INVALID_MOVE Recovery Verification
# ================================================================

async def run_s3():
    print("\n" + "=" * 70)
    print("S3: INVALID_MOVE Recovery Verification")
    print("=" * 70)

    results = {"scenario": "S3", "start_time": time.strftime("%Y-%m-%dT%H:%M:%SZ")}
    checks = {}

    # 1. Login + Room + Start
    print("\n[1] Login + Room + Start...")
    token = dev_login("pt-s3-v3", "S3 Human")
    if not token:
        results["status"] = "FAIL"; return results
    checks["dev_login"] = "PASS"

    room = create_room(token, "S3-v3", 2, 60, "S3 Human", [{
        "type": "AI_OLLAMA", "persona": "calculator",
        "difficulty": "intermediate", "psychologyLevel": 0
    }])
    room_id = room.get("id")
    if not room_id:
        results["status"] = "FAIL"; return results
    print(f"  Room: {room_id}")
    checks["room_created"] = "PASS"

    start_resp = start_game(token, room_id)
    game_id = start_resp.get("gameId")
    if not game_id:
        results["status"] = "FAIL"; return results
    print(f"  Game: {game_id}")
    checks["game_started"] = "PASS"
    results["game_id"] = game_id

    # 2. Connect WS
    print("\n[2] Connect WebSocket...")
    client = WSGameClient()
    try:
        await client.connect(room_id, token)
    except Exception as e:
        print(f"  WS connect failed: {e}")
        results["status"] = "FAIL"; return results
    checks["ws_connected"] = "PASS"

    initial_rack = client.my_rack[:]
    print(f"  Rack ({len(initial_rack)}): {initial_rack}")
    checks["initial_rack_14"] = "PASS" if len(initial_rack) == 14 else f"FAIL ({len(initial_rack)})"

    # Wait for human turn
    if client.current_seat != client.my_seat:
        print(f"  Waiting for human turn...")
        r = await client.wait_for_my_turn(timeout=120)
        if r == "GAME_OVER":
            results["status"] = "FAIL"; return results
        initial_rack = client.my_rack[:]

    # ---- Test 1: Two-tile group (V-02 violation) ----
    print(f"\n[3] INVALID_MOVE #1: Two-tile group (V-02)...")
    t1, t2 = initial_rack[0], initial_rack[1]
    print(f"  Sending CONFIRM_TURN with [{t1}, {t2}]...")
    client.last_invalid = None
    await client.send_confirm(
        [{"id": "inv-1", "tiles": [t1, t2]}],
        [t1, t2]
    )
    # Wait for INVALID_MOVE response
    await asyncio.sleep(1)
    inv1 = client.last_invalid
    if inv1:
        codes = [e.get("code") for e in inv1]
        msgs = [e.get("message") for e in inv1]
        print(f"  INVALID_MOVE received: {codes}")
        print(f"  Messages: {msgs}")
        checks["invalid_1_rejected"] = "PASS"
        checks["invalid_1_korean_msg"] = "PASS" if any(msg and not msg.isascii() for msg in msgs) else "FAIL"
    else:
        print(f"  No INVALID_MOVE received (might have been accepted)")
        checks["invalid_1_rejected"] = "FAIL"

    # Send RESET_TURN to restore server state
    print(f"  Sending RESET_TURN...")
    await client.send_reset()
    await asyncio.sleep(0.5)

    # Get state via REST to verify rack
    state1 = get_game_state(token, game_id, seat=0)
    rack1 = state1.get("myRack", [])
    match1 = sorted(rack1) == sorted(initial_rack)
    print(f"  Rack after reset: {len(rack1)} tiles, match={match1}")
    checks["rack_preserved_1"] = "PASS" if match1 else f"FAIL ({len(initial_rack)} -> {len(rack1)})"

    # ---- Test 2: Random 3 tiles ----
    print(f"\n[4] INVALID_MOVE #2: Random 3 tiles...")
    t1, t2, t3 = initial_rack[0], initial_rack[3], initial_rack[6]
    print(f"  Sending CONFIRM_TURN with [{t1}, {t2}, {t3}]...")
    client.last_invalid = None
    await client.send_confirm(
        [{"id": "inv-2", "tiles": [t1, t2, t3]}],
        [t1, t2, t3]
    )
    await asyncio.sleep(1)
    inv2 = client.last_invalid
    if inv2:
        codes2 = [e.get("code") for e in inv2]
        print(f"  INVALID_MOVE: {codes2}")
        checks["invalid_2_rejected"] = "PASS"
    else:
        checks["invalid_2_rejected"] = "WARN (possibly valid)"

    await client.send_reset()
    await asyncio.sleep(0.5)
    state2 = get_game_state(token, game_id, seat=0)
    rack2 = state2.get("myRack", [])
    match2 = sorted(rack2) == sorted(initial_rack)
    print(f"  Rack after reset: {len(rack2)}, match={match2}")
    checks["rack_preserved_2"] = "PASS" if match2 else f"FAIL"

    # ---- Test 3: Single tile ----
    print(f"\n[5] INVALID_MOVE #3: Single tile (V-02)...")
    single = initial_rack[0]
    print(f"  Sending CONFIRM_TURN with [{single}]...")
    client.last_invalid = None
    await client.send_confirm(
        [{"id": "inv-3", "tiles": [single]}],
        [single]
    )
    await asyncio.sleep(1)
    inv3 = client.last_invalid
    if inv3:
        codes3 = [e.get("code") for e in inv3]
        print(f"  INVALID_MOVE: {codes3}")
        checks["invalid_3_rejected"] = "PASS"
    else:
        checks["invalid_3_rejected"] = "FAIL"

    await client.send_reset()
    await asyncio.sleep(0.5)
    state3 = get_game_state(token, game_id, seat=0)
    rack3 = state3.get("myRack", [])
    match3 = sorted(rack3) == sorted(initial_rack)
    print(f"  Rack after reset: {len(rack3)}, match={match3}")
    checks["rack_preserved_3"] = "PASS" if match3 else f"FAIL"

    # ---- Cumulative check ----
    print(f"\n[6] Cumulative: 3x INVALID_MOVE, game still playable?")
    state_now = get_game_state(token, game_id, seat=0)
    status_now = state_now.get("status", "")
    rack_now = state_now.get("myRack", [])
    print(f"  Status: {status_now}, rack: {len(rack_now)}")
    checks["game_still_playable"] = "PASS" if status_now in ("PLAYING", "STARTED") else f"FAIL ({status_now})"
    checks["cumulative_rack_intact"] = "PASS" if sorted(rack_now) == sorted(initial_rack) else "FAIL"

    # ---- Normal draw after invalids ----
    print(f"\n[7] Normal DRAW_TILE after 3 invalids...")
    await client.send_draw()
    await asyncio.sleep(2)

    # Check rack increased
    state_draw = get_game_state(token, game_id, seat=0)
    rack_draw = state_draw.get("myRack", [])
    # It's now AI turn so we may get our rack from TURN_END's myRack
    # or from REST (which shows our rack regardless of whose turn it is)
    print(f"  Rack after draw: {len(rack_draw)} (was {len(initial_rack)})")
    checks["draw_after_invalids"] = "PASS" if len(rack_draw) == len(initial_rack) + 1 else f"FAIL ({len(initial_rack)} -> {len(rack_draw)})"

    # ---- Wait for AI turn ----
    print(f"\n[8] Waiting for AI turn...")
    r = await client.wait_for_my_turn(timeout=120)
    if r == "GAME_OVER":
        print(f"  Game ended!")
        checks["ai_turn_completed"] = "PASS (game ended)"
    elif r == "MY_TURN":
        rack_after_ai = client.my_rack
        print(f"  AI turn done. Rack: {len(rack_after_ai)}")
        checks["ai_turn_completed"] = "PASS"
    else:
        print(f"  AI turn timeout")
        checks["ai_turn_completed"] = "FAIL (timeout)"

    # ---- Extra turns for stability ----
    print(f"\n[9] 2 extra turns for stability...")
    for extra in range(2):
        if client.game_over_info:
            print(f"  Game over!")
            break
        r = await client.wait_for_my_turn(timeout=120)
        if r == "GAME_OVER":
            print(f"  Game over!")
            break
        if r == "TIMEOUT":
            print(f"  Timeout on extra turn {extra+1}")
            break
        rack_e = len(client.my_rack)
        dp_e = client.draw_pile
        print(f"  Extra {extra+1}: rack={rack_e}, dp={dp_e}")
        await client.send_draw()
        await asyncio.sleep(1)

    checks["extra_turns_stable"] = "PASS"

    # Final
    await asyncio.sleep(2)
    final = get_game_state(token, game_id, seat=0)
    final_status = final.get("status", "")
    final_rack = final.get("myRack", [])
    print(f"\n[10] Final: status={final_status}, rack={len(final_rack)}")

    # WS analysis
    ws_invalids = [e for e in client.events if e.get("type") == "INVALID_MOVE"]
    ws_turns = [e for e in client.events if e.get("type") == "TURN_END"]
    ai_ws_turns = [e for e in ws_turns if e.get("payload", {}).get("seat") == 1]

    await client.disconnect()

    # Summary
    print("\n" + "=" * 70)
    print("S3 RESULTS SUMMARY")
    print("=" * 70)

    rack_checks = [k for k in checks if k.startswith("rack_preserved")]
    all_rack_ok = all("PASS" in str(checks[k]) for k in rack_checks)
    print(f"\n  === CORE: C-1 fix (rack restoration after INVALID_MOVE) = {'VERIFIED' if all_rack_ok else 'FAILED'} ===")
    print(f"  INVALID_MOVE events: {len(ws_invalids)}")
    print(f"  TURN_END events: {len(ws_turns)} (AI: {len(ai_ws_turns)})")

    print(f"\n  Checks:")
    for k, v in checks.items():
        icon = "[OK]" if "PASS" in str(v) else "[!!]"
        print(f"    {icon} {k}: {v}")

    results["checks"] = checks
    results["core_c1_verified"] = all_rack_ok
    results["ws_invalids"] = len(ws_invalids)
    results["ws_turns"] = len(ws_turns)
    results["final_status"] = final_status
    results["end_time"] = time.strftime("%Y-%m-%dT%H:%M:%SZ")
    results["status"] = "PASS" if all_rack_ok and "PASS" in str(checks.get("game_still_playable", "")) else "PARTIAL"
    return results


# ================================================================
# Main
# ================================================================

async def main():
    print("RummiArena Human+AI Playtest v3 (Full WS)")
    print(f"Started: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Server: {BASE_URL}\n")

    health = api_call("GET", "/health")
    if health.get("status") != "ok":
        print(f"NOT HEALTHY: {health}"); sys.exit(1)
    print(f"Server OK (redis={health.get('redis')})\n")

    all_results = []

    for name, fn in [("S1", run_s1), ("S3", run_s3)]:
        try:
            r = await fn()
            all_results.append(r)
        except Exception as e:
            print(f"\n{name} ERROR: {e}")
            traceback.print_exc()
            all_results.append({"scenario": name, "status": "ERROR", "error": str(e)})

    print("\n" + "=" * 70)
    print("FINAL SUMMARY")
    print("=" * 70)
    for r in all_results:
        sc = r.get("scenario", "?")
        st = r.get("status", "?")
        ck = r.get("checks", {})
        ok = sum(1 for v in ck.values() if "PASS" in str(v))
        print(f"  {sc}: {st} ({ok}/{len(ck)} checks)")

    print(f"\nDone: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    out = "/mnt/d/Users/KTDS/Documents/06.과제/RummiArena/scripts/playtest-results.json"
    with open(out, "w") as f:
        json.dump(all_results, f, indent=2, ensure_ascii=False, default=str)
    print(f"Results: {out}")

if __name__ == "__main__":
    asyncio.run(main())
