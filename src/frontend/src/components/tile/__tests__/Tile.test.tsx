/**
 * Tile 컴포넌트 단위 테스트 (P2-3/4 회귀 방지)
 *
 * 검증 대상: Tile.tsx SIZE_CLASS +24% 확대 및 하단 심볼/도트 확대.
 *
 * 오늘 수정:
 * - rack 42x58 → 52x72, table 34x46 → 44x60, icon 20x26 → 24x32, quad 28x38 → 34x46
 * - 접근성 심볼 text-[8px]→[10px], b세트 도트 w-1.5→w-2, 조커 ★ text-[9px]→[11px]
 */

import "@testing-library/jest-dom";
import React from "react";
import { render } from "@testing-library/react";
import Tile from "@/components/tile/Tile";

describe("Tile — 기본 렌더링", () => {
  it("숫자 타일 렌더 (R7a)", () => {
    const { container } = render(<Tile code="R7a" />);
    const el = container.querySelector('[role="img"]');
    expect(el).toBeInTheDocument();
    expect(el?.textContent).toContain("7");
  });

  it("조커 타일은 'JK' 텍스트 + 별표 렌더", () => {
    const { container } = render(<Tile code="JK1" />);
    const el = container.querySelector('[role="img"]');
    expect(el?.textContent).toContain("JK");
    expect(el?.textContent).toContain("★");
  });

  it("aria-label 이 타일 색+번호 기반으로 생성", () => {
    const { container } = render(<Tile code="B13a" />);
    const el = container.querySelector('[role="img"]');
    expect(el?.getAttribute("aria-label")).toBe("B13 타일");
  });

  it("조커 aria-label 은 '조커'", () => {
    const { container } = render(<Tile code="JK1" />);
    const el = container.querySelector('[role="img"]');
    expect(el?.getAttribute("aria-label")).toBe("조커");
  });
});

describe("Tile — SIZE_CLASS 확대 (P2-3 회귀 방지)", () => {
  it("rack variant: w-[52px] h-[72px] (42→52, 58→72)", () => {
    const { container } = render(<Tile code="R7a" size="rack" />);
    const el = container.querySelector('[role="img"]');
    expect(el?.className).toContain("w-[52px]");
    expect(el?.className).toContain("h-[72px]");
    // 2xl = 24px (tile-xl=20 에서 상향)
    expect(el?.className).toContain("text-tile-2xl");
  });

  it("table variant: w-[44px] h-[60px] (34→44, 46→60)", () => {
    const { container } = render(<Tile code="R7a" size="table" />);
    const el = container.querySelector('[role="img"]');
    expect(el?.className).toContain("w-[44px]");
    expect(el?.className).toContain("h-[60px]");
    // xl = 20px (tile-lg=16 에서 상향)
    expect(el?.className).toContain("text-tile-xl");
  });

  it("icon variant: w-[24px] h-[32px] (20→24, 26→32)", () => {
    const { container } = render(<Tile code="R7a" size="icon" />);
    const el = container.querySelector('[role="img"]');
    expect(el?.className).toContain("w-[24px]");
    expect(el?.className).toContain("h-[32px]");
    expect(el?.className).toContain("text-[12px]");
  });

  it("quad variant: w-[34px] h-[46px] (28→34, 38→46)", () => {
    const { container } = render(<Tile code="R7a" size="quad" />);
    const el = container.querySelector('[role="img"]');
    expect(el?.className).toContain("w-[34px]");
    expect(el?.className).toContain("h-[46px]");
    expect(el?.className).toContain("text-tile-lg");
  });

  it("mini variant 는 확대 대상 외 (유지)", () => {
    const { container } = render(<Tile code="R7a" size="mini" />);
    const el = container.querySelector('[role="img"]');
    expect(el?.className).toContain("w-[10px]");
    expect(el?.className).toContain("h-[16px]");
  });
});

describe("Tile — 하단 심볼/도트 (P2-4 회귀 방지)", () => {
  it("b세트 타일 → b세트 도트 렌더 (w-2 h-2, 6→8px)", () => {
    const { container } = render(<Tile code="R7b" size="rack" />);
    const dot = container.querySelector('[title="b 세트"]');
    expect(dot).toBeInTheDocument();
    expect(dot?.className).toContain("w-2");
    expect(dot?.className).toContain("h-2");
    expect(dot?.className).toContain("opacity-65");
  });

  it("a세트 타일 → b세트 도트 미렌더", () => {
    const { container } = render(<Tile code="R7a" size="rack" />);
    const dot = container.querySelector('[title="b 세트"]');
    expect(dot).toBeNull();
  });

  it("mini/icon 크기에서는 b세트 도트 생략", () => {
    const { container: miniC } = render(<Tile code="R7b" size="mini" />);
    const { container: iconC } = render(<Tile code="R7b" size="icon" />);
    expect(miniC.querySelector('[title="b 세트"]')).toBeNull();
    expect(iconC.querySelector('[title="b 세트"]')).toBeNull();
  });

  it("선택됨 배지(⬆) — text-[10px] w-4 h-4 (8→10px, w-3.5→w-4)", () => {
    const { container } = render(<Tile code="R7a" size="rack" selected />);
    const badge = Array.from(container.querySelectorAll("span")).find(
      (el) => el.textContent === "⬆"
    );
    expect(badge).toBeDefined();
    expect(badge?.className).toContain("text-[10px]");
    expect(badge?.className).toContain("w-4");
    expect(badge?.className).toContain("h-4");
  });

  it("조커 별표 ★ — text-[11px] (9→11px)", () => {
    const { container } = render(<Tile code="JK1" size="rack" />);
    const star = Array.from(container.querySelectorAll("span")).find(
      (el) => el.textContent === "★"
    );
    expect(star).toBeDefined();
    expect(star?.className).toContain("text-[11px]");
  });
});

describe("Tile — 접근성 심볼 (색약 대비)", () => {
  it("색상별 접근성 심볼이 렌더된다 (R=◆, B=●, Y=▲, K=■)", () => {
    const cases: Array<[string, string]> = [
      ["R7a", "◆"],
      ["B7a", "●"],
      ["Y7a", "▲"],
      ["K7a", "■"],
    ];
    for (const [code, symbol] of cases) {
      const { container } = render(
        <Tile code={code as `R${number}a` | `B${number}a` | `Y${number}a` | `K${number}a`} size="rack" />
      );
      expect(container.textContent).toContain(symbol);
    }
  });

  it("mini 크기에서는 접근성 심볼 생략", () => {
    const { container } = render(<Tile code="R7a" size="mini" />);
    expect(container.textContent).not.toContain("◆");
  });
});
