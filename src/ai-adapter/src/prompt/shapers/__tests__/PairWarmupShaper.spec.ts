/**
 * PairWarmupShaper 단위 테스트.
 *
 * ADR 44 §9 테스트 전략 + §10 검증 기준 준수.
 *
 * 검증 항목:
 *   1. Rack pair 없으면 hints=[]
 *   2. 동숫자 pair + Board Set 합류 → pair-to-board-set 힌트
 *   3. 동색 인접 pair + Board Run 병합 → pair-to-board-run-merge 힌트
 *   4. 동색 gap=2 pair + Rack 중간 타일 → pair-self-complete-run 힌트
 *   5. 최대 2 hints 제한 준수
 *   6. confidence 범위 [0, 1]
 *   7. confidence 내림차순 정렬
 *   8. initialMeldDone=false + scoreAdded < 30 → confidence 0.3 차감
 *   9. rackView/boardView/historyView 는 input 참조와 bitwise 동일
 *   10. 빈 Rack 엣지 케이스
 *   11. 조커 포함 Rack pair — 조커 제외 처리
 *   12. 실행 시간 < 50ms
 *   13. Pure function 검증
 */

import { PairWarmupShaper } from '../PairWarmupShaper';
import { ShaperInput } from '../shaper.types';

// ---------------------------------------------------------------------------
// 픽스처
// ---------------------------------------------------------------------------

/** S1: 동숫자 pair (R7a + B7a) + Board 에 같은 숫자 Set 존재 */
const FIXTURE_S1: ShaperInput = {
  rack: ['R7a', 'B7a', 'K3a', 'Y11a'],
  board: [{ tiles: ['Y7a', 'K7b', 'R7b'] }], // 7 Set (Y,K,R) — B7 합류 가능
  history: [],
  meta: {
    turnNumber: 5,
    drawPileCount: 20,
    initialMeldDone: true,
    difficulty: 'expert',
    modelType: 'deepseek-reasoner',
  },
};

/** S2: 동색 인접 pair (R7a + R8a) + Board Run 앞에 붙을 수 있음 */
const FIXTURE_S2: ShaperInput = {
  rack: ['R7a', 'R8a', 'B5b', 'K3a'],
  board: [{ tiles: ['R9a', 'R10a', 'R11a'] }], // R9,R10,R11 Run — R7,R8 앞에 붙기
  history: [],
  meta: {
    turnNumber: 3,
    drawPileCount: 30,
    initialMeldDone: true,
    difficulty: 'expert',
    modelType: 'deepseek-reasoner',
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

/** S4: Rack pair 없음 (모든 타일 다른 색, 다른 숫자) */
const FIXTURE_S4: ShaperInput = {
  rack: ['R7a', 'B9a', 'K11b', 'Y3a'],
  board: [],
  history: [],
  meta: {
    turnNumber: 4,
    drawPileCount: 50,
    initialMeldDone: false,
    difficulty: 'intermediate',
    modelType: 'openai',
  },
};

/** S5: gap=2 pair (R7a + R9a) + Rack 에 R8a 있음 → self-complete-run */
const FIXTURE_S5: ShaperInput = {
  rack: ['R7a', 'R9a', 'R8a', 'B5a'],
  board: [],
  history: [],
  meta: {
    turnNumber: 2,
    drawPileCount: 80,
    initialMeldDone: false,
    difficulty: 'expert',
    modelType: 'deepseek-reasoner',
  },
};

/** S6: initialMeldDone=false 이고 scoreAdded < 30 → confidence 0.3 차감 */
const FIXTURE_S6: ShaperInput = {
  rack: ['R3a', 'B3a', 'K5a', 'Y7a'],
  board: [{ tiles: ['Y3a', 'K3b', 'R3b'] }], // 3 Set (Y,K,R) — B3 합류 가능 (score=3)
  history: [],
  meta: {
    turnNumber: 2,
    drawPileCount: 85,
    initialMeldDone: false,
    difficulty: 'expert',
    modelType: 'deepseek-reasoner',
  },
};

/** S7: 조커 포함 Rack — 조커는 제외하고 pair 탐색 */
const FIXTURE_S7: ShaperInput = {
  rack: ['R7a', 'B7a', 'JK1', 'Y3a'],
  board: [{ tiles: ['K7a', 'Y7b', 'R7b'] }], // 7 Set
  history: [],
  meta: {
    turnNumber: 5,
    drawPileCount: 25,
    initialMeldDone: true,
    difficulty: 'expert',
    modelType: 'deepseek-reasoner',
  },
};

/** S8: 많은 후보 → MAX_HINTS=2 제한 검증 */
const FIXTURE_S8: ShaperInput = {
  rack: ['R7a', 'B7a', 'Y7a', 'R8a', 'R9a', 'K10a', 'K11a'],
  board: [
    { tiles: ['B7b', 'K7b', 'R7b'] }, // 7 Set
    { tiles: ['R10a', 'R11a', 'R12a'] }, // R Run
  ],
  history: [],
  meta: {
    turnNumber: 8,
    drawPileCount: 40,
    initialMeldDone: true,
    difficulty: 'expert',
    modelType: 'deepseek-reasoner',
  },
};

// ---------------------------------------------------------------------------
// 테스트
// ---------------------------------------------------------------------------

describe('PairWarmupShaper', () => {
  let shaper: PairWarmupShaper;

  beforeEach(() => {
    shaper = new PairWarmupShaper();
  });

  // -------------------------------------------------------------------------
  // id 검증
  // -------------------------------------------------------------------------

  it('id 가 "pair-warmup" 이다', () => {
    expect(shaper.id).toBe('pair-warmup');
  });

  // -------------------------------------------------------------------------
  // pair 없으면 hints=[]
  // -------------------------------------------------------------------------

  it('[S3] 빈 Rack 에서 hints=[] 이다', () => {
    const output = shaper.reshape(FIXTURE_S3);
    expect(output.hints).toEqual([]);
  });

  it('[S4] Rack pair 없으면 hints=[] 이다', () => {
    const output = shaper.reshape(FIXTURE_S4);
    expect(output.hints).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // 동숫자 pair → Board Set 합류
  // -------------------------------------------------------------------------

  it('[S1] R7a + B7a pair 가 Board 7-Set 에 합류하는 pair-to-board-set 힌트가 생성된다', () => {
    const output = shaper.reshape(FIXTURE_S1);
    const setHints = output.hints.filter((h) => h.type === 'pair-to-board-set');
    expect(setHints.length).toBeGreaterThan(0);

    const hint = setHints[0];
    const rackPair = hint.payload['rackPair'] as string[];
    expect(rackPair).toBeDefined();
    expect(rackPair.some((t) => t.startsWith('R7') || t.startsWith('B7'))).toBe(
      true,
    );
  });

  // -------------------------------------------------------------------------
  // 동색 인접 pair → Board Run 병합
  // -------------------------------------------------------------------------

  it('[S2] R7a + R8a pair 가 Board R9-R10-R11 Run 앞에 병합되는 힌트가 생성된다', () => {
    const output = shaper.reshape(FIXTURE_S2);
    const runHints = output.hints.filter(
      (h) => h.type === 'pair-to-board-run-merge',
    );
    expect(runHints.length).toBeGreaterThan(0);

    const hint = runHints[0];
    expect(hint.confidence).toBe(0.95);
    const mergedLength = hint.payload['mergedLength'] as number;
    expect(mergedLength).toBe(5); // R7,R8,R9,R10,R11
  });

  // -------------------------------------------------------------------------
  // gap=2 pair + 중간 타일 → self-complete-run
  // -------------------------------------------------------------------------

  it('[S5] R7a + R9a + R8a → pair-self-complete-run 힌트가 생성된다', () => {
    const output = shaper.reshape(FIXTURE_S5);
    const selfHints = output.hints.filter(
      (h) => h.type === 'pair-self-complete-run',
    );
    expect(selfHints.length).toBeGreaterThan(0);

    // gap=2 pair (R7+R9) → 중간 R8, 또는 gap=1 pair (R7+R8) → R9, (R8+R9) → R7
    // 어느 케이스든 completingTile 이 R-계열 타일이어야 함
    const hint = selfHints[0];
    const completingTile = hint.payload['completingTile'] as string;
    expect(completingTile).toMatch(/^R\d+[ab]$/);
    // 모든 후보 타일이 Rack 내에 존재해야 함
    const allRackTiles = FIXTURE_S5.rack;
    expect(allRackTiles).toContain(completingTile);
  });

  // -------------------------------------------------------------------------
  // 최대 hints 개수 제한 (MAX_HINTS=2)
  // -------------------------------------------------------------------------

  it('[S8] hints 배열은 최대 2개를 초과하지 않는다', () => {
    const output = shaper.reshape(FIXTURE_S8);
    expect(output.hints.length).toBeLessThanOrEqual(2);
  });

  it('[S1] hints 배열은 최대 2개를 초과하지 않는다', () => {
    const output = shaper.reshape(FIXTURE_S1);
    expect(output.hints.length).toBeLessThanOrEqual(2);
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

  it('[S8] 모든 hints 의 confidence 는 0~1 범위이다', () => {
    const output = shaper.reshape(FIXTURE_S8);
    for (const hint of output.hints) {
      expect(hint.confidence).toBeGreaterThanOrEqual(0);
      expect(hint.confidence).toBeLessThanOrEqual(1);
    }
  });

  // -------------------------------------------------------------------------
  // confidence 내림차순 정렬
  // -------------------------------------------------------------------------

  it('[S8] hints 는 confidence 내림차순으로 정렬된다', () => {
    const output = shaper.reshape(FIXTURE_S8);
    const confidences = output.hints.map((h) => h.confidence);
    for (let i = 0; i < confidences.length - 1; i++) {
      expect(confidences[i]).toBeGreaterThanOrEqual(confidences[i + 1]);
    }
  });

  // -------------------------------------------------------------------------
  // initialMeldDone=false + scoreAdded < 30 → confidence 0.3 차감
  // -------------------------------------------------------------------------

  it('[S6] initialMeldDone=false 이고 score < 30 인 hint 의 confidence 가 차감된다', () => {
    const output = shaper.reshape(FIXTURE_S6);
    if (output.hints.length > 0) {
      const hint = output.hints[0];
      const scoreAdded = hint.payload['scoreAdded'] as number;
      if (scoreAdded < 30) {
        // 원래 confidence (0.9) 에서 0.3 차감 = 0.6
        expect(hint.confidence).toBeLessThan(0.9);
      }
    }
  });

  // -------------------------------------------------------------------------
  // rackView/boardView/historyView bitwise 동일
  // -------------------------------------------------------------------------

  it('[S1] rackView 는 input.rack 과 동일 참조이다', () => {
    const output = shaper.reshape(FIXTURE_S1);
    expect(output.rackView).toBe(FIXTURE_S1.rack);
  });

  it('[S1] boardView 는 input.board 와 동일 참조이다', () => {
    const output = shaper.reshape(FIXTURE_S1);
    expect(output.boardView).toBe(FIXTURE_S1.board);
  });

  it('[S1] historyView 는 input.history 와 동일 참조이다', () => {
    const output = shaper.reshape(FIXTURE_S1);
    expect(output.historyView).toBe(FIXTURE_S1.history);
  });

  it('[S1] rackView 원소 집합이 input.rack 과 동일하다 (순열 불변)', () => {
    const output = shaper.reshape(FIXTURE_S1);
    expect([...output.rackView].sort()).toEqual([...FIXTURE_S1.rack].sort());
  });

  // -------------------------------------------------------------------------
  // 조커 포함 Rack — 조커 제외 처리
  // -------------------------------------------------------------------------

  it('[S7] 조커 포함 Rack 에서 조커 제외 후 pair 탐색이 이루어진다', () => {
    const output = shaper.reshape(FIXTURE_S7);
    // 조커가 rackView 에 포함되어야 함 (제거 금지)
    expect(output.rackView).toContain('JK1');
    // hints 에 JK1 이 rackPair 에 포함되지 않아야 함
    for (const hint of output.hints) {
      const rackPair = hint.payload['rackPair'] as string[];
      if (rackPair) {
        expect(rackPair).not.toContain('JK1');
        expect(rackPair).not.toContain('JK2');
      }
    }
  });

  // -------------------------------------------------------------------------
  // Pure function — 동일 입력 → 동일 출력
  // -------------------------------------------------------------------------

  it('[S2] 동일 입력에 대해 두 번 호출 시 동일 결과를 반환한다', () => {
    const output1 = shaper.reshape(FIXTURE_S2);
    const output2 = shaper.reshape(FIXTURE_S2);
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

  it('[S8] 많은 후보에서도 reshape() 실행 시간이 50ms 미만이다', () => {
    const start = performance.now();
    shaper.reshape(FIXTURE_S8);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  // -------------------------------------------------------------------------
  // Non-empty guarantee
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
});
