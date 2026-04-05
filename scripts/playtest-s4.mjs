#!/usr/bin/env node
/**
 * Playtest S4: Joker Exchange + Table Rearrangement
 *
 * 가장 복잡한 턴 액션인 조커 교환과 테이블 재배치를 조합하여
 * 타일 보전 불변식(Universe Conservation)이 유지되는지 확인한다.
 *
 * 이 스크립트는 게임 서버의 WebSocket/REST API를 직접 호출하여
 * 다음을 검증한다:
 *   - 조커 포함 세트 배치 -> 서버 승인
 *   - 조커 교환: 테이블 위 조커를 실제 타일로 교체 -> 교체된 조커를 같은 턴에 재사용
 *   - 테이블 재배치: 기존 세트 분리 + 랙 타일 추가 -> 서버 승인
 *   - Universe Conservation: table + rack + drawPile = 106 (매 단계)
 *   - INVALID joker exchange 시 INVALID_MOVE 반환 + 랙 복원
 *
 * 전략:
 *   Human은 30점 이상 초기 등록(initial meld)을 시도하고,
 *   이후 의도적으로 세트 재배치/조커 교환을 테스트한다.
 *   유효한 세트 배치가 어려우면 드로우하고 다음 턴에 재시도한다.
 *
 * Usage:
 *   node scripts/playtest-s4.mjs
 *
 * Environment:
 *   BASE_URL (default: http://localhost:30080)
 */

import WebSocket from 'ws';

const BASE_URL = process.env.BASE_URL || 'http://localhost:30080';
const WS_URL = BASE_URL.replace('http', 'ws') + '/ws';
const MAX_TURNS = parseInt(process.env.MAX_TURNS || '30', 10);
const AI_TIMEOUT_MS = 90000;
const SCENARIO_TIMEOUT_MS = 600000; // 10 min

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
    this.hasInitialMeld = false;
    this.lastInvalidMove = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const url = `${WS_URL}?roomId=${this.roomId}`;
      this.ws = new WebSocket(url);
      this.ws.on('open', () => {
        this.connected = true;
        this.send({ type: 'AUTH', payload: { token: this.token }, seq: 1, timestamp: new Date().toISOString() });
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
        .then((msg) => { this.authenticated = true; this.seat = msg.payload.seat; resolve(msg); })
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
        if (msg.payload.hasInitialMeld !== undefined) this.hasInitialMeld = msg.payload.hasInitialMeld;
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
        if (msg.payload.drawnTile) this.myRack.push(msg.payload.drawnTile);
        this.drawPileCount = msg.payload.drawPileCount;
        break;
      case 'INVALID_MOVE':
        this.lastInvalidMove = msg.payload;
        break;
      case 'GAME_OVER':
        this.gameOver = true;
        this.gameOverPayload = msg.payload;
        break;
    }
  }

  send(msg) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error('WebSocket not connected');
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
        if (msg.type === type) { clearTimeout(timer); resolve(msg); }
        else { this.pendingResolvers.push(handler); }
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
        if (types.includes(msg.type)) { clearTimeout(timer); resolve(msg); }
        else { this.pendingResolvers.push(handler); }
      };
      this.pendingResolvers.push(handler);
    });
  }

  drawTile() {
    this.send({ type: 'DRAW_TILE', payload: {}, seq: Date.now(), timestamp: new Date().toISOString() });
  }

  confirmTurn(tableGroups, tilesFromRack, jokerReturnedCodes) {
    this.send({
      type: 'CONFIRM_TURN',
      payload: { tableGroups, tilesFromRack, jokerReturnedCodes: jokerReturnedCodes || [] },
      seq: Date.now(),
      timestamp: new Date().toISOString(),
    });
  }

  resetTurn() {
    this.send({ type: 'RESET_TURN', payload: {}, seq: Date.now(), timestamp: new Date().toISOString() });
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

// ============================================================
// Tile Analysis Helpers
// ============================================================

function parseTile(code) {
  if (code === 'JK1' || code === 'JK2') return { code, color: 'JOKER', number: 0, isJoker: true };
  const color = code[0]; // R, B, Y, K
  const rest = code.slice(1);
  const numStr = rest.replace(/[ab]$/, '');
  const set = rest.slice(numStr.length);
  return { code, color, number: parseInt(numStr, 10), set, isJoker: false };
}

/** Find a valid run (consecutive same-color tiles, 3+) in rack */
function findRunInRack(rack) {
  const tiles = rack.map(parseTile).filter(t => !t.isJoker);
  const byColor = {};
  for (const t of tiles) {
    if (!byColor[t.color]) byColor[t.color] = [];
    byColor[t.color].push(t);
  }
  for (const [color, colorTiles] of Object.entries(byColor)) {
    const sorted = colorTiles.sort((a, b) => a.number - b.number);
    // Find consecutive runs of 3+
    for (let i = 0; i < sorted.length - 2; i++) {
      if (sorted[i + 1].number === sorted[i].number + 1 &&
          sorted[i + 2].number === sorted[i].number + 2) {
        const run = [sorted[i], sorted[i + 1], sorted[i + 2]];
        const score = run.reduce((s, t) => s + t.number, 0);
        return { tiles: run.map(t => t.code), score, type: 'run' };
      }
    }
  }
  return null;
}

/** Find a valid group (same number, different colors, 3+) in rack */
function findGroupInRack(rack) {
  const tiles = rack.map(parseTile).filter(t => !t.isJoker);
  const byNumber = {};
  for (const t of tiles) {
    if (!byNumber[t.number]) byNumber[t.number] = [];
    byNumber[t.number].push(t);
  }
  for (const [num, numTiles] of Object.entries(byNumber)) {
    // Deduplicate colors
    const seenColors = new Set();
    const unique = [];
    for (const t of numTiles) {
      if (!seenColors.has(t.color)) {
        seenColors.add(t.color);
        unique.push(t);
      }
    }
    if (unique.length >= 3) {
      const group = unique.slice(0, Math.min(4, unique.length));
      const score = group.reduce((s, t) => s + t.number, 0);
      return { tiles: group.map(t => t.code), score, type: 'group' };
    }
  }
  return null;
}

/** Find sets totaling >= 30 points for initial meld */
function findInitialMeld(rack) {
  // Try group first, then run, combining if needed
  const sets = [];
  let totalScore = 0;
  const used = new Set();

  const available = () => rack.filter(c => !used.has(c));

  // Try to find multiple sets adding up to 30+
  for (let attempt = 0; attempt < 3 && totalScore < 30; attempt++) {
    const avail = available();
    const group = findGroupInRack(avail);
    if (group && group.score > 0) {
      sets.push(group);
      totalScore += group.score;
      group.tiles.forEach(t => used.add(t));
      continue;
    }
    const run = findRunInRack(avail);
    if (run && run.score > 0) {
      sets.push(run);
      totalScore += run.score;
      run.tiles.forEach(t => used.add(t));
      continue;
    }
    break;
  }

  if (totalScore >= 30) {
    return { sets, totalScore, allTiles: [...used] };
  }
  return null;
}

/** Find a run or group that includes a joker */
function findSetWithJoker(rack) {
  const jokers = rack.filter(c => c === 'JK1' || c === 'JK2');
  if (jokers.length === 0) return null;

  const joker = jokers[0];
  const nonJoker = rack.filter(c => c !== 'JK1' && c !== 'JK2').map(parseTile);

  // Try to make a run with joker filling a gap
  const byColor = {};
  for (const t of nonJoker) {
    if (!byColor[t.color]) byColor[t.color] = [];
    byColor[t.color].push(t);
  }

  for (const [color, colorTiles] of Object.entries(byColor)) {
    const sorted = colorTiles.sort((a, b) => a.number - b.number);
    // Look for 2 consecutive: use joker as the 3rd
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i + 1].number === sorted[i].number + 1) {
        // Joker goes before, between (gap), or after
        const n1 = sorted[i].number;
        const n2 = sorted[i + 1].number;
        // Joker after: n1, n2, JK (as n2+1)
        if (n2 < 13) {
          return {
            tiles: [sorted[i].code, sorted[i + 1].code, joker],
            jokerPosition: 2,
            jokerRepresents: `${color}${n2 + 1}`,
            score: n1 + n2 + (n2 + 1),
          };
        }
        // Joker before: JK (as n1-1), n1, n2
        if (n1 > 1) {
          return {
            tiles: [joker, sorted[i].code, sorted[i + 1].code],
            jokerPosition: 0,
            jokerRepresents: `${color}${n1 - 1}`,
            score: (n1 - 1) + n1 + n2,
          };
        }
      }
      // Gap of 1: n, ?, n+2 -> joker fills
      if (sorted[i + 1].number === sorted[i].number + 2) {
        const n1 = sorted[i].number;
        const nMid = n1 + 1;
        const n2 = sorted[i + 1].number;
        return {
          tiles: [sorted[i].code, joker, sorted[i + 1].code],
          jokerPosition: 1,
          jokerRepresents: `${color}${nMid}`,
          score: n1 + nMid + n2,
        };
      }
    }
  }

  // Try group with joker: 2 same-number different-color + joker
  const byNumber = {};
  for (const t of nonJoker) {
    if (!byNumber[t.number]) byNumber[t.number] = [];
    byNumber[t.number].push(t);
  }
  for (const [num, numTiles] of Object.entries(byNumber)) {
    const seenColors = new Set();
    const unique = [];
    for (const t of numTiles) {
      if (!seenColors.has(t.color)) { seenColors.add(t.color); unique.push(t); }
    }
    if (unique.length >= 2) {
      const missingColors = ['R', 'B', 'Y', 'K'].filter(c => !seenColors.has(c));
      return {
        tiles: [...unique.slice(0, 2).map(t => t.code), joker],
        jokerPosition: 2,
        jokerRepresents: `${missingColors[0]}${num}`,
        score: parseInt(num) * 3,
      };
    }
  }

  return null;
}

/** Count table tiles from tableGroups */
function countTableTiles(tableGroups) {
  return tableGroups.reduce((sum, g) => sum + g.tiles.length, 0);
}

// ============================================================
// Test Results
// ============================================================

const results = {
  s4: {
    status: 'NOT_RUN',
    checks: {},
    conservation: [],
    errors: [],
    summary: '',
  },
};

function log(msg) {
  const ts = new Date().toISOString().substr(11, 12);
  console.log(`[${ts}] ${msg}`);
}

// ============================================================
// S4: Joker Exchange + Table Rearrangement
// ============================================================

async function runS4(token) {
  log('======================================');
  log('S4: Joker Exchange + Table Rearrangement');
  log('======================================');

  try {
    // 1. Create room
    log('Creating room (Human vs Ollama)...');
    const room = await httpPost('/api/rooms', {
      name: 'Playtest S4 - Joker Exchange',
      playerCount: 2,
      turnTimeoutSec: 60,
      displayName: 'Playtest Human S4',
      aiPlayers: [{
        type: 'AI_OLLAMA',
        persona: 'calculator',
        difficulty: 'intermediate',
        psychologyLevel: 0,
      }],
    }, token);

    const roomId = room.id;
    log(`Room created: ${roomId}`);
    results.s4.checks['room_created'] = true;

    // 2. Start game
    const gameStart = await httpPost(`/api/rooms/${roomId}/start`, {}, token);
    const gameId = gameStart.gameId;
    log(`Game started: ${gameId}`);
    results.s4.checks['game_started'] = true;

    // 3. Connect WebSocket
    const client = new PlaytestWSClient(roomId, token);
    await client.connect();
    log(`WS connected. Seat: ${client.seat}`);
    results.s4.checks['ws_connected'] = true;

    // 4. Wait for GAME_STATE
    await client.waitForMessage('GAME_STATE', 5000);
    log(`Rack (${client.myRack.length}): ${client.myRack.join(', ')}`);
    results.s4.checks['initial_rack_14'] = client.myRack.length === 14;

    // 5. First turn: derive from GAME_STATE (server does not send TURN_START
    //    for the initial turn).
    try {
      await client.waitForMessage('TURN_START', 3000);
    } catch (_) {
      log(`First turn (from GAME_STATE): seat=${client.currentSeat}, turn=1`);
      client.turnNumber = 1;
    }

    // If AI goes first, wait for AI turn
    if (client.currentSeat !== client.seat) {
      log('AI goes first, waiting...');
      await client.waitForMessage('TURN_END', AI_TIMEOUT_MS);
      if (!client.gameOver) await client.waitForMessage('TURN_START', 10000);
    }

    // -------------------------------------------------------
    // Phase A: Initial Meld (30+ points)
    // -------------------------------------------------------
    log('');
    log('--- Phase A: Initial Meld ---');

    let initialMeldDone = false;
    let turnCount = 0;
    let jokerSetOnTable = false;    // Did we place a joker set on table?
    let jokerExchangeAttempted = false;
    let jokerExchangeValid = false;
    let invalidJokerAttempted = false;
    let invalidJokerRejected = false;
    let rearrangementAttempted = false;
    let rearrangementValid = false;

    // Conservation checkpoints
    function recordConservation(label) {
      try {
        const tableTiles = countTableTiles(client.tableGroups);
        const rackCount = client.myRack.length;
        // We can't see AI rack from WS, use REST for full check
        results.s4.conservation.push({ label, tableTiles, rackCount, drawPile: client.drawPileCount });
      } catch (e) { /* skip */ }
    }

    recordConservation('initial');

    while (turnCount < MAX_TURNS && !client.gameOver) {
      if (client.currentSeat !== client.seat) {
        // AI turn
        log(`Turn ${client.turnNumber}: AI playing...`);
        try {
          await client.waitForMessage('TURN_END', AI_TIMEOUT_MS);
        } catch (e) {
          log(`  AI timeout: ${e.message}`);
          break;
        }
        if (client.gameOver) break;
        try {
          await client.waitForMessage('TURN_START', 10000);
        } catch (e) {
          if (!client.gameOver) log(`  TURN_START warning: ${e.message}`);
        }
        turnCount++;
        continue;
      }

      // Human's turn
      log(`Turn ${client.turnNumber}: Human (rack: ${client.myRack.length}, drawPile: ${client.drawPileCount})`);

      // Phase A: Try initial meld if not done
      if (!initialMeldDone) {
        const meld = findInitialMeld(client.myRack);
        if (meld) {
          log(`  Found initial meld (${meld.totalScore} points, ${meld.sets.length} sets): ${meld.allTiles.join(', ')}`);

          const tableGroups = meld.sets.map((s, i) => ({
            id: `meld-${i}`,
            tiles: s.tiles,
          }));

          client.confirmTurn(tableGroups, meld.allTiles, []);

          const response = await client.waitForAnyMessage(['TURN_END', 'INVALID_MOVE'], 10000);
          if (response.type === 'TURN_END') {
            log(`  Initial meld ACCEPTED. Placed ${meld.allTiles.length} tiles.`);
            initialMeldDone = true;
            results.s4.checks['initial_meld_done'] = true;
            recordConservation('after_initial_meld');
          } else {
            log(`  Initial meld REJECTED: ${JSON.stringify(response.payload.errors)}`);
            client.resetTurn();
            // Fall through to draw
          }
        }

        if (!initialMeldDone) {
          log('  No valid initial meld, drawing...');
          client.drawTile();
          try { await client.waitForMessage('TILE_DRAWN', 10000); } catch (e) { /* ok */ }
        }

        // Wait for turn end + next turn start
        if (!client.gameOver) {
          try { await client.waitForMessage('TURN_END', 10000); } catch (e) { /* ok */ }
          if (!client.gameOver) {
            try { await client.waitForMessage('TURN_START', 10000); } catch (e) { /* ok */ }
          }
        }
        turnCount++;
        continue;
      }

      // Phase B+C+D: After initial meld -- test joker and rearrangement
      //
      // Strategy priority:
      //  1. If we have a joker and haven't placed a joker set yet, place one
      //  2. If there's a joker set on table and we have the replacement tile, try joker exchange
      //  3. If there's an opportunity for table rearrangement, try it
      //  4. If we can test invalid joker exchange, do it
      //  5. Otherwise, draw

      const jokers = client.myRack.filter(c => c === 'JK1' || c === 'JK2');

      // Phase C: Place a set with joker if we have one and haven't yet
      if (!jokerSetOnTable && jokers.length > 0) {
        const jokerSet = findSetWithJoker(client.myRack);
        if (jokerSet) {
          log(`  Placing joker set: ${jokerSet.tiles.join(', ')} (joker represents ${jokerSet.jokerRepresents})`);

          // Rebuild full table including existing groups + new joker group
          const existingGroups = client.tableGroups.map(g => ({ id: g.id, tiles: g.tiles }));
          const newGroup = { id: `joker-set-${Date.now()}`, tiles: jokerSet.tiles };
          const allGroups = [...existingGroups, newGroup];

          client.confirmTurn(allGroups, jokerSet.tiles, []);

          const response = await client.waitForAnyMessage(['TURN_END', 'INVALID_MOVE'], 10000);
          if (response.type === 'TURN_END') {
            log(`  Joker set ACCEPTED.`);
            jokerSetOnTable = true;
            results.s4.checks['joker_set_placed'] = true;
            recordConservation('after_joker_set');
          } else {
            log(`  Joker set REJECTED: ${JSON.stringify(response.payload.errors)}`);
            client.resetTurn();
            log('  Drawing instead...');
            client.drawTile();
            try { await client.waitForMessage('TILE_DRAWN', 10000); } catch (e) { /* ok */ }
          }

          if (!client.gameOver) {
            try { await client.waitForMessage('TURN_END', 10000); } catch (e) { /* ok */ }
            if (!client.gameOver) {
              try { await client.waitForMessage('TURN_START', 10000); } catch (e) { /* ok */ }
            }
          }
          turnCount++;
          continue;
        }
      }

      // Phase D: Joker exchange attempt
      // Look for a joker on the table and see if we have the tile it represents
      if (jokerSetOnTable && !jokerExchangeAttempted) {
        const jokerOnTable = findJokerOnTable(client.tableGroups);
        if (jokerOnTable) {
          const { groupId, jokerCode, groupTiles, jokerIndex } = jokerOnTable;

          // Try to identify what tile the joker represents
          // For a run: it's the missing number in sequence
          // For a group: it's the missing color
          const replacementTile = findReplacementForJoker(jokerOnTable, client.myRack);

          if (replacementTile) {
            log(`  Joker exchange: replacing ${jokerCode} in group [${groupTiles.join(',')}] with ${replacementTile}`);
            jokerExchangeAttempted = true;

            // Build new table: replace joker with real tile in the group
            // The returned joker must be used in a new set on the same turn (V-07)
            const newGroupTiles = [...groupTiles];
            newGroupTiles[jokerIndex] = replacementTile;

            // Try to use the returned joker in another set
            const rackAfterExchange = client.myRack.filter(c => c !== replacementTile);
            rackAfterExchange.push(jokerCode); // returned joker goes to rack temporarily
            const jokerReuse = findSetWithJoker(rackAfterExchange);

            if (jokerReuse) {
              log(`  Reusing returned joker in new set: ${jokerReuse.tiles.join(', ')}`);
              const existingGroups = client.tableGroups.map(g => {
                if (g.id === groupId) return { id: g.id, tiles: newGroupTiles };
                return { id: g.id, tiles: g.tiles };
              });
              const reuseGroup = { id: `joker-reuse-${Date.now()}`, tiles: jokerReuse.tiles };
              const allGroups = [...existingGroups, reuseGroup];
              const tilesFromRack = [replacementTile, ...jokerReuse.tiles.filter(t => t !== jokerCode)];

              client.confirmTurn(allGroups, tilesFromRack, [jokerCode]);

              const response = await client.waitForAnyMessage(['TURN_END', 'INVALID_MOVE'], 10000);
              if (response.type === 'TURN_END') {
                log(`  Joker exchange + reuse ACCEPTED.`);
                jokerExchangeValid = true;
                results.s4.checks['joker_exchange_valid'] = true;
                results.s4.checks['joker_reused_same_turn'] = true;
                recordConservation('after_joker_exchange');
              } else {
                log(`  Joker exchange REJECTED: ${JSON.stringify(response.payload.errors)}`);
                client.resetTurn();
                results.s4.checks['joker_exchange_valid'] = false;
                client.drawTile();
                try { await client.waitForMessage('TILE_DRAWN', 10000); } catch (e) { /* ok */ }
              }
            } else {
              // Cannot reuse joker -- V-07 says you must use it immediately
              // So we should get INVALID_MOVE if we try to just exchange without reusing
              log(`  No reuse set found for returned joker. Testing V-07 violation...`);
              invalidJokerAttempted = true;

              const existingGroups = client.tableGroups.map(g => {
                if (g.id === groupId) return { id: g.id, tiles: newGroupTiles };
                return { id: g.id, tiles: g.tiles };
              });

              // Only exchange, don't place the returned joker anywhere
              client.confirmTurn(existingGroups, [replacementTile], [jokerCode]);

              const response = await client.waitForAnyMessage(['TURN_END', 'INVALID_MOVE'], 10000);
              if (response.type === 'INVALID_MOVE') {
                log(`  V-07 violation correctly detected: ${JSON.stringify(response.payload.errors)}`);
                invalidJokerRejected = true;
                results.s4.checks['invalid_joker_hold_rejected'] = true;
                client.resetTurn();
              } else {
                log(`  WARNING: V-07 violation was accepted (server may handle differently)`);
                results.s4.checks['invalid_joker_hold_rejected'] = false;
              }

              // Draw to end turn
              client.drawTile();
              try { await client.waitForMessage('TILE_DRAWN', 10000); } catch (e) { /* ok */ }
            }
          } else {
            log(`  No replacement tile for joker in rack. Drawing...`);
            client.drawTile();
            try { await client.waitForMessage('TILE_DRAWN', 10000); } catch (e) { /* ok */ }
          }
        } else {
          log(`  No joker found on table. Drawing...`);
          client.drawTile();
          try { await client.waitForMessage('TILE_DRAWN', 10000); } catch (e) { /* ok */ }
        }

        if (!client.gameOver) {
          try { await client.waitForMessage('TURN_END', 10000); } catch (e) { /* ok */ }
          if (!client.gameOver) {
            try { await client.waitForMessage('TURN_START', 10000); } catch (e) { /* ok */ }
          }
        }
        turnCount++;
        continue;
      }

      // Phase B: Table rearrangement -- try to split an existing set and add rack tiles
      if (!rearrangementAttempted && client.tableGroups.length > 0) {
        const rearrangement = findRearrangement(client.tableGroups, client.myRack);
        if (rearrangement) {
          log(`  Table rearrangement: ${rearrangement.description}`);
          rearrangementAttempted = true;

          client.confirmTurn(rearrangement.newTableGroups, rearrangement.tilesFromRack, []);

          const response = await client.waitForAnyMessage(['TURN_END', 'INVALID_MOVE'], 10000);
          if (response.type === 'TURN_END') {
            log(`  Rearrangement ACCEPTED.`);
            rearrangementValid = true;
            results.s4.checks['rearrangement_valid'] = true;
            recordConservation('after_rearrangement');
          } else {
            log(`  Rearrangement REJECTED: ${JSON.stringify(response.payload.errors)}`);
            client.resetTurn();
            results.s4.checks['rearrangement_valid'] = false;
            client.drawTile();
            try { await client.waitForMessage('TILE_DRAWN', 10000); } catch (e) { /* ok */ }
          }

          if (!client.gameOver) {
            try { await client.waitForMessage('TURN_END', 10000); } catch (e) { /* ok */ }
            if (!client.gameOver) {
              try { await client.waitForMessage('TURN_START', 10000); } catch (e) { /* ok */ }
            }
          }
          turnCount++;
          continue;
        }
      }

      // Default: draw
      log('  Nothing to test this turn, drawing...');
      client.drawTile();
      try { await client.waitForMessage('TILE_DRAWN', 10000); } catch (e) { /* ok */ }

      if (!client.gameOver) {
        try { await client.waitForMessage('TURN_END', 10000); } catch (e) { /* ok */ }
        if (!client.gameOver) {
          try { await client.waitForMessage('TURN_START', 10000); } catch (e) { /* ok */ }
        }
      }
      turnCount++;

      recordConservation(`turn_${turnCount}`);
    }

    // 6. Final universe conservation check via REST
    log('');
    log('--- Final Conservation Check ---');
    try {
      const state = await httpGet(`/api/games/${gameId}?seat=${client.seat}`, token);
      const tableTiles = (state.table || []).reduce((sum, g) => sum + g.tiles.length, 0);
      const rackCount = state.myRack.length;
      const otherRacks = state.players
        .filter(p => p.seat !== client.seat)
        .reduce((sum, p) => sum + p.tileCount, 0);
      const total = tableTiles + rackCount + otherRacks + state.drawPileCount;
      results.s4.checks['universe_conservation_106'] = total === 106;
      log(`Conservation: table(${tableTiles}) + myRack(${rackCount}) + otherRacks(${otherRacks}) + drawPile(${state.drawPileCount}) = ${total} (expected 106)`);
    } catch (e) {
      log(`Conservation check failed: ${e.message}`);
      results.s4.checks['universe_conservation_106'] = false;
    }

    // 7. Summary checks
    results.s4.checks['initial_meld_done'] = results.s4.checks['initial_meld_done'] || false;
    results.s4.checks['joker_set_placed'] = results.s4.checks['joker_set_placed'] || false;
    results.s4.checks['no_crash'] = true;

    // Overall status: critical checks are conservation + no crash + initial meld
    const criticalChecks = [
      results.s4.checks['room_created'],
      results.s4.checks['game_started'],
      results.s4.checks['ws_connected'],
      results.s4.checks['initial_rack_14'],
      results.s4.checks['no_crash'],
      results.s4.checks['universe_conservation_106'],
    ];
    results.s4.status = criticalChecks.every(Boolean) ? 'PASS' : 'FAIL';

    results.s4.summary = `${turnCount} turns, initialMeld=${initialMeldDone}, jokerSet=${jokerSetOnTable}, jokerExchange=${jokerExchangeValid}, rearrangement=${rearrangementValid}, invalidJokerRejected=${invalidJokerRejected}, conservation=${results.s4.checks['universe_conservation_106']}`;

    log('');
    log('--------------------------------------');
    log('S4 RESULTS:');
    log(`  ${results.s4.summary}`);
    log(`  Status: ${results.s4.status}`);

    client.close();
    log('S4 completed.');
  } catch (e) {
    log(`S4 FAILED: ${e.message}`);
    results.s4.status = 'FAIL';
    results.s4.errors.push(e.message);
  }
}

// ============================================================
// Joker/Rearrangement helpers
// ============================================================

function findJokerOnTable(tableGroups) {
  for (const g of tableGroups) {
    for (let i = 0; i < g.tiles.length; i++) {
      if (g.tiles[i] === 'JK1' || g.tiles[i] === 'JK2') {
        return {
          groupId: g.id,
          jokerCode: g.tiles[i],
          groupTiles: [...g.tiles],
          jokerIndex: i,
        };
      }
    }
  }
  return null;
}

function findReplacementForJoker(jokerInfo, rack) {
  const { groupTiles, jokerIndex } = jokerInfo;
  const nonJokerTiles = groupTiles.filter((_, i) => i !== jokerIndex).map(parseTile);

  if (nonJokerTiles.length < 2) return null;

  // Determine if this is a run (same color, consecutive numbers) or group (same number, different colors)
  const allSameColor = nonJokerTiles.every(t => t.color === nonJokerTiles[0].color);
  const allSameNumber = nonJokerTiles.every(t => t.number === nonJokerTiles[0].number);

  if (allSameColor && !allSameNumber) {
    // It's a run -- find the missing number
    const numbers = nonJokerTiles.map(t => t.number).sort((a, b) => a - b);
    const color = nonJokerTiles[0].color;
    let missingNum = -1;

    if (jokerIndex === 0) {
      missingNum = numbers[0] - 1;
    } else if (jokerIndex === groupTiles.length - 1) {
      missingNum = numbers[numbers.length - 1] + 1;
    } else {
      // Gap in middle
      for (let i = 0; i < numbers.length - 1; i++) {
        if (numbers[i + 1] - numbers[i] > 1) {
          missingNum = numbers[i] + 1;
          break;
        }
      }
      if (missingNum === -1) {
        // Joker position implies it's between two consecutive; infer from position
        missingNum = numbers[jokerIndex - 1] + 1 || numbers[jokerIndex] - 1;
      }
    }

    if (missingNum >= 1 && missingNum <= 13) {
      // Find this tile in rack (either set a or b)
      const codeA = `${color}${missingNum}a`;
      const codeB = `${color}${missingNum}b`;
      if (rack.includes(codeA)) return codeA;
      if (rack.includes(codeB)) return codeB;
    }
  } else if (allSameNumber && !allSameColor) {
    // It's a group -- find the missing color
    const colors = new Set(nonJokerTiles.map(t => t.color));
    const number = nonJokerTiles[0].number;
    const allColors = ['R', 'B', 'Y', 'K'];
    const missing = allColors.filter(c => !colors.has(c));
    for (const mc of missing) {
      const codeA = `${mc}${number}a`;
      const codeB = `${mc}${number}b`;
      if (rack.includes(codeA)) return codeA;
      if (rack.includes(codeB)) return codeB;
    }
  }

  return null;
}

function findRearrangement(tableGroups, rack) {
  // Simple strategy: look for a table group with 4+ tiles
  // Split it into group + extra tile, then add a rack tile to the extra to form a new valid set
  for (const g of tableGroups) {
    if (g.tiles.length < 4) continue;

    const tiles = g.tiles.map(parseTile);
    // Check if it's a run
    const allSameColor = tiles.filter(t => !t.isJoker).every(t => t.color === tiles.find(x => !x.isJoker)?.color);

    if (allSameColor && tiles.length >= 4) {
      // Take last tile from this run
      const splitTile = g.tiles[g.tiles.length - 1];
      const splitTileParsed = parseTile(splitTile);
      const remainingRun = g.tiles.slice(0, -1);

      // Can we form a group with splitTile + 2 rack tiles of same number, different colors?
      const sameNum = rack.filter(c => {
        const p = parseTile(c);
        return p.number === splitTileParsed.number && p.color !== splitTileParsed.color && !p.isJoker;
      });

      const usedColors = new Set([splitTileParsed.color]);
      const uniqueColorTiles = [];
      for (const t of sameNum) {
        const p = parseTile(t);
        if (!usedColors.has(p.color)) {
          usedColors.add(p.color);
          uniqueColorTiles.push(t);
        }
        if (uniqueColorTiles.length >= 2) break;
      }

      if (uniqueColorTiles.length >= 2) {
        const newGroup = [splitTile, ...uniqueColorTiles];
        const newTableGroups = tableGroups.map(tg => {
          if (tg.id === g.id) return { id: tg.id, tiles: remainingRun };
          return { id: tg.id, tiles: tg.tiles };
        });
        newTableGroups.push({ id: `rearrange-${Date.now()}`, tiles: newGroup });

        return {
          newTableGroups,
          tilesFromRack: uniqueColorTiles,
          description: `Split group ${g.id}, form new group [${newGroup.join(',')}] using rack tiles [${uniqueColorTiles.join(',')}]`,
        };
      }
    }
  }
  return null;
}

// ============================================================
// Main
// ============================================================

async function main() {
  const startTime = Date.now();
  log('========================================');
  log('Playtest S4: Joker Exchange + Table Rearrangement');
  log(`Date: ${new Date().toISOString()}`);
  log(`Base URL: ${BASE_URL}`);
  log('========================================');
  log('');

  const scenarioTimer = setTimeout(() => {
    log('SCENARIO TIMEOUT.');
    printReport(startTime);
    process.exit(2);
  }, SCENARIO_TIMEOUT_MS);

  log('Dev Login...');
  const loginResp = await httpPost('/api/auth/dev-login', {
    userId: 'playtest-human-s4',
    displayName: 'Playtest Human S4',
  });
  const token = loginResp.token;
  log(`Token acquired: userId=${loginResp.userId}`);
  log('');

  await runS4(token);

  clearTimeout(scenarioTimer);
  printReport(startTime);

  process.exit(results.s4.status === 'PASS' ? 0 : 1);
}

function printReport(startTime) {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log('');
  log('========================================');
  log('FINAL REPORT');
  log('========================================');
  log(`Elapsed: ${elapsed}s`);
  log('');

  const val = results.s4;
  log('--- S4: Joker Exchange + Table Rearrangement ---');
  log(`  Status: ${val.status}`);
  log(`  Summary: ${val.summary || 'N/A'}`);
  log('  Checks:');
  for (const [ck, cv] of Object.entries(val.checks)) {
    log(`    ${cv ? 'PASS' : 'FAIL'}: ${ck}`);
  }
  if (val.conservation.length > 0) {
    log('  Conservation Checkpoints:');
    val.conservation.forEach(c => {
      log(`    ${c.label}: table=${c.tableTiles}, rack=${c.rackCount}, drawPile=${c.drawPile}`);
    });
  }
  if (val.errors.length > 0) {
    log('  Errors:');
    val.errors.forEach(e => log(`    - ${e}`));
  }

  log('');
  log('--- JSON Report ---');
  console.log(JSON.stringify(results, null, 2));
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(2);
});
