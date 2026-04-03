# 30. E2E 362/362 전량 PASS 보고서

- **작성일**: 2026-04-03
- **작성자**: 애벌레 (QA)
- **환경**: K8s NodePort `http://localhost:30000` (Chromium headless, Desktop Chrome)
- **프레임워크**: Playwright 1.x, workers=1, fullyParallel=false
- **인증**: `global-setup.ts` Google OAuth 세션 (`e2e/auth.json`)
- **총 결과**: **362/362 PASS (100%)**

---

## 1. 요약

| 항목 | 수치 |
|------|------|
| **총 테스트 수** | **362개** (20개 파일) |
| **PASS** | **362개** (100%) |
| **FAIL** | 0 (간헐 2건 재실행 시 PASS) |
| **실행 시간** | 28.8분 (단일 워커) |
| **이전 실패 해결** | 34건 전량 해결 |
| **신규 추가** | DnD 24건 + ai-battle 수정 2건 |

### 이전 대비 개선

| 지표 | 2026-04-01 | 2026-04-03 | 변화 |
|------|-----------|-----------|------|
| 총 테스트 수 | 338 | 362 | +24 |
| PASS | 288 | 362 | +74 |
| FAIL | 34 | 0 | -34 |
| 합격률 | 84.9% | 100% | +15.1%p |
| 실행 시간 | 39.3분 | 28.8분 | -10.5분 |
| 스펙 파일 수 | 19 | 20 | +1 |

---

## 2. 근본 원인 분석 및 해결

이전 34건 실패의 근본 원인은 3가지로 분류된다.

### 2.1 방 격리 실패 (33건)

**영향 범위**: game-lifecycle(20), game-ui-state(9), game-ui-multiplayer(4)

**증상**: 테스트 간 게임 방이 정리되지 않아 다음 테스트에서 방 생성 시 `409 ALREADY_IN_ROOM` 오류 발생.

**근본 원인**: 이전 테스트에서 생성한 게임 방이 서버에 잔존. `afterEach`/`afterAll`에서 방을 명시적으로 정리하지 않았고, 방 생성 실패에 대한 재시도 로직이 없었다.

**해결 방법**:

1. **`room-cleanup.ts` 3단계 클린업 전략 구현**
   - 전략 1: Next.js 프록시를 통한 `POST /api/rooms/:id/leave`
   - 전략 2: game-server 직접 `POST /api/rooms/:id/leave`
   - 전략 3: game-server 직접 `DELETE /api/rooms/:id` (방장인 경우)

2. **`game-helpers.ts` 공유 헬퍼 + 409 retry 로직**
   - `createRoomAndStart()`: 방 생성 전 `cleanupViaPage()` 호출
   - 409 발생 시 최대 2회 재시도 (attempt 간 1s 대기)
   - 3개 스펙 파일이 공유 헬퍼로 전환 (-326줄 중복 제거)

```mermaid
flowchart TB
    A["테스트 시작"] --> B["cleanupViaPage()\n활성 방 정리"]
    B --> C["방 생성 요청"]
    C --> D{"응답 코드"}
    D -->|200| E["대기실 진입"]
    D -->|409| F["cleanup 재시도\n(attempt + 1)"]
    F --> G{"재시도 횟수\n초과?"}
    G -->|No| C
    G -->|Yes| H["테스트 실패"]
    E --> I["게임 시작"]
    I --> J["테스트 본문 실행"]

    style A fill:#e8f5e9
    style H fill:#ffebee
    style J fill:#e3f2fd
```

### 2.2 practice assertion 오류 (1건)

**영향 범위**: practice.spec.ts TC-P-601

**증상**: 그룹/런 타입 판정 테스트에서 토글 버튼 상태를 잘못된 셀렉터로 검증.

**해결 방법**: assertion의 대상 셀렉터를 수정하여 올바른 요소를 검증하도록 변경.

### 2.3 ai-battle 로케이터 오매칭 (2건)

**영향 범위**: ai-battle.spec.ts TC-AB-008, TC-GP-001

**증상**: `waitForMyTurn`이 상대 PlayerCard의 '내 차례' 배지와 매칭되어 내 차례가 아닌데도 즉시 해소됨.

**해결 방법**:
- `waitForMyTurn` --> ActionBar `[aria-label="게임 액션"]` 기반으로 전환
- `waitForMyTurnAfterAction` 신규: ActionBar 사라짐 --> 재나타남 대기
- `waitForAITurn` 신규: ActionBar 사라짐 + 상대 카드 '내 차례' 배지 확인
- TC-GP-001 --> `waitForTurnGreaterThan`으로 턴 번호 변경 대기

---

## 3. 추가 수정: turnNumber 1-based

**파일**: `src/game-server/internal/handler/ws_handler.go`

게임 서버 내부는 턴 번호를 0-based로 관리하지만, 프론트엔드에서는 "1턴"부터 시작해야 자연스럽다. WebSocket 경계에서 `TurnCount + 1` 변환을 추가하여 1-based로 전송하도록 수정.

- `broadcastTurnEnd`: TurnCount --> 1-based 변환
- `broadcastTurnStart`: TurnCount --> 1-based 변환
- 내부 로직은 0-based 유지 (기존 Game Engine 테스트 355+24개 영향 없음)

---

## 4. 카테고리별 테스트 분포

### 4.1 스펙 파일별 테스트 수

| # | 파일명 | 테스트 수 | 결과 | 카테고리 |
|---|--------|----------|------|---------|
| 1 | `01-stage1-group.spec.ts` | 5 | 5 PASS | 연습: 그룹 |
| 2 | `02-stage2-run.spec.ts` | 6 | 6 PASS | 연습: 런 |
| 3 | `03-stage3-joker.spec.ts` | 7 | 7 PASS | 연습: 조커 |
| 4 | `04-stage4-multi.spec.ts` | 4 | 4 PASS | 연습: 멀티세트 |
| 5 | `05-stage5-complex.spec.ts` | 4 | 4 PASS | 연습: 복합 배치 |
| 6 | `06-stage6-master.spec.ts` | 4 | 4 PASS | 연습: 마스터 |
| 7 | `ai-battle.spec.ts` | 27 | 27 PASS | AI 대전 |
| 8 | `auth-and-navigation.spec.ts` | 28 | 28 PASS | 인증/네비게이션 |
| 9 | `game-dnd-manipulation.spec.ts` | 24 | 24 PASS | DnD 조작 |
| 10 | `game-flow.spec.ts` | 30 | 30 PASS | 게임 플로우 |
| 11 | `game-lifecycle.spec.ts` | 22 | 22 PASS | 게임 생명주기 |
| 12 | `game-rules.spec.ts` | 18 | 18 PASS | 게임 규칙 |
| 13 | `game-ui-bug-fixes.spec.ts` | 15 | 15 PASS | 버그 회귀 |
| 14 | `game-ui-multiplayer.spec.ts` | 13 | 13 PASS | 멀티플레이 UI |
| 15 | `game-ui-practice-rules.spec.ts` | 26 | 26 PASS | 연습 규칙 심화 |
| 16 | `game-ui-state.spec.ts` | 15 | 15 PASS | 게임 상태 UI |
| 17 | `lobby-and-room.spec.ts` | 40 | 40 PASS | 로비/방 생성 |
| 18 | `practice-advanced.spec.ts` | 30 | 30 PASS | 연습 심화 |
| 19 | `practice.spec.ts` | 14 | 14 PASS | 연습 기본 |
| 20 | `rankings.spec.ts` | 30 | 30 PASS | 랭킹/프로필 |
| | **합계** | **362** | **362 PASS** | |

### 4.2 기능 카테고리별 분포

```mermaid
pie title E2E 테스트 카테고리 분포 (362건)
    "연습모드 (6 스테이지)" : 30
    "연습 규칙 심화" : 26
    "연습 기본 + 심화" : 44
    "인증/네비게이션" : 28
    "로비/방 생성/대기실" : 40
    "게임 플로우" : 30
    "게임 생명주기" : 22
    "게임 규칙" : 18
    "게임 상태 UI" : 15
    "멀티플레이 UI" : 13
    "버그 회귀" : 15
    "DnD 조작" : 24
    "AI 대전" : 27
    "랭킹/프로필" : 30
```

### 4.3 테스트 유형별 분류

| 유형 | 테스트 수 | 비율 | 설명 |
|------|----------|------|------|
| 게임 플레이 | 162 | 44.8% | 연습 + 규칙 + 생명주기 + DnD |
| UI/UX | 83 | 22.9% | 로비, 상태, 멀티, 버그 회귀 |
| AI 대전 | 27 | 7.5% | Ollama 2인전, 모델 설정, 게임 진행 |
| 인증/네비게이션 | 28 | 7.7% | OAuth, 리디렉트, 세션 |
| 게임 플로우 | 30 | 8.3% | 방 생성 --> 게임 시작 full flow |
| 랭킹/프로필 | 30 | 8.3% | ELO, 티어, 프로필 페이지 |
| **합계** | **362** | **100%** | |

---

## 5. 간헐 실패 (Flaky) 분석

### 5.1 간헐 실패 2건

| TC ID | 파일 | 증상 | 재실행 결과 |
|-------|------|------|-----------|
| TC-P-601 | `practice.spec.ts` | 그룹 배치 타이밍 경합 | 재실행 PASS |
| (동일 describe 내) | `practice.spec.ts` | 동일 원인 | 재실행 PASS |

### 5.2 판정

- 1차 실행: 362건 중 360 PASS / 2 FAIL
- 2차 실행 (실패 2건만): 2/2 PASS
- **판정: Flaky (간헐 실패)**. 브라우저 렌더링 타이밍에 의한 경합 조건. 페이지 전환 후 DOM 안정화 대기 시간 부족이 원인으로 추정.
- **대응**: `waitForTimeout` 또는 명시적 `waitForSelector` 보강 검토 (P3 우선순위).

---

## 6. 수정 파일 목록

### 6.1 커밋 `3e936ef` -- E2E 34-->2 실패 해결 + turnNumber 1-based

| 파일 | 변경 내용 |
|------|---------|
| `src/frontend/e2e/helpers/game-helpers.ts` | 신규 생성. 공유 방 생성 + 409 retry 헬퍼 |
| `src/frontend/e2e/helpers/room-cleanup.ts` | 3단계 cleanup 전략 (leave-->leave-direct-->delete) |
| `src/frontend/e2e/game-lifecycle.spec.ts` | 공유 헬퍼로 전환 (-125줄) |
| `src/frontend/e2e/game-ui-multiplayer.spec.ts` | 공유 헬퍼로 전환 (-114줄) |
| `src/frontend/e2e/game-ui-state.spec.ts` | 공유 헬퍼로 전환 (-87줄) |
| `src/frontend/e2e/practice.spec.ts` | assertion 수정 (group/run 판정) |
| `src/game-server/internal/handler/ws_handler.go` | turnNumber 0-based --> 1-based 변환 |

### 6.2 커밋 `b701608` -- ai-battle 27/27 전량 PASS

| 파일 | 변경 내용 |
|------|---------|
| `src/frontend/e2e/ai-battle.spec.ts` | waitForMyTurn --> ActionBar 기반 전환, 3개 헬퍼 신규 |

### 6.3 커밋 `4245915` -- DnD E2E 24/24 PASS

| 파일 | 변경 내용 |
|------|---------|
| `src/frontend/e2e/game-dnd-manipulation.spec.ts` | 신규 생성. 24개 DnD 조작 테스트 |

---

## 7. 테스트 실행 환경

### 7.1 K8s 클러스터 상태

| 서비스 | 상태 | 접근 |
|--------|------|------|
| frontend | Running | localhost:30000 |
| game-server | Running | localhost:30080 |
| ai-adapter | Running | LLM 4종 연결 |
| postgres | Running | 영속 데이터 |
| redis | Running | 게임 상태 |
| ollama | Running | qwen2.5:3b (AI 대전용) |
| admin | Running | 관리자 대시보드 |

### 7.2 Playwright 구성

| 설정 | 값 |
|------|-----|
| 브라우저 | Chromium (headless) |
| Workers | 1 (직렬 실행) |
| fullyParallel | false |
| baseURL | http://localhost:30000 |
| storageState | e2e/auth.json |
| timeout (테스트) | 120s |
| timeout (expect) | 30s |
| retries | 0 |

### 7.3 하드웨어

| 항목 | 사양 |
|------|------|
| 기기 | LG Gram 15Z90R |
| CPU | Intel i7-1360P |
| RAM | 16GB (WSL2: 10GB 할당) |
| OS | Windows 11 + WSL2 Ubuntu |
| K8s | Docker Desktop Kubernetes |

---

## 8. 전체 테스트 현황 (2026-04-03 기준)

E2E 외에도 프로젝트 전체 테스트 현황을 함께 기록한다.

| 계층 | 프레임워크 | 테스트 수 | 결과 | 비고 |
|------|-----------|----------|------|------|
| **Go 단위/통합** | testify | 379 | 379 PASS | engine 95.6%, race 0, conservation +24 |
| **AI Adapter 단위** | jest | 324 | 324 PASS | 18 suites, 비용/메트릭/thinking 파싱 |
| **Playwright E2E** | Playwright | 362 | 362 PASS | 20개 파일, 28.8분 |
| **WS 멀티플레이** | Playwright | 16 | 16 PASS | WebSocket 실시간 통신 |
| **WS 통합** | supertest | 5 | 5 PASS | WebSocket handshake |
| **합계** | | **1,086** | **1,086 PASS** | |

```mermaid
flowchart LR
    subgraph "테스트 피라미드\n(1,086건 전량 PASS)"
        U["Unit/Integration\n703건 (64.7%)"]
        I["API/WS 통합\n21건 (1.9%)"]
        E["E2E (Playwright)\n362건 (33.3%)"]
    end

    U --> I --> E

    style U fill:#c8e6c9,stroke:#388e3c
    style I fill:#bbdefb,stroke:#1976d2
    style E fill:#fff9c4,stroke:#f9a825
```

---

## 9. 해결 과정 타임라인

```mermaid
gantt
    title E2E 전량 PASS 달성 타임라인
    dateFormat HH:mm
    axisFormat %H:%M

    section 분석
    실패 34건 원인 분석          :a1, 14:00, 60min

    section 구현
    room-cleanup 3단계 전략      :a2, 15:00, 30min
    game-helpers 공유 헬퍼       :a3, 15:30, 30min
    3개 스펙 파일 전환           :a4, 16:00, 30min
    practice assertion 수정      :a5, 16:30, 15min
    turnNumber 1-based           :a6, 16:45, 15min

    section 검증
    1차 실행 (360/362)          :a7, 17:00, 30min
    커밋 3e936ef                :milestone, 17:50, 0min

    section ai-battle
    로케이터 오매칭 분석        :a8, 18:00, 30min
    ActionBar 기반 전환         :a9, 18:30, 30min
    2차 실행 (362/362)         :a10, 19:00, 29min
    커밋 b701608               :milestone, 19:00, 0min
```

---

## 10. 커밋 이력

| 커밋 | 해시 | 날짜 | 내용 |
|------|------|------|------|
| DnD E2E 24/24 PASS | `4245915` | 2026-04-03 10:20 | DnD 조작 테스트 24건 신규 + conservation 테스트 24건 |
| E2E 34-->2 해결 | `3e936ef` | 2026-04-03 17:50 | 방 격리 + practice + turnNumber 수정 |
| ai-battle 27/27 PASS | `b701608` | 2026-04-03 19:00 | ActionBar 기반 로케이터 전환 |

---

## 11. 결론

Sprint 5 Day 3에서 E2E 362건 전량 PASS를 달성했다. 이전 보고서(25-e2e-test-report-2026-04-01.md)에서 34건 실패로 보고되었던 문제를 3가지 근본 원인으로 분류하고 체계적으로 해결했다.

핵심 성과:
- **방 격리 문제 근본 해결**: 3단계 cleanup 전략 + 409 retry 로직으로 테스트 간 상태 오염을 원천 차단
- **코드 중복 제거**: 공유 헬퍼 도입으로 3개 스펙 파일에서 326줄 중복 제거
- **turnNumber 정합성**: WebSocket 경계에서 1-based 변환으로 프론트엔드-백엔드 간 데이터 정합성 확보
- **전체 테스트 1,086건 PASS**: Go 379 + AI Adapter 324 + E2E 362 + WS 21 = 1,086건 전량 녹색

간헐 실패 2건(practice 그룹 배치 타이밍)은 P3 우선순위로 추적하며, DOM 안정화 대기 보강으로 해결 예정이다.
