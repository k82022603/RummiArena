# 84 — Turn#11 보드 그룹 중복 렌더링 사용자 실측 사고 보고서

- **작성**: 2026-04-24 22:00 KST, Claude main (Opus 4.7 xhigh)
- **사용자**: 애벌레
- **심각도**: **P0 (게임 플레이 자체 불가)**
- **대상 빌드**: `main @ 57e7a62` (Day 3 마감 직후, Day 4 개시 전)
- **연관 이슈**: Day 3 이월 W2-C (F4 FINDING-01 drop handler groupId 분기 재작성)

## 1. 사용자 발언 (원문)

> "긴급소집..게임이 개판이 되었음. 테스트 할 마음도 없어짐. 알아서들 해결해. 2026-04-24_214541 ~ 2026-04-24_215110"

Day 3 PR 14건 머지 후 사용자가 직접 2인 (vs GPT Calculator 고수) 로 플레이테스트를 시도했으나 **11턴 동안 단 한 장도 배치하지 못한 채 강제 종료**. 긴급 대응 요청.

## 2. 재현 설정

| 항목 | 값 |
|------|-----|
| 방 ID | `deffd1e3-8a44-49d6-9153-c91b60f88198` |
| 게임 ID | `a6655d4b-45e9-4d5e-a5ca-6ebc5268d42a` |
| 방 코드 | `ALQS` |
| 인원 | 2인 (애벌레 seat 0 + GPT calculator seat 1) |
| 턴 제한 | 60초 |
| AI 모델 | GPT (OpenAI) · 캐릭터 계산기 · 난이도 고수 · 심리전 2 |
| 게임 시작 | 2026-04-24 21:45:57 KST (12:45:57 UTC) |
| 게임 종료 | 2026-04-24 21:51:03 KST (12:51:03 UTC) |
| 종료 사유 | **FORFEIT** (사용자가 방에서 탈출) |
| turn_count | **11** |
| final_tiles | 애벌레 16장 / GPT 15장 |
| is_winner | **둘 다 false** (FORFEIT) |
| ELO 델타 | 애벌레 -16 (928→912), GPT +16 (1000→1016) |

## 3. 증거 — 스크린샷 타임라인

`/mnt/d/Users/KTDS/Pictures/FastStone/`

| 시각 | 파일 | 관찰 |
|------|------|------|
| 21:45:41 | `2026-04-24_214541.png` | 새 게임 만들기 화면 (2인 · 60초 · GPT 계산기 고수 심리전 2) |
| 21:45:52 | `2026-04-24_214552.png` | 로비 ALQS 방, 양쪽 준비 완료 |
| 21:46:11 | `2026-04-24_214611.png` | Turn#1 시작, 랙 14장 (1/3/4/5/6/7/8/9/10/11/12/12/12/13) |
| 21:46:27 | `2026-04-24_214627.png` | Turn#1 진행 중, 랙 상태 불변 |
| 21:46:59 | `2026-04-24_214659.png` | Turn#2 AI 차례, 사용자 Turn#1 `시간 초과 → 자동 드로우`, 랙 15장 |
| 21:49:57 | `2026-04-24_214957.png` | Turn#11 사용자 차례. 보드: 그룹 3개(12B/12K/12R) + 그룹 3개(11R/11Y/11K) + **미확정 1개(11B)**. 랙 14장. 턴 히스토리: `#3 나 배치 3장`, `#10 GPT 배치 3장`, 나머지 드로우 |
| 21:50:08 | `2026-04-24_215008.png` | **🚨 버그 발생** — 보드에 `무효 세트 4개 × 2` (양쪽 모두 12B/12K/12R/11B 로 동일), 11s 그룹 소실. 랙 14장 |
| 21:50:27 | `2026-04-24_215027.png` | **🚨 중복 지속** — 보드에 `그룹 (미확정) 3개 × 2` (양쪽 모두 12B/12K/12R), 11B 랙 복귀(15장), 11s 그룹 완전 소실 |
| 21:50:41 | `2026-04-24_215041.png` | Turn#12 AI 차례. Turn#11 `시간 초과 → 자동 드로우` 처리됨. 서버 상태 복귀: 그룹 3개(12B/12K/12R) + 그룹 3개(11R/11Y/11K). 랙 16장 |
| 21:51:01 | `2026-04-24_215101.png` | 사용자 `나가기` 클릭, confirm 다이얼로그 `게임이 진행 중입니다. 나가시겠습니까?` |
| 21:51:10 | `2026-04-24_215110.png` | 로비로 복귀, 게임 FORFEIT 종료 |

## 4. 증거 — 서버 로그

```bash
kubectl logs -n rummikub game-server-675dc5c8c9-88pps -c game-server --since=15m | grep a6655d4b
```

| UTC | 이벤트 | seat | 근거 |
|-----|-------|------|------|
| 12:45:57.65 | NotifyGameStarted | - | firstSeat=0 |
| 12:46:57.66 | turn timer expired | **0** (사용자) | Turn#1 timeout |
| 12:46:57.67 | AI turn start | 1 | Turn#2 GPT |
| 12:47:41.24 | AI turn start | 1 | Turn#4 (홀수 턴=사용자 모두 timeout) |
| 12:48:15.91 | AI turn start | 1 | Turn#6 |
| 12:48:48.90 | AI turn start | 1 | Turn#8 |
| 12:49:14.71 | AI turn start | 1 | Turn#10 (GPT 배치 3장) |
| 12:50:31.61 | turn timer expired | **0** (사용자) | **Turn#11 timeout** |
| 12:50:31.62 | AI turn start | 1 | Turn#12 (시작 전 취소됨) |
| 12:51:03.55 | room status FINISHED | - | FORFEIT |

### 핵심 관찰

- **`MOVE_ACCEPTED` / `turn.commit` / `CONFIRM_TURN` 이벤트가 사용자 seat 0 으로부터 11턴 내내 0 건**
- 서버 관점: 사용자는 단순히 매 턴 60초 타임아웃만 반복
- 서버 상태(tableGroups)는 내내 일관성 유지 → **프론트 optimistic state 단독 버그**
- 턴 히스토리 UI 의 `#3 나 배치 3장` 은 사용자 착각 아니면 초기 턴 번호 불일치 (추가 조사 필요). 현재 DB `game_events` 로그에는 GAME_END FORFEIT 이벤트만 존재. ※ Turn#3 "배치 3장" 기록의 서버 근거는 별도 조사 과제로 분리한다.

## 5. 버그 기전 가설

### 관찰 정리

- 21:49:57 → 21:50:08 사이 **1 동작**으로 보드가 다음처럼 전환:
  - **Before**: `[GA(12s) pending, GB(11s) pending, G_single(11B) pending]` (7 tiles)
  - **After**: `[무효세트(12B,12K,12R,11B), 무효세트(12B,12K,12R,11B)]` (8 tiles)
- 11B 는 1 장뿐인데 2 그룹에 모두 존재 → **실제 타일 복제**
- 11s 그룹(11R,11Y,11K) 완전 소실
- 랙 카운트 14장 유지 (rack 에서 추가 tile 소비 없음)

### 가설 A — table→table drag 핸들러 compatibility 미검사 (line 802-877)

`src/frontend/src/app/game/[roomId]/GameClient.tsx:832-876` 의 테이블 그룹 간 이동 분기는 **isCompatibleWithGroup 검사가 없다**. 사용자가 11B 를 12s 그룹으로 드래그하면 (12B,12K,12R,11B) 4-tile 무효 세트가 생성됨. **이것 자체는 관찰된 좌측 그룹을 설명**.

### 가설 B — dnd-kit collision re-fire + filter 누수

동일 pointer-up 이벤트로 handleDragEnd 재진입 방어(`isHandlingDragEndRef` + `lastDragEndTimestampRef`) 는 작동하지만, **서버 그룹 → 서버 그룹 이동 분기에서 freshTableGroups.map + .filter 후 setPendingGroupIds 설정 시 11s 서버 그룹이 pendingGroupIds 에서 제외되어 이후 재렌더에서 누락**되었을 가능성.

실제로 line 870-876 에서:
```ts
const nextGroupIdSet = new Set(nextTableGroups.map((g) => g.id));
const updatedPendingIds = new Set(
  [...freshPendingGroupIds, targetGroup.id].filter((id) => nextGroupIdSet.has(id))
);
setPendingGroupIds(updatedPendingIds);
```

위 계산은 **source 그룹 ID 를 pendingGroupIds 에서 제거**하지만, 실제 nextTableGroups 에는 source 그룹이 filter 로 이미 삭제된 경우만 올바르다. 하지만 이는 duplicate 를 만들지 않는다.

### 가설 C — 사용자가 11B 를 11s 그룹이 아닌 "새 그룹 드롭존" 또는 "game-board" 쪽으로 드래그 + shouldCreateNewGroup 로직 폭주

`treatAsBoardDrop` (line 1080-1211) 에서 `lastPendingGroup` 이 잘못 선택되어 기존 그룹 복제 생성. Day 11 BUG-NEW-001 이 이미 수정한 것으로 알려졌으나 재회귀 가능성.

### 결정적 원인 미확정

**원인 추적은 Day 4 Morning Gate 의 최우선 과제**. 현재 정보로 3개 가설 모두 성립 가능. RED spec 우선 확보 필요.

## 6. 영향 범위

1. **게임 플레이 가능성 0 %** — 사용자가 실제 플레이 불가. 배치 액션이 중복을 유발하면 `ConfirmTurn` 클라이언트 사전검증에서 `detectDuplicateTileCodes` 에 의해 차단 → 턴 타임아웃 → 자동 드로우 → 반복.
2. **Day 3 "GREEN" 평가 무효** — 13 TC GREEN / PR 14건 머지했으나 **실제 사용자 세션에서 1턴도 완료 불가**. 기존 테스트가 사용자 관점 종합 시나리오를 커버하지 못했다는 증거.
3. **ELO 무효 이적** — FORFEIT 로 인한 -16 vs +16 점수 변동은 시스템 취약점에 의한 불공정 이적.

## 7. 즉시 조치 (2026-04-24 밤)

- [x] 사고 기록 (현 문서) 작성 — **완료**
- [x] K8s 게임서버 로그 스냅샷 확보 — 위 §4 인용
- [x] 스크린샷 8장 증거 확보 — §3 표로 인덱싱
- [ ] GitHub Issue 생성 — `BUG-UI-SESSION-T11-DUP-2026-04-24` 라벨로 Day 4 P0
- [ ] RED spec 3종 작성 — 가설 A/B/C 각각 단위 테스트로 분리

## 8. Day 4 Morning Gate 강제 차단 조건

다음 모두 만족하지 않으면 Day 4 의 어떤 PR 도 머지 금지:

1. 본 사고 재현 RED spec **최소 1 종** 작성 및 확정 실패 확인
2. 사용자 1회 플레이테스트 (배치 최소 3 턴 성공) 통과
3. Playwright E2E 에 "turn-commit-happy-path" 신규 시나리오 등록 (랙 → 보드 3-tile 배치 → ConfirmTurn 성공 → 서버 반영 확인)

## 9. 5 Whys

1. Q: 왜 사용자가 게임을 포기했나? A: 11턴 내내 단 한 장도 배치 못 함.
2. Q: 왜 배치가 안 됐나? A: 배치 조작 시 보드 그룹이 복제되어 `detectDuplicateTileCodes` 가 확정 차단.
3. Q: 왜 복제가 발생하나? A: handleDragEnd 의 테이블→테이블 분기 중 특정 조합에서 그룹이 복제되는 경로가 존재.
4. Q: 왜 Day 3 테스트는 이를 잡지 못했나? A: Day 3 RED spec 들은 **개별 버그 단위**만 커버했고, **사용자 연속 조작(랙→보드→보드→확정) 종합 시나리오** 가 부재.
5. Q: 왜 종합 시나리오가 없었나? A: pre-deploy-playbook (PR #71) 이 단위 TC 중심이었고, **"1 게임 완주 메타"** (skill `pre-deploy-playbook` 에 명시되어 있음) 가 실제로 실행된 적 없음.

## 10. 장기 재발 방지

- `pre-deploy-playbook` SKILL 강제 실행: 모든 PR 병합 전 사용자 시나리오 세트 + 1게임 완주 자동화
- `ui-regression` SKILL 의 회귀 매트릭스에 **T11 스크린샷 세트** 추가하여 이후 회귀 즉시 탐지
- Day 3 피드백 "사용자가 체크리스트 역할" 을 재인식: Claude 가 사용자 앞에서 **HEAD SHA 빌드 검증 / worktree 격리 / SKILLS 스캔** 3줄 체크리스트 매 세션 수행

---

**서명**: Claude main (Opus 4.7 xhigh)
**최종 승인**: 애벌레 (2026-04-25 AM)
