#!/usr/bin/env node
/**
 * Playtest S2: 4-Player Battle (Human + 3 AI)
 *
 * 4인 게임에서 3종 AI 모델(OpenAI, Claude, DeepSeek)이 동시 대전하는 시나리오.
 * Human은 매 턴 드로우(auto-draw)하고, 3 AI의 턴 순환/응답/안정성을 검증한다.
 *
 * 검증 항목:
 *   - 4인 방 생성 및 참가 정상 동작
 *   - 턴 순서가 4인 순환(seat 0 -> 1 -> 2 -> 3 -> 0)으로 정확히 동작
 *   - 타일 분배가 4인에게 균등 (각 14장), drawPileCount = 50
 *   - 게임 종료 조건 정상 (0장 또는 최대 턴)
 *   - 모든 모델이 응답 (타임아웃 시 fallback draw)
 *
 * Usage:
 *   node scripts/playtest-s2.mjs
 *
 * Environment:
 *   BASE_URL (default: http://localhost:30080)
 *   MAX_TURNS (default: 40)
 */

import WebSocket from 'ws';

const BASE_URL = process.env.BASE_URL || 'http://localhost:30080';
const WS_URL = BASE_URL.replace('http', 'ws') + '/ws';
const MAX_TURNS = parseInt(process.env.MAX_TURNS || '40', 10);
const AI_TIMEOUT_MS = 180000;   // 180s max: DeepSeek can take 150s
const SCENARIO_TIMEOUT_MS = 1200000; // 20 min total for 4-player

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
        const resolvers = [...this.pendingResolvers];
        this.pendingResolvers = [];
        resolvers.forEach(r => r(msg));
      });

      this.ws.on('error', (err) => reject(err));
      this.ws.on('close', () => { this.connected = false; });

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

  close() {
    if (this.ws) this.ws.close();
  }
}

// ============================================================
// Test Results
// ============================================================

const results = {
  s2: {
    status: 'NOT_RUN',
    checks: {},
    turnLog: [],
    aiStats: {},
    errors: [],
    summary: '',
  },
};

function log(msg) {
  const ts = new Date().toISOString().substr(11, 12);
  console.log(`[${ts}] ${msg}`);
}

// ============================================================
// S2: 4-Player Battle
// ============================================================

async function runS2(token) {
  log('======================================');
  log('S2: Human(1) vs AI(3) -- 4-Player Battle');
  log('======================================');

  // AI model stats trackers
  const aiStats = {
    AI_OPENAI:   { turns: 0, places: 0, draws: 0, fallbacks: 0, timeouts: 0 },
    AI_CLAUDE:   { turns: 0, places: 0, draws: 0, fallbacks: 0, timeouts: 0 },
    AI_DEEPSEEK: { turns: 0, places: 0, draws: 0, fallbacks: 0, timeouts: 0 },
  };

  try {
    // 1. Create room with 4 players (Human + 3 AI)
    log('Creating 4-player room (Human + OpenAI + Claude + DeepSeek)...');
    const room = await httpPost('/api/rooms', {
      name: 'Playtest S2 - 4Player Battle',
      playerCount: 4,
      turnTimeoutSec: 120,
      displayName: 'Playtest Human S2',
      aiPlayers: [
        {
          type: 'AI_OPENAI',
          persona: 'shark',
          difficulty: 'expert',
          psychologyLevel: 1,
        },
        {
          type: 'AI_CLAUDE',
          persona: 'fox',
          difficulty: 'expert',
          psychologyLevel: 1,
        },
        {
          type: 'AI_DEEPSEEK',
          persona: 'calculator',
          difficulty: 'intermediate',
          psychologyLevel: 0,
        },
      ],
    }, token);

    const roomId = room.id;
    log(`Room created: ${roomId} (code: ${room.roomCode})`);
    results.s2.checks['room_created'] = true;

    // Verify room composition
    results.s2.checks['player_count_4'] = room.playerCount === 4;
    results.s2.checks['host_is_human'] = room.players[0].type === 'HUMAN';
    results.s2.checks['seat1_is_openai'] = room.players[1].type === 'AI_OPENAI';
    results.s2.checks['seat2_is_claude'] = room.players[2].type === 'AI_CLAUDE';
    results.s2.checks['seat3_is_deepseek'] = room.players[3].type === 'AI_DEEPSEEK';
    log(`Players: ${room.players.map(p => `Seat${p.seat} ${p.displayName} (${p.type})`).join(', ')}`);

    // 2. Start game
    log('Starting game...');
    const gameStart = await httpPost(`/api/rooms/${roomId}/start`, {}, token);
    const gameId = gameStart.gameId;
    log(`Game started: ${gameId}`);
    results.s2.checks['game_started'] = gameStart.status === 'PLAYING';

    // 3. Connect WebSocket
    log('Connecting WebSocket...');
    const client = new PlaytestWSClient(roomId, token);
    await client.connect();
    log(`WebSocket connected. Human seat: ${client.seat}`);
    results.s2.checks['ws_connected'] = true;

    // 4. Wait for GAME_STATE
    const gameState = await client.waitForMessage('GAME_STATE', 5000);
    log(`GAME_STATE: rack=${gameState.payload.myRack.length}, drawPile=${gameState.payload.drawPileCount}, players=${gameState.payload.players.length}`);

    // 4-player: 4 x 14 = 56 tiles dealt, 106 - 56 = 50 in draw pile
    results.s2.checks['initial_rack_14'] = gameState.payload.myRack.length === 14;
    results.s2.checks['drawPile_50'] = gameState.payload.drawPileCount === 50;
    results.s2.checks['four_players'] = gameState.payload.players.length === 4;
    results.s2.checks['table_empty'] = (gameState.payload.tableGroups || []).length === 0;

    // Verify all players have 14 tiles
    const allHave14 = gameState.payload.players.every(p => p.tileCount === 14);
    results.s2.checks['all_players_14_tiles'] = allHave14;
    log(`All players 14 tiles: ${allHave14}`);

    // 5. Map seats to AI types
    const seatToType = {};
    for (const p of gameState.payload.players) {
      seatToType[p.seat] = p.playerType;
    }
    log(`Seat mapping: ${JSON.stringify(seatToType)}`);

    // 6. First turn: derive from GAME_STATE (server does not send a separate
    //    TURN_START for the initial turn -- the frontend uses currentSeat from
    //    GAME_STATE). Try waiting briefly in case the server sends it, but fall
    //    back to GAME_STATE.currentSeat.
    try {
      const firstTurn = await client.waitForMessage('TURN_START', 3000);
      log(`First TURN_START: seat=${firstTurn.payload.seat}, turn=${firstTurn.payload.turnNumber}`);
    } catch (_) {
      // Expected: server sends GAME_STATE but not TURN_START for the initial turn
      client.currentSeat = gameState.payload.currentSeat;
      client.turnNumber = 1;
      log(`First turn (from GAME_STATE): seat=${client.currentSeat}, turn=1`);
    }
    results.s2.checks['first_turn_received'] = true;

    // 7. Game loop: Human draws, all 3 AIs play
    let turnCount = 0;
    let humanDrawCount = 0;
    let totalAIPlaces = 0;
    let totalAIFallbacks = 0;
    const turnOrder = []; // Track actual turn order for verification

    while (turnCount < MAX_TURNS && !client.gameOver) {
      if (client.currentSeat === client.seat) {
        // Human's turn -- always draw
        log(`Turn ${client.turnNumber}: Human draws (rack: ${client.myRack.length}, drawPile: ${client.drawPileCount})`);
        client.drawTile();
        humanDrawCount++;
        turnOrder.push(client.seat);

        try {
          await client.waitForMessage('TILE_DRAWN', 10000);
        } catch (e) {
          log(`  Warning: TILE_DRAWN wait: ${e.message}`);
        }

        if (client.gameOver) break;

        try {
          await client.waitForMessage('TURN_END', 10000);
        } catch (e) {
          log(`  Warning: TURN_END wait: ${e.message}`);
        }

        if (client.gameOver) break;

        // Wait for next TURN_START
        try {
          await client.waitForMessage('TURN_START', 15000);
        } catch (e) {
          if (!client.gameOver) log(`  Warning: TURN_START wait: ${e.message}`);
        }
        turnCount++;
      } else {
        // AI's turn
        const aiSeat = client.currentSeat;
        const aiType = seatToType[aiSeat] || 'UNKNOWN';
        log(`Turn ${client.turnNumber}: ${aiType} (seat ${aiSeat}) thinking...`);
        turnOrder.push(aiSeat);

        try {
          const turnEnd = await client.waitForMessage('TURN_END', AI_TIMEOUT_MS);
          const action = turnEnd.payload.action;
          const tilesPlaced = turnEnd.payload.tilesPlacedCount;
          const isFallback = turnEnd.payload.isFallbackDraw || false;
          const fallbackReason = turnEnd.payload.fallbackReason || '';

          // Track per-model stats
          if (aiStats[aiType]) {
            aiStats[aiType].turns++;
            if (action === 'PLACE_TILES' && tilesPlaced > 0) {
              aiStats[aiType].places++;
              totalAIPlaces++;
            } else {
              aiStats[aiType].draws++;
            }
            if (isFallback) {
              aiStats[aiType].fallbacks++;
              totalAIFallbacks++;
            }
          }

          log(`  ${aiType}: action=${action}, placed=${tilesPlaced}, fallback=${isFallback}${fallbackReason ? ` (${fallbackReason})` : ''}`);
        } catch (e) {
          log(`  ${aiType} (seat ${aiSeat}) TIMEOUT: ${e.message}`);
          if (aiStats[aiType]) aiStats[aiType].timeouts++;
          results.s2.errors.push(`${aiType} seat ${aiSeat} timeout at turn ${client.turnNumber}`);
          break;
        }

        if (client.gameOver) break;

        // Wait for next TURN_START
        try {
          await client.waitForMessage('TURN_START', 15000);
        } catch (e) {
          if (!client.gameOver) log(`  Warning: TURN_START wait: ${e.message}`);
        }
        turnCount++;
      }
    }

    // 8. Verify turn order is cyclic: 0 -> 1 -> 2 -> 3 -> 0 -> ...
    let turnOrderCorrect = true;
    for (let i = 1; i < turnOrder.length; i++) {
      const expected = (turnOrder[i - 1] + 1) % 4;
      if (turnOrder[i] !== expected) {
        // Allow game-over break to not match
        if (i < turnOrder.length - 1) {
          turnOrderCorrect = false;
          log(`Turn order violation at index ${i}: expected seat ${expected}, got ${turnOrder[i]}`);
        }
      }
    }
    results.s2.checks['turn_order_cyclic'] = turnOrderCorrect;

    // 9. Verify all 3 AI models responded at least once
    results.s2.checks['openai_responded'] = aiStats.AI_OPENAI.turns > 0;
    results.s2.checks['claude_responded'] = aiStats.AI_CLAUDE.turns > 0;
    results.s2.checks['deepseek_responded'] = aiStats.AI_DEEPSEEK.turns > 0;
    results.s2.checks['all_ai_responded'] = (
      aiStats.AI_OPENAI.turns > 0 &&
      aiStats.AI_CLAUDE.turns > 0 &&
      aiStats.AI_DEEPSEEK.turns > 0
    );

    // 10. Verify no AI had all timeouts
    results.s2.checks['no_total_timeout'] = (
      aiStats.AI_OPENAI.timeouts === 0 &&
      aiStats.AI_CLAUDE.timeouts === 0 &&
      aiStats.AI_DEEPSEEK.timeouts === 0
    );

    // 11. Check game over
    if (client.gameOver && client.gameOverPayload) {
      const go = client.gameOverPayload;
      log(`GAME OVER: endType=${go.endType}, winnerSeat=${go.winnerSeat}`);
      results.s2.checks['game_ended_cleanly'] = true;
      results.s2.checks['four_results'] = go.results.length === 4;
      for (const r of go.results) {
        log(`  Seat ${r.seat} (${r.playerType}): ${r.remainingTiles.length} tiles${r.isWinner ? ' [WINNER]' : ''}`);
      }
    } else {
      results.s2.checks['game_ended_cleanly'] = false;
    }

    // 12. Universe Conservation check via REST API
    try {
      const state = await httpGet(`/api/games/${gameId}?seat=${client.seat}`, token);
      const tableTiles = (state.table || []).reduce((sum, g) => sum + g.tiles.length, 0);
      const rackCount = state.myRack.length;
      const otherRacks = state.players
        .filter(p => p.seat !== client.seat)
        .reduce((sum, p) => sum + p.tileCount, 0);
      const total = tableTiles + rackCount + otherRacks + state.drawPileCount;
      results.s2.checks['universe_conservation_106'] = total === 106;
      log(`Universe conservation: table(${tableTiles}) + myRack(${rackCount}) + otherRacks(${otherRacks}) + drawPile(${state.drawPileCount}) = ${total} (expected 106)`);
    } catch (e) {
      log(`Universe conservation check failed: ${e.message}`);
      results.s2.checks['universe_conservation_106'] = false;
    }

    results.s2.checks['no_crash'] = true;

    // 13. Summary
    log('--------------------------------------');
    log('S2 RESULTS:');
    log(`  Total turns: ${turnCount}`);
    log(`  Human draws: ${humanDrawCount}`);
    log(`  AI total places: ${totalAIPlaces}, fallbacks: ${totalAIFallbacks}`);
    log(`  AI Stats:`);
    for (const [model, stats] of Object.entries(aiStats)) {
      log(`    ${model}: turns=${stats.turns}, places=${stats.places}, draws=${stats.draws}, fallbacks=${stats.fallbacks}, timeouts=${stats.timeouts}`);
    }
    log(`  Game over: ${client.gameOver}`);
    log(`  Turn order correct: ${turnOrderCorrect}`);

    results.s2.aiStats = aiStats;
    results.s2.turnLog = client.turnLog;
    results.s2.summary = `${turnCount} turns, ${humanDrawCount} human draws, ${totalAIPlaces} AI places, ${totalAIFallbacks} fallbacks, gameOver=${client.gameOver}, turnOrderCorrect=${turnOrderCorrect}`;

    // Determine overall status
    const criticalChecks = [
      results.s2.checks['room_created'],
      results.s2.checks['player_count_4'],
      results.s2.checks['game_started'],
      results.s2.checks['ws_connected'],
      results.s2.checks['initial_rack_14'],
      results.s2.checks['drawPile_50'],
      results.s2.checks['all_players_14_tiles'],
      results.s2.checks['first_turn_received'],
      results.s2.checks['all_ai_responded'],
      results.s2.checks['turn_order_cyclic'],
      results.s2.checks['no_crash'],
    ];
    results.s2.status = criticalChecks.every(Boolean) ? 'PASS' : 'FAIL';

    client.close();
    log('S2 completed.');
  } catch (e) {
    log(`S2 FAILED: ${e.message}`);
    results.s2.status = 'FAIL';
    results.s2.errors.push(e.message);
  }
}

// ============================================================
// Main
// ============================================================

async function main() {
  const startTime = Date.now();
  log('========================================');
  log('Playtest S2: 4-Player Battle');
  log(`Date: ${new Date().toISOString()}`);
  log(`Base URL: ${BASE_URL}`);
  log(`Max Turns: ${MAX_TURNS}`);
  log('========================================');
  log('');

  // Set global timeout
  const scenarioTimer = setTimeout(() => {
    log('SCENARIO TIMEOUT: Exceeded maximum allowed time.');
    printReport(startTime);
    process.exit(2);
  }, SCENARIO_TIMEOUT_MS);

  // Dev login
  log('Dev Login...');
  const loginResp = await httpPost('/api/auth/dev-login', {
    userId: 'playtest-human-s2',
    displayName: 'Playtest Human S2',
  });
  const token = loginResp.token;
  log(`Token acquired: userId=${loginResp.userId}`);
  log('');

  await runS2(token);

  clearTimeout(scenarioTimer);
  printReport(startTime);

  const allPassed = results.s2.status === 'PASS';
  process.exit(allPassed ? 0 : 1);
}

function printReport(startTime) {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log('');
  log('========================================');
  log('FINAL REPORT');
  log('========================================');
  log(`Elapsed: ${elapsed}s`);
  log('');

  const val = results.s2;
  log('--- S2: 4-Player Battle ---');
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
  if (val.aiStats && Object.keys(val.aiStats).length > 0) {
    log('  AI Stats:');
    for (const [model, stats] of Object.entries(val.aiStats)) {
      log(`    ${model}: turns=${stats.turns}, places=${stats.places}, draws=${stats.draws}, fallbacks=${stats.fallbacks}, timeouts=${stats.timeouts}`);
    }
  }
  if (val.turnLog && val.turnLog.length > 0) {
    log(`  Turn Log (${val.turnLog.length} entries):`);
    val.turnLog.forEach(t => {
      log(`    Turn ${t.turn}: seat=${t.seat} action=${t.action} placed=${t.tilesPlaced} tiles=${t.playerTileCount} pile=${t.drawPileCount}${t.isFallback ? ` FALLBACK(${t.fallbackReason})` : ''}`);
    });
  }

  log('');
  log('--- JSON Report ---');
  console.log(JSON.stringify(results, null, 2));
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(2);
});
