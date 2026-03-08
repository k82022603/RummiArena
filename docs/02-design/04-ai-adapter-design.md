# AI Adapter 설계 (AI Adapter Design)

## 1. 설계 원칙

1. **Game Engine과 완전 분리**: AI는 행동을 제안만 하고, 검증은 Engine이 담당
2. **모델 무관 인터페이스**: 어떤 LLM이든 동일한 인터페이스로 호출
3. **실패 허용 설계**: 타임아웃, 파싱 실패, 불법 수에 대한 fallback 로직
4. **관측 가능**: 모든 호출에 대해 지연시간, 토큰, 유효성 결과 기록

## 2. Adapter 구조

```
AI Adapter Service
├── AdapterInterface (공통 인터페이스)
│   ├── OpenAIAdapter
│   ├── ClaudeAdapter
│   ├── DeepSeekAdapter
│   └── OllamaAdapter
├── PromptBuilder (게임 상태 → 프롬프트 변환)
├── ResponseParser (LLM 응답 → 행동 JSON 파싱)
├── RetryHandler (재시도 로직)
└── MetricsCollector (호출 로그/메트릭)
```

## 3. 공통 인터페이스

```typescript
interface AIAdapter {
  generateMove(request: MoveRequest): Promise<MoveResponse>;
  getModelInfo(): ModelInfo;
  healthCheck(): Promise<boolean>;
}

interface MoveRequest {
  gameId: string;
  gameState: GameState;
  strategy: 'aggressive' | 'balanced' | 'defensive';
  maxRetries: number;
  timeoutMs: number;
}

interface MoveResponse {
  action: 'place' | 'draw';
  tableGroups?: TileGroup[];    // 배치할 때
  tilesFromRack?: string[];     // 랙에서 사용한 타일
  reasoning?: string;           // AI 사고 과정
  metadata: {
    modelType: string;
    modelName: string;
    latencyMs: number;
    promptTokens: number;
    completionTokens: number;
    retryCount: number;
  };
}
```

## 4. 프롬프트 설계

### 4.1 시스템 프롬프트
```
당신은 루미큐브 게임 AI 플레이어입니다.
주어진 게임 상태를 분석하고, 최적의 수를 JSON 형식으로 응답하세요.

규칙:
- 그룹: 같은 숫자, 서로 다른 색상 3~4개
- 런: 같은 색상, 연속 숫자 3개 이상
- 조커(JK)는 어떤 타일이든 대체 가능
- 테이블의 기존 타일을 재배치할 수 있음
- 모든 그룹/런은 3개 이상의 타일로 구성되어야 함

응답 형식:
{
  "action": "place" | "draw",
  "tableGroups": [...],
  "tilesFromRack": [...],
  "reasoning": "..."
}
```

### 4.2 게임 상태 전달 형식
```
현재 테이블:
  그룹1: [R7, B7, K7]
  런1: [Y3, Y4, Y5, Y6]

내 타일: [R1, R5, B3, B8, Y7, K2, K9, JK1]

상대 정보:
  Player 1: 타일 8개
  Player 2: 타일 3개 (주의: 거의 승리)

드로우 파일: 28장 남음
턴: 15

전략: aggressive (가능한 많은 타일을 내려놓으세요)
```

### 4.3 전략별 프롬프트 변형

| 전략 | 프롬프트 추가 지시 |
|------|-------------------|
| aggressive | 가능한 한 많은 타일을 내려놓으세요. 테이블 재배치를 적극 활용하세요. |
| balanced | 효율적으로 타일을 내려놓되, 조커는 아껴두세요. |
| defensive | 최소한의 타일만 내려놓으세요. 상대에게 유리한 재배치는 피하세요. |

## 5. 모델별 Adapter 구현 노트

### 5.1 OpenAI Adapter
- 모델: gpt-4o (기본)
- Structured Output (JSON mode) 활용
- Function calling으로 응답 구조 강제 가능

### 5.2 Claude Adapter
- 모델: claude-sonnet-4-20250514 (기본)
- Tool use로 응답 구조 강제
- 긴 컨텍스트 활용 가능 (게임 히스토리 전달)

### 5.3 DeepSeek Adapter
- 모델: deepseek-chat
- OpenAI 호환 API
- 비용 효율적

### 5.4 Ollama Adapter
- 모델: llama3.2 (기본, 변경 가능)
- 로컬 실행, 비용 없음
- 응답 속도/품질 변동 가능성

## 6. 재시도 및 Fallback 로직

```
요청 시도 (최대 3회)
  ├─ 성공 → 응답 파싱
  │    ├─ 파싱 성공 → Game Engine 유효성 검증
  │    │    ├─ 유효 → 적용
  │    │    └─ 무효 → 재시도 (에러 메시지 포함)
  │    └─ 파싱 실패 → 재시도
  ├─ 타임아웃 → 재시도
  └─ 3회 실패 → 강제 드로우 (draw)
```

## 7. 메트릭 수집 항목

| 메트릭 | 설명 |
|--------|------|
| ai_request_total | 모델별 총 요청 수 |
| ai_request_latency_ms | 모델별 응답 지연시간 |
| ai_request_errors | 모델별 에러 수 |
| ai_invalid_moves | 모델별 불법 수 제안 횟수 |
| ai_tokens_used | 모델별 토큰 사용량 |
| ai_retry_count | 모델별 재시도 횟수 |
| ai_fallback_draws | 강제 드로우 횟수 |

## 8. LangChain/LangGraph 도입 검토

### 8.1 도입 시 구조 변경
```
AI Adapter Service
├── LangChain/LangGraph Agent
│   ├── PromptTemplate (프롬프트 관리)
│   ├── OutputParser (구조화 출력)
│   ├── Tool: AnalyzeTable (테이블 분석)
│   ├── Tool: FindPossibleMoves (가능한 수 탐색)
│   └── Tool: EvaluateMove (수 평가)
```

### 8.2 LangGraph 장점 (이 프로젝트 기준)
- 타일 재배치 탐색을 다단계 그래프로 모델링 가능
- 상태 기반 워크플로우로 "분석 → 후보 생성 → 평가 → 선택" 파이프라인 구성
- 재시도/분기 로직을 그래프로 시각화

### 8.3 결정 기준
| 기준 | 직접 구현 | LangChain/LangGraph |
|------|-----------|---------------------|
| 단순 프롬프트 → JSON | 충분 | 과도 |
| 다단계 추론 필요 | 구현 복잡 | 적합 |
| 의존성 관리 | 가벼움 | 무거움 |
| 디버깅 | 직관적 | 추상화 레이어 |

**Sprint 4 시작 전 PoC로 결정.**

## 9. 심리전 시뮬레이션 (Psychological Play)

### 9.1 개요
실제 루미큐브에서 인간 플레이어는 심리전을 활용한다.
AI도 이를 시뮬레이션하여 보다 인간적이고 전략적인 플레이를 수행한다.

### 9.2 심리전 전략 유형

| 전략 | 설명 | 구현 방식 |
|------|------|-----------|
| **블러핑 (Bluffing)** | 낼 수 있는 타일을 일부러 보류하여 약한 척 | 프롬프트에 "전략적 보류" 지시 |
| **상대 관찰 (Opponent Reading)** | 상대 드로우/패스 패턴으로 보유 타일 추론 | 상대 행동 히스토리를 프롬프트에 포함 |
| **압박 (Pressure Play)** | 상대가 필요로 할 숫자를 선점하여 견제 | 상대 남은 타일 수 + 테이블 분석 |
| **페이크 드로우 (Fake Weakness)** | 드로우를 선택해 약한 척 하다가 한 턴에 대량 배치 | 다단계 전략 (LangGraph 적합) |
| **템포 제어 (Tempo Control)** | 의도적으로 턴 시간을 조절하여 자신감/불안 연출 | AI 응답에 의도적 딜레이 추가 (선택) |
| **카운팅 (Tile Counting)** | 나온 타일 기반으로 남은 타일 확률 계산 | 테이블 + 자신 타일로 미출현 타일 목록 전달 |

### 9.3 상대 행동 히스토리 전달 형식
```
상대 플레이어 행동 히스토리:
  Player 1 (AI_OPENAI, 남은 8장):
    - Turn 3: 드로우 (배치 가능했을 수 있음)
    - Turn 7: 그룹 [R5,B5,K5] 배치
    - Turn 11: 드로우
    - 패턴: 보수적, 5번대 숫자 선호
  Player 2 (HUMAN, 남은 3장):
    - Turn 4: 런 [Y1,Y2,Y3] 배치
    - Turn 8: 테이블 재배치 후 대량 배치 (5장)
    - Turn 12: 배치 (2장)
    - 패턴: 공격적, 곧 승리 가능성 높음 ⚠️
```

### 9.4 심리전 수준 설정

| 수준 | 설명 | 프롬프트 복잡도 |
|------|------|----------------|
| Level 0 | 심리전 없음. 최적 수만 계산 | 기본 |
| Level 1 | 상대 남은 타일 수 고려 | 낮음 |
| Level 2 | 상대 행동 패턴 분석 + 견제 | 중간 |
| Level 3 | 블러핑 + 페이크 드로우 + 템포 조절 | 높음 |

### 9.5 관련 메트릭
| 메트릭 | 설명 |
|--------|------|
| ai_bluff_count | 블러핑(의도적 보류) 횟수 |
| ai_pressure_moves | 견제 수 횟수 |
| ai_opponent_read_accuracy | 상대 추론 정확도 (사후 분석) |
| psychology_level_win_rate | 심리전 수준별 승률 |

## 10. AI 캐릭터 시스템 (AI Personas)

### 10.1 난이도 등급

| 등급 | 이름 | 설명 |
|------|------|------|
| 하수 (Beginner) | 초보 AI | 단순 규칙 기반, 실수 포함, 심리전 없음 |
| 중수 (Intermediate) | 숙련 AI | 기본 전략, 상대 관찰, 재배치 활용 |
| 고수 (Expert) | 마스터 AI | 최적 수 탐색, 심리전 Level 3, 카운팅 |

### 10.2 캐릭터 프리셋

| 캐릭터 | 난이도 | 성격 | 전략 특성 | 프롬프트 톤 |
|--------|--------|------|-----------|-------------|
| **루키 (Rookie)** | 하수 | 순진, 실수 잦음 | 단순 매칭만, 재배치 안 함, 가끔 최적 수 놓침 | "초보자처럼, 가끔 실수하며" |
| **칼큘레이터 (Calculator)** | 중수 | 논리적, 차분 | 수학적 최적화, 감정 없음 | "효율적으로, 확률 기반으로" |
| **샤크 (Shark)** | 고수 | 공격적, 압박형 | 상대 견제, 빠른 클리어, 블러핑 | "공격적으로, 상대를 압박하며" |
| **폭스 (Fox)** | 고수 | 교활, 전략형 | 블러핑 마스터, 페이크 드로우, 역심리 | "교활하게, 상대를 속이며" |
| **월 (Wall)** | 중수 | 수비적, 끈질김 | 최소 배치, 상대 방해, 장기전 | "방어적으로, 절대 서두르지 않으며" |
| **와일드카드 (Wildcard)** | 중수 | 예측불가, 즉흥적 | 랜덤 전략 혼합, 상대 혼란 유발 | "예측불가하게, 일관성 없이" |

### 10.3 난이도별 구현 차이

#### 하수 (Beginner)
```
- LLM 모델: 경량 모델 (gpt-4o-mini, llama3.2:1b)
- 프롬프트: 단순, 제한된 정보만 전달
- 의도적 실수: 10~20% 확률로 최적 수 대신 차선 수 선택
- 재배치: 사용 안 함
- 심리전: Level 0
- 상대 정보: 제공 안 함
```

#### 중수 (Intermediate)
```
- LLM 모델: 중급 모델 (gpt-4o-mini, deepseek-chat)
- 프롬프트: 테이블 상태 + 자신 타일 + 상대 남은 수
- 재배치: 기본 활용
- 심리전: Level 1~2
- 상대 정보: 남은 타일 수만
```

#### 고수 (Expert)
```
- LLM 모델: 최상위 모델 (gpt-4o, claude-sonnet, deepseek-r1)
- 프롬프트: 전체 상태 + 행동 히스토리 + 미출현 타일 목록
- 재배치: 적극 활용, 복잡한 체인 재배치
- 심리전: Level 2~3
- 상대 정보: 전체 행동 히스토리 분석
- 카운팅: 나온 타일 기반 확률 추론
```

### 10.4 Room 생성 시 AI 설정 예시
```json
{
  "aiPlayers": [
    {
      "type": "AI_OPENAI",
      "persona": "shark",
      "difficulty": "expert",
      "psychologyLevel": 3
    },
    {
      "type": "AI_CLAUDE",
      "persona": "fox",
      "difficulty": "expert",
      "psychologyLevel": 3
    },
    {
      "type": "AI_LLAMA",
      "persona": "rookie",
      "difficulty": "beginner",
      "psychologyLevel": 0
    }
  ]
}
```

### 10.5 캐릭터별 UI 표현

| 요소 | 표현 |
|------|------|
| 아바타 | 캐릭터별 고유 아이콘 (상어, 여우, 벽 등) |
| 사고 중 메시지 | 캐릭터 성격 반영 ("음... 뭘 내지?" vs "흥, 이건 쉽군") |
| 배치 애니메이션 | 하수: 느리고 망설이듯 / 고수: 빠르고 자신감 있게 |
| 턴 종료 리액션 | 캐릭터 성격에 맞는 한 마디 (선택) |

### 10.6 실험 관점

캐릭터 시스템은 AI 실험 플랫폼 관점에서 핵심 가치:

| 실험 주제 | 설명 |
|-----------|------|
| 모델 × 캐릭터 조합별 승률 | GPT-4o + Shark vs Claude + Fox 등 |
| 난이도별 Human 승률 | 사용자 실력 측정 도구 |
| 심리전 효과 검증 | 심리전 유무에 따른 승률 차이 |
| 최적 캐릭터 발견 | 어떤 성격이 가장 강한지 통계적 검증 |
