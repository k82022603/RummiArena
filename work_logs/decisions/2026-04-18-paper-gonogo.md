# Decision — DeepSeek Reasoner 프롬프트 최적화 논문 초안 착수 GO/No-Go

- **작성일**: 2026-04-18 (Sprint 6 Day 8 아침)
- **작성자**: PM (애벌레 위임)
- **결정 주제**: Sprint 5 W2 Day 5 ~ Sprint 6 Day 7 에 걸쳐 수집한 DeepSeek Reasoner 프롬프트 variant (v2, v2-zh, v3, v4/v4.1 NEUTRAL, v4 unlimited) 실측 데이터로 **지금 논문/테크리포트 초안 착수가 합리적인가**
- **결정 방식**: PM 단독 판단 (데이터 + Sprint 6 잔여 리소스 + 1인 개발 제약 기반)
- **연관 문서**:
  - `docs/04-testing/46-multirun-3model-report.md` — R4/R5 baseline
  - `docs/04-testing/47-reasoning-model-deep-analysis.md`
  - `docs/04-testing/57-v4-gpt-empirical-verification.md` — GPT v2 결정
  - `docs/04-testing/58-v4.1-deepseek-empirical-verification.md` — v4.1 fixture N=3
  - `docs/04-testing/59-v2-zh-day7-battle-report.md` — Round 9 Phase 1~2
  - `work_logs/battles/r9-v2-zh/v3-result.json` (Day 8 새벽 완료)
  - `work_logs/battles/r9-v2-zh/v4-unlimited-result.json` (Day 8 05:11 완료)

---

## 1. 결정 (TL;DR)

**GO after data boost — Week 4 이내 착수 보류, v2 N=3 재검증 + 2주 내 블로그/테크리포트 형식으로 1차 산출 후 논문화 재판단**

한 줄 요약: *현재 데이터는 흥미로운 신호(후보 A, C)를 담고 있지만 **v2 baseline 자체가 흔들리는 순간** 모든 Δ 가 재계산되어야 하므로 초안 착수는 risky 하다. 비용 $3 미만, 시간 Day 8~10 3일이면 N=3 재검증 가능하므로 선 재검증 → 후 블로그 1차 → 논문화 단계 게이트가 합리적.*

---

## 2. 근거 (7개)

1. **Baseline 흔들림 — Round 9 Phase 2 에서 v2 재실측이 25.6% 로 떨어짐**. R4/R5 historical 30.8% 와 Δ=−5.2%p. N=2 샘플로는 어느 쪽이 "진짜 v2" 인지 판별 불가. 이 이슈를 해결하지 않고 "v4 regression", "v2-zh negative" 를 주장하면 reviewer 1순위 공격 포인트가 됨.
2. **최신 Round 9 전수 데이터가 N=1** — v3 28.2%(fallback 1, AI_TIMEOUT), v4 unlimited 20.5%(max 1337s), v2-zh 23.1%, v2 재실측 25.6%. 모두 single run. Std 추정 불가 → p-value 제시 불가 → 학술 submission 부적합.
3. **주 메시지 후보는 이미 확보** (강점): v2(영문) 이 변형 전체를 상회, 중문 번역은 ceiling 을 낮추고, timeout 확장(v4 unlimited)은 place rate 향상에 기여하지 못함. 3가지 negative result 모두 "지식 추가" 성격. 블로그/테크리포트 수준에서는 지금도 가치 충분.
4. **Cost 여유, Sprint 6 부담**: DeepSeek 잔액 ~$3.02, Daily limit $20. N=3 재검증 1회당 ~$0.04×3 = $0.12. 비용 부담은 사실상 제로. 단, Sprint 6 잔여 태스크(대시보드 PR 4/5, V-13e 조커 UX, SEC-REV-008/009, Istio Phase 5.2 후속)가 많아 논문 쓰기로 3~5일 block 되면 Sprint 6 일정 손실.
5. **1인 개발자 현실**: 애벌레는 PM/Dev 겸직. 학술 논문 writing 은 보통 20~40시간 통짜 집중 요구 → 현재 Sprint 6 Day 8 시점에 realistic 하지 않음. 블로그 에세이(4~8시간)는 현 동력으로 충분.
6. **GPT-5-mini 쪽 데이터는 v2 결정으로 이미 close** — 57번 empirical 에서 v4 의 reasoning_tokens −25%/Cohen d=−1.46 로 v2 확정. GPT 쪽은 완결 서사. DeepSeek 만 missing piece. 즉 "RummiArena LLM 프롬프트 실측 보고" 는 **2개 모델 완결 서사**로 묶을 수 있다 — 이건 논문보다 **테크리포트/블로그**에 더 적합한 범위.
7. **venue 현실성 평가**: arXiv preprint 는 가능(게이트 없음), 그러나 학회(NeurIPS, ACL, EMNLP) submission 은 N=1~3 로는 desk reject 가능성 높음. NeurIPS dataset track 이나 LLM Eval workshop 이 그나마 현실적이나 submission deadline/acceptance rate 고려 시 Sprint 6 안 불가. **블로그/테크리포트 → arXiv preprint → (여력 되면) workshop** 단계 게이트가 비용-성능 최적.

---

## 3. 데이터 현황 테이블

### 3.1 DeepSeek Reasoner variant 실측 전수

| Variant | Date | Round | N (80턴 대전) | Place Rate | Tiles | Fallback | Avg Latency | Cost | Notes |
|---|---|---|---|---|---|---|---|---|---|
| v2 (EN baseline) | 2026-04-06 | R4 | 1 | **30.8%** | 32 | 0 | 175s | $0.04 | Historical #1 (5127s) |
| v2 (EN baseline) | 2026-04-10 | R5 Run3 | 1 | **30.8%** | — | 0 | 211s | — | Historical #2 (8237s, timeout 500s) |
| v2 (EN baseline) | 2026-04-17 | R9 Phase2 | 1 | **25.6%** | 32 | 0 | 203s | $0.039 | Day 7 재실측 (7929s) — **Δ=−5.2%p** |
| v2-zh (ZH 번역) | 2026-04-17 | R9 Phase1 | 1 | **23.1%** | 28 | 0 | 147s | $0.039 | Initial meld T34 지연, negative result |
| v3 | 2026-04-18 | R9 Phase3 | 1 | **28.2%** | 27 | 1 (AI_TIMEOUT@709s) | 347s | $0.039 | Fallback 1건, 5127s baseline 대비 latency 높음 |
| v4 | 2026-04-15~16 | R6 Phase2 | 2 | 25.95% avg | — | — | +52% vs v2 | — | Regression 의심 (논문 58 §2) |
| v4.1 NEUTRAL | 2026-04-16 | fixture | 3 (single turn) | n/a (fixture) | 6.33 | n/a | 273s | — | Thinking Budget 제거, v2 동등 |
| v4 unlimited | 2026-04-18 | R9 Phase4 | 1 | **20.5%** | 27 | 0 | 414s (max 1337s) | $0.039 | timeout 확장도 place 회복 안 됨 |
| v5 / v5.1 / v5.2 | 2026-04-16~ | R7~R8 | N=1 각 | 다양 (생략) | — | — | — | — | 범위 외 |

### 3.2 v2 N 대 표본 요약

| 지표 | v2 R4 | v2 R5 | v2 R9 재실측 | 평균 | std |
|---|---|---|---|---|---|
| Place Rate (%) | 30.8 | 30.8 | 25.6 | **29.1** | **3.0** |
| Tiles placed | 32 | — | 32 | 32 | 0 |
| Fallback | 0 | 0 | 0 | 0 | 0 |
| Avg latency (s) | 175 | 211 | 203 | 196 | 19 |

- N=3 에서 std=3.0%p. v2-zh (23.1%) 와의 Δ=−6.0%p 는 약 **2σ 경계** — marginal significance.
- v4 unlimited (20.5%) 와의 Δ=−8.6%p 는 **약 2.9σ** — 다소 유의하나 여전히 N=1 vs N=3 비교 한계.

### 3.3 GPT-5-mini (참고, 논문 scope 확장 시)

| Variant | Round / 실험 | N | Place Rate / 주요 지표 | Notes |
|---|---|---|---|---|
| v2 | R4 (3모델) | 1 | 33.3% (완주 14턴, WS_CLOSED) | 불완전 |
| v2 | Day 6 재측정 | 1 | 30.8% (80턴 완주) | baseline |
| v4 | Day 5~6 empirical | 3 (single turn) | reasoning_tokens −25% (Cohen d=−1.46), tiles 동등 | v2 유지 근거 |

→ "2 모델 × variant 비교" 엮으면 블로그 성격 1편에는 충분.

---

## 4. 논제 후보별 방어가능성

### 후보 A: "추론 모델에 CoT 지시 추가는 역효과 (v4 regression)"
- **근거**: Round 6 N=2 v4=25.95%, v2=30.8%. Fixture N=3 에서 v4 tiles 7 vs v2 6.33 (역전) + reasoning_tokens +17%.
- **방어력**: **중** — fixture 와 80턴 대전의 결과가 일치하지 않음. 58번 문서 결론도 "noise 가능성 배제 못함". N=3 대전 재측정 없이는 약함.
- **블로그에는 OK, 논문에는 부족.**

### 후보 B: "프롬프트 언어 변경은 성능 중립적/부정적 (v2-zh)"
- **근거**: v2-zh 23.1% vs v2 R4/R5 30.8% (Δ=−7.7%p) / v2 재실측 25.6% (Δ=−2.5%p). Initial meld T34 로 10~14턴 지연.
- **방어력**: **약** — v2 재실측이 25.6% 면 Δ 가 -2.5%p 로 축소. 2σ 경계. 78% 중문 reasoning 가설 검증하려면 reasoning_content 언어 분포 quantitative 분석 필요(AI Engineer 미완).
- **negative result 서사로 블로그 적합, 논문 single paper scope 로는 약함.**

### 후보 C: "추론 모델 timeout 확장의 diminishing return (v4 unlimited)"
- **근거**: v4 unlimited max 1337s(!) / place 20.5%. timeout 500s 환경의 v2 R5 Run3 30.8% 보다 **오히려 −10.3%p 낮음**. "사고 시간을 줘도 좋아지지 않는다" 는 counter-intuitive 지식.
- **방어력**: **중~상** — 결과가 명확하고 흥미롭다. 다만 N=1. 한 번 더 검증하면 강력한 주장 가능.
- **블로그에 가장 매력적, 논문화도 가능성 있음 (N=2~3 보강 후).**

### 후보 D (새로 제안): "Multi-variant systematic evaluation of Rummikub-playing DeepSeek-R1: language, prompt structure, timeout budget" — 통합 서사
- **근거**: v1/v2/v2-zh/v3/v4/v4.1/v5/v5.1/v5.2 + v4 unlimited 의 9+ variant 전수 실측.
- **방어력**: **상** — 1인 개발자가 systematic 하게 돌린 ablation study 자체가 독창적. Rummikub × LLM 조합도 unique. 단, 각 variant N=1 이 여전히 약점.
- **필요**: v2/v4/v2-zh/v4 unlimited 최소 N=3 로 승격, 대시보드 시각화.
- **권고 논제**. 블로그/테크리포트 1차 → N=3 보강 → arXiv preprint 2차.

---

## 5. 데이터 충분성 판단

### 5.1 통계적 최소 요구 (내부 기준)
- **블로그/에세이**: N=1 도 허용 (서사 중심, 재현가능성 명시)
- **테크리포트 (GitHub repo, arXiv technical note)**: 주요 claim 당 N≥2, 방어용 variant 는 N=1 OK
- **학회 workshop / short paper**: 주요 claim N≥3, 분산 제시, Cohen d 또는 p-value
- **학회 full paper**: N≥5, multi-seed, ablation, baseline 비교 (GPT/Claude/Ollama 최소 1개 더)

### 5.2 현재 위치
- 블로그: **충분** (현 데이터로 착수 가능)
- 테크리포트: **경계선** (v2 재실측 2회면 가능)
- workshop: **부족** (v2/v4/v4 unlimited/v2-zh 각 N=3 필요)
- full paper: **매우 부족**

### 5.3 최소 추가 실험 (N 보강)

| 대상 | 현재 N | 목표 N | 추가 run | 예상 소요 | 예상 비용 |
|---|---|---|---|---|---|
| v2 (EN baseline) | 3 (R4/R5/R9) | 5 | +2 | 4h | $0.08 |
| v4 (CoT 추가) | 2 (R6 Phase2) | 3 | +1 | 2.5h | $0.04 |
| v4 unlimited | 1 (R9) | 3 | +2 | 6h (max latency 이슈) | $0.08 |
| v2-zh | 1 (R9) | 3 | +2 | 3.5h | $0.08 |
| **소계** | — | — | **+7 run** | **~16h** | **~$0.28** |

API cost 는 무시할 수준. 문제는 **시간(16h, max latency run 포함)** — Day 8 ~ Day 10 3일이면 가능하나 Sprint 6 개발 정체 위험.

---

## 6. Scope/Venue 현실성

### 6.1 1인 개발자의 현실적 Output 포맷

| 포맷 | 시간 투자 | 논문화 기여 | 애벌레 적합성 |
|---|---|---|---|
| GitHub README 확장 섹션 | 2h | 낮음 | ★★★ |
| 블로그 에세이 (tech notes) | 4~8h | 중 | ★★★ (가장 빠른 ROI) |
| arXiv technical report (8~12페이지) | 20~30h | 중~상 | ★★ (여력 시) |
| Workshop short paper (4~6페이지) | 30~50h | 상 | ★ (Sprint 6 중 불가) |
| Conference full paper | 100h+ | 매우 상 | ✗ (Sprint 6 중 불가) |

### 6.2 권고 Venue 순서
1. **1차 (Day 8~Day 14)**: `docs/03-development/` 에 에세이 스타일 테크노트 1~2편 (`19-deepseek-variant-ablation.md`, `20-timeout-budget-diminishing-return.md`). 내부 산출물.
2. **2차 (Week 3, N=3 재검증 후)**: arXiv technical report 작성 — GitHub 공개용, peer review 없음, DOI 획득 가능.
3. **3차 (Sprint 7 이후)**: arXiv 기반으로 NeurIPS LLM Eval workshop 또는 ACL Industry track 재구성.

---

## 7. 리스크

### 7.1 GO now 리스크 (만약 지금 착수 시)
- **R1 — baseline flip**: v2 N=3 재검증에서 31% 쪽이든 25% 쪽이든 shift 확인되면 논문 전체 주장이 재작성. 작성 → 재실험 → 재작성 순환.
- **R2 — Sprint 6 일정 정체**: 대시보드 PR 4/5, V-13e 조커 UX, SEC-REV-008/009 밀림. Sprint 6 계획 헌장 위반.
- **R3 — reviewer 공격 면**: 단일 N, 단일 모델, 단일 게임에서 일반화 주장 약함. reject 가능성.
- **R4 — 비용 초과는 아님**: DeepSeek $3.02 잔액, N=5 재검증도 $0.3 미만. 금액 리스크 없음.

### 7.2 GO after data boost 리스크 (Day 8~10 N=3 재검증 후 착수)
- **R5 — 추가 2~3일 지연**: 논문 착수 시점이 Day 10 이후로. 그러나 블로그 에세이는 병행 가능.
- **R6 — v2 재검증에서 25.6% 쪽이 stable 로 확정 시**: R4/R5 historical 30.8% 를 "outlier" 로 재해석 필요. v4 regression 서사가 "v4 도 비슷" 으로 약화될 수 있음 (기존 claim 반전 리스크).
- **R7 — v4 unlimited 재현 시 place > 20.5%**: "diminishing return" 주장이 약화.

### 7.3 No-Go / Defer 리스크
- **R8 — 실험 신선도 증발**: 2~3개월 뒤면 DeepSeek-R2/R3, GPT-6 등 새 모델 출시로 현재 결과가 historical curiosity 로 전락 가능.
- **R9 — 기회비용**: 이미 쌓인 $3+ 비용과 Day 5~7 3일의 실측 노동이 "개인 참고"로만 머무름.

### 7.4 최종 리스크 매트릭스 (선택한 GO after data boost 기준)

| 리스크 | 확률 | 영향 | 대응 |
|---|---|---|---|
| R5 지연 | 상 | 중 | Day 8 병행 블로그 초안 작성 |
| R6 v2 재해석 | 중 | 중 | R4/R5 의 2회 30.8% 일관성 자체가 signal. "outlier" 프레임이 아니라 "재현성 분산" 프레임으로 서사 |
| R7 v4 unlimited 반전 | 중 | 낮 | 3회 중 1회라도 v2 상회하면 "conditional advantage" 서사로 pivot |
| R8 신선도 증발 | 낮~중 | 상 | Week 3 까지 arXiv preprint 게시로 방어 |

---

## 8. Day 8 실행 항목 (구체적 To-Do)

### 8.1 오전 (Day 8 AM, 2~3h)
- [ ] **AI Engineer 에 의뢰**: Round 9 5-way 종합 분석 문서 `docs/04-testing/60-round9-5way-analysis.md` 완성 및 제출 (이미 병행 중). v2 N=3 sample variance, v2-zh reasoning_content 언어 분포, v4 unlimited latency distribution 포함.
- [ ] **PM (애벌레)**: 본 결정서 기반 Day 8 scrum 에서 논문화 방향 발표 → 애벌레 consent 확인.
- [ ] **스케줄 재배치**: Sprint 6 잔여 태스크 우선순위 — V-13e 조커 UX 와 대시보드 PR 4/5 는 Day 8 오후에 frontend-dev (Sonnet 4.6) 로 위임. PM 은 논문 파이프라인 집중.

### 8.2 오후 (Day 8 PM, 3~4h)
- [ ] **v2 N=3 → N=5 보강 Run #1**: DEEPSEEK_REASONER_PROMPT_VARIANT=v2 로 전환, 80턴 1회 추가 (`work_logs/battles/r10-validation/v2-run4.log`). 예상 ~100분.
- [ ] **v4 unlimited N=2 보강 Run #1**: DEEPSEEK_REASONER_PROMPT_VARIANT=v4 + 4097s timeout 로 1회 추가. 예상 최대 ~120분. Cost 추적 watch.
- [ ] **두 run 병행 금지** (Istio timeout 동일 경로). 순차 실행.

### 8.3 밤 (Day 8 Night, 2~3h)
- [ ] **블로그 에세이 초고 시작**: `docs/03-development/19-deepseek-variant-ablation.md` — 3,000~5,000자, 서사 중심, 그래프 제외 초안.
  - Section 1: 왜 variant 를 돌렸나 (Round 4 30.8% → 튜닝 동기)
  - Section 2: variant 7종 개요 (v1~v5.2 + v2-zh)
  - Section 3: 주요 발견 3가지 (v2 우위, v2-zh negative, v4 unlimited diminishing return)
  - Section 4: 실패한 가설 (중문 이중번역, Thinking Budget)
  - Section 5: 한계와 다음 실험

### 8.4 GO/No-Go 재판단 시점
- **Day 10 (2026-04-20)**: v2 N=5 + v4 N=3 + v4 unlimited N=3 + v2-zh N=3 완료 후 재판단. 이 시점 데이터로:
  - 블로그 에세이 최종화 (Day 11~12, 8h)
  - arXiv preprint 작성 착수 GO/No-Go 재결정 (Day 13)

### 8.5 비용 예산
- Day 8~10 추가 실험 비용: ~$0.30 (DeepSeek 잔액 $3.02 중 10%)
- DAILY_COST_LIMIT_USD=$20 대비 1.5% 소진
- HOURLY_USER_COST_LIMIT_USD=$5 안전 (DeepSeek $0.013/hr 수준)

---

## 9. 대안 3안 공식 기록

| 안 | 내용 | 장점 | 단점 | 결정 |
|---|---|---|---|---|
| **GO now** | 즉시 논문 초안 착수, 현 데이터로 작성 | 속도, 신선도 유지 | baseline 흔들림, Sprint 6 정체, reviewer 공격 | **기각** |
| **GO after data boost** (선택) | Day 8~10 N=3 재검증 + 블로그 1차 → Day 13~ arXiv 재판단 | 데이터 방어력 확보, 블로그로 동시 산출, Sprint 6 병행 | 2~3일 지연, R6 baseline 재해석 가능 | **채택** |
| **No-Go / Defer** | 현 시점 논문화 부적절, Sprint 7 이후 재검토 | Sprint 6 risk 최소화 | 실험 신선도 감소, 기회비용 | 기각 — 블로그/테크노트만이라도 병행해야 기억/노하우 보존 |

---

## 10. 산출물 체크리스트 (Day 8~14)

- [ ] Day 8: `docs/04-testing/60-round9-5way-analysis.md` (AI Engineer)
- [ ] Day 8: `docs/03-development/19-deepseek-variant-ablation.md` 초고
- [ ] Day 9~10: v2 N=5, v4 N=3, v4 unlimited N=3, v2-zh N=3 실측 완료
- [ ] Day 10: `docs/04-testing/61-validation-batch-r10.md` — 보강 run 종합
- [ ] Day 11~12: 블로그 에세이 최종화 + 그래프 추가 (대시보드에서 export)
- [ ] Day 13: arXiv preprint 착수 GO/No-Go 재결정 (본 결정서 update)
- [ ] Day 14+: preprint 착수 시 `docs/03-development/20-arxiv-draft-v1.md` 신설

---

## 11. 성공 판정 기준 (Day 10 재판단 시)

다음 3개 중 2개 이상 만족 시 arXiv preprint 착수 GO:

1. **v2 N=5 std ≤ 3.5%p** (현재 N=3 에서 3.0) → baseline stable 확증
2. **v4 unlimited N=3 에서 최대 place rate < v2 평균** → diminishing return 서사 유지
3. **v2 vs v2-zh Cohen d > 0.8 OR p < 0.1 (t-test)** → negative result 방어 가능

2개 미만 만족 시 블로그/테크노트 level 로만 마무리, preprint 는 Sprint 7 이후 재검토.

---

## 12. 기술적 Deep-dive (자료 보강)

### 12.1 v2 baseline 흔들림의 해부

R4(2026-04-06), R5 Run3(2026-04-10), R9 Phase2(2026-04-17) 의 3회 실측을 timeline 으로 정렬하면 다음 변수가 변동했다:

| 구간 | AI_ADAPTER_TIMEOUT_SEC | Istio VS | WS timeout | AI_COOLDOWN_SEC | 비고 |
|---|---|---|---|---|---|
| R4 (04-06) | 240 | 미적용 (NGINX) | 270 | ? | 최초 3모델 대전 |
| R5 Run3 (04-10) | **500** | 미적용 | **770** | 0 | timeout 상향, fallback 0 달성 |
| R9 Phase2 (04-17) | **700** | **710** (Day 4 상향) | 770 | **0** | Istio 도입 후 |

추정: R9 의 −5.2%p 감소는 **프롬프트 외 변수** (Istio 도입, adapter timeout 700s, 중간 코드 패치 v5.1 tilesFromRack) 가 개입한 결과 가능. 즉 "v2 baseline shift" 가 프롬프트 때문이 아니라 인프라 drift 때문일 수 있다. 논문에서 이 점을 해명하지 못하면 reviewer 가 "confound" 로 공격. → N=3~5 재검증이 이 해명의 증거 base.

### 12.2 v4 unlimited max 1337s 의 의미

Round 9 Phase 4 에서 v4 unlimited 의 response time distribution:

| Percentile | Latency (s) |
|---|---|
| min | 152.0 |
| p50 | 352.0 |
| avg | 413.7 |
| max | **1337.0** |

- p50~avg: 평균 대비 p50 이 60s 낮음 → 후반부 long-tail 이 평균을 견인. 이는 v2 (avg 203s, p50 204s) 와 달리 **비대칭 분포**.
- max 1337s = **22분** 한 턴. 8 place / 39 AI turns = 20.5%. 사고 시간을 3배 줘도 place rate 가 v2 (500s budget)의 2/3.
- 해석 후보:
  1. DeepSeek-R1 이 자유 시간에서 over-think → 이미 정답인 move 를 "재검토" 하느라 오히려 fallback(DRAW) 경향
  2. prompt 가 긴 thinking 을 유도하나 payoff 는 없음 (reasoning quality saturation)
  3. 80턴 내 게임 진행도가 느려져 place 기회 자체가 감소 (elapsed 16135s = 4.5시간)

이 분석 자체가 블로그 1편 가치. 단, N=1 이라 "이게 안정적 패턴인지" 는 불분명. N=3 이 필요한 핵심 이유.

### 12.3 v2-zh 의 Initial meld 지연 수수께끼

v2-zh 와 v2 의 initial meld 타이밍 대조:

| Variant | First PLACE turn | Tiles at first place | Days to meld sum ≥ 30 |
|---|---|---|---|
| v2 R9 재실측 | T6 | 9 | 빠름 |
| v2-zh R9 | **T34** | 9 | 매우 느림 |
| v3 R9 | T2 | 3 | 매우 빠름 |
| v4 unlimited R9 | T8 | 9 | 빠름 |

v2-zh 만 T34 까지 initial meld 가 지연됐다. 가설:
- **H1**: 중문 프롬프트가 "30점 합 규칙" 을 보수적으로 해석하게 만듦 → 점수 계산 안전 마진 상승 → 초기 draw 반복
- **H2**: 중문 few-shot 예시가 구조적으로 덜 aggressive 한 move 를 보여줌 → 모방 경향
- **H3**: 번역된 system prompt 의 용어 선택이 "reduce risk" 뉘앙스를 내재

검증 방법: v2-zh 의 reasoning_content 로그를 T02~T32 구간에서 sampling → 규칙 해석 문장 추출 → v2 와 비교. AI Engineer Task #8 에 포함.

### 12.4 GPT v2 결정과의 대비

GPT-5-mini 쪽은 57번 empirical 에서 **N=3 single-turn fixture** 로도 Cohen d=−1.46 (reasoning tokens) 을 확보해 v2 유지 결정했다. DeepSeek 은 같은 방법론을 58번에서 적용했으나 d=0.68 (작음) / d=0.00 (tiles) 로 **유의한 regression 확인 못함**. 두 모델의 결정 신뢰도 대비:

| 모델 | Fixture N | Cohen d (regression) | 80턴 N | 결정 근거 강도 |
|---|---|---|---|---|
| GPT-5-mini | 3 | **d=−1.46** (강) | 1~2 | 강 (v2 확정) |
| DeepSeek-R1 | 3 | d=0.68 (중) / d=0.00 (tiles) | 1~2 | 중 (v2 잠정) |

이는 논문에서 "GPT 는 강한 ablation 증거, DeepSeek 은 ongoing investigation" 으로 서술해야 함을 시사한다. 한 논문에 두 모델 같은 confidence 로 적기 어렵다 → DeepSeek 만으로 한 편, 또는 "2개 모델 대비" 서사로 분리.

---

## 13. 참고: 타 연구와의 positioning

### 13.1 LLM 게임 연구 landscape (2025~2026)
- **체스/바둑**: AlphaZero 이후 LLM 은 전통적 MCTS/AlphaZero 대비 열세. 흥미 감소.
- **텍스트 기반 게임 (Zork, Craft)**: LLM 의 언어 이해 + 장기 계획 benchmark. 활발.
- **보드게임 (Monopoly, Catan)**: 아직 초기. LLM 의 multi-agent 협상 benchmark.
- **Rummikub**: 거의 없음. 타일 조합 탐색 + 규칙 검증 + 멀티 AI 전략 benchmark 로 unique position.

본 연구의 주장 "prompt ablation on a reasoning-heavy tile combinatorics game" 은 niche 지만 novel. 단, N 부족 지적은 피할 수 없음.

### 13.2 Rummikub 검색 결과 (2026-04 기준 간단 조사)
- Kruijswijk et al. (2009) — "Rummikub with approximate reasoning": 전통 AI 접근, 규칙 검증 알고리즘
- LLM 시도는 블로그 수준 몇 건. peer-reviewed 거의 없음.
- 즉 "Rummikub × LLM" 공간은 사실상 blue ocean. Novelty 자체는 높다.

---

## 14. PM 의 개인 메모 (애벌레 전용)

본 판단서를 작성하며 느낀 점을 짧게.

Round 9 는 우리의 가장 복잡한 실험 round 였다. 4개 variant 를 같은 날 밀어붙였고, v2 가 "stable baseline" 이었다는 가정이 Day 7 저녁 25.6% 를 보자마자 흔들렸다. 이 순간의 감정은 "아, 이제부터 처음부터 다시 검증해야 하나" 였다.

그러나 냉정히 보면 v2 는 여전히 30.8% → 30.8% → 25.6% 로 **평균 29.1% ± 3.0** 이고, v2-zh (23.1%), v4 unlimited (20.5%) 보다는 여전히 우위다. 무너진 것은 **"30.8% 가 고정값이다"** 라는 **정밀도** 가정이었지, "v2 가 최고다" 라는 **순위** 가정이 아니다.

논문화는 이 두 가정을 구분할 수 있을 때 가능하다. 블로그는 구분 없이도 서사로 서술 가능하다. 그래서 블로그 먼저, 논문 나중 — 이 결정은 사실 매우 자연스럽다.

Sprint 6 Day 8 이 아니라 Sprint 7 초입에 preprint 올리는 것도 나쁘지 않다. 그때면 대시보드도 완성돼 그래프 export 가 쉽고, PostgreSQL `prompt_variant_id` 컬럼도 추가되어 쿼리 편의성도 좋을 것. 오히려 당장 안 쓰는 게 더 좋은 논문을 만든다.

— PM, 2026-04-18 아침

---

## 15. 변경 이력

| 일자 | 내용 | 담당 |
|---|---|---|
| 2026-04-18 AM | 초판 작성 — GO after data boost 결정 | PM |
| 2026-04-18 AM | §12 technical deep-dive, §13 positioning, §14 메모 추가 | PM |
| (예정) 2026-04-20 | Day 10 N=3 재검증 후 preprint 착수 GO/No-Go 재판단 | PM |

---

*본 판단서는 Sprint 6 Day 8 scrum 의 논의 input 으로 사용된다. 애벌레가 반대 의사 표시 시 §9 대안 재검토.*
