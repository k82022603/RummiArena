/**
 * dragStateStore — setActive, clearActive 테스트
 *
 * SSOT 매핑:
 *   - 58 §4.2 DragStateStore 타입
 *   - UR-06/07/08: 드래그 소스별 상태
 *   - F-21: activeTile 구독으로 호환 드롭존 계산
 */

import { act } from "@testing-library/react";
import { useDragStateStore } from "@/store/dragStateStore";
import type { TileCode } from "@/types/tile";
import type { DragSource } from "@/lib/dragEnd/dragEndReducer";

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------

function getStore() {
  return useDragStateStore.getState();
}

// ---------------------------------------------------------------------------
// 초기화
// ---------------------------------------------------------------------------

beforeEach(() => {
  act(() => {
    useDragStateStore.getState().clearActive();
  });
});

// ---------------------------------------------------------------------------
// 1. 초기 상태 테스트
// ---------------------------------------------------------------------------

describe("초기 상태", () => {
  it("activeTile은 null", () => {
    expect(getStore().activeTile).toBeNull();
  });

  it("activeSource는 null", () => {
    expect(getStore().activeSource).toBeNull();
  });

  it("hoverTarget은 null", () => {
    expect(getStore().hoverTarget).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. setActive 테스트
// ---------------------------------------------------------------------------

describe("setActive", () => {
  it("rack 소스 타일 드래그 설정", () => {
    const tile: TileCode = "R7a";
    const source: DragSource = { kind: "rack" };

    act(() => {
      useDragStateStore.getState().setActive(tile, source);
    });

    const store = getStore();
    expect(store.activeTile).toBe("R7a");
    expect(store.activeSource).toEqual({ kind: "rack" });
  });

  it("table 소스 타일 드래그 설정", () => {
    const tile: TileCode = "B5b";
    const source: DragSource = { kind: "table", groupId: "pending-1", index: 0 };

    act(() => {
      useDragStateStore.getState().setActive(tile, source);
    });

    const store = getStore();
    expect(store.activeTile).toBe("B5b");
    expect(store.activeSource).toEqual({ kind: "table", groupId: "pending-1", index: 0 });
  });

  it("조커 타일 드래그 설정", () => {
    const tile: TileCode = "JK1";
    const source: DragSource = { kind: "rack" };

    act(() => {
      useDragStateStore.getState().setActive(tile, source);
    });

    expect(getStore().activeTile).toBe("JK1");
  });
});

// ---------------------------------------------------------------------------
// 3. clearActive 테스트
// ---------------------------------------------------------------------------

describe("clearActive", () => {
  it("setActive 후 clearActive → 모두 null", () => {
    act(() => {
      useDragStateStore.getState().setActive("R7a", { kind: "rack" });
    });

    act(() => {
      useDragStateStore.getState().clearActive();
    });

    const store = getStore();
    expect(store.activeTile).toBeNull();
    expect(store.activeSource).toBeNull();
    expect(store.hoverTarget).toBeNull();
  });

  it("이미 null인 상태에서 clearActive → no-op (예외 없음)", () => {
    expect(() => {
      act(() => {
        useDragStateStore.getState().clearActive();
      });
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 4. setHoverTarget 테스트
// ---------------------------------------------------------------------------

describe("setHoverTarget", () => {
  it("호버 대상 설정", () => {
    act(() => {
      useDragStateStore.getState().setHoverTarget("group-abc");
    });
    expect(getStore().hoverTarget).toBe("group-abc");
  });

  it("null로 호버 해제", () => {
    act(() => {
      useDragStateStore.getState().setHoverTarget("group-abc");
    });
    act(() => {
      useDragStateStore.getState().setHoverTarget(null);
    });
    expect(getStore().hoverTarget).toBeNull();
  });

  it("clearActive 시 hoverTarget도 초기화", () => {
    act(() => {
      useDragStateStore.getState().setActive("R7a", { kind: "rack" });
      useDragStateStore.getState().setHoverTarget("group-abc");
    });
    act(() => {
      useDragStateStore.getState().clearActive();
    });
    expect(getStore().hoverTarget).toBeNull();
  });
});
