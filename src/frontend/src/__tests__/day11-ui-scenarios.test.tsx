/**
 * Day 11 UI ONLY 시나리오 20개 테스트
 *
 * 작성일 2026-04-21 (Day 11 오후)
 * 작성자 QA Engineer
 * 설계 docs/04-testing/65-day11-ui-scenario-matrix.md
 *
 * 사용자 애벌레가 Day 11 UI 수정 13건 직후 "게임을 할 수 없다" 신고.
 * 기존 테스트(100 Jest + 390 Playwright) 가 못 잡은 UI ONLY 시나리오를 커버한다.
 *
 * 구현 원칙:
 *   - backend/WS 없이 gameStore 직접 조작 + 컴포넌트 렌더링
 *   - 순수 함수 (validatePendingBlock, calculateScore, isCompatibleWithGroup) 호출
 *   - @testing-library/react 로 DOM 검증
 */

import "@testing-library/jest-dom";
import React from "react";
import { render, screen } from "@testing-library/react";

import { validatePendingBlock } from "@/components/game/GameBoard";
import GameBoard from "@/components/game/GameBoard";
import ActionBar from "@/components/game/ActionBar";
import PlayerCard from "@/components/game/PlayerCard";
import TurnHistoryPanel from "@/components/game/TurnHistoryPanel";
import Tile from "@/components/tile/Tile";

import { calculateScore } from "@/lib/practice/practice-engine";
import {
  isCompatibleWithGroup,
  computeValidMergeGroups,
} from "@/lib/mergeCompatibility";
import { detectDuplicateTileCodes } from "@/lib/tileStateHelpers";
import { selectMyTileCount, useGameStore } from "@/store/gameStore";

import type { TileCode, TableGroup } from "@/types/tile";
import type { Player } from "@/types/game";
import type { TurnPlacement } from "@/store/gameStore";

// ---------------------------------------------------------------------
// 헬퍼: pending 그룹을 담은 GameBoard 렌더
// ---------------------------------------------------------------------
function renderPendingBoard(params: {
  group: TableGroup;
  isDragging?: boolean;
  validMergeGroupIds?: Set<string>;
  groupsDroppable?: boolean;
}) {
  const { group, isDragging, validMergeGroupIds, groupsDroppable } = params;
  return render(
    <GameBoard
      tableGroups={[group]}
      isMyTurn={true}
      isDragging={isDragging}
      pendingGroupIds={new Set([group.id])}
      groupsDroppable={groupsDroppable}
      validMergeGroupIds={validMergeGroupIds}
    />
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyPlayer = (obj: Record<string, any>) => obj as any;

// =====================================================================
// S-01 · K11(JK)-K12-K13 런 자동 감지
// =====================================================================
describe("S-01 · K11(JK)-K12-K13 런 자동 감지 (사용자 발견)", () => {
  it("조커 1개로 K11 슬롯을 채운 검정색 런은 valid-run", () => {
    const result = validatePendingBlock(["JK1", "K12a", "K13a"] as TileCode[]);
    expect(result).toBe("valid-run");
  });

  it("조커가 런 앞에 오더라도 순서 무관 valid-run (K13-K12-JK)", () => {
    // 내부 정렬에 의존하지 않고 숫자 집합 기반으로 판정되는지 확인
    const result = validatePendingBlock(["K13a", "K12a", "JK1"] as TileCode[]);
    expect(result).toBe("valid-run");
  });
});

// =====================================================================
// S-02 · 2조커 런
// =====================================================================
describe("S-02 · 조커 2개 포함 런", () => {
  it("JK1-JK2-K13 은 valid-* (2조커 + 1타일 → 런/그룹 양쪽 해석 가능)", () => {
    // 일반 타일이 1개만 있어 숫자/색 모두 size=1 — 함수 설계상 그룹 분기가 먼저 반환.
    // UI 측면에서는 valid-group / valid-run 모두 '미확정' 완성형이라 치명적이지 않음.
    // 단, "partial" 또는 "invalid" 는 절대 아니어야 한다.
    const result = validatePendingBlock(["JK1", "JK2", "K13a"] as TileCode[]);
    expect(["valid-run", "valid-group"]).toContain(result);
  });

  it("JK1-K5-K7 (가운데 슬롯 채움) 은 valid-run (일반 타일 2개로 런 확정)", () => {
    // K5, K6(=JK1), K7 — 숫자 2개(5,7) 이 있으므로 uniqueNumbers.size>1 로 런 분기 진입
    const result = validatePendingBlock(["JK1", "K5a", "K7a"] as TileCode[]);
    expect(result).toBe("valid-run");
  });

  it("JK1-JK2-K12-K13 은 valid-run (2조커 + 일반 2개 → 숫자 범위 검사)", () => {
    // 숫자 집합 {12,13} → 런 분기로 명확히 진입
    const result = validatePendingBlock([
      "JK1",
      "JK2",
      "K12a",
      "K13a",
    ] as TileCode[]);
    expect(result).toBe("valid-run");
  });
});

// =====================================================================
// S-03 · 혼색 + 비연속 invalid 라벨 + 빨간 테두리
// =====================================================================
describe("S-03 · 무효 pending 블록 빨간 테두리 + 라벨", () => {
  it("R7-B9-Y3 조합 → invalid 판정", () => {
    const result = validatePendingBlock(["R7a", "B9a", "Y3a"] as TileCode[]);
    expect(result).toBe("invalid");
  });

  it("GameBoard 에 invalid pending 블록 렌더 시 '무효 세트' 라벨 + 빨간 테두리", () => {
    const group: TableGroup = {
      id: "invalid-p1",
      tiles: ["R7a", "B9a", "Y3a"],
      type: "run",
    };
    const { container } = renderPendingBoard({ group });

    // 라벨 텍스트
    expect(screen.getByText("무효 세트")).toBeInTheDocument();

    // 색 혼합 또는 숫자 불연속 경고 (role=alert)
    expect(screen.getByText("색 혼합 또는 숫자 불연속")).toBeInTheDocument();

    // 타일 컨테이너에 빨간 테두리 클래스
    const tileContainer = container.querySelector('[class*="ring-red-400"]');
    expect(tileContainer).not.toBeNull();
  });
});

// =====================================================================
// S-04 · 3장 미만 "미확정" 라벨
// =====================================================================
describe("S-04 · 3장 미만 pending → '미확정' 라벨", () => {
  it("2장만 있을 때 partial 반환", () => {
    expect(validatePendingBlock(["R7a", "R8a"] as TileCode[])).toBe("partial");
  });

  it("pending 그룹 2장(type=run) 렌더 시 '런 (미확정)' 라벨", () => {
    const group: TableGroup = {
      id: "partial-p1",
      tiles: ["R7a", "R8a"],
      type: "run",
    };
    renderPendingBoard({ group });

    expect(screen.getByText("런 (미확정)")).toBeInTheDocument();
    // partial 상태에서는 "무효 세트" 라벨 출력 금지
    expect(screen.queryByText("무효 세트")).toBeNull();
  });

  it("pending 그룹 2장(type=group) 렌더 시 '그룹 (미확정)' 라벨", () => {
    const group: TableGroup = {
      id: "partial-p2",
      tiles: ["R7a", "B7a"],
      type: "group",
    };
    renderPendingBoard({ group });
    expect(screen.getByText("그룹 (미확정)")).toBeInTheDocument();
  });
});

// =====================================================================
// S-05 · 같은 숫자 색 중복 (그룹 규칙 위반)
// =====================================================================
describe("S-05 · 그룹 내 색 중복 invalid", () => {
  it("R7a-R7b-B7a 는 invalid (같은 색 R 두 번)", () => {
    expect(
      validatePendingBlock(["R7a", "R7b", "B7a"] as TileCode[])
    ).toBe("invalid");
  });

  it("R7-B7-Y7-K7-R7b 5개 그룹은 invalid (색 중복 + 최대 4 초과)", () => {
    expect(
      validatePendingBlock(["R7a", "B7a", "Y7a", "K7a", "R7b"] as TileCode[])
    ).toBe("invalid");
  });
});

// =====================================================================
// S-06 · 드래그 중 validMergeGroupIds 녹색 pulse
// =====================================================================
describe("S-06 · 드래그 중 호환 그룹 녹색 pulse ring", () => {
  it("isDragging + validMergeGroupIds + groupsDroppable → animate-pulse 녹색 ring 렌더", () => {
    // 중요: 서버 확정 그룹 — pendingGroupIds 에 포함되지 않음
    const group: TableGroup = {
      id: "g-confirmed",
      tiles: ["Y5a", "Y6a", "Y7a"],
      type: "run",
    };
    const { container } = render(
      <GameBoard
        tableGroups={[group]}
        isMyTurn={true}
        isDragging={true}
        pendingGroupIds={new Set()}
        groupsDroppable={true}
        validMergeGroupIds={new Set([group.id])}
      />
    );

    const pulseEl = container.querySelector(
      '[class*="animate-pulse"][class*="ring-green-400"]'
    );
    expect(pulseEl).not.toBeNull();
  });
});

// =====================================================================
// S-07 · TurnHistoryPanel PENALTY_DRAW 한글
// =====================================================================
describe("S-07 · PENALTY_DRAW → '강제 드로우 (유효하지 않은 조합 반복)'", () => {
  it("placedTiles 비어있고 action=PENALTY_DRAW 이면 한글 레이블 렌더", () => {
    const history: TurnPlacement[] = [
      {
        turnNumber: 5,
        seat: 1,
        action: "PENALTY_DRAW",
        placedTiles: [],
        placedAt: Date.now(),
      },
    ];
    const players: Player[] = [
      anyPlayer({
        seat: 1,
        type: "AI_OPENAI",
        persona: "rookie",
        difficulty: "beginner",
      }),
    ];

    render(
      <TurnHistoryPanel history={history} players={players} mySeat={0} />
    );

    expect(
      screen.getByText("강제 드로우 (유효하지 않은 조합 반복)")
    ).toBeInTheDocument();
    // 원문(대문자) 노출 금지
    expect(screen.queryByText("PENALTY_DRAW")).toBeNull();
  });
});

// =====================================================================
// S-08 · DRAW_TILE → '드로우'
// =====================================================================
describe("S-08 · DRAW_TILE → '드로우'", () => {
  it("action=DRAW_TILE 이면 '드로우' 표시", () => {
    const history: TurnPlacement[] = [
      {
        turnNumber: 3,
        seat: 0,
        action: "DRAW_TILE",
        placedTiles: [],
        placedAt: Date.now(),
      },
    ];
    // 내 시트 seat=0 이므로 "나" 라벨 표시
    const players: Player[] = [
      anyPlayer({
        seat: 0,
        type: "HUMAN",
        displayName: "애벌레",
        status: "CONNECTED",
      }),
    ];

    render(
      <TurnHistoryPanel history={history} players={players} mySeat={0} />
    );

    expect(screen.getByText("드로우")).toBeInTheDocument();
    expect(screen.queryByText("DRAW_TILE")).toBeNull();
  });
});

// =====================================================================
// S-09 · 조커 포함 런 점수
// =====================================================================
describe("S-09 · calculateScore 조커 런", () => {
  it("JK1-K12-K13 = 30 + 12 + 13 = 55점", () => {
    const groups: TableGroup[] = [
      { id: "g1", tiles: ["JK1", "K12a", "K13a"], type: "run" },
    ];
    expect(calculateScore(groups)).toBe(55);
  });
});

// =====================================================================
// S-10 · 조커 포함 그룹 점수
// =====================================================================
describe("S-10 · calculateScore 조커 그룹", () => {
  it("R7-B7-JK = 7 + 7 + 30 = 44점", () => {
    const groups: TableGroup[] = [
      { id: "g1", tiles: ["R7a", "B7a", "JK1"], type: "group" },
    ];
    expect(calculateScore(groups)).toBe(44);
  });

  it("여러 그룹 합산 — [R7-B7-JK]+[Y5-Y6-Y7] = 44 + 18 = 62점", () => {
    const groups: TableGroup[] = [
      { id: "g1", tiles: ["R7a", "B7a", "JK1"], type: "group" },
      { id: "g2", tiles: ["Y5a", "Y6a", "Y7a"], type: "run" },
    ];
    expect(calculateScore(groups)).toBe(62);
  });
});

// =====================================================================
// S-11 · 4색 그룹 valid-group
// =====================================================================
describe("S-11 · R13-B13-Y13-K13 4색 그룹 valid-group", () => {
  it("같은 숫자 4색은 valid-group", () => {
    expect(
      validatePendingBlock([
        "R13a",
        "B13a",
        "Y13a",
        "K13a",
      ] as TileCode[])
    ).toBe("valid-group");
  });

  it("GameBoard 렌더 시 '그룹 (미확정)' 라벨", () => {
    const group: TableGroup = {
      id: "p-4color",
      tiles: ["R13a", "B13a", "Y13a", "K13a"],
      type: "group",
    };
    renderPendingBoard({ group });
    expect(screen.getByText("그룹 (미확정)")).toBeInTheDocument();
  });
});

// =====================================================================
// S-12 · 같은 색 연속 런 valid-run
// =====================================================================
describe("S-12 · Y5-Y6-Y7 valid-run", () => {
  it("같은 색 연속 3개는 valid-run", () => {
    expect(
      validatePendingBlock(["Y5a", "Y6a", "Y7a"] as TileCode[])
    ).toBe("valid-run");
  });
});

// =====================================================================
// S-13 · tileCount 정합성 (selectMyTileCount drift)
// =====================================================================
describe("S-13 · pendingMyTiles 변경 시 selectMyTileCount 동기화", () => {
  beforeEach(() => {
    useGameStore.getState().reset();
  });

  it("드래그·되돌리기 반복 후 각 단계 정합성 확보", () => {
    useGameStore.setState({
      mySeat: 0,
      players: [
        anyPlayer({ seat: 0, type: "HUMAN", tileCount: 14 }),
      ],
      pendingMyTiles: null,
    });
    // 초기 tileCount = 14
    expect(selectMyTileCount(useGameStore.getState())).toBe(14);

    // pending 3장
    useGameStore.setState({
      pendingMyTiles: ["R1a", "R2a", "R3a"] as unknown as TileCode[],
    });
    expect(selectMyTileCount(useGameStore.getState())).toBe(3);

    // 1장 추가 → 4
    useGameStore.setState({
      pendingMyTiles: ["R1a", "R2a", "R3a", "B5a"] as unknown as TileCode[],
    });
    expect(selectMyTileCount(useGameStore.getState())).toBe(4);

    // 1장 추가 → 5
    useGameStore.setState({
      pendingMyTiles: [
        "R1a",
        "R2a",
        "R3a",
        "B5a",
        "Y7a",
      ] as unknown as TileCode[],
    });
    expect(selectMyTileCount(useGameStore.getState())).toBe(5);

    // 되돌리기 → 4
    useGameStore.setState({
      pendingMyTiles: ["R1a", "R2a", "R3a", "B5a"] as unknown as TileCode[],
    });
    expect(selectMyTileCount(useGameStore.getState())).toBe(4);

    // 확정 → pending null, tileCount 10 (서버 응답 반영)
    useGameStore.setState({
      pendingMyTiles: null,
      players: [
        anyPlayer({ seat: 0, type: "HUMAN", tileCount: 10 }),
      ],
    });
    expect(selectMyTileCount(useGameStore.getState())).toBe(10);
  });
});

// =====================================================================
// S-14 · K11(JK)-K12 런에 K13 머지 허용
// =====================================================================
describe("S-14 · isCompatibleWithGroup 조커 런 확장", () => {
  it("[JK1, K12a] run 에 K13a 합치기 허용 (조커가 K11 역할)", () => {
    const group: TableGroup = {
      id: "g",
      tiles: ["JK1", "K12a"],
      type: "run",
    };
    expect(isCompatibleWithGroup("K13a", group)).toBe(true);
  });

  it("[JK1, K12a] run 에 K11a 합치기 허용 (조커가 다른 슬롯)", () => {
    const group: TableGroup = {
      id: "g",
      tiles: ["JK1", "K12a"],
      type: "run",
    };
    expect(isCompatibleWithGroup("K11a", group)).toBe(true);
  });

  it("computeValidMergeGroups 결과에 해당 그룹 포함", () => {
    const groups: TableGroup[] = [
      { id: "g1", tiles: ["JK1", "K12a"], type: "run" },
      { id: "g2", tiles: ["Y5a", "Y6a", "Y7a"], type: "run" },
    ];
    const valid = computeValidMergeGroups("K13a", groups);
    expect(valid.has("g1")).toBe(true);
    expect(valid.has("g2")).toBe(false);
  });
});

// =====================================================================
// S-15 · 파랑 타일을 노랑 런에 머지 금지 (F-2)
// =====================================================================
describe("S-15 · 호환되지 않는 타일 머지 금지", () => {
  it("Y9-Y10-Y11-Y12 런(Y) 에 B1a 합치기 금지", () => {
    const group: TableGroup = {
      id: "g1",
      tiles: ["Y9a", "Y10a", "Y11a", "Y12a"],
      type: "run",
    };
    expect(isCompatibleWithGroup("B1a", group)).toBe(false);
  });

  it("R7-B7-Y7 그룹(7) 에 R8a 합치기 금지 (다른 숫자)", () => {
    const group: TableGroup = {
      id: "g1",
      tiles: ["R7a", "B7a", "Y7a"],
      type: "group",
    };
    expect(isCompatibleWithGroup("R8a", group)).toBe(false);
  });
});

// =====================================================================
// S-16 · 고스트 타일 중복 방지 (G-3)
// =====================================================================
describe("S-16 · detectDuplicateTileCodes 고스트 탐지", () => {
  it("B1a 가 같은 그룹에 2회 등장 → 중복 반환", () => {
    const groups: TableGroup[] = [
      { id: "g1", tiles: ["B1a", "B2a", "B1a"], type: "run" },
    ];
    expect(detectDuplicateTileCodes(groups)).toEqual(["B1a"]);
  });

  it("B1a 가 다른 그룹에 분산 등장 → 중복 반환", () => {
    const groups: TableGroup[] = [
      { id: "g1", tiles: ["Y9a", "Y10a", "B1a"], type: "run" },
      { id: "g2", tiles: ["B1a", "B2a", "B3a"], type: "run" },
    ];
    expect(detectDuplicateTileCodes(groups)).toContain("B1a");
  });

  it("Y9-12 런 + B1-3 런 정상 케이스 → 중복 없음", () => {
    const groups: TableGroup[] = [
      { id: "g1", tiles: ["Y9a", "Y10a", "Y11a", "Y12a"], type: "run" },
      { id: "g2", tiles: ["B1a", "B2a", "B3a"], type: "run" },
    ];
    expect(detectDuplicateTileCodes(groups)).toEqual([]);
  });
});

// =====================================================================
// S-17 · ActionBar 확정 disabled (G-2 근본 방어)
// =====================================================================
describe("S-17 · allGroupsValid=false → 확정 버튼 disabled", () => {
  const noop = () => {};

  it("allGroupsValid=false 이면 disabled 속성 있음", () => {
    render(
      <ActionBar
        isMyTurn={true}
        hasPending={true}
        allGroupsValid={false}
        onDraw={noop}
        onUndo={noop}
        onConfirm={noop}
      />
    );
    expect(screen.getByRole("button", { name: /확정/ })).toBeDisabled();
  });

  it("allGroupsValid=true + isMyTurn=true + hasPending=true → 활성", () => {
    render(
      <ActionBar
        isMyTurn={true}
        hasPending={true}
        allGroupsValid={true}
        onDraw={noop}
        onUndo={noop}
        onConfirm={noop}
      />
    );
    expect(screen.getByRole("button", { name: /확정/ })).toBeEnabled();
  });
});

// =====================================================================
// S-18 · PlayerCard difficulty fallback (P0-3)
// =====================================================================
describe("S-18 · difficulty=undefined 이면 '—' (고수 절대 금지)", () => {
  it("difficulty 누락 AI → '—' 표시", () => {
    render(
      <PlayerCard
        player={anyPlayer({
          seat: 1,
          type: "AI_OPENAI",
          persona: "fox",
          tileCount: 14,
        })}
        isCurrentTurn={false}
        isAIThinking={false}
      />
    );

    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("고수")).toBeNull();
    expect(screen.queryByText("중수")).toBeNull();
    expect(screen.queryByText("하수")).toBeNull();
  });
});

// =====================================================================
// S-19 · PlayerCard persona=calculator
// =====================================================================
describe("S-19 · persona=calculator → 'GPT (계산기)'", () => {
  it("persona 와 difficulty 모두 올바른 한글 렌더", () => {
    render(
      <PlayerCard
        player={anyPlayer({
          seat: 1,
          type: "AI_OPENAI",
          persona: "calculator",
          difficulty: "expert",
          tileCount: 14,
        })}
        isCurrentTurn={false}
        isAIThinking={false}
      />
    );

    // title="GPT (계산기)" 요소
    expect(screen.getByTitle("GPT (계산기)")).toBeInTheDocument();
    // 하단에 '고수' 배지
    expect(screen.getByText("고수")).toBeInTheDocument();
    // '계산기' 배지
    expect(screen.getByText("계산기")).toBeInTheDocument();
  });
});

// =====================================================================
// S-20 · Tile 크기 재확인 (P2-3)
// =====================================================================
describe("S-20 · Tile SIZE_CLASS rack/table", () => {
  it("size='rack' → w-[52px] h-[72px]", () => {
    const { container } = render(<Tile code="R7a" size="rack" />);
    const el = container.querySelector('[role="img"]');
    expect(el?.className).toContain("w-[52px]");
    expect(el?.className).toContain("h-[72px]");
  });

  it("size='table' → w-[44px] h-[60px]", () => {
    const { container } = render(<Tile code="R7a" size="table" />);
    const el = container.querySelector('[role="img"]');
    expect(el?.className).toContain("w-[44px]");
    expect(el?.className).toContain("h-[60px]");
  });

  it("rack 과 table 크기 격차 유지 (rack > table)", () => {
    const { container: r } = render(<Tile code="R7a" size="rack" />);
    const { container: t } = render(<Tile code="R7a" size="table" />);
    const rackCls = r.querySelector('[role="img"]')?.className ?? "";
    const tableCls = t.querySelector('[role="img"]')?.className ?? "";
    // rack 가 table 보다 폭이 커야 한다 (52 > 44)
    expect(rackCls).toContain("w-[52px]");
    expect(tableCls).toContain("w-[44px]");
  });
});
