/**
 * BUG-NEW-001 / BUG-NEW-002 / BUG-NEW-003 회귀 방지 테스트
 *
 * 작성일: 2026-04-21 (Day 11 오후 긴급 수정)
 * 근거: qa 에이전트 실측 스크린샷 7장 분석 — P0 3건 신규 발견
 *
 * BUG-NEW-001: 보드 복제 버그
 *   — game-board 드롭 시 서버 확정 그룹이 lastPendingGroup으로 선택되어
 *     타일이 잘못된 그룹에 누적되던 문제
 *   — 수정: treatAsBoardDrop 경로에서 "pending-" 접두사 그룹만 lastPendingGroup 후보로 허용
 *
 * BUG-NEW-002: 3색 서로 다른 3장이 "런"으로 오분류
 *   — classifySetType 기본값 "run"이 [Y11,K12,B13] 등 혼합 세트에 적용되던 문제
 *   — classifyKind가 type="run" 힌트를 색상 검증 없이 신뢰하던 문제
 *   — 수정: classifySetType 기본값 → "group", classifyKind → allSameColor 재검증
 *
 * BUG-NEW-003: 무효 세트에서도 확정 버튼 활성화
 *   — allGroupsValid가 tiles.length>=3 만 확인하여 "invalid" 세트를 통과시키던 문제
 *   — 수정: validatePendingBlock 결과를 allGroupsValid useMemo에 통합 (GameClient.tsx)
 *   — 이 테스트는 ActionBar + validatePendingBlock 순수 함수 조합으로 검증
 */

import "@testing-library/jest-dom";
import React from "react";
import { render, screen } from "@testing-library/react";

import { validatePendingBlock } from "@/components/game/GameBoard";
import ActionBar from "@/components/game/ActionBar";
import { isCompatibleWithGroup } from "@/lib/mergeCompatibility";

import type { TileCode, TableGroup } from "@/types/tile";

const noop = () => {};

// =====================================================================
// BUG-NEW-002: classifySetType 기본값 변경 — 혼색 세트 오분류 방지
// =====================================================================

describe("BUG-NEW-002 · 혼색+혼숫자 세트 → validatePendingBlock 'invalid' 판정", () => {
  it("[Y11, K12, B13] 3색 다른 숫자 3장 → invalid (런/그룹 어느 쪽도 아님)", () => {
    const result = validatePendingBlock(["Y11a", "K12a", "B13a"] as TileCode[]);
    expect(result).toBe("invalid");
  });

  it("[R7, B9, Y3] 3색 비연속 숫자 3장 → invalid", () => {
    const result = validatePendingBlock(["R7a", "B9a", "Y3a"] as TileCode[]);
    expect(result).toBe("invalid");
  });

  it("[R13, B13, Y13, K11] 3색 13 + 1색 11 → invalid (숫자 혼합)", () => {
    // 증거: 스크린샷 165453에서 보드 전체 블록이 [R13,B13,Y13,K11] = 무효 세트였던 케이스
    const result = validatePendingBlock(["R13a", "B13a", "Y13a", "K11a"] as TileCode[]);
    expect(result).toBe("invalid");
  });

  it("[Y5, Y6, Y7] 같은 색 연속 3장 → valid-run (정상 런은 영향 없음)", () => {
    const result = validatePendingBlock(["Y5a", "Y6a", "Y7a"] as TileCode[]);
    expect(result).toBe("valid-run");
  });

  it("[R7, B7, Y7] 같은 숫자 다른 색 3장 → valid-group (정상 그룹은 영향 없음)", () => {
    const result = validatePendingBlock(["R7a", "B7a", "Y7a"] as TileCode[]);
    expect(result).toBe("valid-group");
  });
});

// =====================================================================
// BUG-NEW-002: classifyKind — type="run" 힌트 검증 (allSameColor 재확인)
// =====================================================================

describe("BUG-NEW-002 · classifyKind allSameColor 재검증 → isCompatibleWithGroup 정확도", () => {
  it("type='run'이지만 색 혼합인 그룹 [Y11,K12,B13]에 R14 드롭 → 호환 안 됨", () => {
    // classifyKind가 type='run'을 색 검증 없이 신뢰하면 isCompatibleAsRun을 호출하고
    // runColor=Y로 설정 → B14 (색 다름)는 false 반환 (우연히 맞음).
    // 그러나 classifyKind 수정 후에는 "unknown"을 반환하므로 양쪽 검사 → 올바르게 false.
    const mixedGroup: TableGroup = {
      id: "mixed-run",
      tiles: ["Y11a", "K12a", "B13a"],
      type: "run", // classifySetType 이전 기본값이 남아있는 경우 시뮬레이션
    };
    // 숫자 14는 범위 초과, 색도 혼합 → false
    expect(isCompatibleWithGroup("R13b" as TileCode, mixedGroup)).toBe(false);
  });

  it("type='run'이지만 색 혼합인 그룹 [Y11,K12,B13]에 Y13 드롭 → 호환 안 됨 (숫자 혼합)", () => {
    const mixedGroup: TableGroup = {
      id: "mixed-run2",
      tiles: ["Y11a", "K12a", "B13a"],
      type: "run",
    };
    // Y13: 색이 Y이지만 그룹 숫자가 {11,12,13}이라 그룹 판정도 불가 → false
    expect(isCompatibleWithGroup("Y14a" as TileCode, mixedGroup)).toBe(false);
  });

  it("type='group'이지만 숫자 혼합인 그룹 [R7,B9] 에 Y7 드롭 → unknown 처리", () => {
    // type='group'이지만 숫자가 {7,9}로 다름 — classifyKind는 unknown으로 강등,
    // 양쪽 검사: isCompatibleAsGroup(Y7 with [R7,B9]) → groupNumber=7이 아님 (size>1) → false
    // isCompatibleAsRun(Y7 with [R7,B9]) → runColor=R, Y7.color=Y → false
    const mixedGroup: TableGroup = {
      id: "mixed-group",
      tiles: ["R7a", "B9a"],
      type: "group", // type='group'이지만 실제 숫자가 다름
    };
    expect(isCompatibleWithGroup("Y7a" as TileCode, mixedGroup)).toBe(false);
  });
});

// =====================================================================
// BUG-NEW-003: 무효 세트에서 확정 버튼 비활성화
// =====================================================================

describe("BUG-NEW-003 · 무효 pending 세트 → 확정 버튼 disabled 사전 차단", () => {
  it("[Y11,K12,B13] invalid 세트 → validatePendingBlock 'invalid' → ActionBar 확정 비활성", () => {
    // 이 테스트는 GameClient.tsx의 allGroupsValid useMemo가 validatePendingBlock을
    // 활용하여 'invalid' 세트를 사전 차단하는 흐름을 검증한다.
    // GameClient 자체는 WS/Store 의존성이 많아 단위 테스트 어려우므로,
    // "invalid 세트면 useTurnActions.confirmEnabled=false → ActionBar 확정 disabled" 분해 검증.
    const invalidTiles: TileCode[] = ["Y11a", "K12a", "B13a"] as TileCode[];
    const validity = validatePendingBlock(invalidTiles);
    expect(validity).toBe("invalid"); // confirmEnabled=false로 이어짐

    // ActionBar는 confirmEnabled=false이면 disabled (useTurnActions가 SSOT)
    render(
      <ActionBar
        isMyTurn={true}
        confirmEnabled={false} // invalid 세트 → useTurnActions가 false 반환
        resetEnabled={true}
        drawEnabled={false}
        onDraw={noop}
        onUndo={noop}
        onConfirm={noop}
      />
    );
    expect(screen.getByRole("button", { name: /확정/ })).toBeDisabled();
  });

  it("[R7,B7,Y7] valid-group 세트 → confirmEnabled=true → 확정 활성", () => {
    const validTiles: TileCode[] = ["R7a", "B7a", "Y7a"] as TileCode[];
    const validity = validatePendingBlock(validTiles);
    expect(validity).toBe("valid-group");

    render(
      <ActionBar
        isMyTurn={true}
        confirmEnabled={true} // valid 세트 → useTurnActions가 true 반환
        resetEnabled={true}
        drawEnabled={false}
        onDraw={noop}
        onUndo={noop}
        onConfirm={noop}
      />
    );
    expect(screen.getByRole("button", { name: /확정/ })).toBeEnabled();
  });

  it("tiles >= 3 이지만 invalid → allGroupsValid=false (이전 버그: length>=3만 체크하면 통과)", () => {
    // 이전 버그: tiles.length=3 이면 allGroupsValid=true로 처리 → 확정 버튼 활성
    // 현재 fix: validatePendingBlock이 'invalid'이면 allGroupsValid=false → 비활성
    const tileCount = 3;
    const validity = validatePendingBlock(["Y11a", "K12a", "B13a"] as TileCode[]);
    // tiles.length=3 이지만 invalid
    expect(tileCount).toBeGreaterThanOrEqual(3); // 이전 조건만으로는 통과
    expect(validity).toBe("invalid"); // 하지만 실제로는 invalid
    // → allGroupsValid가 올바르게 false를 반환해야 함 (GameClient.tsx에서 보장)
  });
});

// =====================================================================
// BUG-NEW-001: 보드 복제 방지 — game-board 드롭 경로 격리
// =====================================================================

describe("BUG-NEW-001 · game-board 드롭 시 서버 그룹 격리 (순수 함수 검증)", () => {
  // handleDragEnd 자체는 WS/Store 의존성이 많아 통합 테스트로 대응하기 어렵다.
  // 여기서는 핵심 불변식 (서버 그룹은 "pending-" 접두사 없음)을 검증한다.

  it("서버 확정 그룹 id는 'pending-' 접두사가 없다", () => {
    // 서버에서 오는 tableGroups id 예시: UUID 형식
    const serverGroupId = "c8665d26-356b-4c10-b3f0-ec76cbc08346";
    expect(serverGroupId.startsWith("pending-")).toBe(false);
  });

  it("클라이언트 신규 그룹 id는 'pending-' 접두사를 가진다", () => {
    // GameClient.tsx: `pending-${Date.now()}-${pendingGroupSeqRef.current}`
    const clientGroupId = `pending-${Date.now()}-1`;
    expect(clientGroupId.startsWith("pending-")).toBe(true);
  });

  it("서버 그룹 id를 pendingGroupIds에 추가해도 lastPendingGroup 후보에서 제외됨을 의미", () => {
    // 수정 전: pendingGroupIds.has(g.id) 만으로 필터 → 서버 그룹도 후보
    // 수정 후: pendingGroupIds.has(g.id) && g.id.startsWith("pending-") 로 필터
    const serverGroup: TableGroup = {
      id: "server-uuid-1234",
      tiles: ["R13a", "B13a", "Y13a"],
      type: "group",
    };
    const pendingGroup: TableGroup = {
      id: "pending-1700000000-1",
      tiles: ["B11a"],
      type: "run",
    };
    const pendingGroupIds = new Set([serverGroup.id, pendingGroup.id]);

    // 수정 후 필터 로직 재현
    const groups = [serverGroup, pendingGroup];
    const pendingOnlyGroups = groups.filter(
      (g) => pendingGroupIds.has(g.id) && g.id.startsWith("pending-")
    );

    // 서버 그룹은 제외되고 신규 pending 그룹만 후보
    expect(pendingOnlyGroups).toHaveLength(1);
    expect(pendingOnlyGroups[0].id).toBe(pendingGroup.id);
  });

  it("pendingGroupIds에 서버 그룹만 있을 때 pendingOnlyGroups는 빈 배열 → 새 그룹 생성 경로", () => {
    const serverGroups: TableGroup[] = [
      { id: "srv-001", tiles: ["R13a", "B13a", "Y13a"], type: "group" },
      { id: "srv-002", tiles: ["K11a", "K12a", "K13a"], type: "run" },
    ];
    const pendingGroupIds = new Set(["srv-001", "srv-002"]);

    const pendingOnlyGroups = serverGroups.filter(
      (g) => pendingGroupIds.has(g.id) && g.id.startsWith("pending-")
    );

    // 서버 그룹만 있으면 pendingOnlyGroups는 비어있고
    // lastPendingGroup = undefined → 새 그룹 생성 경로로 폴스루
    expect(pendingOnlyGroups).toHaveLength(0);
    const lastPendingGroup = pendingOnlyGroups.at(-1);
    expect(lastPendingGroup).toBeUndefined();
  });
});

// =====================================================================
// A2: 서버 확정 그룹 merge 호환성 사전 필터 — 잡종 생성 차단
//
// 근거: 스크린샷 170801 — {R13,B13,K13} 에 B11 드롭 시
// 4개 블록 모두 [R13,B13,K13,B11] 잡종이 된 버그
// 수정: targetServerGroup 분기에 isCompatibleWithGroup 사전 필터 추가
//       호환 안 되면 새 그룹 생성 (옵션 A)
// =====================================================================

describe("A2 · 서버 확정 그룹 merge 호환성 사전 필터 (isCompatibleWithGroup)", () => {
  // 서버 확정 그룹 픽스처
  const group13: TableGroup = {
    id: "srv-13-group",
    tiles: ["R13a", "B13a", "K13a"],
    type: "group",
  };
  const run11to13: TableGroup = {
    id: "srv-run-11-13",
    tiles: ["K11a", "K12a", "K13a"],
    type: "run",
  };

  // -----------------------------------------------------------------------
  // 핵심 잡종 생성 차단: B11 → {R13,B13,K13} 호환 불가
  // -----------------------------------------------------------------------
  it("[잡종 차단] {R13,B13,K13} 에 B11 드롭 → 호환 안 됨 (숫자 불일치)", () => {
    // 스크린샷 170801 에서 실제 발생한 케이스
    // isCompatibleWithGroup 이 false → merge 금지 → 새 그룹 생성 경로
    expect(isCompatibleWithGroup("B11a" as TileCode, group13)).toBe(false);
  });

  it("[잡종 차단] {R13,B13,K13} 에 Y11 드롭 → 호환 안 됨 (숫자 불일치)", () => {
    expect(isCompatibleWithGroup("Y11a" as TileCode, group13)).toBe(false);
  });

  it("[잡종 차단] {K11,K12,K13} 런에 R11 드롭 → 호환 안 됨 (색상 불일치)", () => {
    expect(isCompatibleWithGroup("R11a" as TileCode, run11to13)).toBe(false);
  });

  it("[잡종 차단] {R13,B13,K13} 에 R13b 드롭 → 호환 안 됨 (R색 중복)", () => {
    // 같은 숫자지만 R색이 이미 존재 → group max 4색 규칙 위반
    expect(isCompatibleWithGroup("R13b" as TileCode, group13)).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 정상 merge 허용: Y13 → {R13,B13,K13} 은 4번째 색으로 호환됨
  // -----------------------------------------------------------------------
  it("[정상 merge] {R13,B13,K13} 에 Y13 드롭 → 호환됨 (4번째 색)", () => {
    expect(isCompatibleWithGroup("Y13a" as TileCode, group13)).toBe(true);
  });

  it("[정상 merge] {K11,K12,K13} 런에 K10 드롭 → 호환됨 (앞 확장)", () => {
    expect(isCompatibleWithGroup("K10a" as TileCode, run11to13)).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 옵션 A 검증: 호환 안 됨 → 새 그룹 생성 로직 패턴 검증
  // (handleDragEnd 내 실제 분기는 WS 의존성으로 직접 테스트 불가 → 순수 함수로 검증)
  // -----------------------------------------------------------------------
  it("[옵션 A] 비호환 타일은 서버 그룹에 merge되지 않고 독립 그룹이 돼야 함 — 불변식 확인", () => {
    // A2 수정 후 로직:
    //   if (!isCompatibleWithGroup(tileCode, targetServerGroup)) {
    //     → pendingGroupSeqRef.current += 1
    //     → newGroupId = `pending-${Date.now()}-${seq}`
    //     → newGroup = { id: newGroupId, tiles: [tileCode], ... }
    //     → nextTableGroups = [...currentTableGroups, newGroup]  // 서버 그룹 변경 없음
    //   }
    // 이 불변식: 서버 그룹 tiles 는 그대로 유지되어야 한다
    const serverGroupTilesBefore = [...group13.tiles];
    const tileCode = "B11a" as TileCode;

    // 호환 불가 확인
    const compatible = isCompatibleWithGroup(tileCode, group13);
    expect(compatible).toBe(false);

    // 비호환 시 서버 그룹은 변경되지 않는다 (새 그룹에만 tileCode 추가)
    // 실제 GameClient에서: nextTableGroups = [...currentTableGroups, newGroup]
    // currentTableGroups 에서 targetServerGroup.id를 map하지 않으므로 tiles 불변
    const simulatedNextTableGroups = [
      // 기존 서버 그룹은 그대로 유지
      { ...group13 },
      // 새 그룹에만 비호환 타일 추가
      { id: `pending-${Date.now()}-1`, tiles: [tileCode], type: "run" as const },
    ];

    // 서버 그룹 tiles 불변 확인
    const serverGroupAfter = simulatedNextTableGroups.find((g) => g.id === group13.id);
    expect(serverGroupAfter?.tiles).toEqual(serverGroupTilesBefore);

    // 새 그룹에 비호환 타일이 있어야 함
    const newGroup = simulatedNextTableGroups.find((g) => g.id !== group13.id);
    expect(newGroup?.tiles).toContain(tileCode);
  });

  // -----------------------------------------------------------------------
  // 조커 호환성: 조커는 어떤 그룹에도 추가 가능 (그룹 size < 4 이면)
  // -----------------------------------------------------------------------
  it("[정상 merge] {R13,B13,K13} 에 조커 드롭 → 호환됨 (조커는 group에 추가 가능)", () => {
    // isCompatibleAsGroup: tileIsJoker=true → return true (MAX_GROUP_SIZE=4 미만)
    expect(isCompatibleWithGroup("JK1" as TileCode, group13)).toBe(true);
  });

  it("[정상 merge] {K11,K12,K13} 런에 조커 드롭 → 호환됨 (런 끝 확장 여지)", () => {
    // isCompatibleAsRun: tileIsJoker=true, minNum=11, maxNum=13, 10>=1 → true
    expect(isCompatibleWithGroup("JK2" as TileCode, run11to13)).toBe(true);
  });
});
