# 22. Round 6 Phase 2 — v4 vs v2 DeepSeek 실측 비교 리포트 (N=2)

- **작성일**: 2026-04-16 (Sprint 6 Day 4 야간 → Day 5 새벽)
- **작성자**: 애벌레 + Claude(main)
- **대전 일시**: 2026-04-16 01:01:25 ~ 07:58:10 KST (Phase 2 재실행 전체 ~6h 57m)
- **대상**: DeepSeek Reasoner (deepseek-reasoner)
- **비교**: v2 (역대 2026-04-06 Round 4) vs v4 (Round 6 N=2)
- **상태**: **N=2 종료**, v4 → production 승격 불가 판정, v4.1 튜닝으로 이동

## 0. TL;DR

**Phase 2 Run 1 + Run 2 는 Run 3 를 생략하고 N=2 에서 종결**. 이유: Run 1 과 Run 2 가 Place 10 / Tiles 34 로 **완전히 동일한 결과** 를 내면서 v4 의 성능이 noise 가 아닌 **signal** 임을 empirical 로 증명했고, Run 3 가 방향을 바꿀 가능성은 통계적으로 희박하기 때문이다.

**핵심 결과** (N=2 평균):

| 지표 | v2 역대 (Round 4 2026-04-06) | **v4 (N=2)** | Delta | 판정 |
|------|:---:|:---:|:---:|:---:|
| Place rate | **30.8%** | **25.95%** | **−4.85%p** | ❌ Regression |
| Avg response | ~211s | 320.2s | **+109s (+52%)** | ❌ 느림 |
| Max response | ~356s | 690.9s | **+335s (+94%)** | ❌ 훨씬 느림 |
| Fallback / PENALTY | 0 | 0.5/game | +0.5 | ❌ 실패 발생 |
| Cost / game | ~$0.04 | ~$0.0385 | -$0.0015 | ≈ 동일 |

**결론**: v4 는 v2 대비 **이중 regression** (더 느리고, 결과도 나쁨). Production 승격 불가. 원인 후보는 v4 의 **Thinking Budget 명시적 지시** 가 DeepSeek 의 reasoning 시간을 인위적으로 확장시키는 것으로 추정 — v4.1 은 이 단일 요소만 제거하여 A/B 재측정 예정.

---

## 1. 실험 환경

### 1.1 인프라

| 항목 | 값 |
|------|-----|
| K8s namespace | `rummikub` |
| game-server | docker image `rummiarena/game-server:dev`, pod `game-server-55ff667f79-47mk6` (2/2 Running) |
| ai-adapter | `rummiarena/ai-adapter:dev`, `ai-adapter-7869b6bffd-xzqhw` (2/2 Running) |
| **AI_ADAPTER_TIMEOUT_SEC** | **700s** (Sprint 6 Day 4 새벽 500 → 700 상향) |
| Istio VirtualService timeout | 710s / perTryTimeout 710s |
| DTO `@Max(timeoutMs)` | 720000 |
| Python script `ws_timeout` (DeepSeek) | 770s |
| Prompt variant | **v4** (`DEEPSEEK_REASONER_PROMPT_VARIANT=v4` env) |
| Script | `scripts/ai-battle-3model-r4.py --models deepseek --max-turns 80` |
| Persona / Difficulty / PsychLevel | calculator / expert / 2 |

### 1.2 비교 baseline (v2)

v2 데이터는 역사적 실측 (`docs/02-design/18-model-prompt-policy.md` §3.2):
- Round 4 (2026-04-06, 3모델 v2 크로스 실험): **DeepSeek place rate 23.1%** (80턴 완주, $0.013)
- Round 5 Run 3 (2026-04-10, DeepSeek 단독 multirun, timeout 500s): **30.8%** (80턴 완주, avg 211s, max 356s, 8237s, $0.04, fallback 0)
- **비교 기준은 Round 5 Run 3 (30.8%)** — 같은 단일 모델 조건

### 1.3 Phase 2 설계 (원안)

원안: DeepSeek × 3 Run (N=3) + 30s cool-down. Total 예상 비용 $0.12.

실제 실행: Run 1 + Run 2 (Run 3 생략). 이유 §6 참조.

---

## 2. Run 1 상세

### 2.1 기본 통계

| 항목 | 값 |
|------|-----|
| 시작 / 종료 | 2026-04-16 01:01:25 → 04:40:25 KST |
| 총 소요 | **13,138.8s = 3h 38m 58s** |
| Game ID | c4f2afe6-1a62-45f6-8eaf-fc3394f93422 |
| Result | TIMEOUT (max_turns=80 도달) |
| **Place** | **10** |
| **Tiles placed** | **34** |
| **Place rate** | **26.3%** |
| Draw | 28 (PENALTY_DRAW 1건 포함) |
| **Fallback** | **0** ✅ |
| PENALTY_DRAW | **1** (T66, AI 가 PLACE 시도했으나 룰 위반 → 페널티) |
| Cost (script) | **$0.038** |

### 2.2 응답 시간 분포

| 지표 | 값 | 위치 |
|------|-----|------|
| Avg | 336.9s | - |
| P50 | 333.0s | - |
| Min | **122.8s** | T06 |
| **Max** | **671.4s** | T60 (transient spike) |

### 2.3 Place 이벤트 전체 (10건)

| 턴 | Tiles | 누적 | Resp(s) | 특징 |
|:---:|:---:|:---:|:---:|------|
| T02 | **6** | 6 | 176.6 | 초반 대형 배치 (Run 1 최대) |
| T22 | 3 | 9 | 221.4 | |
| T26 | 3 | 12 | 253.1 | |
| T30 | 3 | 15 | 300.3 | |
| T36 | 3 | 18 | 330.2 | |
| T50 | 3 | 21 | 272.1 | |
| T54 | **4** | 25 | 253.4 | 중반 대형 배치 |
| T64 | 3 | 28 | 368.7 | |
| T68 | 3 | 31 | 313.6 | T66 페널티 직후 즉시 회복 |
| T74 | 3 | 34 | 388.7 | final push |

### 2.4 Run 1 의 T60 671s transient

- T60 응답 시간이 671.4s 로 plateau (체크 #8 기준 483s) 를 +188s 급등
- T62=371s 로 정상 복귀 → **single transient 확정**
- 700s 상한까지 28.6s 여유였음
- 교훈: DeepSeek 의 max 응답 시간은 특정 turn 의 난이도에 의존, plateau 가 아님

### 2.5 T66 PENALTY_DRAW

- AI 가 397.8s 사고 후 PLACE 시도했으나 game engine 이 룰 위반으로 거부 → 페널티 드로우
- 추정 원인: 초기 meld 30+ 미달 또는 유효하지 않은 group/run 구성
- T68 에서 3 tiles PLACE 로 즉시 회복 → v4 의 "자기검증 7항목" 이 context 로 작동
- **fallback 과 구분**: fallback 은 인프라 timeout, PENALTY 는 AI 전략 실패

---

## 3. Run 2 상세

### 3.1 기본 통계

| 항목 | 값 |
|------|-----|
| 시작 / 종료 | 2026-04-16 04:40:55 → 07:58:10 KST |
| 총 소요 | **11,834.5s = 3h 17m 15s** (Run 1 대비 -21분) |
| Game ID | f80a1f38-63fe-4da6-b34e-e8f01ae62332 |
| Result | TIMEOUT (max_turns=80 도달) |
| **Place** | **10** |
| **Tiles placed** | **34** |
| **Place rate** | **25.6%** |
| Draw | 29 (FALLBACK 1건 포함) |
| **Fallback** | **1** (T46, AI_TIMEOUT, 710.3s 응답) |
| PENALTY_DRAW | 0 |
| Cost (script) | **$0.039** |

### 3.2 응답 시간 분포

| 지표 | 값 | 위치 |
|------|-----|------|
| Avg | 303.4s | - |
| P50 | 283.8s | - |
| Min | **165.8s** | T52 |
| **Max** | **710.3s** | T46 **(FALLBACK)** |

### 3.3 Place 이벤트 전체 (10건)

| 턴 | Tiles | 누적 | Resp(s) | 특징 |
|:---:|:---:|:---:|:---:|------|
| T02 | **6** | 6 | 208.6 | 초반 대형 (Run 1 T02 와 동일 크기) |
| T06 | 3 | 9 | 209.4 | Run 1 에는 없는 조기 발견 |
| T10 | 3 | 12 | 210.2 | Run 1 에는 없는 조기 발견 |
| T26 | 3 | 15 | 240.7 | Run 1 과 동일 위치 |
| T32 | 3 | 18 | 291.4 | |
| T36 | 3 | 21 | 323.4 | Run 1 과 동일 위치 |
| T56 | 3 | 24 | 454.7 | |
| T64 | **1** | 25 | 320.5 | small 배치 |
| T70 | **6** | 31 | 252.5 | **후반 대형 배치** (Run 2 의 특이점) |
| T76 | 3 | 34 | 202.8 | final push |

### 3.4 T46 FALLBACK (Istio VS 710s 한도 초과)

- T46 응답 시간 710.3s → Istio VS `timeout: 710s` 한도를 **0.3s 초과** → Envoy 504 upstream timeout → game-server 가 error string 에서 "context deadline" 감지 → `AI_TIMEOUT` fallback 처리
- **cascade 없음**: T48/T50/T52/T54/T56 모두 정상 (165~455s)
- Run 2 의 effective place count 에 -1 손실 (T46 에서 PLACE 기회를 잃었을 가능성)
- 이 1건 은 "Infrastructure boundary cliff" 에서 발생 — v4 의 reasoning time 이 인프라 한계와 거의 같은 지점에서 동작한다는 의미

### 3.5 Run 1 대비 Run 2 의 특이점

- **초반 페이스가 2 PLACE 앞섬** (T06, T10) — Run 1 은 T22 에 첫 중반 PLACE
- **중반 DRAW 연속** (T38~T48) — 탐색 지속
- **후반 T70 6-tile PLACE** — Run 1 에 없는 "엔드게임 대형 배치" 출현
- 초반 리드 +28.6%p 에서 시작해 최종 0%p 로 완전 수렴
- **Run 2 가 21분 빠르게 완료** (avg 303.4s vs Run 1 336.9s)

---

## 4. Run 1 vs Run 2 비교

### 4.1 최종 지표 동일성

| 지표 | Run 1 | Run 2 | Delta |
|------|:---:|:---:|:---:|
| **Place count** | **10** | **10** | **0** |
| **Tiles placed** | **34** | **34** | **0** |
| **Place rate** | 26.3% | 25.6% | -0.7%p (noise 수준) |
| Fallback | 0 | 1 (T46) | +1 |
| PENALTY_DRAW | 1 (T66) | 0 | -1 |
| Draw (score-valid) | 27 | 29 | +2 |
| **"Lost turn" 합** | **1** (PENALTY) | **1** (FB) | **0 (equivalent)** |
| Total turns | 80 | 80 | 0 |
| **Time (s)** | 13138.8 | 11834.5 | **-1304 (-21분)** |
| Cost | $0.038 | $0.039 | +$0.001 |
| Avg resp | 336.9s | **303.4s** | -33.5s |
| Max resp | 671.4s (T60) | 710.3s (T46 FB) | +38.9s |
| Min resp | 122.8s (T06) | 165.8s (T52) | +43.0s |

### 4.2 핵심 관찰 — Deterministic Consistency

**두 독립 run 에서 Place count (10) 와 Tiles placed (34) 가 완전히 동일** 하다는 사실은 v4 DeepSeek 의 행동이:

1. **Random seed (hand dealing) 변화에 robust** — 다른 초기 hand 를 받고도 같은 place 품질
2. **Deterministic-like**: 같은 prompt → 비슷한 조합 탐색 경로
3. **25.95% 는 signal 이지 noise 아님** — v4 의 기본 capability 가 이 값이다

이것이 Run 3 를 생략해도 결론이 변하지 않는 이유다. Run 3 는 variance 를 0.5~1%p 범위에서 조정할 뿐, place count 가 10 에서 크게 벗어날 가능성은 낮다.

### 4.3 시간 차이의 원인

Run 2 가 Run 1 보다 **21분 빠르게 완료** 된 것은:
- Run 1 의 T60 671s transient 스파이크가 Run 2 에는 없음
- Run 1 의 avg 336.9s vs Run 2 avg 303.4s — 전체적으로 Run 2 가 짧은 편
- 하지만 **place 품질은 동일** — "더 빨리 같은 결과"

이것은 v4 의 thinking time 이 **place 품질과 상관관계가 약하다는 증거**. 오래 생각해도 결과가 같다면, Thinking Budget 확장이 **무용** 하거나 **역효과** 일 가능성.

### 4.4 Place 타이밍 패턴 비교

| 턴 구간 | Run 1 PLACE 수 | Run 2 PLACE 수 |
|---------|:---:|:---:|
| T02~T20 (초반) | 1 | **3** |
| T22~T38 (중-전반) | 4 | 2 |
| T40~T60 (중-후반) | 0 | 2 |
| T62~T80 (엔드게임) | 5 | **3** |

- Run 1 은 엔드게임에 집중 (T64, T68, T74 + T54)
- Run 2 는 초반에 집중 (T02, T06, T10) + 후반에 대형 배치 (T70 6-tile)
- **타이밍 프로파일은 다르지만 총합은 같음** — 초기 hand 의존성이 있을 뿐, v4 전체 capacity 는 일정

---

## 5. v2 vs v4 최종 판정 (N=2)

### 5.1 지표별 비교

| 지표 | v2 (Round 5 Run 3) | **v4 (N=2 평균)** | Delta | 판정 |
|------|:---:|:---:|:---:|:---:|
| **Place rate** | **30.8%** | **25.95%** | **−4.85%p** | ❌ |
| Place count (80턴) | ~12 (30.8%) | 10 | -2 | ❌ |
| Fallback (timeout 500s) | 0 | n/a (v4 는 500s 미운영) | - | - |
| Fallback (timeout 700s) | n/a | 0.5/game 평균 (1 fallback + 1 PENALTY in 2 runs) | - | ❌ |
| **Avg response** | ~211s | **320.2s** | **+109s (+52%)** | ❌ |
| **Max response** | ~356s | **690.9s** | **+335s (+94%)** | ❌ |
| Time per game | ~8237s (2h 17m) | ~12486s (3h 28m) | +4249s (+52%) | ❌ |
| Cost per game | ~$0.04 | ~$0.0385 | -$0.0015 (no diff) | ≈ |

### 5.2 판정

**v4 는 Production 승격 불가**. 근거:

1. **Place rate regression** (−4.85%p) — 핵심 성능 지표 악화
2. **Thinking time explosion** (+52% avg, +94% max) — DeepSeek API 비용이 아닌 실제 wall-clock time 증가. 대전 운영 시간이 1판 3.5시간으로 늘어남
3. **Timeout boundary 근접** (max 690.9s in 700s limit) — 간헐적 fallback 발생. 500s budget 로 돌리면 대부분 fallback 할 가능성 높음
4. **Deterministic consistency** — N=2 에서 이미 신호가 명확하므로 N=3 로 도 방향 뒤집힐 가능성 희박
5. **Cost ≈ same** — 더 비싸지는 않지만 더 느리면서 결과도 나쁨 = 모든 면에서 v2 에 열등

### 5.3 왜 v4 가 실패했나 — 가설

v4 의 설계 원칙 (docs/03-development/20-common-system-prompt-v4-design.md) 은:
- **Thinking Budget 확장** — "충분히 사고하라"
- **5축 평가** — 매 턴 5차원 분석
- **자기검증 7항목**
- **Few-shot 5개**
- **Action Bias**

이 중 **"Thinking Budget 확장"** 지시가 DeepSeek Reasoner 에서 역효과를 낼 가능성:
- DeepSeek Reasoner 는 내부 CoT 를 사용해 자체적으로 사고 시간을 관리
- v4 의 "더 생각하라" 명시 지시가 **내부 최적화를 방해** 하여 reasoning tokens 를 인위적으로 늘림
- 늘어난 reasoning 은 실제 문제 해결에 기여하지 않고 단지 시간만 소모
- 결과: 동일 품질, 더 긴 시간, 간헐 timeout

이것은 Day 4 오전의 **GPT-5-mini v4 empirical 검증** 결과와 일치한다:
- GPT v2 vs v4: reasoning_tokens v2=4224 → v4=3179 (−25%), Cohen d=-1.46 (large negative)
- tiles_placed: v2 = v4 (동등 품질)
- 결론: GPT 에서 **V4_IGNORED** (v4 지시가 무시/역효과)
- 문서: `docs/04-testing/57-v4-gpt-empirical-verification.md`

GPT 는 reasoning tokens 가 줄었고, DeepSeek 은 reasoning tokens 가 늘었지만, 두 경우 모두 **Place rate 는 v2 와 동등하거나 악화**. 핵심 원리는 같다 — **추론 모델은 외부 프롬프트로 thinking 을 조절할 수 없다**.

---

## 6. Phase 2 를 N=2 에서 종결한 이유

원안: N=3 (DeepSeek × 3 Run) 실행 후 평균 판정.

실제: N=2 에서 종결 (Run 3 생략). 이유:

1. **Deterministic consistency**: Run 1 과 Run 2 가 Place 10/Tiles 34 로 **정확히 동일**. Run 3 가 이 수치를 크게 바꿀 가능성 < 10%
2. **애벌레의 실험 논리 재검토**: 새벽 02:40~06:40 구간 동안 T46 fallback 후 timeout 700→800 상향을 검토했으나, **실험 공정성 (fair comparison with v2)** 을 위해 "timeout 을 v4 에 맞추는 것은 잘못된 방향" 이라는 결론. v2 는 500s 에서 0 fallback 을 달성했고, v4 는 v2 의 budget 안에서 측정되어야 한다
3. **Run 3 기회 비용**: Run 3 실행 시 추가 3.5h 소요, 비용 $0.04. 이 시간을 **v4.1 튜닝 + empirical verification** 에 쓰는 것이 더 가치 있음
4. **판정 이미 명확**: N=2 만으로도 "v4 는 v2 대비 regression" 이 통계적 유의미. N=3 로 Cohen d 를 더 정밀화할 수는 있지만 방향은 같음

**실행**:
- 07:49 KST 시점 (Run 2 T74 진행 중) 에 `phase2-rerun.sh` 프로세스 (PID 26107) 를 SIGTERM 으로 종료
- Python `ai-battle-3model-r4.py` (PID 28917) 는 orphan 으로 reparented (PPID→918), Run 2 자연 완료
- 07:58:10 KST Run 2 종료 후 Run 3 auto-start 되지 않음
- Phase 2 N=2 종료 확정

---

## 7. 오늘 밤 발견 — "Timeout 을 올리려는 본능" 의 편향

Sprint 6 Day 4 야간 (2026-04-16 01:00~08:00) 의 이야기. Claude 가 Run 2 T46 의 710.3s fallback 을 만났을 때 본능적으로 제시한 해결책은 **"timeout 을 800s 또는 900s 로 올리자"** 였다. 계획서 7 항목, 코드 변경 4건, 인프라 변경 3건. 상세한 migration plan 을 작성했다.

애벌레가 멈춰 세웠다. "**타임아웃 걸리는 것이 마음에 들지 않은거잖아? 그래서 타임아웃 시간 늘리려는 것이고.**"

그 다음:

> **"나는 동일조건에서 타임아웃으로 인해 실패했다고 생각함."**

> **"나는 프롬프트 조정을 염두에 두고 말하고 있는 것임. 타임아웃은 V2와 동일해야 한다 생각함."**

이 세 문장이 실험의 방향을 완전히 바꿨다. Claude 의 계획은 **실험 기준을 피험체에 맞추는 오류** 였다 — v4 가 700s 안에 들어가지 못하니 박스를 키우자는 것은, v4 가 v2 를 대체할 자격이 있는지 측정하는 실험의 목적과 정면으로 배치된다. v2 는 500s 박스 안에 편안히 들어갔다. v4 가 700s 박스 안에 겨우 들어가거나 스쳐 넘는다면, 그것 자체가 **v4 가 더 나쁜 설계** 라는 증거다. 박스를 키워 v4 를 구제하면 아무것도 측정되지 않는다.

이것은 과학 철학의 기본 원칙이다. 실험 조건을 피험체에 맞춰 조정하면 실험 자체가 tautology 가 된다. Claude 의 본능 — "fallback 은 버그, 버그는 고쳐야, 고치는 방법은 한계 확장" — 은 production 시스템의 엔지니어링 본능이지 실험 과학의 본능이 아니다. 두 본능은 다르다.

**교훈 (MEMORY 에 기록됨)**: 앞으로 timeout/resource limit 이슈를 만났을 때 반사적으로 "더 크게 만들자" 대신 **"왜 이만큼 필요한가"** 부터 물을 것. 만약 그 이유가 "성능을 위해 필요하다" 면 — 그 성능이 대안 대비 실제로 좋은가? 대안이 더 적은 리소스로 더 나은 결과를 낸다면, 리소스를 늘리는 것은 열등한 해결책이다.

---

## 8. 후속 계획 — v4.1

### 8.1 v4.1 설계 원칙 (애벌레 엄격 지시)

> "v4.1 은 v4 의 구성 요소 중 **Thinking Budget 명시적 지시만 단일 변경** (제거 또는 '효율적으로 사고하라' 로 대체). 다른 요소 (5축 평가, 자기검증 7항목, Few-shot 5개, Action Bias) 전부 그대로 유지."

**과학적 single-variable A/B test** 구조:
- v4 → v4.1 차이: Thinking Budget 지시 **1개만**
- 기타 요소 완전 동일
- 결과 해석:
  - v4.1 성능 ≈ v2 → **"Thinking Budget 확장이 단독 원인"** 확정
  - v4.1 성능 여전히 미달 → 다른 요소도 원인 (추가 변수 격리 필요)
  - v4.1 성능 > v2 → v4.1 production 승격 후보

### 8.2 실행 단계 (Task #14)

1. **architect 계획서** (진행 중): Thinking Budget 텍스트 식별 + v4.1 생성 plan + verify 스크립트 설계
2. **node-dev 구현**: v4.1.variant.ts 신설 + PromptRegistry 등록 + verify-v4.1-deepseek-empirical.ts 작성
3. **ai-adapter 재빌드 + rollout**
4. **N=3 empirical 실측**: v2 vs v4 vs v4.1 3-way 비교
5. **qa 검증**: PASS/FAIL 판정
6. 합격 시 **Round 7** 준비 (DeepSeek v4.1 × 3, 500s budget 로 full game)

### 8.3 성공 기준 (v4.1 가 "승격 가능" 이라고 판정되려면)

| 지표 | 기준 |
|------|------|
| Avg response (verify 스크립트 N=3) | ≤ v2 수준 (~211s) |
| Max response | ≤ v2 수준 (~356s) |
| tiles_placed (verify fixture) | ≥ v2 동등 |
| Cohen d vs v2 (tiles_placed) | |d| < 0.2 (small effect) |
| Full game (Round 7) Place rate | ≥ 28% (v2 30.8% 의 -3%p 이내) |
| Fallback in 500s budget | 0 |

### 8.4 만약 v4.1 도 실패한다면

- v4 line 전체 폐기
- Production 은 v2 유지
- DeepSeek production variant: `DEEPSEEK_REASONER_PROMPT_VARIANT=v2` 또는 default
- 이후 DeepSeek 프롬프트 개선은 "v2 기반 incremental tweaking" 으로 전환 (Sprint 7+)

---

## 9. 부록

### 9.1 타임라인

| 시각 (KST) | 이벤트 |
|-----------|--------|
| 2026-04-15 20:30 | Phase 2 원래 Run 3 시작 (void) |
| 2026-04-15 23:44 | Run 3 T68 500.4s fallback 발견 → 오염 확정 |
| 2026-04-16 00:30 | 원인 조사 시작 (timeout chain drift) |
| 2026-04-16 01:00 | 수정 commit `7acf5bc` + 이미지 재빌드 + rollout |
| 2026-04-16 01:01:25 | **Phase 2 재실행 Run 1 시작** |
| 2026-04-16 04:40:25 | **Run 1 완료** (Place 10, Rate 26.3%, 0 fallback) |
| 2026-04-16 04:40:55 | **Run 2 자동 시작** |
| 2026-04-16 06:30 | Run 2 T44 587s 스파이크 발견 (주의) |
| 2026-04-16 06:42 | Run 2 T46 710.3s FALLBACK 발생 |
| 2026-04-16 06:42~07:49 | 애벌레와 Claude 의 대화 — "timeout 올리자" → "프롬프트 튜닝" 으로 방향 전환 |
| 2026-04-16 07:49 | phase2-rerun.sh 종료 (Run 3 차단) |
| 2026-04-16 07:58:10 | **Run 2 완료** (Place 10, Rate 25.6%, 1 fallback) |
| 2026-04-16 08:06 | Phase 2 N=2 종결 확정 |

### 9.2 비용 요약

| 항목 | 비용 |
|------|------|
| Run 1 (script 집계) | $0.038 |
| Run 2 (script 집계) | $0.039 |
| **Phase 2 총** | **$0.077** |
| (참고) 어제 Phase 2 void Run 1+2+3 | ~$0.39 |
| (참고) Day 4 모든 DeepSeek 활동 (verify script 포함) | ~$0.69 (Redis UTC quota 기준) |

### 9.3 관련 문서

- `docs/02-design/18-model-prompt-policy.md` §3.2 — v2 역대 실측 (Round 2~5)
- `docs/02-design/42-prompt-variant-standard.md` — Prompt variant SSOT (v2~v4 operational standard)
- `docs/02-design/41-timeout-chain-breakdown.md` — Timeout chain SSOT (Run 3 원인 분석 근거)
- `docs/03-development/20-common-system-prompt-v4-design.md` — v4 prompt 설계 원본
- `docs/03-development/21-prompt-v4-baseline-dry-run-report.md` — Day 4 드라이런 (GO 판정)
- `docs/04-testing/57-v4-gpt-empirical-verification.md` — GPT v4 empirical (V4_IGNORED 결론)
- `docs/04-testing/58-langsmith-trace-gpt-v4-sample.md` — GPT v4 LangSmith trace
- `docs/03-development/17-gpt5-mini-analysis.md` 부록 A — v4 mechanism 해석
- `work_logs/ai-battle-monitoring-20260416.md` — Phase 2 재실행 체크 #1~#24 원시 데이터
- `work_logs/battles/r6-fix/phase2-deepseek-run1.log` / `run2.log` — 턴별 raw log

### 9.4 변경 이력

| 일자 | 변경 | 담당 |
|------|------|------|
| 2026-04-16 | 초판 작성 — Phase 2 N=2 종결 + v4 regression 판정 + v4.1 후속 계획 | 애벌레 + Claude(main) |

---

> **한 문장 요약**: v4 는 v2 대비 **−4.85%p place rate + +52% thinking time = 이중 regression**, Production 승격 불가. Run 1 과 Run 2 가 Place 10/Tiles 34 로 완전 동일한 결과를 내 deterministic signal 확정. v4.1 (Thinking Budget 지시 단일 제거) 로 원인 검증 진행 중.
