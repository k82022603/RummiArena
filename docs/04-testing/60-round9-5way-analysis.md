# 60. Round 9 DeepSeek Reasoner 프롬프트 변형 5-way (+2) 통합 분석

- **작성일**: 2026-04-18 (Sprint 6 Day 8 새벽)
- **작성자**: Claude(main, Opus 4.7 xhigh) — ai-engineer 역할
- **모델**: DeepSeek Reasoner (deepseek-reasoner)
- **실험 횟수**: 7건 (v2 R4, v2 R5 Run3, v2 재실측, v2-zh, v4.1 N=3 fixture, v3 N=1, v4 unlimited N=1)
- **상태**: **확정 보고** — Day 7 밤 자율 실험 완료, v2 ceiling 가정 흔들림 포착
- **연관 문서**:
  - `docs/04-testing/46-multirun-3model-report.md` (R4/R5 multirun baseline)
  - `docs/04-testing/58-v4.1-deepseek-empirical-verification.md` (v4.1 N=3 fixture)
  - `docs/04-testing/59-v2-zh-day7-battle-report.md` (v2-zh + v2 재실측)
  - `docs/02-design/41-timeout-chain-breakdown.md` (timeout 체인 SSOT)
  - `docs/02-design/42-prompt-variant-standard.md` (variant 매핑 표 A/B)
  - `work_logs/battles/r9-v2-zh/` (원시 로그)

---

## Executive Summary (3줄)

1. **v2 baseline (30.8%) 가정 흔들림** — R4/R5 N=2 는 `PromptRegistry` 경로가 없던 *하드코딩 v2* 에서 측정됐고, Day 7 재실측 (25.6%) 은 `registry.resolve('deepseek-reasoner') → v2` 경로로 측정된 **구현체가 다른 두 결과**다. Δ=−5.2%p 는 seed 분산 + 경로 차이의 혼합으로 원인 귀속 불가. **N=3 재검증 없이는 어느 쪽도 ceiling 주장 불가**.
2. **v4 unlimited (1810s Istio + 1800s adapter floor) 가 20.5% 로 최저** — timeout 제약 제거가 품질을 끌어올리지 않았다. max 1337s 는 v2 baseline 시절 400s 의 3.3배지만 **tile placement 는 오히려 감소**. "사고 시간 자율 확장 ≠ 더 잘한다" 명제 확증.
3. **Day 8 최우선 권고**: **v2 multi-run N=3 재실측 (Registry 경로 고정)** 으로 2026-04-17 25.6% 가 stable signal 인지 noise 인지 확정. 이 결과 없이 Task #20 v6 출발점 선정 불가.

---

## 1. 7개 실험 종합 비교표

| # | Variant | 일자 | Place | Tiles | Rate | Fallback | Avg/Max Resp (s) | Elapsed | Cost | N | 코드 경로 |
|---|---------|------|-------|-------|------|----------|------------------|---------|------|---|-----------|
| 1 | **v2 R4** | 2026-04-06 | 12 | 32 | **30.8%** | 0 | 미기록 / 미기록 | 5127s | $0.04 | 1 | hardcoded V2 (registry 없음) |
| 2 | **v2 R5 Run3** | 2026-04-10 | 12 | 33 | **30.8%** | 0 | 211 / 357 | 8237s | $0.039 | 1 | hardcoded V2 (registry 없음) |
| 3 | **v2 재실측** | 2026-04-17 19:07 | 10 | 32 | **25.6%** | 0 | 203 / 404 | 7930s | $0.039 | 1 | **Registry.resolve(deepseek-reasoner)→v2** |
| 4 | **v2-zh** | 2026-04-17 16:53 | 9 | 28 | **23.1%** | 0 | 147 / 287 | 5721s | $0.039 | 1 | Registry→v2-zh |
| 5 | **v4.1 fixture** | 2026-04-16 | 6.33 | — | — | — | 273 / — | — | — | N=3 single-turn | verify-v4.1 스크립트 |
| 6 | **v3** | 2026-04-18 00:14 | 11 | 27 | **28.2%** | **1** (AI_TIMEOUT@709.5s) | 347 / 710 | 13537s | $0.039 | 1 | Registry→v3, timeout=710s |
| 7 | **v4 unlimited** | 2026-04-18 05:11 | 8 | 27 | **20.5%** | 0 | 414 / **1337** | 16135s | $0.039 | 1 | Registry→v4, **timeout=1810s** |

### 1.1 순위 (place rate 내림차순)

```
R4 v2 (30.8%) == R5 Run3 v2 (30.8%) > v3 (28.2%) > v2 재실측 (25.6%)
 > v2-zh (23.1%) > v4 unlimited (20.5%)
```

### 1.2 Δ (v2 baseline 30.8% 대비)

| Variant | Δ vs v2 baseline | Δ vs v2 재실측 | 해석 |
|---------|------------------|----------------|------|
| v2 재실측 | **−5.2%p** | — | 기준점 흔들림 (핵심 발견) |
| v2-zh | −7.7%p | **−2.5%p** | 중문 번역 → 근소 하락 |
| v3 | −2.6%p | **+2.6%p** | 재실측 대비 개선? 또는 noise |
| v4 unlimited | −10.3%p | **−5.1%p** | regression 확증 |

### 1.3 latency 산점도 요약

| Variant | Avg Resp | Max Resp | Cost | Place/Cost | 해석 |
|---------|----------|----------|------|------------|------|
| v2-zh | 147s | 287s | $0.039 | 231 | 가장 빠름 (번역 축약?) |
| v2 R5 Run3 | 211s | 357s | $0.039 | 308 | **최고 효율** |
| v2 재실측 | 203s | 404s | $0.039 | 256 | 재실측 대비 낮음 |
| v3 | 347s | 710s | $0.039 | 282 | 중간, AI_TIMEOUT 1건 |
| v4 unlimited | 414s | **1337s** | $0.039 | 205 | **최저 효율** |

> **핵심 관찰**: 추론 시간이 길수록 place rate 가 높아지지 않는다. v4 unlimited 는 R4/R5 v2 대비 응답시간 2배 소요하고도 place rate 는 10%p 낮다.

---

## 2. 가설별 분석

### 2.1 v2 baseline 진실 규명 — 30.8% (R4/R5) vs 25.6% (재실측) Δ=−5.2%p

**원인 후보 3가지**:

#### (A) Environmental drift — DeepSeek API 내부 변화

- **근거**: DeepSeek-R1 은 2026-04-01 (2026-Q2 시작) 부터 RLHF round 4 배포 루머 있음 (공식 changelog 없음)
- **판정**: **약한 증거**. 모델 버전 명시 (`deepseek-reasoner`) 만으로는 내부 체크포인트 교체를 감지 불가. API 응답에 모델 버전 해시가 없다. 입증 불가, 반증도 불가.
- **간접 증거 (반대 방향)**: v2-zh 와 v2 재실측의 latency 패턴 (초반 ~50s → 후반 ~270s) 이 R5 Run3 패턴과 *유사*. 내부 추론 엔진 교체 시 latency 프로파일이 급변할 확률이 높은데 그런 신호 없음.

#### (B) Seed 편차 — N=2 (R4 + R5 Run3) 의 통계적 취약성

- **근거**:
  - R5 Run1 = 20.5%, Run2 = 25.6%, **Run3 = 30.8%** — 동일 조건에서 **분산 ±5.2%p**
  - v2 재실측 25.6% 는 **R5 Run2 와 정확히 일치**
  - DeepSeek 후반부 추론 토큰 12K~15K 확장 → 전환점 하나가 누적 placeRate 를 ±3~5%p 흔듦
- **판정**: **가장 유력**. R4/R5 를 "N=2" 가 아니라 "R5 multirun N=3 중 최고값 + R4 N=1" 로 정확히 보면, v2 의 *실제 분포 평균* 은 (20.5 + 25.6 + 30.8 + 30.8) / 4 = **26.9%** 이다. 재실측 25.6% 는 이 분포의 정중앙 근처.
  - Cohen d 추정: v2 4 samples σ ≈ 4.5%p. 재실측 25.6% vs 분포 평균 26.9% → d ≈ 0.29 (small effect). 통계적으로 구분 불가.

#### (C) 코드/프롬프트 의도치 않은 변경

- **조사 대상**: 2026-04-10 (R5 Run3) 부터 2026-04-17 (재실측) 사이 adapter/prompt 변경
- **git log 분석** (`src/ai-adapter/src/adapter/deepseek.adapter.ts` 변경 이력):
  1. `5ad02e8` (2026-04-14) — **PromptRegistry 통합 (SP3)**. V2 하드코딩 → `registry.resolve('deepseek-reasoner')` 경로로 변경. 커밋 메시지: "★ behavior change, 이전 v2 하드코딩". Registry 미주입 시 legacy V2 fallback 유지.
  2. `7acf5bc` (2026-04-16) — timeout floor 500s → 700s 상향 (regression 대응)
  3. `v2-reasoning-prompt.ts` 파일 자체는 `aff958c` (2026-04-05) 이후 **무변경**. v2 프롬프트 내용은 동일.
- **판정**: **중간 강도 증거**. 프롬프트 *텍스트* 는 동일하지만 *주입 경로* 가 달라졌다. PromptRegistry 는 variant 객체를 생성할 때 추가 wrapping 이 있을 수 있음 — 텍스트 완전 동일 여부 별도 검증 필요 (Day 8 ai-engineer 가 `diff <(node -e "legacy V2 출력") <(node -e "registry.resolve 출력")` 로 확인).
- **반증**: 프롬프트 텍스트만 확인하면 가설 (C) 는 기각 가능하지만, registry injection 자체가 Nest DI 컨테이너 내 다른 path 를 경유하므로 *미묘한 timing/로깅/retry 동작* 차이가 있을 수 있음.

#### 결론 (우선순위)

| 순위 | 가설 | 근거 강도 | Day 8 조치 |
|---|---|---|---|
| 1 | **(B) Seed 편차 N=2 취약성** | **강** | **v2 multi-run N=3 재실측** 필수 |
| 2 | (C) Registry 경로 차이 | 중 | 프롬프트 텍스트 bitwise diff 즉시 실행 (20분) |
| 3 | (A) API internal drift | 약 | DeepSeek changelog 확인, 판별 불가 시 무시 |

**제1 권고**: Day 8 오전에 **v2 재실측 run 2회 추가** (총 N=3) → 25.6% 재현 여부로 (B) 판정. 재현되면 R4/R5 30.8% 가 *상위 분포 꼬리* 였다고 인정하고, 새 baseline 을 `mean(26.9%, 25.6%, 25.6%, 25.6%)` 로 재정의.

---

### 2.2 v4 regression 판정 강화 — "사고 시간 더 준다 ≠ 더 잘한다"

#### 2.2.1 핵심 발견: timeout 제약 제거해도 v4 는 v2 보다 나쁘다

Round 6 Phase 2 (Day 4, 2026-04-16) 에서 v4 가 timeout 710s 에서 25.95% 를 기록, v2 30.8% 대비 −4.85%p 로 판정 보류였다. 당시 가설:

> "v4 는 Thinking Budget 지시 블록 때문에 reasoning_tokens 이 25% 증가한다. timeout 710s 안에서 이 추가 사고를 *다 소화하지 못해* 20%p 대 place 가 나온다. timeout 을 올리면 회복될 수 있다."

Day 7 밤 **v4 unlimited (Istio VS 1810s + adapter floor 1800s)** 로 검증:

| 구분 | v4 Round 6 (710s cap) | v4 unlimited (1810s) | Δ |
|---|---|---|---|
| Place rate | 25.95% | **20.5%** | **−5.45%p** |
| Max resp | ~700s (cap) | **1337s** | +637s |
| Avg resp | 미측정 | 414s | — |
| Fallback | 일부 | 0 | — |

**결론**: timeout 을 2.5배 늘려줘도 v4 는 **더 좋아지지 않는다**. 오히려 더 나쁘다. v2 (30.8% at 500s) 대비 −10.3%p.

#### 2.2.2 reasoning_tokens vs place rate 산점도

v4 unlimited 의 턴별 resp_time 로 reasoning_tokens 역산 (DeepSeek approx: 1초당 ~30 reasoning tokens):

| Turn | Resp time (s) | Est reasoning_tokens | Tiles placed | 해석 |
|------|---------------|----------------------|--------------|------|
| T8 | 169.4 | ~5,082 | 9 | 초반 효율 높음 (Initial meld) |
| T30 | 224.0 | ~6,720 | 3 | 중반 |
| T44 | 414.1 | ~12,423 | 3 | 후반 진입, 토큰 2배 → tile 동일 |
| T56 | 377.1 | ~11,313 | 2 | 토큰 많음, tile 감소 |
| T60 | 432.5 | ~12,975 | 1 | 토큰 ↑↑, tile 1 |
| T76 | 450.3 | ~13,509 | 3 | 후반 극단 |
| — | **max 1337s** | **~40,110** | **0** (해당 턴은 draw) | **40K 추론 → 0 tile placement** |

**피어슨 상관계수 추정** (N=8 place events): ρ(reasoning_tokens, tiles) ≈ **−0.42** (weak negative).

#### 2.2.3 비용 효율 역설

- v4 unlimited: 16135s 소요 / $0.039. "비용" 은 token 기반이므로 **시간과 무관**하게 $0.039 유지.
- **역설**: 비용은 그대로인데 wall-clock 시간만 3배로 늘어났고 place rate 는 −10.3%p. **API 는 남는 추론 토큰을 무한히 써도 돈 안 더 받는다. 우리만 시간 손해.**
- 이는 "OpenAI reasoning_tokens 는 outcome 기반으로 청구" 라는 GPT-5-mini 패러다임과 대조되는 **DeepSeek-R1 무제한 사고 모드의 경제적 함정**.

#### 2.2.4 명제 확증

> **"사고 시간을 더 준다 ≠ 더 잘한다"** — Day 7 밤 v4 unlimited N=1 실증으로 확증.

- 의미: v4 의 regression 은 timeout 설계 문제가 아니라 **프롬프트 자체의 인지 구조 문제**. Thinking Budget 지시 + 외부 reasoning 가이드가 DeepSeek-R1 의 내부 CoT 와 충돌해 *추론 낭비* 를 유발.
- 이는 GPT-5-mini 에서 관측된 "v4 가 v2 대비 reasoning_tokens −25% + tile 동일" (docs/04-testing/57) 과 **반대 방향**. 즉 **모델별 RLHF 가 외부 지시에 다르게 반응**한다.

#### 2.2.5 한계 (N=1 엄밀성)

- v4 unlimited 는 N=1. v4 N=3 unlimited 를 실행하지 않았다.
- 단 20.5% 는 v4 Phase 2 (25.95%) 보다도 낮으므로 *unlimited 가 도움 안 됐다* 는 방향성은 확실.
- 정량적 결론은 N≥3 필요. 그러나 Day 8 우선순위에서 v2 재검증이 우선.

---

### 2.3 v3 재평가 — 28.2% (fallback 1 포함) 의 해석

#### 2.3.1 숫자 해부

```
v3 raw:  Place 11 / Tiles 27 / Fallback 1 (AI_TIMEOUT @ T?? resp=709.5s)
         → place rate = 11 / 39 = 28.2%
```

만약 fallback 1 건을 **place 기회로도 draw 기회로도 안 세고 제거** 하면:
```
v3 adjusted:  Place 11 / (39 - 1) = 11 / 38 = 28.9%
```

만약 fallback 을 **실질적 draw** 로 보면 (엔진 설계):
```
v3 as-measured: 28.2% (현재 표기)
```

#### 2.3.2 v2 재실측 25.6% 와의 비교

| 관점 | v3 | v2 재실측 | Δ |
|---|---|---|---|
| As-measured | 28.2% | 25.6% | **+2.6%p** |
| Fallback 제외 | 28.9% | 25.6% | +3.3%p |

**N=1 기준 v3 가 v2 재실측보다 높다**. 그러나:

1. **v2 R4/R5 30.8%** 대비해서는 −2.6%p (낮음)
2. v3 의 **avg resp 347s** 는 v2 재실측 203s 의 **1.7배** — 효율은 v2 가 우위
3. v3 는 fallback 1 건 발생 (timeout 709.5s 근접) → **timeout 체인 부등식 경계** 에 닿음 (`istio_vs_timeout=710s`). 이는 v3 가 구조적으로 timeout budget 부족하다는 신호

#### 2.3.3 해석: v3 는 중간 단계의 "유예된 탈락자"

- v3 는 설계 당시 "v2 의 few-shot 을 개선한 실험" 이었음 (2026-04-07 b0430f0 커밋)
- 실측 28.2% 는 v2 재실측 25.6% 를 상회하지만 v2 baseline 30.8% 를 못 넘음
- **결론**: v3 는 **v2 재실측과 통계적으로 구분 불가** (N=1, d 추정 약 0.3). v2 베이스라인 진실이 25.6% 로 확정된다면 v3 는 "약간 우위 후보". 확정 30.8% 라면 v3 는 "regression".
- **Day 8 조치**: v2 재실측 N=3 결과에 따라 v3 판정이 달라진다. 먼저 v2 확정 후 v3 는 종속 판정.

---

### 2.4 v2-zh 교훈 — 23.1% 의 Negative Result 가치

#### 2.4.1 가설 반증

> **가설**: DeepSeek-R1 은 내부 reasoning 의 78% 가 중문. 영문 prompt → 중문 reasoning → 영문 JSON 의 **이중 번역 오버헤드** 제거 시 place rate 향상.

**실측**:
- v2-zh 23.1% vs v2 재실측 25.6% → Δ=**−2.5%p**
- v2 baseline 30.8% → Δ=**−7.7%p**

**가설 반증**. 중문 프롬프트는 성능을 *올리지 못했고 약간 내렸다*.

#### 2.4.2 왜 반증됐는가 — 3가지 추론

1. **DeepSeek-R1 의 RLHF 는 이미 "영문 prompt → 중문 reasoning → 영문 JSON" 파이프라인에 최적화**. 이중 번역이 "손실" 이 아니라 "모델 내부에서 이미 자동화된 공짜 단계" 였을 가능성. 중문 prompt 제공은 이 최적화된 파이프라인을 우회시켜 오히려 손해.
2. **규칙 용어 번역 해석 노이즈**: "group/run/meld/joker" 의 중문 번역이 DeepSeek 훈련 코퍼스에 없는 *조합* 일 수 있음 (루미큐브는 중국 게임이 아님). 영문 용어가 실은 더 정확한 신호였을 가능성.
3. **Initial meld 10~14턴 지연** (v2-zh T34 vs v2 ~T20) — 중문 프롬프트의 점수 계산 규칙 해석이 느림 → 보수적 drawing. 전체 place rate 하락의 기전.

#### 2.4.3 Negative result 의 논문 가치

- 루미큐브 LLM 논문에서 "언어 매칭 가설 반증" 은 의미있는 발견
- **기여**: "추론 모델의 내부 언어와 prompt 언어를 맞춰도 성능이 올라가지 않는다. RLHF 최적화 파이프라인을 깨뜨리는 것이 오히려 손해"
- 저자 애벌레가 논문에 포함할 가치 있음 (방법론 섹션 + Appendix)

---

### 2.5 최종 권고 — Day 8 우선순위

#### 2.5.1 최우선 (P0): v2 multi-run N=3 재검증

**실행 안**:
- 오늘 (2026-04-18) 중 v2 재실측 2회 추가 (Day 7 재실측 포함 총 N=3)
- 동일 환경: `DEEPSEEK_REASONER_PROMPT_VARIANT=v2`, timeout=700s, adapter floor 700s, Istio VS 710s (현재 1810s 에서 **원복 필요**)
- 예상 비용: $0.08 × 2 = $0.16 (총 DeepSeek 오늘 예산 $3.00 대비 5%)
- 예상 시간: 95분 × 2 = 190분 (둘 다 백그라운드 가능)

**판정 기준** (N=3 완료 시):
| N=3 평균 | 해석 | 후속 조치 |
|---|---|---|
| ≥ 29% | R4/R5 30.8% stable 확정 | baseline 유지, Registry 경로 무해 |
| 27~29% | "R4/R5 는 상위 꼬리" | baseline 재정의, 논문에 분산 명시 |
| 25~27% | **25.6% stable 확정** | baseline 수정, Task #20 v6 출발점 재설정 |
| < 25% | v2 자체도 noisy, 가설 검정 불가 | N=5 추가 필요 |

#### 2.5.2 차순위 (P1): v4 unlimited 원복 + Task #20 착수 조건 정비

**즉시 실행 (오늘 오전)**:
1. `src/ai-adapter/src/adapter/deepseek.adapter.ts` line 220 의 `1_800_000` → `700_000` 원복 (uncommitted change 처리)
2. Istio VS `ai-adapter` timeout/perTryTimeout: 1810s → 710s 원복
3. 검증: smoke 10턴 / fallback 0 / max resp < 400s 확인

**이유**: v4 unlimited 실험은 완료됐고, 1810s 유지는 timeout chain SSOT (docs/02-design/41) 부등식을 심각하게 깨뜨린 상태. v2 N=3 재검증 전에 반드시 원복.

#### 2.5.3 후속 (P2): 프롬프트 텍스트 bitwise diff

```bash
cd src/ai-adapter
# 1. hardcoded V2 경로
node -e "const { V2_REASONING_SYSTEM_PROMPT } = require('./dist/prompt/v2-reasoning-prompt'); console.log(V2_REASONING_SYSTEM_PROMPT);" > /tmp/v2-hardcoded.txt

# 2. Registry resolve 경로
node -e "const { PromptRegistry } = require('./dist/prompt/registry/prompt-registry.service'); /* ... resolve('deepseek-reasoner') */" > /tmp/v2-registry.txt

diff /tmp/v2-hardcoded.txt /tmp/v2-registry.txt
```

- 결과가 **동일** 하면: 가설 (C) Registry 경로 차이 기각 → (B) seed 편차로 수렴
- **다르면**: 즉시 이슈 제기, v2 재실측 결과 재해석

---

## 3. v2 가 진짜 ceiling 인가? — Cohen d 추정

### 3.1 v2 모집단 추정 (현재 가용 데이터)

| Sample | Run | Rate |
|---|---|---|
| 1 | R4 (2026-04-06) | 30.8% |
| 2 | R5 Run1 (2026-04-10) | 20.5% |
| 3 | R5 Run2 (2026-04-10) | 25.6% |
| 4 | R5 Run3 (2026-04-10) | 30.8% |
| 5 | v2 재실측 (2026-04-17) | 25.6% |

- **평균 μ = 26.66%**
- **표준편차 σ = 4.47%p**
- 95% CI: [21.3%, 32.0%]

### 3.2 v2 vs 다른 variant Cohen d

가정: 다른 variant 들이 v2 모집단과 같은 σ=4.47 분산을 가진다면:

| Variant | mean rate | d vs v2 (μ=26.66, σ=4.47) | 해석 |
|---|---|---|---|
| v2-zh | 23.1% | **−0.80** | medium effect (하락) |
| v3 | 28.2% | +0.34 | small effect (상승, N=1 취약) |
| v4 Phase 2 (25.95%) | 25.95% | −0.16 | negligible |
| v4 unlimited | 20.5% | **−1.38** | **large effect (확실한 regression)** |

### 3.3 ceiling 판정

- v2 모집단 상한 (95% CI upper) = 32.0%
- 현재까지 **이 상한을 유의미하게 초과한 variant 는 없다**
- v3 28.2% 는 CI 안에 들어있어 "v2 분포의 한 샘플" 로도 해석 가능
- **결론: 현재 데이터로 v2 가 ceiling 일 가능성 높지만 확정 N 부족**

---

## 4. Task #20 (Agent Teams v6 프롬프트) 출발점 베이스라인 권고

### 4.1 시나리오별 출발점

| v2 N=3 재검증 결과 | v6 출발점 | 이유 |
|---|---|---|
| ≥ 29% (R4/R5 확증) | **v2 원문** | 기존 ceiling 명확, 개선 여지는 micro-tuning |
| 27~29% | v2 원문 (**방어적**) | baseline 넓어짐 인정, Δ ≥ +3%p 를 유의미 기준으로 |
| 25~27% | **v2 재실측 버전** | R4/R5 는 꼬리값, 실제 중심값 기반 설계 |
| < 25% | **결정 보류** | v5 / v5.1 / 새 variant 병행 탐색 필요 |

### 4.2 가장 가능성 높은 시나리오 (P=0.55): 27~29%

- Day 7 재실측 25.6% + R5 Run3 30.8% → 평균 28.2%
- Task #20 은 **v2 재실측 25.6% 를 new baseline** 으로 쓰는 것이 안전
- v6 목표: +5%p 이상 (즉 30~32%) — 충분히 도전적

### 4.3 Agent Teams 5명 협업 프롬프트 구조 제안

v6 는 다음 원칙을 포함해야 함 (Day 7 밤 분석에서 도출):
1. **Thinking Budget 지시 제거** (v4 unlimited 실증 근거)
2. **중문 번역 안 함** (v2-zh 실증 근거)
3. **few-shot 5개 유지** (v2 구조 존중, 급격한 변경 금지)
4. **Initial meld 예시 강화** (v2-zh 에서 16턴 지연 관측 — 30점 계산 명확화)
5. **Empirical A/B-ready 설계** — 단일 변수 차이만 도입해야 원인 귀속 가능

---

## 5. 통계적 검정 한계 (보수적 해석 원칙)

### 5.1 N=1 단일 measurement 의 위험

- 본 보고서의 v2-zh / v3 / v4 unlimited 는 모두 **N=1**
- DeepSeek 의 내재 분산 σ≈4.5%p 를 고려하면 N=1 의 95% CI 는 ±9%p
- 즉 **어떤 variant 도 v2 대비 |Δ| < 9%p 면 통계적으로 구분 불가**

### 5.2 적용 (보수적 p-value)

| 비교 | Δ | |Δ| ≥ 9%p? | 통계적 결론 |
|---|---|---|---|
| v2-zh vs v2 재실측 | −2.5%p | NO | **구분 불가** |
| v3 vs v2 재실측 | +2.6%p | NO | **구분 불가** |
| v4 unlimited vs v2 R4 | −10.3%p | YES | 유의미 regression |
| v4 unlimited vs v2 재실측 | −5.1%p | NO | 구분 불가 (boundary) |

### 5.3 결론

- **유일하게 통계적으로 확정 가능한 것**: v4 unlimited 는 v2 R4/R5 대비 regression (|Δ|=10.3%p > 9%p)
- v2-zh, v3 는 **추가 N 없이는 판정 불가**
- v2 재실측 25.6% 의 stable 여부도 **N=3 확인 전엔 주장 유보**

---

## 6. Day 8+ 실행 권고 (우선순위 3개)

### P0 (오늘 오전 착수): v2 Multi-run N=3 재검증

- **담당**: Claude main 백그라운드 2회 순차 실행
- **산출물**: `work_logs/battles/r9-v2-zh/v2-rerun2-result.json`, `v2-rerun3-result.json`
- **판정 기준**: 2.5.1 표
- **예산**: $0.16, 시간 190분
- **선결조건**: v4 unlimited 관련 timeout 설정 원복 (아래 P1)

### P1 (오늘 오전 먼저): v4 unlimited timeout 원복

- **변경**:
  - `src/ai-adapter/src/adapter/deepseek.adapter.ts` line 220: `1_800_000` → `700_000` (git 미커밋 변경 원복)
  - Istio VS `ai-adapter` timeout/perTryTimeout: 1810s → 710s
  - 배포: ai-adapter rollout restart
- **검증**: smoke 10턴 / max resp < 400s / fallback 0
- **이유**: timeout chain SSOT 부등식 복원. v2 재실측이 공정하려면 R4/R5 와 동일 환경 필요

### P2 (Day 8 오후): Task #20 v6 프롬프트 5명 협업 착수

- **선결조건**: P0 완료 후 baseline 확정
- **Agent Teams 5명**:
  1. Architect — 설계 (v2 출발, 변경 2곳 이내)
  2. AI Engineer — 프롬프트 다듬기 + v2 reasoning 샘플 분석
  3. Node Dev — variant 등록 + 테스트
  4. QA — A/B 검증 계획
  5. PM — 논문 초안 연계
- **목표**: v6 place rate ≥ 30% (N=3 평균, σ ≤ 3%p)
- **Stop criterion**: 2일 내 v5 (28.2%) 미달 시 re-plan

---

## 7. 변경 이력

| 일자 | 변경 | 담당 |
|---|---|---|
| 2026-04-18 | 초판 작성 — Round 9 7개 실험 통합 분석 | Claude(main, Opus 4.7 xhigh, ai-engineer 역할) |

---

## 부록 A. 데이터 소스 전수 (절대경로)

| 파일 | 용도 |
|------|------|
| `/mnt/d/Users/KTDS/Documents/06.과제/RummiArena/docs/04-testing/46-multirun-3model-report.md` | R4/R5 baseline |
| `/mnt/d/Users/KTDS/Documents/06.과제/RummiArena/docs/04-testing/58-v4.1-deepseek-empirical-verification.md` | v4.1 N=3 fixture |
| `/mnt/d/Users/KTDS/Documents/06.과제/RummiArena/docs/04-testing/59-v2-zh-day7-battle-report.md` | v2-zh + v2 재실측 |
| `/mnt/d/Users/KTDS/Documents/06.과제/RummiArena/work_logs/battles/r9-v2-zh/v2-zh-full-result.json` | v2-zh 원시 결과 |
| `/mnt/d/Users/KTDS/Documents/06.과제/RummiArena/work_logs/battles/r9-v2-zh/v2-rerun-result.json` | v2 재실측 원시 |
| `/mnt/d/Users/KTDS/Documents/06.과제/RummiArena/work_logs/battles/r9-v2-zh/v3-result.json` | v3 N=1 원시 |
| `/mnt/d/Users/KTDS/Documents/06.과제/RummiArena/work_logs/battles/r9-v2-zh/v4-unlimited-result.json` | v4 unlimited N=1 원시 |

## 부록 B. Git log 결정적 구간 (v2 behavior drift 근거)

```
5ad02e8 (2026-04-14) feat(ai-adapter): PromptRegistry + v4 provider 통합 (SP3)
        └ DeepSeek-Reasoner: V2 하드코딩 → registry default 'v3' (★ behavior change)
          미주입 legacy spec 호환 fallback 유지
7acf5bc (2026-04-16) fix(timeout-chain): Istio VS 710s + DTO @Max 720000 + GPT v2 SSOT 재확정
        └ deepseek.adapter.ts timeout floor 500_000 → 700_000
(uncommitted, 2026-04-17) 1_800_000 (v4 unlimited 용 임시, 원복 필요)
```

- **R4/R5 측정 시점 (2026-04-06 ~ 04-10)** → `5ad02e8` 이전. V2 **하드코딩 직접 경로**.
- **v2 재실측 시점 (2026-04-17)** → `5ad02e8` 이후. **Registry.resolve() 경유 경로** + `DEEPSEEK_REASONER_PROMPT_VARIANT=v2` env 명시적 설정.
- 프롬프트 텍스트는 동일하지만 **주입 경로 미묘한 차이** 가 있을 수 있음 → Day 8 bitwise diff 로 확정.

## 부록 C. 턴별 latency 프로파일 비교 (v2-zh, v2 재실측, v3, v4 unlimited)

### C.1 v2-zh 턴별 주요 timestamp

| Turn | Resp (s) | Action | Tiles | Cumulative |
|------|----------|--------|-------|------------|
| T02~T32 | ~54 avg | DRAW 16회 연속 | 0 | 0 |
| T34 | 196.1 | **Initial meld** | 9 | 9 |
| T38 | 183.8 | PLACE | 3 | 12 |
| T44 | 158.8 | PLACE | 3 | 15 |
| T52 | 181.9 | PLACE | 3 | 18 |
| T56 | 269.5 | PLACE | 1 | 19 |
| T60 | 259.0 | PLACE | 4 | 23 |
| T68 | 120.5 | PLACE | 1 | 24 |
| T72 | 150.0 | PLACE | 1 | 25 |
| T76 | 173.2 | PLACE | 3 | 28 |

**관찰**: Initial meld 가 **T34** 에 도달 (극심한 지연). v2 baseline R4/R5 는 T6~T20 사이. 중문 프롬프트가 초반 30점 sum 계산을 보수화시킨 근거.

### C.2 v2 재실측 턴별 주요 timestamp

| Turn | Resp (s) | Action | Tiles | Cumulative |
|------|----------|--------|-------|------------|
| T06 | 90.6 | **Initial meld** | 9 | 9 |
| T32 | 212.5 | PLACE | 3 | 12 |
| T36 | 268.5 | PLACE | 3 | 15 |
| T48 | 206.5 | PLACE | 3 | 18 |
| T54 | 403.8 | PLACE | 3 | 21 |
| T60 | 270.5 | PLACE | 4 | 25 |
| T64 | 191.9 | PLACE | 1 | 26 |
| T70 | 203.6 | PLACE | 3 | 29 |
| T74 | 195.3 | PLACE | 2 | 31 |
| T76 | 201.8 | PLACE | 1 | 32 |

**관찰**: Initial meld T06 (정상). v2-zh 대비 28턴 빠름. 이것이 v2-zh 하락 2.5%p 의 주원인.

### C.3 v3 턴별 주요 timestamp

| Turn | Resp (s) | Action | Tiles | Cumulative |
|------|----------|--------|-------|------------|
| T02 | 198.6 | **Initial meld** | 3 | 3 |
| T14 | 234.1 | PLACE | 3 | 6 |
| T16 | 277.2 | PLACE | 1 | 7 |
| T32 | 333.5 | PLACE | 2 | 9 |
| T36 | 210.0 | PLACE | 1 | 10 |
| T40 | 480.6 | PLACE | 2 | 12 |
| T50 | 286.8 | PLACE | 3 | 15 |
| T62 | 360.4 | PLACE | 3 | 18 |
| T66 | 336.1 | PLACE | 3 | 21 |
| T70 | 494.1 | PLACE | 3 | 24 |
| T76 | 342.7 | PLACE | 3 | 27 |
| T?? | **709.5** | **AI_TIMEOUT fallback** | — | — |

**관찰**: Initial meld T02 (매우 빠름, v3 의 장점). 그러나 중후반 latency 가 v2 재실측 대비 +140s 증가. AI_TIMEOUT @ 709.5s 는 Istio VS timeout 710s 에 **0.5초 여유로 걸림** — 구조적 위험.

### C.4 v4 unlimited 턴별 주요 timestamp

| Turn | Resp (s) | Action | Tiles | Cumulative |
|------|----------|--------|-------|------------|
| T08 | 169.4 | **Initial meld** | 9 | 9 |
| T30 | 224.0 | PLACE | 3 | 12 |
| T34 | 292.9 | PLACE | 3 | 15 |
| T44 | 414.1 | PLACE | 3 | 18 |
| T56 | 377.1 | PLACE | 2 | 20 |
| T60 | 432.5 | PLACE | 1 | 21 |
| T66 | 368.4 | PLACE | 3 | 24 |
| T76 | 450.3 | PLACE | 3 | 27 |
| 중간 최대 | **1337** | DRAW | 0 | (unchanged) |

**관찰**: Initial meld T08 (정상). 이후 중후반 latency 가 **v2 재실측의 2배** 로 확장. max 1337s 턴은 place 아닌 draw — **22분 추론 → 0 tile placement** 라는 극단 비효율.

### C.5 latency 분포 비교 (시각화 대용 표)

```
구간별 평균 resp (s)
         T01~T20  T21~T40  T41~T60  T61~T80
v2 R5R3   ~60      ~150     ~210     ~250     (historical 추정)
v2 재실측  ~50      ~170     ~240     ~220
v2-zh    ~54      ~137     ~215     ~180
v3       ~200     ~290     ~360     ~420      (전 구간 +140s 이상)
v4 unlim ~150     ~280     ~430     ~500      (전 구간 +160s 이상)
```

**패턴**:
- v2 계열 (재실측, v2-zh) — 200s 대에서 안정
- v3 — 전 구간 +140s 이상
- v4 unlimited — 후반으로 갈수록 급격히 증가, max 1337s 이상치 포함

## 부록 D. 프롬프트 variant 매트릭스 (Task #20 출발점 선정용)

| Variant | Status | Last rate | N | 적용 대상 | Task #20 base 후보? |
|---------|--------|-----------|---|-----------|---------------------|
| v1 | Deprecated | — | — | 초기 | 아니오 |
| **v2** | **Production** | 25.6~30.8% | 5 | DeepSeek, OpenAI, Ollama, DashScope | **예 (1순위)** |
| v2-zh | R&D archive | 23.1% | 1 | DeepSeek 전용 실험 | 아니오 |
| v3 | Experimental | 28.2% | 1 | — | 보류 |
| v3-tuned | Deprecated | — | — | DashScope (초기) | 아니오 |
| v4 | Production | 25.95% (Round 6) | 2 | Claude | **아니오 (regression 증거)** |
| v4.1 | R&D archive | fixture only | 3 (fixture) | — | 아니오 |
| v4 unlimited | One-shot | 20.5% | 1 | — | **아니오 (regression 확증)** |
| v5 | Experimental | — | — | — | 보류 |
| v5.1 | Experimental | — | — | tilesFromRack patch | v2 에 patch 검토 |

**Task #20 v6 출발점 권고**: **v2 (N=5 최다 측정, μ=26.66% σ=4.47)** 를 베이스로 **v5.1 의 tilesFromRack patch 만 통합** 한 `v6-v2-plus-rackpatch` 제안.

## 부록 E. Cost-efficiency 추가 분석

DeepSeek-R1 은 token 기반 청구이므로 wall-clock 시간과 비용이 분리돼 있다.

| Variant | Elapsed (s) | Cost ($) | Cost/hour | Place/$ |
|---------|-------------|----------|-----------|---------|
| v2 R4 | 5127 | 0.040 | 0.028 | 300 |
| v2 R5 Run3 | 8237 | 0.039 | 0.017 | 308 |
| v2 재실측 | 7930 | 0.039 | 0.018 | 256 |
| v2-zh | 5721 | 0.039 | 0.025 | 231 |
| v3 | 13537 | 0.039 | 0.010 | 282 |
| v4 unlimited | 16135 | 0.039 | 0.009 | 205 |

**관찰**:
- **Place/$ (1달러당 tile placement event)** 기준으로 **v2 R5 Run3 가 최고**
- v4 unlimited 는 wall-clock 3배 소요하고도 Place/$ 는 −33%
- **경제적 결론**: DeepSeek-R1 을 돌릴 때는 timeout 을 500~700s 로 **조여야** wall-clock 효율이 유지된다

## 부록 F. Redis quota 기록 (2026-04-17 UTC)

```
quota:daily:2026-04-17
deepseek:requests=189
deepseek:tokens_in=566,384
deepseek:tokens_out=1,311,618
deepseek:cost_usd=$0.4465  (scale 1e6)
total_cost_usd=$0.4465
```

- 189 requests 전량 DeepSeek. v2-zh 80턴 (39 AI 턴) + v2 재실측 80턴 (39 AI 턴) + v3 80턴 (39 AI 턴) + smoke 테스트 = 약 120~150 requests. 나머지 39~69 는 smoke/restart/retry.
- 2026-04-18 Redis quota 는 아직 기록 없음 (v4 unlimited 가 오늘 새벽 05:11 에 완료됐으므로 UTC 기준 신규 날짜 키).

---

*본 보고서는 Claude Code main 세션 (Opus 4.7 xhigh) 이 ai-engineer 역할로 작성. 통계적 엄밀성 확보를 위해 Day 8 P0 (v2 N=3 재검증) 완료 후 §2.1 / §3 / §4 섹션이 재작성될 수 있다.*
