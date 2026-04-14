# 38. 색각 접근성 팔레트 + 재배치 Pulse Ring 스펙

**작성자**: designer-1
**작성일**: 2026-04-14 (Sprint 6 Day 3)
**상태**: Draft
**관련 작업**: Task #6 [B2] Playtest S4 결정론적 시드 UX + 색각 접근성
**관련 문서**: `docs/02-design/37-playtest-s4-deterministic-ux.md`, `docs/02-design/07-ui-wireframe.md`, `docs/02-design/16-ai-character-visual-spec.md`

---

## 1. 배경과 문제 정의

### 1.1 현재 재배치 드래그 시 단일 녹색 pulse

`src/frontend/src/components/game/GameBoard.tsx:83-88` 의 `DroppableGroupWrapper` 컴포넌트는 드래그 중인 타일이 머지 가능한 그룹을 다음과 같이 강조한다.

```tsx
const ringClass = isOver
  ? "ring-2 ring-green-400/80 rounded-lg"      // 정확히 hover 중
  : isCompatible
    ? "ring-2 ring-green-400/40 rounded-lg animate-pulse"  // 호환 가능 (드래그 중)
    : undefined;
```

**단일 녹색(Tailwind `green-400` = `#4ADE80`)** 만으로 다음 **세 가지 상태**를 구분해야 한다.

| 상태 | 의미 | 현재 시각화 |
|------|------|------------|
| `isOver` | 드롭 직전 hover 중 | `ring-green-400/80` (불투명) |
| `isCompatible` | 머지 가능 후보 (드래그 중) | `ring-green-400/40` + `animate-pulse` |
| `incompatible` | 머지 불가능 | ring 없음 |

### 1.2 색각이상자(CVD) 관점에서의 문제

전세계 남성의 약 **8%(1/12)**, 여성의 약 **0.5%(1/200)** 가 색각이상(Color Vision Deficiency)을 가진다. 가장 흔한 유형은 다음 세 가지다.

| 유형 | 약어 | 증상 | 영향 |
|------|------|------|------|
| 적색약/적색맹 | Protanopia/Protanomaly | 빨강 계열 감쇠 | 빨강-녹색 구분 곤란 |
| 녹색약/녹색맹 | Deuteranopia/Deuteranomaly | 녹색 계열 감쇠 | **현재 pulse ring 가장 큰 영향** |
| 청색약/청색맹 | Tritanopia/Tritanomaly | 파랑-노랑 감쇠 | 드물지만 존재 |

현재 `ring-green-400` (`#4ADE80`, HSL 142°, S 77%, L 64%) 은 녹색맹(Deuteranopia) 시뮬레이터 기준 **채도 62% 감소**. 어두운 보드 배경(`#1f2937` 근처) 위에서 `isCompatible` (/40 = 40% 불투명) 과 `isOver` (/80 = 80% 불투명) 의 차이도 CVD 에서는 구분이 모호해진다.

### 1.3 색 이외에 정보를 전달하는 부재

WCAG 2.1 **Success Criterion 1.4.1 "Use of Color"** (Level A) 은 색이 정보 전달의 **유일한 수단이어서는 안 된다** 고 규정한다. 현재 pulse ring 은 **색(녹색)** 과 **애니메이션(pulse)** 만으로 3개 상태를 구분하고 있어, 애니메이션을 비활성화(prefers-reduced-motion)하면 단순히 "녹색 테두리 유무" 로만 전달된다 — WCAG 1.4.1 위반 여지가 있다.

### 1.4 기존 자산 — 이미 타일에는 TILE_ACCESSIBILITY_SYMBOL 이 있다

`src/frontend/src/types/tile.ts:85-91` 에는 이미 색각 보조 심볼이 정의되어 있다.

```ts
export const TILE_ACCESSIBILITY_SYMBOL: Record<TileColor | "joker", string> = {
  R: "◆",  // 다이아몬드
  B: "●",  // 원
  Y: "▲",  // 삼각형
  K: "■",  // 사각형
  joker: "★",
};
```

**타일 자체는 이미 WCAG 준수**. 문제는 **상호작용 상태(pulse ring, 드래그 feedback)** 가 뒤늦게 추가되면서 이 원칙을 따르지 않았다는 점이다. 본 문서는 그 격차를 메운다.

---

## 2. Okabe-Ito 8색 안전 팔레트

### 2.1 팔레트 개요

2008년 Okabe & Ito 가 제안한 8색 팔레트는 **3가지 주요 CVD 유형에서 모두 구분 가능**한 과학적으로 검증된 세트다. Nature Methods 등 학술지에서 권장.

| 이름 | HEX | R,G,B | 용도 제안 |
|------|-----|-------|----------|
| Black | `#000000` | 0,0,0 | 테두리, 텍스트 |
| Orange | `#E69F00` | 230,159,0 | **경고/주의** (현재 "incompatible" 대체 후보) |
| Sky Blue | `#56B4E9` | 86,180,233 | **정보/호환 가능** (현재 "isCompatible" 대체) |
| Bluish Green | `#009E73` | 0,158,115 | **성공/확정** (현재 "isOver" 대체) |
| Yellow | `#F0E442` | 240,228,66 | 강조 (타일 Y와 혼동 주의) |
| Blue | `#0072B2` | 0,114,178 | 링크, 선택 |
| Vermillion | `#D55E00` | 213,94,0 | 에러, 실패 |
| Reddish Purple | `#CC79A7` | 204,121,167 | 보조 강조 |

### 2.2 CVD 시뮬레이터 검증

| 원색 | Normal | Protanopia | Deuteranopia | Tritanopia | 구분성 |
|------|--------|-----------|--------------|------------|--------|
| Sky Blue `#56B4E9` | 하늘색 | 회청색 | 회청색 | 청록색 | O |
| Bluish Green `#009E73` | 청록 | 암회록 | 암회록 | 진녹 | O |
| Orange `#E69F00` | 주황 | 황갈색 | 황갈색 | 분홍 | O |

**Sky Blue ↔ Bluish Green** 은 3가지 CVD 모두에서 **명도(L값) 차이로 구분 가능**. 현재 `green-400` 하나로 isOver/isCompatible 을 투명도로만 구분하는 것과 대조된다.

### 2.3 프로젝트 기존 타일 색과의 호환성 체크

CLAUDE.md 가 정의하는 타일 색은 다음과 같다.
- Red: `#E74C3C`
- Blue: `#3498DB`
- Yellow: `#F1C40F`
- Black: `#2C3E50`

| Okabe-Ito | 타일 색과 충돌? | 대응 |
|-----------|---------------|------|
| Sky Blue `#56B4E9` | Blue `#3498DB` 와 근접 | **상호작용 전용**으로만 사용, 타일 배경에는 사용 금지 |
| Bluish Green `#009E73` | 충돌 없음 | 자유 사용 |
| Orange `#E69F00` | Red `#E74C3C` 와 색상은 다르지만 CVD에서 혼동 가능 | 경고 아이콘(⚠) 병기 필수 |
| Yellow `#F0E442` | Yellow `#F1C40F` 와 유사 | 상호작용 전용으로도 사용 금지 — 타일과 충돌 |
| Vermillion `#D55E00` | Red `#E74C3C` 와 유사 | 실패 상태에만, 아이콘(✗) 병기 |

**결론**: 본 프로젝트에서 **상호작용 상태에 사용할 Okabe-Ito 컬러 4종** 은 Sky Blue, Bluish Green, Orange, Vermillion 로 한정한다.

---

## 3. 재배치 Pulse Ring 개정 스펙

### 3.1 상태별 시각화 (색 + 형태 + 애니메이션)

| 상태 | 색 | 불투명도 | 테두리 두께 | 아이콘 오버레이 | 애니메이션 |
|------|-----|---------|------------|----------------|----------|
| `isOver` (드롭 직전 hover) | Bluish Green `#009E73` | 100% | **ring-4** (굵음) | ✓ (우상단) | `animate-pulse` (빠름, 1s) |
| `isCompatible` (드래그 중 머지 가능) | Sky Blue `#56B4E9` | 60% | ring-2 (중간) | ◇ (우상단, 점선) | `animate-pulse` (느림, 2s) |
| `incompatible` (드래그 중 머지 불가) | Orange `#E69F00` | 40% | ring-1 dashed | ⚠ (우상단) | 없음 |
| `idle` | — | — | 없음 | 없음 | 없음 |

**핵심 원칙**:
1. **색 + 아이콘 + 테두리 두께 + 애니메이션 리듬** 네 가지 차원으로 구분 — 어느 하나가 실패해도 나머지로 상태 식별 가능
2. `prefers-reduced-motion: reduce` 매체 쿼리 존중 — 애니메이션 비활성화 시에도 색/아이콘/두께로 여전히 구분 가능
3. 아이콘은 **도형** 으로 구성 (✓, ◇, ⚠) — 텍스트 미사용, 언어 독립적

### 3.2 TailwindCSS 커스텀 설정

`src/frontend/tailwind.config.ts` 에 Okabe-Ito 색상 추가 제안:

```ts
theme: {
  extend: {
    colors: {
      // 색각 안전 상호작용 색상 (Okabe-Ito)
      cvd: {
        success: "#009E73",   // Bluish Green — isOver
        info: "#56B4E9",      // Sky Blue — isCompatible
        warning: "#E69F00",   // Orange — incompatible
        error: "#D55E00",     // Vermillion — failure
      },
    },
    animation: {
      "pulse-fast": "pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      "pulse-slow": "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
    },
  },
},
```

### 3.3 GameBoard.tsx 개정안

```tsx
// src/frontend/src/components/game/GameBoard.tsx
function DroppableGroupWrapper({
  groupId,
  isCompatible,
  isIncompatible,
  children,
}: {
  groupId: string;
  isCompatible?: boolean;
  isIncompatible?: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: groupId });

  // 상태 결정 (우선순위: isOver > isCompatible > isIncompatible)
  let ringClass: string | undefined;
  let iconOverlay: React.ReactNode = null;

  if (isOver) {
    ringClass = "ring-4 ring-cvd-success rounded-lg animate-pulse-fast";
    iconOverlay = (
      <span
        aria-label="드롭 준비 완료"
        className="absolute -top-2 -right-2 z-10 w-6 h-6 rounded-full bg-cvd-success text-white text-sm flex items-center justify-center shadow-md"
      >
        ✓
      </span>
    );
  } else if (isCompatible) {
    ringClass = "ring-2 ring-cvd-info/60 rounded-lg animate-pulse-slow";
    iconOverlay = (
      <span
        aria-label="호환 가능 그룹"
        className="absolute -top-2 -right-2 z-10 w-5 h-5 rounded-full border-2 border-dashed border-cvd-info bg-gray-900/50 text-cvd-info text-xs flex items-center justify-center"
      >
        ◇
      </span>
    );
  } else if (isIncompatible) {
    ringClass = "ring-1 ring-cvd-warning/40 ring-dashed rounded-lg";
    iconOverlay = (
      <span
        aria-label="호환 불가"
        className="absolute -top-2 -right-2 z-10 w-5 h-5 rounded-full bg-cvd-warning text-white text-xs flex items-center justify-center"
      >
        ⚠
      </span>
    );
  }

  return (
    <div ref={setNodeRef} className={`relative ${ringClass ?? ""}`}>
      {iconOverlay}
      {children}
    </div>
  );
}
```

**주요 변경**:
- `isIncompatible` prop 추가 (명시적 "머지 불가" 상태)
- 아이콘 오버레이를 `absolute -top-2 -right-2` 로 배치 (타일 내용 가리지 않음)
- `aria-label` 로 스크린리더 지원
- `prefers-reduced-motion` 대응은 Tailwind 가 `motion-reduce:animate-none` 유틸리티로 지원 — 필요 시 ringClass 에 병기

### 3.4 `prefers-reduced-motion` 대응

```tsx
const ringClass = isOver
  ? "ring-4 ring-cvd-success rounded-lg animate-pulse-fast motion-reduce:animate-none"
  : ...
```

애니메이션이 꺼져도 색(Bluish Green) + 테두리 두께(ring-4) + 아이콘(✓) 로 여전히 구분된다.

---

## 4. Admin UI Playtest S4 적용 (37번 문서 연계)

`docs/02-design/37-playtest-s4-deterministic-ux.md` §4 에서 정의한 Admin 페이지의 실행 결과 카드에 동일 팔레트를 적용한다.

### 4.1 실행 결과 상태 시각화

| 상태 | 색 | 아이콘 | 사용처 |
|------|-----|--------|--------|
| PASS | `cvd-success` (#009E73) | ✓ | 체크 항목 모두 통과 |
| FAIL | `cvd-error` (#D55E00) | ✗ | INVALID_MOVE 또는 체크 실패 |
| RUNNING | gray-500 | ⟳ (회전) | 실행 중 |
| WARN | `cvd-warning` (#E69F00) | ⚠ | 부분 통과 또는 타임아웃 |

**예시 마크업**:
```tsx
<div className="flex items-center gap-2">
  <span className="w-4 h-4 rounded-full bg-cvd-success flex items-center justify-center text-white text-[10px]">✓</span>
  <span className="text-cvd-success font-medium">PASS</span>
  <span className="text-gray-400">(5.3s)</span>
</div>
```

색이 보이지 않아도 `✓` 아이콘 + "PASS" 텍스트로 정보 완결. WCAG 1.4.1 준수.

### 4.2 체크 항목 리스트

```
✓ initial_meld_done           ← cvd-success + ✓
✓ joker_set_placed (turn 5)    ← cvd-success + ✓
✗ joker_exchange_valid         ← cvd-error + ✗
✓ universe_conservation_106    ← cvd-success + ✓
```

---

## 5. 검증 절차

### 5.1 CVD 시뮬레이터 체크리스트

구현 후 다음 도구로 검증:

1. **Chrome DevTools > Rendering > Emulate vision deficiencies**
   - protanopia, deuteranopia, tritanopia, achromatopsia 모두 확인
2. **Stark 플러그인** (Figma/VSCode) — 디자인 단계 검증
3. **Coblis** (온라인 시뮬레이터) — 스크린샷 업로드 후 확인

### 5.2 테스트 시나리오

| 시나리오 | 검증 내용 |
|---------|----------|
| 정상 시야 + 드래그 | Bluish Green vs Sky Blue 구분 명확 |
| Deuteranopia + 드래그 | 두 상태가 명도 차 + 아이콘으로 구분 가능 |
| Protanopia + 드래그 | 동일 |
| Tritanopia + 드래그 | 동일 |
| `prefers-reduced-motion: reduce` | pulse 없이도 구분 가능 |
| 스크린리더 (NVDA/VoiceOver) | `aria-label` 읽힘 확인 |

### 5.3 자동화된 접근성 테스트

`src/frontend/e2e/` 에 Playwright + axe-core 테스트 추가 제안:

```ts
// src/frontend/e2e/accessibility/drag-highlight.spec.ts
test("drag highlight meets WCAG 1.4.1", async ({ page }) => {
  await page.goto("/game/demo");
  await page.dragAndDrop("[data-tile='R5a']", "[data-group='run-1']");

  // axe-core 실행
  const results = await injectAxe(page);
  expect(results.violations.filter(v => v.id === "color-contrast")).toHaveLength(0);
});
```

---

## 6. 마이그레이션 계획

### 6.1 Phase 1 (Sprint 6 Day 3~4) — 즉시 적용

- [ ] `tailwind.config.ts` 에 `cvd` 색상 추가
- [ ] `GameBoard.tsx:83` `DroppableGroupWrapper` 리팩터 (§3.3 코드)
- [ ] 아이콘 오버레이 (✓/◇/⚠) 추가
- [ ] `aria-label` 추가

### 6.2 Phase 2 (Sprint 6 Day 5) — 포괄 적용

- [ ] Playtest S4 Admin 페이지 (B4 작업, 37번 문서 §4) 에 본 팔레트 적용
- [ ] 기존 `recentTileVariant` (mine=녹색, opponent=주황) 을 Okabe-Ito 로 전환
- [ ] AI 캐릭터 뱃지 (`docs/02-design/16-ai-character-visual-spec.md`) 색상 재점검

### 6.3 Phase 3 (Sprint 6 후반) — 회귀 방지

- [ ] Playwright axe-core 테스트 추가
- [ ] ESLint 규칙: `ring-green-400`, `ring-red-400` 등 비안전 색 직접 사용 경고
- [ ] 디자인 토큰 문서화 (`docs/02-design/07-ui-wireframe.md` 업데이트)

---

## 7. 주의사항과 트레이드오프

### 7.1 타일 Blue (`#3498DB`) 와 Sky Blue (`#56B4E9`) 의 근접성

드래그 중 Blue 타일을 Sky Blue ring 그룹에 넣을 때, CVD 사용자에게 **타일과 ring 이 색상으로 섞여 보일 수 있다**. 이는 다음으로 완화:
- Sky Blue 는 **60% 불투명**, 타일 배경은 100% 불투명 — 명도 차 존재
- ring 은 타일 **외곽**에만 나타남 (내부 아님)
- 아이콘(◇) 이 우상단에 항상 존재

**리스크 수준**: 낮음. 그러나 실제 사용자 테스트에서 확인 필요 (애벌레에게 요청).

### 7.2 아이콘 크기

아이콘이 너무 작으면(<12px) CVD 사용자와 노안 사용자 모두 인지 어려움. 본 스펙은 20~24px 사이로 설정.

### 7.3 애니메이션 주파수

1초(fast) vs 2초(slow) 는 **인지적 구분** 을 만든다 — 속도가 다르면 서로 다른 정보로 처리된다(Perception Psychology). 단, 1초 이하 주파수는 전정기관 민감자에게 부담. **1초 미만 금지**.

---

## 8. 참조

- **Okabe-Ito 원본**: Okabe, M., & Ito, K. (2008). Color Universal Design (CUD).
- **WCAG 2.1 SC 1.4.1 Use of Color**: https://www.w3.org/WAI/WCAG21/Understanding/use-of-color.html
- **현재 pulse ring 구현**: `src/frontend/src/components/game/GameBoard.tsx:83-88`
- **기존 타일 접근성 심볼**: `src/frontend/src/types/tile.ts:85-91`
- **타일 색상 토큰**: `CLAUDE.md` > Tile Encoding 섹션
- **연계 문서**: `docs/02-design/37-playtest-s4-deterministic-ux.md` §7 (Admin UI 적용)
- **UI 와이어프레임 메인 문서**: `docs/02-design/07-ui-wireframe.md`
- **AI 캐릭터 비주얼 스펙** (색각 연계 필요): `docs/02-design/16-ai-character-visual-spec.md`
