# RummiArena — 턴 상태 스트립 (A안) 구현 스펙

> **Confirmed.** A안 (턴 상태 + 라운드 타임라인 스트립) 으로 확정.
> **이 문서의 목적.** Claude Code가 바로 구현할 수 있는 수준의 컴포넌트·데이터·상태 스펙.

---

## 1. 결과물 요약

게임보드 상단의 빈 공간 (룸 헤더 ↔ 보드 사이) 을 **높이 88px의 "턴 상태 스트립"** 으로 대체합니다. 한 줄짜리 노란 토스트는 이 스트립의 컨텍스트 라인으로 흡수합니다.

### 시각 미리보기

미리보기는 `Board Top Hifi.html` 의 **A · 턴 상태 스트립** 아트보드를 참고하세요.

스트립의 구성은 좌→우로 다음과 같습니다.

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ⓞ 42s   │ YOUR TURN          │ NEXT       │ ROUND 7                     │
│ (도넛)  │ 네선용             │ ◐ shark    │ ▣▣▣▣▢▢                       │
│         │ 최초 등록 필요…    │ ~45s 대기  │ 3 / 6 턴                    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 컴포넌트 트리

```
<TurnStatusStrip>
  <OrbitalTimer remainingSec={number} totalSec={number} />
  <NowPlayingBlock player={Player} contextLine={string} />
  <Divider />
  <NextPlayerBlock player={Player} estimatedWaitSec={number} />
  <Divider />
  <RoundProgressBlock
    roundIndex={number}
    turns={Array<TurnState>}    // 'done' | 'current' | 'pending'
  />
</TurnStatusStrip>
```

각 블록은 독립 컴포넌트로 분리. `TurnStatusStrip` 자체는 **상태를 가지지 않는 표현 컴포넌트**이며, 데이터는 props로만 받습니다 (실시간 상태는 부모의 `useGameRoom` 훅에서 주입).

---

## 3. 데이터 모델

기존 게임 상태에 다음 필드만 추가/매핑하면 됩니다.

```ts
interface TurnStatusVM {
  // 타이머
  remainingSec: number;        // 서버 push, 1s tick
  totalSec: number;            // 룸 설정의 turn timeout (예: 60)

  // 현재 차례
  current: {
    playerId: string;
    name: string;              // "네선용"
    isMe: boolean;
    avatarColor: string;       // 액센트 색
  };
  contextLine: string;         // 동적 카피, §5 참고

  // 다음 차례
  next: {
    playerId: string;
    name: string;
    avatarChar: string;        // "S"
    estimatedWaitSec: number;  // 평균 턴 시간 × 남은 사이 거리
  };

  // 라운드
  roundIndex: number;          // 1-based
  turns: Array<'done' | 'current' | 'pending'>;
  turnsCompleted: number;      // 3
  turnsTotal: number;          // 6 (= 플레이어 수)
}
```

서버 이벤트 매핑 (참고용):
- `turn:start` → `current`, `next`, `roundIndex`, `turns` 갱신
- `turn:tick` → `remainingSec`만 갱신
- `turn:end` → `turns[i]`를 `'done'`으로

---

## 4. 시각 사양

### 4.1 토큰

```css
/* 컨테이너 */
--strip-h: 88px;
--strip-bg: linear-gradient(180deg, #11151e 0%, #0d121b 100%);
--strip-border: 1px solid #1e2532;
--strip-radius: 10px;
--strip-padding: 14px 18px;
--strip-gap: 24px;

/* 텍스트 위계 */
--label-fs: 9px;       /* "YOUR TURN", "NEXT", "ROUND 7" */
--label-color: #6b7280;
--label-color-active: #f59e0b;
--label-letter: 1.2px;
--label-weight: 700;

--value-fs: 18px;      /* "네선용" */
--value-color: #f8fafc;
--value-weight: 700;

--meta-fs: 11px;       /* 컨텍스트 라인 */
--meta-color: #94a3b8;

/* 색 시맨틱 */
--accent-self: #f59e0b;     /* 내 차례 */
--accent-opponent: #06b6d4; /* AI 차례 */
--turn-done: #34d39955;
--turn-current: #f59e0b;
--turn-pending: #1e2532;
```

### 4.2 타이머 색상 규칙

| 잔여 시간 | 링 색상 | 숫자 색상 | 추가 효과 |
|---|---|---|---|
| > 30s | `#34d399` | `#f8fafc` | — |
| 10s ~ 30s | `#f59e0b` | `#f8fafc` | — |
| < 10s | `#ef4444` | `#ef4444` | 매 초 펄스 (`scale 1.0 → 1.06`, `0.5s ease-out`) |

링은 SVG `<circle>` + `stroke-dasharray` / `stroke-dashoffset` 로 구현. `transition: stroke-dashoffset 1s linear` 로 부드럽게 줄어들게 합니다.

### 4.3 라운드 도트

- 한 칸 = `14×14`, `border-radius: 3`, gap 4
- 상태별 색은 §4.1 토큰 참조
- `current` 칸은 `box-shadow: 0 0 8px #f59e0b88` 로 글로우
- 플레이어가 6명을 초과하는 케이스가 생길 경우, 최대 8칸까지만 표시하고 그 이상은 `· · ·` 로 압축

### 4.4 반응형

| 폭 | 표시 |
|---|---|
| ≥ 1024px | 전체 (Timer · Now · Next · Round) |
| 768~1023px | Timer · Now · Round (Next 숨김) |
| < 768px | Timer + Now만, Round는 헤더로 이동 |

---

## 5. 컨텍스트 라인 (동적 카피)

`contextLine`은 게임 상태에 따라 동적으로 결정되며, 기존의 노란 토스트를 대체합니다. **i18n 키로 관리**해주세요.

| 조건 | i18n key | 한국어 |
|---|---|---|
| 내 차례 + 최초 등록 전 + 보드에 0점 | `turn.firstRegistration.idle` | "최초 등록 필요 · 30점 이상의 세트를 보드에 올리세요" |
| 내 차례 + 최초 등록 전 + 보드에 1~29점 | `turn.firstRegistration.partial` | "최초 등록까지 N점 더 필요해요" |
| 내 차례 + 최초 등록 후 + 둘 수 있음 | `turn.normal.canPlay` | "타일을 보드에 올리거나 드로우하세요" |
| 내 차례 + 둘 수 있는 수 없음 | `turn.normal.mustDraw` | "둘 수 있는 수가 없어요 · 드로우하세요" |
| 내 차례 + 잔여 < 10s | `turn.urgent` | "시간이 얼마 남지 않았어요" *(기존 라인 위에 덮어쓰지 말고 우선 표시)* |
| 상대 차례 | `turn.opponent.thinking` | "{name} 차례 · 생각 중…" |
| 상대 차례 + 드로우 직후 | `turn.opponent.drew` | "{name}이 드로우했어요" |

> 첫 출시에는 위 8종이면 충분. 동적 점수 N은 클라이언트에서 계산.

---

## 6. 인터랙션 / 애니메이션

| 이벤트 | 효과 |
|---|---|
| 턴 전환 (`turn:start`) | 스트립 전체에 `opacity 0.6 → 1`, `translateY 4px → 0`, `0.3s ease-out` |
| `remainingSec` 변경 | 도넛 링 `stroke-dashoffset` 트랜지션 1s linear |
| `< 10s` 진입 | 도넛 + 숫자에 펄스 시작, `aria-live="assertive"` 로 스크린리더에 안내 |
| 도트 `pending → done` | 해당 도트만 `background` 트랜지션 0.3s, 짧은 `scale 1.2 → 1` 바운스 |

**트랜지션은 인라인 한정**, 라운드 단위 큰 모션은 넣지 않습니다 (어수선해짐).

---

## 7. 접근성

- 도넛 타이머: `role="timer"`, `aria-label="턴 잔여 시간 N초"`, 매 5초 또는 `< 10s`일 때 매 초 갱신
- "YOUR TURN" 등 라벨: 시각 장식이므로 `aria-hidden="true"`, 의미는 컨텍스트 라인이 전달
- 라운드 도트: `role="list"`, 각 도트는 `role="listitem"` + `aria-label="턴 N · 완료"` / `진행 중` / `예정`
- 색상 대비: 라벨 회색(#6b7280) on `#11151e` = 4.6:1 → AA pass

---

## 8. 기존 토스트와의 관계

현재 화면에 떠있는 노란색 첫 턴 안내 토스트는 **스트립 출시와 동시에 제거**합니다. 같은 정보가 컨텍스트 라인에 들어가므로 중복입니다.

다만 다음 두 종류의 알림은 별도 토스트로 유지 권장:
- **에러 토스트** (제출 실패 등) — 스트립 위로 띄움
- **턴 종료 직전 경고** (잔여 3초) — 스트립의 펄스로 충분하므로 토스트는 불필요

---

## 9. 작업 분할 제안

다음 PR 단위로 쪼개면 리뷰가 쉽습니다.

1. **PR1** — `<TurnStatusStrip>` 정적 마크업 + 토큰 적용 (목업 데이터)
2. **PR2** — `useGameRoom` 훅에 `turnStatus` 필드 추가, 서버 이벤트 매핑
3. **PR3** — 도넛 타이머 + 펄스 + 색상 규칙
4. **PR4** — 컨텍스트 라인 i18n + 동적 카피 룰
5. **PR5** — 기존 토스트 제거, 반응형 처리

PR1·2를 머지하면 화면에 정보가 들어오기 시작하므로 **빈 공간 문제는 PR2 시점에서 해결됩니다.**

---

## 10. 확정 결정사항

- **Round 정의**: 한 라운드 = n명이 1턴씩 = n도트, 1-based.
  - 2인 대전 한정 예외: 최근 2라운드(=4도트)를 라운드 구분선과 함께 표시.
  - 3인 이상: 현재 라운드만 표시.
- **NEXT 블록**: 항상 표시 + 반응형 자동 숨김 (`< 768px`). 토글 옵션 1차 출시에서 제외.
  - 2인 대전 한정 예외: NEXT 블록 숨김 (자명한 정보), 그 자리를 라운드 도트 "최근 2라운드 표시"로 확장.

---

## 11. 참조 파일

- 미리보기: `Board Top Hifi.html` → "A · 턴 상태 스트립" 아트보드
- 컴포넌트 코드 참고용: `mock/board-mock.jsx` 의 `StripA` 함수 (그대로 가져다 다듬어 쓰면 됨)
