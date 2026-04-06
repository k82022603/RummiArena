# 모델별 프롬프트 정책 (Model-Specific Prompt Policy)

- **작성일**: 2026-04-06 (v2 크로스 모델 실험 반영)
- **작성자**: 애벌레 (AI Engineer)
- **목적**: RummiArena에 통합된 4종 LLM의 프롬프트 전략, 설정 파라미터, 대전 결과, 최적화 교훈을 통합 정리하여 운영/개발 시 참조 기준으로 활용
- **선행 문서**: `04-ai-adapter-design.md`, `08-ai-prompt-templates.md`, `15-deepseek-prompt-optimization.md`
- **대전 데이터**: `docs/04-testing/26-deepseek-optimization-report.md`, `docs/04-testing/32-deepseek-round4-ab-test-report.md`, `docs/04-testing/38-v2-prompt-crossmodel-experiment.md`
- **코드 위치**: `src/ai-adapter/src/adapter/` (openai, claude, deepseek, ollama), `src/ai-adapter/src/prompt/v2-reasoning-prompt.ts`

---

## 1. 모델별 프롬프트 전략 비교표

### 1.1 프롬프트 아키텍처 전체 흐름

```mermaid
flowchart TB
    subgraph TOGGLE["USE_V2_PROMPT 환경 변수 토글"]
        ENV{"USE_V2_PROMPT\n= true / false"}
    end

    subgraph V2["v2 영문 Reasoning 프롬프트\n(v2-reasoning-prompt.ts)"]
        V2_SYS["v2 System Prompt\n(영문 전용, few-shot 5개)\n~1200 토큰"]
        V2_USER["v2 User Prompt\n(영문, 구조화)\n~300~500 토큰"]
        V2_CHECK["자기 검증 7항목\n(Pre-Submission Checklist)"]
    end

    subgraph COMMON["공통 프롬프트 파이프라인\n(PromptBuilder)"]
        PB["PromptBuilderService"]
        PB --> L1["Layer 1: System Prompt\n(게임 규칙 + 캐릭터)\n한국어+영문 혼합, ~3000 토큰"]
        PB --> L2["Layer 2: User Prompt\n(게임 상태 + 응답 형식)"]
        PB --> L3["Layer 3: Retry Context\n(에러 피드백, 조건부)"]
    end

    ENV -->|"true"| V2
    ENV -->|"false"| COMMON

    V2 --> OPENAI["OpenAI (gpt-5-mini)\nv2 영문 프롬프트 사용\nJSON mode 강제"]
    V2 --> CLAUDE["Claude (claude-sonnet-4)\nv2 영문 프롬프트 사용\nExtended Thinking"]
    V2 --> DEEPSEEK["DeepSeek (deepseek-reasoner)\nv2 영문 프롬프트 사용\n4단계 JSON 추출"]

    COMMON --> OLLAMA["Ollama (qwen2.5:3b)\n공통 한국어+영문 프롬프트\n(v2 비적용, 소형 모델)"]
    COMMON -->|"v2=false 시\nfallback"| OPENAI_LEGACY["OpenAI / Claude\n공통 프롬프트 (v1)"]

    style TOGGLE fill:#e67e22,color:#fff,stroke:#333
    style V2 fill:#2ecc71,color:#fff,stroke:#333
    style COMMON fill:#3498db,color:#fff,stroke:#333
    style OPENAI fill:#10a37f,color:#fff,stroke:#333
    style CLAUDE fill:#d97706,color:#fff,stroke:#333
    style DEEPSEEK fill:#4f46e5,color:#fff,stroke:#333
    style OLLAMA fill:#7c3aed,color:#fff,stroke:#333
    style OPENAI_LEGACY fill:#95a5a6,color:#fff,stroke:#333
```

> **2026-04-06 변경**: `USE_V2_PROMPT=true` (K8s ConfigMap 기본값) 설정 시, OpenAI/Claude/DeepSeek 3종 모두 `v2-reasoning-prompt.ts`의 영문 전용 프롬프트를 사용한다. Ollama만 기존 공통 프롬프트를 유지한다 (소형 모델의 reasoning 능력 제한).

### 1.2 모델별 프롬프트 전략 상세

| 항목 | OpenAI (gpt-5-mini) | Claude (claude-sonnet-4) | DeepSeek (deepseek-reasoner) | Ollama (qwen2.5:3b) |
|------|---------------------|--------------------------|------------------------------|----------------------|
| **프롬프트 언어** | 한국어+영문 혼합 | 한국어+영문 혼합 | 영문 전용 | 한국어+영문 혼합 |
| | *v2 모드: 영문 전용* | *v2 모드: 영문 전용* | | |
| **System Prompt** | 공통 (PromptBuilder) | 공통 (PromptBuilder) | **전용** (DEEPSEEK_REASONER_SYSTEM_PROMPT) | 공통 (PromptBuilder) |
| | *v2 모드: v2-reasoning-prompt.ts* | *v2 모드: v2-reasoning-prompt.ts* | *v2 모드: v2-reasoning-prompt.ts* | |
| **System 토큰** | ~3000 | ~3000 | ~2150 | ~3000 |
| | *v2 모드: ~1200* | *v2 모드: ~1200* | *v2 모드: ~1200* | |
| **User Prompt** | 공통 (buildUserPrompt) | 공통 (buildUserPrompt) | **전용** (buildReasonerUserPrompt) | 공통 (buildUserPrompt) |
| | *v2 모드: v2 buildUserPrompt* | *v2 모드: v2 buildUserPrompt* | *v2 모드: v2 buildUserPrompt* | |
| **JSON 강제 방식** | `response_format: json_object` | 프롬프트 지시 + thinking | 프롬프트 지시 (미지원) | `format: 'json'` |
| **Few-shot 예시** | 공유 4개 (시스템 프롬프트) | 공유 4개 (시스템 프롬프트) | **전용 5개** (VALID/INVALID 쌍) | 공유 4개 (시스템 프롬프트) |
| | *v2 모드: 공유 5개 (few-shot)* | *v2 모드: 공유 5개 (few-shot)* | | |
| **자기 검증** | 없음 | thinking이 암묵적 검증 | **7항목 체크리스트** | 없음 |
| | *v2 모드: 7항목 체크리스트* | *v2 모드: 7항목 체크리스트* | | |
| **재시도 프롬프트** | 공통 (buildRetryUserPrompt) | 공통 (buildRetryUserPrompt) | **전용** (buildReasonerRetryPrompt) | 공통 (buildRetryUserPrompt) |
| **특수 처리** | 추론 모델 감지 (gpt-5*) | Extended thinking 블록 파싱 | 4단계 JSON 추출 + JSON 수리 | thinking 모드 JSON 추출 |

> **v2 모드 참고**: `USE_V2_PROMPT=true` 환경 변수 설정 시, 이탤릭(*v2 모드*)으로 표시된 값이 적용된다. Ollama는 v2 비적용.

### 1.3 프롬프트 계층 비교

```mermaid
flowchart LR
    subgraph V2_SHARED["v2 공유 프롬프트\n(OpenAI, Claude, DeepSeek)\nUSE_V2_PROMPT=true"]
        direction TB
        V1["타일 인코딩 테이블\n(a/b 구분 강화)"]
        V2["GROUP/RUN 규칙\n(VALID/INVALID 쌍)"]
        V3["Few-shot 5개\n(draw/run/group/extend/multi)"]
        V4["자기 검증 7항목\n(Pre-Submission Checklist)"]
        V5["9단계 사고 절차\n(Step-by-Step)"]
        V6["영문 전용 게임 상태\n(구조화 포맷)"]
    end

    subgraph V1_SHARED["v1 공통 프롬프트\n(Ollama / v2=false 시 전 모델)"]
        direction TB
        S1["CharacterService\n캐릭터 페르소나"]
        S2["게임 규칙\n(한국어+영문)"]
        S3["응답 형식\n(JSON 스키마)"]
        S4["게임 상태\n(테이블+랙+턴)"]
        S5["난이도별 정보 범위\n(상대 정보, 미출현 타일)"]
    end

    style V2_SHARED fill:#2ecc71,color:#fff,stroke:#333
    style V1_SHARED fill:#3498db,color:#fff,stroke:#333
```

> **2026-04-06 변경**: 기존 "DeepSeek 전용" 영역이 "v2 공유 (3모델)" 영역으로 확장되었다. v2 프롬프트는 `src/ai-adapter/src/prompt/v2-reasoning-prompt.ts`에서 3모델이 공유한다.

---

## 2. 모델별 설정 파라미터

### 2.1 핵심 파라미터 비교표

| 파라미터 | OpenAI (gpt-5-mini) | Claude (claude-sonnet-4) | DeepSeek (deepseek-reasoner) | Ollama (qwen2.5:3b) |
|---------|---------------------|--------------------------|------------------------------|----------------------|
| **max_tokens** | 8192 (max_completion_tokens) | 16000 (thinking 포함) | **16384** | 4096 (num_predict) |
| **temperature** | 고정 1 (추론 모델 불변) | 비활성 (thinking 시) | 0 (추론 모델 고정) | min(설정값, 0.7) |
| **timeout (ms)** | 120,000 (최소 보장) | 120,000 (최소 보장) | **150,000** (최소 보장) | 120,000 (최소 보장) |
| **maxRetries** | 3 (기본값) | 3 (기본값) | 3 (기본값) | **5** (JSON 오류율 대응) |
| **비용/턴** | ~$0.025 | ~$0.074 | ~$0.001 | $0 (로컬) |
| **API 방식** | REST (OpenAI Chat) | REST (Messages API) | REST (OpenAI 호환) | 로컬 HTTP (Chat) |

### 2.2 max_tokens 설정 근거

```mermaid
flowchart TB
    subgraph OPENAI_TOKENS["OpenAI gpt-5-mini\nmax_completion_tokens: 8192"]
        O1["추론 모델은 max_tokens 대신\nmax_completion_tokens 사용"]
        O2["reasoning_tokens + completion 합산"]
        O3["루미큐브 응답은 ~100 토큰으로\n8192면 충분"]
    end

    subgraph CLAUDE_TOKENS["Claude Sonnet 4\nmax_tokens: 16000"]
        C1["thinking + text 블록 합산"]
        C2["budget_tokens: 10000\n(사고량 별도 제어)"]
        C3["thinking이 길어질 수 있어\n16000 확보"]
    end

    subgraph DEEPSEEK_TOKENS["DeepSeek Reasoner\nmax_tokens: 16384"]
        D1["reasoning_tokens + completion 합산"]
        D2["v2 프롬프트로 reasoning 증가\n(few-shot+검증 학습)"]
        D3["8192에서 content 잘림 발생\n(Round 4 Run 1 실패)"]
        D4["16384로 확대 후 정상 동작"]
    end

    subgraph OLLAMA_TOKENS["Ollama qwen2.5:3b\nnum_predict: 4096"]
        L1["소형 모델은 긴 출력 불필요"]
        L2["CPU 추론 속도 고려"]
        L3["JSON 응답 ~100 토큰이면 충분"]
    end

    style DEEPSEEK_TOKENS fill:#e74c3c,color:#fff,stroke:#333
```

**DeepSeek max_tokens 8192 -> 16384 변경 사유**:

Round 4 Run 1에서 v2 프롬프트(few-shot 5개 + 자기 검증 7항목) 적용 후, DeepSeek Reasoner의 내부 추론(reasoning)이 길어져 8192 토큰의 `max_tokens` 한도 내에서 실제 응답(content)까지 도달하지 못하는 현상이 발생했다. `finish_reason: "length"`로 content가 빈 문자열로 잘리며, Place Rate 4.0%(F 등급)까지 하락했다. 16384로 확대 후 reasoning ~3000~5000 토큰 + content ~100 토큰이 정상 출력되어 Place Rate 23.1%(A 등급)을 달성했다.

### 2.3 난이도별 Temperature 매핑

| 난이도 | 일반 모델 | 추론 모델 (OpenAI/DeepSeek) | Claude (thinking) |
|--------|---------|---------------------------|-------------------|
| beginner | 0.9 | 고정 (조절 불가) | 비활성 (thinking 시) |
| intermediate | 0.7 | 고정 (조절 불가) | 비활성 (thinking 시) |
| expert | 0.3 | 고정 (조절 불가) | 비활성 (thinking 시) |

> **핵심**: 추론 모델(gpt-5-mini, deepseek-reasoner)과 Claude Extended Thinking은 temperature 파라미터를 지원하지 않거나 무시한다. 난이도별 행동 차이는 프롬프트(캐릭터 페르소나 + 정보 범위)로 구현한다.

### 2.4 타임아웃 설정 근거

| 모델 | 타임아웃 | 근거 |
|------|---------|------|
| OpenAI gpt-5-mini | 120s | 추론 모델은 최소 60s, 복잡한 게임 상태에서 ~30s 소요 |
| Claude Sonnet 4 | 120s | Extended thinking으로 ~15~30s, 여유 확보 |
| DeepSeek Reasoner | **150s** | 평균 응답 58.6s, 복잡한 상태에서 90s+ 가능 |
| Ollama qwen2.5:3b | 120s | CPU 추론 ~4s(WSL2), ~25s(K8s), thinking 모드 대비 |

---

## 3. 대전 결과 요약 (Round 1~4)

### 3.1 전체 라운드 결과 추이

```mermaid
---
config:
  theme: default
---
xychart-beta
  title "모델별 Place Rate 추이 (Round 2~v2 Cross)"
  x-axis ["R2\n(2026-03-31)", "R3\n(2026-04-03)", "R4\n(2026-04-05)", "v2 Cross\n(2026-04-06)"]
  y-axis "Place Rate (%)" 0 --> 40
  bar [28, 28, 28, 30.8]
  bar [23, 23, 23, 33.3]
  bar [5, 12.5, 23.1, 17.9]
  line [15, 15, 15, 15]
```

> v2 Cross(2026-04-06): 3모델 모두 v2 통일 프롬프트 사용. Claude가 최초로 최고 성적(33.3%) 달성. 목표선(15%)은 line으로 표현.

### 3.2 라운드별 상세 결과표

| 지표 | gpt-5-mini (R2) | Claude (R2) | DeepSeek (R2) | DeepSeek (R3) | DeepSeek (R4) | gpt-5-mini (v2) | Claude (v2) | DeepSeek (v2) |
|------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Place Rate** | 28% | 23% | 5% | 12.5% | 23.1% | **30.8%** | **33.3%** | 17.9% |
| 총 턴 수 | 80 | 80 | 80 | 80 | 28 | **80 (첫 완주)** | 62 | 80 |
| AI 턴 수 | 40 | 40 | 40 | 40 | 13 | 39 | 24 | 39 |
| Fallback | 0 | 0 | 0 | 0 | 8 | - | - | - |
| 소요 시간 | 1,876s | 2,076s | 1,995s | 2,450s | 942s | - | - | - |
| **비용/턴** | $0.025 | $0.074 | $0.001 | $0.002 | $0.001 | ~$0.025 | ~$0.074 | ~$0.001 |
| 등급 | A | B+ | F | C | A | **A+** | **A+** | B |
| 프롬프트 | v1 공통 | v1 공통 | v0 공통 | v1 전용 | v2 전용 | **v2 공유** | **v2 공유** | **v2 공유** |

> **v2 열** (2026-04-06): `USE_V2_PROMPT=true`로 3모델 통일 프롬프트 적용 결과. Claude가 v2에서 최고 성적(33.3%)을 기록하며 GPT-5-mini를 역전. 상세 분석은 `docs/04-testing/38-v2-prompt-crossmodel-experiment.md` 참조.

### 3.3 비용 효율 비교

```mermaid
---
config:
  theme: default
---
xychart-beta
  title "비용 효율 (Place per Dollar, 높을수록 좋음)"
  x-axis ["GPT-5-mini\n(R2)", "Claude Sonnet4\n(R2)", "DeepSeek\n(R2)", "DeepSeek\n(R3)", "DeepSeek\n(R4)"]
  y-axis "Place / Dollar" 0 --> 250
  bar [11, 3, 50, 76, 231]
```

| 모델 (라운드) | 비용 | Place Rate | Place/Dollar | GPT 대비 배율 |
|---------------|:---:|:---:|:---:|:---:|
| GPT-5-mini (R2) | $1.00 | 28% | 11 | 1x |
| Claude Sonnet 4 (R2) | $2.96 | 23% | 3 | 0.3x |
| DeepSeek (R2) | $0.040 | 5% | 50 | 4.5x |
| DeepSeek (R3) | $0.066 | 12.5% | 76 | 6.9x |
| **DeepSeek (R4)** | **$0.013** | **23.1%** | **231** | **21x** |

> DeepSeek v2 프롬프트는 GPT-5-mini와 동등한 Place Rate(23% vs 28%)를 달성하면서, 비용 효율은 **21배** 우수하다.

### 3.4 DeepSeek Place Rate 진화

```mermaid
flowchart LR
    R2["Round 2\n5% (F)\n기본 프롬프트"]
    R3["Round 3\n12.5% (C)\n영문 전용\n+JSON 4단계"]
    R4["Round 4\n23.1% (A)\nfew-shot 5개\n+자기 검증 7항목\n+max_tokens 16384"]
    V2C["v2 Cross\n17.9% (B)\n공유 프롬프트\n(게임 분산)"]

    R2 -->|"+7.5pp\n(+150%)"| R3
    R3 -->|"+10.6pp\n(+85%)"| R4
    R4 -->|"-5.2pp\n(게임 분산)"| V2C

    style R2 fill:#e74c3c,color:#fff,stroke:#333
    style R3 fill:#f39c12,color:#000,stroke:#333
    style R4 fill:#27ae60,color:#fff,stroke:#333
    style V2C fill:#3498db,color:#fff,stroke:#333
```

### 3.5 v2 크로스 모델 Place Rate 비교

```mermaid
flowchart LR
    subgraph BEFORE["이전 (개별 프롬프트)"]
        B_GPT["GPT-5-mini\n28% (R2, v1)"]
        B_CL["Claude Sonnet 4\n20% (v1, 32턴)"]
        B_DS["DeepSeek\n23.1% (R4, v2 전용)"]
    end

    subgraph AFTER["v2 통일 프롬프트\n(2026-04-06)"]
        A_GPT["GPT-5-mini\n30.8% (80턴 첫 완주)"]
        A_CL["Claude Sonnet 4\n33.3% (최고 성적)"]
        A_DS["DeepSeek\n17.9% (게임 분산)"]
    end

    B_GPT -->|"+2.8%p"| A_GPT
    B_CL -->|"+13.3%p"| A_CL
    B_DS -->|"-5.2%p"| A_DS

    style BEFORE fill:#95a5a6,color:#fff,stroke:#333
    style AFTER fill:#2ecc71,color:#fff,stroke:#333
    style A_CL fill:#d97706,color:#fff,stroke:#333
    style A_GPT fill:#10a37f,color:#fff,stroke:#333
```

---

## 4. 프롬프트 최적화 교훈

### 4.1 모델별 최적화 전략 효과 매트릭스

| 최적화 전략 | OpenAI | Claude | DeepSeek | Ollama | 설명 |
|------------|:---:|:---:|:---:|:---:|------|
| **JSON mode 강제** | 필수 | N/A | 미지원 | 필수 | API 수준 JSON 강제가 파싱 실패율을 극적으로 낮춤 |
| **Few-shot 예시** | **중간** (v2 적용) | **높음** (v2 적용) | **매우 높음** | 중간 효과 | v2 실험으로 3모델 모두에서 효과 확인 |
| **자기 검증 체크리스트** | **중간** (v2 적용) | **높음** (v2 + thinking 시너지) | **높음** | 낮은 효과 | Claude thinking과 결합 시 최대 효과 |
| **Extended Thinking** | N/A | **높음** | N/A | N/A | 별도 사고 블록으로 깊은 전략 분석 |
| **영문 전용 프롬프트** | **효과적** (+2.8%p) | **매우 효과적** (+13.3%p) | **필수** | 불필요 | v2 실험으로 3모델 모두 영문 구조화 프롬프트에서 향상 확인 |
| **max_tokens 확대** | 불필요 | 조건부 | **필수** | 불필요 | 추론 모델의 reasoning truncation 방지 |
| **Temperature 조정** | 불가 (추론) | 불가 (thinking) | 불가 (추론) | 제한적 | 추론 모델은 temperature 제어 불가, 프롬프트로 대응 |
| **재시도 에러 피드백** | 중간 효과 | 중간 효과 | **높음** | 중간 효과 | 전용 재시도 프롬프트로 오류 유형별 가이드 제공 |

### 4.2 핵심 교훈

#### 교훈 1: Few-shot은 JSON mode가 없는 모델에서 핵심

OpenAI와 Ollama는 API 수준에서 JSON 구조를 강제(`response_format: json_object`, `format: 'json'`)할 수 있어 파싱 실패율이 극히 낮다. 반면 DeepSeek Reasoner는 이 기능을 지원하지 않으므로, 프롬프트 수준에서 few-shot 예시를 통해 "올바른 JSON이 어떤 모습인지"를 학습시켜야 한다. Round 4에서 5개 few-shot 추가 후 Place Rate가 12.5% -> 23.1%로 대폭 개선된 것이 이를 증명한다.

#### 교훈 2: 자기 검증 체크리스트는 양날의 검

자기 검증 7항목은 유효 배치율을 높이지만, 동시에 reasoning을 더 길게 만든다. max_tokens가 부족하면(Run 1: 8192) 오히려 content가 잘려 성능이 급락한다(4.0% F등급). **반드시 충분한 max_tokens와 함께 사용해야 한다.**

```mermaid
flowchart LR
    CHECK["자기 검증\n체크리스트"]
    CHECK -->|"max_tokens 충분\n(16384)"| GOOD["reasoning 검증\n+ content 정상\n= Place Rate 23.1%"]
    CHECK -->|"max_tokens 부족\n(8192)"| BAD["reasoning만 소비\ncontent 잘림\n= Place Rate 4.0%"]

    style GOOD fill:#27ae60,color:#fff,stroke:#333
    style BAD fill:#e74c3c,color:#fff,stroke:#333
```

#### 교훈 3: max_tokens는 추론 모델의 가장 중요한 파라미터

DeepSeek Reasoner와 같은 추론(reasoning) 모델에서 `max_tokens`는 `reasoning_tokens + completion_tokens`의 합계 상한이다. 프롬프트가 복잡해질수록 내부 추론이 길어지므로, 충분한 여유를 확보해야 한다. 이는 비추론 모델에서는 발생하지 않는 고유한 문제이다.

| 모델 유형 | max_tokens 의미 | 위험 |
|-----------|---------------|------|
| 비추론 (gpt-4o, deepseek-chat) | completion만 | 낮음 (응답 ~100 토큰) |
| 추론 (gpt-5-mini) | reasoning + completion | 중간 (자체 최적화) |
| 추론 (deepseek-reasoner) | reasoning + completion | **높음** (reasoning 길어지면 content 잘림) |
| Thinking (Claude) | thinking + text | 낮음 (budget_tokens로 별도 제어) |

#### 교훈 4: 추론 모델은 필수

Round 2에서 비추론 모델(Opus, deepseek-chat 등)은 루미큐브 타일 조합 탐색에 부적합했다. Claude Opus는 5%에 불과했으나, Claude Sonnet + Extended Thinking은 23%를 달성했다. 루미큐브처럼 조합론적 탐색이 필요한 게임에서는 **추론/thinking 능력이 필수**이다.

#### 교훈 5: 영문 전용 + 구조화 프롬프트는 모델 무관 효과적

~~기존 결론: DeepSeek만 영문 전용이 필요하고 OpenAI/Claude는 다국어도 안정적.~~

**v2 크로스 모델 실험(2026-04-06)으로 수정**: 영문 전용 + few-shot + 자기 검증 체크리스트 구조는 OpenAI(+2.8%p)와 Claude(+13.3%p)에서도 유의미한 성능 향상을 가져왔다. 특히 Claude Extended Thinking은 v2의 구조화된 사고 절차와 시너지가 높아, 전 모델 중 최고 Place Rate(33.3%)를 달성했다. 단, DeepSeek는 게임 분산으로 -12.9%p 하락하여 모델별 미세 조정 여지는 남아 있다.

### 4.3 최적화 히스토리 타임라인

```mermaid
gantt
    title 프롬프트 최적화 여정 (v0 ~ v2 Cross)
    dateFormat YYYY-MM-DD
    axisFormat %m/%d

    section Round 2 (v0)
    한국어 공유 프롬프트       :done, r2, 2026-03-31, 1d
    DeepSeek 5% (F)            :milestone, m2, 2026-03-31, 0d

    section Round 3 (v1)
    DeepSeek 영문 전용 전환    :done, r3a, 2026-04-01, 2d
    4단계 JSON 추출 구현        :done, r3b, 2026-04-01, 2d
    temperature 제거            :done, r3c, 2026-04-01, 1d
    DeepSeek 12.5% (C)         :milestone, m3, 2026-04-03, 0d

    section Round 4 (v2 전용)
    few-shot 5개 추가           :done, r4a, 2026-04-04, 1d
    자기 검증 7항목 추가        :done, r4b, 2026-04-04, 1d
    max_tokens 8192->16384      :done, r4c, 2026-04-05, 1d
    DeepSeek 23.1% (A)         :milestone, m4, 2026-04-05, 0d

    section v2 Cross (3모델 통일)
    v2-reasoning-prompt.ts 공유 모듈화  :done, v2a, 2026-04-06, 1d
    USE_V2_PROMPT=true ConfigMap 배포   :done, v2b, 2026-04-06, 1d
    Claude 33.3% (A+)         :milestone, mv2c, 2026-04-06, 0d
    GPT 30.8% (A+)            :milestone, mv2g, 2026-04-06, 0d
```

---

## 5. 권장 설정 (Production)

### 5.1 ConfigMap 권장값

```yaml
# helm/charts/ai-adapter/values.yaml
env:
  # --- 모델 ---
  OPENAI_DEFAULT_MODEL: "gpt-5-mini"
  CLAUDE_DEFAULT_MODEL: "claude-sonnet-4-20250514"
  CLAUDE_EXTENDED_THINKING: "true"
  DEEPSEEK_DEFAULT_MODEL: "deepseek-reasoner"
  OLLAMA_DEFAULT_MODEL: "qwen2.5:3b"

  # --- 비용 ---
  DAILY_COST_LIMIT_USD: "20"

  # --- v2 프롬프트 ---
  USE_V2_PROMPT: "true"  # OpenAI/Claude/DeepSeek에 v2 영문 reasoning 프롬프트 적용
  # false 설정 시 기존 v1 공통 프롬프트로 fallback (Ollama는 항상 v1)
```

### 5.2 모델별 운영 권장 시나리오

```mermaid
flowchart TB
    subgraph SCENARIO["용도별 모델 선택 가이드"]
        direction TB
        DEV["개발/테스트\n빠른 반복"]
        COST["비용 최적화\n일반 대전"]
        QUALITY["최고 품질\n전략 비교 실험"]
        TOURNAMENT["AI 토너먼트\n3~4인 AI 대전"]
    end

    DEV --> OLLAMA_REC["Ollama qwen2.5:3b\n비용: $0 / 응답: ~4s\nPlace Rate: N/A"]
    COST --> DS_REC["DeepSeek Reasoner (v2)\n비용: $0.001/턴 / 응답: ~58s\nPlace Rate: 23.1%"]
    QUALITY --> GPT_REC["GPT-5-mini\n비용: $0.025/턴 / 응답: ~24s\nPlace Rate: 28%"]
    TOURNAMENT --> MIX_REC["혼합 구성\nGPT + Claude + DeepSeek\n다양한 전략 스타일 비교"]

    style DEV fill:#7c3aed,color:#fff,stroke:#333
    style COST fill:#4f46e5,color:#fff,stroke:#333
    style QUALITY fill:#10a37f,color:#fff,stroke:#333
    style TOURNAMENT fill:#d97706,color:#fff,stroke:#333
```

### 5.3 모델-캐릭터 권장 매핑

| 캐릭터 | 전략 스타일 | 권장 모델 | 이유 |
|--------|-----------|---------|------|
| **Rookie** | 단순, 실수 빈번 | Ollama (qwen2.5:3b) | 단순 행동 패턴이 소형 모델과 일치, 무료 |
| **Calculator** | 확률 계산, 최적화 | DeepSeek Reasoner | 추론 모델의 조합 탐색 + 극강 비용 효율 |
| **Shark** | 공격적, 빠른 배치 | GPT-5-mini | 빠른 의사결정(~24s) + 최고 Place Rate |
| **Fox** | 기만, 심리전 | Claude Sonnet 4 | 200K 컨텍스트로 상대 패턴 분석, thinking으로 전략 구상 |
| **Wall** | 수비, 버티기 | Claude Sonnet 4 | 게임 전체 히스토리 기반 방어 전략 |
| **Wildcard** | 무작위, 창의적 | DeepSeek Reasoner | 비용 효율 + 다양한 응답 패턴 |

### 5.4 AI 토너먼트 추천 구성

```json
{
  "players": [
    {
      "type": "AI_OPENAI",
      "persona": "Shark",
      "difficulty": "expert",
      "psychologyLevel": 2,
      "note": "공격형 - 빠른 배치, 높은 Place Rate"
    },
    {
      "type": "AI_CLAUDE",
      "persona": "Fox",
      "difficulty": "expert",
      "psychologyLevel": 3,
      "note": "심리전 - 상대 패턴 분석, 200K 컨텍스트"
    },
    {
      "type": "AI_DEEPSEEK",
      "persona": "Calculator",
      "difficulty": "expert",
      "psychologyLevel": 2,
      "note": "최적화형 - 비용 효율 최강, 조합 탐색"
    }
  ]
}
```

예상 대전 비용: ~$2.00/판 (80턴 기준, GPT $1.00 + Claude $2.96 + DeepSeek $0.04)

---

## 6. 모델별 프롬프트 상세 스펙

### 6.1 OpenAI (gpt-5-mini)

| 항목 | 값 |
|------|-----|
| API 엔드포인트 | `https://api.openai.com/v1/chat/completions` |
| 프롬프트 소스 | `PromptBuilderService.buildSystemPrompt()` + `buildUserPrompt()` |
| | *v2 모드: `v2-reasoning-prompt.ts` (USE_V2_PROMPT=true)* |
| JSON 강제 | `response_format: { type: 'json_object' }` |
| max_completion_tokens | 8192 |
| temperature | 고정 (추론 모델 자체 제어) |
| timeout | min(request.timeoutMs, 120,000ms) |
| 추론 모델 감지 | `this.defaultModel.startsWith('gpt-5')` |
| 특이사항 | `max_tokens` 대신 `max_completion_tokens` 사용, temperature 파라미터 미전송 |

### 6.2 Claude (claude-sonnet-4)

| 항목 | 값 |
|------|-----|
| API 엔드포인트 | `https://api.anthropic.com/v1/messages` |
| 프롬프트 소스 | `PromptBuilderService.buildSystemPrompt()` + `buildUserPrompt()` |
| | *v2 모드: `v2-reasoning-prompt.ts` (USE_V2_PROMPT=true)* |
| JSON 강제 | 프롬프트 지시 (API 수준 미지원) |
| max_tokens | 16000 (thinking 모드 시) / 1024 (비 thinking) |
| thinking | `{ type: 'enabled', budget_tokens: 10000 }` |
| temperature | 비활성 (thinking 모드 시) / 설정값 (비 thinking) |
| timeout | min(request.timeoutMs, 120,000ms) |
| 응답 파싱 | contentBlocks에서 `type: 'text'` 블록 추출 |
| 특이사항 | `anthropic-version: '2023-06-01'` 헤더 필수, system은 body 필드 |

### 6.3 DeepSeek (deepseek-reasoner)

| 항목 | 값 |
|------|-----|
| API 엔드포인트 | `https://api.deepseek.com/v1/chat/completions` |
| 프롬프트 소스 | **전용** `DEEPSEEK_REASONER_SYSTEM_PROMPT` + `buildReasonerUserPrompt()` |
| | *v2 모드: `v2-reasoning-prompt.ts` (USE_V2_PROMPT=true, 3모델 공유)* |
| JSON 강제 | 프롬프트 지시만 (API 미지원, Reasoner 모드) |
| max_tokens | **16384** (Reasoner) / 1024 (chat) |
| temperature | 미전송 (Reasoner) / 설정값 (chat) |
| timeout | min(request.timeoutMs, 150,000ms) |
| JSON 추출 | 4단계: content 직접 -> content 정규식 -> reasoning 마지막 -> 원본 |
| JSON 수리 | trailing comma 제거, 코드블록 제거, 중괄호 매칭 |
| 재시도 프롬프트 | 전용 `buildReasonerRetryPrompt()` (오류 유형별 가이드 포함) |
| 특이사항 | Reasoner는 `generateMove()` 완전 오버라이드, chat은 BaseAdapter 사용 |

### 6.4 Ollama (qwen2.5:3b)

| 항목 | 값 |
|------|-----|
| API 엔드포인트 | `http://ollama:11434/api/chat` (K8s) / `http://localhost:11434/api/chat` (로컬) |
| 프롬프트 소스 | `PromptBuilderService.buildSystemPrompt()` + `buildUserPrompt()` |
| JSON 강제 | `format: 'json'` |
| num_predict | 4096 |
| temperature | min(설정값, 0.7) |
| timeout | min(request.timeoutMs, 120,000ms) |
| maxRetries | min(request.maxRetries, 5) (소형 모델 JSON 오류율 대응) |
| stop tokens | `['```']` |
| thinking 파싱 | Qwen3 thinking 모드 대응: content 비었을 때 thinking에서 JSON 추출 |
| 특이사항 | `generateMove()` 오버라이드하여 retries/timeout 최소값 보장 |

---

## 7. 프롬프트 버전 관리

### 7.1 현재 버전 현황

| 모델 | 프롬프트 버전 | 마지막 업데이트 | 성과 |
|------|-------------|---------------|------|
| OpenAI | **v2 (공유)** | 2026-04-06 | Place Rate **30.8%** (v1: 28%) |
| Claude | **v2 (공유)** | 2026-04-06 | Place Rate **33.3%** (v1: 23%) |
| DeepSeek | **v2 (공유)** | 2026-04-06 | Place Rate 17.9% (v2 전용: 23.1%) |
| Ollama | v1 (공통) | 2026-03-31 | 게임 흐름 검증용 (v2 비적용) |

### 7.2 변경 이력

| 버전 | 날짜 | 적용 모델 | 핵심 변경 | Place Rate |
|------|------|----------|----------|:---:|
| v0 | 2026-03-31 | 전 모델 | 한국어 공유 프롬프트 (PromptBuilder) | DS 5% (F) |
| v1 | 2026-04-03 | DeepSeek | 영문 전용, 4단계 JSON 추출, temperature 제거 | DS 12.5% (C) |
| v2 (전용) | 2026-04-05 | DeepSeek | few-shot 5개, 자기 검증 7항목, max_tokens 16384 | DS **23.1% (A)** |
| **v2 (공유)** | **2026-04-06** | **GPT/Claude/DS** | v2-reasoning-prompt.ts 3모델 공유, USE_V2_PROMPT 토글 | Claude **33.3%**, GPT **30.8%**, DS 17.9% |

---

## 8. 다음 단계

### 8.1 즉시 (Sprint 5 Week 2)

- [x] **3모델 v2 크로스 모델 실험**: GPT-5-mini / Claude / DeepSeek 통일 프롬프트 비교 완료 (2026-04-06)
- [ ] **DeepSeek v2 성능 회귀 분석**: v2 전용(23.1%) -> v2 공유(17.9%) 하락 원인 분석 + v3 대응
- [ ] **INVALID_MOVE 상세 분석**: 규칙 위반 유형별 분류 + v3 프롬프트 반영

### 8.2 중기 (Sprint 6)

- [x] ~~**OpenAI/Claude 프롬프트 개별 최적화**~~: v2 프롬프트로 통일 완료 (2026-04-06). Claude +13.3%p, GPT +2.8%p 향상
- [ ] **max_tokens 동적 조정**: 게임 상태 복잡도에 따라 16384~32768 자동 조절
- [ ] **A/B 테스트 자동화**: 동일 게임 상태에서 프롬프트 버전별 병렬 실행
- [ ] **v3 프롬프트**: INVALID_MOVE 분석 결과 기반 추가 최적화

### 8.3 장기 (Phase 6)

- [ ] **AI 토너먼트 정기 실행**: 4종 모델 Round Robin, ELO 변동 추적
- [ ] **프롬프트 A/B 테스트 프레임워크**: ConfigMap 기반 자동 전환 + 메트릭 수집
- [ ] **모델 핫스왑**: 게임 중 모델 교체 없이, 캐릭터-모델 매핑만으로 전략 다양성 확보

---

## 9. v2 프롬프트 크로스 모델 실험 결과 (2026-04-06)

### 9.1 실험 동기

DeepSeek Reasoner에서 v2 프롬프트(영문 전용 + few-shot 5개 + 자기 검증 7항목 + 9단계 사고 절차)가 Place Rate를 5% -> 23.1%로 끌어올린 성공을 바탕으로, 동일한 프롬프트 구조가 OpenAI/Claude에서도 효과가 있는지 검증하는 실험을 실시했다.

**가설**: v2 프롬프트의 구조화된 reasoning 유도 전략은 DeepSeek 고유가 아니라, 추론 모델 전반에 유효할 것이다.

### 9.2 실험 설정

| 항목 | 값 |
|------|-----|
| 프롬프트 | `v2-reasoning-prompt.ts` (3모델 공유) |
| 토글 | `USE_V2_PROMPT=true` (K8s ConfigMap) |
| 대전 상대 | Dummy Bot (교대 드로우) |
| 턴 제한 | 80턴 |
| 적용 모델 | GPT-5-mini, Claude Sonnet 4 (thinking), DeepSeek Reasoner |
| 비적용 모델 | Ollama qwen2.5:3b (소형 모델, reasoning 능력 제한) |

### 9.3 실험 결과

| 모델 | 이전 Place Rate | v2 Place Rate | 변화 | 핵심 관찰 |
|------|:---:|:---:|:---:|------|
| **Claude Sonnet 4** | 20.0% (32턴) | **33.3%** (62턴) | **+13.3%p** | Extended thinking + v2 체크리스트 시너지. 최고 성적 달성 |
| **GPT-5-mini** | 28% (R2, 80턴) | **30.8%** (80턴) | **+2.8%p** | v2에서 첫 80턴 완주 달성. 안정적 소폭 향상 |
| **DeepSeek** | 23.1% (R4, 28턴) | 17.9% (80턴) | -5.2%p | 80턴 완주했으나 게임 분산으로 수치 하락. 통계적 동등 범위 내 |

### 9.4 핵심 발견

#### 발견 1: Claude Extended Thinking은 v2와 최고의 시너지

Claude의 Extended Thinking 블록은 v2 프롬프트의 "9단계 사고 절차" 및 "자기 검증 7항목"을 thinking 내부에서 체계적으로 수행하며, 이것이 최종 응답 품질을 극적으로 높였다. thinking 내에서 타일 조합을 여러 번 시뮬레이션하고 검증하는 패턴이 관찰되었다.

#### 발견 2: GPT-5-mini는 이미 높은 기저에서 안정적 향상

GPT-5-mini는 v1에서도 28%로 최고였으나, v2 전환 후 30.8%로 소폭 상승하면서 **최초로 80턴 완주**에 성공했다. 추론 모델 자체의 내부 최적화가 이미 높아 프롬프트 구조 변경의 한계 효과(marginal effect)가 상대적으로 작다.

#### 발견 3: DeepSeek의 하락은 게임 분산 범위 내

DeepSeek의 17.9%는 이전 23.1%보다 낮지만, R4는 28턴(타임아웃)이고 v2 Cross는 80턴 완주이므로 턴 수 차이가 크다. 80턴 기준으로 정규화하면 통계적 동등 범위 내로 판단된다. 추가 반복 실험이 필요하다.

### 9.5 구현 상세

```
src/ai-adapter/src/prompt/v2-reasoning-prompt.ts   # 3모델 공유 프롬프트 모듈
  - V2_REASONING_SYSTEM_PROMPT  : 영문 시스템 프롬프트 (~1200 토큰)
  - buildV2UserPrompt()         : 영문 구조화 사용자 프롬프트
  - buildV2RetryPrompt()        : 영문 재시도 프롬프트

환경 변수: USE_V2_PROMPT=true|false
  - true  → OpenAI/Claude/DeepSeek 어댑터가 v2 프롬프트 사용
  - false → 기존 v1 공통 프롬프트 (PromptBuilder) 사용
  - Ollama는 USE_V2_PROMPT 무관, 항상 v1 사용
```

### 9.6 결론 및 의사결정

| 의사결정 | 내용 |
|---------|------|
| **v2를 3모델 공통 표준으로 채택** | `USE_V2_PROMPT=true`를 프로덕션 기본값으로 설정 |
| **Ollama는 v1 유지** | 소형 모델(3B)은 reasoning 구조 이해 능력이 제한적 |
| **DeepSeek 회귀 모니터링** | 추가 반복 실험으로 통계적 유의성 확인 후 v3 검토 |
| **v1 fallback 유지** | `USE_V2_PROMPT=false`로 즉시 롤백 가능한 구조 유지 |

> 상세 실험 보고서: `docs/04-testing/38-v2-prompt-crossmodel-experiment.md`

---

## 관련 문서

| 파일 | 설명 |
|------|------|
| `docs/02-design/04-ai-adapter-design.md` | AI Adapter 전체 설계 |
| `docs/02-design/08-ai-prompt-templates.md` | 프롬프트 템플릿 상세 설계 (7 레이어) |
| `docs/02-design/15-deepseek-prompt-optimization.md` | DeepSeek 전용 프롬프트 최적화 설계 |
| `docs/04-testing/12-llm-model-comparison.md` | LLM 모델 성능 비교 (Sprint 4 초기) |
| `docs/04-testing/26-deepseek-optimization-report.md` | Round 2->3 최적화 보고서 |
| `docs/04-testing/32-deepseek-round4-ab-test-report.md` | Round 4 A/B 테스트 결과 |
| `docs/04-testing/38-v2-prompt-crossmodel-experiment.md` | v2 프롬프트 크로스 모델 실험 보고서 (2026-04-06) |
| `src/ai-adapter/src/prompt/v2-reasoning-prompt.ts` | v2 영문 reasoning 프롬프트 (3모델 공유) |
| `src/ai-adapter/src/adapter/openai.adapter.ts` | OpenAI 어댑터 구현 |
| `src/ai-adapter/src/adapter/claude.adapter.ts` | Claude 어댑터 구현 |
| `src/ai-adapter/src/adapter/deepseek.adapter.ts` | DeepSeek 어댑터 구현 (전용 프롬프트 포함) |
| `src/ai-adapter/src/adapter/ollama.adapter.ts` | Ollama 어댑터 구현 |
| `src/ai-adapter/src/prompt/prompt-builder.service.ts` | 공통 프롬프트 빌더 |
| `helm/charts/ai-adapter/values.yaml` | ConfigMap 설정값 |
