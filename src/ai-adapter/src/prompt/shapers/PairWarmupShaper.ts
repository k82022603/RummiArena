/**
 * PairWarmupShaper — F2(Pair 인식 실패) 대응 Shaper.
 *
 * 설계: docs/02-design/44-context-shaper-v6-architecture.md §7.3
 *
 * 목적:
 *   Rack 에 "동색 인접수 2장" (R7a + R8a) 또는 "동숫자 다른 색 2장" (R7a + B7a) 이 있을 때,
 *   Board 의 기존 Set/Run 에 합류 가능 여부를 사전 계산하여 LLM 이 Pair 를 draw 대상이 아니라
 *   place 대상으로 인식하도록 힌트를 주입.
 *
 * 알고리즘 (ADR 44 §7.3):
 *   Phase A — Rack 에서 Pair 추출 (O(|rack|²))
 *   Phase B — Board 매칭 — Set Pair 의 Board 합류 가능성 (O(|board| × |numberPairs|))
 *   Phase C — Board 매칭 — Color Pair 의 Run 연장 가능성 (O(|board| × |colorPairs|))
 *   Phase D — Independent Run 후보 (Pair 만으로 Run 형성 대기)
 *   Phase E — 우선순위 + 토큰 예산
 *
 * 시간 복잡도: O(|rack|² + |board|² + |colorPairs|×|board|) — < 8ms
 * 토큰 예산: 최대 2 hints × ~70 토큰 = ~140 토큰
 *
 * 실험 타깃:
 *   - deepseek-reasoner × v2 × pair-warmup (Phase 5 N=3)
 *   - env: DEEPSEEK_REASONER_CONTEXT_SHAPER=pair-warmup
 */

import {
  ContextShaper,
  ShaperInput,
  ShaperOutput,
  ShaperHint,
} from './shaper.types';
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

interface Pair {
  readonly tiles: [Tile, Tile];
  readonly mode: 'same-color' | 'same-number';
  /** same-color Pair 의 경우 number 차이 (1 or 2), same-number 의 경우 0 */
  readonly gap: number;
}

interface PairHint extends ShaperHint {
  type:
    | 'pair-to-board-set'
    | 'pair-to-board-run-merge'
    | 'pair-self-complete-run';
  payload: {
    rackPair: readonly string[];
    boardGroupIndex?: number;
    joinable?: string;
    mergedLength?: number;
    completingTile?: string;
    scoreAdded: number;
  };
  readonly confidence: number;
}

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

const MAX_HINTS = 2;
/** 토큰 예산: 2 hints × ~70 토큰 = 140 토큰 */
const TOKEN_BUDGET = 140;
/** hint 1개당 예상 토큰 수 */
const TOKENS_PER_HINT = 70;

// ---------------------------------------------------------------------------
// PairWarmupShaper
// ---------------------------------------------------------------------------

export class PairWarmupShaper implements ContextShaper {
  readonly id = 'pair-warmup' as const;

  /**
   * Rack 의 Pair 를 Board 와 매칭하여 합류/연장 힌트를 생성한다.
   * ADR 44 §7.3 Phase A~E 순서 준수.
   */
  reshape(input: ShaperInput): ShaperOutput {
    // Phase A — Rack 에서 조커 제외 파싱
    const rackNoJoker = input.rack.filter((t) => !JOKER_TILES.has(t));
    const parsed: Tile[] = rackNoJoker
      .map((t) => parseTileSafe(t))
      .filter((t): t is Tile => t !== null);

    // Rack 이 비어있거나 Pair 를 구성할 타일 없으면 passthrough
    if (parsed.length < 2) {
      return {
        rackView: input.rack,
        boardView: input.board,
        historyView: input.history,
        hints: [],
      };
    }

    // Phase A.3 — colorPairs: 동색 인접수 / 간격 2
    const colorPairs = this.extractColorPairs(parsed);
    // Phase A.4 — numberPairs: 동숫자 다른 색 2장
    const numberPairs = this.extractNumberPairs(parsed);

    const hints: PairHint[] = [
      // Phase B — Set Pair → Board Set 합류
      ...this.matchBoardSets(numberPairs, input),
      // Phase C — Color Pair → Board Run 연장
      ...this.matchBoardRuns(colorPairs, input),
      // Phase D — Color Pair 자체 완성 Run
      ...this.findSelfCompleteRuns(colorPairs, parsed),
    ];

    // Phase E — Initial Meld 점수 페널티 적용
    const adjusted = this.applyInitialMeldPenalty(
      hints,
      input.meta.initialMeldDone,
    );

    const top = adjusted
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, MAX_HINTS);

    return {
      rackView: input.rack,
      boardView: input.board,
      historyView: input.history,
      hints: this.enforceTokenBudget(top, TOKEN_BUDGET),
    };
  }

  // ---------------------------------------------------------------------------
  // Phase A.3 — colorPairs (동색, 인접 또는 간격 2)
  // ---------------------------------------------------------------------------

  private extractColorPairs(parsed: Tile[]): Pair[] {
    const results: Pair[] = [];

    const byColor = new Map<TileColor, Tile[]>();
    for (const tile of parsed) {
      const arr = byColor.get(tile.color) ?? [];
      arr.push(tile);
      byColor.set(tile.color, arr);
    }

    for (const [, tiles] of byColor) {
      const sorted = [...tiles].sort((a, b) => a.number - b.number);

      for (let i = 0; i < sorted.length - 1; i++) {
        const a = sorted[i];
        const b = sorted[i + 1];
        const gap = b.number - a.number;

        // gap === 1(인접) 또는 gap === 2(간격 1) 만 유효한 Pair
        if (gap === 1 || gap === 2) {
          results.push({
            tiles: [a, b],
            mode: 'same-color',
            gap,
          });
        }
      }
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Phase A.4 — numberPairs (동숫자, 다른 색 2장)
  // ---------------------------------------------------------------------------

  private extractNumberPairs(parsed: Tile[]): Pair[] {
    const results: Pair[] = [];

    const byNumber = new Map<number, Tile[]>();
    for (const tile of parsed) {
      const arr = byNumber.get(tile.number) ?? [];
      arr.push(tile);
      byNumber.set(tile.number, arr);
    }

    for (const [, tiles] of byNumber) {
      // 색상이 다른 2장 이상 필요
      const uniqueColors = new Map<TileColor, Tile>();
      for (const tile of tiles) {
        if (!uniqueColors.has(tile.color)) {
          uniqueColors.set(tile.color, tile);
        }
      }

      if (uniqueColors.size >= 2) {
        const colorTiles = Array.from(uniqueColors.values());
        // 첫 2장으로 pair 구성
        results.push({
          tiles: [colorTiles[0], colorTiles[1]],
          mode: 'same-number',
          gap: 0,
        });
      }
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Phase B — numberPairs → Board Set 합류
  // ---------------------------------------------------------------------------

  private matchBoardSets(numberPairs: Pair[], input: ShaperInput): PairHint[] {
    const results: PairHint[] = [];
    const classified = classifyGroups(input.board);

    for (const numPair of numberPairs) {
      const pairNumber = numPair.tiles[0].number;

      for (const group of classified) {
        if (group.type !== 'set') continue;
        if (group.setNumber !== pairNumber) continue;

        // Board Set 에 이미 있는 색상
        const boardColors = new Set(
          group.tiles
            .filter((t) => !JOKER_TILES.has(t))
            .map((t) => parseTileSafe(t)?.color)
            .filter((c): c is TileColor => c !== undefined),
        );

        // Pair 타일 중 Board 에 없는 색상 → 합류 가능
        const joinable = numPair.tiles.find((t) => !boardColors.has(t.color));
        if (!joinable) continue;

        // 이미 4장이면 추가 불가
        if (group.tiles.length >= 4) continue;

        results.push({
          type: 'pair-to-board-set',
          payload: {
            rackPair: numPair.tiles.map((t) => t.code),
            boardGroupIndex: group.index,
            joinable: joinable.code,
            scoreAdded: pairNumber,
          },
          confidence: 0.9,
        });
      }
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Phase C — colorPairs → Board Run 연장/병합
  // ---------------------------------------------------------------------------

  private matchBoardRuns(colorPairs: Pair[], input: ShaperInput): PairHint[] {
    const results: PairHint[] = [];
    const classified = classifyGroups(input.board);

    for (const colPair of colorPairs) {
      const [t1, t2] = colPair.tiles;
      const pairColor = t1.color;

      for (const group of classified) {
        if (group.type !== 'run') continue;
        if (group.runColor !== pairColor) continue;
        if (!group.runRange) continue;

        const runHead = group.runRange.min;
        const runTail = group.runRange.max;

        // 케이스: Pair 가 Run 앞에 붙을 수 있는가?
        // 예: rack [R7,R8] + board [R9,R10,R11] → pair 의 max+1 === runHead
        if (t2.number + 1 === runHead) {
          results.push({
            type: 'pair-to-board-run-merge',
            payload: {
              rackPair: [t1.code, t2.code],
              boardGroupIndex: group.index,
              mergedLength: 2 + group.tiles.length,
              scoreAdded: t1.number + t2.number,
            },
            confidence: 0.95,
          });
        }

        // 케이스: Pair 가 Run 뒤에 붙을 수 있는가?
        // 예: rack [R8,R9] + board [R5,R6,R7] → pair 의 min-1 === runTail
        if (t1.number - 1 === runTail) {
          results.push({
            type: 'pair-to-board-run-merge',
            payload: {
              rackPair: [t1.code, t2.code],
              boardGroupIndex: group.index,
              mergedLength: group.tiles.length + 2,
              scoreAdded: t1.number + t2.number,
            },
            confidence: 0.95,
          });
        }
      }
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Phase D — colorPairs 자체 완성 Run (Rack 내 3번째 타일)
  // ---------------------------------------------------------------------------

  /**
   * gap === 2 인 colorPair (예: R7+R9) 에서 Rack 에 중간 타일 (R8) 이 있으면
   * 바로 Run 완성 가능 → 높은 confidence 힌트.
   *
   * gap === 1 인 colorPair (R7+R8) 에서 Rack 에 R6 또는 R9 가 있으면 Run 완성.
   */
  private findSelfCompleteRuns(
    colorPairs: Pair[],
    allParsed: Tile[],
  ): PairHint[] {
    const results: PairHint[] = [];

    for (const colPair of colorPairs) {
      const [t1, t2] = colPair.tiles;
      const color = t1.color;

      if (colPair.gap === 2) {
        // 중간 타일 찾기
        const midNum = t1.number + 1;
        const middleTile = allParsed.find(
          (t) =>
            t.color === color &&
            t.number === midNum &&
            t.code !== t1.code &&
            t.code !== t2.code,
        );
        if (middleTile) {
          results.push({
            type: 'pair-self-complete-run',
            payload: {
              rackPair: [t1.code, t2.code],
              completingTile: middleTile.code,
              scoreAdded: t1.number + midNum + t2.number,
            },
            confidence: 0.85,
          });
        }
      } else if (colPair.gap === 1) {
        // 앞 타일 (t1.number - 1)
        if (t1.number - 1 >= 1) {
          const prevNum = t1.number - 1;
          const prevTile = allParsed.find(
            (t) =>
              t.color === color &&
              t.number === prevNum &&
              t.code !== t1.code &&
              t.code !== t2.code,
          );
          if (prevTile) {
            results.push({
              type: 'pair-self-complete-run',
              payload: {
                rackPair: [t1.code, t2.code],
                completingTile: prevTile.code,
                scoreAdded: prevNum + t1.number + t2.number,
              },
              confidence: 0.85,
            });
          }
        }

        // 뒤 타일 (t2.number + 1)
        if (t2.number + 1 <= 13) {
          const nextNum = t2.number + 1;
          const nextTile = allParsed.find(
            (t) =>
              t.color === color &&
              t.number === nextNum &&
              t.code !== t1.code &&
              t.code !== t2.code,
          );
          if (nextTile) {
            results.push({
              type: 'pair-self-complete-run',
              payload: {
                rackPair: [t1.code, t2.code],
                completingTile: nextTile.code,
                scoreAdded: t1.number + t2.number + nextNum,
              },
              confidence: 0.85,
            });
          }
        }
      }
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Phase E.10 — Initial Meld 점수 페널티
  // ---------------------------------------------------------------------------

  /**
   * initialMeldDone=false 인 경우 scoreAdded < 30 인 hint 의 confidence 를 0.3 차감.
   * LLM 이 30점 달성 조합에만 집중하도록 유도.
   * ADR 44 §7.3.5 F5 확장 통합.
   */
  private applyInitialMeldPenalty(
    hints: PairHint[],
    initialMeldDone: boolean,
  ): PairHint[] {
    if (initialMeldDone) return hints;

    return hints.map((h) => {
      if (h.payload.scoreAdded < 30) {
        return {
          ...h,
          confidence: Math.max(0, h.confidence - 0.3),
        };
      }
      return h;
    });
  }

  // ---------------------------------------------------------------------------
  // 토큰 예산 강제
  // ---------------------------------------------------------------------------

  private enforceTokenBudget(hints: PairHint[], budget: number): PairHint[] {
    const result: PairHint[] = [];
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
export const pairWarmupShaper = new PairWarmupShaper();
