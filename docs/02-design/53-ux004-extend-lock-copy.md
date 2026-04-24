# UX-004 Extend-Lock 인라인 피드백 카피 스펙

**문서 번호**: 53
**작성**: designer (Claude Sonnet 4.6)
**작성일**: 2026-04-24
**브랜치**: `feature/ux-004-designer-spec`
**연관**:
- `docs/04-testing/73-finding-01-root-cause-analysis.md` — FINDING-01 / V-13a 배경
- `work_logs/plans/2026-04-24-sprint7-ui-bug-triage-plan.md` §3.2 UX-004 맥락
- `docs/02-design/06-game-rules.md` V-04 초기 등록 30점 룰
- `src/frontend/src/app/game/[roomId]/GameClient.tsx:855` early-return 위치

---

## 1. 배경 및 문제 정의

### 1.1 사용자 시나리오

사용자(애벌레)가 2026-04-23 22:18 플레이테스트에서 진술:
"AI는 이어붙이기가 되는데 나는 안된다."

실제 원인: V-13a `ErrNoRearrangePerm` — `hasInitialMeld=false` 상태(초기 등록 30점 미완료)에서 기존 서버 확정 멜드 위로 드롭을 시도하면 새 pending 그룹을 강제로 분리한다. AI는 첫 턴 `ConfirmTurn` 후 `hasInitialMeld=true` 상태라 extend가 자연스러운 반면, 사람은 같은 화면에서 같은 동작을 해도 결과가 달라 **"AI만 특혜"** 로 오인하게 된다.

이것은 코드 버그가 아니라 **커뮤니케이션 실패**다. 인라인 피드백 한 줄이면 해결된다.

### 1.2 제약 조건

- 실제 `GameClient.tsx` 수정은 Phase 2 frontend-dev 담당 (이 문서는 Phase 1 설계만)
- `GameClient.tsx:855` early-return 직전에 토스트 호출 삽입 예정
- 기존 `ErrorToast` 컴포넌트는 `wsStore.lastError` 구독 (서버 에러 전용, `role="alert" aria-live="assertive"`)
- UX-004 토스트는 서버 에러가 아닌 **로컬 규칙 안내**이므로 별도 경량 토스트 컴포넌트 필요

---

## 2. 카피 3종 최종 결정

### 2.1 토스트 (warning) — 드롭 차단 시 즉시 표시

#### 맥락

- 발동 시점: `targetServerGroup && !hasInitialMeld` early-return 분기 진입 직전
- 위치: 화면 상단 중앙, `ErrorToast`(top-16) 아래, `top-24` 배치
- 소멸: 4초 자동 소멸 (규칙 안내이므로 에러 5초보다 짧게)
- 반복: 같은 턴 내 최대 1회만 표시 (`useRef`으로 shown 추적)

#### 최종 문구

```
초기 등록(30점)을 확정한 뒤 보드 멜드에 이어붙일 수 있어요.
'확정' 버튼을 먼저 눌러주세요.
```

#### 결정 근거

| 대안 | 검토 결과 |
|------|----------|
| "초기 등록 전에는 기존 멜드에 이어붙이기 불가" | 부정형 구문, 사용자를 막는 느낌. 대안 행동이 없어 답답함 |
| "30점 이상 새 멜드를 만들고 확정하면 이어붙이기 가능합니다" | 길이 과함 (32자). 모바일에서 줄 바꿈 발생 |
| **"초기 등록(30점)을 확정한 뒤 보드 멜드에 이어붙일 수 있어요. '확정' 버튼을 먼저 눌러주세요."** | **채택**: 규칙 설명과 행동 지시를 분리, 존댓말+친근체로 금지 대신 안내 톤, '확정' 버튼 라벨을 명시해 UI와 문구 연결 |

#### 톤 원칙

- **친근/존댓말/간결**: "~불가합니다" 금지, "~할 수 있어요" 선호
- **행동 중심**: 무엇을 하면 되는지 반드시 포함
- **게임 용어 일관성**: "초기 등록", "확정", "보드 멜드" — 소스코드/서버 에러코드와 동일한 용어 사용

#### Ellipsis 전략

두 문장으로 나누어 첫 문장은 규칙 설명, 둘째 문장은 행동 지시. 줄임표 사용 안 함.

#### a11y 대체 텍스트

```html
<div role="status" aria-live="polite" aria-atomic="true"
     aria-label="초기 등록 미완료 안내: 30점 확정 후 보드 이어붙이기 가능">
  초기 등록(30점)을 확정한 뒤 보드 멜드에 이어붙일 수 있어요.
  '확정' 버튼을 먼저 눌러주세요.
</div>
```

- `role="status"` + `aria-live="polite"`: 에러가 아닌 안내이므로 `assertive` 대신 `polite`
- `aria-atomic="true"`: 전체 문장을 한 번에 읽도록

---

### 2.2 툴팁 (확정 버튼 hover)

#### 맥락

- 발동 시점: ActionBar의 "확정" 버튼에 마우스 hover / 키보드 focus
- 구현: HTML `title` attribute 대신 `aria-describedby` + DOM 요소 기반 툴팁 (스크린 리더 접근성)
- 표시 조건: 항상 (disabled 상태 포함, disabled 시 더 중요한 안내)

#### 최종 문구

```
내 타일로 30점 이상 새 멜드를 만들면 확정 가능.
확정 후엔 보드 기존 멜드에도 이어붙일 수 있어요.
```

#### 결정 근거

| 대안 | 검토 결과 |
|------|----------|
| "배치를 확정합니다" | 기능 설명만, 조건 안내 없음 |
| "30점 이상이면 확정 가능. 확정하면 기존 보드 멜드에도 이어붙일 수 있어요." | 좋지만 초기 등록이 "내 타일로만" 해야 한다는 V-04 제약이 누락 |
| **"내 타일로 30점 이상 새 멜드를 만들면 확정 가능. 확정 후엔 보드 기존 멜드에도 이어붙일 수 있어요."** | **채택**: "내 타일로" 조건 포함, "~후엔"으로 순서 관계 명시 |

#### a11y 대체 텍스트

```html
<button aria-describedby="confirm-tooltip" ...>확정</button>
<div id="confirm-tooltip" role="tooltip">
  내 타일로 30점 이상 새 멜드를 만들면 확정 가능.
  확정 후엔 보드 기존 멜드에도 이어붙일 수 있어요.
</div>
```

- `aria-describedby`로 툴팁 연결
- `role="tooltip"`: 스크린 리더가 버튼 탐색 시 툴팁을 함께 읽도록

---

### 2.3 배너 (최초 진입 1회)

#### 맥락

- 발동 시점: `hasInitialMeld=false` 상태로 게임 화면 진입 시 1회만 표시
- 위치: 보드 위 상단 알림 바, 높이 36px
- 소멸: 사용자가 닫기 버튼 클릭 OR `hasInitialMeld=true` 전환 시 자동 소멸
- 영속: `sessionStorage`에 `ux004-banner-shown-{roomId}=1` 저장, 같은 방 재접속 시 재표시 안 함

#### 최종 문구

```
첫 번째 확정은 내 타일로 30점 이상 새 멜드를 만드는 것부터.
그 다음 턴부터 보드 이어붙이기가 가능해집니다.
```

#### 결정 근거

| 대안 | 검토 결과 |
|------|----------|
| "첫 턴은 내 타일로 30점 이상 새 멜드를 만드는 것부터. 그 다음부터 보드 이어붙이기 가능." | "첫 턴"은 '첫 번째 드래그 시도 턴'으로 오해 가능. "~가능"으로 끝나면 어투 단절 |
| **"첫 번째 확정은 내 타일로 30점 이상 새 멜드를 만드는 것부터. 그 다음 턴부터 보드 이어붙이기가 가능해집니다."** | **채택**: "첫 번째 확정"으로 확정 버튼과 연결, "가능해집니다"로 순서 변화 강조 |

#### a11y 대체 텍스트

```html
<div role="status" aria-live="polite" aria-label="초기 등록 안내">
  <p>첫 번째 확정은 내 타일로 30점 이상 새 멜드를 만드는 것부터.</p>
  <p>그 다음 턴부터 보드 이어붙이기가 가능해집니다.</p>
  <button aria-label="초기 등록 안내 닫기">
    <span aria-hidden="true">x</span>
  </button>
</div>
```

---

## 3. 카피 종합 요약

| 종류 | 문구 | 발동 조건 | 길이(한글 자수) | 톤 |
|------|------|----------|---------------|-----|
| 토스트 | "초기 등록(30점)을 확정한 뒤 보드 멜드에 이어붙일 수 있어요. '확정' 버튼을 먼저 눌러주세요." | 드롭 차단 시 즉시 | 45자 | 친근+존댓말 |
| 툴팁 | "내 타일로 30점 이상 새 멜드를 만들면 확정 가능. 확정 후엔 보드 기존 멜드에도 이어붙일 수 있어요." | 확정 버튼 hover/focus | 47자 | 간결+존댓말 |
| 배너 | "첫 번째 확정은 내 타일로 30점 이상 새 멜드를 만드는 것부터. 그 다음 턴부터 보드 이어붙이기가 가능해집니다." | 게임 진입 1회 | 54자 | 설명형+존댓말 |

---

## 4. Phase 2 Frontend-dev 구현 지시

### 4.1 새 컴포넌트: `ExtendLockToast.tsx`

파일 위치: `src/frontend/src/components/game/ExtendLockToast.tsx`

토스트 API: 기존 `ErrorToast`와 동일한 **Framer Motion AnimatePresence 패턴** 사용. 외부 라이브러리 도입 없음.

```typescript
interface ExtendLockToastProps {
  visible: boolean;        // GameClient에서 제어 (setShowExtendLockToast)
  onDismiss?: () => void;  // 4초 후 자동 소멸 콜백
}
// role="status" aria-live="polite" aria-atomic="true"
// fixed top-24 left-1/2 -translate-x-1/2 z-50
// bg-warning/20 border border-warning/60 text-warning (경고 계열, 에러 bg-danger와 구분)
// 4000ms 자동 소멸
```

### 4.2 GameClient.tsx:855 삽입 위치

`targetServerGroup && !hasInitialMeld` early-return 분기 **직전**에 추가:

```typescript
if (targetServerGroup && !hasInitialMeld) {
  // UX-004: 초기 등록 미완료 안내 토스트 (같은 턴 1회)
  if (!extendLockToastShownRef.current) {
    extendLockToastShownRef.current = true;
    setShowExtendLockToast(true);
  }
  // ... 기존 새 pending 그룹 생성 로직 유지 (FINDING-01 fix)
  return;
}
```

`extendLockToastShownRef`는 `useRef(false)`로 선언, `resetPending()` 시 `false`로 초기화.

### 4.3 ActionBar.tsx 확정 버튼 툴팁

기존 `<button aria-label="배치 확정">` 에 `aria-describedby="confirm-tooltip"` 추가.
툴팁 div는 항상 DOM에 존재, CSS hover/focus로 가시성 제어.

```tsx
<div className="relative group">
  <button
    aria-label="배치 확정"
    aria-describedby="confirm-tooltip"
    disabled={!isMyTurn || !hasPending || !allGroupsValid || confirmBusy}
    ...
  >
    확정
  </button>
  <div
    id="confirm-tooltip"
    role="tooltip"
    className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2
               invisible group-hover:visible group-focus-within:visible
               w-56 bg-card-bg border border-border rounded-lg px-3 py-2
               text-tile-xs text-text-secondary text-center z-50"
  >
    내 타일로 30점 이상 새 멜드를 만들면 확정 가능.
    확정 후엔 보드 기존 멜드에도 이어붙일 수 있어요.
  </div>
</div>
```

### 4.4 초기 등록 안내 배너

파일: `src/frontend/src/components/game/InitialMeldBanner.tsx`

렌더 조건: `!hasInitialMeld && !bannerDismissed`

`hasInitialMeld`가 `true`로 바뀌면 자동 unmount됨.

### 4.5 기존 토스트 위치 조정 필요

`ExtendLockToast` top-24 추가로 기존 `ReconnectToast` 위치 충돌 발생 가능.
`ReconnectToast`를 `top-32`로 하향 조정 권고 (frontend-dev 최종 판단).

---

## 5. 게임 용어 일관성 기준 (Designer SSOT)

이 표는 UX 카피 작성의 단일 기준점. PR 리뷰 시 이 표와 불일치하는 UI 문구는 반환.

| UI 표시 용어 | 코드/서버 용어 | 사용 금지 |
|-------------|--------------|---------|
| 초기 등록 | `hasInitialMeld`, V-04 | "초기화", "첫 배치", "시작 세트" |
| 확정 | `CONFIRM_TURN`, `confirmBusy` | "제출", "완료", "저장" |
| 보드 멜드 / 기존 멜드 | `tableGroups`, `serverGroup` | "테이블", "놓인 패" |
| 이어붙이기 | extend, append | "연결하기", "붙이기" |
| 드로우 | `DRAW_TILE` | "뽑기", "가져오기" |
| 기권 | `FORFEIT` | "포기", "퇴장" |
| 런 | Run | "줄", "시리즈" |
| 그룹 | Group | "조합" |

---

## 6. 참조

- `docs/02-design/06-game-rules.md` V-04 (초기 등록 30점), V-13a (재배치 권한)
- `docs/04-testing/73-finding-01-root-cause-analysis.md` §5 fix specification
- `src/frontend/src/hooks/useWebSocket.ts:65` `ERR_NO_REARRANGE_PERM` 메시지
- `src/frontend/src/components/game/ErrorToast.tsx` 기존 토스트 패턴
- `src/frontend/src/components/game/ActionBar.tsx` 확정 버튼 위치
