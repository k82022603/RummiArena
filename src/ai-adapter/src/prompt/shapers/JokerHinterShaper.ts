/**
 * JokerHinterShaper — F1(조커 활용 부족) 대응 Shaper.
 *
 * 설계: docs/02-design/44-context-shaper-v6-architecture.md §7.2
 *
 * 목적:
 *   Rack 에 JK1/JK2 가 있을 때, LLM 이 매턴 반복하는 "조커로 어떤 Set/Run 완성 가능한가"
 *   탐색을 사전 계산하여 hints 에 주입 → 토큰당 추론 효율 향상.
 *
 * 알고리즘 (ADR 44 §7.2):
 *   Phase A — 조커 스캔 (O(|rack|))
 *   Phase B — 조커 제외 Rack 분석 (O(|rack|²))
 *   Phase C — Set 3장 완성 후보 탐색 (O(13))
 *   Phase D — Run 3장 완성 후보 탐색 (O(|byColor| × 11))
 *   Phase E — Board 연장 후보 (O(|board|))
 *   Phase F — 상위 3개 선별 + 토큰 예산 검증
 *
 * 시간 복잡도: O(|rack|² + |board|) — |rack| ≤ 14, |board| ≤ 20 → < 5ms
 * 토큰 예산: 최대 3 hints × ~60 토큰 = ~180 토큰
 *
 * 실험 타깃:
 *   - deepseek-reasoner × v2 × joker-hinter (Phase 4 N=1 pilot)
 *   - env: DEEPSEEK_REASONER_CONTEXT_SHAPER=joker-hinter
 */

import {
  ContextShaper,
  ShaperInput,
  ShaperOutput,
  ShaperHint,
} from './shaper.types';
import { passthroughShaper } from './PassthroughShaper';
import {
  Tile,
  JOKER_TILES,
  parseTileSafe,
  classifyGroups,
  TileColor,
} from '../tile-utils';

// ---------------------------------------------------------------------------
// 내부 타입
// ---------------------------------------------------------------------------

interface JokerCandidate extends ShaperHint {
  type:
    | 'joker-set-3'
    | 'joker-run-3-adjacent'
    | 'joker-run-3-gap'
    | 'joker-run-extension';
  payload: {
    completed: readonly string[];
    rackTilesUsed: readonly string[];
    score: number;
    category: 'set-3' | 'run-3' | 'run-ext';
  };
  readonly confidence: number;
}

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

const MAX_HINTS = 3;
/** 토큰 예산: 3 hints × ~60 토큰 = 180 토큰 */
const TOKEN_BUDGET = 180;
/** hint 1개당 예상 토큰 수 (rough estimate) */
const TOKENS_PER_HINT = 60;

// ---------------------------------------------------------------------------
// JokerHinterShaper
// ---------------------------------------------------------------------------

export class JokerHinterShaper implements ContextShaper {
  readonly id = 'joker-hinter' as const;

  /**
   * 조커 보유 여부에 따라 사전 계산된 힌트를 주입한다.
   * 조커 없으면 PassthroughShaper 로 즉시 위임.
   *
   * ADR 44 §7.2 Phase A~F 순서 준수.
   */
  reshape(input: ShaperInput): ShaperOutput {
    // Phase A — 조커 스캔
    const jokers = input.rack.filter((t) => JOKER_TILES.has(t));
    if (jokers.length === 0) {
      return passthroughShaper.reshape(input);
    }

    // Phase B — 조커 제외 Rack 분석
    const rackMinusJokers = input.rack.filter((t) => !JOKER_TILES.has(t));
    const parsed: Tile[] = rackMinusJokers
      .map((t) => parseTileSafe(t))
      .filter((t): t is Tile => t !== null);

    const candidates: JokerCandidate[] = [
      // Phase C — Set 3장 완성 후보
      ...this.findSetCandidates(parsed),
      // Phase D — Run 3장 완성 후보
      ...this.findRunCandidates(parsed),
      // Phase E — Board 연장 후보
      ...this.findBoardExtensions(parsed, input),
    ];

    // Phase F — 상위 3개 선별 + 토큰 예산
    const top = candidates
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, MAX_HINTS);
    const withinBudget = this.enforceTokenBudget(top, TOKEN_BUDGET);

    return {
      rackView: input.rack,
      boardView: input.board,
      historyView: input.history,
      hints: withinBudget,
    };
  }

  // ---------------------------------------------------------------------------
  // Phase C — Set 3장 완성 후보 탐색
  // ---------------------------------------------------------------------------

  /**
   * 동일 숫자 2장 + 조커 1장 → Set 3장 완성 후보.
   * byNumber 그룹에서 2장 이상인 숫자만 검사. O(13 × |rack|).
   */
  private findSetCandidates(rack: Tile[]): JokerCandidate[] {
    const results: JokerCandidate[] = [];

    // byNumber 맵 구성
    const byNumber = new Map<number, Tile[]>();
    for (const tile of rack) {
      const arr = byNumber.get(tile.number) ?? [];
      arr.push(tile);
      byNumber.set(tile.number, arr);
    }

    for (const [number, tiles] of byNumber) {
      if (tiles.length < 2) continue;

      // 색상 중복 없는 쌍 추출 (최대 2장 사용)
      const colorsInPair = new Set<TileColor>();
      const usedTiles: Tile[] = [];

      for (const tile of tiles) {
        if (!colorsInPair.has(tile.color)) {
          colorsInPair.add(tile.color);
          usedTiles.push(tile);
          if (usedTiles.length === 2) break;
        }
      }

      if (usedTiles.length < 2) continue;

      const score = number * 3; // 3장 모두 동일 숫자
      const confidence = score >= 10 ? 0.9 : 0.7;

      results.push({
        type: 'joker-set-3',
        payload: {
          completed: [...usedTiles.map((t) => t.code), 'JK1'],
          rackTilesUsed: usedTiles.map((t) => t.code),
          score,
          category: 'set-3',
        },
        confidence,
      });
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Phase D — Run 3장 완성 후보 탐색
  // ---------------------------------------------------------------------------

  /**
   * 동색 연속 2장(간격 1) 또는 간격 2 타일 쌍 + 조커 1장 → Run 3장.
   * O(|byColor| × |sameColor|²).
   */
  private findRunCandidates(rack: Tile[]): JokerCandidate[] {
    const results: JokerCandidate[] = [];

    // byColor 맵 구성
    const byColor = new Map<TileColor, Tile[]>();
    for (const tile of rack) {
      const arr = byColor.get(tile.color) ?? [];
      arr.push(tile);
      byColor.set(tile.color, arr);
    }

    for (const [, tiles] of byColor) {
      // 숫자 오름차순 정렬 (중복 숫자 허용)
      const sorted = [...tiles].sort((a, b) => a.number - b.number);

      for (let i = 0; i < sorted.length - 1; i++) {
        const curr = sorted[i];
        const next = sorted[i + 1];
        const diff = next.number - curr.number;

        if (diff === 1) {
          // 인접 2장 → JK 가 curr-1 또는 next+1 을 채움
          // 낮은 쪽 연장 (curr.number - 1 >= 1)
          if (curr.number - 1 >= 1) {
            const score = curr.number - 1 + curr.number + next.number;
            results.push({
              type: 'joker-run-3-adjacent',
              payload: {
                completed: ['JK1', curr.code, next.code],
                rackTilesUsed: [curr.code, next.code],
                score,
                category: 'run-3',
              },
              confidence: 0.85,
            });
          }
          // 높은 쪽 연장 (next.number + 1 <= 13)
          if (next.number + 1 <= 13) {
            const score = curr.number + next.number + (next.number + 1);
            results.push({
              type: 'joker-run-3-adjacent',
              payload: {
                completed: [curr.code, next.code, 'JK1'],
                rackTilesUsed: [curr.code, next.code],
                score,
                category: 'run-3',
              },
              confidence: 0.85,
            });
          }
        } else if (diff === 2) {
          // 간격 1 → JK 가 정확히 중간 슬롯 채움 (가장 명확)
          const midNum = curr.number + 1;
          const score = curr.number + midNum + next.number;
          results.push({
            type: 'joker-run-3-gap',
            payload: {
              completed: [curr.code, 'JK1', next.code],
              rackTilesUsed: [curr.code, next.code],
              score,
              category: 'run-3',
            },
            confidence: 0.95, // 유일한 채움 위치 → 가장 명확
          });
        }
      }
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Phase E — Board 연장 후보
  // ---------------------------------------------------------------------------

  /**
   * Board 의 3장 Run 양끝을 조커로 연장하는 후보.
   * O(|board|).
   */
  private findBoardExtensions(
    _rack: Tile[],
    input: ShaperInput,
  ): JokerCandidate[] {
    const results: JokerCandidate[] = [];
    const classified = classifyGroups(input.board);

    for (const group of classified) {
      if (group.type !== 'run') continue;
      if (group.tiles.length !== 3) continue; // 정확히 3장인 Run 만
      if (!group.runRange || !group.runColor) continue;

      const { min, max } = group.runRange;

      // 높은 쪽 연장 (max + 1 <= 13)
      if (max + 1 <= 13) {
        results.push({
          type: 'joker-run-extension',
          payload: {
            completed: [...group.tiles, 'JK1'],
            rackTilesUsed: [],
            score: min + (min + 1) + (min + 2) + (max + 1),
            category: 'run-ext',
          },
          confidence: 0.6,
        });
      }

      // 낮은 쪽 연장 (min - 1 >= 1)
      if (min - 1 >= 1) {
        results.push({
          type: 'joker-run-extension',
          payload: {
            completed: ['JK1', ...group.tiles],
            rackTilesUsed: [],
            score: min - 1 + min + (min + 1) + (min + 2),
            category: 'run-ext',
          },
          confidence: 0.6,
        });
      }
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Phase F — 토큰 예산 강제
  // ---------------------------------------------------------------------------

  /**
   * hints 총 예상 토큰 수가 budget 를 초과하면 마지막 항목부터 제거.
   */
  private enforceTokenBudget(
    hints: JokerCandidate[],
    budget: number,
  ): JokerCandidate[] {
    const result: JokerCandidate[] = [];
    let used = 0;
    for (const h of hints) {
      if (used + TOKENS_PER_HINT > budget) break;
      result.push(h);
      used += TOKENS_PER_HINT;
    }
    return result;
  }
}

/** 싱글턴 인스턴스 */
export const jokerHinterShaper = new JokerHinterShaper();
