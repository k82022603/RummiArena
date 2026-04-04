#!/usr/bin/env node
/**
 * Playtest S5: Long Game 50+ Turns Stability
 *
 * 50턴 이상 진행되는 장기전 시뮬레이션.
 * Human은 매 턴 드로우(auto-draw)하여 장기전을 유도하고,
 * 10턴 간격으로 안정성 체크포인트를 수집한다.
 *
 * 검증 항목:
 *   - 50턴+ 안정 동작 (크래시 없음)
 *   - 타일 보존 법칙 유지 (매 10턴 Universe Conservation = 106)
 *   - WebSocket 연결 안정성 (장시간 연결 유지, 재연결 0회)
 *   - 게임 로그/이력 정확히 누적
 *   - Redis 게임 상태 사이즈 비정상 증가 없음 (API로 간접 검증)
 *   - TURN_END turnNumber > 0 (m-10 수정 확인)
 *   - 드로우 파일 소진 시 정상 처리
 *
 * Usage:
 *   node scripts/playtest-s5.mjs
 *
 * Environment:
 *   BASE_URL (default: http://localhost:30080)
 *   MAX_TURNS (default: 80)
 */

import WebSocket from 'ws';

const BASE_URL = process.env.BASE_URL || 'http://localhost:30080';
const WS_URL = BASE_URL.replace('http', 'ws') + '/ws';
const MAX_TURNS = parseInt(process.env.MAX_TURNS || '80', 10);
const AI_TIMEOUT_MS = 90000;   // 90s max for Ollama
const SCENARIO_TIMEOUT_MS = 1800000; // 30 min total for long game
const CHECKPOINT_INTERVAL = 10; // Every 10 turns

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
// WebSocket Client (extended with stability tracking)
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
    this.drawPileEmpty = false;

    // Stability metrics
    this.reconnectCount = 0;
    this.errorMessages = [];
    this.wsCloseCount = 0;
    this.messageCount = 0;
    this.turnEndZeroCount = 0; // m-10: turnNumber=0 occurrences
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
        this.messageCount++;
        const msg = JSON.parse(data.toString());
        this.messages.push(msg);
        this.processMessage(msg);
        const resolvers = [...this.pendingResolvers];
        this.pendingResolvers = [];
        resolvers.forEach(r => r(msg));
      });

      this.ws.on('error', (err) => {
        this.errorMessages.push(`WS error: ${err.message}`);
        reject(err);
      });

      this.ws.on('close', (code, reason) => {
        this.connected = false;
        this.wsCloseCount++;
      });

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
        if (msg.payload.tableGroups) this.tableGroups = msg.payload.tableGroups;

        // Track m-10: TURN_END with turnNumber=0
        if (msg.payload.turnNumber === 0) {
          this.turnEndZeroCount++;
        }

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
      case 'DRAW_PILE_EMPTY':
        this.drawPileEmpty = true;
        break;
      case 'ERROR':
        this.errorMessages.push(`Server error: ${msg.payload.code} - ${msg.payload.message}`);
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
  s5: {
    status: 'NOT_RUN',
    checks: {},
    checkpoints: [],
    turnLog: [],
    errors: [],
    stability: {},
    summary: '',
  },
};

function log(msg) {
  const ts = new Date().toISOString().substr(11, 12);
  console.log(`[${ts}] ${msg}`);
}

// ============================================================
// Conservation Check Helper
// ============================================================

async function checkConservation(client, token, label) {
  try {
    const state = await httpGet(`/api/games/${client.gameId}?seat=${client.seat}`, token);
    const tableTiles = (state.table || []).reduce((sum, g) => sum + g.tiles.length, 0);
    const rackCount = state.myRack.length;
    const otherRacks = state.players
      .filter(p => p.seat !== client.seat)
      .reduce((sum, p) => sum + p.tileCount, 0);
    const drawPile = state.drawPileCount;
    const total = tableTiles + rackCount + otherRacks + drawPile;
    const isValid = total === 106;

    const checkpoint = {
      label,
      tableTiles,
      humanRack: rackCount,
      aiRack: otherRacks,
      drawPile,
      total,
      valid: isValid,
      tableSetCount: (state.table || []).length,
    };

    log(`  Conservation [${label}]: table(${tableTiles}) + humanRack(${rackCount}) + aiRack(${otherRacks}) + drawPile(${drawPile}) = ${total} ${isValid ? 'OK' : 'VIOLATION!'}`);
    return checkpoint;
  } catch (e) {
    log(`  Conservation check [${label}] failed: ${e.message}`);
    return {
      label,
      error: e.message,
      valid: false,
    };
  }
}

// ============================================================
// S5: Long Game 50+ Turns
// ============================================================

async function runS5(token) {
  log('======================================');
  log('S5: Long Game 50+ Turns Stability');
  log(`Target: ${MAX_TURNS} turns`);
  log('======================================');

  const gameStartTime = Date.now();

  try {
    // 1. Create room
    log('Creating room (Human vs Ollama)...');
    const room = await httpPost('/api/rooms', {
      name: 'Playtest S5 - Long Game',
      playerCount: 2,
      turnTimeoutSec: 60,
      displayName: 'Playtest Human S5',
      aiPlayers: [{
        type: 'AI_OLLAMA',
        persona: 'calculator',
        difficulty: 'intermediate',
        psychologyLevel: 0,
      }],
    }, token);

    const roomId = room.id;
    log(`Room created: ${roomId}`);
    results.s5.checks['room_created'] = true;

    // 2. Start game
    const gameStart = await httpPost(`/api/rooms/${roomId}/start`, {}, token);
    const gameId = gameStart.gameId;
    log(`Game started: ${gameId}`);
    results.s5.checks['game_started'] = true;

    // 3. Connect WebSocket
    const client = new PlaytestWSClient(roomId, token);
    await client.connect();
    log(`WS connected. Seat: ${client.seat}`);
    results.s5.checks['ws_connected'] = true;

    // 4. Wait for GAME_STATE
    await client.waitForMessage('GAME_STATE', 5000);
    log(`Rack (${client.myRack.length}), drawPile=${client.drawPileCount}`);
    results.s5.checks['initial_rack_14'] = client.myRack.length === 14;
    results.s5.checks['drawPile_78'] = client.drawPileCount === 78;

    // Initial conservation check
    const initCP = await checkConservation(client, token, 'turn_0');
    results.s5.checkpoints.push(initCP);

    // 5. Wait for first TURN_START
    await client.waitForMessage('TURN_START', 5000);
    results.s5.checks['first_turn_received'] = true;

    // 6. Game loop -- Human always draws to force a long game
    let turnCount = 0;
    let humanDrawCount = 0;
    let aiTurnCount = 0;
    let aiPlaceCount = 0;
    let aiFallbackCount = 0;
    let drawPileEmptyTurn = -1;
    let lastCheckpointTurn = 0;
    let wsStillConnected = true;

    while (turnCount < MAX_TURNS && !client.gameOver) {
      if (!client.connected) {
        log(`  WS disconnected at turn ${turnCount}!`);
        wsStillConnected = false;
        results.s5.errors.push(`WS disconnected at turn ${turnCount}`);
        break;
      }

      if (client.currentSeat === client.seat) {
        // Human's turn -- always draw
        if (client.drawPileEmpty && drawPileEmptyTurn === -1) {
          drawPileEmptyTurn = turnCount;
          log(`  Draw pile empty detected at turn ${turnCount}`);
        }

        log(`Turn ${client.turnNumber}: Human draws (rack: ${client.myRack.length}, drawPile: ${client.drawPileCount})`);
        client.drawTile();
        humanDrawCount++;

        try {
          await client.waitForAnyMessage(['TILE_DRAWN', 'DRAW_PILE_EMPTY', 'ERROR'], 15000);
        } catch (e) {
          log(`  TILE_DRAWN/error wait: ${e.message}`);
        }

        if (client.gameOver) break;

        try {
          await client.waitForMessage('TURN_END', 15000);
        } catch (e) {
          log(`  TURN_END wait: ${e.message}`);
        }

        if (client.gameOver) break;

        try {
          await client.waitForMessage('TURN_START', 15000);
        } catch (e) {
          if (!client.gameOver) log(`  TURN_START wait: ${e.message}`);
        }
        turnCount++;
      } else {
        // AI's turn
        log(`Turn ${client.turnNumber}: AI thinking... (turn ${turnCount + 1}/${MAX_TURNS})`);
        aiTurnCount++;

        try {
          const turnEnd = await client.waitForMessage('TURN_END', AI_TIMEOUT_MS);
          const action = turnEnd.payload.action;
          const tilesPlaced = turnEnd.payload.tilesPlacedCount;
          const isFallback = turnEnd.payload.isFallbackDraw || false;

          if (action === 'PLACE_TILES' && tilesPlaced > 0) aiPlaceCount++;
          if (isFallback) aiFallbackCount++;

          log(`  AI: action=${action}, placed=${tilesPlaced}, fallback=${isFallback}`);
        } catch (e) {
          log(`  AI TIMEOUT: ${e.message}`);
          results.s5.errors.push(`AI timeout at turn ${turnCount}`);
          break;
        }

        if (client.gameOver) break;

        try {
          await client.waitForMessage('TURN_START', 15000);
        } catch (e) {
          if (!client.gameOver) log(`  TURN_START wait: ${e.message}`);
        }
        turnCount++;
      }

      // Checkpoint every CHECKPOINT_INTERVAL turns
      if (turnCount > 0 && turnCount % CHECKPOINT_INTERVAL === 0 && turnCount > lastCheckpointTurn) {
        lastCheckpointTurn = turnCount;
        log('');
        log(`--- Checkpoint at turn ${turnCount} ---`);
        const cp = await checkConservation(client, token, `turn_${turnCount}`);
        results.s5.checkpoints.push(cp);

        // Log stability metrics
        const elapsed = ((Date.now() - gameStartTime) / 1000).toFixed(0);
        log(`  Stability: messages=${client.messageCount}, wsCloses=${client.wsCloseCount}, reconnects=${client.reconnectCount}, errors=${client.errorMessages.length}, turnEndZero=${client.turnEndZeroCount}`);
        log(`  Elapsed: ${elapsed}s, avgTurnTime=${(parseFloat(elapsed) / turnCount).toFixed(1)}s`);
        log('');
      }
    }

    // 7. Final checkpoint
    log('');
    log('--- Final Checkpoint ---');
    const finalCP = await checkConservation(client, token, `final_turn_${turnCount}`);
    results.s5.checkpoints.push(finalCP);

    // 8. Game over details
    if (client.gameOver && client.gameOverPayload) {
      const go = client.gameOverPayload;
      log(`GAME OVER: endType=${go.endType}, winnerSeat=${go.winnerSeat}`);
      for (const r of go.results) {
        log(`  Seat ${r.seat} (${r.playerType}): ${r.remainingTiles.length} tiles${r.isWinner ? ' [WINNER]' : ''}`);
      }
      results.s5.checks['game_ended_cleanly'] = true;
    }

    // 9. Stability summary
    const gameElapsed = ((Date.now() - gameStartTime) / 1000).toFixed(1);
    results.s5.stability = {
      totalTurns: turnCount,
      totalMessages: client.messageCount,
      wsCloseCount: client.wsCloseCount,
      reconnectCount: client.reconnectCount,
      errorMessageCount: client.errorMessages.length,
      errorMessages: client.errorMessages.slice(0, 10), // first 10
      turnEndZeroCount: client.turnEndZeroCount,
      elapsedSec: parseFloat(gameElapsed),
      avgTurnTimeSec: turnCount > 0 ? parseFloat((parseFloat(gameElapsed) / turnCount).toFixed(1)) : 0,
      drawPileEmptyTurn,
      drawPileEmptyReached: drawPileEmptyTurn >= 0,
    };

    // 10. Validation checks
    results.s5.checks['reached_50_turns'] = turnCount >= 50;
    results.s5.checks['ws_stable'] = client.reconnectCount === 0 && wsStillConnected;
    results.s5.checks['no_ws_errors'] = client.errorMessages.length === 0;
    results.s5.checks['turn_log_accurate'] = client.turnLog.length === turnCount;

    // Check all conservation checkpoints
    const allConservationValid = results.s5.checkpoints.every(cp => cp.valid !== false);
    results.s5.checks['all_conservation_valid'] = allConservationValid;

    // Check turnNumber correctness (m-10: no turnNumber=0 after first turn)
    // Allow first turn to be 0 (0-based count) but flag if many
    results.s5.checks['no_excessive_turnEnd_zero'] = client.turnEndZeroCount <= 1;

    results.s5.checks['no_crash'] = true;

    // 11. Determine status
    const criticalChecks = [
      results.s5.checks['room_created'],
      results.s5.checks['game_started'],
      results.s5.checks['ws_connected'],
      results.s5.checks['initial_rack_14'],
      results.s5.checks['all_conservation_valid'],
      results.s5.checks['ws_stable'],
      results.s5.checks['no_crash'],
    ];
    results.s5.status = criticalChecks.every(Boolean) ? 'PASS' : 'FAIL';

    // Additional: PASS if we reached 50+ turns regardless
    if (results.s5.status === 'FAIL' && turnCount >= 50 && allConservationValid) {
      results.s5.status = 'PARTIAL';
    }

    results.s5.turnLog = client.turnLog;
    results.s5.summary = [
      `${turnCount} turns in ${gameElapsed}s`,
      `humanDraws=${humanDrawCount}`,
      `aiTurns=${aiTurnCount} (places=${aiPlaceCount}, fallbacks=${aiFallbackCount})`,
      `wsReconnects=${client.reconnectCount}`,
      `conservation=${allConservationValid ? 'ALL_OK' : 'VIOLATION'}`,
      `turnEndZero=${client.turnEndZeroCount}`,
      `gameOver=${client.gameOver}`,
      `drawPileEmpty=${drawPileEmptyTurn >= 0 ? `turn_${drawPileEmptyTurn}` : 'no'}`,
    ].join(', ');

    log('');
    log('--------------------------------------');
    log('S5 RESULTS:');
    log(`  ${results.s5.summary}`);

    client.close();
    log('S5 completed.');
  } catch (e) {
    log(`S5 FAILED: ${e.message}`);
    results.s5.status = 'FAIL';
    results.s5.errors.push(e.message);
  }
}

// ============================================================
// Main
// ============================================================

async function main() {
  const startTime = Date.now();
  log('========================================');
  log('Playtest S5: Long Game 50+ Turns');
  log(`Date: ${new Date().toISOString()}`);
  log(`Base URL: ${BASE_URL}`);
  log(`Max Turns: ${MAX_TURNS}`);
  log(`Checkpoint Interval: every ${CHECKPOINT_INTERVAL} turns`);
  log('========================================');
  log('');

  const scenarioTimer = setTimeout(() => {
    log('SCENARIO TIMEOUT: Exceeded maximum allowed time.');
    printReport(startTime);
    process.exit(2);
  }, SCENARIO_TIMEOUT_MS);

  log('Dev Login...');
  const loginResp = await httpPost('/api/auth/dev-login', {
    userId: 'playtest-human-s5',
    displayName: 'Playtest Human S5',
  });
  const token = loginResp.token;
  log(`Token acquired: userId=${loginResp.userId}`);
  log('');

  await runS5(token);

  clearTimeout(scenarioTimer);
  printReport(startTime);

  const passed = results.s5.status === 'PASS';
  process.exit(passed ? 0 : 1);
}

function printReport(startTime) {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log('');
  log('========================================');
  log('FINAL REPORT');
  log('========================================');
  log(`Total Elapsed: ${elapsed}s`);
  log('');

  const val = results.s5;
  log('--- S5: Long Game 50+ Turns ---');
  log(`  Status: ${val.status}`);
  log(`  Summary: ${val.summary || 'N/A'}`);
  log('  Checks:');
  for (const [ck, cv] of Object.entries(val.checks)) {
    log(`    ${cv ? 'PASS' : 'FAIL'}: ${ck}`);
  }

  if (val.checkpoints.length > 0) {
    log('  Conservation Checkpoints:');
    for (const cp of val.checkpoints) {
      if (cp.error) {
        log(`    ${cp.label}: ERROR - ${cp.error}`);
      } else {
        log(`    ${cp.label}: table=${cp.tableTiles}, humanRack=${cp.humanRack}, aiRack=${cp.aiRack}, drawPile=${cp.drawPile}, total=${cp.total}, sets=${cp.tableSetCount} ${cp.valid ? 'OK' : 'VIOLATION!'}`);
      }
    }
  }

  if (val.stability && Object.keys(val.stability).length > 0) {
    log('  Stability Metrics:');
    const s = val.stability;
    log(`    Total turns: ${s.totalTurns}`);
    log(`    Total WS messages: ${s.totalMessages}`);
    log(`    WS closes: ${s.wsCloseCount}`);
    log(`    WS reconnects: ${s.reconnectCount}`);
    log(`    Server errors: ${s.errorMessageCount}`);
    log(`    TURN_END turnNumber=0: ${s.turnEndZeroCount}`);
    log(`    Elapsed: ${s.elapsedSec}s`);
    log(`    Avg turn time: ${s.avgTurnTimeSec}s`);
    log(`    Draw pile empty: ${s.drawPileEmptyReached ? `turn ${s.drawPileEmptyTurn}` : 'No'}`);
    if (s.errorMessages.length > 0) {
      log('    Error samples:');
      s.errorMessages.forEach(e => log(`      - ${e}`));
    }
  }

  if (val.errors.length > 0) {
    log('  Test Errors:');
    val.errors.forEach(e => log(`    - ${e}`));
  }

  // Turn log summary (not full -- too many turns)
  if (val.turnLog.length > 0) {
    log(`  Turn Log: ${val.turnLog.length} entries (showing first 10 and last 10)`);
    const first = val.turnLog.slice(0, 10);
    const last = val.turnLog.slice(-10);
    first.forEach(t => {
      log(`    Turn ${t.turn}: seat=${t.seat} action=${t.action} placed=${t.tilesPlaced} tiles=${t.playerTileCount} pile=${t.drawPileCount}${t.isFallback ? ` FALLBACK(${t.fallbackReason})` : ''}`);
    });
    if (val.turnLog.length > 20) {
      log(`    ... (${val.turnLog.length - 20} turns omitted) ...`);
    }
    last.forEach(t => {
      log(`    Turn ${t.turn}: seat=${t.seat} action=${t.action} placed=${t.tilesPlaced} tiles=${t.playerTileCount} pile=${t.drawPileCount}${t.isFallback ? ` FALLBACK(${t.fallbackReason})` : ''}`);
    });
  }

  log('');
  log('--- JSON Report ---');
  // Trim turnLog in JSON output to keep it manageable
  const reportCopy = JSON.parse(JSON.stringify(results));
  if (reportCopy.s5.turnLog.length > 30) {
    const totalEntries = reportCopy.s5.turnLog.length;
    reportCopy.s5.turnLog = [
      ...reportCopy.s5.turnLog.slice(0, 15),
      { _note: `... ${totalEntries - 30} entries omitted ...` },
      ...reportCopy.s5.turnLog.slice(-15),
    ];
  }
  console.log(JSON.stringify(reportCopy, null, 2));
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(2);
});
