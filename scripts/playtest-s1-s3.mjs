#!/usr/bin/env node
/**
 * Human+AI Playtest Script (S1 + S3)
 *
 * S1: Human(1) vs AI(1) -- Basic game flow verification
 *   - Human draws every turn (auto-draw strategy)
 *   - AI (Ollama qwen2.5:3b) plays automatically
 *   - Verify: game lifecycle, turn alternation, tile counts
 *
 * S3: INVALID_MOVE + Rack Restoration Verification
 *   - After S1, create new game
 *   - Submit invalid placement, verify INVALID_MOVE response
 *   - Verify rack is restored to pre-move state
 */

import WebSocket from 'ws';

const BASE_URL = 'http://localhost:30080';
const WS_URL = 'ws://localhost:30080/ws';
const MAX_TURNS = 20;          // Run up to 20 turns for S1
const AI_TIMEOUT_MS = 90000;   // 90s max wait for AI turn
const SCENARIO_TIMEOUT_MS = 600000; // 10 min total

// ============================================================
// HTTP Helpers
// ============================================================

async function httpPost(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const resp = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${JSON.stringify(data)}`);
  return data;
}

async function httpGet(path, token) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const resp = await fetch(`${BASE_URL}${path}`, { headers });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${JSON.stringify(data)}`);
  return data;
}

// ============================================================
// WebSocket Client
// ============================================================

class PlaytestWSClient {
  constructor(roomId, token) {
    this.roomId = roomId;
    this.token = token;
    this.ws = null;
    this.messages = [];
    this.pendingResolvers = [];
    this.connected = false;
    this.authenticated = false;
    this.seat = -1;
    this.gameId = '';
    this.myRack = [];
    this.drawPileCount = 0;
    this.currentSeat = -1;
    this.turnNumber = 0;
    this.tableGroups = [];
    this.gameOver = false;
    this.gameOverPayload = null;
    this.players = [];
    this.turnLog = [];
  }

  connect() {
    return new Promise((resolve, reject) => {
      const url = `${WS_URL}?roomId=${this.roomId}`;
      this.ws = new WebSocket(url);

      this.ws.on('open', () => {
        this.connected = true;
        // Send AUTH message immediately
        this.send({
          type: 'AUTH',
          payload: { token: this.token },
          seq: 1,
          timestamp: new Date().toISOString(),
        });
      });

      this.ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        this.messages.push(msg);
        this.processMessage(msg);

        // Resolve any pending waiters
        const resolvers = [...this.pendingResolvers];
        this.pendingResolvers = [];
        resolvers.forEach(r => r(msg));
      });

      this.ws.on('error', (err) => {
        reject(err);
      });

      this.ws.on('close', (code, reason) => {
        this.connected = false;
      });

      // Wait for AUTH_OK
      this.waitForMessage('AUTH_OK', 5000)
        .then((msg) => {
          this.authenticated = true;
          this.seat = msg.payload.seat;
          resolve(msg);
        })
        .catch(reject);
    });
  }

  processMessage(msg) {
    switch (msg.type) {
      case 'AUTH_OK':
        this.seat = msg.payload.seat;
        break;
      case 'GAME_STATE':
        this.gameId = msg.payload.gameId;
        this.myRack = msg.payload.myRack || [];
        this.drawPileCount = msg.payload.drawPileCount;
        this.currentSeat = msg.payload.currentSeat;
        this.players = msg.payload.players || [];
        this.tableGroups = msg.payload.tableGroups || [];
        break;
      case 'TURN_START':
        this.currentSeat = msg.payload.seat;
        this.turnNumber = msg.payload.turnNumber;
        break;
      case 'TURN_END':
        this.currentSeat = msg.payload.nextSeat;
        this.drawPileCount = msg.payload.drawPileCount;
        if (msg.payload.myRack) this.myRack = msg.payload.myRack;
        this.turnLog.push({
          turn: msg.payload.turnNumber,
          seat: msg.payload.seat,
          action: msg.payload.action,
          tilesPlaced: msg.payload.tilesPlacedCount,
          playerTileCount: msg.payload.playerTileCount,
          drawPileCount: msg.payload.drawPileCount,
          isFallback: msg.payload.isFallbackDraw || false,
          fallbackReason: msg.payload.fallbackReason || '',
        });
        break;
      case 'TILE_DRAWN':
        if (msg.payload.drawnTile) {
          this.myRack.push(msg.payload.drawnTile);
        }
        this.drawPileCount = msg.payload.drawPileCount;
        break;
      case 'INVALID_MOVE':
        // Will be handled by waitForMessage
        break;
      case 'GAME_OVER':
        this.gameOver = true;
        this.gameOverPayload = msg.payload;
        break;
    }
  }

  send(msg) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }
    this.ws.send(JSON.stringify(msg));
  }

  waitForMessage(type, timeout = 30000) {
    return new Promise((resolve, reject) => {
      // Check if already received
      const existing = this.messages.find(m => m.type === type);
      if (existing) {
        this.messages = this.messages.filter(m => m !== existing);
        return resolve(existing);
      }

      const timer = setTimeout(() => {
        this.pendingResolvers = this.pendingResolvers.filter(r => r !== handler);
        reject(new Error(`Timeout waiting for ${type} after ${timeout}ms`));
      }, timeout);

      const handler = (msg) => {
        if (msg.type === type) {
          clearTimeout(timer);
          resolve(msg);
        } else {
          // Re-add handler
          this.pendingResolvers.push(handler);
        }
      };
      this.pendingResolvers.push(handler);
    });
  }

  waitForAnyMessage(types, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for any of [${types.join(',')}] after ${timeout}ms`));
      }, timeout);

      const handler = (msg) => {
        if (types.includes(msg.type)) {
          clearTimeout(timer);
          resolve(msg);
        } else {
          this.pendingResolvers.push(handler);
        }
      };
      this.pendingResolvers.push(handler);
    });
  }

  drawTile() {
    this.send({
      type: 'DRAW_TILE',
      payload: {},
      seq: Date.now(),
      timestamp: new Date().toISOString(),
    });
  }

  confirmTurn(tableGroups, tilesFromRack, jokerReturnedCodes) {
    this.send({
      type: 'CONFIRM_TURN',
      payload: {
        tableGroups,
        tilesFromRack,
        jokerReturnedCodes: jokerReturnedCodes || [],
      },
      seq: Date.now(),
      timestamp: new Date().toISOString(),
    });
  }

  placeTiles(tableGroups, tilesFromRack) {
    this.send({
      type: 'PLACE_TILES',
      payload: {
        tableGroups,
        tilesFromRack,
      },
      seq: Date.now(),
      timestamp: new Date().toISOString(),
    });
  }

  resetTurn() {
    this.send({
      type: 'RESET_TURN',
      payload: {},
      seq: Date.now(),
      timestamp: new Date().toISOString(),
    });
  }

  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

// ============================================================
// Test Results
// ============================================================

const results = {
  s1: {
    status: 'NOT_RUN',
    checks: {},
    turnLog: [],
    errors: [],
    summary: '',
  },
  s3: {
    status: 'NOT_RUN',
    checks: {},
    errors: [],
    summary: '',
  },
};

function log(msg) {
  const ts = new Date().toISOString().substr(11, 12);
  console.log(`[${ts}] ${msg}`);
}

// ============================================================
// S1: Human(1) vs AI(1) Basic Game
// ============================================================

async function runS1(token) {
  log('======================================');
  log('S1: Human(1) vs AI(1) Basic Game');
  log('======================================');

  try {
    // 1. Create room
    log('Creating room (Human vs Ollama)...');
    const room = await httpPost('/api/rooms', {
      name: 'Playtest S1 - WS',
      playerCount: 2,
      turnTimeoutSec: 60,
      displayName: 'Playtest Human',
      aiPlayers: [{
        type: 'AI_OLLAMA',
        persona: 'calculator',
        difficulty: 'intermediate',
        psychologyLevel: 0,
      }],
    }, token);

    const roomId = room.id;
    log(`Room created: ${roomId} (code: ${room.roomCode})`);
    results.s1.checks['room_created'] = true;

    // Verify room state
    results.s1.checks['player_count_2'] = room.playerCount === 2;
    results.s1.checks['host_is_human'] = room.players[0].type === 'HUMAN';
    results.s1.checks['seat1_is_ai'] = room.players[1].type === 'AI_OLLAMA';
    log(`Players: ${room.players.map(p => `${p.displayName} (${p.type})`).join(', ')}`);

    // 2. Start game
    log('Starting game...');
    const gameStart = await httpPost(`/api/rooms/${roomId}/start`, {}, token);
    const gameId = gameStart.gameId;
    log(`Game started: ${gameId}`);
    results.s1.checks['game_started'] = gameStart.status === 'PLAYING';

    // 3. Connect WebSocket
    log('Connecting WebSocket...');
    const client = new PlaytestWSClient(roomId, token);
    await client.connect();
    log(`WebSocket connected. Seat: ${client.seat}`);
    results.s1.checks['ws_connected'] = true;

    // 4. Wait for GAME_STATE
    const gameState = await client.waitForMessage('GAME_STATE', 5000);
    log(`GAME_STATE received: rack=${gameState.payload.myRack.length} tiles, drawPile=${gameState.payload.drawPileCount}`);
    results.s1.checks['initial_rack_14'] = gameState.payload.myRack.length === 14;
    results.s1.checks['drawPile_78'] = gameState.payload.drawPileCount === 78;
    results.s1.checks['table_empty'] = (gameState.payload.tableGroups || []).length === 0;

    // 5. First turn: derive from GAME_STATE (server does not send TURN_START
    //    for the initial turn).
    try {
      const firstTurn = await client.waitForMessage('TURN_START', 3000);
      log(`First TURN_START: seat=${firstTurn.payload.seat}, turn=${firstTurn.payload.turnNumber}`);
    } catch (_) {
      client.currentSeat = gameState.payload.currentSeat;
      client.turnNumber = 1;
      log(`First turn (from GAME_STATE): seat=${client.currentSeat}, turn=1`);
    }
    results.s1.checks['first_turn_received'] = true;

    // 6. Game loop: Human draws, AI plays
    let turnCount = 0;
    let aiPlaceCount = 0;
    let humanDrawCount = 0;
    let aiFallbackCount = 0;

    while (turnCount < MAX_TURNS && !client.gameOver) {
      if (client.currentSeat === client.seat) {
        // Human's turn - always draw
        log(`Turn ${client.turnNumber}: Human draws (rack: ${client.myRack.length})`);
        client.drawTile();
        humanDrawCount++;

        // Wait for TILE_DRAWN + TURN_END
        try {
          await client.waitForMessage('TILE_DRAWN', 10000);
        } catch (e) {
          log(`  Warning: TILE_DRAWN wait failed: ${e.message}`);
        }

        if (client.gameOver) break;

        // Wait for TURN_END (my turn end)
        try {
          await client.waitForMessage('TURN_END', 10000);
        } catch (e) {
          log(`  Warning: TURN_END wait failed: ${e.message}`);
        }

        if (client.gameOver) break;

        // Wait for TURN_START (AI's turn)
        try {
          await client.waitForMessage('TURN_START', 10000);
        } catch (e) {
          if (!client.gameOver) {
            log(`  Warning: TURN_START wait failed: ${e.message}`);
          }
        }
        turnCount++;
      } else {
        // AI's turn - wait for it to complete
        log(`Turn ${client.turnNumber}: AI thinking... (waiting up to ${AI_TIMEOUT_MS/1000}s)`);

        try {
          // Wait for TURN_END from AI
          const aiTurnEnd = await client.waitForMessage('TURN_END', AI_TIMEOUT_MS);
          const action = aiTurnEnd.payload.action;
          const tilesPlaced = aiTurnEnd.payload.tilesPlacedCount;
          const isFallback = aiTurnEnd.payload.isFallbackDraw || false;
          const fallbackReason = aiTurnEnd.payload.fallbackReason || '';

          if (action === 'PLACE_TILES' && tilesPlaced > 0) {
            aiPlaceCount++;
          }
          if (isFallback) {
            aiFallbackCount++;
          }

          log(`  AI action: ${action}, tiles placed: ${tilesPlaced}, fallback: ${isFallback}${fallbackReason ? ` (${fallbackReason})` : ''}`);
        } catch (e) {
          log(`  AI turn timeout: ${e.message}`);
          results.s1.errors.push(`AI turn ${client.turnNumber} timeout`);
          break;
        }

        if (client.gameOver) break;

        // Wait for TURN_START (Human's turn again)
        try {
          await client.waitForMessage('TURN_START', 10000);
        } catch (e) {
          if (!client.gameOver) {
            log(`  Warning: TURN_START wait failed: ${e.message}`);
          }
        }
        turnCount++;
      }
    }

    // 7. Collect results
    log('--------------------------------------');
    log(`S1 RESULTS:`);
    log(`  Total turns played: ${turnCount}`);
    log(`  Human draws: ${humanDrawCount}`);
    log(`  AI place actions: ${aiPlaceCount}`);
    log(`  AI fallbacks: ${aiFallbackCount}`);
    log(`  Game over: ${client.gameOver}`);

    if (client.gameOver && client.gameOverPayload) {
      const go = client.gameOverPayload;
      log(`  End type: ${go.endType}`);
      log(`  Winner seat: ${go.winnerSeat}`);
      for (const r of go.results) {
        log(`    Seat ${r.seat} (${r.playerType}): ${r.remainingTiles.length} tiles remaining${r.isWinner ? ' [WINNER]' : ''}`);
      }
    }

    results.s1.checks['turns_played'] = turnCount > 0;
    results.s1.checks['ai_responded'] = turnCount > 1; // At least one AI turn completed
    results.s1.checks['no_crash'] = true;
    results.s1.turnLog = client.turnLog;
    results.s1.status = 'PASS';

    results.s1.summary = `${turnCount} turns, ${humanDrawCount} human draws, ${aiPlaceCount} AI places, ${aiFallbackCount} fallbacks, gameOver=${client.gameOver}`;

    client.close();
    log('S1 completed.');

    return { roomId, gameId, token };
  } catch (e) {
    log(`S1 FAILED: ${e.message}`);
    results.s1.status = 'FAIL';
    results.s1.errors.push(e.message);
    return null;
  }
}

// ============================================================
// S3: INVALID_MOVE + Rack Restoration
// ============================================================

async function runS3(token) {
  log('');
  log('======================================');
  log('S3: INVALID_MOVE + Rack Restoration');
  log('======================================');

  try {
    // 1. Create new room
    log('Creating room for S3...');
    const room = await httpPost('/api/rooms', {
      name: 'Playtest S3 - Invalid Move',
      playerCount: 2,
      turnTimeoutSec: 60,
      displayName: 'Playtest Human S3',
      aiPlayers: [{
        type: 'AI_OLLAMA',
        persona: 'rookie',
        difficulty: 'beginner',
        psychologyLevel: 0,
      }],
    }, token);

    const roomId = room.id;
    log(`Room created: ${roomId}`);

    // 2. Start game
    log('Starting game...');
    const gameStart = await httpPost(`/api/rooms/${roomId}/start`, {}, token);
    const gameId = gameStart.gameId;
    log(`Game started: ${gameId}`);

    // 3. Connect WebSocket
    log('Connecting WebSocket...');
    const client = new PlaytestWSClient(roomId, token);
    await client.connect();
    log(`WebSocket connected. Seat: ${client.seat}`);

    // Wait for GAME_STATE
    await client.waitForMessage('GAME_STATE', 5000);
    log(`Initial rack (${client.myRack.length} tiles): ${client.myRack.join(', ')}`);
    const initialRack = [...client.myRack];

    // First turn: derive from GAME_STATE (server does not send TURN_START
    // for the initial turn).
    try {
      await client.waitForMessage('TURN_START', 3000);
    } catch (_) {
      client.turnNumber = 1;
      log(`First turn (from GAME_STATE): seat=${client.currentSeat}, turn=1`);
    }

    // Ensure it's Human's turn
    if (client.currentSeat !== client.seat) {
      log('AI goes first -- waiting for AI turn to complete...');
      await client.waitForMessage('TURN_END', AI_TIMEOUT_MS);
      await client.waitForMessage('TURN_START', 10000);
    }

    // 4. Test: Submit INVALID placement
    //    Use a single tile (not a valid run or group of 3+)
    const rackBefore = [...client.myRack];
    log(`Rack before invalid move (${rackBefore.length} tiles): ${rackBefore.join(', ')}`);
    results.s3.checks['rack_before_recorded'] = true;

    // Try to confirm a turn with just 1 tile -- this should fail validation
    // (minimum valid set is 3 tiles)
    const singleTile = rackBefore[0];
    log(`Attempting invalid placement: single tile [${singleTile}] as a "set"...`);

    client.confirmTurn(
      [{ id: 'invalid-group-1', tiles: [singleTile] }],
      [singleTile],
      []
    );

    // 5. Wait for INVALID_MOVE response
    try {
      const invalidMsg = await client.waitForMessage('INVALID_MOVE', 10000);
      log(`INVALID_MOVE received!`);
      log(`  Errors: ${JSON.stringify(invalidMsg.payload.errors)}`);
      results.s3.checks['invalid_move_received'] = true;
      results.s3.checks['error_has_code'] = invalidMsg.payload.errors && invalidMsg.payload.errors.length > 0;
    } catch (e) {
      log(`  Did not receive INVALID_MOVE: ${e.message}`);
      results.s3.checks['invalid_move_received'] = false;
      results.s3.errors.push(`INVALID_MOVE not received: ${e.message}`);
    }

    // 6. Verify rack restoration -- get game state via REST API
    log('Checking rack restoration via REST API...');
    const stateAfter = await httpGet(`/api/games/${gameId}?seat=${client.seat}`, token);
    const rackAfter = stateAfter.myRack;
    log(`Rack after invalid move (${rackAfter.length} tiles): ${rackAfter.join(', ')}`);

    // Compare racks
    const rackMatch = rackBefore.length === rackAfter.length &&
      rackBefore.sort().join(',') === rackAfter.sort().join(',');
    results.s3.checks['rack_restored'] = rackMatch;
    results.s3.checks['rack_length_unchanged'] = rackBefore.length === rackAfter.length;

    if (rackMatch) {
      log('RACK RESTORED CORRECTLY -- tiles match before and after invalid move');
    } else {
      log(`RACK MISMATCH! Before: ${rackBefore.length} tiles, After: ${rackAfter.length} tiles`);
      log(`  Before: ${rackBefore.sort().join(', ')}`);
      log(`  After:  ${rackAfter.sort().join(', ')}`);
      results.s3.errors.push(`Rack mismatch: before=${rackBefore.length}, after=${rackAfter.length}`);
    }

    // 7. Verify table is still empty (invalid move should not affect table)
    const tableAfter = stateAfter.table || [];
    results.s3.checks['table_unchanged'] = tableAfter.length === 0;
    log(`Table after invalid move: ${tableAfter.length} groups (expected: 0)`);

    // 8. Verify still Human's turn (turn should not advance on invalid move)
    results.s3.checks['still_my_turn'] = stateAfter.currentSeat === client.seat;
    log(`Current seat after invalid: ${stateAfter.currentSeat} (expected: ${client.seat})`);

    // 9. Now do a valid DRAW to ensure the game continues normally after invalid move
    log('Drawing tile to verify game continues normally after invalid move...');
    client.drawTile();

    try {
      const drawnMsg = await client.waitForMessage('TILE_DRAWN', 10000);
      log(`Tile drawn successfully: ${drawnMsg.payload.drawnTile}`);
      results.s3.checks['draw_after_invalid_works'] = true;
    } catch (e) {
      log(`Draw after invalid failed: ${e.message}`);
      results.s3.checks['draw_after_invalid_works'] = false;
      results.s3.errors.push(`Draw after invalid failed: ${e.message}`);
    }

    // 10. Test: Submit invalid move with tiles that don't form valid groups (2 tiles)
    // Wait for AI turn + come back to human
    if (!client.gameOver) {
      try {
        await client.waitForMessage('TURN_END', 10000);
        if (!client.gameOver) {
          // AI turn
          await client.waitForMessage('TURN_START', 10000);
          log('Waiting for AI turn...');
          await client.waitForMessage('TURN_END', AI_TIMEOUT_MS);
          if (!client.gameOver) {
            await client.waitForMessage('TURN_START', 10000);
          }
        }
      } catch (e) {
        log(`  Turn cycle warning: ${e.message}`);
      }
    }

    if (!client.gameOver && client.currentSeat === client.seat) {
      // Test: PLACE_TILES with tiles not from rack
      log('Testing CONFIRM_TURN with tiles not in rack (should fail)...');
      client.confirmTurn(
        [{ id: 'fake-group', tiles: ['R99a', 'B99a', 'K99a'] }],
        ['R99a', 'B99a', 'K99a'],
        []
      );

      try {
        const invalidMsg2 = await client.waitForAnyMessage(['INVALID_MOVE', 'ERROR'], 10000);
        log(`Response to fake tiles: type=${invalidMsg2.type}`);
        if (invalidMsg2.payload.errors) {
          log(`  Errors: ${JSON.stringify(invalidMsg2.payload.errors)}`);
        }
        if (invalidMsg2.payload.message) {
          log(`  Message: ${invalidMsg2.payload.message}`);
        }
        results.s3.checks['fake_tiles_rejected'] = true;
      } catch (e) {
        log(`  No response to fake tiles: ${e.message}`);
        results.s3.checks['fake_tiles_rejected'] = false;
      }
    }

    // Overall S3 result
    const criticalChecks = [
      results.s3.checks['invalid_move_received'],
      results.s3.checks['rack_restored'],
      results.s3.checks['still_my_turn'],
      results.s3.checks['draw_after_invalid_works'],
    ];
    results.s3.status = criticalChecks.every(Boolean) ? 'PASS' : 'FAIL';
    results.s3.summary = `INVALID_MOVE=${results.s3.checks['invalid_move_received']}, rack_restored=${results.s3.checks['rack_restored']}, still_my_turn=${results.s3.checks['still_my_turn']}, draw_after_invalid=${results.s3.checks['draw_after_invalid_works']}`;

    client.close();
    log('S3 completed.');
  } catch (e) {
    log(`S3 FAILED: ${e.message}`);
    results.s3.status = 'FAIL';
    results.s3.errors.push(e.message);
  }
}

// ============================================================
// Main
// ============================================================

async function main() {
  const startTime = Date.now();
  log('========================================');
  log('Human+AI Playtest: S1 + S3');
  log(`Date: ${new Date().toISOString()}`);
  log('========================================');
  log('');

  // Step 1: Dev Login
  log('Step 1: Dev Login...');
  const loginResp = await httpPost('/api/auth/dev-login', {
    userId: 'playtest-human-ws',
    displayName: 'Playtest Human WS',
  });
  const token = loginResp.token;
  log(`Token acquired for user: ${loginResp.userId}`);
  log('');

  // Step 2: Run S1
  await runS1(token);

  // Step 3: Run S3
  await runS3(token);

  // Step 4: Final Report
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log('');
  log('========================================');
  log('FINAL REPORT');
  log('========================================');
  log(`Elapsed: ${elapsed}s`);
  log('');

  for (const [key, val] of Object.entries(results)) {
    log(`--- ${key.toUpperCase()} ---`);
    log(`  Status: ${val.status}`);
    log(`  Summary: ${val.summary || 'N/A'}`);
    log('  Checks:');
    for (const [ck, cv] of Object.entries(val.checks)) {
      log(`    ${cv ? 'PASS' : 'FAIL'}: ${ck}`);
    }
    if (val.errors.length > 0) {
      log('  Errors:');
      val.errors.forEach(e => log(`    - ${e}`));
    }
    if (val.turnLog && val.turnLog.length > 0) {
      log(`  Turn Log (${val.turnLog.length} entries):`);
      val.turnLog.forEach(t => {
        log(`    Turn ${t.turn}: seat=${t.seat} action=${t.action} placed=${t.tilesPlaced} tiles=${t.playerTileCount} pile=${t.drawPileCount}${t.isFallback ? ` FALLBACK(${t.fallbackReason})` : ''}`);
      });
    }
  }

  // Output JSON for programmatic parsing
  const jsonReport = JSON.stringify(results, null, 2);
  log('');
  log('--- JSON Report ---');
  console.log(jsonReport);

  // Exit with appropriate code
  const allPassed = Object.values(results).every(v => v.status === 'PASS');
  process.exit(allPassed ? 0 : 1);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(2);
});
