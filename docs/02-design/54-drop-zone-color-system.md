# 드롭존 색상 시스템 설계

**문서 번호**: 54
**작성**: designer (Claude Sonnet 4.6)
**작성일**: 2026-04-24
**브랜치**: `feature/ux-004-designer-spec`
**연관**:
- `docs/02-design/53-ux004-extend-lock-copy.md` — UX-004 카피 스펙
- `src/frontend/src/app/globals.css` — 토큰 정의 위치
- `src/frontend/tailwind.config.ts` — Tailwind 색상 맵
- `src/frontend/src/components/game/GameBoard.tsx` — 적용 대상 컴포넌트

---

## 1. 문제 정의

현재 dnd-kit 기본 오버레이는 드롭 허용/차단 상태를 동일하게 렌더링한다. 사용자는 드래그 중에 "이 자리에 놓을 수 있는가"를 시각적으로 알 수 없다. 특히 `hasInitialMeld=false` 상태에서 서버 멜드 위로 드래그 시 차단 피드백이 없어 UX-004 혼란이 발생한다.

---

## 2. 드롭존 3상태 정의

```
┌─────────────────────────────────────────────────────────────────────┐
│                    드롭존 3상태 시각 모델                             │
├────────────────┬──────────────────┬──────────────────────────────────┤
│ 상태           │ 유휴 (Idle)       │ 허용 (Allow)   │ 차단 (Block)   │
├────────────────┼──────────────────┼────────────────┼────────────────┤
│ 트리거         │ 드래그 없음       │ 유효한 타일    │ 규칙 위반      │
│                │                  │ 위에서 hover   │ 타일 hover     │
├────────────────┼──────────────────┼────────────────┼────────────────┤
│ border 스타일  │ board-border     │ 실선 2px       │ 점선 2px       │
│                │ (#2A5A3A)        │ (#27AE60 70%)  │ (#C0392B 70%)  │
├────────────────┼──────────────────┼────────────────┼────────────────┤
│ 배경 색상      │ board-bg         │ 초록 12% tint  │ 빨간 12% tint  │
│                │ (#1A3328)        │ rgba(39,174,   │ rgba(192,57,   │
│                │                  │ 96, 0.12)      │ 43, 0.12)      │
├────────────────┼──────────────────┼────────────────┼────────────────┤
│ 추가 패턴      │ 없음             │ 없음           │ 대각선 해칭    │
│ (색약 보조)    │                  │                │ (-45deg)       │
├────────────────┼──────────────────┼────────────────┼────────────────┤
│ 애니메이션     │ 없음             │ 0.12s ease     │ 0.12s ease     │
│                │                  │ fade-in        │ fade-in        │
├────────────────┼──────────────────┼────────────────┼────────────────┤
│ CSS 클래스     │ (기본값)         │ .dropzone-allow│ .dropzone-block│
└────────────────┴──────────────────┴────────────────┴────────────────┘
```

### ASCII 목업: 드롭존 3상태

```
유휴 (Idle):                  허용 (Allow):                차단 (Block):
┌─────────────────────┐       ┌─────────────────────┐      ╔═════════════════════╗
│                     │       │                     │      ║ ░░░░░░░░░░░░░░░░░░░ ║
│  R7  R8  R9         │       │  R7  R8  R9    [+]  │      ║ ░  R7  R8  R9  [X] ░║
│                     │       │                     │      ║ ░░░░░░░░░░░░░░░░░░░ ║
└─────────────────────┘       └─────────────────────┘      ╚═════════════════════╝
board-border (#2A5A3A)        초록 실선 + bg tint           빨간 점선 + 해칭 패턴
```

---

## 3. 색상 토큰 정의

### 3.1 CSS 변수 (globals.css에 추가됨)

```css
:root {
  /* 허용 드롭존 */
  --drop-allow: #27ae60;                   /* 초록 — 공식 허용 신호 */
  --drop-allow-bg: rgba(39, 174, 96, 0.12); /* 배경 tint: 낮은 채도로 눈 피로 감소 */
  --drop-allow-border: rgba(39, 174, 96, 0.7); /* 테두리: 완전 불투명보다 부드럽게 */

  /* 차단 드롭존 */
  --drop-block: #c0392b;                   /* 빨간 — 차단/위험 신호 */
  --drop-block-bg: rgba(192, 57, 43, 0.12);
  --drop-block-border: rgba(192, 57, 43, 0.7);
}
```

### 3.2 색상 선택 근거

| 색상 | 값 | 선택 이유 |
|------|-----|---------|
| 허용 초록 (`--drop-allow`) | `#27AE60` | 기존 `--color-success: #3fb950`보다 채도 낮춰 "승리" 색과 구분. 보드 배경 #1A3328(짙은 초록)과 대비 확보 |
| 차단 빨간 (`--drop-block`) | `#C0392B` | 기존 `--color-danger: #f85149`보다 어두워 "에러 토스트"와 구분. 경고 시그널로 인식 |

---

## 4. WCAG AA 접근성 검증 (대비율 >= 4.5:1)

### 4.1 보드 배경 대비율 계산

보드 배경: `--board-bg: #1A3328` (RGB: 26, 51, 40)

**허용 초록 `#27AE60` (RGB: 39, 174, 96) on `#1A3328`:**

상대 밝기(L) 계산 공식: `L = 0.2126*R + 0.7152*G + 0.0722*B` (각 채널 선형화 후)

- `#27AE60`: R=39/255=0.153, G=174/255=0.682, B=96/255=0.376
  - R_lin = 0.153^2.2 ≈ 0.0176, G_lin = 0.682^2.2 ≈ 0.426, B_lin = 0.376^2.2 ≈ 0.118
  - L_allow = 0.2126*0.0176 + 0.7152*0.426 + 0.0722*0.118 = 0.004 + 0.305 + 0.009 = **0.318**

- `#1A3328`: R=26/255=0.102, G=51/255=0.200, B=40/255=0.157
  - R_lin ≈ 0.0088, G_lin ≈ 0.0331, B_lin ≈ 0.0207
  - L_bg = 0.2126*0.0088 + 0.7152*0.0331 + 0.0722*0.0207 = 0.002 + 0.024 + 0.001 = **0.027**

대비율 = (L_allow + 0.05) / (L_bg + 0.05) = (0.318 + 0.05) / (0.027 + 0.05) = 0.368 / 0.077 = **4.78:1**

결과: **WCAG AA 통과** (4.5:1 초과)

**차단 빨간 `#C0392B` (RGB: 192, 57, 43) on `#1A3328`:**

- `#C0392B`: R=192/255=0.753, G=57/255=0.224, B=43/255=0.169
  - R_lin ≈ 0.535, G_lin ≈ 0.040, B_lin ≈ 0.023
  - L_block = 0.2126*0.535 + 0.7152*0.040 + 0.0722*0.023 = 0.114 + 0.029 + 0.002 = **0.145**

대비율 = (0.145 + 0.05) / (0.027 + 0.05) = 0.195 / 0.077 = **2.53:1**

결과: **WCAG AA 미달** — 색상만으로는 AA 미달이나, 아래 보조 수단으로 보완.

### 4.2 WCAG 보조 수단 (색상 외 시각 단서)

WCAG 1.4.1 "색상 사용" 기준: 색상이 정보의 유일한 전달 수단이어선 안 됨.

**허용 상태 보조:**
- border-style: `solid` (실선) — 형태 단서
- 아이콘: 체크 마크 SVG (색약/전색맹 대응)

**차단 상태 보조:**
- border-style: `dashed` (점선) — 형태 단서 (실선과 명확히 구분)
- 배경 패턴: 대각선 해칭 (`repeating-linear-gradient(-45deg)`) — 텍스처 단서
- 아이콘: X 마크 SVG (색약/전색맹 대응)
- cursor: `not-allowed` — 행동 단서

이 3+1 보조 수단으로 색약(적록색맹, 전색맹)에서도 허용/차단 구분 가능.

### 4.3 색약 시뮬레이션 결과

| 색각 유형 | 허용(초록) | 차단(빨간) | 구분 방법 |
|----------|---------|---------|---------|
| 정상 | 초록 밝게 보임 | 빨간 밝게 보임 | 색상 |
| 적록색맹(Deuteranopia) | 올리브 계열 | 짙은 갈색 계열 | 점선/실선 border + 해칭 패턴 |
| 전색맹(Achromatopsia) | 중간 회색 | 어두운 회색 | 점선/실선 border + 해칭 패턴 + 아이콘 |

결론: 색상 단독으로는 적록색맹에서 구분 어려울 수 있으나, `border-style`(실선 vs 점선)과 배경 해칭 패턴으로 WCAG 1.4.1 충족.

---

## 5. Tailwind 확장 토큰 (tailwind.config.ts에 추가 필요)

Phase 2에서 frontend-dev가 아래를 `tailwind.config.ts`의 `theme.extend.colors`에 추가:

```typescript
// tailwind.config.ts theme.extend.colors 에 추가
"drop-allow": "#27AE60",
"drop-block": "#C0392B",
```

이후 Tailwind 클래스로 사용 가능:
- `border-drop-allow`, `bg-drop-allow/12` (허용)
- `border-drop-block`, `bg-drop-block/12` (차단)

---

## 6. Phase 2 Frontend-dev 구현 지시

### 6.1 적용 대상 컴포넌트

```
src/frontend/src/components/game/GameBoard.tsx   -- 서버 멜드 그룹 렌더
src/frontend/src/app/game/[roomId]/GameClient.tsx -- 새 그룹 드롭존
```

### 6.2 dnd-kit isOver 활용

dnd-kit `useDroppable` 반환값의 `isOver`와 `active` 정보를 조합:

```typescript
// GameBoard.tsx 또는 개별 그룹 컴포넌트
const { isOver, setNodeRef } = useDroppable({ id: groupId });

// 드롭 허용 여부 계산
const isDropAllowed = isOver && hasInitialMeld;
const isDropBlocked = isOver && !hasInitialMeld;

// CSS 클래스 조건부 적용
const dropzoneClass = isDropAllowed
  ? "dropzone-allow"
  : isDropBlocked
  ? "dropzone-block"
  : "";
```

### 6.3 새 그룹 드롭존 (game-board 영역)

빈 보드 영역에 드래그 시 "새 그룹 만들기" 드롭존:
- `hasInitialMeld=false` 상태에서도 새 그룹 생성은 허용 → `dropzone-allow`
- 색상 호환되지 않는 타일 hover 시 → 서버 검증 전이므로 일단 `dropzone-allow` (서버 에러 발생 시 `ErrorToast`로 후처리)

### 6.4 MeldRenderer 아이콘 추가 (색약 접근성 보강)

`isDropAllowed` 시 우상단에 체크 아이콘 (12px):
```tsx
{isDropAllowed && (
  <span aria-hidden="true" className="absolute top-1 right-1 text-drop-allow text-xs">
    ✓
  </span>
)}
{isDropBlocked && (
  <span aria-hidden="true" className="absolute top-1 right-1 text-drop-block text-xs">
    ✕
  </span>
)}
```

스크린 리더 전용 상태 텍스트:
```tsx
<span className="sr-only">
  {isDropAllowed ? "타일을 이 멜드에 이어붙일 수 있습니다" : isDropBlocked ? "초기 등록 후 이어붙이기 가능합니다" : ""}
</span>
```

---

## 7. 참조

- `docs/02-design/07-ui-wireframe.md` §1.1 기존 색상 토큰
- `docs/02-design/38-colorblind-safe-palette.md` 색약 팔레트 기존 가이드
- `src/frontend/src/app/globals.css` 토큰 추가 위치
- `src/frontend/tailwind.config.ts` Tailwind 확장 대상
- WCAG 2.1 Success Criterion 1.4.1 (Color Use), 1.4.3 (Contrast)
