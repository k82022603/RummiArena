/**
 * ActionBar 단위 테스트
 *
 * [2026-04-28 수정] useTurnActions가 SSOT로 정착함에 따라
 * confirmEnabled / resetEnabled / drawEnabled 는 required prop.
 * ActionBar 내부에 fallback 계산 로직 없음 — prop 값을 그대로 사용.
 *
 * 검증 대상:
 *   - 각 버튼의 활성/비활성은 prop 값이 직접 결정
 *   - confirmBusy=true 이면 confirmEnabled에 관계없이 확정 비활성 (Issue #48)
 *   - isMyTurn=false 이면 전체 ActionBar 미렌더 (AnimatePresence)
 *   - drawPileCount=0 이면 패스 버튼 표시
 */

import "@testing-library/jest-dom";
import React from "react";
import { render, screen } from "@testing-library/react";
import ActionBar from "@/components/game/ActionBar";

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {};

/** ActionBar 기본 필수 props (오버라이드 가능) */
const defaultProps = {
  isMyTurn: true,
  confirmEnabled: false,
  resetEnabled: false,
  drawEnabled: false,
  onDraw: noop,
  onUndo: noop,
  onConfirm: noop,
};

describe("ActionBar — 내 턴이 아닐 때", () => {
  it("isMyTurn=false 이면 ActionBar 자체가 렌더되지 않는다 (AnimatePresence)", () => {
    const { container } = render(
      <ActionBar
        {...defaultProps}
        isMyTurn={false}
        confirmEnabled={true}
        resetEnabled={true}
        drawEnabled={true}
      />
    );
    expect(container.querySelector('[role="group"]')).toBeNull();
    expect(screen.queryByRole("button", { name: /확정/ })).toBeNull();
  });
});

describe("ActionBar — 확정 버튼", () => {
  it("confirmEnabled=true → 확정 활성", () => {
    render(<ActionBar {...defaultProps} confirmEnabled={true} />);
    expect(screen.getByRole("button", { name: /확정/ })).toBeEnabled();
  });

  it("confirmEnabled=false → 확정 비활성", () => {
    render(<ActionBar {...defaultProps} confirmEnabled={false} />);
    expect(screen.getByRole("button", { name: /확정/ })).toBeDisabled();
  });

  it("confirmEnabled=true + confirmBusy=true → 확정 비활성 (Issue #48 in-flight lock)", () => {
    render(<ActionBar {...defaultProps} confirmEnabled={true} confirmBusy={true} />);
    expect(screen.getByRole("button", { name: /확정/ })).toBeDisabled();
  });

  it("confirmEnabled=true + confirmBusy=false → 확정 활성", () => {
    render(<ActionBar {...defaultProps} confirmEnabled={true} confirmBusy={false} />);
    expect(screen.getByRole("button", { name: /확정/ })).toBeEnabled();
  });
});

describe("ActionBar — 초기화 버튼", () => {
  it("resetEnabled=true → 초기화 활성", () => {
    render(<ActionBar {...defaultProps} resetEnabled={true} />);
    expect(screen.getByRole("button", { name: /이번 턴 배치 초기화/ })).toBeEnabled();
  });

  it("resetEnabled=false → 초기화 비활성", () => {
    render(<ActionBar {...defaultProps} resetEnabled={false} />);
    expect(screen.getByRole("button", { name: /이번 턴 배치 초기화/ })).toBeDisabled();
  });
});

describe("ActionBar — 드로우 버튼", () => {
  it("drawEnabled=true + drawPileCount>0 → 드로우 활성", () => {
    render(<ActionBar {...defaultProps} drawEnabled={true} drawPileCount={10} />);
    expect(screen.getByRole("button", { name: "타일 드로우" })).toBeEnabled();
  });

  it("drawEnabled=false + drawPileCount>0 → 드로우 비활성", () => {
    render(<ActionBar {...defaultProps} drawEnabled={false} drawPileCount={10} />);
    expect(screen.getByRole("button", { name: "타일 드로우" })).toBeDisabled();
  });

  it("drawPileCount=0 → 패스 버튼 렌더 (드로우 파일 소진)", () => {
    render(<ActionBar {...defaultProps} drawEnabled={true} drawPileCount={0} />);
    expect(screen.getByRole("button", { name: /턴 패스/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "타일 드로우" })).toBeNull();
  });

  it("drawPileCount>0 → 드로우 버튼 렌더", () => {
    render(<ActionBar {...defaultProps} drawEnabled={true} drawPileCount={78} />);
    expect(screen.getByRole("button", { name: "타일 드로우" })).toBeInTheDocument();
  });
});
