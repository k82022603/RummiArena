/**
 * F-11 DRAW / 자동 패스 — RED spec
 *
 * 룰 ID: A16, V-10 (drawpile empty 처리), UR-22 (라벨 "패스"), UR-23 (X 마크)
 * 상태 전이: S1 → S9 (DRAWING) → [TURN_END]
 * acceptance criteria: AC-11.1 / AC-11.2 / AC-11.3
 *
 * SSOT: docs/02-design/55-game-rules-enumeration.md §2.10 V-10, §3.5 UR-22/23
 *       docs/02-design/56-action-state-matrix.md §3.17 A16
 *       docs/02-design/60-ui-feature-spec.md §1.2 F-11
 *
 * Phase D Day 1 — RED commit (구현 없음, 모두 FAIL 예상)
 * commit message: [F-11] [V-10] [UR-22] [A16] draw-tile and auto-pass — RED spec
 */

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import React from "react";
import ActionBar, { type ActionBarProps } from "@/components/game/ActionBar";

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------

function renderActionBar(overrides: Partial<ActionBarProps> = {}) {
  const defaultProps: ActionBarProps = {
    isMyTurn: true,
    hasPending: false,
    allGroupsValid: true,
    drawPileCount: 60, // 기본값: drawpile 있음
    confirmBusy: false,
    onDraw: jest.fn(),
    onUndo: jest.fn(),
    onConfirm: jest.fn(),
    onPass: jest.fn(),
  };
  return render(React.createElement(ActionBar, { ...defaultProps, ...overrides }));
}

// ---------------------------------------------------------------------------
// AC-11.1: S1, drawpile=80, DRAW 클릭 → 랙 +1, 턴 종료
// 클라이언트 단위: DRAW 버튼이 활성화되어 클릭 가능한지 검증
// ---------------------------------------------------------------------------

describe("[F-11] [A16] AC-11.1 — S1 + drawpile>0 → DRAW 버튼 활성", () => {
  it("내 턴 + pending 없음 + drawpile>0 → 드로우 버튼 활성화 (UR-22 라벨 '드로우')", () => {
    renderActionBar({ isMyTurn: true, hasPending: false, drawPileCount: 80 });

    // DRAW 버튼이 존재하고 활성화되어야 한다
    // AC-11.1: 랙 +1, 턴 종료 처리는 서버 → 클라이언트에서 버튼 활성 여부만 검증
    const drawButton = screen.getByRole("button", { name: /드로우/i });
    expect(drawButton).toBeInTheDocument();
    expect(drawButton).not.toBeDisabled();
  });

  it("DRAW 버튼 클릭 시 onDraw 핸들러 호출 (A16 트리거)", () => {
    const onDraw = jest.fn();
    renderActionBar({ isMyTurn: true, hasPending: false, drawPileCount: 80, onDraw });

    const drawButton = screen.getByRole("button", { name: /드로우/i });
    drawButton.click();

    expect(onDraw).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// AC-11.2: S1, drawpile=0 → DRAW 버튼 라벨 "패스" + 패스 처리 (V-10)
// UR-22: 드로우 파일 0 → 드로우 버튼 라벨 "패스" 변경
// UR-23: 드로우 파일 0 → 시각적 X 마크 (본 spec에서는 버튼 라벨 검증)
// ---------------------------------------------------------------------------

describe("[F-11] [V-10] [UR-22] AC-11.2 — drawpile=0 → 버튼 라벨 '패스'", () => {
  it("drawPileCount=0 이면 드로우 버튼 라벨이 '패스'로 변경됨 (UR-22)", () => {
    renderActionBar({ isMyTurn: true, hasPending: false, drawPileCount: 0 });

    // UR-22: 드로우 버튼 라벨 "패스" 로 변경
    // AC-11.2: drawpile=0 → 패스 처리
    const passButton = screen.getByRole("button", { name: /패스/i });
    expect(passButton).toBeInTheDocument();
    expect(passButton).not.toBeDisabled();
  });

  it("drawPileCount=0 이면 onPass 핸들러 호출 (V-10 패스 처리)", () => {
    const onPass = jest.fn();
    renderActionBar({ isMyTurn: true, hasPending: false, drawPileCount: 0, onPass });

    const passButton = screen.getByRole("button", { name: /패스/i });
    passButton.click();

    expect(onPass).toHaveBeenCalledTimes(1);
  });

  it("drawPileCount=0 일 때 드로우 파일 소진 안내 메시지 표시 (UR-23 보완)", () => {
    renderActionBar({ isMyTurn: true, hasPending: false, drawPileCount: 0 });

    // UR-23: 드로우 파일 0 → 시각적 X 마크 또는 소진 안내
    // 현재 구현: "드로우 파일이 소진되었습니다" 메시지
    const notice = screen.queryByText(/드로우 파일|소진/i);
    // AC-11.2: 소진 안내 또는 X 마크가 표시되어야 함 (UR-23)
    expect(notice).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// AC-11.3: pending 1+ → DRAW 버튼 비활성화
// SSOT 56 §3.17: "pending 그룹 존재 시 거절" — 버튼 비활성으로 사전 차단
// band-aid 금지: 비활성화가 아닌 토스트로 막으면 UR-34 위반
// ---------------------------------------------------------------------------

describe("[F-11] [A16] [UR-34] AC-11.3 — pending 있을 때 DRAW 버튼 비활성", () => {
  it("hasPending=true → DRAW 버튼 disabled (사전 차단, 토스트 X)", () => {
    renderActionBar({ isMyTurn: true, hasPending: true, drawPileCount: 80 });

    // AC-11.3: pending 있을 때 DRAW 클릭 시도 → 버튼 비활성화
    // UR-34: 토스트 금지 — 버튼 disabled로 충분
    const drawButton = screen.queryByRole("button", { name: /드로우/i });
    if (drawButton) {
      expect(drawButton).toBeDisabled();
    } else {
      // 버튼 자체가 없으면 패스/드로우 버튼 둘 다 없는지 확인
      expect(screen.queryByRole("button", { name: /패스/i })).toBeNull();
    }
  });

  it("hasPending=true + drawPileCount=0 → 패스 버튼도 disabled", () => {
    renderActionBar({ isMyTurn: true, hasPending: true, drawPileCount: 0 });

    const passButton = screen.queryByRole("button", { name: /패스/i });
    if (passButton) {
      expect(passButton).toBeDisabled();
    }
    // 버튼이 없거나 disabled 둘 다 허용 (구현에 따라)
  });
});

// ---------------------------------------------------------------------------
// F-11 추가 검증: 내 턴이 아닐 때 ActionBar 자체 비표시 (UR-01)
// ---------------------------------------------------------------------------

describe("[F-11] [UR-01] — 내 턴이 아닐 때 ActionBar 비표시", () => {
  it("isMyTurn=false → DRAW 버튼 미표시 (UR-01: 다른 턴에 disable)", () => {
    renderActionBar({ isMyTurn: false });

    // AnimatePresence로 ActionBar 자체가 숨겨짐 — DRAW 버튼 미표시
    const drawButton = screen.queryByRole("button", { name: /드로우|패스/i });
    expect(drawButton).toBeNull();
  });
});
