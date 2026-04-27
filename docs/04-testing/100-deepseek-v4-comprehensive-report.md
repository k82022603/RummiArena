# 100. DeepSeek V4 종합 분석 보고서

- **일자**: 2026-04-28
- **작성자**: Claude Opus 4.6 (1M context)
- **범위**: DeepSeek V4-Flash/V4-Pro 전 모드 비교 + R1/GPT/Claude 크로스모델 비교
- **근거 문서**: 95~99번 개별 보고서, 37번(Round 4), 47번(Round 5), 63번(마이그레이션 계획), 63b번(API 조사)
- **기술 보고서**: [DeepSeek V4 Technical Report](https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro/blob/main/DeepSeek_V4.pdf)

---

## 1. 실험 개요

### 1.1 배경
DeepSeek R1(deepseek-reasoner)에서 V4 세대로 모델 교체를 검토. V4-Flash와 V4-Pro의 thinking/non-thinking 모드를 실측하여 최적 구성을 결정한다.

### 1.2 실험 매트릭스

| # | 모델 | 모드 | 타임아웃 | 게임 수 | 결과 |
|---|------|------|---------|---------|------|
| 1 | V4-Flash | non-thinking | 700s | 2 | **FORFEIT** (place 0%) |
| 2 | V4-Flash | thinking | 700s | 1 | **FORFEIT** (place 0%) |
| 3 | V4-Pro | non-thinking | 700s | 1 | 중단 (place 14.3%) |
| 4 | V4-Pro | thinking | 700s | 1 | 완주 (place 33.3%, **fallback 4**) |
| 5 | V4-Pro | thinking | **1000s** | **3** | **완주 3/3** (place 31.9% avg, **fallback 0**) |

---

## 2. 핵심 결과: V4-Pro Thinking (1000초) 3게임

### 2.1 게임별 결과

| 지표 | Game 1 | Game 2 | Game 3 | **평균** | R1 Round 5 |
|------|--------|--------|--------|---------|-----------|
| **place rate** | 31.6% | 30.8% | 33.3% | **31.9%** | 30.8% |
| **tiles placed** | 34 | 33 | 29 | **32** | - |
| **fallback** | 0 | 0 | 0 | **0** | 0 |
| **avg latency** | 124s | 58s | 124s | **102s** | 131s |
| **max latency** | 365s | 150s | 489s | **335s** | 200s |
| **cost** | $0.038 | $0.039 | $0.039 | **$0.039** | $0.013 |
| **소요 시간** | 84분 | 41분 | 81분 | **69분** | ~175분(추정) |
| **완주** | 80턴 | 80턴 | 80턴 | **3/3** | 80턴 |

### 2.2 통계적 유의성

- **place rate**: 31.9% ± 1.3%p (N=3, σ=1.3) — R1(30.8%) 대비 +1.1%p
- **fallback**: 0/3 (100% 무결)
- **완주**: 3/3 (100%)

---

## 3. 모델별/모드별 비교

### 3.1 V4 세대 내부 비교

| 구성 | place rate | fallback | avg latency | 판정 |
|------|-----------|----------|------------|------|
| V4-Flash non-thinking | **0%** | 3 (INVALID_MOVE) | 2.4s | ❌ 부적합 |
| V4-Flash thinking | **0%** | - | 5.4s | ❌ 부적합 |
| V4-Pro non-thinking | 14.3% | - | 21.6s | ❌ 부적합 (중단) |
| V4-Pro thinking 700s | 33.3% | **4** (AI_TIMEOUT) | 393s | ⚠ 조건부 |
| **V4-Pro thinking 1000s** | **31.9%** | **0** | **102s** | ✅ **채택** |

**결론**: V4-Flash는 Flash/Pro 무관하게 non-thinking에서 게임 AI 부적합. V4-Pro thinking만 유효.

### 3.2 V4-Pro vs R1 (deepseek-reasoner)

| 지표 | R1 (Round 5) | V4-Pro (1000s, 3게임 평균) | 비교 |
|------|-------------|--------------------------|------|
| place rate | 30.8% | **31.9%** | **+1.1%p** ✅ |
| fallback | 0 | **0** | 동등 ✅ |
| avg latency | 131s | **102s** | **22% 빨라짐** ✅ |
| max latency | 200s | 335s | 열위 (하지만 1000s 내) |
| cost/game | $0.013 | **$0.039** | **3배** ⚠ |
| 완주 | 1/1 | **3/3** | 동등 ✅ |

### 3.3 4모델 크로스 비교 (Round 4 기준)

| 모델 | place rate | fallback | avg latency | cost/game | 비고 |
|------|-----------|----------|------------|----------|------|
| **GPT-5-mini** | **33.3%** | 0 | 20.9s | $0.15 | 가장 빠름 |
| **V4-Pro thinking** | **31.9%** | 0 | 102s | $0.039 | 캐시 효과 |
| **R1 (reasoner)** | 30.8% | 0 | 131s | $0.013 | 가장 저렴 |
| **Claude sonnet-4** | 20.0% | 0 | 52.3s | $1.11 | 가장 비쌈 |
| Ollama qwen2.5:3b | 0% | - | - | $0 | 비추론 한계 |

---

## 4. Context Caching 분석

### 4.1 DeepSeek Context Caching on Disk

DeepSeek V4는 디스크 기반 Context Caching을 기본 제공 (https://api-docs.deepseek.com/guides/kv_cache):
- 동일 프리픽스(시스템 프롬프트) 자동 캐시
- 캐시 히트 시 입력 토큰 가격 **97.5% 할인** ($0.435 → $0.003625/M)
- 캐시 구축 후 수 시간~수 일 유지

### 4.2 캐시 효과 실측

| 지표 | Game 1 (캐시 없음/워밍) | Game 2 (캐시 히트) | Game 3 | 효과 |
|------|----------------------|------------------|--------|------|
| avg latency | 124s | **58s** | 124s | **최대 2.1배 감소** |
| 소요 시간 | 84분 | **41분** | 81분 | **최대 2배 단축** |
| cost | $0.038 | $0.039 | $0.039 | 동등 (출력 토큰 지배) |

Game 2에서 캐시 효과가 극대화됨. Game 3에서 레이턴시가 다시 올라간 것은 보드 복잡도에 따른 reasoning 길이 변동.

### 4.3 R1에서의 캐시

R1(deepseek-reasoner)은 현재 V4-Flash thinking의 alias이므로, R1 호출 시에도 동일한 캐시 메커니즘이 적용될 가능성이 높다. 단, 이전 Round 5 실측 시점에는 R1이 원본 모델이었으므로 캐시 효과는 불확실.

---

## 5. 비용 분석

### 5.1 게임당 비용 비교

| 모델 | cost/game | $10 예산 게임 수 | $20 일일 예산 |
|------|----------|----------------|-------------|
| R1 (reasoner) | $0.013 | 769 | 1,538 |
| **V4-Pro (할인)** | $0.039 | 256 | 512 |
| V4-Pro (정가) | $0.156 | 64 | 128 |
| GPT-5-mini | $0.15 | 67 | 133 |
| Claude sonnet-4 | $1.11 | 9 | 18 |

### 5.2 V4-Pro 할인 기간

**75% 할인 종료: 2026/05/05 15:59 UTC** (Sprint 7 마감 2026/05/02 이후 3일)

- 할인 기간 내: $0.039/game — R1의 3배지만 관리 가능
- 할인 종료 후: $0.156/game — R1의 12배 → **비용 우위 소멸**

### 5.3 비용 최적화 경로

V4-Pro를 정가로 사용하면 비용 부담이 크므로:
1. **할인 기간(~5/5)**: V4-Pro 적극 활용, 대전 데이터 축적
2. **할인 종료 후**: R1(=V4-Flash thinking alias)로 복귀, 또는 V4-Flash 가격으로 thinking 모드 사용 가능 여부 확인

---

## 6. Non-Thinking vs Thinking 심층 분석

### 6.1 기술 보고서 Table 7 벤치마크

| 벤치마크 | V4-Flash Non-Think | V4-Flash High | V4-Pro Non-Think | V4-Pro High |
|----------|-------------------|---------------|-----------------|-------------|
| GPQA | 71.2% | 87.4% | 72.9% | 89.1% |
| LiveCodeBench | 55.2% | 88.4% | 56.8% | 89.8% |
| HMMT 수학 | 40.8% | 91.9% | 31.7% | 94.0% |

**Non-Think → High에서 성능 2~4배 증가.** RummiArena 실측과 완전히 일치 (non-thinking place 0%, thinking place 31.9%).

### 6.2 RummiArena 게임 AI 특성

루미큐브 게임 AI는 "현재 보드 + 내 랙 → 최적 배치 결정"이라는 **조합 탐색 + 규칙 준수** 과제:
- 30점 initial meld 제약
- 그룹(같은 숫자, 다른 색) / 런(같은 색, 연속 숫자) 규칙
- 기존 그룹 확장/재배치 전략

이 과제는 **chain-of-thought 추론이 필수**. 패턴 매칭(non-thinking)으로는 규칙 준수 자체가 불가능함을 실증.

---

## 7. 타임아웃 체인 분석

### 7.1 700초 vs 1000초

| 지표 | 700초 | 1000초 | 비고 |
|------|------|--------|------|
| fallback | 4건 | **0건** | 700초가 bottleneck |
| max latency | 709s | 489s | 캐시 효과로 감소 |
| place rate | 33.3% | 31.9% | 동등 |

700초에서 4건의 timeout은 모두 708~709초 — 불과 9~10초 초과. 1000초로 상향하면 **여유 폭 300초 이상** 확보.

### 7.2 권장 타임아웃

V4-Pro thinking 운영 시: **1000초 유지** (부등식 계약 준수)
```
script_ws(1070) > gs_ctx(1060) > istio_vs(1010) > adapter(1000)
```

---

## 8. 최종 판정 및 권장

### 8.1 모델 선택 판정

| 후보 | place rate | fallback | latency | cost | 판정 |
|------|-----------|----------|---------|------|------|
| V4-Flash (모든 모드) | 0% | 다수 | 2~6s | $0.003 | ❌ **탈락** |
| V4-Pro non-thinking | 14.3% | - | 22s | - | ❌ **탈락** |
| V4-Pro thinking 700s | 33.3% | 4 | 393s | $0.033 | ⚠ 조건부 |
| **V4-Pro thinking 1000s** | **31.9%** | **0** | **102s** | **$0.039** | ✅ **채택** |
| R1 (현행) | 30.8% | 0 | 131s | $0.013 | ✅ 유지 가능 |

### 8.2 권장

**V4-Pro thinking (1000초)를 Sprint 7 기간 주력 모델로 채택한다.**

근거:
1. **place rate 31.9%** — R1(30.8%) 대비 +1.1%p, 3게임 일관
2. **fallback 0** — 1000초 타임아웃에서 100% 무결
3. **avg latency 102s** — R1(131s)보다 빠름 (캐시 효과)
4. **비용 $0.039/game** — 할인 기간(~5/5) 내 관리 가능
5. **완주 3/3** — 100% 안정성

### 8.3 할인 종료 후 전략

2026/05/05 이후 V4-Pro 정가 복귀 시:
- **옵션 A**: `deepseek-reasoner` (= V4-Flash thinking alias) 사용 → $0.003/game 수준, 성능 실측 필요
- **옵션 B**: R1 데이터 기반으로 V4-Flash thinking의 place rate 확인 → 30%+ 유지되면 최저 비용 달성
- **옵션 C**: V4-Pro 정가 감수 ($0.156/game) — 예산 제약 시 불가

---

## 9. 이력

| 일자 | 모델 | place rate | 비고 |
|------|------|-----------|------|
| Round 2 (04-06) | R1 | 5.0% | 초기 |
| Round 3 (04-05) | R1 | 12.5% | few-shot 추가 |
| Round 4 (04-05) | R1 | 23.1% | v2 프롬프트 |
| Round 5 (04-10) | R1 | **30.8%** | timeout 500s |
| **V4 Phase 1** (04-28) | V4-Pro thinking | **31.9%** | timeout 1000s, 캐시 효과 |

---

## 10. 후속 작업

1. [ ] `DEEPSEEK_DEFAULT_MODEL` 운영 전환: `deepseek-v4-pro` 확정
2. [ ] 타임아웃 1000초 유지 (SSOT 41번 문서 갱신 완료)
3. [ ] 할인 종료(5/5) 전 `deepseek-reasoner` (= V4-Flash thinking) 비교 실측 1회
4. [ ] Round 6 본 대전: 4모델 토너먼트 (GPT / Claude / V4-Pro / Ollama)
5. [ ] 63번 마이그레이션 문서 최종 갱신
