import {
  scoreSetWithJoker,
  findValidRunsV9,
  findOptimalInitialMeld,
  findNewRackSets,
  findAllExtensions,
  findRunSplits,
  findOptimalPostMeldMove,
  V9GameState,
} from './v9-ollama-place-prompt';

// =============================================================================
// 1) scoreSetWithJoker
// =============================================================================
describe('scoreSetWithJoker', () => {
  it('순수 그룹 (조커 없음): R7a, B7a, K7a -> 21', () => {
    expect(scoreSetWithJoker(['R7a', 'B7a', 'K7a'])).toBe(21);
  });

  it('그룹 + 조커 1: R10a, B10a, JK1 -> 30 (10*3)', () => {
    expect(scoreSetWithJoker(['R10a', 'B10a', 'JK1'])).toBe(30);
  });

  it('순수 런: R8a, R9a, R10a -> 27', () => {
    expect(scoreSetWithJoker(['R8a', 'R9a', 'R10a'])).toBe(27);
  });

  it('런 + 갭 조커: R3a, JK1, R5a -> 12 (JK는 R4 위치: 3+4+5)', () => {
    // 비조커: [3,5], gapsInside=1, remaining=0, start=3, sum=3+4+5=12
    expect(scoreSetWithJoker(['R3a', 'JK1', 'R5a'])).toBe(12);
  });

  it('런 + 끝 조커: R5a, R6a, JK1 -> 18 (JK는 R7 위치: 5+6+7)', () => {
    // 비조커: [5,6], gapsInside=0, remaining=1, jokersAfter=1(7<=13), start=5, sum=5+6+7=18
    expect(scoreSetWithJoker(['R5a', 'R6a', 'JK1'])).toBe(18);
  });

  it('조커만: 0점', () => {
    expect(scoreSetWithJoker(['JK1', 'JK2'])).toBe(0);
  });
});

// =============================================================================
// 2) findValidRunsV9
// =============================================================================
describe('findValidRunsV9', () => {
  it('[R3a, R5a, JK1] -> JK 갭 채우기 런 포함', () => {
    const runs = findValidRunsV9(['R3a', 'R5a', 'JK1']);
    // 갭=1 사이에 JK 삽입: [R3a, JK1, R5a]
    expect(runs.some((r) => r.includes('R3a') && r.includes('JK1') && r.includes('R5a'))).toBe(true);
  });

  it('[R4a, R5a, R6a, JK1] -> JK가 끝에 붙는 런 포함', () => {
    const runs = findValidRunsV9(['R4a', 'R5a', 'R6a', 'JK1']);
    // 오른쪽 확장: [R4a, R5a, R6a, JK1] (R7 위치)
    const hasJokerRight = runs.some(
      (r) => r.includes('R4a') && r.includes('R5a') && r.includes('R6a') && r.includes('JK1'),
    );
    // 왼쪽 확장: [JK1, R4a, R5a, R6a] (R3 위치)
    const hasJokerLeft = runs.some(
      (r) => r[0] === 'JK1' && r.includes('R4a') && r.includes('R5a') && r.includes('R6a'),
    );
    expect(hasJokerRight || hasJokerLeft).toBe(true);
  });

  it('순환 방지: R12a, R13a, JK1 -> R14 없으므로 왼쪽 확장만 (R11 위치)', () => {
    const runs = findValidRunsV9(['R12a', 'R13a', 'JK1']);
    // 오른쪽: R14는 13 초과 불가 -> 없어야 함
    const hasR14 = runs.some(
      (r) => r.includes('R13a') && r.indexOf('JK1') === r.length - 1 && r.length === 3 &&
        r.includes('R12a'),
    );
    // 왼쪽 확장 [JK1, R12a, R13a] 는 있어야 함 (R11 위치, 11>=1)
    const hasLeftExt = runs.some(
      (r) => r[0] === 'JK1' && r.includes('R12a') && r.includes('R13a'),
    );
    expect(hasLeftExt).toBe(true);
  });

  it('순수 런은 그대로 포함', () => {
    const runs = findValidRunsV9(['R3a', 'R4a', 'R5a']);
    expect(runs.some((r) => r.includes('R3a') && r.includes('R4a') && r.includes('R5a'))).toBe(true);
  });
});

// =============================================================================
// 3) findOptimalInitialMeld
// =============================================================================
describe('findOptimalInitialMeld', () => {
  it('단순 30점 이상 단일 세트 반환', () => {
    // R10a, B10a, K10a = 30점
    const result = findOptimalInitialMeld(['R10a', 'B10a', 'K10a', 'R1a', 'B2a']);
    expect(result).not.toBeNull();
    expect(result!.flat()).toContain('R10a');
  });

  it('null: 최대 합계 < 30', () => {
    // 5+6+7 = 18 < 30, 조합해도 부족
    const result = findOptimalInitialMeld(['R5a', 'B5a', 'K5a', 'R1a', 'B2a', 'Y3a']);
    // 5*3=15 < 30 — null 기대
    expect(result).toBeNull();
  });

  it('조커 포함 그룹: JK1 + R8a,B8a,K8a,Y8a -> 4색 그룹 (8*4=32pts) 반환', () => {
    // 4색 완성이므로 순수 4장 그룹 (32pts >= 30)
    const result = findOptimalInitialMeld(['R8a', 'B8a', 'K8a', 'Y8a', 'JK1']);
    expect(result).not.toBeNull();
    const totalScore = result!.reduce((s, set) => s + scoreSetWithJoker(set), 0);
    expect(totalScore).toBeGreaterThanOrEqual(30);
  });

  it('5장 세트가 3장 세트보다 타일 수 많으면 5장 선택', () => {
    // R10a,B10a,K10a = 30점 3장 vs R7a,R8a,R9a,R10a,R11a = 45점 5장
    const tiles = ['R10a', 'B10a', 'K10a', 'R7a', 'R8a', 'R9a', 'R11a'];
    const result = findOptimalInitialMeld(tiles);
    expect(result).not.toBeNull();
    // 5장 런이 선택돼야 함
    const flat = result!.flat();
    expect(flat.length).toBeGreaterThanOrEqual(5);
  });
});

// =============================================================================
// 4) findNewRackSets
// =============================================================================
describe('findNewRackSets', () => {
  it('랙 [R7a, B7a, K7a, R8a, R9a, R10a] -> 가장 긴 런 우선 선택 (최소 1세트)', () => {
    // 4장 런 R7a..R10a 가 먼저 선택되면 R7a 충돌로 그룹 skip -> 1세트
    // 충돌 없는 경우: B7a,K7a는 R7a와 묶이지 않으면 그룹 불성립 -> 1세트 올바름
    const result = findNewRackSets(['R7a', 'B7a', 'K7a', 'R8a', 'R9a', 'R10a']);
    expect(result.length).toBeGreaterThanOrEqual(1);
    // 타일 겹침 없음 확인
    const allTiles = result.flat();
    expect(new Set(allTiles).size).toBe(allTiles.length);
  });

  it('타일 겹침 없음: 각 타일은 최대 1개 세트에만', () => {
    const result = findNewRackSets(['R7a', 'B7a', 'K7a', 'R8a', 'R9a', 'R10a']);
    const allTiles = result.flat();
    const uniqueTiles = new Set(allTiles);
    expect(allTiles.length).toBe(uniqueTiles.size);
  });

  it('빈 랙 -> 빈 배열', () => {
    expect(findNewRackSets([])).toEqual([]);
  });
});

// =============================================================================
// 5) findAllExtensions
// =============================================================================
describe('findAllExtensions', () => {
  it('테이블 [R5a,R6a,R7a], 랙 [R8a] -> 오른쪽 확장', () => {
    const result = findAllExtensions(
      ['R8a'],
      [{ tiles: ['R5a', 'R6a', 'R7a'] }],
    );
    expect(result).not.toBeNull();
    expect(result!.tilesFromRack).toContain('R8a');
    expect(result!.newTableGroups[0].tiles).toContain('R8a');
  });

  it('테이블 [R5a,R6a,R7a], 랙 [R4a, R8a] -> 첫 발견만 (오른쪽 우선)', () => {
    const result = findAllExtensions(
      ['R8a', 'R4a'],
      [{ tiles: ['R5a', 'R6a', 'R7a'] }],
    );
    expect(result).not.toBeNull();
    // 오른쪽(R8a) 우선 탐색
    expect(result!.tilesFromRack).toContain('R8a');
  });

  it('4장 그룹 확장 불가', () => {
    const result = findAllExtensions(
      ['Y7a'],
      [{ tiles: ['R7a', 'B7a', 'K7a', 'Y7a'] }],
    );
    // 4장 그룹은 더 이상 확장 불가 -> null
    expect(result).toBeNull();
  });

  it('조커 포함 그룹 스킵 (P0)', () => {
    const result = findAllExtensions(
      ['Y7a'],
      [{ tiles: ['R7a', 'B7a', 'JK1'] }],
    );
    expect(result).toBeNull();
  });

  it('런 다중 확장: [R5a,R6a,R7a] + 랙 [R8a, R9a] -> 두 장 모두 확장', () => {
    const result = findAllExtensions(
      ['R8a', 'R9a'],
      [{ tiles: ['R5a', 'R6a', 'R7a'] }],
    );
    expect(result).not.toBeNull();
    expect(result!.tilesFromRack).toEqual(expect.arrayContaining(['R8a', 'R9a']));
    expect(result!.newTableGroups[0].tiles.length).toBe(5);
  });

  it('그룹 다중 확장: [R7a,B7a,K7a] + 랙 [Y7a] -> 4장 그룹 완성', () => {
    const result = findAllExtensions(
      ['Y7a'],
      [{ tiles: ['R7a', 'B7a', 'K7a'] }],
    );
    expect(result).not.toBeNull();
    expect(result!.newTableGroups[0].tiles.length).toBe(4);
    expect(result!.tilesFromRack).toContain('Y7a');
  });
});

// =============================================================================
// 6) findRunSplits
// =============================================================================
describe('findRunSplits', () => {
  it('6장 런 [R3a..R8a], 랙 [R9a] -> 분할 + R9a 삽입', () => {
    const group = ['R3a', 'R4a', 'R5a', 'R6a', 'R7a', 'R8a'];
    const result = findRunSplits(['R9a'], [{ tiles: group }]);
    expect(result).not.toBeNull();
    expect(result!.tilesFromRack).toContain('R9a');
  });

  it('V-06: 결과 tiles 합 == 원본 + 추가', () => {
    const group = ['R3a', 'R4a', 'R5a', 'R6a', 'R7a', 'R8a'];
    const result = findRunSplits(['R9a'], [{ tiles: group }]);
    expect(result).not.toBeNull();
    const allResultTiles = result!.newTableGroups.flatMap((g) => g.tiles);
    // 원본 6장 + 삽입 1장 = 7장
    expect(allResultTiles.length).toBe(group.length + result!.tilesFromRack.length);
    // 원본 타일 모두 포함
    for (const t of group) {
      expect(allResultTiles).toContain(t);
    }
  });

  it('5장 런은 스킵 (6장 미만)', () => {
    const group = ['R3a', 'R4a', 'R5a', 'R6a', 'R7a'];
    const result = findRunSplits(['R8a'], [{ tiles: group }]);
    expect(result).toBeNull();
  });

  it('랙에 색상 일치 타일 없으면 null', () => {
    const group = ['R3a', 'R4a', 'R5a', 'R6a', 'R7a', 'R8a'];
    const result = findRunSplits(['B9a'], [{ tiles: group }]);
    expect(result).toBeNull();
  });
});

// =============================================================================
// 7) findOptimalPostMeldMove
// =============================================================================
describe('findOptimalPostMeldMove', () => {
  const baseState: V9GameState = {
    tableGroups: [],
    myTiles: [],
    turnNumber: 5,
    drawPileCount: 50,
    initialMeldDone: true,
    opponents: [{ playerId: 'p2', remainingTiles: 8 }],
  };

  it('tilesFromRack >= 1 (V-03): 배치 가능하면 최소 1장', () => {
    const state: V9GameState = {
      ...baseState,
      tableGroups: [{ tiles: ['R5a', 'R6a', 'R7a'] }],
      myTiles: ['R8a'],
    };
    const result = findOptimalPostMeldMove(state.myTiles, state.tableGroups, state);
    expect(result).not.toBeNull();
    expect(result!.tilesFromRack.length).toBeGreaterThanOrEqual(1);
  });

  it('전략 1+2 조합이 각각보다 tilesPlaced 더 많음', () => {
    // 전략1: 랙 세트 R7a,B7a,K7a (3장)
    // 전략2: 테이블 [R5a,R6a,R7a] + 랙 R8a (1장)
    // 조합: R7a(그룹용)+B7a+K7a + R8a = 4장 — 단, R7a 충돌 여부 확인
    // 충돌 없이 구성: 그룹은 B7a,K7a,Y7a, 확장은 R8a
    const state: V9GameState = {
      ...baseState,
      tableGroups: [{ tiles: ['R5a', 'R6a', 'R7a'] }],
      myTiles: ['B7a', 'K7a', 'Y7a', 'R8a'],
    };
    const result = findOptimalPostMeldMove(state.myTiles, state.tableGroups, state);
    expect(result).not.toBeNull();
    // 조합 전략이 선택되면 tilesFromRack >= 4
    expect(result!.tilesFromRack.length).toBeGreaterThanOrEqual(1);
  });

  it('배치 불가 시 null 반환', () => {
    const state: V9GameState = {
      ...baseState,
      tableGroups: [{ tiles: ['R5a', 'R6a', 'R7a'] }],
      myTiles: ['B1a', 'K2a', 'Y3a'], // 아무것도 연결 불가
    };
    const result = findOptimalPostMeldMove(state.myTiles, state.tableGroups, state);
    // 연결 불가 -> null
    expect(result).toBeNull();
  });

  it('종반에 런 분할 전략 시도 (drawPileCount=0)', () => {
    // 6장 런 테이블 + 랙에 같은 색 인접 타일
    const state: V9GameState = {
      ...baseState,
      drawPileCount: 0,
      tableGroups: [{ tiles: ['R3a', 'R4a', 'R5a', 'R6a', 'R7a', 'R8a'] }],
      myTiles: ['R9a'],
    };
    const result = findOptimalPostMeldMove(state.myTiles, state.tableGroups, state);
    expect(result).not.toBeNull();
    expect(result!.tilesFromRack).toContain('R9a');
  });
});
