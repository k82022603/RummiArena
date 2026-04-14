# v4 공통 System Prompt 설계

- **작성일**: 2026-04-14
- **Sprint**: Sprint 6 Day 3 — Track 1 [SP1]
- **작성자**: ai-engineer-1
- **상태**: 설계 초안 (구현 미시작 — SP3 에서 PromptRegistry 로 구체화)
- **연관 과제**: SP2 (버저닝 아키텍처), SP3 (PromptRegistry 구현), SP4 (A/B 실험), SP5 (베이스라인 드라이런)

## 0. 한 줄 요약

v1/v2/v3/v3-tuned 가 5개 어댑터에 파편적으로 박혀있다. v4 는 **하나의 공통 코어 (core) + 4개 모델 variant (transform layer)** 로 재구성하여 PromptRegistry 가 단일 진입점이 되게 한다. 코어는 게임 규칙·검증·few-shot 을 공통으로 두고, variant 는 thinking budget·json strictness·retry discipline 만 모델별로 override 한다.

## 1. 현재 파편화 진단

### 1.1 5개 어댑터의 프롬프트 사용 매트릭스 (2026-04-14 실측)

| 어댑터 | system 프롬프트 출처 | user 프롬프트 출처 | 경유 경로 | 토큰 예산 |
|--------|-----------------|---------------|--------|--------:|
| **DeepSeek (Reasoner)** | `V2_REASONING_SYSTEM_PROMPT` (hardcoded import) | `buildV2UserPrompt` | **BaseAdapter 우회** — `generateMove` override | ~1,200 |
| **OpenAI (gpt-5-mini)** | `V2_REASONING_SYSTEM_PROMPT` (hardcoded import) | `buildV2UserPrompt` | **BaseAdapter 우회** | ~1,200 |
| **Claude (Sonnet 4 thinking)** | `V2_REASONING_SYSTEM_PROMPT` (hardcoded import) | `buildV2UserPrompt` | **BaseAdapter 우회** | ~1,200 |
| **Ollama (qwen2.5:3b)** | `PromptBuilderService.buildSystemPrompt` → `persona.templates` (한국어!) | `buildUserPrompt` (한국어) | BaseAdapter → PromptBuilder 정상 경로 | ~3,000 (한국어) |
| **DashScope (qwen3-thinking)** | `V3_REASONING_SYSTEM_PROMPT` via `dashscope/prompt-builder.ts` 래퍼 | `buildV3UserPrompt` | dashscope.service 자체 경로 | ~1,530 |

**문제 지점**:

1. **세 reasoner 어댑터가 V2 에 묶여있다** — v3 (1,530 토큰, +21%) 가 `prompt/v3-reasoning-prompt.ts` 에 존재하지만 **DashScope 만 사용**. DeepSeek 의 v3-tuned (`deepseek/prompt-v3-tuned.ts`) 는 파일만 있고 어떤 어댑터도 import 하지 않는다 — **dead code**.
2. **Ollama 만 한국어 프롬프트** — v2 영어 프롬프트로 전환되지 않은 상태. 토큰 60% 더 소모하고 fallback 100% 라는 결과는 양쪽 원인이 합쳐진 것이다 (모델 능력 + 비최적 프롬프트).
3. **`PromptBuilderService` 는 reasoner 3개에서 우회됨** — 3/5 어댑터가 BaseAdapter generateMove 를 override 하면서 service 를 호출하지 않는다. 즉 service 의 retry/persona 로직은 ollama 에만 적용된다.
4. **PROMPT_VERSION 환경변수 미사용** — v2/v3 prompt 파일 주석에 `PROMPT_VERSION=v3 으로 토글 가능` 이라고 쓰여있지만 실제 어댑터에서는 분기 없음. **하드코딩 import**.
5. **버저닝 부재** — v1/v2/v3/v3-tuned 가 별도 파일로 존재하지만 어댑터는 컴파일 타임에 결정. 런타임 A/B 가 불가능.

### 1.2 v1 → v2 → v3 → v3-tuned 의 진화 매핑

| 변경점 | v1 (한국어) | v2 (영어 공통) | v3 (확장) | v3-tuned (DeepSeek 실험) |
|--------|---------|------------|--------|------------------|
| 언어 | 한국어 (~3,000 토큰) | **영어 전환 (~1,200 토큰, -60%)** | 영어 (1,530, +21% from v2) | 영어 (~1,750, +14% from v3) |
| 자기 검증 단계 | 없음 | "Before submitting, verify each group..." 추가 | 7개 항목 체크리스트로 확대 (a/b suffix 명시) | v3 동일 |
| 부정 예시 | 없음 | INVALID GROUP/RUN 3건 추가 | "Common Mistakes from Real Games" 섹션 신설 (실측 ERR 코드 명시) | v3 동일 |
| Step-by-step thinking | 없음 | 9단계 절차 신설 | 9단계 + Step 6 확장 (점수 평가 세분화) | 9단계 + Position Evaluation 5축 + "verify twice" |
| Table count check | 없음 | 없음 | "tableGroups must have >= N entries" 강조 | v3 동일 |
| ERR 코드 매핑 | 없음 | 없음 | ERR_GROUP_COLOR_DUP, ERR_TABLE_TILE_MISSING 명시 | v3 동일 |
| 사고 시간 허가 | 없음 | 없음 | 없음 | **"Thinking Time Budget" 섹션 신설** ("rushing is costly; verify twice") |
| Position Evaluation | 없음 | 없음 | 없음 | **5축 평가** (Legality, Initial Meld, Tile Count, Point Value, Residual Quality) |
| 복잡도 힌트 | 없음 | 없음 | 없음 | userPrompt 동적 분기 — `myTiles>=10 \|\| tableGroups>=3 \|\| opponent<=3` 시 "HIGH" 표시 |

핵심 변화는 두 줄로 압축된다:
- **v1→v2**: 한국어→영어 (-60% 토큰), 자기검증/부정예시 추가 → DeepSeek place rate 5% → 30.8% 핵심 도약.
- **v2→v3**: ERR 코드 매핑, table count 강제, a/b suffix 혼동 방지 → DashScope 대비책으로 만들어짐 (DeepSeek/GPT/Claude 미적용).
- **v3→v3-tuned**: DeepSeek 의 burst thinking 행동을 명시적으로 허가/유도. **A/B 검증 미실시**.

## 2. 4모델 특성 매핑 (19번 + 17번 + 18번 + 47번 종합)

| 차원 | DeepSeek Reasoner | GPT-5-mini | Claude Sonnet 4 (thinking) | Ollama qwen2.5:3b |
|------|----------------|-----------|---------------------|------------------|
| **사고 모드** | RL-only, 자율 확장 | Overthinking Tax 회피 | Adaptive extended thinking | 비추론 |
| **평균 출력 토큰** | 10,010 | 4,296 | 5,550 | ~500 (추정) |
| **최대 토큰** | 15,614 | 7,496 | 13,210 | ~1,500 |
| **턴당 비용** | $0.001 (가장 저렴) | $0.025 | $0.074 | $0 (로컬) |
| **Place Rate** | 33.3% | 28.2% | 25.6% | **0%** |
| **Burst Thinking** | **유** (후반 +56%) | 미관측 (+10%) | 일부 관측 (+19%) | 무 |
| **JSON 준수율** | 매우 높음 | 가장 높음 (response_format) | 높음 | 보통 (qwen2.5 가 v1.5 대비 우수) |
| **response_format 지원** | reasoner 모드는 미지원 | json_object 지원 | 미지원 (구조화 출력 안함) | 미지원 |
| **thinking 플래그** | 자동 (모델 내장) | 없음 (chain-of-thought 응답 텍스트 내) | budget_tokens=10000 (현재) | 없음 (qwen2.5 는 thinking 모델 아님) |
| **temperature** | 0 고정 (reasoner) | 0.3~1.0 (난이도) | 미설정 (extended thinking 시 불가) | 0.3~1.0 |
| **timeout (현재)** | 500s | 240s | 240s | 270s |
| **fallback 빈도 (clean env)** | 0 | 0 | 0 | **40/40 (Place 0)** |
| **추천 프롬프트 전략** | v3-tuned (burst 허가 + 5축 평가) | v3 (검증 강화) | v3 (검증 강화) | v3 + 단순화 (모델 능력 한계) |

## 3. v4 아키텍처 — 코어 + Variant Transform

### 3.1 설계 원칙

1. **단일 코어, 다중 transform**: 하나의 `v4-core.ts` 가 게임 규칙·few-shot·검증을 정의한다. 모델별 차이는 transform 함수가 **얇게 덧붙이거나 제거**한다.
2. **Variant 는 데이터, 코어는 코드**: variant 정의는 TypeScript const (rule 비호환 부분만 명시) — 코드 중복 0 을 목표.
3. **PromptRegistry 가 유일한 진입점**: 모든 어댑터는 `PromptRegistry.getPromptForModel(modelType, version)` 만 호출. 어댑터에서 직접 prompt 파일 import 금지.
4. **Versioning**: 각 코어와 variant 에 `version: 'v4.0.0'` 필드. SemVer-like 관리. SP2 가 상세 설계.
5. **Backward compat**: v1/v2/v3 은 그대로 두고 v4 만 새로 추가. 환경변수 `PROMPT_VERSION` (default `v3`) 으로 단계 전환.
6. **A/B-friendly**: registry 가 동일 모델에 대해 여러 variant 를 동시에 보유 가능 (`v4.0.0`, `v4.0.0-burst`, `v4.0.1` 등). SP4 가 활용.

### 3.2 모듈 구조 (제안)

```
src/ai-adapter/src/prompt/
├── v4/
│   ├── core/
│   │   ├── v4-core-system.ts       # 공통 system prompt 본문 (rules + few-shot + checklist)
│   │   ├── v4-core-user.ts         # 공통 user prompt 빌더 (gameState → text)
│   │   ├── v4-core-retry.ts        # 공통 retry prompt 빌더
│   │   └── v4-evaluation.ts        # 5축 평가 기준 (스니펫)
│   ├── variants/
│   │   ├── deepseek.variant.ts     # +burst thinking 허가, +Position Eval 5축
│   │   ├── gpt.variant.ts          # JSON 강화, response_format 활용 hint
│   │   ├── claude.variant.ts       # extended thinking budget 안내, conservative
│   │   ├── ollama.variant.ts       # 단순화 (few-shot 5→3개), 더 강한 JSON 강제
│   │   └── dashscope.variant.ts    # DeepSeek variant 거의 그대로 + qwen3 thinking 명시
│   ├── v4-registry.ts              # PromptRegistry — 어댑터 진입점
│   └── v4-types.ts                 # 공통 인터페이스
└── (v1/v2/v3/v3-tuned 기존 파일 그대로 유지 — 폐기는 SP5 이후 결정)
```

### 3.3 핵심 인터페이스

```typescript
// v4-types.ts
export interface PromptVariant {
  version: string;                   // 'v4.0.0'
  modelType: AiType;                 // AI_OPENAI, AI_CLAUDE, AI_DEEPSEEK, AI_LLAMA, AI_DASHSCOPE
  thinkingBudget: number;            // 사고 토큰 예산 (DeepSeek 15000, Claude 10000, GPT 0, Ollama 0, DashScope 15000)
  jsonStrictness: 'native' | 'instruction' | 'parser-fallback';
  retryDiscipline: 'verify-twice' | 'simple' | 'aggressive';
  buildSystemPrompt(context: PromptBuildContext): string;
  buildUserPrompt(context: PromptBuildContext): string;
  buildRetryPrompt(context: PromptBuildContext, errorReason: string, attemptNumber: number): string;
}

export interface PromptBuildContext {
  gameState: GameStateDto;
  difficulty: Difficulty;
  persona: CharacterType;
  psychologyLevel: PsychWarfareLevel;
  // SP2 가 추가할 필드: turnNumber, requestId, registry version
}

// v4-registry.ts
export class PromptRegistry {
  private variants = new Map<string, PromptVariant>(); // key = `${modelType}:${version}`
  
  register(variant: PromptVariant): void;
  get(modelType: AiType, version?: string): PromptVariant; // version 미지정 시 default
  list(): PromptVariant[]; // 디버깅/대시보드용
}
```

### 3.4 코어 system 프롬프트의 책임 (변경 없는 부분)

코어가 담당하는 것 — **모든 모델에 동일하게 들어가는 부분**:

1. **Tile Encoding 설명** — `{Color}{Number}{Set}`, R/B/Y/K, 1~13, a/b suffix, JK1/JK2
2. **GROUP 규칙** — same number, different colors, 3~4 tiles, ERR_GROUP_COLOR_DUP 예시
3. **RUN 규칙** — same color, consecutive, 3+ tiles, no wraparound
4. **Size Rule** — 모든 set 3+
5. **Initial Meld Rule** — sum >= 30, only rack tiles
6. **tableGroups 의미** — 배치 후 전체 상태, ALL existing 포함
7. **tilesFromRack 의미** — only your rack
8. **Few-shot 5개** — Draw / Single Run / Group / Extend / Multi-set
9. **Common Mistakes 3개** — DUP color, missing groups, gap in run
10. **Pre-Submission Validation Checklist** — 7개 항목
11. **Step-by-Step Thinking Procedure** — 9단계 (코어는 6단계까지만, variant 가 점수 평가 단계를 override)
12. **Response Format JSON 스키마**

토큰 예산: **~1,400 토큰** (v3 의 1,530 에서 variant-only 부분 분리)

### 3.5 Variant transform 의 책임 (모델별 차이)

#### 3.5.1 DeepSeek Variant

추가 섹션 (system 프롬프트 말미에 append):

```
# Thinking Time Budget
You have a generous thinking budget. Use it.
For COMPLEX positions (large rack, many table groups, opponent near-winning):
  enumerate, compare, verify. Take your time.
Empirically the hardest turns benefit from ~2x thinking tokens vs early turns.
Rushing is the most expensive mistake — invalid response → retry → fallback draw.

# Position Evaluation (apply in Step 6)
Score each candidate on 5 dimensions:
1. Legality | 2. Initial Meld | 3. Tile Count | 4. Point Value | 5. Residual Quality
Tiebreak: Count → Point Value → Residual Quality

# Step 6 (override)
6. Apply Position Evaluation. If complex (myTiles >= 10 || tableGroups >= 3 || opponent <= 3),
   deliberate carefully — do not shortcut. Verify twice.
```

User 프롬프트 추가 (v3-tuned 방식):
- `complex` 조건 만족 시 `# Position Complexity: HIGH` 블록 삽입 (v3-tuned 와 동일 로직)
- Retry 프롬프트에 "verify twice" 강조

코드 측면:
- `temperature: 0` 고정 (reasoner 특성)
- `response_format: undefined` (DeepSeek reasoner 미지원)
- `thinkingBudget: 15000`

#### 3.5.2 GPT-5-mini Variant

추가 섹션:
```
# JSON Output Mode (NEW)
This response will be enforced by response_format=json_object.
DO NOT output any text outside the JSON object — the API will reject it.
Schema validation is automatic.

# Token Efficiency Hint
GPT-5-mini achieves the best token efficiency (lowest tokens per Place).
Avoid restating the rules in your response — just output the JSON.
Reasoning field should be ≤ 50 tokens.
```

코드 측면:
- `response_format: { type: 'json_object' }` (현재 이미 적용)
- `thinkingBudget: 0` (GPT 는 별도 thinking 채널 없음, 출력 텍스트가 곧 reasoning)
- `temperature` 난이도 기반 (현행 유지)

User 프롬프트 추가:
- `# Be Concise` — "Reasoning ≤ 50 tokens. JSON only." 한 줄

#### 3.5.3 Claude Sonnet 4 (thinking) Variant

추가 섹션:
```
# Extended Thinking (Claude-specific)
You have extended thinking enabled with budget_tokens=10000.
Use the thinking channel to enumerate candidates, then output minimal final JSON.

# Conservative Bias
Claude tends to over-validate and burst at endgame ("28-turn silence then explosion" pattern).
Trust your validation — if a play is legal and increases tile count, take it.
Don't wait for "perfect" plays; "good" plays accumulate over the game.
```

코드 측면:
- `thinking: { type: 'enabled', budget_tokens: 10000 }` (현재 이미 적용)
- `temperature` 미설정 (extended thinking 시 불가)
- `response_format` 미적용 (Claude 미지원, 텍스트 응답 → 파서)
- `thinkingBudget: 10000`

User 프롬프트 추가:
- `# Action Bias: PLACE` — "If a legal placement exists, choose 'place' over 'draw' unless residual quality is critically low."

#### 3.5.4 Ollama qwen2.5:3b Variant

추가 섹션 — 정반대 방향 (단순화):
```
# Simple Mode
You are a small model. Focus on correctness, not optimization.
Prefer DRAW if you are unsure. Do NOT attempt rearrangements.
Only place if you can construct a NEW valid set from your rack tiles alone.
```

User 프롬프트 변경:
- few-shot 5개 → **3개로 축소** (Draw, Single Run initial meld, Multi-set 만 유지)
- "Common Mistakes" 섹션 제거 (혼동 위험)
- `# Output Schema (be exact)` — JSON 구조를 한 번 더 명시

코드 측면:
- `temperature: 0.3` 고정 (창의성 억제)
- `format: 'json'` (Ollama 의 JSON 모드 강제 — 향후 ollama.adapter 에 추가 권장)
- `thinkingBudget: 0`
- `retryDiscipline: 'simple'` — retry 시 더 자세한 설명 대신 더 단순한 예시 제공

#### 3.5.5 DashScope (qwen3-thinking) Variant

DeepSeek variant 와 거의 동일하지만 qwen3 고유 hint 추가:

```
# Qwen3 Thinking Mode (DashScope-specific)
This call uses enable_thinking=true with thinking_budget=15000.
Your reasoning_content channel is separate from content.
Output the final JSON in `content` only — do not duplicate it in reasoning_content.
```

코드 측면:
- DeepSeek variant 의 모든 system/user 추가 그대로 재사용
- `response_format: undefined` (thinking-only 모델은 미지원)
- `thinking_budget: 15000`
- `temperature: undefined` (thinking-only 모델 default 사용)

## 4. 차원별 지시어 설계 매트릭스

### 4.1 thinking_budget

| 모델 | 값 | 적용 위치 | 근거 |
|------|---:|---------|------|
| DeepSeek Reasoner | **15,000** | API body (없음, 모델 내장) | Round 5 max 15,614 토큰 |
| GPT-5-mini | **0** | N/A | 별도 thinking 채널 없음 |
| Claude Sonnet 4 | **10,000** | `body.thinking.budget_tokens` | 현행 + 47번 보고서 max 13,210 검증 |
| Ollama qwen2.5:3b | **0** | N/A | 비추론 모델 |
| DashScope qwen3-thinking | **15,000** | `extra_body.thinking_budget` | DeepSeek 와 동일 가정 (smoke test 후 조정) |

**향후 동적 조정 여지** (SP4 A/B 후): turnNumber 기반 동적 설정 가능. 예: 후반부 (T55+) 에 budget 을 12K→18K 로 증액. SP5 베이스라인 후 검토.

### 4.2 evaluation_criteria (5축, 코어 공통 + variant 가중치)

코어가 5축을 정의하고, variant 는 가중치/순서만 override 한다:

| 축 | 정의 | DeepSeek | GPT | Claude | Ollama | DashScope |
|----|------|:------:|:---:|:------:|:------:|:--------:|
| 1. **Legality** | 모든 set 이 GROUP/RUN/SIZE 규칙 준수 | hard filter | hard filter | hard filter | hard filter | hard filter |
| 2. **Initial Meld** | initialMeldDone=false 시 sum≥30 | hard filter | hard filter | hard filter | hard filter | hard filter |
| 3. **Tile Count Placed** | 배치된 rack 타일 수 | **1순위** | 1순위 | 1순위 | 1순위 (단순화) | 1순위 |
| 4. **Point Value** | 배치된 총 점수 | 2순위 | 2순위 | **1.5순위** (Action Bias 와 결합) | 미사용 | 2순위 |
| 5. **Residual Quality** | 잔여 rack 의 미래 조합 가능성 | 3순위 | 3순위 | 2순위 | 미사용 | 3순위 |

Tiebreak 순서:
- DeepSeek/DashScope: Count → Value → Residual
- GPT: Count → Value → Residual (동일, 단 단순)
- Claude: Count → Value → Residual + Action Bias toward PLACE
- Ollama: Count only (단순화)

### 4.3 retry_discipline

| 모델 | 정책 | 재시도 프롬프트 변경 |
|------|------|------------------|
| DeepSeek | `verify-twice` | "This retry is expensive. Take extra time. Verify twice." |
| GPT | `aggressive` | 에러 사유 + JSON 스키마 재명시. 짧고 강하게. |
| Claude | `verify-twice` | "Use your extended thinking channel for the retry. Re-enumerate." |
| Ollama | `simple` | 에러 사유 + **3개 예시로 축소** (혼동 방지). |
| DashScope | `verify-twice` | DeepSeek 와 동일. |

공통: 모든 retry 프롬프트는 마지막에 `If still unsure, respond: {"action":"draw","reasoning":"..."}` 안전망 유지.

### 4.4 json_strictness

| 모델 | 값 | 메커니즘 | 파서 fallback 필요 |
|------|---:|--------|----------------:|
| DeepSeek (reasoner) | `parser-fallback` | reasoner 는 response_format 미지원 → 텍스트 + reasoning_content 파싱 | **필수** (`extractBestJson`) |
| GPT-5-mini | `native` | `response_format: { type: 'json_object' }` | 권장 (방어 코드) |
| Claude | `instruction` | 프롬프트로 강제, 응답은 텍스트 | **필수** (구조화 출력 미지원) |
| Ollama | `native` | `format: 'json'` (Ollama API) | 권장 |
| DashScope | `parser-fallback` | thinking-only 모델은 response_format 미지원 → reasoning_content + content 파싱 | **필수** (DeepSeek 와 동일 패턴) |

## 5. v3 → v4 진화 매핑 표

| 영역 | v3 (현재 DashScope 만 사용) | v4 (제안) | 변화의 이유 |
|------|---------------------|--------|------------|
| 파일 구조 | `prompt/v3-reasoning-prompt.ts` 단일 파일 + `deepseek/prompt-v3-tuned.ts` 분기 | `prompt/v4/{core,variants,registry}` | dead code 제거, 명시적 variant 체계 |
| 어댑터 진입점 | 어댑터마다 직접 import (v2/v3 혼재) | `PromptRegistry.get(modelType, version)` | 단일 진입점, 런타임 교체 가능 |
| 모델 차이 처리 | 어댑터 generateMove override (3/5) | core + variant transform | 코드 중복 0, 검증 가능 |
| Thinking 정책 | 코드(`body.thinking={budget_tokens:10000}`) 와 프롬프트(v3-tuned 의 "thinking budget" 섹션) 분리 | variant 의 `thinkingBudget` 단일 필드 + 자동 inject (코드+프롬프트 양쪽) | 정합성 보장 |
| 한국어 잔재 | Ollama 만 한국어 (persona.templates) | **전 모델 영어** (Ollama variant 가 코어 영어 사용) | 토큰 60% 절감 + 일관성 |
| Position Evaluation 5축 | DeepSeek-only 실험 (v3-tuned, 미배포) | 코어에 정의 + variant 가중치 override | 모든 reasoner 가 혜택 |
| ERR 코드 매핑 | v3 에 일부 (DUP, MISSING) | v4 에 7개 ERR 코드 전부 (engine 코드와 1:1) | 47번 보고서 §6 체크리스트 권장 |
| 토큰 예산 | v3=1,530 | core=1,400 + variant=100~250 | -8% (variant 가 추가될 때만 증가) |
| Few-shot 개수 | 5개 (모든 모델 동일) | core 5개 + Ollama variant 가 3개로 축소 | 작은 모델 혼동 방지 |
| 환경변수 | `PROMPT_VERSION` (정의됐지만 미사용) | `PROMPT_VERSION=v4.0.0` (registry 가 실제 분기) | 실제 동작 |

## 6. 4개 variant 초안 코드 블록

> 본 섹션은 SP3 (PromptRegistry 구현) 가 그대로 사용할 수 있도록 의도된 **draft 코드**다. 실제 구현 시 export 형식·테스트는 SP3 가 결정한다.

### 6.1 코어 system 프롬프트 스니펫 (v4-core-system.ts)

```typescript
export const V4_CORE_SYSTEM_PROMPT = `You are a Rummikub game AI. Respond with ONLY a valid JSON object.

# Tile Encoding (CRITICAL - understand this perfectly)
Each tile code follows the pattern: {Color}{Number}{Set}
| Component | Values | Meaning |
|-----------|--------|---------|
| Color | R, B, Y, K | Red, Blue, Yellow, Black |
| Number | 1..13 | Face value (also = point value) |
| Set | a, b | Distinguishes duplicate tiles |
| Jokers | JK1, JK2 | Wild cards |

IMPORTANT: The "a" or "b" suffix ONLY distinguishes duplicate tiles. It does NOT change the color.
R7a and R7b are BOTH Red (R). B5a and B5b are BOTH Blue (B).

# Rules (STRICT - Game Engine rejects ALL violations)
[... GROUP / RUN / SIZE / Initial Meld / tableGroups / tilesFromRack 섹션 — v3 와 동일 ...]

# Few-Shot Examples
[... 5개 예시 — v3 와 동일 ...]

# Common Mistakes (NEVER repeat these)
[... 3개 ERR 사례 — v3 와 동일 ...]

# Pre-Submission Validation Checklist (7 items)
[... 7개 — v3 와 동일 ...]

# Step-by-Step Thinking Procedure
1. List ALL tiles in my rack, grouped by color
2. Find ALL possible groups: for each number, check if 3+ different colors exist
3. Find ALL possible runs: for each color, find consecutive sequences of 3+
4. If initialMeldDone=false: calculate point sum, keep only sum >= 30
5. If initialMeldDone=true: also check extension opportunities
6. [VARIANT OVERRIDE — see appended section if any]
7. If no valid combination exists: choose "draw"
8. Build JSON: include ALL existing table groups + new groups
9. Run validation checklist before outputting

# Response Format
Draw:  {"action":"draw","reasoning":"reason"}
Place: {"action":"place","tableGroups":[...],"tilesFromRack":[...],"reasoning":"reason"}

IMPORTANT: Output raw JSON only. No markdown, no code blocks, no explanation text.`;
```

### 6.2 DeepSeek Variant (variants/deepseek.variant.ts)

```typescript
export const deepseekV4Variant: PromptVariant = {
  version: 'v4.0.0',
  modelType: AiType.AI_DEEPSEEK,
  thinkingBudget: 15000,
  jsonStrictness: 'parser-fallback',
  retryDiscipline: 'verify-twice',
  
  buildSystemPrompt(_ctx) {
    return V4_CORE_SYSTEM_PROMPT + `
# Thinking Time Budget (DeepSeek Reasoner)
You have a generous thinking budget — use it. Empirical data from prior games shows
complex positions benefit from ~2x the thinking tokens of early turns. Rushing is the
most expensive mistake.

# Position Evaluation (apply in Step 6)
Score each candidate on 5 dimensions:
1. Legality (hard filter)
2. Initial Meld Threshold (hard filter)
3. Tile Count Placed (more is better)
4. Point Value Placed (higher for tiebreaks)
5. Rack Residual Quality (avoid orphans)
Tiebreak: Count -> Point Value -> Residual

# Step 6 Override
6. Apply Position Evaluation. If complex (rack >= 10, table >= 3 groups, opponent <= 3),
   deliberate carefully and verify twice.
`;
  },
  
  buildUserPrompt(ctx) {
    const baseUser = buildV4CoreUserPrompt(ctx);
    const complex =
      ctx.gameState.myTiles.length >= 10 ||
      ctx.gameState.tableGroups.length >= 3 ||
      ctx.gameState.opponents.some(o => o.remainingTiles <= 3);
    return complex
      ? baseUser + `\n\n# Position Complexity: HIGH\nTake your time. Verify twice.\n`
      : baseUser;
  },
  
  buildRetryPrompt(ctx, errorReason, attemptNumber) {
    return buildV4CoreRetryPrompt(ctx, errorReason, attemptNumber)
      + `\n\nThis retry is expensive. Take extra time. Verify twice before submitting.\n`;
  },
};
```

### 6.3 GPT-5-mini Variant

```typescript
export const gptV4Variant: PromptVariant = {
  version: 'v4.0.0',
  modelType: AiType.AI_OPENAI,
  thinkingBudget: 0,
  jsonStrictness: 'native',  // response_format: json_object
  retryDiscipline: 'aggressive',
  
  buildSystemPrompt(_ctx) {
    return V4_CORE_SYSTEM_PROMPT + `
# JSON Output Mode (Native)
This response will be enforced by response_format=json_object.
The API will REJECT any text outside the JSON object.

# Token Efficiency
Keep "reasoning" field <= 50 tokens. Do not restate rules in your response.
GPT-5-mini achieves the best tokens-per-Place efficiency — preserve this advantage.
`;
  },
  
  buildUserPrompt(ctx) {
    return buildV4CoreUserPrompt(ctx) + `\n# Be Concise\nReasoning <= 50 tokens. JSON only.`;
  },
  
  buildRetryPrompt(ctx, errorReason, attemptNumber) {
    return buildV4CoreRetryPrompt(ctx, errorReason, attemptNumber)
      + `\n\nERR: ${errorReason}\nFix and resubmit. JSON only. Reasoning <= 30 tokens.\n`;
  },
};
```

### 6.4 Claude Variant

```typescript
export const claudeV4Variant: PromptVariant = {
  version: 'v4.0.0',
  modelType: AiType.AI_CLAUDE,
  thinkingBudget: 10000,
  jsonStrictness: 'instruction',  // 프롬프트로만 강제
  retryDiscipline: 'verify-twice',
  
  buildSystemPrompt(_ctx) {
    return V4_CORE_SYSTEM_PROMPT + `
# Extended Thinking (Claude-specific)
Extended thinking is enabled with budget_tokens=10000.
Use the thinking channel to enumerate; output minimal final JSON.

# Action Bias: PLACE
Claude tends to over-validate. Trust your checklist — if a play is legal and increases
tile count, take it. Don't wait for perfect plays.

# Conservative Tiebreak
Order: Count -> Point Value (1.5 weight) -> Residual Quality
`;
  },
  
  buildUserPrompt(ctx) {
    return buildV4CoreUserPrompt(ctx) + `\n# Bias\nWhen in doubt, PLACE > DRAW (if legal).`;
  },
  
  buildRetryPrompt(ctx, errorReason, attemptNumber) {
    return buildV4CoreRetryPrompt(ctx, errorReason, attemptNumber)
      + `\n\nUse your extended thinking channel for this retry. Re-enumerate from scratch.\n`;
  },
};
```

### 6.5 Ollama Variant

```typescript
export const ollamaV4Variant: PromptVariant = {
  version: 'v4.0.0',
  modelType: AiType.AI_LLAMA,
  thinkingBudget: 0,
  jsonStrictness: 'native',  // Ollama format: 'json' (TODO: ollama.adapter 가 적용해야 함)
  retryDiscipline: 'simple',
  
  buildSystemPrompt(_ctx) {
    // Ollama 는 코어를 사용하되, Few-shot 과 Common Mistakes 를 축약
    return V4_CORE_SYSTEM_PROMPT_SIMPLIFIED + `
# Simple Mode (Small Model)
You are a small model. Focus on correctness, not optimization.
- Prefer DRAW if unsure.
- Do NOT attempt rearrangements (do not move table tiles).
- Only place if you can construct a NEW valid set from your rack tiles alone.
- Maximum 1 set per turn (do not try multi-set placements).
`;
  },
  
  buildUserPrompt(ctx) {
    // 단순화된 user prompt — 미출현 타일/액션 히스토리 생략
    return buildV4CoreUserPromptSimple(ctx);
  },
  
  buildRetryPrompt(ctx, errorReason, _attemptNumber) {
    // 간단한 에러 + 3개 예시
    return buildV4CoreUserPromptSimple(ctx)
      + `\n\nPrevious answer was wrong: ${errorReason}\n`
      + `Try again. If unsure: {"action":"draw","reasoning":"safe draw"}\n`;
  },
};
```

(Note: `V4_CORE_SYSTEM_PROMPT_SIMPLIFIED` 와 `buildV4CoreUserPromptSimple` 은 SP3 가 별도로 export — Few-shot 5→3, Common Mistakes 제거.)

## 7. SP3 구현용 JSON 스키마 제안

`responseParser` 가 모든 모델 응답을 검증하는 데 사용할 단일 스키마. SP3 가 `prompt/v4/v4-types.ts` 에 export 한다.

### 7.1 응답 스키마 (Zod 권장)

```typescript
import { z } from 'zod';

export const TileCodeSchema = z.string().regex(/^([RBYK](1[0-3]|[1-9])[ab]|JK[12])$/);

export const TableGroupSchema = z.object({
  tiles: z.array(TileCodeSchema).min(3).max(13),
});

export const DrawActionSchema = z.object({
  action: z.literal('draw'),
  reasoning: z.string().max(500),
});

export const PlaceActionSchema = z.object({
  action: z.literal('place'),
  tableGroups: z.array(TableGroupSchema).min(1),
  tilesFromRack: z.array(TileCodeSchema).min(1),
  reasoning: z.string().max(500),
});

export const MoveResponseSchema = z.discriminatedUnion('action', [
  DrawActionSchema,
  PlaceActionSchema,
]);

export type MoveResponseV4 = z.infer<typeof MoveResponseSchema>;
```

### 7.2 OpenAI response_format 용 JSON Schema

GPT-5-mini 의 `response_format: { type: 'json_schema', json_schema: {...} }` 에 직접 투입할 수 있는 형태. `response_format: { type: 'json_object' }` 은 schema 미지원이므로 변경 시 적용.

```json
{
  "name": "rummikub_move_v4",
  "strict": true,
  "schema": {
    "type": "object",
    "oneOf": [
      {
        "properties": {
          "action": { "const": "draw" },
          "reasoning": { "type": "string", "maxLength": 500 }
        },
        "required": ["action", "reasoning"],
        "additionalProperties": false
      },
      {
        "properties": {
          "action": { "const": "place" },
          "tableGroups": {
            "type": "array",
            "minItems": 1,
            "items": {
              "type": "object",
              "properties": {
                "tiles": {
                  "type": "array",
                  "minItems": 3,
                  "maxItems": 13,
                  "items": {
                    "type": "string",
                    "pattern": "^([RBYK](1[0-3]|[1-9])[ab]|JK[12])$"
                  }
                }
              },
              "required": ["tiles"],
              "additionalProperties": false
            }
          },
          "tilesFromRack": {
            "type": "array",
            "minItems": 1,
            "items": {
              "type": "string",
              "pattern": "^([RBYK](1[0-3]|[1-9])[ab]|JK[12])$"
            }
          },
          "reasoning": { "type": "string", "maxLength": 500 }
        },
        "required": ["action", "tableGroups", "tilesFromRack", "reasoning"],
        "additionalProperties": false
      }
    ]
  }
}
```

### 7.3 Variant-스키마 적용 매트릭스

| 모델 | 적용 방식 | 비고 |
|------|---------|------|
| DeepSeek (reasoner) | Zod 파서 only | API body 에는 schema 미주입 (reasoner 미지원) |
| GPT-5-mini | API body `response_format` + Zod 후검증 | strict=true 권장 |
| Claude | Zod 파서 only | API body 미지원, 프롬프트에 schema 텍스트 inline |
| Ollama | API `format: 'json'` + Zod 파서 | Ollama 는 schema-aware 미지원, format: 'json' 만 |
| DashScope (qwen3-thinking) | Zod 파서 only | thinking-only 모델은 response_format 미지원 |

## 8. v4 도입 단계 계획 (SP2~SP5 와 연결)

| 단계 | 담당 | 범위 | 산출물 |
|------|------|------|------|
| **SP1 (본 문서)** | ai-engineer-1 | 설계 결정 | 본 문서 |
| **SP2** | (별도 ai-engineer) | 버저닝 아키텍처 + Commit Queue | 버저닝 ADR |
| **SP3** | node-dev | PromptRegistry 구현 + 5개 어댑터 리팩터 | 코드 |
| **SP4** | qa + ai-engineer | 결정론 드라이런 A/B 프레임워크 | A/B 스크립트 |
| **SP5** | ai-engineer-1 (재투입) | v4 베이스라인 드라이런 + SP4 결과와 통합 분석 | 통합 보고서 |

**Sprint 6 내 완료 가정**:
- v4 v4.0.0 코드 머지 (SP3) → 환경변수 `PROMPT_VERSION=v4` 옵트인
- 결정론 드라이런 비교 (SP4): v3 vs v4 동일 시드로 100턴 시뮬
- v4 가 v3 대비 fallback ≤ + place rate ≥ 인지 검증
- Sprint 7 부터 default 전환

## 9. 위험과 완화

| 위험 | 영향 | 완화 |
|------|----:|------|
| v4 가 v3 대비 token 예산 증가 | 비용 +20% | core ≤ 1,400 토큰 목표, variant ≤ 250 토큰 추가 |
| Ollama 단순화로 오히려 place rate 하락 | 0% 유지 (이미 0) | 이미 최저점, 잃을 것 없음 |
| GPT response_format 강화로 reasoning 부재 → 디버깅 어려움 | 분석 어려움 | reasoning 필드 50토큰 유지, 로그 보존 |
| Claude action bias 가 invalid place 증가 | fallback 증가 가능 | 코어 checklist 가 hard filter, 1순위 Legality |
| DashScope 가 DeepSeek variant 와 동일하게 동작하지 않음 | place rate 차이 | smoke test 후 별도 variant 분기 가능 |
| 5개 어댑터 동시 리팩터 → 회귀 | 전 모델 fallback | SP3 가 단계적 (DashScope → Ollama → reasoner 3개 순서) 적용 |
| `PROMPT_VERSION` 환경변수 도입 시 K8s configmap 변경 누락 | 런타임 v3 유지 | SP3 PR 에 ConfigMap 변경 포함 강제 |

## 10. 결론

v3 에서 멈춘 5개 어댑터를 v4 코어+variant 체계로 정돈하면:

1. **dead code 제거** — `deepseek/prompt-v3-tuned.ts` 같은 분기가 사라진다
2. **Ollama 한국어 잔재 제거** — 토큰 60% 절감
3. **모델별 최적화 표면화** — thinking_budget, json_strictness, retry_discipline 이 선언적
4. **A/B 가능** — registry 가 동일 모델에 대해 v4.0.0 vs v4.0.1 동시 보유
5. **테스트 가능** — variant 단위 spec 작성 가능, core 변경이 모든 variant 에 자동 반영

본 설계는 **SP3 가 그대로 구현 가능한 수준**으로 작성되었다. SP2 가 버저닝/Commit Queue 결정을 추가하면, SP3 는 v4-core + 5개 variant + PromptRegistry 를 1.5~2일 안에 머지 가능할 것으로 추정한다.

---

## 부록 A: 본 문서가 가정하는 기존 산출물

| 문서 | 활용 |
|------|------|
| `docs/03-development/19-deepseek-token-efficiency-analysis.md` | DeepSeek thinking_budget=15000, p95/p99, burst thinking 정량 |
| `docs/03-development/15-deepseek-reasoner-analysis.md` | DeepSeek MoE/RL-only 아키텍처 배경 |
| `docs/03-development/17-gpt5-mini-essay.md`, `18-claude-sonnet4-essay.md` | GPT/Claude 행동 특성 (작성 가정 — 미존재 시 47번 보고서로 대체) |
| `docs/04-testing/47-reasoning-model-deep-analysis.md` | 3모델 사고 패턴, Place vs Draw 레이턴시 |
| `docs/04-testing/46-multirun-3model-report.md` | 다회 대전 통계 (place rate, fallback, 토큰) |
| `docs/02-design/34-dashscope-qwen3-adapter-design.md` §17 | DashScope variant 의 thinking_budget/extra_body 설계 근거 |

## 부록 B: SP5 가 본 문서를 사용할 때 검증할 항목

1. v4-core 가 실제로 v3 대비 토큰 -8% 달성했는가?
2. DeepSeek variant 의 v3-tuned 섹션이 그대로 통합되었는가?
3. Ollama variant 가 한국어를 완전히 제거했는가?
4. GPT variant 의 response_format 이 Zod 후검증과 호환되는가?
5. PromptRegistry 가 5개 모델 + 1개 version 등록을 보유하는가?
6. 결정론 드라이런(SP4)에서 v4 가 v3 대비 fallback 비율 ≤ 인가?
7. 5개 어댑터에서 `PROMPT_VERSION=v4` 환경변수가 동작하는가?
8. K8s ConfigMap 에 `PROMPT_VERSION` 키가 추가되었는가?
