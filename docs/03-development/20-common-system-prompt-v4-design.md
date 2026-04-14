# 공통 System Prompt v4 설계 (4모델 통합 + 차원별 분기)

- **작성일**: 2026-04-14
- **Sprint**: Sprint 6 Day 3
- **작성자**: ai-engineer-1 (Track 1, SP1)
- **연관 태스크**: SP1 (#18) → SP3 PromptRegistry 구현 (#20) → SP5 베이스라인 드라이런 (#22)
- **연관 문서**:
  - `docs/03-development/15-deepseek-reasoner-analysis.md`
  - `docs/03-development/17-gpt5-mini-analysis.md`
  - `docs/03-development/18-claude-sonnet4-extended-thinking.md`
  - `docs/03-development/19-deepseek-token-efficiency-analysis.md` (Day 3 오전 산출, C1)
  - `docs/02-design/21-reasoning-model-prompt-engineering.md`
  - `docs/02-design/24-v3-prompt-adapter-impact.md`
  - `docs/02-design/34-dashscope-qwen3-adapter-design.md` §17

---

## 1. 배경 — v3까지 누적된 프롬프트 부채

### 1.1 현재 상태 스냅샷 (2026-04-14 기준)

`src/ai-adapter/` 트리에서 사용 중인 system prompt 자산을 정리하면 4종이 공존한다:

| 식별자 | 위치 | 언어 | 용도 | 사용 모델 | 토큰 |
|--------|------|------|------|----------|----:|
| **v1 (Korean BASE)** | `src/prompt/persona.templates.ts::BASE_SYSTEM_PROMPT` | 한국어 | 페르소나·난이도·심리전 결합 | (legacy fallback, Ollama 추정) | ~3,000 |
| **v2 reasoning** | `src/prompt/v2-reasoning-prompt.ts::V2_REASONING_SYSTEM_PROMPT` | 영문 | DeepSeek 5%→30.8% 도약의 핵심 | DeepSeek / GPT / Claude (`USE_V2_PROMPT=true`) | ~1,200 |
| **v3 reasoning** | `src/prompt/v3-reasoning-prompt.ts::V3_REASONING_SYSTEM_PROMPT` | 영문 | v2 + 4가지 무효 패턴 보강 | DashScope (`prompt-builder.ts` 직접 import) | ~1,530 |
| **v3-tuned (DeepSeek-only)** | `src/adapter/deepseek/prompt-v3-tuned.ts` | 영문 | v3 + thinking budget 명시 + 5축 평가 | DeepSeek (`DEEPSEEK_PROMPT_VERSION=v3-tuned` 토글) | ~1,750 |

### 1.2 부채 진단

이 4종 분포에서 즉시 드러나는 문제는 **세 가지**다.

1. **변종 폭발** — DeepSeek는 v2 → v2 → v3-tuned 의 3분기를 `USE_V2_PROMPT` + `DEEPSEEK_PROMPT_VERSION` 두 환경변수 조합으로 토글하고 있다. GPT/Claude는 여전히 v2 고정. DashScope만 v3 고정. **하나의 모델 군이 같은 게임 규칙을 4가지 다른 문장으로 학습하고 있다.**
2. **릴리스 단위 부재** — v2/v3/v3-tuned는 모두 코드 import 시점에서만 분기된다. PromptDefinition 같은 레지스트리가 없어, "오늘 사용한 프롬프트가 무엇인지" 가 게임 결과 메타데이터에 기록되지 않는다. 47번 보고서에서 멀티런 결과를 비교할 때마다 "이건 v2였나 v3였나" 를 git blame 으로 역추적해야 했다.
3. **모델별 특성 미반영** — v3는 모든 모델에 동일하게 적용되지만, 4모델의 차이는 매우 크다. 19번 분석은 다음 4가지 차원에서 모델별 격차가 본질적이라고 보고한다:
   - **사고 토큰 사용량**: DeepSeek 10,010 / GPT 4,296 / Claude 5,550 / Ollama ~500
   - **응답 시간 분포**: p99 기준 DeepSeek 433s vs GPT 205s vs Claude 215s vs Ollama 35s
   - **JSON 모드 지원**: OpenAI strict / Claude tool_use / DeepSeek plain / Ollama plain
   - **fallback 발생 원인**: DeepSeek=timeout 절단 / GPT=cost limit / Claude=WS_TIMEOUT / Ollama=능력 한계

   동일한 v3 프롬프트를 4모델에 똑같이 던지는 것은, 정량적으로 입증된 4가지 격차를 무시하는 행위다.

### 1.3 v4 의 동기

v4는 위 3가지 부채를 **하나의 통합 설계** 로 청산한다. 다만 v3에서 검증된 강점(영문, ~1,500 토큰, 자기 검증 체크리스트, 무효 패턴 few-shot)은 그대로 보존한다. **변경 범위는 "공통 코어 + 4 variant 분기" 라는 구조 자체이며, 게임 규칙 본문은 거의 그대로 유지**한다.

---

## 2. v1~v3 diff 분석 — 무엇이 바뀌었고 무엇이 살아남았는가

### 2.1 v1 (한국어 BASE) → v2 (영문 reasoning) 전환

| 차원 | v1 (한국어 BASE) | v2 (reasoning) | 변화 |
|------|-----------------|---------------|------|
| 언어 | 한국어 | 영문 | 토큰 60% 절감 (~3,000 → ~1,200) |
| 톤 | "당신은 ... 입니다" | "You are a Rummikub game AI." | 모델 친화적 영문 |
| Few-shot | 4건 (한국어, 일부 추상적) | 5건 (영문, 모두 분석 단계 포함) | 사고 절차 시연 추가 |
| 검증 | "5단계 사고 절차" 텍스트 | **Pre-Submission Validation Checklist (7항목)** | 명시적 self-check |
| 부정 예시 | 잘못된 그룹/런 1~2개씩 | INVALID GROUP/RUN 5개씩 + 에러 코드 매핑 | ERR_GROUP_COLOR_DUP 등 게임 엔진 코드 인용 |
| Step-by-step | "사고 절차 5단계" | **Step-by-Step Thinking Procedure (9단계)** | 9 → 검증 종결로 마무리 |
| 페르소나 | 6 캐릭터 별 한국어 지시문 | 페르소나 무관 통합 | v2 시점부터 페르소나 분리 (CharacterService) |

**핵심 통찰**: v1 → v2 의 본질적 변화는 "규칙 설명" 이 아니라 "**모델이 사고하는 절차** 를 명시화" 한 것이다. v1은 LLM에게 "이렇게 플레이하세요" 라고 지시했고, v2는 "이렇게 사고한 다음 검증한 뒤 출력하세요" 라고 지시했다. DeepSeek 의 5% → 30.8% 도약 (Round 4) 은 후자의 효과로 해석된다.

### 2.2 v2 → v3 점증 보강 (4 후보 중 후보 1+3 즉시 적용, 후보 2 Phase 2)

| 추가 항목 | 위치 | 타깃 에러 | 토큰 비용 |
|---------|------|---------|--------:|
| **"a/b suffix is NOT a color"** 강조 | Tile Encoding 직후 | ERR_GROUP_COLOR_DUP | +30 |
| **"COUNTING CHECK"** (table groups N entries) | tableGroups 설명 | ERR_TABLE_TILE_MISSING | +50 |
| **"Common Mistakes from Real Games"** 섹션 (3건) | Few-Shot 다음 | 위 2개 + ERR_RUN_SEQUENCE | +200 |
| **buildV3UserPrompt** 의 `CRITICAL: There are exactly N groups` | 유저 프롬프트 동적 생성 | ERR_TABLE_TILE_MISSING | +50/턴 |
| **Step 6 확장** ("maximize tiles placed" 세분화) | Step-by-Step | invalid placement 일반 | +100 |
| 계 | | | **+330 토큰 (~1,200 → ~1,530)** |

**효과 검증**: docs/02-design/24-v3-prompt-adapter-impact.md 에 따르면 v3는 v2 대비 ERR_GROUP_COLOR_DUP 발생률이 단위 테스트 시뮬레이션에서 명백히 감소했으나, 실전 대전에서는 v3 단독 효과를 분리할 수 없었다 (BUG-GS-005 수정 + timeout 변경과 동시 적용되어 confounding). **v3는 "퇴보가 없다는 점에서" 채택**된 상태이며, 명확한 +α 입증은 SP4 결정론 드라이런에서 처음으로 가능해진다.

### 2.3 v3 → v3-tuned (DeepSeek 전용 분기)

19번 분석의 정량 발견 (burst thinking 56% 증가, T76 15,614 토큰, fallback 0) 을 받아 DeepSeek-only 변종이 추가됐다. 변경 항목 3가지:

| 추가 섹션 | 위치 | 의도 |
|---------|------|------|
| **# Thinking Time Budget (NEW in v3-tuned)** | Rules 직후 | "복잡한 포지션에서는 사고 시간을 충분히" — burst thinking 정당화 |
| **# Position Evaluation Criteria (NEW — 5 dimensions)** | Few-Shot 직전 | Legality / Initial Meld / Tile Count / Point Value / Residual Quality |
| **Step 6 의 "verify twice" + 복잡도 조건** | Step-by-Step | rack ≥ 10, table ≥ 3, opponent ≤ 3 → "deliberate carefully" |

**v3-tuned의 핵심 가설**: "burst thinking은 무작위 overhead가 아니라 고난이도 대응이다" 라는 가설을 프롬프트 차원에서 reinforce. 19번 §5.3 의 burst 5턴 모두 Place 성공 (T42, T46, T54, T70, T76) 이 이 가설의 직접 증거.

### 2.4 공통 코어 추출 — 4종이 모두 공유하는 부분

위 분석에서 **모든 모델·모든 변종에 공통**인 영역을 추출하면 다음 6개 블록이다.

```
[공통 코어 — v4 공유]
  1. Tile Encoding (R/B/Y/K + 1~13 + a/b + JK1/JK2)
  2. Rules
     - GROUP / RUN / SIZE / Initial Meld / tableGroups / tilesFromRack
  3. Few-Shot Examples 5건 (Draw, Run meld, Group meld, Extend, Multi-set)
  4. Common Mistakes 3건 (color dup, table missing, run gap)
  5. Pre-Submission Validation Checklist (7항목)
  6. Step-by-Step Thinking Procedure (9단계)
  7. Response Format (Draw / Place JSON 형식)
```

**공통 코어 토큰 예산**: 약 **1,400 토큰** (v3의 ~1,530 에서 일부 페르소나·난이도 텍스트를 user 프롬프트로 이관).

**이 공통 코어가 4모델 모두에서 동일해야 하는 이유**: 게임 규칙은 모델과 무관한 객관적 사실이다. "그룹은 같은 숫자 다른 색" 은 GPT 든 Ollama 든 동일하게 학습되어야 한다. 모델별 차이는 **사고하는 방식** (얼마나 길게, 어떤 형식으로) 이지 **사고하는 내용** (게임 규칙) 이 아니다.

---

## 3. 4모델 특성 매핑 — 프롬프트 설계 파라미터로 변환

### 3.1 4모델 특성 비교 표 (19번 + 17번 + 18번 종합)

| 차원 | GPT-5-mini | Claude Sonnet 4 (thinking) | DeepSeek Reasoner | Ollama qwen2.5:3b |
|------|-----------|------------------------|-----------------|----------------|
| 평균 출력 토큰 | 4,296 | 5,550 | 10,010 | ~500 |
| Place / 1M 토큰 (효율) | **64.0** (1위) | 46.2 | 32.5 | 0 |
| Place / $1 (비용 효율) | 11.3 | 3.5 | **325** (1위) | N/A (무료) |
| 평균 응답 시간 | 74s | 90s | 239s | 12s |
| p95 응답 시간 | 182s | 201s | **399s** | 25s |
| 토큰 자율 확장 (초→후반) | +10% | +19% | **+56%** | 0% |
| Place Rate (최고) | 33.3% | 33.3% | 30.8% | 0% |
| Fallback 주원인 | cost limit | WS_TIMEOUT | timeout 절단 | 능력 부재 |
| JSON 강제 방식 | `response_format: json_object` strict | tool_use / system 지시 | system 지시 + 파싱 fallback | system 지시 |
| 지시 수용성 (RLHF 기반) | **매우 높음** | 매우 높음 | 보통 | 낮음 |
| 페르소나 유지력 | 높음 | **매우 높음** | 보통 | 낮음 |

### 3.2 차원 → 프롬프트 파라미터 매핑

위 표를 4가지 프롬프트 설계 차원으로 변환한다:

#### A. `thinking_budget` (사고 토큰 상한)

| 모델 | 권장 budget | 근거 |
|------|----------:|------|
| **DeepSeek Reasoner** | **15,000** | 19번 §5.3 — Round 5 Run 3 실측 max 15,614, T76 burst 가 4 tile place 성공 |
| **Claude Sonnet 4 (thinking)** | **10,000** | 18번 §3 — budget 16K 시 $0.18/턴, 절반은 평균 사용량과 일치. 비용·성능 절충점 |
| **GPT-5-mini (reasoning.effort)** | `medium` 고정 | 17번 §3 — `low` 는 보수 회귀, `high` 는 200s 초과로 GPT 정체성 상실. medium 이 64s 평균의 정체성 |
| **Ollama qwen2.5:3b** | `0` (사용 안 함) | 19번 §2 — 평균 출력 ~500 토큰, 사고 토큰 개념 자체가 의미 없음. budget 지시는 오히려 노이즈 |
| **DashScope qwen3-235b-thinking** | **15,000** | 19번 §6 — DeepSeek 동급 가격 + thinking-only 모델, 동일 budget으로 fallback 0 가능성 높음 |

이 파라미터는 system prompt 의 자연어 텍스트뿐 아니라 **API 호출 옵션** 으로도 함께 전달한다. v4 PromptDefinition 의 `metadata.thinking_budget` 필드가 두 경로 모두를 통제한다 (§7 참조).

#### B. `evaluation_criteria` (포지션 평가 5축)

19번 §5.1 + v3-tuned §"Position Evaluation Criteria" 를 일반화한 5축:

1. **Legality** — GROUP/RUN/SIZE 규칙 충족 (hard filter, 모든 모델 필수)
2. **Initial Meld Threshold** — initialMeldDone=false 시 sum ≥ 30
3. **Tile Count Placed** — 배치 타일 수 (많을수록 승리 근접)
4. **Point Value Placed** — 배치 합산 점수 (tiebreak)
5. **Rack Residual Quality** — 배치 후 남은 랙의 미래 조합 가능성

**모델별 활용 폭**:
- **DeepSeek / DashScope thinking**: 5축 전부 적용 (사고 시간 충분)
- **Claude (thinking)**: 5축 전부 적용 + "negative split" 후반 가중치 (18번 §10 — 후반 latency 82% 증가 시 evaluation 더 정밀)
- **GPT-5-mini**: 1+2+3 만 적용 (4·5 는 토큰 추가 부담, "추론 절약" 정체성과 충돌)
- **Ollama**: 1+2 만 (3 이상은 출력 토큰 ~500 한계 초과)

#### C. `retry_discipline` (invalid move 재요청 강도)

| 모델 | 재시도 톤 | 1차 시도 후 추가 지시 |
|------|---------|------------------|
| **GPT-5-mini** | **엄격, 압축** | "Your previous response was invalid. Output exactly the JSON format. No prose." (RLHF 지시 수용성 활용) |
| **Claude Sonnet 4** | **정중, 구조적** | "Your previous response was invalid: {reason}. Re-examine using the validation checklist." (Anthropic 톤 일치) |
| **DeepSeek Reasoner** | **권장형, 시간 허용** | "Your previous response was invalid. **Take more time to verify**. Re-run the 9-step procedure carefully." (burst thinking 유도) |
| **DashScope qwen3-thinking** | DeepSeek 동일 | thinking-only 동급 운영 |
| **Ollama** | **최소화** | "Invalid. Output {action: draw}." (간단한 폴백 유도, 더 복잡한 지시는 토큰 한계 초과) |

#### D. `json_strictness` (JSON 출력 강제 메커니즘)

| 모델 | 강제 방식 | v4 system prompt 추가 문구 |
|------|---------|------------------------|
| **GPT-5-mini** | `response_format: { type: "json_object" }` (API 레벨) | "Output a single valid JSON object." (간단) |
| **Claude Sonnet 4** | tool_use 또는 system 지시 | "Respond with ONLY a JSON object. No markdown, no code blocks, no commentary." |
| **DeepSeek Reasoner** | system 지시 + `extractBestJson()` 파싱 fallback | Claude와 동일 + "Wrap your final answer in {} braces." |
| **DashScope qwen3-thinking** | system 지시 + DeepSeek 동일 fallback | DeepSeek 동일 |
| **Ollama qwen2.5:3b** | system 지시 + format 강제 (Ollama API `format: 'json'`) | "Output JSON only. Start with { and end with }." (강한 반복) |

---

## 4. 차원별 지시어 설계 — 공통 코어 + 분기

위 4 차원을 코드 형태가 아닌 **자연어 지시어** 로 변환하면 다음과 같다. v4의 핵심 설계 결정은 "**지시어를 공통 코어와 variant 두 곳 중 어디에 배치하느냐**" 다. 원칙:

- **모든 모델에 동일하게 적용되는 지시어** → 공통 코어
- **모델별 특성 차이를 반영하는 지시어** → variant

### 4.1 지시어 배치 매트릭스

| 지시어 | 공통 코어 | DeepSeek/DashScope variant | Claude variant | GPT variant | Ollama variant |
|--------|:------:|:-----------------------:|:------------:|:----------:|:------------:|
| Tile Encoding | O | | | | |
| Rules (GROUP/RUN/SIZE/Meld) | O | | | | |
| Few-Shot 5건 | O | | | | |
| Common Mistakes 3건 | O | | | | |
| Validation Checklist 7항목 | O | | | | |
| Step-by-Step 9단계 | O | | | | |
| Response Format | O | | | | |
| **Thinking Time Budget 지시문** | | O ("take your time") | O ("adaptive thinking") | | |
| **Position Evaluation 5축** | | O (전체) | O (전체) | △ (1+2+3만) | △ (1+2만) |
| **"verify twice"** | | O | | | |
| **"Output exactly the JSON format"** | | | | O (간결 강조) | |
| **"Start with { and end with }"** | | | | | O (반복) |
| **"Respect tool_use / response_format"** | | | O | O | |
| **"Negative split" 후반 가중치** | | | O | | |
| **Draw fallback 가이드** | | | | | O (적극) |

### 4.2 공통 코어 전체 텍스트 (§5) + variant 분기 (§6)

§5 와 §6 에서 본문 텍스트로 제시한다.

---

## 5. v4 공통 코어 (전체 텍스트)

> **명명 규칙**: 모든 v4 자산은 `V4_*` 접두로 통일. 기존 `V2_REASONING_*`, `V3_REASONING_*` 와 이름 충돌 없음.

```typescript
// src/ai-adapter/src/prompt/v4/v4-core.ts (신규)

export const V4_CORE_SYSTEM_PROMPT = `You are a Rummikub game AI. Respond with ONLY a valid JSON object.

# Tile Encoding (CRITICAL - understand this perfectly)
Each tile code follows the pattern: {Color}{Number}{Set}

| Component | Values                          | Meaning                            |
|-----------|----------------------------------|-------------------------------------|
| Color     | R, B, Y, K                       | Red, Blue, Yellow, Black            |
| Number    | 1, 2, 3, ..., 13                 | Face value (also = point value)     |
| Set       | a, b                             | Distinguishes duplicate tiles       |
| Jokers    | JK1, JK2                         | Wild cards (2 total)                |

Examples: R7a = Red 7 (set a), B13b = Blue 13 (set b), K1a = Black 1 (set a)
Total tiles: 4 colors x 13 numbers x 2 sets + 2 jokers = 106 tiles

IMPORTANT: The "a" or "b" suffix ONLY distinguishes duplicate tiles. It does NOT change the color.
R7a and R7b are BOTH Red (R). B5a and B5b are BOTH Blue (B).

# Rules (STRICT - Game Engine rejects ALL violations)

## GROUP Rules: Same number, DIFFERENT colors, 3-4 tiles
- Every tile in a group MUST have the SAME number
- Every tile in a group MUST have a DIFFERENT color (R, B, Y, K)
- No color can appear twice in a group
- Maximum 4 tiles per group (one per color: R, B, Y, K)

VALID GROUP examples:
  [R7a, B7a, K7a]           -> number=7 for all, colors=R,B,K (3 different) OK
  [R5a, B5b, Y5a, K5a]      -> number=5 for all, colors=R,B,Y,K (4 different) OK

INVALID GROUP examples:
  [R7a, R7b, B7a]  -> REJECTED: color R appears TWICE (ERR_GROUP_COLOR_DUP)
                      R7a and R7b are BOTH Red! The a/b suffix is NOT a color difference!
  [R7a, B5a, K7a]  -> REJECTED: numbers differ 7,5,7 (ERR_GROUP_NUMBER)
  [R7a, B7a]       -> REJECTED: only 2 tiles, need >= 3 (ERR_SET_SIZE)

## RUN Rules: Same color, CONSECUTIVE numbers, 3+ tiles
- Every tile in a run MUST have the SAME color
- Numbers must be strictly consecutive (no gaps)
- No wraparound: 13-1 is NOT allowed
- Minimum 3 tiles, maximum 13 tiles

VALID RUN examples:
  [R7a, R8a, R9a]              -> color=R, numbers=7,8,9 consecutive OK
  [B10a, B11a, B12a, B13a]     -> color=B, numbers=10,11,12,13 OK

INVALID RUN examples:
  [R7a, B8a, K9a]   -> REJECTED: different colors (run needs SAME color)
  [R7a, R9a, R10a]  -> REJECTED: gap at 8 (numbers must be consecutive)
  [R12a, R13a, R1a] -> REJECTED: wraparound 13->1 forbidden

## Size Rule: EVERY group and run must have >= 3 tiles. 2 tiles = ALWAYS INVALID.

## Initial Meld Rule (when initialMeldDone=false):
- Sum of tile numbers in your placed sets must be >= 30 points
- Use ONLY your rack tiles (you CANNOT touch or use table tiles)
- Each tile's number IS its point value: R10a = 10 pts, B3a = 3 pts
- VALID: R10a + R11a + R12a = 33 pts >= 30
- REJECTED: R1a + R2a + R3a = 6 pts < 30

## tableGroups = COMPLETE final state of the ENTIRE table after your move
- You MUST include ALL existing table groups (even unchanged ones)
- Then add your new groups
- If you omit any existing group -> "tile loss" -> REJECTED
- COUNTING CHECK: if Current Table has N groups, your tableGroups must have >= N entries

## tilesFromRack = ONLY tiles YOU placed from YOUR hand (not table tiles)

# Few-Shot Examples (study carefully)

## Example 1: Draw (no valid combination)
My rack: [R5a, B7b, K3a, Y11a]
Table: (empty), initialMeldDone=false
Analysis: no 3+ same-number or same-color consecutive
-> {"action":"draw","reasoning":"no valid group or run with sum >= 30"}

## Example 2: Place single run (initial meld)
My rack: [R10a, R11a, R12a, B5b, K3a]
Table: (empty), initialMeldDone=false
Analysis: R10a,R11a,R12a = Red run 10-11-12, sum=33 >= 30
-> {"action":"place","tableGroups":[{"tiles":["R10a","R11a","R12a"]}],"tilesFromRack":["R10a","R11a","R12a"],"reasoning":"Red run 10-11-12, sum=33 for initial meld"}

## Example 3: Place group (initial meld)
My rack: [R10a, B10b, K10a, Y2a, R3b]
Table: (empty), initialMeldDone=false
Analysis: R10a,B10b,K10a = Group of 10s (R,B,K), sum=30 >= 30
-> {"action":"place","tableGroups":[{"tiles":["R10a","B10b","K10a"]}],"tilesFromRack":["R10a","B10b","K10a"],"reasoning":"Group of 10s (R,B,K), sum=30"}

## Example 4: Extend existing table group
My rack: [R6a, B2a]
Table: Group1=[R3a,R4a,R5a], Group2=[B7a,Y7a,K7a], initialMeldDone=true
Analysis: R6a extends Group1 -> Red run 3-4-5-6
-> {"action":"place","tableGroups":[{"tiles":["R3a","R4a","R5a","R6a"]},{"tiles":["B7a","Y7a","K7a"]}],"tilesFromRack":["R6a"],"reasoning":"extend Red run with R6a, keep Group2"}

## Example 5: Multiple sets at once
My rack: [R10a, R11a, R12a, B7a, Y7b, K7a, R1a]
Table: (empty), initialMeldDone=false
Analysis: Run R10-11-12 (33pts) + Group 7s B,Y,K (21pts) = 54pts, 6 tiles placed
-> {"action":"place","tableGroups":[{"tiles":["R10a","R11a","R12a"]},{"tiles":["B7a","Y7b","K7a"]}],"tilesFromRack":["R10a","R11a","R12a","B7a","Y7b","K7a"],"reasoning":"Red run 33pts + Group of 7s 21pts = 54pts"}

# Common Mistakes from Real Games (NEVER repeat)

## Mistake 1: Duplicate color in group (ERR_GROUP_COLOR_DUP)
WRONG: [R7a, R7b, B7a] — R7a and R7b are BOTH Red. Color R appears twice -> REJECTED.

## Mistake 2: Omitting existing table groups (ERR_TABLE_TILE_MISSING)
WRONG: Table has 5 groups. You extend Group1 and submit only Group1. 4 groups missing -> REJECTED.
CORRECT: Submit ALL 5 groups (Group1 extended + Group2~5 unchanged).

## Mistake 3: Gap in run (ERR_RUN_SEQUENCE)
WRONG: [B5a, B7a, B8a] — gap at 6 -> REJECTED.

# Pre-Submission Validation Checklist (verify ALL before output)
1. Each set in tableGroups has >= 3 tiles
2. Each run: SAME color + CONSECUTIVE numbers (no gaps, no wraparound)
3. Each group: SAME number + ALL DIFFERENT colors (R7a and R7b are BOTH R!)
4. tilesFromRack contains ONLY tiles from "My Rack Tiles"
5. Count tableGroups: must be >= number shown in "Current Table"
6. If initialMeldDone=false: sum >= 30, no table tiles used
7. Every tile code matches {Color}{Number}{Set} format

# Step-by-Step Thinking Procedure
1. List ALL rack tiles, grouped by color
2. Find ALL possible groups (for each number, check 3+ different colors — remember R7a/R7b are SAME color)
3. Find ALL possible runs (for each color, find 3+ consecutive)
4. If initialMeldDone=false: keep only combinations with sum >= 30
5. If initialMeldDone=true: also check extensions of existing table groups
6. Compare candidates and pick the one that maximizes tiles placed
7. If no valid combination: choose "draw"
8. Build JSON: include ALL existing table groups + your new groups
9. Run the validation checklist before outputting

# Response Format (output ONLY this JSON, nothing else)

Draw:
{"action":"draw","reasoning":"reason"}

Place:
{"action":"place","tableGroups":[{"tiles":["R10a","R11a","R12a"]}],"tilesFromRack":["R10a","R11a","R12a"],"reasoning":"reason"}

IMPORTANT: Output raw JSON only. No markdown, no code blocks, no explanation text.`;
```

**공통 코어 토큰 견적**: ~1,400 토큰 (v3의 ~1,530 에서 -130. Common Mistakes 3건을 텍스트 압축, Few-Shot 5건은 보존).

---

## 6. v4 모델별 variant (4종 분기)

각 variant는 공통 코어 뒤에 **append** 되는 추가 섹션이다. 공통 코어를 절대 수정하지 않고, 끝에 모델별 지시어만 추가한다 — 이로써 "공통 코어가 모든 모델에서 동일" 이라는 불변 조건이 코드 차원에서 보장된다.

### 6.1 Variant: `v4-thinking-deep` (DeepSeek + DashScope qwen3-thinking)

```typescript
// src/ai-adapter/src/prompt/v4/v4-thinking-deep.ts

import { V4_CORE_SYSTEM_PROMPT } from './v4-core';

export const V4_THINKING_DEEP_VARIANT = `

# Thinking Time Budget (Deep Reasoning Models)

You have a generous thinking budget. This is intentional — use it.

Empirical data from prior games shows complex positions (many tiles, multiple
existing groups, near-endgame pressure) genuinely benefit from deeper analysis.
The hardest turns needed ~2x the thinking tokens of early turns to find the
correct play, and they rewarded that extra effort with higher success rates.

Guidance:
- For SIMPLE positions (few rack tiles, obvious draw/place), decide quickly.
- For COMPLEX positions (many candidates, potential rearrangements, tight initial
  meld, opponent near-winning), take your time. Enumerate, compare, verify.
- Rushing is the most expensive mistake: an invalid response consumes retries and
  may fall back to a draw, losing the entire turn's potential.
- Better to think twice and answer once than to guess and retry.

# Position Evaluation Criteria (apply in Step 6 of the procedure)

Before committing to a move, score each candidate on these 5 dimensions:

1. **Legality** — Does every set satisfy GROUP/RUN/SIZE rules? (hard filter)
2. **Initial Meld Threshold** — If initialMeldDone=false, does sum >= 30?
3. **Tile Count Placed** — How many rack tiles leave your hand? (more is usually better)
4. **Point Value Placed** — Total point value placed? (higher is better for tiebreaks)
5. **Rack Residual Quality** — After placing, do remaining rack tiles still form
   future playable combinations? Avoid leaving orphan tiles.

Tiebreak order (when multiple legal plays exist): Count -> Point Value -> Residual Quality.

# Final Discipline
Verify twice. Rushing is costly. If still uncertain after the validation checklist,
respond: {"action":"draw","reasoning":"insufficient certainty after deliberation"}.
`;

export const V4_THINKING_DEEP_SYSTEM_PROMPT =
  V4_CORE_SYSTEM_PROMPT + V4_THINKING_DEEP_VARIANT;
```

**대상 모델**: `deepseek-reasoner`, `qwen3-235b-a22b-thinking-2507`, `qwen3-next-80b-a3b-thinking`
**토큰**: ~1,400 + ~250 = **~1,650**
**API 메타데이터**: `thinking_budget: 15000`, `temperature: 0.3` (deep reasoning은 낮은 온도)

### 6.2 Variant: `v4-thinking-claude` (Claude Sonnet 4 extended thinking)

```typescript
// src/ai-adapter/src/prompt/v4/v4-thinking-claude.ts

import { V4_CORE_SYSTEM_PROMPT } from './v4-core';

export const V4_THINKING_CLAUDE_VARIANT = `

# Adaptive Thinking Mode (Claude Sonnet 4)

You have extended thinking enabled. Use it adaptively based on game phase:

- **Early game (turns 1-26)**: Observe the board. If your initial meld threshold
  is not yet achievable, it is acceptable to draw and accumulate. Quality of
  later placements matters more than quantity of early ones.
- **Mid game (turns 27-54)**: Begin actively placing. Look for combinations that
  set up future moves.
- **Late game (turns 55-80)**: This is when complex rearrangements and adaptive
  thinking pay off the most. Spend additional thinking budget on rearrangement
  candidates: extend existing groups, split-and-recombine, joker repositioning.

# Position Evaluation Criteria (apply in Step 6 of the procedure)

Score each candidate on 5 dimensions:

1. **Legality** — GROUP/RUN/SIZE rules satisfied
2. **Initial Meld Threshold** — sum >= 30 if initialMeldDone=false
3. **Tile Count Placed** — more is better
4. **Point Value Placed** — higher is better for tiebreaks
5. **Rack Residual Quality** — preserve future combination potential

Tiebreak: Count -> Point Value -> Residual Quality.

# Output Discipline
Respond with ONLY a JSON object. No markdown, no code blocks, no preamble,
no explanation outside the "reasoning" field. Anthropic tool-use compatible
JSON only.
`;

export const V4_THINKING_CLAUDE_SYSTEM_PROMPT =
  V4_CORE_SYSTEM_PROMPT + V4_THINKING_CLAUDE_VARIANT;
```

**대상 모델**: `claude-sonnet-4-*` (extended thinking 활성)
**토큰**: ~1,400 + ~280 = **~1,680**
**API 메타데이터**: `thinking.budget_tokens: 10000`, `temperature: 0.5` (Claude는 약간 높음 유지로 adaptive 발현)

### 6.3 Variant: `v4-strict-json` (GPT-5-mini)

```typescript
// src/ai-adapter/src/prompt/v4/v4-strict-json.ts

import { V4_CORE_SYSTEM_PROMPT } from './v4-core';

export const V4_STRICT_JSON_VARIANT = `

# Output Format (Strict JSON Mode)

You are operating with response_format: json_object. The API will reject any
response that is not a single, valid JSON object. Therefore:

- Output exactly one JSON object. No prose. No prefix. No suffix.
- The "reasoning" field is the ONLY place for natural language explanation,
  and it must be a single short sentence (under 30 words).
- Do not produce alternative responses or multiple candidates.

# Efficient Reasoning (GPT-5-mini)

You are a small reasoning model optimized for efficient inference. Apply these
constraints to keep your reasoning tight:

1. **Legality first** — Filter candidates by GROUP/RUN/SIZE rules immediately.
2. **Initial Meld math** — If initialMeldDone=false, compute sum >= 30 as the
   second hard filter. Skip combinations failing this.
3. **Tile Count maximization** — Among legal candidates, pick the one placing
   the most tiles. Stop at the first clear winner; do not exhaustively enumerate
   tiebreaks beyond Count.

Do not spend tokens on:
- Speculative rearrangements unless an obvious extension is visible
- Adversarial reasoning about opponent intentions
- Multiple alternative explanations in the "reasoning" field

# Final Output
A single JSON object. Start with { and end with }. Nothing else.
`;

export const V4_STRICT_JSON_SYSTEM_PROMPT =
  V4_CORE_SYSTEM_PROMPT + V4_STRICT_JSON_VARIANT;
```

**대상 모델**: `gpt-5-mini`, future `gpt-5`, `o3-mini` (RLHF 지시 수용 강한 모델)
**토큰**: ~1,400 + ~220 = **~1,620**
**API 메타데이터**: `response_format: { type: "json_object" }`, `reasoning.effort: "medium"`, `temperature: 0.3`

### 6.4 Variant: `v4-minimal` (Ollama qwen2.5:3b 및 작은 로컬 모델)

```typescript
// src/ai-adapter/src/prompt/v4/v4-minimal.ts

// Note: v4-minimal는 공통 코어를 그대로 사용하지 않는다.
// 작은 모델은 1,400 토큰의 system prompt를 처리하면서 game state 처리에 실패한다.
// 따라서 공통 코어에서 압축 가능한 부분만 발췌한다.

export const V4_MINIMAL_CORE_EXCERPT = `You are a Rummikub game AI. Output ONLY a JSON object. No prose.

# Tiles
{Color}{Number}{Set}: Color=R/B/Y/K, Number=1-13, Set=a/b. Jokers=JK1,JK2.
R7a and R7b are BOTH Red. Same color = same letter.

# Rules
- GROUP: same number, DIFFERENT colors, 3-4 tiles. R7a+R7b is INVALID (both Red).
- RUN: same color, CONSECUTIVE numbers, 3+ tiles. No 13->1 wraparound.
- Size: every set must have >= 3 tiles. Never 2.
- Initial Meld (initialMeldDone=false): sum of placed tile values >= 30. Rack tiles only.
- tableGroups must include ALL existing groups + your new ones.
- tilesFromRack: only your rack tiles.

# Examples
Draw: {"action":"draw","reasoning":"no valid set"}
Place run: {"action":"place","tableGroups":[{"tiles":["R10a","R11a","R12a"]}],"tilesFromRack":["R10a","R11a","R12a"],"reasoning":"R10-12 sum=33"}

# Output
Start with { end with }. No markdown. No code blocks. JSON only.

# Procedure
1. Find any valid group (3+ same number, all different colors)
2. Find any valid run (3+ same color, consecutive)
3. If initialMeldDone=false, sum must be >= 30
4. If found: action=place. If not: action=draw.

If unsure, draw.`;

export const V4_MINIMAL_SYSTEM_PROMPT = V4_MINIMAL_CORE_EXCERPT;
```

**대상 모델**: `qwen2.5:3b`, future `gemma3:4b`, `llama3.2:3b` (소형 로컬)
**토큰**: ~550 (공통 코어의 40%)
**API 메타데이터**: `format: "json"` (Ollama 네이티브), `temperature: 0.7` (작은 모델은 다양성 약간 부여)

**중요**: v4-minimal 은 공통 코어를 그대로 쓰지 않는다. 이 결정의 근거는 19번 §2.1 — Ollama 평균 출력 ~500 토큰. 1,400 토큰의 system + ~300 토큰의 user 를 받으면 출력 여유가 200 토큰 미만이 되어 JSON 자체를 못 내는 사례가 다수 관측되었다. **공통 코어 = "모든 모델에 동일"** 원칙의 유일한 예외이며, 이 예외는 토큰 한계라는 물리적 제약에서 비롯된다. v4-minimal 도 공통 코어와 **동일한 게임 규칙** 을 다른 표현으로 압축 전달한다 (정보 손실 없음).

### 6.5 Variant 선택 매트릭스 (모델 → variant)

| 모델 ID | Variant | thinking_budget | response_format | temperature |
|--------|---------|---------------:|:---------------:|----------:|
| `deepseek-reasoner` | `v4-thinking-deep` | 15000 | (system) | 0.3 |
| `qwen3-235b-a22b-thinking-2507` | `v4-thinking-deep` | 15000 | (system) | 0.3 |
| `qwen3-next-80b-a3b-thinking` | `v4-thinking-deep` | 15000 | (system) | 0.3 |
| `claude-sonnet-4-20250514` (thinking) | `v4-thinking-claude` | 10000 | tool_use | 0.5 |
| `gpt-5-mini` | `v4-strict-json` | (effort=medium) | `json_object` | 0.3 |
| `o3-mini` (future) | `v4-strict-json` | (effort=medium) | `json_object` | 0.3 |
| `qwen2.5:3b` | `v4-minimal` | (n/a) | `format=json` | 0.7 |
| `gemma3:4b` (future) | `v4-minimal` | (n/a) | `format=json` | 0.7 |

---

## 7. SP3 구현용 JSON 스키마 — PromptRegistry 등록 형식

SP3 (`#20`) 이 PromptRegistry 를 구현할 때 사용할 v4 PromptDefinition 스키마. 본 스키마는 SP2 (`#19`) 의 버저닝 아키텍처와 조율되어야 한다. 본 §은 SP1 측 제안일 뿐, SP2 의 최종 결정에 따라 일부 필드명이 변경될 수 있다.

### 7.1 PromptDefinition 인터페이스

```typescript
// src/ai-adapter/src/prompt/registry/prompt-definition.ts (신규, SP3)

export type PromptVariant =
  | 'v4-thinking-deep'    // DeepSeek, DashScope thinking-only
  | 'v4-thinking-claude'  // Claude Sonnet 4 extended thinking
  | 'v4-strict-json'      // GPT-5-mini and other RLHF strict-JSON models
  | 'v4-minimal'          // Ollama qwen2.5:3b and small local models
  // legacy (kept for A/B regression baseline only — DO NOT use in new code)
  | 'v3-reasoning'
  | 'v3-tuned-deepseek'
  | 'v2-reasoning';

export type PromptModelTarget =
  | 'openai'
  | 'claude'
  | 'deepseek'
  | 'dashscope'
  | 'ollama'
  | '*';   // wildcard, applies if no specific match

export interface PromptMetadata {
  /** Self-imposed thinking token cap. 0 means N/A (non-reasoning model). */
  thinking_budget?: number;
  /** Suggested temperature. Provider-side default if undefined. */
  temperature?: number;
  /** Provider-specific JSON enforcement mode. */
  json_strictness?: 'strict' | 'tool_use' | 'system_only' | 'native_format';
  /** Estimated token count of the system prompt itself (input tokens). */
  estimated_input_tokens?: number;
  /** Set true when the variant DOES NOT use V4_CORE_SYSTEM_PROMPT verbatim. */
  uses_compressed_core?: boolean;
  /** Free-form notes, surfaced in dashboard for traceability. */
  notes?: string;
}

export interface PromptDefinition {
  /** Unique identifier including version and variant. e.g. "v4-thinking-deep@4.0.0" */
  id: string;
  /** Semver. Patch bump for typo fixes, minor bump for additive sections, major bump for structural change. */
  version: string;
  /** Variant family. */
  variant: PromptVariant;
  /** Target model family. Used by registry to select prompt for an adapter. */
  model: PromptModelTarget;
  /** The actual system prompt text. */
  systemPrompt: string;
  /** Function that builds the user prompt from MoveRequest. */
  buildUserPrompt: (request: MoveRequestDto) => string;
  /** Function that builds the retry prompt (used after invalid response). */
  buildRetryPrompt: (
    request: MoveRequestDto,
    errorReason: string,
    attemptNumber: number,
  ) => string;
  /** Metadata used by adapters and dashboard. */
  metadata: PromptMetadata;
  /** Created/updated timestamps for audit. */
  createdAt: string;
  updatedAt: string;
}
```

### 7.2 v4 PromptDefinition 등록 예시 (registry seed data)

```typescript
// src/ai-adapter/src/prompt/registry/v4.seed.ts (신규, SP3)

import { PromptDefinition } from './prompt-definition';
import { V4_THINKING_DEEP_SYSTEM_PROMPT } from '../v4/v4-thinking-deep';
import { V4_THINKING_CLAUDE_SYSTEM_PROMPT } from '../v4/v4-thinking-claude';
import { V4_STRICT_JSON_SYSTEM_PROMPT } from '../v4/v4-strict-json';
import { V4_MINIMAL_SYSTEM_PROMPT } from '../v4/v4-minimal';
import { buildV4UserPrompt, buildV4RetryPrompt } from '../v4/v4-user-prompt';
import { buildV4MinimalUserPrompt, buildV4MinimalRetryPrompt } from '../v4/v4-minimal-user-prompt';

export const V4_SEED: PromptDefinition[] = [
  {
    id: 'v4-thinking-deep@4.0.0',
    version: '4.0.0',
    variant: 'v4-thinking-deep',
    model: '*',  // applied to deepseek + dashscope (registry routes by model.family)
    systemPrompt: V4_THINKING_DEEP_SYSTEM_PROMPT,
    buildUserPrompt: buildV4UserPrompt,
    buildRetryPrompt: buildV4RetryPrompt,
    metadata: {
      thinking_budget: 15000,
      temperature: 0.3,
      json_strictness: 'system_only',
      estimated_input_tokens: 1650,
      uses_compressed_core: false,
      notes: 'DeepSeek Reasoner Round 5 Run 3 burst thinking analysis baseline. T76 max 15,614 tokens.',
    },
    createdAt: '2026-04-14T00:00:00Z',
    updatedAt: '2026-04-14T00:00:00Z',
  },
  {
    id: 'v4-thinking-claude@4.0.0',
    version: '4.0.0',
    variant: 'v4-thinking-claude',
    model: 'claude',
    systemPrompt: V4_THINKING_CLAUDE_SYSTEM_PROMPT,
    buildUserPrompt: buildV4UserPrompt,
    buildRetryPrompt: buildV4RetryPrompt,
    metadata: {
      thinking_budget: 10000,
      temperature: 0.5,
      json_strictness: 'tool_use',
      estimated_input_tokens: 1680,
      uses_compressed_core: false,
      notes: 'Claude negative-split late-game pattern. WS_TIMEOUT mitigation via shorter thinking budget.',
    },
    createdAt: '2026-04-14T00:00:00Z',
    updatedAt: '2026-04-14T00:00:00Z',
  },
  {
    id: 'v4-strict-json@4.0.0',
    version: '4.0.0',
    variant: 'v4-strict-json',
    model: 'openai',
    systemPrompt: V4_STRICT_JSON_SYSTEM_PROMPT,
    buildUserPrompt: buildV4UserPrompt,
    buildRetryPrompt: buildV4RetryPrompt,
    metadata: {
      temperature: 0.3,
      json_strictness: 'strict',
      estimated_input_tokens: 1620,
      uses_compressed_core: false,
      notes: 'GPT-5-mini reasoning.effort=medium. Multirun Run 1+2 33.3% baseline.',
    },
    createdAt: '2026-04-14T00:00:00Z',
    updatedAt: '2026-04-14T00:00:00Z',
  },
  {
    id: 'v4-minimal@4.0.0',
    version: '4.0.0',
    variant: 'v4-minimal',
    model: 'ollama',
    systemPrompt: V4_MINIMAL_SYSTEM_PROMPT,
    buildUserPrompt: buildV4MinimalUserPrompt,
    buildRetryPrompt: buildV4MinimalRetryPrompt,
    metadata: {
      temperature: 0.7,
      json_strictness: 'native_format',
      estimated_input_tokens: 550,
      uses_compressed_core: true,
      notes: 'qwen2.5:3b ~500 token output budget. Compressed core required to avoid output truncation.',
    },
    createdAt: '2026-04-14T00:00:00Z',
    updatedAt: '2026-04-14T00:00:00Z',
  },
];
```

### 7.3 Registry lookup 의미론 (SP3 측 가이드)

PromptRegistry 가 어댑터로부터 호출될 때의 lookup 우선순위 (SP1 측 권장):

```
PromptRegistry.resolve(modelFamily: PromptModelTarget, version?: string): PromptDefinition

1. version 명시 → 정확 매칭 (e.g. "v4-thinking-deep@4.0.0")
2. version 미지정 → 해당 modelFamily 의 default variant 의 latest (semver) 반환
3. 매칭 실패 → model="*" 의 default variant 반환 (fallback)
4. fallback 도 실패 → throw (어댑터에서 catch 후 v3-reasoning 으로 회귀)
```

Default variant 매핑 (registry config):

```typescript
const DEFAULT_VARIANT_BY_MODEL: Record<PromptModelTarget, PromptVariant> = {
  deepseek: 'v4-thinking-deep',
  dashscope: 'v4-thinking-deep',
  claude: 'v4-thinking-claude',
  openai: 'v4-strict-json',
  ollama: 'v4-minimal',
  '*': 'v4-thinking-deep',  // unknown 모델은 가장 보수적 (긴) variant 로 fallback
};
```

**비고**: SP2 가 commit-queue 모델 (PromptRegistry 가 git commit 처럼 immutable + history 추적) 을 채택할 경우, 위 스키마의 `version` 필드를 `commitHash` 로 대체할 수 있다. 본 SP1 문서는 semver 모델을 가정하나, SP2 의 결정에 양보 가능.

---

## 8. v3 → v4 진화 매핑 표 (각 변경점 근거)

| # | 항목 | v3 (현재) | v4 (제안) | 근거 문서/데이터 |
|---:|------|---------|---------|----------------|
| 1 | **변종 통합** | 3변종 (v2/v3/v3-tuned) 코드 import 토글 | 4 variant 가 PromptRegistry 통합 | §1.2 부채 진단 (이 문서) |
| 2 | **공통 코어 추출** | 변종마다 1,200~1,750 토큰 본문 복제 | V4_CORE_SYSTEM_PROMPT 단일 소스 + variant append | §2.4 (이 문서) |
| 3 | **Thinking budget 명시화** | DeepSeek v3-tuned 만 자연어 텍스트 | 4 variant 모두 자연어 + metadata.thinking_budget API 옵션 동시 전달 | 19번 §6, 18번 §3 |
| 4 | **Position Eval 5축** | DeepSeek v3-tuned 만 적용 | thinking-deep + thinking-claude 적용, strict-json 은 1+2+3, minimal 은 1+2 | 19번 §5, 17번 §11 |
| 5 | **Negative split (Claude)** | 미반영 | v4-thinking-claude 의 "Adaptive Thinking Mode" 섹션 | 18번 §4.2, §10 |
| 6 | **JSON strictness 분기** | 모두 system 지시 의존 | strict-json 은 response_format 명시, claude 는 tool_use, ollama 는 format=json | 17번 §3, 18번 §1 |
| 7 | **Ollama 토큰 압축** | v3 (1,530 토큰) 그대로 (legacy persona.templates 한국어 ~3,000 토큰 사용) | v4-minimal (550 토큰) 별도 분기 | 19번 §2.1 (Ollama ~500 출력) |
| 8 | **Common Mistakes 압축** | 3건 상세 텍스트 (~200 토큰) | 3건 1줄씩 (~80 토큰) | v4 공통 코어 토큰 절약 (-130) |
| 9 | **Persona·Difficulty 분리** | system prompt 에 일부 결합 (legacy persona.templates) | system prompt 에서 분리, user prompt 로 이관 | persona.templates.ts 는 legacy fallback 으로만 유지 |
| 10 | **Retry discipline 분기** | 모두 동일 텍스트 (`prompt-builder.service.ts::buildRetryUserPrompt`) | 4 variant 별 톤 차별 (§3.2 C) | 17번 §11 (GPT 분산 작음), 19번 §4 (DeepSeek "사고 시간 부족"), 18번 §8 (Claude WS 취약) |
| 11 | **Metadata 노출** | 코드 import 시점 의존, 게임 메타데이터에 미기록 | PromptDefinition 에 명시, 결과 로그에 prompt_id 기록 | §7 (이 문서), SP3 의무 |
| 12 | **Model wildcard** | 어댑터별 import 하드코딩 | PromptModelTarget = '*' fallback 지원 | §7.3 (이 문서) |

### 8.1 보존 항목 (v3 에서 그대로 이어받는 강점)

| 항목 | v3 보존 이유 |
|------|------------|
| **Tile Encoding 표 + a/b 강조** | ERR_GROUP_COLOR_DUP 의 1차 방어선. v3 에서 추가되어 효과 입증. |
| **Few-Shot 5건** | DeepSeek 5%→30.8% 도약의 핵심 (Round 4 검증). |
| **Validation Checklist 7항목** | 자기 검증 절차의 표준. v2 부터 누적된 자산. |
| **Step-by-Step 9단계** | 사고 절차 시연. RL/SFT 모델 모두에 효과적. |
| **Common Mistakes 3건** | v3 실증 (ERR_GROUP_COLOR_DUP, ERR_TABLE_TILE_MISSING, ERR_RUN_SEQUENCE). |
| **buildV3UserPrompt 의 동적 N entries 강조** | ERR_TABLE_TILE_MISSING 방지의 핵심. |

### 8.2 폐기 항목 (v3 에서 제거)

| 항목 | 폐기 이유 |
|------|---------|
| **한국어 persona.templates::BASE_SYSTEM_PROMPT (3,000 토큰)** | v2 영문 전환 후 더 이상 가치 없음. legacy fallback 으로만 잔존. v4 정착 후 Sprint 7 에서 삭제 권장. |
| **`USE_V2_PROMPT` 환경변수** | PromptRegistry 가 대체. 환경변수 토글 → registry lookup 으로 일원화. |
| **`DEEPSEEK_PROMPT_VERSION` 환경변수** | 동일. variant 선택은 registry 가 처리. |
| **adapter 별 import (`import { V2_REASONING_SYSTEM_PROMPT }`)** | adapter 는 `promptRegistry.resolve(model)` 만 호출. 직접 import 금지. |

---

## 9. 알려진 미해결 사항과 SP4 결정론 드라이런 검증 후보

본 v4 설계는 **실제 LLM 호출 없이** 도출됐다 (자율 실행 원칙 준수, API 비용 보존). 따라서 다음 가설은 SP4 (`#21`) 결정론 드라이런과 SP5 (`#22`) 베이스라인 멀티런에서 처음으로 실증된다.

| # | 가설 | 검증 방법 (SP4/SP5) |
|---:|------|------------------|
| H1 | v4-thinking-deep 은 DeepSeek 에서 v3-tuned 와 동등 또는 +α | DeepSeek 동일 시드 multirun (v3-tuned vs v4-thinking-deep), Place Rate 비교 |
| H2 | v4-thinking-claude 의 "Negative split" 명시 → Claude 후반 Place Rate 의 분산 감소 | Claude multirun 3회, T55~T80 구간 Place Rate 표준편차 계산 |
| H3 | v4-strict-json 의 압축은 GPT-5-mini Place Rate 를 떨어뜨리지 않음 | GPT multirun (v3 vs v4-strict-json) Place Rate 비교 |
| H4 | v4-minimal 의 압축 (1,400 → 550 토큰) 은 Ollama 출력 truncation 을 줄임 | Ollama 단일 80턴 게임에서 JSON 파싱 성공률 측정 |
| H5 | v4 통합 후 game result 메타데이터의 prompt_id 가 dashboard 에 노출되어 추적성 ↑ | 대시보드에 prompt_id 컬럼 추가, 1주 사용 후 분류 정확도 확인 |
| H6 | v3-tuned 의 "Position Evaluation 5축" 효과는 fall back 0 의 핵심 원인 중 하나 | v4-thinking-deep 에서 5축 절을 빼고 burst thinking 만 남긴 ablation variant 비교 |

---

## 10. 결론 — v4 가 해결하는 것과 남기는 것

### 10.1 해결

1. **변종 폭발의 종결**. 4 variant 가 단일 PromptRegistry 에 등록되어 코드 import 토글이 사라진다.
2. **모델별 특성 반영**. thinking_budget, evaluation_criteria, retry_discipline, json_strictness 4 차원이 variant 별로 차별화된다.
3. **공통 코어 보존**. 게임 규칙은 단일 소스. 규칙 변경 시 1곳만 수정하면 모든 variant 에 전파.
4. **추적성 회복**. PromptDefinition 의 id/version 이 게임 메타데이터에 기록되어, 대시보드에서 어떤 프롬프트가 어떤 결과를 냈는지 즉시 식별 가능.
5. **Ollama 토큰 한계 대응**. v4-minimal 이 1,400 → 550 토큰 압축으로 출력 여유 확보.

### 10.2 남기는 것 (Sprint 6 후반 및 Sprint 7 후속)

1. **SP3 PromptRegistry 구현** (#20) — 본 §7 의 스키마 + §6 의 4 variant 파일 생성.
2. **SP4 결정론 드라이런** (#21) — §9 의 H1~H6 가설 검증 프레임워크.
3. **SP5 v4 베이스라인 멀티런** (#22) — 4모델 × v4 variant 각 3회 실측.
4. **legacy persona.templates 폐기** — Sprint 7 에서 v4 정착 확인 후 한국어 BASE_SYSTEM_PROMPT 삭제.
5. **v4-thinking-deep ablation** (H6) — Sprint 6 후반 또는 Sprint 7.
6. **DashScope qwen3-thinking 의 thinking_budget 실측** — DashScope 어댑터 동작 확인 후 v4-thinking-deep 의 budget=15000 이 적정한지 재조정.

### 10.3 한 줄 요약

> **v4 = "공통 코어 (게임 규칙 1,400 토큰)" + "4개 variant (모델별 차원 200~280 토큰)" + "PromptRegistry (id/version 추적)"**
>
> v3 까지의 4종 변종을 1개 코어 + 4개 variant 로 정돈하고, 19번/17번/18번 분석에서 정량 입증된 모델별 차이를 4 차원 지시어로 변환했다. 실제 LLM 호출 없이 설계만으로 작성되었으며, SP4/SP5 가 가설 H1~H6 을 실증한다.

---

## 부록 A. 본 설계 문서의 자율 결정 사항 기록 (audit trail)

team-lead 의 ABSOLUTE AUTONOMY DIRECTIVE 에 따라 본 문서는 다음 7 가지를 자율 결정했다. 향후 검토 시 근거 추적 용도.

| # | 결정 사항 | 자율 선택 | 대안 | 근거 |
|---:|---------|---------|------|------|
| 1 | variant 명명 규칙 | `v4-{변종이름}` (snake-case 영문) | `v4.0.0-deep` semver + suffix | 가독성 + grep 친화성 + 코드 import 명료성 |
| 2 | DeepSeek 와 DashScope 의 variant 통합 | 동일한 `v4-thinking-deep` 사용 | 별도 `v4-deepseek` / `v4-dashscope` 분리 | 19번 §3 — 동급 가격대 thinking-only 모델로서 전략 동등. 분리 시 코드 중복만 증가 |
| 3 | Ollama variant 의 공통 코어 비사용 | v4-minimal 별도 압축 코어 | 공통 코어 유지 + Ollama 만 truncation 감수 | 19번 §2.1 — 출력 ~500 토큰 한계가 물리적 제약 |
| 4 | thinking_budget 기본값 | DeepSeek/DashScope 15000, Claude 10000 | 모두 동일 12000 | 19번 §6 (DeepSeek 실측 max 15614) + 18번 §3 (Claude 16000 = $0.18/턴 비용 부담) |
| 5 | GPT 의 reasoning.effort | `medium` 고정 | adaptive (low → high) | 17번 §3 — medium 이 GPT 정체성. low 는 보수, high 는 DeepSeek 화 |
| 6 | retry_discipline 차별화 | 4 variant 별 톤 차이 | 모두 동일한 단호한 톤 | 19번 §4 (DeepSeek timeout) vs 18번 §8 (Claude WS) vs 17번 §8 (GPT cost) — 실패 원인이 다르므로 재시도 처방도 달라야 함 |
| 7 | semver vs commitHash | 본 SP1 은 semver, SP2 결정에 양보 | commitHash 를 SP1 시점에 고정 | SP2 가 commit-queue 채택 여부를 아직 결정 못 함. SP1 은 단순한 semver 로 시작하고 SP2 결과 수용 |

이 7 가지 결정 모두 **사용자 또는 team-lead 에게 확인을 요청하지 않았으며**, 본 문서 작성 중 자율적으로 내렸다. 각 결정의 근거는 위 표에 명시되어 있어, 향후 SP3~SP5 진행 중 재검토가 필요한 경우 근거 문서로 즉시 회귀 가능하다.

---

## 부록 B. Diff 요약 — v3 vs v4 (라인 단위)

| 영역 | v3 (라인 수) | v4 공통 코어 | 변화 |
|------|----------:|----------:|------|
| Tile Encoding | 14 | 14 | 동일 |
| GROUP/RUN/SIZE Rules | 38 | 36 | -2 (예시 1줄 압축) |
| Initial Meld | 7 | 6 | -1 |
| tableGroups + tilesFromRack | 8 | 8 | 동일 |
| Few-Shot 5건 | 30 | 30 | 동일 |
| Common Mistakes | 18 | 6 | **-12** (3건 1줄씩) |
| Validation Checklist | 14 | 11 | -3 (압축) |
| Step-by-Step | 18 | 13 | -5 (subitem 일부 제거) |
| Response Format | 8 | 8 | 동일 |
| **합계** | **155** | **132** | **-23 라인** (~15% 압축) |

**v4 variant 추가 라인** (variant 1개당):
- v4-thinking-deep: +28 라인
- v4-thinking-claude: +30 라인
- v4-strict-json: +25 라인
- v4-minimal: 별도 코어 (45 라인 압축본)

**SP3 구현 시 신규 파일 수**: 6개 (v4-core.ts + 4 variants + v4-user-prompt.ts).
**SP3 수정 파일 수**: 5개 (4 어댑터 + base.adapter.ts 의존성 제거 + prompt-builder.service.ts 폐기 또는 PromptRegistry 위임).
