# 2026-04-29 후속 작업 계획 — P3-3 + GHOST-SC2 RCA

> **상태**: 준비 완료. 사용자가 다음 세션 진입 시 즉시 착수 가능.

---

## 0. 시작 전 점검 (10초)

```bash
cd /mnt/d/Users/KTDS/Documents/06.과제/RummiArena
git log --oneline -3
# 기대: e8af7fc → 40a1f4c → 1f53481

git status --short
# 기대: M src/frontend/e2e/auth.json (자동 갱신, 무시 가능)

kubectl get deploy -n rummikub -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.template.spec.containers[0].image}{"\n"}{end}'
# 기대: frontend = day7-1f53481, game-server = day7-1f53481, ai-adapter = day5-f1969f0
```

---

## 1. 작업 우선순위

| # | 작업 | 담당 | 위험도 | 예상 소요 | 의존성 |
|---|------|------|--------|----------|--------|
| **W1** | **GHOST-SC2 fixture 회귀 RCA** | frontend-dev | 낮음 | 1~2시간 | 없음 (먼저 진행 권장) |
| **W2** | **P3-3 DndContext GameClient → GameRoom 이전** | frontend-dev-opus + architect | 높음 | 4~6시간 | 없음 |

**권장 순서**: W1 먼저 (작은 작업으로 워밍업) → W2 (큰 리팩토링).

병렬 진행도 가능하나 두 작업 모두 GameClient.tsx를 만지므로 충돌 가능. **순차 권장**.

---

## 2. W1: GHOST-SC2 fixture 회귀 RCA + 수정

### 배경

pre-deploy-playbook 2회 실행 결과 GHOST-SC2가 fixture 단계에서 FAIL. 동일 `setupGhostScenario` 헬퍼를 쓰는 GHOST-SC1/SC3와 거동 차이.

### 의심

ROOM_STATE WS 메시지가 fixture 직후 도착하여 `pendingStore.draft`를 덮어쓰는 race condition.

### 작업 단계

**1. 코드 분석** (30분):
- `src/frontend/e2e/rule-ghost-box-absence.spec.ts:36-112` `setupGhostScenario` 헬퍼
- `src/frontend/e2e/helpers/game-helpers.ts` `setPendingDraft`
- ROOM_STATE 수신 핸들러: `src/frontend/src/hooks/useWebSocket.ts`

**2. 재현 + 진단** (30분):
```bash
cd src/frontend
npx playwright test e2e/rule-ghost-box-absence.spec.ts --workers=1 --reporter=list 2>&1 | tail -30
# GHOST-SC2 실패 시점 trace.zip 확인
# test-results/rule-ghost-box-absence-BUG-f3bb7-*/trace.zip
```

**3. 수정 방향** (30분):
- 옵션 A: fixture 주입을 ROOM_STATE 수신 **후**로 미루기 (`page.waitForFunction(() => window.__gameStore?.getState().turnStartedAt)` 후 setPendingDraft)
- 옵션 B: ROOM_STATE 핸들러에서 fixture 모드일 때 pendingStore 덮어쓰기 방지 (NEXT_PUBLIC_E2E_BRIDGE 가드)
- 옵션 C: 헬퍼에서 `setPendingDraft` + `await page.waitForFunction(() => window.__pendingStore?.getState().draft?.groups.length > 0)` 폴링

권장: 옵션 A (fixture 자체 수정, 가장 단순).

### 검증

```bash
npx playwright test e2e/rule-ghost-box-absence.spec.ts --workers=1 2>&1 | tail -20
# 기대: GHOST-SC2 FAIL → PASS 전환
```

### 시작 명령 (frontend-dev dispatch 프롬프트 템플릿)

```
## GHOST-SC2 fixture 회귀 RCA + 수정

프로젝트: /mnt/d/Users/KTDS/Documents/06.과제/RummiArena

### 증상
e2e/rule-ghost-box-absence.spec.ts의 GHOST-SC2가 fixture 단계에서 FAIL.
GHOST-SC1/SC3는 동일 setupGhostScenario를 쓰는데 거동 차이.

### 의심
ROOM_STATE WS 메시지가 fixture 직후 도착하여 pendingStore.draft를 덮어씀.

### 작업
1. setupGhostScenario(rule-ghost-box-absence.spec.ts:36-112) + setPendingDraft 헬퍼 분석
2. 재현 후 trace 확인 (test-results/rule-ghost-box-absence-BUG-f3bb7-*/)
3. 수정: ROOM_STATE 수신 후로 fixture 주입 미루기 (page.waitForFunction)
4. 검증: GHOST-SC2 PASS 전환

기존 회귀 0건, 614 PASS 유지.
```

---

## 3. W2: P3-3 DndContext 이전

### 배경

P3-2 완료 시 useDragHandlers는 GameClient.handleDragEnd 행동 등가 보장 (커밋 `8d3abd9`). DndContext + sensors + DragOverlay 어셈블리는 여전히 GameClient에 있음. P3-3에서 이것을 GameRoom으로 이전하여 1830줄 모놀리스 분해를 완성.

### 작업 단계 (단계별 분리 진행)

#### Step 1: forceNewGroup → dragStateStore 흡수 (1시간)

**파일**:
- `src/frontend/src/store/dragStateStore.ts`: `forceNewGroup: boolean` + `setForceNewGroup` 추가
- `src/frontend/src/app/game/[roomId]/GameClient.tsx`: `useState<boolean>(false)` 제거, dragStateStore 구독으로 교체
- "+ 새 그룹" 버튼 onClick은 그대로 유지하되 `dragStateStore.setForceNewGroup` 호출

**검증**: Jest 634 PASS 유지 + "+ 새 그룹" 버튼 토글 동작 확인.

#### Step 2: GameRoom이 옵션 주입하여 useDragHandlers 호출 (1시간)

**파일**: `src/frontend/src/app/game/[roomId]/GameRoom.tsx`
- 기존 no-args `useDragHandlers()` 마운트 (P3-2에서 제거됨)는 그대로
- 새로 `useDragHandlers({ forceNewGroup, setForceNewGroup, isHandlingDragEndRef, ..., showExtendLockToast, isMyTurn, activeDragSourceRef, setActiveDragCode })` 옵션 주입
- ref들과 setActiveDragCode는 GameRoom에서 useState/useRef로 신규 관리

**검증**: TypeScript 컴파일 + Jest 634 PASS.

#### Step 3: DndContext + sensors + DragOverlay 이전 (2시간)

> **2026-04-29 첫 dispatch agent 분해 권장 (Opus 분석)**: Step 3을 3a/3b로 추가 분리.
> - **3a**: `activeDragCode` React state → 기존 `dragStateStore.activeTile`로 통합 (setActiveDragCode 옵션 제거, GameClient/DragOverlay 모두 store 구독)
> - **3b**: DndContext + sensors + collisionDetection + DragOverlay GameRoom 이전
>
> 사유: `activeDragCode`는 DragOverlay 렌더링 + GameBoard의 `isDragging`/`validMergeGroupIds` 양쪽에서 사용 → DragOverlay만 이전하면 React state 공유 문제 발생. `dragStateStore.activeTile`이 이미 존재하므로 통합 가능.
> 또한 GameClient는 `<>...</>` Fragment 반환 + ErrorToast/ExtendLockToast/ReconnectToast 포함 → DndContext children 배치 시 토스트 위치 점검 필요.

**파일**:
- `GameRoom.tsx`: `<DndContext>...</DndContext>` 감싸서 children으로 GameClient 렌더링
  - sensors: `useSensors(useSensor(PointerSensor, { activationConstraint: ... }))`
  - collisionDetection: `pointerWithinThenClosest` 함수 GameClient에서 추출 후 GameRoom 또는 별도 lib로 이동
  - onDragStart/End/Cancel: `dragHandlers.handleDragStart/End/Cancel`
  - DragOverlay: activeDragCode 기반 Tile 렌더링

- `GameClient.tsx`: DndContext, DragOverlay, sensors, collisionDetection 제거

**검증**: Jest 634 PASS + dev server에서 드래그 동작 확인.

#### Step 4: GameClient의 인라인 핸들러 제거 (1시간)

**파일**: `src/frontend/src/app/game/[roomId]/GameClient.tsx`
- `_DEPRECATED_INLINE_HANDLE_DRAG_END_BEGIN` alias + 인라인 본문 ~580줄 삭제
- handleDragStart/End/Cancel 인라인 정의 제거
- props interface에 onDragStart/End/Cancel 받지 않음 (GameRoom이 DndContext 소유)

**예상 결과**: GameClient 1900줄 → ~1200줄 (~700줄 감소).

#### Step 5: 검증 + 배포 (1시간)

```bash
# Jest
cd src/frontend && npx jest --ci 2>&1 | tail -10
# 기대: 634 PASS / 0 FAIL

# TypeScript
npx tsc --noEmit 2>&1 | tail -10

# 빌드 + 배포
docker build -t rummiarena/frontend:day7-<commit-hash> -f src/frontend/Dockerfile src/frontend/
kubectl -n rummikub set image deployment/frontend frontend=rummiarena/frontend:day7-<commit-hash>
kubectl -n rummikub rollout status deployment/frontend --timeout=120s

# E2E 회귀 검증 (qa)
npx playwright test --workers=1 e2e/rule-*.spec.ts e2e/rearrangement.spec.ts 2>&1 | tail -30
# 기대: 9 PASS / 2 FAIL / 3 SKIP (베이스라인 동등) 또는 GHOST-SC2 GREEN (W1 먼저 했다면)
```

### 시작 명령 (frontend-dev-opus dispatch 프롬프트 템플릿)

```
## P3-3 DndContext GameRoom 이전 (행동 등가 보장 확인 완료)

프로젝트: /mnt/d/Users/KTDS/Documents/06.과제/RummiArena

### 배경
P3-2 완료 (useDragHandlers 행동 등가). 이제 DndContext를 GameRoom으로 이전.

### 단계별 진행 (각 Step 후 Jest 634 PASS 유지)

Step 1: forceNewGroup → dragStateStore 흡수
- dragStateStore에 forceNewGroup + setForceNewGroup 추가
- GameClient의 useState 제거, store 구독으로 교체

Step 2: GameRoom이 useDragHandlers 옵션 주입
- ref들과 setActiveDragCode를 GameRoom에서 관리
- 옵션 주입하며 호출

Step 3: DndContext + sensors + DragOverlay 이전
- GameRoom이 DndContext 소유
- pointerWithinThenClosest 함수 GameClient에서 추출

Step 4: GameClient 인라인 핸들러 제거
- _DEPRECATED_INLINE_HANDLE_DRAG_END_BEGIN alias + 인라인 본문 ~580줄 삭제
- 예상 GameClient 1900줄 → ~1200줄

각 단계 별도 커밋, Jest 통과 게이트 통과 후 다음 단계 진행.
```

### 위험도

- **높음**: handleDragEnd 행동 변경, DndContext 재구성
- **완화책**: 단계별 분리 + 각 단계 Jest 게이트 + 각 단계 별도 커밋 + GameClient에 보존된 `_DEPRECATED_INLINE_HANDLE_DRAG_END_BEGIN` alias 안전망

---

## 4. 작업 흐름 (전체)

```
1. W1 GHOST-SC2 RCA (frontend-dev)
   ↓
2. W1 검증 + 커밋/푸시
   ↓
3. W2 Step 1 forceNewGroup (frontend-dev-opus)
   ↓
4. W2 Step 2 GameRoom 옵션 주입 (frontend-dev-opus)
   ↓
5. W2 Step 3 DndContext 이전 (frontend-dev-opus + architect)
   ↓
6. W2 Step 4 GameClient 인라인 제거 (frontend-dev-opus)
   ↓
7. W2 빌드 + 배포 + qa E2E 회귀 검증
   ↓
8. 통합 커밋 + push (origin + gitlab)
```

---

## 5. 각 단계 후 검증

| 단계 | Jest | TypeScript | E2E | 비고 |
|------|------|-----------|-----|------|
| W1 후 | 634 PASS | 0 errors | GHOST-SC2 GREEN | rule 4 spec 9-2-3 → 10-1-3 기대 |
| W2-1 후 | 634 PASS | 0 errors | (skip) | 작은 변경 |
| W2-2 후 | 634 PASS | 0 errors | (skip) | 작은 변경 |
| W2-3 후 | 634 PASS | 0 errors | rule 4 spec | 큰 변경, E2E 필수 |
| W2-4 후 | 634 PASS | 0 errors | rule 4 spec | 인라인 제거, E2E 필수 |
| 최종 | 634 PASS | 0 errors | rule 4 spec + rearrangement | pre-deploy-playbook 권장 |

---

## 6. 추가 후속 작업 (시간 여유 시)

A 방안 + W1 + W2 완료 후 진행:

- rule-one-game-complete spec snapshot 로직 보강 (qa, P1)
- RISK-01~06 시나리오 E2E 편입 (qa + game-analyst, P1)
- deepseek-reasoner vs V4-Pro 비교 실측 (ai-engineer, 5/5 할인 종료 전)
- next-auth v5 이주 사전 분석 (security)

---

## 7. 참조 문서

- `docs/02-design/64-ui-state-architecture-2026-04-28.md` — UI State 아키텍처 통합
- `docs/02-design/65-opus-pair-coding-2026-04-28.md` — 페어코딩 문서
- `work_logs/sessions/2026-04-28-02.md` — 마라톤 마감 세션 로그
- `work_logs/daily/2026-04-28.md` — 데일리 종합
- `.claude/skills/ui-regression/SKILL.md` — UI 회귀 검증 절차
- `.claude/skills/pre-deploy-playbook/SKILL.md` — 배포 전 게이트
- `.claude/skills/code-modification/SKILL.md` — 코드 수정 표준 절차

---

## 8. 핵심 원칙 (오늘 확립된 것)

1. **메인 세션 직접 코드 수정 금지** — frontend-dev / frontend-dev-opus / go-dev 등 에이전트 위임
2. **페어코딩 활용** — Sonnet(구현) + Opus(리뷰/위험도 평가) 분업
3. **위험도 평가 후 분해 진행** — 무리한 강행 대신 안전한 분해
4. **각 단계 Jest 게이트** — 다음 단계 진행 전 회귀 0건 확인
5. **commit-push 양쪽** — origin + gitlab 모두 push
6. **새 룰 만들기 전에 그 룰이 필요 없게 만들 수 있는지 먼저 묻기** — V-21 재정의 교훈

---

**작성**: 2026-04-29 (마라톤 마감 직후)
**작성자**: Claude Opus 4.7 (메인 세션)
**다음 작업 시작 시**: 본 문서 §0 점검 → §2 W1 또는 §3 W2 dispatch
