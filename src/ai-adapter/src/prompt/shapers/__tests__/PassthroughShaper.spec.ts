/**
 * PassthroughShaper 단위 테스트.
 *
 * Phase 1 수용 기준 (ADR 44 §10.1):
 *   1. reshape() 출력의 rackView/boardView/historyView 가 입력과 bitwise 동일
 *   2. hints 는 항상 빈 배열
 *   3. Object.freeze(input) 후 reshape() 실행 시 throw 없음
 *   4. 실행 시간 < 50ms (KDP #7 Shaper 예산)
 *   5. 픽스처 3개 (S1 조커 포함, S2 일반 게임, S3 빈 Rack)
 *
 * bitwise 동일성 검증 방식:
 *   buildV2UserPrompt(original_gameState) vs buildV2UserPrompt(shaped_gameState)
 *   PassthroughShaper 는 rack/board/history 를 그대로 통과하므로,
 *   shaped gameState 로 만든 userPrompt 가 original 과 char-by-char 동일해야 한다.
 */

import { PassthroughShaper } from '../PassthroughShaper';
import {
  ShaperInput,
  ShaperOutput,
  ReadonlyTileGroup,
  OpponentAction,
} from '../shaper.types';
import { buildV2UserPrompt } from '../../v2-reasoning-prompt';

// ---------------------------------------------------------------------------
// 헬퍼: ShaperInput 을 buildV2UserPrompt 용 gameState 로 변환
// ---------------------------------------------------------------------------

function shapedToGameState(
  output: ShaperOutput,
): Parameters<typeof buildV2UserPrompt>[0] {
  return {
    tableGroups: output.boardView.map((g) => ({ tiles: [...g.tiles] })),
    myTiles: [...output.rackView],
    turnNumber: 0, // meta 는 별도 — prompt 내용에는 반영 안 되지만 signature 필요
    drawPileCount: 0,
    initialMeldDone: false,
    opponents: output.historyView.map((h) => ({
      playerId: h.playerId,
      remainingTiles: 0,
    })),
  };
}

// ---------------------------------------------------------------------------
// 픽스처
// ---------------------------------------------------------------------------

/** S1: 조커 포함 Rack, Board 1그룹, History 1항목 */
const FIXTURE_S1: ShaperInput = {
  rack: ['R7a', 'B7a', 'JK1', 'K12b', 'Y3a'],
  board: [{ tiles: ['Y5a', 'Y6a', 'Y7a'] }],
  history: [{ playerId: 'player-02', action: 'draw', turnNumber: 3 }],
  meta: {
    turnNumber: 4,
    drawPileCount: 20,
    initialMeldDone: true,
    difficulty: 'expert',
    modelType: 'deepseek-reasoner',
  },
};

/** S2: 조커 없음, Board 2그룹, 상대 2명 */
const FIXTURE_S2: ShaperInput = {
  rack: ['R10a', 'R11a', 'R12a', 'B5b', 'K3a'],
  board: [{ tiles: ['B7a', 'Y7b', 'K7a'] }, { tiles: ['R1a', 'R2a', 'R3a'] }],
  history: [
    { playerId: 'player-02', action: 'place', turnNumber: 2 },
    { playerId: 'player-03', action: 'draw', turnNumber: 2 },
  ],
  meta: {
    turnNumber: 5,
    drawPileCount: 15,
    initialMeldDone: false,
    difficulty: 'intermediate',
    modelType: 'openai',
  },
};

/** S3: 빈 Rack, 빈 Board, 빈 History — 엣지 케이스 */
const FIXTURE_S3: ShaperInput = {
  rack: [],
  board: [],
  history: [],
  meta: {
    turnNumber: 1,
    drawPileCount: 92,
    initialMeldDone: false,
    difficulty: 'beginner',
    modelType: 'ollama',
  },
};

// ---------------------------------------------------------------------------
// 테스트
// ---------------------------------------------------------------------------

describe('PassthroughShaper', () => {
  let shaper: PassthroughShaper;

  beforeEach(() => {
    shaper = new PassthroughShaper();
  });

  // -------------------------------------------------------------------------
  // id 검증
  // -------------------------------------------------------------------------

  it('id 가 "passthrough" 이다', () => {
    expect(shaper.id).toBe('passthrough');
  });

  // -------------------------------------------------------------------------
  // 참조 동일성 (identity) — rack/board/history 가 그대로 반환
  // -------------------------------------------------------------------------

  it('[S1] rackView 는 input.rack 과 동일한 참조를 반환한다', () => {
    const output = shaper.reshape(FIXTURE_S1);
    expect(output.rackView).toBe(FIXTURE_S1.rack);
  });

  it('[S1] boardView 는 input.board 와 동일한 참조를 반환한다', () => {
    const output = shaper.reshape(FIXTURE_S1);
    expect(output.boardView).toBe(FIXTURE_S1.board);
  });

  it('[S1] historyView 는 input.history 와 동일한 참조를 반환한다', () => {
    const output = shaper.reshape(FIXTURE_S1);
    expect(output.historyView).toBe(FIXTURE_S1.history);
  });

  // -------------------------------------------------------------------------
  // hints 항상 빈 배열
  // -------------------------------------------------------------------------

  it('[S1] hints 는 빈 배열이다', () => {
    const output = shaper.reshape(FIXTURE_S1);
    expect(output.hints).toEqual([]);
  });

  it('[S2] hints 는 빈 배열이다', () => {
    const output = shaper.reshape(FIXTURE_S2);
    expect(output.hints).toEqual([]);
  });

  it('[S3] hints 는 빈 배열이다 (빈 Rack 엣지 케이스)', () => {
    const output = shaper.reshape(FIXTURE_S3);
    expect(output.hints).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // bitwise diff 0 — buildV2UserPrompt 출력이 original 과 동일
  // (Phase 1 수용 기준 ADR 44 §10.1 첫 번째 항목)
  // -------------------------------------------------------------------------

  it('[S1] buildV2UserPrompt(shaped) === buildV2UserPrompt(original) — bitwise diff 0', () => {
    const originalGameState = {
      tableGroups: FIXTURE_S1.board.map((g) => ({ tiles: [...g.tiles] })),
      myTiles: [...FIXTURE_S1.rack],
      turnNumber: FIXTURE_S1.meta.turnNumber,
      drawPileCount: FIXTURE_S1.meta.drawPileCount,
      initialMeldDone: FIXTURE_S1.meta.initialMeldDone,
      opponents: FIXTURE_S1.history.map((h) => ({
        playerId: h.playerId,
        remainingTiles: 0,
      })),
    };

    const output = shaper.reshape(FIXTURE_S1);
    const shapedGameState = {
      tableGroups: output.boardView.map((g) => ({ tiles: [...g.tiles] })),
      myTiles: [...output.rackView],
      turnNumber: FIXTURE_S1.meta.turnNumber,
      drawPileCount: FIXTURE_S1.meta.drawPileCount,
      initialMeldDone: FIXTURE_S1.meta.initialMeldDone,
      opponents: output.historyView.map((h) => ({
        playerId: h.playerId,
        remainingTiles: 0,
      })),
    };

    const originalPrompt = buildV2UserPrompt(originalGameState);
    const shapedPrompt = buildV2UserPrompt(shapedGameState);

    // 글자 수 비교 (byte 수준 동일성)
    expect(shapedPrompt.length).toBe(originalPrompt.length);
    // 내용 완전 일치
    expect(shapedPrompt).toBe(originalPrompt);
  });

  it('[S2] buildV2UserPrompt(shaped) === buildV2UserPrompt(original) — bitwise diff 0', () => {
    const originalGameState = {
      tableGroups: FIXTURE_S2.board.map((g) => ({ tiles: [...g.tiles] })),
      myTiles: [...FIXTURE_S2.rack],
      turnNumber: FIXTURE_S2.meta.turnNumber,
      drawPileCount: FIXTURE_S2.meta.drawPileCount,
      initialMeldDone: FIXTURE_S2.meta.initialMeldDone,
      opponents: FIXTURE_S2.history.map((h) => ({
        playerId: h.playerId,
        remainingTiles: 0,
      })),
    };

    const output = shaper.reshape(FIXTURE_S2);
    const shapedGameState = {
      tableGroups: output.boardView.map((g) => ({ tiles: [...g.tiles] })),
      myTiles: [...output.rackView],
      turnNumber: FIXTURE_S2.meta.turnNumber,
      drawPileCount: FIXTURE_S2.meta.drawPileCount,
      initialMeldDone: FIXTURE_S2.meta.initialMeldDone,
      opponents: output.historyView.map((h) => ({
        playerId: h.playerId,
        remainingTiles: 0,
      })),
    };

    expect(buildV2UserPrompt(shapedGameState)).toBe(
      buildV2UserPrompt(originalGameState),
    );
  });

  it('[S3] 빈 상태에서도 buildV2UserPrompt 출력이 동일하다', () => {
    const originalGameState = {
      tableGroups: [],
      myTiles: [],
      turnNumber: FIXTURE_S3.meta.turnNumber,
      drawPileCount: FIXTURE_S3.meta.drawPileCount,
      initialMeldDone: FIXTURE_S3.meta.initialMeldDone,
      opponents: [],
    };

    const output = shaper.reshape(FIXTURE_S3);
    const shapedGameState = {
      tableGroups: [],
      myTiles: [...output.rackView],
      turnNumber: FIXTURE_S3.meta.turnNumber,
      drawPileCount: FIXTURE_S3.meta.drawPileCount,
      initialMeldDone: FIXTURE_S3.meta.initialMeldDone,
      opponents: [],
    };

    expect(buildV2UserPrompt(shapedGameState)).toBe(
      buildV2UserPrompt(originalGameState),
    );
  });

  // -------------------------------------------------------------------------
  // Object.freeze(input) 후 throw 없음 (ADR 44 §5.2 Immutability 조항)
  // -------------------------------------------------------------------------

  it('[S1] Object.freeze(input) 후 reshape() 실행 시 throw 없음', () => {
    const frozenInput = Object.freeze({
      ...FIXTURE_S1,
      rack: Object.freeze([...FIXTURE_S1.rack]),
      board: Object.freeze(
        FIXTURE_S1.board.map((g) =>
          Object.freeze({
            tiles: Object.freeze([...g.tiles]) as readonly string[],
          }),
        ) as readonly ReadonlyTileGroup[],
      ),
      history: Object.freeze(
        FIXTURE_S1.history.map((h) => Object.freeze({ ...h })),
      ) as readonly OpponentAction[],
    }) as ShaperInput;

    expect(() => shaper.reshape(frozenInput)).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // 실행 시간 < 50ms (KDP #7 Shaper 예산)
  // -------------------------------------------------------------------------

  it('[S1] reshape() 실행 시간이 50ms 미만이다', () => {
    const start = performance.now();
    shaper.reshape(FIXTURE_S1);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it('[S2] reshape() 실행 시간이 50ms 미만이다', () => {
    const start = performance.now();
    shaper.reshape(FIXTURE_S2);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  // -------------------------------------------------------------------------
  // Non-empty guarantee (ADR 44 §5.2)
  // -------------------------------------------------------------------------

  it('[S1] reshape() 는 undefined/null 을 반환하지 않는다', () => {
    const output = shaper.reshape(FIXTURE_S1);
    expect(output).toBeDefined();
    expect(output.rackView).toBeDefined();
    expect(output.boardView).toBeDefined();
    expect(output.historyView).toBeDefined();
    expect(output.hints).toBeDefined();
  });

  it('[S3] 빈 입력에서도 reshape() 는 모든 배열 필드가 정의된다', () => {
    const output = shaper.reshape(FIXTURE_S3);
    expect(Array.isArray(output.rackView)).toBe(true);
    expect(Array.isArray(output.boardView)).toBe(true);
    expect(Array.isArray(output.historyView)).toBe(true);
    expect(Array.isArray(output.hints)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Tile preservation (ADR 44 §5.2) — rackView 원소 집합 불변
  // -------------------------------------------------------------------------

  it('[S1] rackView 원소 집합이 rack 과 동일하다 (permutation 불변)', () => {
    const output = shaper.reshape(FIXTURE_S1);
    expect([...output.rackView].sort()).toEqual([...FIXTURE_S1.rack].sort());
  });

  it('[S2] boardView 그룹 수가 board 와 동일하다', () => {
    const output = shaper.reshape(FIXTURE_S2);
    expect(output.boardView.length).toBe(FIXTURE_S2.board.length);
  });
});
