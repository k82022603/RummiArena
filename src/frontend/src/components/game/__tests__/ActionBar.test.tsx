/**
 * ActionBar 단위 테스트 (P1-4 회귀 방지)
 *
 * 검증 대상: 확정 버튼 disabled 조건
 *   disabled = !isMyTurn || !hasPending || !allGroupsValid
 *
 * 오늘 버그: 유효하지 않은 조합(allGroupsValid=false)에서도 "확정" 버튼 활성 상태로
 * 사용자가 클릭 가능. 서버 왕복 후에야 거절됨.
 */

import "@testing-library/jest-dom";
import React from "react";
import { render, screen } from "@testing-library/react";
import ActionBar from "@/components/game/ActionBar";

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {};

describe("ActionBar — 내 턴이 아닐 때", () => {
  it("isMyTurn=false 이면 ActionBar 자체가 렌더되지 않는다 (AnimatePresence)", () => {
    const { container } = render(
      <ActionBar
        isMyTurn={false}
        hasPending={true}
        allGroupsValid={true}
        onDraw={noop}
        onUndo={noop}
        onConfirm={noop}
      />
    );
    // 전체 버튼 그룹 role="group" 없음
    expect(container.querySelector('[role="group"]')).toBeNull();
    expect(screen.queryByRole("button", { name: /확정/ })).toBeNull();
  });
});

describe("ActionBar — 확정 버튼 disabled 조건 (P1-4)", () => {
  it("내 턴 + pending 있음 + 모든 그룹 유효 → 확정 활성", () => {
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
    const confirm = screen.getByRole("button", { name: /확정/ });
    expect(confirm).toBeEnabled();
  });

  it("내 턴 + pending 있음 + 그룹 유효하지 않음 → 확정 비활성 (P1-4 핵심)", () => {
    // 오늘 이미지 111641에서 "유효하지 않은 조합입니다 (연속된 숫자가 아닙니다)" 토스트가
    // 확정 클릭 후에만 표시되던 버그. 버튼이 사전 disabled 되어야 한다.
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
    const confirm = screen.getByRole("button", { name: /확정/ });
    expect(confirm).toBeDisabled();
  });

  it("내 턴 + pending 없음 → 확정 비활성 (드로우 직후)", () => {
    render(
      <ActionBar
        isMyTurn={true}
        hasPending={false}
        allGroupsValid={true}
        onDraw={noop}
        onUndo={noop}
        onConfirm={noop}
      />
    );
    expect(screen.getByRole("button", { name: /확정/ })).toBeDisabled();
  });

  it("allGroupsValid 기본값 true — prop 생략 시 다른 조건만 평가", () => {
    render(
      <ActionBar
        isMyTurn={true}
        hasPending={true}
        // allGroupsValid 미제공 → default true
        onDraw={noop}
        onUndo={noop}
        onConfirm={noop}
      />
    );
    expect(screen.getByRole("button", { name: /확정/ })).toBeEnabled();
  });
});

describe("ActionBar — 드로우/패스 버튼", () => {
  it("drawPileCount=0 → '패스' 버튼 렌더 (드로우 파일 소진)", () => {
    render(
      <ActionBar
        isMyTurn={true}
        hasPending={false}
        drawPileCount={0}
        onDraw={noop}
        onUndo={noop}
        onConfirm={noop}
      />
    );
    expect(screen.getByRole("button", { name: /턴 패스/ })).toBeInTheDocument();
    // 드로우 버튼은 없음
    expect(screen.queryByRole("button", { name: "타일 드로우" })).toBeNull();
  });

  it("drawPileCount>0 → '드로우' 버튼 렌더", () => {
    render(
      <ActionBar
        isMyTurn={true}
        hasPending={false}
        drawPileCount={78}
        onDraw={noop}
        onUndo={noop}
        onConfirm={noop}
      />
    );
    expect(
      screen.getByRole("button", { name: "타일 드로우" })
    ).toBeInTheDocument();
  });

  it("hasPending=true → 드로우/패스 비활성 (배치 중 불가)", () => {
    render(
      <ActionBar
        isMyTurn={true}
        hasPending={true}
        drawPileCount={78}
        onDraw={noop}
        onUndo={noop}
        onConfirm={noop}
      />
    );
    expect(screen.getByRole("button", { name: "타일 드로우" })).toBeDisabled();
  });
});

describe("ActionBar — confirmBusy (Issue #48 in-flight lock)", () => {
  it("confirmBusy=true 이면 확정 버튼 disabled (서버 응답 대기 중)", () => {
    render(
      <ActionBar
        isMyTurn={true}
        hasPending={true}
        allGroupsValid={true}
        confirmBusy={true}
        onDraw={noop}
        onUndo={noop}
        onConfirm={noop}
      />
    );
    expect(screen.getByRole("button", { name: /확정/ })).toBeDisabled();
  });

  it("confirmBusy=false + 기존 조건 만족 시 확정 활성", () => {
    render(
      <ActionBar
        isMyTurn={true}
        hasPending={true}
        allGroupsValid={true}
        confirmBusy={false}
        onDraw={noop}
        onUndo={noop}
        onConfirm={noop}
      />
    );
    expect(screen.getByRole("button", { name: /확정/ })).toBeEnabled();
  });
});

describe("ActionBar — Phase 3 확정/초기화/드로우 prop 직접 제공 (useTurnActions 연결)", () => {
  it("confirmEnabled=true prop 제공 시 확정 버튼 활성", () => {
    render(
      <ActionBar
        isMyTurn={true}
        hasPending={false}
        allGroupsValid={false}
        onDraw={noop}
        onUndo={noop}
        onConfirm={noop}
        confirmEnabled={true}
      />
    );
    // fallback(hasPending=false, allGroupsValid=false)이면 비활성이지만
    // confirmEnabled=true 우선 적용 → 활성
    expect(screen.getByRole("button", { name: /확정/ })).toBeEnabled();
  });

  it("confirmEnabled=false prop 제공 시 확정 버튼 비활성 (기존 hasPending=true와 무관)", () => {
    render(
      <ActionBar
        isMyTurn={true}
        hasPending={true}
        allGroupsValid={true}
        onDraw={noop}
        onUndo={noop}
        onConfirm={noop}
        confirmEnabled={false}
      />
    );
    // fallback(hasPending=true, allGroupsValid=true)이면 활성이지만
    // confirmEnabled=false 우선 적용 → 비활성
    expect(screen.getByRole("button", { name: /확정/ })).toBeDisabled();
  });

  it("confirmEnabled=true + confirmBusy=true → 확정 비활성 (in-flight 잠금 우선)", () => {
    render(
      <ActionBar
        isMyTurn={true}
        hasPending={true}
        allGroupsValid={true}
        confirmBusy={true}
        onDraw={noop}
        onUndo={noop}
        onConfirm={noop}
        confirmEnabled={true}
      />
    );
    expect(screen.getByRole("button", { name: /확정/ })).toBeDisabled();
  });

  it("resetEnabled=true prop 제공 시 초기화 버튼 활성 (hasPending=false 무관)", () => {
    render(
      <ActionBar
        isMyTurn={true}
        hasPending={false}
        onDraw={noop}
        onUndo={noop}
        onConfirm={noop}
        resetEnabled={true}
      />
    );
    expect(
      screen.getByRole("button", { name: /이번 턴 배치 초기화/ })
    ).toBeEnabled();
  });

  it("resetEnabled=false prop 제공 시 초기화 버튼 비활성 (hasPending=true 무관)", () => {
    render(
      <ActionBar
        isMyTurn={true}
        hasPending={true}
        onDraw={noop}
        onUndo={noop}
        onConfirm={noop}
        resetEnabled={false}
      />
    );
    expect(
      screen.getByRole("button", { name: /이번 턴 배치 초기화/ })
    ).toBeDisabled();
  });

  it("drawEnabled=true prop 제공 시 드로우 버튼 활성 (hasPending=true 무관)", () => {
    render(
      <ActionBar
        isMyTurn={true}
        hasPending={true}
        drawPileCount={10}
        onDraw={noop}
        onUndo={noop}
        onConfirm={noop}
        drawEnabled={true}
      />
    );
    expect(screen.getByRole("button", { name: "타일 드로우" })).toBeEnabled();
  });

  it("drawEnabled=false prop 제공 시 드로우 버튼 비활성 (hasPending=false 무관)", () => {
    render(
      <ActionBar
        isMyTurn={true}
        hasPending={false}
        drawPileCount={10}
        onDraw={noop}
        onUndo={noop}
        onConfirm={noop}
        drawEnabled={false}
      />
    );
    expect(screen.getByRole("button", { name: "타일 드로우" })).toBeDisabled();
  });
});

describe("ActionBar — 초기화 버튼", () => {
  it("hasPending=false → 초기화 비활성", () => {
    render(
      <ActionBar
        isMyTurn={true}
        hasPending={false}
        onDraw={noop}
        onUndo={noop}
        onConfirm={noop}
      />
    );
    // aria-label prefix 로 찾기
    const reset = screen.getByRole("button", {
      name: /이번 턴 배치 초기화/,
    });
    expect(reset).toBeDisabled();
  });

  it("hasPending=true → 초기화 활성", () => {
    render(
      <ActionBar
        isMyTurn={true}
        hasPending={true}
        onDraw={noop}
        onUndo={noop}
        onConfirm={noop}
      />
    );
    const reset = screen.getByRole("button", {
      name: /이번 턴 배치 초기화/,
    });
    expect(reset).toBeEnabled();
  });
});
