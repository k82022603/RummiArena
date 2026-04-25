/**
 * 드래그 종료 상태 전이 순수 리듀서
 *
 * GameClient.tsx:730-1287 의 handleDragEnd 분기 로직을 100% 순수 함수로 추출한 것.
 * 테스트 가능성 + 대량 시나리오 검증을 위해 분리한다.
 *
 * 작성: 2026-04-24 22:30 KST, Claude main (Opus 4.7 xhigh)
 * 발단: 사용자 Turn#11 보드 그룹 중복 복제 사고 (docs/04-testing/84)
 * 설계 원칙:
 *   1. 모든 분기가 `setPendingTableGroups` 출력 직전 `detectDuplicateTileCodes` 방어선 통과
 *   2. table→table 이동에 `isCompatibleWithGroup` 사전검사 강제
 *   3. 입력 → 출력 단일 전이, 재진입/pointer re-fire 처리는 상위 레이어 책임
 *   4. reject 사유 열거 가능 (사용자 토스트 + 디버그 로그 일관화)
 */

import type { TileCode, TableGroup, TileNumber, TileColor } from "@/types/tile";
import { parseTileCode } from "@/types/tile";
import { isCompatibleWithGroup } from "@/lib/mergeCompatibility";
import { detectDuplicateTileCodes, removeFirstOccurrence } from "@/lib/tileStateHelpers";
// RDX-05: classifySetType, tryJokerSwap 중복 정의 제거 → 단일 SSOT 파일에서 import
import { classifySetType } from "@/lib/tileClassify";
import { tryJokerSwap } from "@/lib/jokerSwap";
// 하위 호환 re-export: 기존 테스트/코드가 dragEndReducer에서 import하는 경우를 위해
export { classifySetType } from "@/lib/tileClassify";
export { tryJokerSwap } from "@/lib/jokerSwap";
export type { JokerSwapResult } from "@/lib/jokerSwap";

// ---------------------------------------------------------------------------
// 리듀서 입력 / 출력 타입
// ---------------------------------------------------------------------------

export interface DragReducerState {
  tableGroups: TableGroup[];
  myTiles: TileCode[];
  pendingGroupIds: Set<string>;
  pendingRecoveredJokers: TileCode[];
  hasInitialMeld: boolean;
  forceNewGroup: boolean;
  /** 현재까지 생성된 pending 그룹 시퀀스 (ID 생성용 단조 카운터) */
  pendingGroupSeq: number;
}

export type DragSource =
  | { kind: "rack" }
  | { kind: "table"; groupId: string; index: number };

export interface DragInput {
  source: DragSource;
  tileCode: TileCode;
  overId: string;
  /** Date.now() 또는 테스트 주입 ms */
  now: number;
}

export type RejectReason =
  | "no-op-self-drop"
  | "cannot-return-server-tile"
  | "initial-meld-required"
  | "target-not-found"
  | "target-equals-source"
  | "index-mismatch"
  | "incompatible-merge"           // 가설 A 수정
  | "duplicate-detected"           // 가설 B/C 방어선
  | "not-my-turn"
  | "no-drop-position"
  | "invalid-tile"
  | "source-not-found";

export interface DragOutput {
  nextTableGroups: TableGroup[] | null;  // null = pending 초기화
  nextMyTiles: TileCode[] | null;
  nextPendingGroupIds: Set<string>;
  nextPendingRecoveredJokers: TileCode[];
  nextPendingGroupSeq: number;
  addedJoker?: TileCode;
  removedJoker?: TileCode;
  /** reject 시 이유 + 상태 변경 없음 */
  rejected?: RejectReason;
  /** 사용자에게 보여줄 경고 (예: 초기 등록 전 서버 그룹 드롭 시 토스트) */
  warning?: "extend-lock-before-initial-meld";
  /** 디버그용 branch tag */
  branch: string;
}

// ---------------------------------------------------------------------------
// 메인 리듀서
// ---------------------------------------------------------------------------

export function dragEndReducer(state: DragReducerState, input: DragInput): DragOutput {
  const {
    tableGroups,
    myTiles,
    pendingGroupIds,
    pendingRecoveredJokers,
    hasInitialMeld,
    forceNewGroup,
    pendingGroupSeq,
  } = state;
  const { source, tileCode, overId, now } = input;

  const defaults = {
    nextTableGroups: tableGroups,
    nextMyTiles: myTiles,
    nextPendingGroupIds: pendingGroupIds,
    nextPendingRecoveredJokers: pendingRecoveredJokers,
    nextPendingGroupSeq: pendingGroupSeq,
  };

  const makeNewGroupId = (seq: number) => `pending-${now}-${seq}`;

  const rejectWith = (reason: RejectReason, branch: string): DragOutput => ({
    ...defaults,
    rejected: reason,
    branch,
  });

  // ======================================================================
  // table → ? 분기
  // ======================================================================
  if (source.kind === "table") {
    const sourceGroup = tableGroups.find((g) => g.id === source.groupId);
    if (!sourceGroup) return rejectWith("source-not-found", "table:source-missing");

    const sourceIsPending = pendingGroupIds.has(source.groupId);

    if (overId === source.groupId) {
      return rejectWith("no-op-self-drop", "table:self-drop");
    }

    // ---- table → rack ----
    if (overId === "player-rack") {
      if (!sourceIsPending) {
        return rejectWith("cannot-return-server-tile", "table→rack:server-locked");
      }
      const baseTiles = [...sourceGroup.tiles];
      if (baseTiles[source.index] !== tileCode) {
        return rejectWith("index-mismatch", "table→rack:index-mismatch");
      }
      baseTiles.splice(source.index, 1);

      const updated = tableGroups
        .map((g) =>
          g.id === source.groupId
            ? { ...g, tiles: baseTiles, type: classifySetType(baseTiles) }
            : g
        )
        .filter((g) => g.tiles.length > 0);

      const stillHasPending = updated.some((g) => pendingGroupIds.has(g.id));
      const nextIds = stillHasPending
        ? new Set([...pendingGroupIds].filter((id) => updated.some((g) => g.id === id)))
        : new Set<string>();

      return {
        ...defaults,
        nextTableGroups: stillHasPending ? updated : null,
        nextMyTiles: [...myTiles, tileCode],
        nextPendingGroupIds: nextIds,
        branch: "table→rack:ok",
      };
    }

    // ---- table → table ----
    if (!hasInitialMeld) {
      return rejectWith("initial-meld-required", "table→table:initial-meld-lock");
    }
    const targetGroup = tableGroups.find((g) => g.id === overId);
    if (!targetGroup) return rejectWith("target-not-found", "table→table:no-target");
    if (targetGroup.id === sourceGroup.id) {
      return rejectWith("target-equals-source", "table→table:same-group");
    }

    const updatedSourceTiles = [...sourceGroup.tiles];
    if (updatedSourceTiles[source.index] !== tileCode) {
      return rejectWith("index-mismatch", "table→table:index-mismatch");
    }
    updatedSourceTiles.splice(source.index, 1);

    // RDX-01 [SSOT 56 §3.6]: A5(pending→pending), A6(pending→server), A9(server→server)
    // 모두 이 분기를 통과한다. 타겟이 pending이든 서버이든 호환성 검사를 수행한다.
    // COMPAT 시만 허용 — pending→pending 재배치도 호환성 불일치 시 거절 (INC-T11-DUP 재발 방지).
    const targetIsPending = pendingGroupIds.has(targetGroup.id);
    if (!isCompatibleWithGroup(tileCode, targetGroup)) {
      const branch = targetIsPending
        ? "table→table:incompatible-pending"
        : "table→table:incompatible-server";
      return rejectWith("incompatible-merge", branch);
    }

    const updatedTargetTiles = [...targetGroup.tiles, tileCode];
    const nextTableGroups = tableGroups
      .map((g) => {
        if (g.id === sourceGroup.id) {
          return { ...g, tiles: updatedSourceTiles, type: classifySetType(updatedSourceTiles) };
        }
        if (g.id === targetGroup.id) {
          return { ...g, tiles: updatedTargetTiles, type: classifySetType(updatedTargetTiles) };
        }
        return g;
      })
      .filter((g) => g.tiles.length > 0);

    // ★ 가설 B/C 방어선: 중복 타일 검출
    const dupes = detectDuplicateTileCodes(nextTableGroups);
    if (dupes.length > 0) {
      return rejectWith("duplicate-detected", "table→table:dup-guard");
    }

    const nextGroupIdSet = new Set(nextTableGroups.map((g) => g.id));
    const nextPendingGroupIds = new Set(
      [...pendingGroupIds, targetGroup.id].filter((id) => nextGroupIdSet.has(id))
    );

    return {
      ...defaults,
      nextTableGroups,
      nextPendingGroupIds,
      branch: "table→table:ok",
    };
  }

  // ======================================================================
  // rack → ? 분기
  // ======================================================================

  // ---- rack → player-rack (자기 랙으로) — no-op ----
  if (overId === "player-rack") {
    // 보드의 pending 그룹에서 동일 tile code 를 1개 회수한다 (서버 보호)
    const sourceGroupIdx = tableGroups.findIndex(
      (g) => pendingGroupIds.has(g.id) && g.tiles.includes(tileCode)
    );
    if (sourceGroupIdx < 0) {
      // 실제로 회수할 곳이 없음 (랙→랙 드래그의 의미 없는 케이스)
      return rejectWith("source-not-found", "rack→rack:no-source");
    }

    const updated = tableGroups
      .map((g, idx) =>
        idx !== sourceGroupIdx
          ? g
          : { ...g, tiles: removeFirstOccurrence(g.tiles, tileCode), type: classifySetType(removeFirstOccurrence(g.tiles, tileCode)) }
      )
      .filter((g) => g.tiles.length > 0);

    const stillHasPending = updated.some((g) => pendingGroupIds.has(g.id));
    const nextIds = stillHasPending
      ? new Set([...pendingGroupIds].filter((id) => updated.some((g) => g.id === id)))
      : new Set<string>();

    return {
      ...defaults,
      nextTableGroups: stillHasPending ? updated : null,
      nextMyTiles: [...myTiles, tileCode],
      nextPendingGroupIds: nextIds,
      branch: "rack→rack:recover-pending",
    };
  }

  // ---- rack → 조커 교체 시도 ----
  const swapCandidate = tableGroups.find((g) => g.id === overId);
  if (swapCandidate) {
    const hasJoker = swapCandidate.tiles.some((t) => t === "JK1" || t === "JK2");
    if (hasJoker) {
      const isPending = pendingGroupIds.has(swapCandidate.id);
      if (isPending || hasInitialMeld) {
        const swap = tryJokerSwap(swapCandidate.tiles, tileCode);
        if (swap) {
          const nextTableGroups = tableGroups.map((g) =>
            g.id === swapCandidate.id
              ? { ...g, tiles: swap.nextTiles, type: classifySetType(swap.nextTiles) }
              : g
          );
          const dupes = detectDuplicateTileCodes(nextTableGroups);
          if (dupes.length > 0) {
            return rejectWith("duplicate-detected", "rack→joker-swap:dup-guard");
          }
          const nextMyTiles = [
            ...removeFirstOccurrence(myTiles, tileCode),
            swap.recoveredJoker,
          ];
          const nextPendingGroupIds = new Set([...pendingGroupIds, swapCandidate.id]);
          const nextPendingRecoveredJokers = [...pendingRecoveredJokers, swap.recoveredJoker];
          return {
            ...defaults,
            nextTableGroups,
            nextMyTiles,
            nextPendingGroupIds,
            nextPendingRecoveredJokers,
            addedJoker: swap.recoveredJoker,
            branch: "rack→joker-swap:ok",
          };
        }
      }
    }
  }

  // ---- rack → pending 그룹 드롭 ----
  const existingPendingGroup = tableGroups.find(
    (g) => g.id === overId && pendingGroupIds.has(g.id)
  );
  if (existingPendingGroup) {
    if (!isCompatibleWithGroup(tileCode, existingPendingGroup)) {
      // 호환 안 되면 새 그룹 생성
      const nextSeq = pendingGroupSeq + 1;
      const newGroupId = makeNewGroupId(nextSeq);
      const newGroup: TableGroup = {
        id: newGroupId,
        tiles: [tileCode],
        type: classifySetType([tileCode]),
      };
      const nextTableGroups = [...tableGroups, newGroup];
      const dupes = detectDuplicateTileCodes(nextTableGroups);
      if (dupes.length > 0) {
        return rejectWith("duplicate-detected", "rack→pending-incompat:dup-guard");
      }
      const nextMyTiles = removeFirstOccurrence(myTiles, tileCode);
      const nextPendingGroupIds = new Set([...pendingGroupIds, newGroupId]);
      const nextPendingRecoveredJokers = pendingRecoveredJokers.includes(tileCode)
        ? pendingRecoveredJokers.filter((j) => j !== tileCode)
        : pendingRecoveredJokers;
      return {
        ...defaults,
        nextTableGroups,
        nextMyTiles,
        nextPendingGroupIds,
        nextPendingRecoveredJokers,
        nextPendingGroupSeq: nextSeq,
        removedJoker: pendingRecoveredJokers.includes(tileCode) ? tileCode : undefined,
        branch: "rack→pending-incompat:new-group",
      };
    }
    // 호환 → 병합
    const updatedTiles = [...existingPendingGroup.tiles, tileCode];
    const nextTableGroups = tableGroups.map((g) =>
      g.id !== existingPendingGroup.id
        ? g
        : { ...g, tiles: updatedTiles, type: classifySetType(updatedTiles) }
    );
    const dupes = detectDuplicateTileCodes(nextTableGroups);
    if (dupes.length > 0) {
      return rejectWith("duplicate-detected", "rack→pending-compat:dup-guard");
    }
    const nextMyTiles = removeFirstOccurrence(myTiles, tileCode);
    const nextPendingRecoveredJokers = pendingRecoveredJokers.includes(tileCode)
      ? pendingRecoveredJokers.filter((j) => j !== tileCode)
      : pendingRecoveredJokers;
    return {
      ...defaults,
      nextTableGroups,
      nextMyTiles,
      nextPendingRecoveredJokers,
      removedJoker: pendingRecoveredJokers.includes(tileCode) ? tileCode : undefined,
      branch: "rack→pending-compat:merge",
    };
  }

  // ---- rack → 서버 확정 그룹 (하지만 pending 아님) ----
  const targetServerGroup = tableGroups.find((g) => g.id === overId);

  if (targetServerGroup && !hasInitialMeld) {
    // 초기 등록 전: 서버 그룹 확장 금지 → 새 pending 그룹 생성
    const nextSeq = pendingGroupSeq + 1;
    const newGroupId = makeNewGroupId(nextSeq);
    const newGroup: TableGroup = {
      id: newGroupId,
      tiles: [tileCode],
      type: classifySetType([tileCode]),
    };
    const nextTableGroups = [...tableGroups, newGroup];
    const dupes = detectDuplicateTileCodes(nextTableGroups);
    if (dupes.length > 0) {
      return rejectWith("duplicate-detected", "rack→server-preinitial:dup-guard");
    }
    const nextMyTiles = removeFirstOccurrence(myTiles, tileCode);
    const nextPendingGroupIds = new Set([...pendingGroupIds, newGroupId]);
    const nextPendingRecoveredJokers = pendingRecoveredJokers.includes(tileCode)
      ? pendingRecoveredJokers.filter((j) => j !== tileCode)
      : pendingRecoveredJokers;
    return {
      ...defaults,
      nextTableGroups,
      nextMyTiles,
      nextPendingGroupIds,
      nextPendingRecoveredJokers,
      nextPendingGroupSeq: nextSeq,
      warning: "extend-lock-before-initial-meld",
      removedJoker: pendingRecoveredJokers.includes(tileCode) ? tileCode : undefined,
      branch: "rack→server-preinitial:new-group",
    };
  }

  if (targetServerGroup && hasInitialMeld) {
    if (!isCompatibleWithGroup(tileCode, targetServerGroup)) {
      // 비호환 → 새 그룹 (옵션 A 폴스루)
      const nextSeq = pendingGroupSeq + 1;
      const newGroupId = makeNewGroupId(nextSeq);
      const newGroup: TableGroup = {
        id: newGroupId,
        tiles: [tileCode],
        type: classifySetType([tileCode]),
      };
      const nextTableGroups = [...tableGroups, newGroup];
      const dupes = detectDuplicateTileCodes(nextTableGroups);
      if (dupes.length > 0) {
        return rejectWith("duplicate-detected", "rack→server-incompat:dup-guard");
      }
      const nextMyTiles = removeFirstOccurrence(myTiles, tileCode);
      const nextPendingGroupIds = new Set([...pendingGroupIds, newGroupId]);
      const nextPendingRecoveredJokers = pendingRecoveredJokers.includes(tileCode)
        ? pendingRecoveredJokers.filter((j) => j !== tileCode)
        : pendingRecoveredJokers;
      return {
        ...defaults,
        nextTableGroups,
        nextMyTiles,
        nextPendingGroupIds,
        nextPendingRecoveredJokers,
        nextPendingGroupSeq: nextSeq,
        removedJoker: pendingRecoveredJokers.includes(tileCode) ? tileCode : undefined,
        branch: "rack→server-incompat:new-group",
      };
    }
    // 호환 → 서버 그룹 확장
    const updatedTiles = [...targetServerGroup.tiles, tileCode];
    const nextTableGroups = tableGroups.map((g) =>
      g.id !== targetServerGroup.id
        ? g
        : { ...g, tiles: updatedTiles, type: classifySetType(updatedTiles) }
    );
    const dupes = detectDuplicateTileCodes(nextTableGroups);
    if (dupes.length > 0) {
      return rejectWith("duplicate-detected", "rack→server-compat:dup-guard");
    }
    const nextMyTiles = removeFirstOccurrence(myTiles, tileCode);
    const nextPendingGroupIds = new Set([...pendingGroupIds, targetServerGroup.id]);
    const nextPendingRecoveredJokers = pendingRecoveredJokers.includes(tileCode)
      ? pendingRecoveredJokers.filter((j) => j !== tileCode)
      : pendingRecoveredJokers;
    return {
      ...defaults,
      nextTableGroups,
      nextMyTiles,
      nextPendingGroupIds,
      nextPendingRecoveredJokers,
      removedJoker: pendingRecoveredJokers.includes(tileCode) ? tileCode : undefined,
      branch: "rack→server-compat:merge",
    };
  }

  // ---- rack → game-board (빈 공간) ----
  if (overId === "game-board") {
    const pendingOnlyGroups = tableGroups.filter(
      (g) => pendingGroupIds.has(g.id) && g.id.startsWith("pending-")
    );
    const lastPendingGroup = pendingOnlyGroups[pendingOnlyGroups.length - 1];

    const shouldCreateNewGroup = computeShouldCreateNewGroup({
      forceNewGroup,
      tileCode,
      lastPendingGroup,
    });

    if (lastPendingGroup && !shouldCreateNewGroup) {
      const updatedTiles = [...lastPendingGroup.tiles, tileCode];
      const nextTableGroups = tableGroups.map((g) =>
        g.id !== lastPendingGroup.id
          ? g
          : { ...g, tiles: updatedTiles, type: classifySetType(updatedTiles) }
      );
      const dupes = detectDuplicateTileCodes(nextTableGroups);
      if (dupes.length > 0) {
        return rejectWith("duplicate-detected", "rack→board:append-dup-guard");
      }
      const nextMyTiles = removeFirstOccurrence(myTiles, tileCode);
      const nextPendingRecoveredJokers = pendingRecoveredJokers.includes(tileCode)
        ? pendingRecoveredJokers.filter((j) => j !== tileCode)
        : pendingRecoveredJokers;
      return {
        ...defaults,
        nextTableGroups,
        nextMyTiles,
        nextPendingRecoveredJokers,
        removedJoker: pendingRecoveredJokers.includes(tileCode) ? tileCode : undefined,
        branch: "rack→board:append-last",
      };
    }
    // 새 그룹 생성
    const nextSeq = pendingGroupSeq + 1;
    const newGroupId = makeNewGroupId(nextSeq);
    const newGroup: TableGroup = {
      id: newGroupId,
      tiles: [tileCode],
      type: classifySetType([tileCode]),
    };
    const nextTableGroups = [...tableGroups, newGroup];
    const dupes = detectDuplicateTileCodes(nextTableGroups);
    if (dupes.length > 0) {
      return rejectWith("duplicate-detected", "rack→board:new-group-dup-guard");
    }
    const nextMyTiles = removeFirstOccurrence(myTiles, tileCode);
    const nextPendingGroupIds = new Set([...pendingGroupIds, newGroupId]);
    const nextPendingRecoveredJokers = pendingRecoveredJokers.includes(tileCode)
      ? pendingRecoveredJokers.filter((j) => j !== tileCode)
      : pendingRecoveredJokers;
    return {
      ...defaults,
      nextTableGroups,
      nextMyTiles,
      nextPendingGroupIds,
      nextPendingRecoveredJokers,
      nextPendingGroupSeq: nextSeq,
      removedJoker: pendingRecoveredJokers.includes(tileCode) ? tileCode : undefined,
      branch: "rack→board:new-group",
    };
  }

  // ---- rack → game-board-new-group ----
  if (overId === "game-board-new-group") {
    const nextSeq = pendingGroupSeq + 1;
    const newGroupId = makeNewGroupId(nextSeq);
    const newGroup: TableGroup = {
      id: newGroupId,
      tiles: [tileCode],
      type: classifySetType([tileCode]),
    };
    const nextTableGroups = [...tableGroups, newGroup];
    const dupes = detectDuplicateTileCodes(nextTableGroups);
    if (dupes.length > 0) {
      return rejectWith("duplicate-detected", "rack→board-new-group:dup-guard");
    }
    const nextMyTiles = removeFirstOccurrence(myTiles, tileCode);
    const nextPendingGroupIds = new Set([...pendingGroupIds, newGroupId]);
    const nextPendingRecoveredJokers = pendingRecoveredJokers.includes(tileCode)
      ? pendingRecoveredJokers.filter((j) => j !== tileCode)
      : pendingRecoveredJokers;
    return {
      ...defaults,
      nextTableGroups,
      nextMyTiles,
      nextPendingGroupIds,
      nextPendingRecoveredJokers,
      nextPendingGroupSeq: nextSeq,
      removedJoker: pendingRecoveredJokers.includes(tileCode) ? tileCode : undefined,
      branch: "rack→board-new-group:ok",
    };
  }

  return rejectWith("no-drop-position", "rack→unknown");
}

// ---------------------------------------------------------------------------
// shouldCreateNewGroup 판정 (GameClient.tsx:1096-1164 동일 로직)
// ---------------------------------------------------------------------------

function computeShouldCreateNewGroup(params: {
  forceNewGroup: boolean;
  tileCode: TileCode;
  lastPendingGroup: TableGroup | undefined;
}): boolean {
  const { forceNewGroup, tileCode, lastPendingGroup } = params;
  if (forceNewGroup) return true;
  if (!lastPendingGroup) return false;

  const newTile = parseTileCode(tileCode);
  const existingTiles = lastPendingGroup.tiles
    .filter((t) => t !== "JK1" && t !== "JK2")
    .map((t) => parseTileCode(t));

  if (existingTiles.length === 0 || newTile.isJoker) return false;

  const existingNumbers = new Set(existingTiles.map((t) => t.number));
  const isGroupCandidate = existingNumbers.size === 1;
  const existingColors = new Set(existingTiles.map((t) => t.color));
  const isRunCandidate = existingColors.size === 1;

  if (isGroupCandidate && isRunCandidate) {
    const refNumber = existingTiles[0].number;
    const refColor = existingTiles[0].color;
    const numberMatches = newTile.number === refNumber;
    const colorMatches = newTile.color === refColor;
    if (!numberMatches && !colorMatches) return true;
    if (!numberMatches && colorMatches) {
      if (newTile.number === null) return false;
      const refNum = refNumber ?? 0;
      if (Math.abs(newTile.number - refNum) !== 1) return true;
    }
  }

  if (isGroupCandidate && !isRunCandidate) {
    const groupNumber = existingTiles[0].number;
    if (newTile.number !== groupNumber) return true;
    if (existingColors.has(newTile.color as TileColor)) return true;
    if (lastPendingGroup.tiles.length >= 4) return true;
  }

  if (isRunCandidate && !isGroupCandidate) {
    const runColor = existingTiles[0].color;
    if (newTile.color !== runColor) return true;
    if (newTile.number !== null) {
      const allNums = existingTiles
        .map((t) => t.number)
        .filter((n): n is TileNumber => n !== null);
      allNums.push(newTile.number);
      allNums.sort((a, b) => a - b);
      for (let i = 1; i < allNums.length; i++) {
        if (allNums[i] - allNums[i - 1] !== 1) return true;
      }
    }
  }

  if (!isGroupCandidate && !isRunCandidate) return true;

  return false;
}
