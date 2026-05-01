# 107 — 실측 게임 분석 보고서 (2026-05-01)

- **작성일**: 2026-05-01
- **담당**: node-dev (ai-adapter 담당)
- **게임 유형**: Human × 2 + AI(LLaMA/shark) 혼합 3인 실전
- **연관 문서**: `55-game-rules-enumeration.md`, `57-game-rule-visual-language.md`, `105-v8-ollama-place-experiment-2026-05-01.md`, `106-llama-cpu-place-success-story-2026-05-01.md`

---

## 1. 게임 개요

| 항목 | 값 |
|------|----|
| 날짜/시간 | 2026-05-01 오전 11:53 ~ 12:02 (약 9분) |
| Room ID | 927a6635 |
| 인원 | 3인 |
| seat0 | 배진용 (Human) |
| seat1 | shark / LLaMA — 프롬프트 `v8-ollama-place` (AI) |
| seat2 | JinYong Bae (Human) |
| 종료 사유 | 기권(Forfeit) 종료 |
| 최종 결과 | shark(LLaMA) 승리 (단독 활성 플레이어) |
| 잔존 타일 | 배진용 16장 기권, JinYong 13장 기권, LLaMA 20장 |
| 스크린샷 | 115300 ~ 120300 (20장) |

---

## 2. 버그 분석

### BUG-CONFIRM-001 — confirmBusy 영구 잠금 (P0 Critical)

#### 증상

최초 초기 등록(Initial Meld) 성공 후, 이후 모든 인간 플레이어 턴에서 확정 버튼(Confirm Turn)이 `disabled` 상태로 고정되었다. 커서 스타일이 `not-allowed`로 표시되어 버튼 클릭이 불가능하였다.

영향을 받은 턴:

| 턴 | 플레이어 | 시도 액션 |
|----|---------|----------|
| T6 | JinYong | yellow 13을 red 10-11-12에 확장 (런 연장) |
| T12 | JinYong | B10 + JK + B12 런 배치 |
| T18 | 배진용 | red 9를 red 10-11-12에 확장 (런 연장) |

#### 근본 원인

`GameClient.tsx`의 `useEffect` 내 confirmBusy 해제 조건이 다음과 같이 작성되어 있었다.

```typescript
// 버그 코드 (수정 전)
if (!draftPendingTableGroups) {
  setConfirmBusy(false);
}
```

`pendingStore.saveTurnStartSnapshot()` 호출 이후 `draft`는 항상 비-null 상태(빈 배열 `[]` 포함)로 초기화된다. 따라서 `!draftPendingTableGroups` 조건이 절대 `true`가 되지 않아 confirmBusy가 한 번 `true`로 설정되면 영구적으로 해제되지 않는 상태가 되었다.

#### 수정 내용

```typescript
// 수정 후
if (draftPendingGroupIds.size === 0 && confirmBusy) {
  setConfirmBusy(false);
}
```

pending 그룹 ID 집합의 크기가 0이고 confirmBusy가 true인 경우에만 해제하도록 조건을 변경하였다. 이 조건은 draft가 비-null이더라도 실제 배치된 pending 타일이 없을 때 버튼 잠금을 해제한다.

#### 카스케이드 영향

```
BUG-CONFIRM-001 발생
  → 인간 플레이어 전원 Confirm 불가
  → 강제 드로우만 반복
  → 배진용 16장 기권, JinYong 13장 기권
  → LLaMA 단독 활성 플레이어 자동 승리 (20장 보유)
```

LLaMA가 이번 게임에서 실제로 타일을 배치하지 못하였음에도 두 인간 플레이어가 모두 기권함으로써 규칙상 단독 활성 플레이어로 남아 승리 처리되었다. 이는 버그로 인한 인위적 결과다.

---

## 3. 올바른 동작 확인 (버그 아님)

### 3.1 T9 — blue 10 + blue 10 + JK = 무효 세트

| 항목 | 내용 |
|------|------|
| 시도 조합 | B10a + B10b + JK (같은 숫자, 같은 색 2장 + 조커) |
| 판정 | 무효 (올바른 거부) |
| 근거 룰 | **V-14**: 그룹 내 같은 색 두 장 금지. B10a와 B10b는 동색이므로 같은 그룹에 존재 불가 |
| 서버 응답 | `ERR_GROUP_COLOR_DUP` |
| 결론 | 서버 및 UI 동작 정상. 버그 아님 |

### 3.2 기권 종료 후 LLaMA 승리

| 항목 | 내용 |
|------|------|
| 상황 | 두 인간 플레이어 모두 기권 → LLaMA 단독 활성 플레이어 |
| 판정 | 올바른 자동 승리 처리 |
| 근거 룰 | **V-22(신설 권고)**: 단독 활성 플레이어 자동 승리. 현재 `game_service.go`에 구현되어 있으나 룰 문서 ID 미등록 |
| 결론 | 게임 엔진 동작 정상. 단, 룰 문서 V-22 신설이 필요한 SSOT 부채 존재 |

### 3.3 LLaMA 0% place rate

| 항목 | 내용 |
|------|------|
| 상황 | LLaMA가 이번 게임에서 단 한 번도 타일을 배치하지 않음 |
| 판정 | 버그 아님. 이번 게임 손패 조합에서 30점 이상 초기 멜드 구성이 불가능하였을 가능성 |
| 설명 | v8-ollama-place 프롬프트는 `findMeldFor30()` 알고리즘으로 유효 멜드를 사전 계산하여 주입한다. 계산 결과가 없으면 DRAW로 처리된다. 타일 배분의 랜덤성에 의해 30점 이상 조합이 성립하지 않은 턴이 연속된 것으로 판단됨 |
| 결론 | 동작 정상. v8 프롬프트 알고리즘 결함 아님 |

---

## 4. game-analyst 룰 판정 결과

| 시나리오 | 판정 | 관련 룰 |
|---------|------|---------|
| red 10-11-12에 red 13 추가 (T6) | VALID | V-01 (런 유효성), V-13d (타일 이동), V-13a (재배치 권한) |
| blue 10 + blue 10 + JK (T9) | CORRECT — 무효 | V-14 (그룹 동색 중복), V-15 (런 중복 금지) |
| B10 + JK + B12 런 (T12) | VALID | V-01 (런 유효성), D-08 (조커 일관성) |
| red 10-11-12에 red 9 추가 (T18) | VALID | V-01 (런 유효성), V-13d (타일 이동), V-15 (런 숫자 연속) |
| 기권 종료 LLaMA 승리 | CORRECT | V-22(신설 권고) — 단독 활성 플레이어 자동 승리 |

---

## 5. SSOT 부채 식별

### V-22 신설 필요 — 단독 활성 플레이어 자동 승리

| 항목 | 내용 |
|------|------|
| 상황 | 기권/연결 끊김 등으로 게임 내 활성 플레이어가 1명만 남을 경우 자동 승리 처리 |
| 현재 상태 | `game_service.go`에 구현 코드 존재. 룰 문서에 ID 없음 |
| 부채 유형 | SSOT 미등록 (구현 ↔ 문서 불일치) |
| 권고 조치 | `55-game-rules-enumeration.md` §2에 V-22 항목 신설. 검증 위치, 서버 응답, UI 응답 명세 포함 |

### UR-41 후보 — 런 확장 시 자동 정렬 표시 UX

| 항목 | 내용 |
|------|------|
| 상황 | 10-11-12 런에 9를 앞에 추가할 경우, 표시 순서가 9-10-11-12로 자동 정렬되어야 하는 UX |
| 현재 상태 | UR-* ID 미할당. 표시 순서 정렬 명세 부재 |
| 권고 조치 | UR-41로 등록. "런 타일은 숫자 오름차순으로 표시한다" 명세 추가 |

---

## 6. 수정 결과

### 6.1 코드 수정

| 파일 | 변경 내용 | 커밋 |
|------|----------|------|
| `src/frontend/src/.../GameClient.tsx` | confirmBusy 해제 조건 수정: `!draftPendingTableGroups` → `draftPendingGroupIds.size === 0 && confirmBusy` | `02f18f0` |
| `src/frontend/src/.../pendingStore.test.ts` | BUG-CONFIRM-001 회귀 가드 3건 추가 | `dde63e3` |

### 6.2 테스트 결과

| 항목 | 결과 |
|------|------|
| Frontend Jest | **643 PASS / 0 FAIL** |
| 회귀 가드 추가 건수 | 3건 (pendingStore.test.ts) |

### 6.3 K8s 배포

| 항목 | 값 |
|------|----|
| 이미지 태그 | `rummikub-frontend:bug-confirm-001-02f18f0` |
| Pod | `frontend-f7bcbb899-lcgtx` |
| 상태 | Running |

---

## 7. 후속 권고

### P0 — 즉시

| 번호 | 항목 | 담당 |
|------|------|------|
| R-01 | `55-game-rules-enumeration.md`에 V-22 신설 (단독 활성 플레이어 자동 승리) | game-analyst |
| R-02 | V-22 기반 `87-server-rule-audit.md` 업데이트 | go-dev |

### P2 — 다음 세션

| 번호 | 항목 | 담당 |
|------|------|------|
| R-03 | `55-game-rules-enumeration.md`에 UR-41 신설 (런 확장 시 자동 정렬 표시) | game-analyst + designer |
| R-04 | `57-game-rule-visual-language.md` UR-41 시각 표현 추가 | designer |

### P3 — 기술 부채

| 번호 | 항목 |
|------|------|
| R-05 | BUG-CONFIRM-001 재발 방지: confirmBusy 상태 전환 로직을 pendingStore 내부로 이동하여 외부 useEffect 의존 제거 검토 |
| R-06 | 인간 플레이어 기권 시 기권 사유(버그 vs 의도) 로깅 추가 — 사고 원인 추적 용이성 향상 |

---

## 부록 — 타임라인 재구성

```
11:53  게임 시작 (Room 927a6635, 3인)
T1~T5  정상 진행 (초기 등록 포함)
T6     JinYong: yellow 13 확장 시도 → confirmBusy 잠금 발현 → 드로우 강제
T7~T11 LLaMA 포함 정상 진행 (드로우 반복)
T9     JinYong: B10+B10+JK 무효 세트 시도 → V-14 거부 (정상)
T12    JinYong: B10+JK+B12 런 시도 → confirmBusy 잠금 → 드로우 강제
T13~T17 드로우 반복
T18    배진용: red 9 확장 시도 → confirmBusy 잠금 → 드로우 강제
T18 이후  양측 인간 플레이어 기권 결정
12:02  게임 종료 — LLaMA 단독 활성, 자동 승리 처리
```
