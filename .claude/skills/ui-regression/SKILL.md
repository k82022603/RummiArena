---
name: ui-regression
description: UI 회귀 테스트 실행 + 결과 분류 + 시나리오 추가 가드레일. 프론트엔드 수정 전후, PR/배포 전, 사용자 실측 버그 대응 시 사용.
---

# UI Regression (프론트엔드 회귀 검증)

> "UI는 이 프로젝트에서 가장 어려운 계층이다. dnd-kit 충돌 검출, WS 이벤트 race, 사용자 실측 의존성이 backend 와 질적으로 다른 복잡도를 만든다. 자동화 다 GREEN 이어도 사용자가 '게임 못 하겠다' 하면 우리가 놓친 것."

## Purpose

프론트엔드 수정이 **실제 사용자 시나리오**에 regression 을 일으키지 않는지 일관되게 검증한다. 단순 `npm test` 실행을 넘어, 오늘 세션에서 드러난 **계층 분산 검증·반사실적 체크리스트·사용자 실측 기반 시나리오 추가**를 강제한다.

**적용 대상**: frontend-dev 에이전트 + Claude Code 메인 세션의 프론트 관련 호출

**SSOT**: `docs/04-testing/66-ui-regression-plan.md` (운영 계획), `docs/04-testing/65-day11-ui-scenario-matrix.md` (시나리오 매트릭스), `docs/02-design/31-game-rule-traceability.md` (게임룰 ↔ 코드 추적성)

---

## Trigger (자동 발동 조건)

다음 문맥에서 본 SKILL 호출:
- "regression 돌려", "회귀 확인", "테스트 다시 돌려"
- UI 파일 수정 직후 (`src/frontend/src/` 하위 변경)
- PR 생성 전 (`code-modification` Phase 4 의 일부로)
- Pod 재배포 후 smoke 검증
- 사용자 실측 버그 리포트 수신 직후

**수동 호출**: `이 파일 수정했으니 ui-regression 돌려` 같은 요청

---

## Phase 0: Pre-flight (수정 범위 파악)

1. `git diff --stat` 으로 수정 파일 확인
2. 수정 파일별 **계층 분류**:
   - `src/frontend/src/lib/**` — Unit 영향
   - `src/frontend/src/store/**` — Unit + Integration 영향
   - `src/frontend/src/components/**` — Unit + Integration + E2E 영향
   - `src/frontend/src/app/game/[roomId]/GameClient.tsx` — **모든 계층 + 드래그 회귀 고위험**
3. **반사실적 체크리스트** (필수 기재):
   - [ ] 이 수정이 영향 줄 수 있는 **다른 경로 3개**를 나열했는가
   - [ ] `docs/02-design/31-game-rule-traceability.md` 에서 관련 규칙(V-01~V-15) 을 확인했는가
   - [ ] 엣지 케이스 확인: 1장짜리 미완성 블록 / 조커 포함 / 최초 등록 전 vs 후 / 상대 턴 / 연결 끊김
4. **금기 트리거 감지**:
   - dnd-kit `collisionDetection` 변경 → Phase 3 E2E 필수 실행
   - `classifySetType` 또는 `isCompatibleWithGroup` 수정 → Phase 2 Integration 필수
   - `handleDragEnd` 내 분기 추가/수정 → 반드시 해당 분기 단위 테스트 동반

Phase 0 체크리스트 미완이면 **이후 Phase 실행 금지**.

---

## Phase 1: Unit (Jest)

```bash
cd src/frontend
npm test
```

### 성공 기준

- **100% PASS** (flaky 허용 X)
- 기존 97개 유지 + 신규 테스트 추가

### 실패 시

1. 실패 테스트 전수 파악 (`--verbose`)
2. 실패 원인 분류:
   - (a) 프로덕션 버그 → 수정 커밋으로 복귀
   - (b) 테스트 결함 → 별도 커밋 분리
   - (c) 환경 문제 (haste-map, node_modules) → 재시도
3. 절대 금지:
   - `test.skip` / `xit` 로 우회
   - `--forceExit` 로 강제 통과
   - 실패 무시하고 다음 Phase 진행

### 신규 단위 테스트 의무

UI 수정 시 해당 단위에 대한 Jest 테스트를 **동반 커밋**:
- 순수 함수 (lib/) → happy + null/undefined + edge 최소 3개
- selector (store/) → pending null / pending empty / pending with items
- 컴포넌트 분기 → prop 조합별 렌더 단언

---

## Phase 2: Integration (Jest + @testing-library)

대상: `handleDragEnd` 분기, `gameStore` 다중 selector, WS mock 기반 이벤트 순서

### 커맨드 패턴

```bash
cd src/frontend
npx jest --testPathPatterns="integration|handleDragEnd|gameStore"
```

### 필수 시나리오 (오늘 세션 기반)

| 시나리오 | 단언 |
|----------|------|
| 빈 보드 드롭 → 새 그룹 생성 | `pendingTableGroups.length` +1, 새 그룹에 타일 1장 |
| 기존 pending 그룹에 호환 타일 드롭 → 병합 | 그룹 크기 +1, id 유지 |
| 서버 확정 그룹에 비호환 타일 드롭 → reject + toast | pending 변화 없음, `errorToast` 호출 |
| K12 후 K13 같은 블록 드롭 → 런 자동 인식 | `classifySetType(tiles) === "run"` |
| 보드→랙 되돌리기 | 랙 +1, pending 그룹 해당 타일 -1 (다른 그룹 불변) |
| 드롭 중 `TURN_END` WS 수신 → resetPending | pending 전부 null 화, 랙 복원 |
| INVALID_MOVE 수신 → pending 유지 + 토스트 | pending 변화 없음, `errorToast.invalid` |

### 성공 기준

- 100% PASS (Jest 기준)

---

## Phase 3: E2E (Playwright)

대상: 실제 브라우저·DnD·WS·layout shift 재현 필요한 시나리오

### 커맨드 패턴

```bash
cd src/frontend
npx playwright test e2e/day11-ui-bug-fixes.spec.ts e2e/day11-game-ui-scenarios.spec.ts
# 또는 전체
npx playwright test --workers=4
```

### 성공 기준

- PASS rate ≥ 98%, 최소 ≥ 95%
- Flaky 는 2회 재시도 후 판정
- 신규 기능 수정 시 해당 시나리오 PASS 필수

### 실패 분류

- (a) Real failure → 프로덕션 버그 → 수정 커밋 분리
- (b) 테스트 결함 (픽스처 오타, 타임아웃 프리셋 스테일) → `test/fix` 브랜치로 수정
- (c) Flaky → retry=2 + 이슈 등록, 연속 3회 실패 시 (a) 로 재분류

### 뷰포트 매트릭스

다음 2개 해상도 실측 의무:
- 1920×1080 (데스크탑 기본)
- 1366×768 (모바일/저해상도 대응)

---

## Phase 3.5: Pre-deploy Claude Playbook (사용자 역할 대리 수행)

> **원칙**: 사용자가 테스트하기 전에 Claude 가 사용자 역할로 실제 플레이한다. 사용자가 "게임 못 하겠다" 발견하는 프로세스를 끝낸다.

### 3.5.1 언제 발동

- Pod 재배포 직후 (devops 에이전트 완료 알림 수신 시)
- PR 머지 직전 (배포 명령 실행 전)
- 사용자에게 "테스트해보세요" 전달 **직전**

### 3.5.2 실행 절차 (Playwright 기반)

1. **로그인 흐름**:
   - 로컬 혹은 Pod endpoint 에 Playwright 로 접속
   - `src/frontend/e2e/auth.json` storageState 로 로그인 상태 복원
   - `/lobby` 진입 성공 확인

2. **방 생성 + AI 대전 진입**:
   - 방 생성 폼 작성 (2인전, GPT, persona=rookie, difficulty=beginner, 턴 120초)
   - 대기실 진입 → 게임 시작
   - 내 턴 시작 확인

3. **플레이 시퀀스 (최소)**:
   - 타일 드래그 → 빈 보드 드롭 (새 그룹) — **3회 이상**
   - 타일 드래그 → 기존 블록 확장 (같은 색 연속 런, 같은 숫자 그룹) — **각 1회 이상**
   - 조커 포함 런 구성 — **1회 이상**
   - 확정 시도 → 성공 확인 — **2회 이상**
   - 드로우 — **2회 이상**
   - 턴 10회 이상 진행

4. **실측 단언**:
   - 모든 드롭이 **보드에 반영** (랙 복귀 아님)
   - 미확정 블록 라벨이 **실제 타입** (런/그룹/무효) 과 일치
   - 턴 히스토리에 한글 표기 (`드로우` / `강제 드로우` 등)
   - 플레이어 카드의 `난이도` / `페르소나` 정상 표시
   - 내 타일 수가 **rack 실제 수와 일치** (drift 없음)

5. **실패 시**:
   - **배포 게이트 차단**. 사용자에게 "테스트해보세요" 전달 금지
   - 실패 지점 스크린샷 + 로그 수집 → `src/frontend/test-results/pre-deploy-playbook/` 저장
   - incident-response SKILL 호출 또는 즉시 수정 spawn

### 3.5.3 커맨드 패턴

```bash
cd src/frontend
npx playwright test e2e/pre-deploy-playbook.spec.ts --headed=false --workers=1
```

신규 스펙: `src/frontend/e2e/pre-deploy-playbook.spec.ts` — 본 SKILL 에서 최초 호출 시 자동 작성

### 3.5.4 성공 기준

- Playbook 5분 내 완주 (턴 10회 이상)
- 단언 전부 PASS
- 모든 드래그·드롭·확정 동작 반영됨

### 3.5.5 금지 사항

- **Pre-deploy Playbook 미완료 상태에서 "사용자 확인해보세요" 메시지 금지**
- Playbook 실패를 "flaky" 로 치부 금지
- 네트워크·CI 이슈가 의심되면 **2회 재시도 후 판정**

---

## Phase 4: Report

### 4.1 결과 요약 포맷

```
## UI Regression Report — YYYY-MM-DD HH:MM

### 수정 범위
- 파일 N개, 커밋 M개
- 계층: Unit / Integration / E2E 중 X

### 실행 결과
- Phase 1 Unit: X/Y PASS (신규 Z개 추가)
- Phase 2 Integration: X/Y PASS
- Phase 3 E2E: X/Y PASS (Flaky: n)

### 판정
- [ ] GO: 모든 Phase 성공 기준 충족
- [ ] CONDITIONAL GO: Playwright 98% 미만, flaky 원인 분석 후 재판정
- [ ] NO-GO: Unit 실패 또는 E2E real failure 존재

### 다음 조치
- (GO): Pod 재배포 → smoke
- (CONDITIONAL): 재시도 or 테스트 격리
- (NO-GO): 수정 revert 또는 즉시 재수정
```

### 4.2 신규 시나리오 추가 제안

실측 버그 발견 시 **반드시** `docs/04-testing/65-day11-ui-scenario-matrix.md` 에 시나리오 추가:
- Given (사전 조건)
- When (사용자 액션 + 좌표·타이밍)
- Then (기대 결과)
- Why (왜 기존 테스트가 못 잡았는가)

### 4.3 회귀 원인 분류

발견된 실제 회귀는 다음 중 하나로 분류:
1. **로직 오류** — 코드 수정 필요
2. **계층 분산 누락** — 같은 규칙이 여러 곳 구현되어 있는데 한 곳만 수정
3. **Race condition** — WS 이벤트 ↔ 사용자 액션 순서
4. **dnd-kit 특화** — 충돌 검출·DOMRect cache·좌표 매핑
5. **프롬프트 명세 부족** — 수정 지시에 엣지 케이스 누락

분류 결과는 `docs/04-testing/66-ui-regression-plan.md §8 오늘 세션 교훈` 에 누적 기록.

---

## Phase 5: Post — 시나리오 카탈로그 갱신

새 회귀 발견 시:
1. 재현 스크린샷/비디오 저장 → `src/frontend/test-results/ui-regression/YYYY-MM-DD/`
2. 해당 시나리오를 `docs/04-testing/65-day11-ui-scenario-matrix.md` 에 추가
3. 신규 Jest/E2E 테스트를 **수정 커밋과 함께** 동반 커밋
4. MEMORY 에 일시적 주의사항이면 `feedback_*.md` 추가

### 5.1 사용자 실측 → E2E 전환 24h 의무

**원칙**: 사용자가 이미지·설명으로 버그 리포트하면, **24시간 이내에 해당 시나리오를 E2E 로 편입**. 예외 없음.

절차:
1. 사용자 리포트 수신 직후: 이미지·로그를 `src/frontend/test-results/user-reports/YYYY-MM-DD/` 에 아카이브
2. 시나리오를 given/when/then 으로 재구성해 `docs/04-testing/65-*.md` 등록
3. Playwright E2E 작성 (`e2e/user-reported/YYYY-MM-DD-<slug>.spec.ts`)
4. 수정 커밋과 **별도 커밋** 으로 E2E 먼저 추가 (Red 상태) → 수정 커밋 후 Green 확인 (TDD 성격)
5. 동일 버그 재발 시 즉시 감지

**효과**:
- "같은 실수가 반복" 패턴 제거
- 사용자 실측 → 자동화로 영구 이동
- 사용자가 같은 버그를 두 번 찾는 일 없음

### 5.2 사용자가 테스트하지 않아도 되게 (원칙)

본 SKILL 의 최종 목표:
- Phase 3.5 Playbook 으로 **배포 전 Claude 가 사용자 역할 수행**
- Phase 5.1 전환 의무로 **한 번 발견된 버그는 절대 재발 불가능**
- 사용자에게 "테스트해주세요" 전달은 **Claude 가 최선을 다한 후 최종 검증** 차원에서만. 1차 QA 책임은 Claude 에게.

---

## Anti-patterns (금지)

### ❌ "테스트 나중에" 패턴
- UI 수정 후 "일단 커밋하고 테스트는 다음에" 금지
- 수정 커밋 = 테스트 커밋 (1 커밋 또는 2 커밋 동일 branch)

### ❌ 실패 테스트 덮어쓰기
- `expect(X).toBe(1)` → `expect(X).toBe(2)` 로 단순 변경해서 통과시키기 금지
- 변경 이유 명시 없는 단언 수정 금지

### ❌ Playwright `--grep` 만으로 통과 선언
- PR 단계에서는 전체 suite 실행 필수
- local 반복 실행은 `--grep` OK, 최종 통과 주장은 전체 suite

### ❌ 사용자 실측 없이 GO 판정
- 자동화 100% GREEN 이라도 Pod 재배포 후 smoke 수동 확인 필수 (배포 전 게이트)
- 특히 dnd-kit 관련 수정은 수동 드래그 1회 이상 직접 테스트

---

## 오늘 (2026-04-21) 세션 반영 항목

본 SKILL 초안은 Day 11 실측 세션에서 드러난 5가지 구조적 실패에 대응:

1. **F-2 `abcec27` regression** → Phase 0 반사실적 체크리스트로 방지
2. **G-3 불완전 수정 (서버 확정 그룹 경로 누락)** → Phase 0 의 "계층 분산 검증" 규칙
3. **`closestCenter` 빈 공간 매핑** → Phase 3 E2E 드래그 좌표 시나리오 필수
4. **K12+K13 런 자동 인식 실패** → Phase 2 Integration 필수 시나리오에 등록
5. **사용자 실측 의존 패턴 (오늘 수차례)** → Phase 3.5 Claude Playbook + Phase 5.1 24h 전환 의무로 차단. 사용자가 "게임 못 하겠다" 발견 전에 Claude 가 먼저 발견

---

## 변경 이력

- **2026-04-21 v1.0**: 최초 작성. `docs/04-testing/66-ui-regression-plan.md` 와 상호 참조.
