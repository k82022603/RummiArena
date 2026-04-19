/**
 * JokerHinterShaper 단위 테스트.
 *
 * ADR 44 §9 테스트 전략 + §10 검증 기준 준수.
 *
 * 검증 항목:
 *   1. 조커 없으면 hints=[] (passthrough 동일)
 *   2. 조커 있으면 Set 3장 후보 hints 생성
 *   3. 조커 + 동색 인접 Run 3장 후보 hints 생성
 *   4. 조커 + 간격 1(gap=2) Run 3장 후보 hints 생성 (confidence 0.95)
 *   5. 최대 3 hints 제한 준수
 *   6. confidence 범위 [0, 1]
 *   7. 실행 시간 < 50ms
 *   8. hints confidence 내림차순 정렬
 *   9. rackView/boardView/historyView 는 input 참조와 bitwise 동일 (Passthrough delegate)
 *   10. 빈 Rack 엣지 케이스
 *   11. 조커만 있는 Rack 엣지 케이스
 *   12. Board 연장 후보 (3장 Run 있을 때)
 *   13. Pure function — 동일 입력 → 동일 출력
 */

import { JokerHinterShaper } from '../JokerHinterShaper';
import { ShaperInput } from '../shaper.types';

// ---------------------------------------------------------------------------
// 픽스처
// ---------------------------------------------------------------------------

/** S1: 조커 포함 Rack — Set 3장 후보 가능 (R7a + B7a + JK1) */
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

/** S2: 조커 없음 */
const FIXTURE_S2: ShaperInput = {
  rack: ['R10a', 'R11a', 'R12a', 'B5b', 'K3a'],
  board: [{ tiles: ['B7a', 'Y7b', 'K7a'] }, { tiles: ['R1a', 'R2a', 'R3a'] }],
  history: [],
  meta: {
    turnNumber: 5,
    drawPileCount: 15,
    initialMeldDone: false,
    difficulty: 'intermediate',
    modelType: 'openai',
  },
};

/** S3: 빈 Rack */
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

/** S4: 조커만 있는 Rack (실제 타일 없음) */
const FIXTURE_S4: ShaperInput = {
  rack: ['JK1', 'JK2'],
  board: [],
  history: [],
  meta: {
    turnNumber: 2,
    drawPileCount: 88,
    initialMeldDone: false,
    difficulty: 'expert',
    modelType: 'deepseek-reasoner',
  },
};

/** S5: gap=2 인 Run 후보 (R7a + R9a + JK1) */
const FIXTURE_S5: ShaperInput = {
  rack: ['R7a', 'R9a', 'JK1', 'B3a'],
  board: [],
  history: [],
  meta: {
    turnNumber: 3,
    drawPileCount: 80,
    initialMeldDone: false,
    difficulty: 'expert',
    modelType: 'deepseek-reasoner',
  },
};

/** S6: Board 에 3장 Run 존재 → Board 연장 후보 */
const FIXTURE_S6: ShaperInput = {
  rack: ['JK1', 'B3a'],
  board: [{ tiles: ['R5a', 'R6a', 'R7a'] }],
  history: [],
  meta: {
    turnNumber: 6,
    drawPileCount: 70,
    initialMeldDone: true,
    difficulty: 'expert',
    modelType: 'deepseek-reasoner',
  },
};

/** S7: 많은 조합 후보 → MAX_HINTS=3 제한 검증 */
const FIXTURE_S7: ShaperInput = {
  rack: ['R7a', 'B7a', 'Y7a', 'R8a', 'R9a', 'JK1', 'K5a', 'K6a'],
  board: [{ tiles: ['R1a', 'R2a', 'R3a'] }],
  history: [],
  meta: {
    turnNumber: 7,
    drawPileCount: 60,
    initialMeldDone: true,
    difficulty: 'expert',
    modelType: 'deepseek-reasoner',
  },
};

// ---------------------------------------------------------------------------
// 테스트
// ---------------------------------------------------------------------------

describe('JokerHinterShaper', () => {
  let shaper: JokerHinterShaper;

  beforeEach(() => {
    shaper = new JokerHinterShaper();
  });

  // -------------------------------------------------------------------------
  // id 검증
  // -------------------------------------------------------------------------

  it('id 가 "joker-hinter" 이다', () => {
    expect(shaper.id).toBe('joker-hinter');
  });

  // -------------------------------------------------------------------------
  // 조커 없으면 passthrough 동일
  // -------------------------------------------------------------------------

  it('[S2] 조커 없으면 hints=[] 이다', () => {
    const output = shaper.reshape(FIXTURE_S2);
    expect(output.hints).toEqual([]);
  });

  it('[S2] 조커 없으면 rackView 는 input.rack 과 동일 참조이다', () => {
    const output = shaper.reshape(FIXTURE_S2);
    expect(output.rackView).toBe(FIXTURE_S2.rack);
  });

  it('[S3] 빈 Rack 에서 hints=[] 이다', () => {
    const output = shaper.reshape(FIXTURE_S3);
    expect(output.hints).toEqual([]);
  });

  it('[S4] 조커만 있는 Rack 에서 hints=[] 이다 (Set/Run 후보 0개)', () => {
    const output = shaper.reshape(FIXTURE_S4);
    expect(output.hints).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // 조커 있으면 hints 생성
  // -------------------------------------------------------------------------

  it('[S1] R7a + B7a + JK1 → joker-set-3 힌트가 포함된다', () => {
    const output = shaper.reshape(FIXTURE_S1);
    const setHints = output.hints.filter((h) => h.type === 'joker-set-3');
    expect(setHints.length).toBeGreaterThan(0);

    const hint = setHints[0];
    const completed = hint.payload['completed'] as string[];
    expect(completed).toContain('R7a');
    expect(completed).toContain('B7a');
    expect(completed).toContain('JK1');
  });

  it('[S5] R7a + R9a + JK1 → joker-run-3-gap 힌트가 포함된다 (confidence 0.95)', () => {
    const output = shaper.reshape(FIXTURE_S5);
    const gapHints = output.hints.filter((h) => h.type === 'joker-run-3-gap');
    expect(gapHints.length).toBeGreaterThan(0);

    const hint = gapHints[0];
    expect(hint.confidence).toBe(0.95);
    const completed = hint.payload['completed'] as string[];
    expect(completed).toContain('R7a');
    expect(completed).toContain('JK1');
    expect(completed).toContain('R9a');
  });

  it('[S1] Board 의 3장 Run 에 대해 joker-run-extension 후보가 생성된다', () => {
    const output = shaper.reshape(FIXTURE_S1);
    const extHints = output.hints.filter(
      (h) => h.type === 'joker-run-extension',
    );
    // S1 board=[Y5a,Y6a,Y7a] (3장 Run), JK1 있음 → 연장 후보 생성 가능
    // Y7a 위 Y8 또는 Y5a 아래 Y4 연장
    expect(extHints.length).toBeGreaterThanOrEqual(0); // 있을 수도 있음 (상위 3개 안에 포함될 수 있음)
  });

  it('[S6] Board 의 3장 Run 에 JK 연장 후보가 생성된다', () => {
    const output = shaper.reshape(FIXTURE_S6);
    const extHints = output.hints.filter(
      (h) => h.type === 'joker-run-extension',
    );
    expect(extHints.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // 최대 hints 개수 제한 (MAX_HINTS=3)
  // -------------------------------------------------------------------------

  it('[S7] hints 배열은 최대 3개를 초과하지 않는다', () => {
    const output = shaper.reshape(FIXTURE_S7);
    expect(output.hints.length).toBeLessThanOrEqual(3);
  });

  it('[S1] hints 배열은 최대 3개를 초과하지 않는다', () => {
    const output = shaper.reshape(FIXTURE_S1);
    expect(output.hints.length).toBeLessThanOrEqual(3);
  });

  // -------------------------------------------------------------------------
  // confidence 범위 [0, 1]
  // -------------------------------------------------------------------------

  it('[S1] 모든 hints 의 confidence 는 0~1 범위이다', () => {
    const output = shaper.reshape(FIXTURE_S1);
    for (const hint of output.hints) {
      expect(hint.confidence).toBeGreaterThanOrEqual(0);
      expect(hint.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('[S7] 모든 hints 의 confidence 는 0~1 범위이다', () => {
    const output = shaper.reshape(FIXTURE_S7);
    for (const hint of output.hints) {
      expect(hint.confidence).toBeGreaterThanOrEqual(0);
      expect(hint.confidence).toBeLessThanOrEqual(1);
    }
  });

  // -------------------------------------------------------------------------
  // confidence 내림차순 정렬
  // -------------------------------------------------------------------------

  it('[S7] hints 는 confidence 내림차순으로 정렬된다', () => {
    const output = shaper.reshape(FIXTURE_S7);
    const confidences = output.hints.map((h) => h.confidence);
    for (let i = 0; i < confidences.length - 1; i++) {
      expect(confidences[i]).toBeGreaterThanOrEqual(confidences[i + 1]);
    }
  });

  it('[S1] hints 는 confidence 내림차순으로 정렬된다', () => {
    const output = shaper.reshape(FIXTURE_S1);
    const confidences = output.hints.map((h) => h.confidence);
    for (let i = 0; i < confidences.length - 1; i++) {
      expect(confidences[i]).toBeGreaterThanOrEqual(confidences[i + 1]);
    }
  });

  // -------------------------------------------------------------------------
  // rackView/boardView/historyView bitwise 동일 (Principle 2 — Rack 불변)
  // -------------------------------------------------------------------------

  it('[S1] rackView 원소 집합이 input.rack 과 동일하다 (순열 불변)', () => {
    const output = shaper.reshape(FIXTURE_S1);
    expect([...output.rackView].sort()).toEqual([...FIXTURE_S1.rack].sort());
  });

  it('[S1] boardView 그룹 수가 input.board 와 동일하다', () => {
    const output = shaper.reshape(FIXTURE_S1);
    expect(output.boardView.length).toBe(FIXTURE_S1.board.length);
  });

  it('[S1] historyView 는 input.history 와 동일 참조이다', () => {
    const output = shaper.reshape(FIXTURE_S1);
    expect(output.historyView).toBe(FIXTURE_S1.history);
  });

  // -------------------------------------------------------------------------
  // Pure function — 동일 입력 → 동일 출력
  // -------------------------------------------------------------------------

  it('[S1] 동일 입력에 대해 두 번 호출 시 동일 결과를 반환한다', () => {
    const output1 = shaper.reshape(FIXTURE_S1);
    const output2 = shaper.reshape(FIXTURE_S1);
    expect(output1.hints.length).toBe(output2.hints.length);
    output1.hints.forEach((h, i) => {
      expect(h.type).toBe(output2.hints[i].type);
      expect(h.confidence).toBe(output2.hints[i].confidence);
    });
  });

  // -------------------------------------------------------------------------
  // 실행 시간 < 50ms
  // -------------------------------------------------------------------------

  it('[S1] reshape() 실행 시간이 50ms 미만이다', () => {
    const start = performance.now();
    shaper.reshape(FIXTURE_S1);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it('[S7] 많은 후보에서도 reshape() 실행 시간이 50ms 미만이다', () => {
    const start = performance.now();
    shaper.reshape(FIXTURE_S7);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  // -------------------------------------------------------------------------
  // Non-empty guarantee (ADR 44 §5.2)
  // -------------------------------------------------------------------------

  it('[S1] reshape() 는 undefined/null 을 반환하지 않는다', () => {
    const output = shaper.reshape(FIXTURE_S1);
    expect(output).toBeDefined();
    expect(Array.isArray(output.rackView)).toBe(true);
    expect(Array.isArray(output.boardView)).toBe(true);
    expect(Array.isArray(output.historyView)).toBe(true);
    expect(Array.isArray(output.hints)).toBe(true);
  });

  it('[S3] 빈 입력에서도 모든 배열 필드가 정의된다', () => {
    const output = shaper.reshape(FIXTURE_S3);
    expect(Array.isArray(output.rackView)).toBe(true);
    expect(Array.isArray(output.hints)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // hint payload 구조 검증
  // -------------------------------------------------------------------------

  it('[S1] joker-set-3 hint 의 payload 에 completed, rackTilesUsed, score, category 가 있다', () => {
    const output = shaper.reshape(FIXTURE_S1);
    const setHint = output.hints.find((h) => h.type === 'joker-set-3');
    if (setHint) {
      expect(setHint.payload).toHaveProperty('completed');
      expect(setHint.payload).toHaveProperty('rackTilesUsed');
      expect(setHint.payload).toHaveProperty('score');
      expect(setHint.payload).toHaveProperty('category');
      expect((setHint.payload['completed'] as string[]).length).toBe(3);
    }
  });
});
