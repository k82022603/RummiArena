/**
 * PR-D-D01 RED spec — 디자인 토큰 30종 CSS 변수화
 *
 * 검증 대상: docs/02-design/57-game-rule-visual-language.md §1.1
 * SSOT: 57 §1.1 기반 색상 토큰 30종 + 애니메이션 토큰 7종 + spacing 토큰 6종
 *
 * 관련 룰 ID: UR-01~UR-36 (base token layer)
 * 관련 F-NN: F-21 (호환 드롭존 — drop-allow/drop-block 토큰 의존)
 *
 * RED 이유:
 *   globals.css 에는 현재 57 §1.1 정의 토큰 중 다음이 누락/불일치:
 *   - --tile-text-light, --tile-text-dark (타일 숫자 색)
 *   - --tile-joker-ring (조커 무지개 링)
 *   - --pending-border, --pending-bg, --pending-invalid (pending 그룹)
 *   - --toast-error, --toast-info, --toast-warn (토스트 3종)
 *   - --highlight-mine, --highlight-opp (타일 글로우)
 *   - --timer-normal, --timer-warn, --timer-critical (타이머 3단계)
 *   - --state-connected, --state-disconn, --state-forfeited, --state-meld-done, --state-meld-none (플레이어 상태 5종)
 *   - --dur-instant, --dur-fast, --dur-normal, --dur-slow (애니메이션 시간)
 *   - --ease-out, --ease-bounce (easing)
 *   - --space-header-h, --space-player-card-compact-h, --space-rack-h, --space-action-bar-h (spacing)
 *
 * GREEN 조건: globals.css :root 에 위 모든 변수가 정확한 값으로 정의됨
 */

// Node.js fs로 globals.css 텍스트를 직접 읽어 검증
// (브라우저 CSSStyleDeclaration 없는 환경에서 동작)
import * as fs from "fs";
import * as path from "path";

const GLOBALS_CSS_PATH = path.resolve(
  __dirname,
  "../app/globals.css"
);

/** globals.css 파일 내용을 한 번만 읽음 */
let cssText: string;
beforeAll(() => {
  cssText = fs.readFileSync(GLOBALS_CSS_PATH, "utf-8");
});

/**
 * :root 블록에서 CSS 변수값을 추출하는 헬퍼
 * 단순 정규식 파싱 — :root 블록 전체를 대상으로 검색
 */
function getRootVar(varName: string): string | null {
  // e.g. --tile-red: #E74C3C
  const pattern = new RegExp(
    `${varName.replace(/[-]/g, "\\-")}\\s*:\\s*([^;\\n]+)`,
    "i"
  );
  const match = cssText.match(pattern);
  return match ? match[1].trim() : null;
}

// ─── §1 기반 색상 토큰 (57 §1.1) ────────────────────────────────────────────

describe("[UR-01~UR-36][F-21] 디자인 토큰 — 타일 색상 4종", () => {
  test("--tile-red 는 #E74C3C 또는 소문자 동등값이어야 한다", () => {
    const v = getRootVar("--tile-red");
    expect(v).not.toBeNull();
    expect(v!.toLowerCase()).toBe("#e74c3c");
  });

  test("--tile-blue 는 #3498DB 또는 소문자 동등값이어야 한다", () => {
    const v = getRootVar("--tile-blue");
    expect(v).not.toBeNull();
    expect(v!.toLowerCase()).toBe("#3498db");
  });

  test("--tile-yellow 는 #F1C40F 또는 소문자 동등값이어야 한다", () => {
    const v = getRootVar("--tile-yellow");
    expect(v).not.toBeNull();
    expect(v!.toLowerCase()).toBe("#f1c40f");
  });

  test("--tile-black 은 #2C3E50 또는 소문자 동등값이어야 한다", () => {
    const v = getRootVar("--tile-black");
    expect(v).not.toBeNull();
    expect(v!.toLowerCase()).toBe("#2c3e50");
  });
});

describe("[UR-01~UR-36][F-21] 디자인 토큰 — 타일 텍스트 색 (현재 누락 → RED)", () => {
  test("--tile-text-light 는 #FFFFFF 이어야 한다 (밝은 배경 위 숫자)", () => {
    const v = getRootVar("--tile-text-light");
    expect(v).not.toBeNull();
    expect(v!.toLowerCase()).toBe("#ffffff");
  });

  test("--tile-text-dark 는 #1A1A1A 이어야 한다 (노랑 배경 위 숫자)", () => {
    const v = getRootVar("--tile-text-dark");
    expect(v).not.toBeNull();
    expect(v!.toLowerCase()).toBe("#1a1a1a");
  });
});

describe("[UR-09][F-21] 디자인 토큰 — 조커 링 (현재 누락 → RED)", () => {
  test("--tile-joker-ring 은 #C084FC 이어야 한다", () => {
    const v = getRootVar("--tile-joker-ring");
    expect(v).not.toBeNull();
    expect(v!.toLowerCase()).toBe("#c084fc");
  });
});

describe("[UR-01~UR-36][F-21] 디자인 토큰 — 보드 배경", () => {
  test("--board-bg 는 #1A3328 또는 소문자 동등값이어야 한다", () => {
    const v = getRootVar("--board-bg");
    expect(v).not.toBeNull();
    expect(v!.toLowerCase()).toBe("#1a3328");
  });

  test("--board-border 는 #2A5A3A 또는 소문자 동등값이어야 한다", () => {
    const v = getRootVar("--board-border");
    expect(v).not.toBeNull();
    expect(v!.toLowerCase()).toBe("#2a5a3a");
  });
});

describe("[UR-10][UR-14][UR-18][F-21] 디자인 토큰 — 드롭존 허용 (이미 존재, GREEN 확인)", () => {
  test("--drop-allow 는 #27AE60 소문자이어야 한다", () => {
    const v = getRootVar("--drop-allow");
    expect(v).not.toBeNull();
    expect(v!.toLowerCase()).toBe("#27ae60");
  });

  test("--drop-allow-bg 는 rgba(39,174,96,0.12) 계열이어야 한다", () => {
    const v = getRootVar("--drop-allow-bg");
    expect(v).not.toBeNull();
    // 공백 정규화 후 포함 여부 확인
    expect(v!.replace(/\s/g, "").toLowerCase()).toContain("rgba(39,174,96");
  });

  test("--drop-allow-border 는 rgba(39,174,96,0.7) 계열이어야 한다", () => {
    const v = getRootVar("--drop-allow-border");
    expect(v).not.toBeNull();
    expect(v!.replace(/\s/g, "").toLowerCase()).toContain("rgba(39,174,96");
  });
});

describe("[UR-14][UR-19][F-21] 디자인 토큰 — 드롭존 차단 (이미 존재, GREEN 확인)", () => {
  test("--drop-block 은 #C0392B 소문자이어야 한다", () => {
    const v = getRootVar("--drop-block");
    expect(v).not.toBeNull();
    expect(v!.toLowerCase()).toBe("#c0392b");
  });

  test("--drop-block-bg 는 rgba(192,57,43,0.12) 계열이어야 한다", () => {
    const v = getRootVar("--drop-block-bg");
    expect(v).not.toBeNull();
    expect(v!.replace(/\s/g, "").toLowerCase()).toContain("rgba(192,57,43");
  });

  test("--drop-block-border 는 rgba(192,57,43,0.7) 계열이어야 한다", () => {
    const v = getRootVar("--drop-block-border");
    expect(v).not.toBeNull();
    expect(v!.replace(/\s/g, "").toLowerCase()).toContain("rgba(192,57,43");
  });
});

describe("[UR-20][F-21] 디자인 토큰 — pending 그룹 (현재 누락 → RED)", () => {
  test("--pending-border 는 #F1C40F 이어야 한다 (노랑 점선)", () => {
    const v = getRootVar("--pending-border");
    expect(v).not.toBeNull();
    expect(v!.toLowerCase()).toBe("#f1c40f");
  });

  test("--pending-bg 는 rgba(241,196,15,0.10) 계열이어야 한다", () => {
    const v = getRootVar("--pending-bg");
    expect(v).not.toBeNull();
    expect(v!.replace(/\s/g, "").toLowerCase()).toContain("rgba(241,196,15");
  });

  test("--pending-invalid 는 #E74C3C 이어야 한다 (pending 무효 빨간 ring)", () => {
    const v = getRootVar("--pending-invalid");
    expect(v).not.toBeNull();
    expect(v!.toLowerCase()).toBe("#e74c3c");
  });
});

describe("[UR-21][UR-29][UR-30] 디자인 토큰 — 토스트 3종 (현재 누락 → RED)", () => {
  test("--toast-error 는 #C0392B 이어야 한다", () => {
    const v = getRootVar("--toast-error");
    expect(v).not.toBeNull();
    expect(v!.toLowerCase()).toBe("#c0392b");
  });

  test("--toast-info 는 #3498DB 이어야 한다", () => {
    const v = getRootVar("--toast-info");
    expect(v).not.toBeNull();
    expect(v!.toLowerCase()).toBe("#3498db");
  });

  test("--toast-warn 은 #E67E22 이어야 한다", () => {
    const v = getRootVar("--toast-warn");
    expect(v).not.toBeNull();
    expect(v!.toLowerCase()).toBe("#e67e22");
  });
});

describe("[UR-02][UR-05] 디자인 토큰 — 타일 글로우 (현재 누락 → RED)", () => {
  test("--highlight-mine 은 rgba(74,222,128,0.90) 계열이어야 한다", () => {
    const v = getRootVar("--highlight-mine");
    expect(v).not.toBeNull();
    expect(v!.replace(/\s/g, "").toLowerCase()).toContain("rgba(74,222,128");
  });

  test("--highlight-opp 는 rgba(251,146,60,0.90) 계열이어야 한다", () => {
    const v = getRootVar("--highlight-opp");
    expect(v).not.toBeNull();
    expect(v!.replace(/\s/g, "").toLowerCase()).toContain("rgba(251,146,60");
  });
});

describe("[UR-26] 디자인 토큰 — 타이머 3단계 (현재 누락 → RED)", () => {
  test("--timer-normal 은 #3498DB 이어야 한다", () => {
    const v = getRootVar("--timer-normal");
    expect(v).not.toBeNull();
    expect(v!.toLowerCase()).toBe("#3498db");
  });

  test("--timer-warn 은 #F1C40F 이어야 한다", () => {
    const v = getRootVar("--timer-warn");
    expect(v).not.toBeNull();
    expect(v!.toLowerCase()).toBe("#f1c40f");
  });

  test("--timer-critical 은 #E74C3C 이어야 한다", () => {
    const v = getRootVar("--timer-critical");
    expect(v).not.toBeNull();
    expect(v!.toLowerCase()).toBe("#e74c3c");
  });
});

describe("[UR-32][UR-13] 디자인 토큰 — 플레이어 상태 5종 (현재 누락 → RED)", () => {
  test("--state-connected 는 #3FB950 이어야 한다", () => {
    const v = getRootVar("--state-connected");
    expect(v).not.toBeNull();
    expect(v!.toLowerCase()).toBe("#3fb950");
  });

  test("--state-disconn 은 #F0883E 이어야 한다", () => {
    const v = getRootVar("--state-disconn");
    expect(v).not.toBeNull();
    expect(v!.toLowerCase()).toBe("#f0883e");
  });

  test("--state-forfeited 는 #484F58 이어야 한다", () => {
    const v = getRootVar("--state-forfeited");
    expect(v).not.toBeNull();
    expect(v!.toLowerCase()).toBe("#484f58");
  });

  test("--state-meld-done 은 #3FB950 이어야 한다", () => {
    const v = getRootVar("--state-meld-done");
    expect(v).not.toBeNull();
    expect(v!.toLowerCase()).toBe("#3fb950");
  });

  test("--state-meld-none 은 rgba(231,76,60,0.50) 계열이어야 한다", () => {
    const v = getRootVar("--state-meld-none");
    expect(v).not.toBeNull();
    expect(v!.replace(/\s/g, "").toLowerCase()).toContain("rgba(231,76,60");
  });
});

// ─── §1.2 애니메이션 토큰 (현재 누락 → RED) ──────────────────────────────────

describe("[UR-06][UR-17] 디자인 토큰 — 애니메이션 duration (현재 누락 → RED)", () => {
  test("--dur-instant 는 50ms 이어야 한다", () => {
    const v = getRootVar("--dur-instant");
    expect(v).not.toBeNull();
    expect(v!.trim()).toBe("50ms");
  });

  test("--dur-fast 는 150ms 이어야 한다", () => {
    const v = getRootVar("--dur-fast");
    expect(v).not.toBeNull();
    expect(v!.trim()).toBe("150ms");
  });

  test("--dur-normal 은 300ms 이어야 한다", () => {
    const v = getRootVar("--dur-normal");
    expect(v).not.toBeNull();
    expect(v!.trim()).toBe("300ms");
  });

  test("--dur-slow 는 500ms 이어야 한다", () => {
    const v = getRootVar("--dur-slow");
    expect(v).not.toBeNull();
    expect(v!.trim()).toBe("500ms");
  });
});

describe("[UR-06][UR-17] 디자인 토큰 — easing (현재 누락 → RED)", () => {
  test("--ease-out 은 cubic-bezier(0,0,0.2,1) 이어야 한다", () => {
    const v = getRootVar("--ease-out");
    expect(v).not.toBeNull();
    // 공백 정규화 후 비교
    expect(v!.replace(/\s/g, "").toLowerCase()).toBe("cubic-bezier(0,0,0.2,1)");
  });

  test("--ease-bounce 는 cubic-bezier(0.68,-0.55,0.265,1.55) 이어야 한다", () => {
    const v = getRootVar("--ease-bounce");
    expect(v).not.toBeNull();
    expect(v!.replace(/\s/g, "").toLowerCase()).toBe(
      "cubic-bezier(0.68,-0.55,0.265,1.55)"
    );
  });
});

// ─── §11.4 spacing 토큰 (현재 누락 → RED) ────────────────────────────────────

describe("[UR-01][F-21] 디자인 토큰 — spacing 레이아웃 (현재 누락 → RED)", () => {
  test("--space-header-h 는 32px 이어야 한다", () => {
    const v = getRootVar("--space-header-h");
    expect(v).not.toBeNull();
    expect(v!.trim()).toBe("32px");
  });

  test("--space-player-card-compact-h 는 56px 이어야 한다", () => {
    const v = getRootVar("--space-player-card-compact-h");
    expect(v).not.toBeNull();
    expect(v!.trim()).toBe("56px");
  });

  test("--space-rack-h 는 100px 이어야 한다", () => {
    const v = getRootVar("--space-rack-h");
    expect(v).not.toBeNull();
    expect(v!.trim()).toBe("100px");
  });

  test("--space-action-bar-h 는 56px 이어야 한다", () => {
    const v = getRootVar("--space-action-bar-h");
    expect(v).not.toBeNull();
    expect(v!.trim()).toBe("56px");
  });
});
