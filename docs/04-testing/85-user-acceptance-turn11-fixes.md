# 85 — 사용자 수용 테스트 시나리오 (Turn#11 사고 수정 검증)

- **작성**: 2026-04-25 00:30 KST, Claude main (Opus 4.7 xhigh)
- **대상**: 애벌레
- **배경**: `docs/04-testing/84-ui-turn11-duplication-incident.md` 사고 수정 완결 검증
- **배포 이미지**: `rummiarena/frontend:day4-t11-fix-v1`
- **테스트 URL**: http://localhost:30000/

## 이번 밤 수정 요약

### 1. 근본 방어선 3 계층
| 계층 | 위치 | 역할 |
|-----|------|------|
| **Collision detection 우선순위** | `GameClient.tsx:423` | 중첩 droppable 중 `game-board` 부모는 내부 자식 droppable 후순위로 강등 |
| **Compatibility 사전검사 (table→table)** | `GameClient.tsx:845` | 서버 확정 그룹 타겟에 호환 안 되는 타일 드롭 시 `isCompatibleWithGroup` 로 거절 |
| **Duplicate defense 전 분기** | `GameClient.tsx` 9개 `setPendingTableGroups` 지점 | 모든 state 전이 전 `detectDuplicateTileCodes` 게이트 |

### 2. 상태 invariant validator + 자동 복구 (신규)
- `GameClient.tsx:596-641` 에 useEffect 추가
- **매번** `pendingTableGroups` 변경 시 다음 검사:
  - 동일 타일 코드 2 회 이상 등장
  - 그룹 ID 중복
  - 빈 그룹 존재
- 위반 시:
  - 에러 토스트 표시
  - `pendingTableGroups/pendingMyTiles/pendingGroupIds` 초기화
  - `RESET_TURN` 서버 전송 → 서버 진실 복원

### 3. handleConfirm 최종 관문 강화
- `GameClient.tsx:1551-1569` — 확정 버튼 눌렀을 때 CONFIRM_TURN 전송 직전:
  - 기존: 타일 코드 중복 검사
  - 추가: 그룹 ID 중복 검사, 빈 그룹 검사

## 테스트 환경 준비 확인

```bash
$ kubectl get pods -n rummikub | grep frontend
frontend-56989b6cd4-9znkd      1/1     Running   0             <24s>

$ kubectl get deployment frontend -n rummikub -o jsonpath='{.spec.template.spec.containers[0].image}'
rummiarena/frontend:day4-t11-fix-v1

$ curl -s -o /dev/null -w "%{http_code}\n" -L http://localhost:30000/
200
```

## 사용자 테스트 시나리오

### 시나리오 A — Turn#11 사고 재현 시도 (가장 중요)

**목표**: 어제 재현된 보드 복제 상황을 재현 시도 → **절대 복제 안 됨** 확인

**단계**:
1. 로비에서 "새 게임" → 2인, 턴 60초, GPT Calculator 고수 심리전 2
2. 방 만들기 → 게임 시작
3. Turn #1 (본인 차례): 랙에 있는 3색 동일 숫자 (예: 12 세 장) 로 초기 멜드 36 점 이상 → 확정
4. AI 턴 기다림. AI 가 배치 or 드로우
5. 몇 턴 지나 본인 랙에 뽑힌 타일이 쌓이면: 임의의 타일 하나를 보드의 **서버 확정 그룹** 위로 드래그 시도
6. **기대 결과 (수정 후)**:
   - 호환 타일 → 자동 병합 (녹색 하이라이트 + ✓ 아이콘)
   - 비호환 타일 → 새 미확정 그룹 생성 OR 토스트 "해당 세트에 합칠 수 없는 타일입니다" (table→table 경로)
   - 어떤 경우에도 **동일 그룹 복제 절대 불가** (보드에 동일 타일이 두 번 나타나지 않음)

**실패 시 징후**:
- "무효 세트 N개" 라벨이 동일 타일로 두 번 이상 나타남 → **BUG**
- "상태 이상 감지" 토스트가 자동 표시됨 → invariant validator 가 버그 포착했다는 긍정 신호. 그 자체는 복구 정상 (다음 단계 자동 수행)

### 시나리오 B — 빠른 연타

**목표**: dnd-kit 재진입 / pointer re-fire 시에도 중복 생성 불가

**단계**:
1. 본인 차례에 타일 1개를 보드로 빠르게 2~3번 드래그 시도 (빠른 연타)
2. **기대**: pending 그룹 1개만 생성 (`isHandlingDragEndRef` + `lastDragEndTimestampRef` 재진입 가드)

### 시나리오 C — 조커 교체

**목표**: 조커 swap 경로 정상 작동 + 회수된 조커 재사용 가능

**단계**:
1. 서버 확정 그룹에 조커(JK1/JK2)가 포함된 상태에서 (AI 가 조커 포함 메ld 만들 수 있음)
2. 본인 랙의 일반 타일 중 조커 위치에 들어갈 수 있는 타일을 조커 위로 드래그
3. **기대**: 조커가 회수되어 랙에 되돌아감 ("JokerSwapIndicator" 배너 표시)
4. 회수된 조커를 다른 새 그룹에 사용
5. 확정

### 시나리오 D — 재배치 (§6.2)

**목표**: 초기 등록 완료 후 기존 서버 그룹에서 타일을 다른 그룹으로 이동

**단계**:
1. 초기 등록 완료 후 2~3 턴 진행하여 보드에 2+ 서버 그룹이 있음
2. 한 그룹의 타일을 드래그해 다른 그룹으로 이동
3. **기대**:
   - 호환 (같은 숫자 그룹에 다른 색, 같은 색 런에 인접 숫자) → 이동 성공
   - 비호환 → 토스트 "해당 세트에 합칠 수 없는 타일입니다"
4. 확정

### 시나리오 E — 되돌리기

**목표**: pending 상태에서 "초기화" 버튼으로 모두 취소

**단계**:
1. 랙에서 보드로 2~3 타일 드래그
2. "↺ 초기화" 버튼 클릭
3. **기대**: 모든 pending 그룹 사라지고 타일이 랙으로 복귀

### 시나리오 F — 1 게임 완주 (메타)

**목표**: 어제 "11턴 내내 1장도 못 놓은" 상황 반대로, 정상 플레이 가능 확인

**단계**:
1. 2인 GPT AI 대전
2. 5턴 이상 배치 성공 (초기 멜드 포함)
3. 게임 정상 종료 (승리/패배/타임아웃 모두 허용)

### 시나리오 G — 에러 자가 복구 테스트

**목표**: invariant validator 동작 확인 (의도적으로 이상 상태 유발 불가능하므로 관찰만)

**단계**:
1. 임의로 여러 타일 빠르게 드래그 시도
2. 만약 "상태 이상 감지: 중복 타일 ... — 자동으로 직전 서버 상태로 복구합니다" 토스트 표시되면
3. **기대**: 자동으로 보드가 초기 서버 상태로 복귀, 사용자는 정상 플레이 재개 가능

## 진행 방식 안내

1. 위 시나리오 A (가장 중요) 먼저 15~20 분 플레이
2. **어떤 이상 동작이든 발견 즉시 FastStone 으로 스크린샷** → `D:\Users\KTDS\Pictures\FastStone\YYYY-MM-DD_HHMMSS.png`
3. 스크린샷 타임스탬프를 Claude 에게 알려주시면 즉시 분석
4. 평소처럼 "또 개판됐어" 라고 말씀하시면 됩니다. 이번엔 로그가 풍부합니다.

## 로그 접근

```bash
# 브라우저 콘솔 (F12 → Console) — invariant 발동 시 [BUG-UI-T11-INVARIANT] 출력
# K8s game-server 로그
kubectl logs -n rummikub deploy/game-server --since=5m -c game-server | grep <room-id>

# K8s frontend 로그 (SSR)
kubectl logs -n rummikub deploy/frontend --since=5m
```

## 테스트 통과 기준

| 지표 | 목표 | 실패 시 |
|------|------|--------|
| Jest 유닛 테스트 | **1084 / 1088 PASS** (4 skipped) | Next build 중단 → 재배포 필요 |
| Next.js build | **exit 0** | 배포 자체 차단 |
| 시나리오 A 15분 | 복제 사고 **0 건** | 즉시 Claude 에 스크린샷 제공 |
| 시나리오 F 1 게임 | **정상 완주** (배치 5+ 턴) | 같음 |
| 브라우저 콘솔 | `[BUG-UI-T11-INVARIANT]` 로그 0 건 (정상 경로) | 로그 발생 = validator 동작 = 내부 corruption 포착, 즉 **순기능**이지만 수정 대상 |

## 실패 시 Claude 대응 준비

본 세션은 유지됨. "ABCDE" 어느 시나리오에서 실패했는지 + 스크린샷 타임스탬프만 알려주시면:
1. K8s 로그 스냅샷 확보
2. 브라우저 console 로그 요청
3. 즉시 투입 (새벽/아침 무관)

---

**서명**: Claude main (Opus 4.7 xhigh), 2026-04-25 00:30 KST
**다음 단계**: 애벌레 시나리오 A 우선 플레이 → 피드백 대기
