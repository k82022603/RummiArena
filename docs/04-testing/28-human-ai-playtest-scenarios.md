# Human+AI 혼합 플레이테스트 시나리오 및 수동 검증 체크리스트

- **작성일**: 2026-04-03
- **작성자**: QA Engineer (Claude Code Agent)
- **버전**: v1.0
- **선행 조건**: 게임 버그 24건 수정 완료 (2026-04-02, `27-game-bug-analysis-and-fix-plan.md` 참조)
- **목적**: 버그 수정 효과 검증 + Human+AI 혼합 대전의 안정성 확인
- **환경**: K8s rummikub namespace, `http://localhost:3000` (port-forward 또는 NodePort)

---

## 1. 테스트 개요

### 1.1 배경

2026-04-02에 수정된 24건의 게임 버그(Critical 7 + Major 7 + Minor 10)가 실제 Human+AI 혼합 플레이에서 올바르게 동작하는지 검증한다. 핵심 근본 원인이었던 **INVALID_MOVE 후 서버 랙 미복원 문제**(C-1)가 해결되었는지, 그로 인한 파생 버그(타일 소실, 미완성 세트 확정, 프론트-백 불일치)가 재현되지 않는지 확인하는 것이 1차 목적이다.

### 1.2 테스트 범위

```mermaid
flowchart LR
    A["S1: 1v1 기본 대전\n(Human vs AI)"] --> B["S2: 4인 풀 대전\n(Human vs AI x3)"]
    B --> C["S3: INVALID_MOVE\n유도 + 복원 확인"]
    C --> D["S4: 조커 교환 +\n테이블 재배치"]
    D --> E["S5: 장기전\n(50턴+)"]
    E --> F["S6: 네트워크\n장애 복원"]
    F --> G["S7: 교착 상태\n(Stalemate)"]
```

### 1.3 검증 대상 버그 매핑

| 시나리오 | 검증 대상 버그 ID | 핵심 검증 포인트 |
|----------|-------------------|------------------|
| S1 | 전체 (기본 흐름) | 게임 생명주기 정상 동작 |
| S2 | C-7, m-8, m-10 | 다중 AI 통신 프로토콜 일치 |
| S3 | **C-1, C-2, M-4, M-6** | INVALID_MOVE 후 랙 복원 (근본 원인) |
| S4 | M-1, C-4, C-5, C-6, M-7 | 조커 교환 + 타일 보전 불변식 |
| S5 | M-3, m-5, m-6 | 메모리 누수, 상태 일관성, race condition |
| S6 | C-7 | WebSocket 재연결 후 상태 동기화 |
| S7 | V-11 | 드로우 파일 소진 후 교착 판정 |

### 1.4 사용 AI 모델

| 모델 | 타입 | 타임아웃 | 비용/턴 | 비고 |
|------|------|----------|---------|------|
| OpenAI gpt-5-mini | `AI_OPENAI` | 120s | ~$0.025 | 추론 모델, 28% place rate |
| Claude claude-sonnet-4 | `AI_CLAUDE` | 120s | ~$0.074 | extended thinking, 23% place rate |
| DeepSeek deepseek-reasoner | `AI_DEEPSEEK` | 150s | ~$0.001 | 추론 모델, 5% place rate |
| Ollama qwen2.5:3b | `AI_OLLAMA` | 60s | $0 | 로컬, CPU 전용 |

---

## 2. 테스트 시나리오

---

### S1: Human(1) vs AI(1) 기본 대전

**목적**: 게임 생명주기 전체 흐름(생성 -> 시작 -> 턴 교대 -> 종료) 정상 동작 확인

**난이도**: 입문 / **예상 소요**: 15~20분 / **예상 비용**: ~$0.50

#### 사전 조건
- K8s 환경에서 game-server, ai-adapter, redis, postgres 정상 동작
- `http://localhost:3000` 접속 가능
- AI 모델: OpenAI gpt-5-mini (가장 높은 place rate)

#### 테스트 절차

```mermaid
sequenceDiagram
    participant H as Human (브라우저)
    participant GS as Game Server
    participant AI as AI Adapter
    participant LLM as OpenAI API

    H->>GS: 게스트 로그인
    GS-->>H: JWT 토큰 + 로비 이동
    H->>GS: POST /api/rooms (1v1, AI_OPENAI shark expert)
    GS-->>H: roomId
    H->>GS: POST /api/rooms/:id/start
    GS-->>H: WebSocket GAME_STATE (myRack 14장)
    
    loop 턴 교대 (Human <-> AI)
        alt Human 턴
            H->>GS: PLACE_TILES / CONFIRM_TURN 또는 DRAW_TILE
            GS-->>H: TURN_END
        else AI 턴
            GS->>AI: MoveRequest
            AI->>LLM: LLM API 호출
            LLM-->>AI: MoveResponse
            AI-->>GS: tiles/draw 응답
            GS-->>H: AI_THINKING -> TURN_END
        end
    end
    
    GS-->>H: GAME_OVER (승자 결정)
```

| 단계 | 액션 | 검증 포인트 |
|------|------|-------------|
| 1 | `http://localhost:3000` 접속, 게스트 로그인 | 로비 정상 진입, 닉네임 표시 |
| 2 | 방 생성: 2인, AI_OPENAI, shark, expert, 60초 | 대기실 진입, AI 플레이어 표시 |
| 3 | 게임 시작 클릭 | myRack 14장 수신, drawPileCount=78, 턴 표시 |
| 4 | 첫 턴: 30점 이상 세트 배치 후 확정 | 세트가 테이블에 고정, 랙 타일 감소 |
| 5 | (불가 시) 드로우 클릭 | 랙에 1장 추가, drawPileCount 1 감소 |
| 6 | AI 턴 관찰 | "AI 사고 중" 표시, 타이머 동작, 턴 전환 |
| 7 | 10턴 이상 교대 진행 | 턴 번호 증가, 양쪽 타일 수 변동 정상 |
| 8 | 게임 종료 (승리/패배) | 결과 화면, 점수 표시, ELO 변동 |

#### 합격 기준
- [ ] 14장 초기 분배 정상
- [ ] 유효한 세트 배치 시 서버 승인
- [ ] AI가 12턴 연속 드로우만 하지 않음 (BUG-AI-001 재현 불가)
- [ ] 턴 교대 시 타이머가 정확히 리셋됨
- [ ] 게임 종료 화면에 승자, 점수, ELO 변동 표시

---

### S2: Human(1) vs AI(3) 풀 대전 (4인)

**목적**: 4인 게임에서 3종 AI 모델이 동시에 정상 동작하는지 확인

**난이도**: 중급 / **예상 소요**: 30~40분 / **예상 비용**: ~$2.00

#### 사전 조건
- ai-adapter ConfigMap: OPENAI_API_KEY, CLAUDE_API_KEY, DEEPSEEK_API_KEY 설정 완료
- 비용 한도: DAILY_COST_LIMIT_USD >= $5

#### 테스트 절차

| 단계 | 액션 | 검증 포인트 |
|------|------|-------------|
| 1 | 방 생성: 4인, AI 3종 추가 | AI 슬롯 3개 정상 표시 |
| | - Seat 1: AI_OPENAI / shark / expert | |
| | - Seat 2: AI_CLAUDE / fox / expert | |
| | - Seat 3: AI_DEEPSEEK / calculator / intermediate | |
| 2 | 게임 시작 | myRack 14장, drawPileCount=50 (106-14*4) |
| 3 | Human 첫 턴 진행 | 정상 배치 또는 드로우 |
| 4 | AI 3명 연속 턴 관찰 | 각 AI마다 "사고 중" 표시, 순서대로 진행 |
| 5 | OpenAI 턴 관찰 | DisplayName이 "GPT 0"이 아닌 설정 이름 표시 (BUG-AI-002) |
| 6 | Claude 턴 관찰 | extended thinking 응답 정상 처리 |
| 7 | DeepSeek 턴 관찰 | 150s 타임아웃 내 응답 |
| 8 | 20턴 이상 진행 | 3 AI 모두 최소 1회 이상 배치(place) 시도 |
| 9 | 게임 종료 | 4인 전체 점수, 순위 표시 |

#### 합격 기준
- [ ] 4인 게임 시작 시 drawPileCount = 50
- [ ] 턴 순서: seat 0 -> 1 -> 2 -> 3 -> 0 순환 정상
- [ ] 각 AI의 DisplayName이 설정 이름으로 표시 (캐릭터명 포함)
- [ ] AI 응답 실패 시 최대 3회 재시도 후 강제 드로우 (fallback 동작)
- [ ] 한 AI가 타임아웃되어도 다른 AI 턴에 영향 없음
- [ ] 게임 종료 시 4인 전체 결과 표시
- [ ] `graceSec` / `graceDeadlineMs` 프로토콜 일치 (C-7 수정 확인)

---

### S3: INVALID_MOVE 유도 + 랙 복원 확인

**목적**: 의도적으로 무효한 배치를 시도하여 INVALID_MOVE 후 랙 복원이 정상 동작하는지 확인. **이 시나리오가 가장 중요하다** -- 24건 버그의 근본 원인이 C-1(INVALID_MOVE 후 RESET_TURN 미전송)이었기 때문이다.

**난이도**: 고급 / **예상 소요**: 20~30분 / **예상 비용**: ~$0.50

#### 검증 대상 버그

```mermaid
flowchart TB
    subgraph before["수정 전 (문제)"]
        A1["PLACE_TILES 전송"] --> B1["서버: 랙에서 타일 제거"]
        B1 --> C1["CONFIRM_TURN 전송"]
        C1 --> D1["서버: 검증 실패 -> INVALID_MOVE"]
        D1 --> E1["프론트: resetPending() 로컬만 롤백"]
        E1 --> F1["서버 랙: 타일 빠진 상태 고착\n프론트 랙: 원래 상태"]
        F1 --> G1["영구 불일치 -> 타일 소실"]
    end
    
    subgraph after["수정 후 (기대)"]
        A2["PLACE_TILES 전송"] --> B2["서버: 랙에서 타일 제거"]
        B2 --> C2["CONFIRM_TURN 전송"]
        C2 --> D2["서버: 검증 실패 -> INVALID_MOVE"]
        D2 --> E2["프론트: RESET_TURN 전송\n+ resetPending()"]
        E2 --> F2["서버: 스냅샷 복원\n프론트: 로컬 롤백"]
        F2 --> G2["동기화 유지 -> 정상 계속"]
    end
```

#### 테스트 절차

| 단계 | 액션 | 검증 포인트 |
|------|------|-------------|
| 1 | 1v1 게임 시작 (AI_OPENAI) | myRack 14장 확인, 타일 목록 기록 |
| 2 | **의도적 무효 배치 #1**: 2장만으로 세트 구성 (V-02 위반) | INVALID_MOVE 수신, 에러 메시지 한글 표시 |
| 3 | 랙 타일 수 확인 | 여전히 14장 (타일 소실 없음) |
| 4 | 랙 타일 목록 확인 | 원래 14장과 동일 (코드 수준 일치) |
| 5 | **의도적 무효 배치 #2**: 같은 색상 중복 그룹 (V-14 위반) | INVALID_MOVE 수신 |
| 6 | 랙 복원 재확인 | 타일 소실 없음 |
| 7 | **의도적 무효 배치 #3**: 비연속 숫자 런 (V-15 위반) | INVALID_MOVE 수신 |
| 8 | 3회 연속 무효 후 랙 상태 | 여전히 원래 14장 유지 (누적 불일치 없음) |
| 9 | 정상 드로우 진행 | 15장으로 증가, 정상 턴 전환 |
| 10 | AI 턴 완료 후 다시 Human 턴 | 15장 유지, 턴 교대 정상 |
| 11 | **정상 배치 시도** (유효한 세트) | 서버 승인, 랙 감소, 테이블에 세트 표시 |
| 12 | 이후 5턴 추가 진행 | 타일 수 정합성 유지 |

#### 합격 기준
- [ ] INVALID_MOVE 후 랙 타일이 1장도 소실되지 않음
- [ ] INVALID_MOVE 후 에러 메시지가 한글로 표시됨 (M-5 에러 코드 매핑)
- [ ] 3회 연속 INVALID_MOVE 후에도 게임 진행 가능 (턴 교착 없음, M-6)
- [ ] INVALID_MOVE 후 정상 배치 시 서버가 정상 승인
- [ ] INVALID_MOVE 후 드로우 시 정상 동작
- [ ] 브라우저 콘솔에 RESET_TURN 전송 로그 확인 가능
- [ ] 서버 로그에 RESET_TURN 수신 + 스냅샷 복원 로그 확인 가능

#### 에지 케이스 추가 검증

| # | 에지 케이스 | 검증 방법 | 기대 결과 |
|---|------------|-----------|-----------|
| E1 | INVALID_MOVE 직후 즉시 드로우 | 무효 배치 -> 드로우 클릭 | 정상 드로우 + 턴 전환 |
| E2 | INVALID_MOVE 직후 타임아웃 | 무효 배치 후 타이머 만료까지 대기 | 자동 드로우 + 턴 전환 |
| E3 | pendingMyTiles null 상태에서 확정 | 타일 배치 없이 확정 버튼 | 확정 차단 또는 에러 (M-4) |
| E4 | 동일 타일 코드 중복 배치 | R7a를 2번 배치 시도 | filter가 아닌 indexOf+splice로 정확히 1장만 제거 (m-1) |

---

### S4: 조커 교환 + 테이블 재배치

**목적**: 가장 복잡한 턴 액션인 조커 교환과 테이블 재배치를 조합하여 타일 보전 불변식(Universe Conservation)이 유지되는지 확인

**난이도**: 고급 / **예상 소요**: 25~35분 / **예상 비용**: ~$0.50

#### 사전 조건
- 최초 등록(Initial Meld) 완료 상태에서 시작 필요
- 테이블에 조커가 포함된 세트가 존재해야 함

#### 테스트 절차

| 단계 | 액션 | 검증 포인트 |
|------|------|-------------|
| **Phase A: 최초 등록** | | |
| 1 | 1v1 게임 시작 | hasInitialMeld=false 상태 확인 |
| 2 | 30점 이상 세트 배치 + 확정 | hasInitialMeld=true로 전환 |
| 3 | AI 턴 대기 | AI도 배치 또는 드로우 |
| **Phase B: 테이블 재배치** | | |
| 4 | 테이블 기존 세트에서 타일 분리 | 드래그앤드롭으로 세트 간 이동 |
| 5 | 분리된 세트에 랙 타일 추가하여 유효 세트 완성 | 랙에서 최소 1장 추가 (V-03) |
| 6 | 확정 | 서버 승인, 모든 세트 유효 확인 |
| **Phase C: 조커 활용** | | |
| 7 | 조커를 포함한 세트 배치 (예: R5, JK1, R7) | 서버 승인, 조커 위치 정상 |
| 8 | AI 턴 중 조커 포함 세트 관찰 | 조커 시각적 표시 정상 |
| **Phase D: 조커 교환 (가능 시)** | | |
| 9 | 테이블 위 조커를 해당 타일로 교체 시도 | JK1을 실제 타일로 교체 |
| 10 | 교체한 조커를 같은 턴 내 다른 세트에 사용 | V-07: 보류 불가, 즉시 사용 |
| 11 | 확정 | 원래 세트 여전히 유효 + 새 세트 유효 |
| **Phase E: 타일 보전 검증** | | |
| 12 | 각 단계 후 테이블 타일 총 수 기록 | 감소 없음 (V-06) |
| 13 | 각 단계 후 랙 타일 수 기록 | 배치한 만큼만 감소 |
| 14 | table 타일 + rack 타일 + drawPile = 106 | Universe Conservation |

#### 합격 기준
- [ ] 최초 등록 전 테이블 재배치 불가 (V-13)
- [ ] 최초 등록 후 테이블 재배치 가능
- [ ] 재배치 시 랙에서 최소 1장 추가 (V-03)
- [ ] 재배치 후 모든 세트 유효 (V-01, V-02)
- [ ] 테이블 타일 총 수 비감소 (V-06)
- [ ] 조커 교환 후 조커를 즉시 사용 (V-07, M-1 수정 확인)
- [ ] Universe Conservation: table + rack + drawPile = 106 (C-4, C-5, C-6 수정 확인)
- [ ] PlaceTiles 시 tilesFromRack이 tableGroups에 실제 포함됨 (M-7 수정 확인)

---

### S5: 장기전 (50턴+) 안정성

**목적**: 장시간 게임에서 메모리 누수, 상태 불일치, race condition이 발생하지 않는지 확인

**난이도**: 중급 (인내심 필요) / **예상 소요**: 40~60분 / **예상 비용**: ~$1.50

#### 테스트 절차

| 단계 | 액션 | 검증 포인트 |
|------|------|-------------|
| 1 | 1v1 게임 시작 (AI_OPENAI, calculator, intermediate) | 정상 시작 |
| 2 | 의도적으로 드로우 위주 플레이 (장기전 유도) | drawPile 소진 유도 |
| 3 | 매 10턴마다 기록 | 아래 체크포인트 표 참조 |
| 4 | 50턴 도달 | 여전히 정상 동작 |
| 5 | 브라우저 메모리 사용량 확인 | Chrome DevTools > Memory |
| 6 | 서버 로그 확인 | 에러/워닝 없음 |
| 7 | Redis 메모리 확인 | `redis-cli info memory` |

#### 10턴 간격 체크포인트

| 체크 항목 | 턴 10 | 턴 20 | 턴 30 | 턴 40 | 턴 50 |
|-----------|--------|--------|--------|--------|--------|
| Human 랙 타일 수 | ___ | ___ | ___ | ___ | ___ |
| AI 랙 타일 수 | ___ | ___ | ___ | ___ | ___ |
| drawPileCount | ___ | ___ | ___ | ___ | ___ |
| 테이블 세트 수 | ___ | ___ | ___ | ___ | ___ |
| 브라우저 메모리 (MB) | ___ | ___ | ___ | ___ | ___ |
| WS 재연결 횟수 | ___ | ___ | ___ | ___ | ___ |
| 에러 메시지 발생 | ___ | ___ | ___ | ___ | ___ |

#### 불변식 검증 (매 체크포인트)
```
human_rack + ai_rack + drawPile + table_tiles = 106
```

#### 합격 기준
- [ ] 50턴 이상 게임 지속 가능
- [ ] 브라우저 메모리 증가율 < 1MB/10턴 (메모리 누수 없음)
- [ ] WS 재연결 0회 (안정적 연결 유지)
- [ ] 매 10턴 불변식(106장) 유지
- [ ] 타이머 매초 interval 정상 (m-5 수정 확인)
- [ ] TILE_DRAWN 이중 setState 제거 (m-6 수정 확인)
- [ ] TURN_END에서 turnNumber가 0이 아닌 실제 값 (m-10 수정 확인)
- [ ] 서버 로그에 race condition 관련 에러 없음 (M-3)
- [ ] Redis 메모리 사용량 안정적 (지속 증가 없음)

---

### S6: 네트워크 장애 복원 (WebSocket 재연결)

**목적**: 브라우저 새로고침, 네트워크 일시 중단 후 게임 상태가 완전히 복원되는지 확인

**난이도**: 중급 / **예상 소요**: 15~20분 / **예상 비용**: ~$0.30

#### 테스트 절차

| 단계 | 액션 | 검증 포인트 |
|------|------|-------------|
| **Phase A: 새로고침 복원** | | |
| 1 | 1v1 게임 진행 중 (10턴 이상) | 현재 상태 기록 (랙, 테이블, 턴) |
| 2 | F5 (브라우저 새로고침) | "재연결 시도 중" 배너 표시 |
| 3 | 재연결 완료 대기 | GAME_STATE 재수신 |
| 4 | 랙 타일 확인 | 새로고침 전과 동일 |
| 5 | 테이블 상태 확인 | 새로고침 전과 동일 |
| 6 | 게임 계속 진행 | 정상 턴 교대 |
| **Phase B: AI 턴 중 새로고침** | | |
| 7 | AI 턴 중 F5 | 재연결 후 AI 턴 결과 수신 |
| 8 | 다음 Human 턴 정상 진행 | 턴 전환 정상 |
| **Phase C: Human 턴 중 배치 후 새로고침** | | |
| 9 | 타일 배치 (확정 전) 후 F5 | 배치 전 상태로 복원 (스냅샷) |
| 10 | 다시 배치 + 확정 | 정상 승인 |
| **Phase D: 30초 초과 끊김 시뮬레이션** | | |
| 11 | Chrome DevTools > Network > Offline | WS 끊김 |
| 12 | 30초 이상 대기 | 서버: 자동 드로우 처리 |
| 13 | Network > Online 복원 | 재연결 + 상태 동기화 |
| 14 | 게임 상태 확인 | 드로우된 타일이 랙에 포함됨 |

#### 합격 기준
- [ ] F5 후 GAME_STATE 재수신 (랙, 테이블, 턴, 점수 일치)
- [ ] "재연결 시도 중" 배너 표시 후 자동 복원
- [ ] AI 턴 중 재연결 시 AI 턴 결과 반영
- [ ] 배치 중 재연결 시 스냅샷으로 롤백 (타일 소실 없음)
- [ ] 30초 초과 끊김 후 자동 드로우 반영
- [ ] `graceSec` / `graceDeadlineMs` 필드 정상 전달 (C-7)
- [ ] 재연결 후 상대 tileCount, hasInitialMeld 정상 표시

---

### S7: 교착 상태 (Stalemate) 유도

**목적**: 드로우 파일 소진 후 전원 패스 시 교착 상태가 정확히 판정되고, 점수 비교로 승자가 결정되는지 확인

**난이도**: 고급 (드로우 파일 소진까지 플레이 필요) / **예상 소요**: 45~60분 / **예상 비용**: ~$1.00

#### 테스트 절차

| 단계 | 액션 | 검증 포인트 |
|------|------|-------------|
| 1 | 2인 게임 시작 | drawPileCount = 78 |
| 2 | 매 턴 드로우 위주 플레이 (소진 유도) | drawPileCount 매 턴 감소 |
| 3 | drawPileCount = 0 도달 | "드로우 파일 소진" 표시 |
| 4 | 드로우 버튼 비활성화 확인 | 드로우 불가 |
| 5 | 양측 모두 배치 불가 시 | 패스만 가능 |
| 6 | 전원 1라운드 패스 | 교착 상태 판정 |
| 7 | 게임 종료 | STALEMATE 또는 FINISHED |
| 8 | 점수 확인 | 남은 타일 합산 비교 |
| 9 | 승자 확인 | 점수 낮은 쪽 승리 |
| 10 | ELO 변동 확인 | 교착 시에도 ELO 반영 |

#### 합격 기준
- [ ] drawPileCount = 0 시 드로우 버튼 비활성화
- [ ] 전원 패스 후 교착 상태 정확히 판정 (V-11)
- [ ] 남은 타일 점수 정확히 합산 (조커 = 30점)
- [ ] 점수 낮은 플레이어가 승리
- [ ] 동점 시 타일 수 비교 (적은 쪽 승리)
- [ ] 게임 종료 화면에 교착 상태 표시

---

## 3. 공통 수동 검증 체크리스트

모든 시나리오 공통으로 아래 항목을 확인한다.

### 3.1 게임 생명주기

| # | 체크 항목 | S1 | S2 | S3 | S4 | S5 | S6 | S7 |
|---|-----------|----|----|----|----|----|----|-----|
| L1 | 게스트 로그인 정상 | | | | | | | |
| L2 | 방 생성 + AI 추가 정상 | | | | | | | |
| L3 | 대기실에서 게임 시작 | | | | | | | |
| L4 | GAME_STATE 수신 (myRack, drawPile) | | | | | | | |
| L5 | 게임 종료 + 결과 화면 | | | | | | | |
| L6 | 로비 복귀 정상 | | | | | | | |

### 3.2 턴 전환 및 타이머

| # | 체크 항목 | S1 | S2 | S3 | S4 | S5 | S6 | S7 |
|---|-----------|----|----|----|----|----|----|-----|
| T1 | 턴 시작 시 타이머 표시 (60초) | | | | | | | |
| T2 | 타이머 매초 정확히 감소 | | | | | | | |
| T3 | 타임아웃 시 자동 드로우 | | | | | | | |
| T4 | 턴 전환 시 "상대 턴" 표시 | | | | | | | |
| T5 | 턴 번호 증가 정상 | | | | | | | |

### 3.3 AI 관련

| # | 체크 항목 | S1 | S2 | S3 | S4 | S5 | S6 | S7 |
|---|-----------|----|----|----|----|----|----|-----|
| A1 | "AI 사고 중..." 표시 | | | | | | | |
| A2 | AI DisplayName 정상 (캐릭터명 포함) | | | | | | | |
| A3 | AI 무효 수 -> 재시도 (로그 확인) | | | | | | | |
| A4 | AI 3회 실패 -> 강제 드로우 | | | | | | | |
| A5 | AI 응답 타임아웃 처리 | | | | | | | |

### 3.4 INVALID_MOVE 복원 (핵심)

| # | 체크 항목 | S1 | S2 | S3 | S4 | S5 | S6 | S7 |
|---|-----------|----|----|----|----|----|----|-----|
| I1 | INVALID_MOVE 시 랙 타일 복원 | | | | | | | |
| I2 | RESET_TURN 서버 전송 확인 | | | | | | | |
| I3 | 에러 메시지 한글 표시 | | | | | | | |
| I4 | 복원 후 다음 액션 정상 | | | | | | | |
| I5 | 타일 소실 없음 (BUG-1 미재현) | | | | | | | |
| I6 | 없던 타일 추가 없음 (BUG-3 미재현) | | | | | | | |

### 3.5 드래그앤드롭 UI

| # | 체크 항목 | S1 | S2 | S3 | S4 | S5 | S6 | S7 |
|---|-----------|----|----|----|----|----|----|-----|
| D1 | 랙 -> 테이블 드래그 정상 | | | | | | | |
| D2 | 테이블 -> 테이블 이동 정상 | | | | | | | |
| D3 | 테이블 -> 랙 되돌리기 정상 | | | | | | | |
| D4 | 타일 a/b 세트 시각적 구분 | | | | | | | |
| D5 | 동일색상 그룹 경고 표시 | | | | | | | |

### 3.6 WebSocket 통신

| # | 체크 항목 | S1 | S2 | S3 | S4 | S5 | S6 | S7 |
|---|-----------|----|----|----|----|----|----|-----|
| W1 | WS 연결 유지 (끊김 없음) | | | | | | | |
| W2 | F5 후 재연결 + 상태 복원 | | | | | | | |
| W3 | TURN_END에 myRack 포함 (C-2 수정) | | | | | | | |
| W4 | TURN_END turnNumber > 0 (m-10 수정) | | | | | | | |
| W5 | 상대 tileCount/hasInitialMeld 갱신 | | | | | | | |

### 3.7 점수 및 결과

| # | 체크 항목 | S1 | S2 | S3 | S4 | S5 | S6 | S7 |
|---|-----------|----|----|----|----|----|----|-----|
| R1 | 30점 최초 등록 점수 표시 | | | | | | | |
| R2 | 게임 종료 시 점수 정확 | | | | | | | |
| R3 | ELO 변동 표시 | | | | | | | |
| R4 | 승자/패자 정확 | | | | | | | |

---

## 4. 실행 환경 체크리스트

테스트 시작 전 환경이 준비되었는지 확인한다.

### 4.1 K8s 서비스 상태 확인

```bash
# 전체 Pod 상태
kubectl get pods -n rummikub

# 기대 결과: 모두 Running (1/1)
# - game-server-xxxxx     1/1   Running
# - ai-adapter-xxxxx      1/1   Running
# - frontend-xxxxx        1/1   Running
# - postgres-xxxxx        1/1   Running
# - redis-xxxxx           1/1   Running
# - ollama-xxxxx          1/1   Running (선택)
```

### 4.2 Port-forward 설정

```bash
# Frontend
kubectl port-forward svc/frontend 3000:3000 -n rummikub &

# Game Server (WebSocket)
kubectl port-forward svc/game-server 8080:8080 -n rummikub &

# 또는 NodePort 사용 (설정에 따라)
```

### 4.3 API 키 확인

```bash
# AI Adapter ConfigMap/Secret 확인
kubectl get configmap ai-adapter-config -n rummikub -o yaml | grep -E "OPENAI|CLAUDE|DEEPSEEK"
kubectl get secret ai-adapter-secret -n rummikub -o yaml | grep -E "API_KEY"
```

### 4.4 비용 한도 확인

```bash
# DAILY_COST_LIMIT_USD 확인 (>= $5 권장)
kubectl get configmap ai-adapter-config -n rummikub -o yaml | grep DAILY_COST
```

---

## 5. 결함 보고 양식

테스트 중 발견된 결함은 아래 양식으로 기록한다.

### 결함 보고 템플릿

```markdown
### BUG-PT-{번호}: {제목}

| 항목 | 내용 |
|------|------|
| 시나리오 | S{번호} |
| 심각도 | CRITICAL / HIGH / MEDIUM / LOW |
| 재현 단계 | 1. ... 2. ... 3. ... |
| 기대 결과 | |
| 실제 결과 | |
| 스크린샷 | |
| 브라우저 콘솔 로그 | |
| 서버 로그 | `kubectl logs <pod> -n rummikub --tail=50` |
| 관련 버그 ID | C-{n} / M-{n} / m-{n} (해당 시) |
```

---

## 6. 테스트 결과 요약 (수행 후 기입)

### 6.1 시나리오별 결과

| 시나리오 | 상태 | 소요 시간 | 발견 결함 | 비고 |
|----------|------|-----------|-----------|------|
| S1: 1v1 기본 대전 | | | | |
| S2: 4인 풀 대전 | | | | |
| S3: INVALID_MOVE 유도 | | | | |
| S4: 조커 교환 + 재배치 | | | | |
| S5: 장기전 50턴+ | | | | |
| S6: 네트워크 장애 복원 | | | | |
| S7: 교착 상태 | | | | |

### 6.2 버그 수정 효과 검증 결과

| 수정 대상 | 검증 시나리오 | 재현 여부 | 판정 |
|-----------|-------------|-----------|------|
| C-1: INVALID_MOVE 후 RESET_TURN 미전송 | S3 | | |
| C-2: TURN_END에서 myRack 미동기화 | S3, S5 | | |
| C-3: 클라이언트 세트 유효성 미검증 | S3 | | |
| C-4: Universe Conservation 미검증 | S4 | | |
| C-5: V-06 타일 코드 비교 | S4 | | |
| C-6: PlaceTiles 타일 보전 미검증 | S4 | | |
| C-7: graceSec vs graceDeadlineMs 불일치 | S6 | | |
| M-1: JokerReturnedCodes 미정의 | S4 | | |
| M-4: pendingMyTiles null 방어 | S3 (E3) | | |
| M-5: 에러 코드 매핑 누락 | S3 | | |
| M-6: INVALID_MOVE 후 턴 교착 | S3 | | |

### 6.3 총평

> (테스트 수행 후 작성)

---

## 7. 부록: 서버 로그 확인 명령어

테스트 중 문제 발생 시 서버 로그를 확인하는 명령어 모음.

```bash
# Game Server 로그 (최근 100줄, 실시간)
kubectl logs -f deployment/game-server -n rummikub --tail=100

# AI Adapter 로그
kubectl logs -f deployment/ai-adapter -n rummikub --tail=100

# Redis 상태 확인
kubectl exec -it deployment/redis -n rummikub -- redis-cli info memory
kubectl exec -it deployment/redis -n rummikub -- redis-cli keys "game:*"

# 특정 게임 상태 확인
kubectl exec -it deployment/redis -n rummikub -- redis-cli get "game:{gameId}:state"

# 브라우저 콘솔에서 WS 메시지 확인
# DevTools > Console > 필터: "WS" 또는 "RESET_TURN" 또는 "INVALID_MOVE"
```

---

## 8. 부록: 이전 플레이테스트 이력

| 일시 | 문서 | 발견 버그 | 비고 |
|------|------|-----------|------|
| 2026-03-30 16:22 | `23-user-playtest-bug-report-2026-03-30.md` | 10건 | 최초 수동 테스트 |
| 2026-04-02 오전 | `27-game-bug-analysis-and-fix-plan.md` | 24건 (5건+분석) | 근본 원인 발견 |
| **2026-04-03** | **본 문서** | **(수행 후 기입)** | **수정 효과 검증** |
