# 86 — 2차 사용자 실측 사고 보고서 (2026-04-25 10:20~10:25)

- **작성**: 2026-04-25 11:30 KST, Claude main (Opus 4.7 xhigh)
- **사용자**: 애벌레
- **심각도**: P0 (게임 플레이 자체 불가)
- **선행 배포**: `rummiarena/frontend:day4-t11-fix-v1` (밤샘 작업 결과)
- **수정 후 배포**: `rummiarena/frontend:day4-t11-fix-v3`

## 1. 사용자 발언

> "게임 포기...2026-04-25_102035~2026-04-25_102535"

## 2. 게임 컨텍스트

| 항목 | 값 |
|------|-----|
| 방 코드 | YKAM |
| 방 ID | `d330f59e-1016-41e2-b761-d515a8a0dcb3` |
| 게임 ID | `66a0f24a-4038-4c12-87ce-a29063ac111d` |
| 인원 | 2인 (애벌레 vs GPT 캐릭터 **벽** 고수 심리전 2) |
| 시작 | 2026-04-25 01:20:52 UTC (10:20:52 KST) |
| 종료 | 2026-04-25 01:25:32 UTC (5분간) |
| turn_count | 10 |
| 종료 사유 | **FORFEIT** |
| ELO 변동 | 애벌레 912 → 897 (-15), GPT 1000 → 1015 (+15) |

## 3. 핵심 관찰

### 3.1. invariant validator 가 작동했다 (긍정 신호)

스크린샷 `2026-04-25_102501.png` & `2026-04-25_102518.png` 에 **빨간 토스트** 가시:

> ⚠ 상태 이상 감지: 그룹 ID 중복 — 자동으로 직전 서버 상태로 복구합니다

이는 어젯밤 추가한 `useEffect` invariant validator (GameClient.tsx:606-639) 가 정확히 작동해 부패 상태를 감지하고 자동 RESET_TURN 한 결과. 하지만:

1. **부패가 발생했다는 사실 자체가 문제** — 어딘가에서 setPendingTableGroups 가 그룹 ID 중복 상태를 commit
2. 사용자에게 **위협적 토스트가 노출** 되어 게임 진행 불가능 인상 → 게임 포기로 이어짐

### 3.2. 11턴 동안 0배치

서버 로그 분석:
- 0건의 PLACE_TILES / CONFIRM_TURN / MOVE 이벤트 (사용자 seat 0)
- AI turn start 5회 (T2/T4/T6/T8/T10)
- 게임 종료 turnCount=10, 사용자 final_tiles=19, GPT final_tiles=5

GPT 는 Turn #2 에 9장 한꺼번에 배치 (12s + 8s + 2-3-JK + 2-3-4 Blue), Turn #8 에 추가 3장. 즉 GPT 는 12장 배치.

사용자 핸드 분석:
- Turn #1 시작 14장: 9R, 4R, 13R, 10B, 12B, 4Y, 4R, 4K, 7B, 12Y, 11R, 2R, 6K, 5Y
- 30점 이상 초기 멜드 후보:
  - 4 그룹 (4R, 4Y, 4K) = 12점 (부족)
  - 12 그룹 (12B, 12Y) = 2색만 있음 (3색 필요, 12K/12R 부재)
  - 런: 어떤 색도 3장 연속 부재
  - **수학적으로 30점 초기 멜드 불가능 핸드**

따라서 사용자는 어쩔 수 없이 매 턴 드로우 → 11턴까지 가도 멜드 못 만든 상태에서 GPT 가 거의 다 비워가는 상황 → 절망 → 포기.

### 3.3. 어젯밤 fix 가 막은 것 / 못 막은 것

| 어젯밤 적용 fix | 동작 여부 |
|---------------|----------|
| Collision detection 우선순위 | 직접 트리거 안 됨 (toast 발동 시 N/A) |
| `table→table` `isCompatibleWithGroup` 사전검사 | 트리거 못 봄 |
| 9개 분기 `detectDuplicateTileCodes` 게이트 | 트리거 못 봄 |
| Invariant validator (catch-after-fact) | **2 회 발동 ✓** |
| handleConfirm 최종 게이트 | N/A (사용자가 확정 시도 못함) |

→ **어젯밤 fix 들 중 9개 분기 detectDuplicateTileCodes 가 모든 entry-level corruption 을 다 못 막고 있다**.

## 4. 추가 fix — Source-Level Guard

### 4.1. 적용 위치

`src/frontend/src/store/gameStore.ts:181-227`

`setPendingTableGroups` setter 자체에 entry-level 검사:
1. 그룹 ID 중복
2. 빈 그룹
3. 동일 tile code 다중 그룹 등장

위반 시 **state 변경 거부 + console.error (stack trace 포함)**.

### 4.2. 부드러워진 사용자 토스트

기존:
> ⚠ 상태 이상 감지: 그룹 ID 중복 — 자동으로 직전 서버 상태로 복구합니다

신규:
> 배치를 다시 정리했어요. 처음부터 다시 시도해 주세요.

(개발자 콘솔에는 풍부한 진단 정보 그대로 유지)

### 4.3. 신규 Jest 테스트 11종

`src/store/__tests__/gameStore-source-guard.test.ts`
- 정상 그룹 → 통과
- null reset → 통과
- 빈 배열 → 통과
- ID 중복 → reject + 기존 state 보존
- tile code 다중 등장 → reject
- 빈 그룹 → reject
- 3가지 위반 동시 → ID 중복 우선 reject
- ID 유니크 + 빈 그룹 1개 → empty group reject
- ID 유니크 + 빈 그룹 없음 + tile 중복 → tile dupes reject
- 라운드트립
- 동일 그룹 내 동일 tile code 2번 → reject

## 5. 최종 상태

```
Test Suites: 17 passed, 17 total
Tests:       4 skipped, 1095 passed, 1099 total
```

- Next.js build: exit 0
- Docker image: `rummiarena/frontend:day4-t11-fix-v3` (deployed)
- Pod: frontend-8496b5486-mtkft Running 0 restart
- Smoke: HTTP 200

## 6. 본질적 한계 인지

**핸드가 30점 초기 멜드 불가능한 경우** 사용자는 어쩔 수 없이 계속 드로우 해야 한다. 이건 게임 규칙 (V-04 30점 초기 등록) 의 산물이지 UI 버그가 아니다. 다만 UX 측면에서:

1. **GPT 가 9장 한 턴에 배치한 것이 사용자에게 좌절감 가중** (벽 캐릭터의 강력함)
2. **사용자가 자신의 핸드에서 가능한 멜드를 모르고 있을 수 있음** — UI 가 힌트 제공 안 함

**미래 개선 후보 (이번 사고 외):**
- AI 캐릭터 "벽" 의 강력한 turn 1 9장 배치 → 사용자 좌절감 가중. 캐릭터 난이도/심리 조합 재검토
- "지금 가능한 멜드" UI 힌트 (선택적) — 초보자 친화
- 핸드가 30점 멜드 불가능할 때 **자동 "패스" 옵션** (수동 드로우 단축)

## 7. 다음 사용자 테스트 권장

**시도 권장:**
1. 캐릭터 **루키** (가장 약함) 로 변경하여 1게임 (사용자 첫 멜드 기회 확보)
2. 또는 3인 모드로 GPT 1명만 (도움받기 쉬움)
3. 만약 또 핸드가 어렵다면 → 그건 게임 카드 분포 운이지 버그 아님

**확인 포인트:**
- "⚠ 상태 이상 감지" 토스트가 사라졌는지 (source guard 가 prevention)
- 부드러운 토스트 "배치를 다시 정리했어요" 도 안 뜨면 좋음
- 만약 또 invariant 가 fire 하면 즉시 브라우저 콘솔 (F12) 의 `[BUG-UI-T11-INVARIANT]` 또는 `[BUG-UI-T11-SOURCE-GUARD]` 로그 캡처 후 알려주세요

---

**서명**: Claude main (Opus 4.7 xhigh)
**관련**: docs/04-testing/84 (1차 사고), docs/04-testing/85 (수용 시나리오)
