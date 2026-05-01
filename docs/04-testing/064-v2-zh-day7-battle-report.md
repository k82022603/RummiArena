# 59. v2-zh DeepSeek Reasoner Day 7 본 대전 실측 (Round 9)

- **작성일**: 2026-04-17 (Sprint 6 Day 7 오후)
- **작성자**: Claude(main, Opus 4.7 xhigh)
- **상태**: **진행 중** — v2-zh 완료, v2 재실측 병행 중
- **모델**: deepseek-reasoner
- **Round tag**: `r9-v2-zh`
- **연관 문서**:
  - `docs/02-design/42-prompt-variant-standard.md` §3 표 A (v2-zh variant 등록)
  - `docs/04-testing/57-v4-gpt-empirical-verification.md` (v2 vs v4 GPT empirical 선례)
  - `docs/04-testing/58-v4.1-deepseek-empirical-verification.md` (v4.1 fixture empirical 선례)
  - `docs/03-development/22-round6-v4-vs-v2-comparison.md` (Round 6 Phase 2 N=2 리포트)

---

## 1. 실험 목적 (TL;DR)

**가설**: DeepSeek-R1 계열은 내부 reasoning_content 의 약 78% 가 중문이다 (Round 8 샘플링). 영문 system prompt → 중문 reasoning → 영문 JSON 응답의 **이중 번역 오버헤드**가 place rate ceiling 을 누르고 있다는 가설. v2 의 프롬프트 본문만 중국어(简体)로 번역한 `v2-zh` variant 로 단일 변수 (언어) A/B 를 시도.

**예비 결론** (v2-zh 단독, v2 재실측 대기 중):
- **v2-zh: 23.1% (9 place / 28 tiles) / fallback 0 / 95분 / $0.039**
- v2 baseline (R4/R5): 30.8% (12 place / 32 tiles)
- Δ = **−7.7%p** — 가설 반증 방향
- 최종 판정은 v2 재실측(Round 9 Phase 2) 완료 후 공정 A/B 에서 결정

---

## 2. 설계 배경

### 2.1 번역 오버헤드 가설

Round 8 (2026-04-16) v5.1 대전에서 ai-adapter 로그의 `reasoning_content` 샘플링 결과, DeepSeek-R1 응답의 약 78% 가 중문이었다. DeepSeek-R1 은 중국 본토 기업 모델로 중문 코퍼스 비중이 높고, RLHF 가 중문 CoT 에 강하게 튜닝된 것으로 추정된다.

이 관찰에서 다음 가설이 도출됐다:

> 우리 프롬프트는 영어로 작성되어 있다. DeepSeek-R1 은 이를 내부에서 중국어로 번역해 사고하고, 다시 영어로 JSON 을 생성한다. 이 **이중 번역**은 (a) 추론 토큰을 낭비하고 (b) 규칙 해석에 왜곡을 유발할 수 있다.
>
> 프롬프트를 중문으로 직접 제공하면 이 오버헤드를 제거할 수 있지 않을까?

### 2.2 번역 원칙 (애벌레 승인, 2026-04-17)

1. **규칙 용어** (group/run/meld/joker/rack/table 등) — 중국어 번역
2. **tile 코드** (R7a, B13b, JK1 등) — 영문 유지 (시스템 식별자, 파서 호환)
3. **few-shot 예시 설명문** — 중국어 번역
4. **응답 JSON schema** (action / tableGroups / tiles / tilesFromRack / reasoning) — 영문 유지 (파서 호환 필수)

상세 번역 대역표와 보존 목록은 v2-zh variant 설계 계획서 (Architect Day 7 작성) 를 따르며, 구현은 `src/ai-adapter/src/prompt/v2-zh-reasoning-prompt.ts` 에 반영됨.

### 2.3 Single-variable A/B 설계

v2 baseline (영문) 과 v2-zh (중문) 은 다음을 **동일**하게 유지한다:
- maxTurns 80, persona=calculator, difficulty=expert, psychologyLevel=2
- WS timeout 770s, adapter timeout 700s, Istio VS timeout 710s
- few-shot 예시 구조 5개 (내용 번역, 구조 유지)
- JSON schema 필드명
- `tokenBudget`: v2=1200 / v2-zh=1700 (중문 확장 +41%, 구조 변경 없음)

차이는 **언어 단 하나**. 이것이 깨지면 A/B 성립 불가.

---

## 3. v2-zh 실측 결과 (Phase 1, 완료)

### 3.1 핵심 지표

| 지표 | 값 |
|------|-----|
| 시작 | 2026-04-17 15:18:xx |
| 완료 | 2026-04-17 16:53:36 |
| 총 소요 | 5720.7초 = **95분 21초** |
| 총 턴 | 80 (max 도달, TIMEOUT) |
| AI 턴 | 39 |
| PLACE | **9회** |
| DRAW | 30회 |
| Fallback | **0** |
| tiles placed (cumulative) | **28** |
| **Place rate** | **23.1%** (9/39) |
| 비용 | **$0.039** |

### 3.2 Place 상세 (9건)

| # | Turn | Tiles | Cumul | Response time (s) | 비고 |
|---|------|-------|-------|------|-----|
| 1 | T34 | 9 | 9 | 196.1 | **Initial meld** (sum ≥ 30 달성) |
| 2 | T38 | 3 | 12 | 183.8 | — |
| 3 | T44 | 3 | 15 | 158.8 | — |
| 4 | T52 | 3 | 18 | 181.9 | — |
| 5 | T56 | 1 | 19 | 269.5 | 중반 latency 상승 구간 |
| 6 | T60 | 4 | 23 | 259.0 | — |
| 7 | T68 | 1 | 24 | 120.5 | 후반 latency 안정 |
| 8 | T72 | 1 | 25 | 150.0 | — |
| 9 | T76 | 3 | 28 | 173.2 | 최종 PLACE |

### 3.3 Latency 패턴

| 구간 | 평균 | 관찰 |
|------|------|------|
| 초반 (T02~T20, 10턴) | ~54초 | 정상 CoT |
| 중반 (T22~T50, 15턴) | ~137초 | reasoning 확장 |
| 후반 (T52~T80, 14턴) | ~215초 | 추론 토큰 급증 |
| **전체 평균** | **146.7s** (p50=150.0, min=42.9, max=287.0) | v2 baseline (R4: 미측정 / 역대 DeepSeek 평균 176s) 보다 약간 빠름 |

초반 ~60초 → 후반 ~280초 패턴은 v2 와 유사하며, 이는 "DeepSeek 후반부 추론 토큰 자율 확장 2K→15K" 특성이 v2-zh 에도 그대로 나타남을 의미한다.

### 3.4 Initial meld 지연

- **T34** 에 첫 PLACE. T02~T32 까지 **16턴 연속 DRAW**.
- v2 R4 baseline 에서는 대개 T20 전후 initial meld. v2-zh 는 약 **10~14턴 지연**.
- 해석 (예비): 중문 프롬프트가 30점 sum 계산을 더 보수적으로 유도하거나, 번역 과정에서 점수 계산 규칙 해석이 느려졌을 가능성. 추론 샘플 분석 필요 (§5 AI Engineer 분석 대상).

### 3.5 Fallback 0, 시스템 건강성

- retryCount 0 이벤트 39/39 = 전부 1회 응답 성공
- timeout 발생 0건 (max 287s << 770s WS timeout << 700s adapter timeout)
- **v2-zh 자체는 시스템 레벨에서 완전히 건강하게 작동**. 성능 차이는 프롬프트 품질 이슈지 인프라/구현 이슈 아님

---

## 4. v2 재실측 (Phase 2, 진행 중)

> v2 R4/R5 의 30.8% 가 stable signal 인지 **특정 세션 노이즈** 인지 확증하기 위해, v2-zh 직후 동일 환경에서 v2 를 한 번 더 실측한다.

### 4.1 전환 절차 (batch-battle SKILL Phase 4 → 1 → 2 → 3 준수)

1. v2-zh Phase 4 사후 정리: Redis game:* 1개 삭제, 프로세스 종료 확인, 결과 JSON 백업
2. v2 Phase 3 env 전환: `kubectl -n rummikub set env deployment/ai-adapter DEEPSEEK_REASONER_PROMPT_VARIANT=v2`
3. rollout 완료 대기 (ai-adapter Pod 교체, `ai-adapter-5759b68486-56w7q` Ready)
4. PromptRegistry 로그 검증: `per-model-override=[claude:v4, deepseek-reasoner:v2, dashscope:v4]` 확정 확인
5. v2 80턴 백그라운드 실행 (`work_logs/battles/r9-v2-zh/v2-rerun-80t.log`)

### 4.2 측정 항목

v2-zh 와 동일. place rate / fallback / latency / tiles / initial meld timing + 비용.

### 4.3 판정 기준

| Δ (v2 재실측 − v2-zh) | 판정 | 해석 |
|---|---|---|
| ≥ +5%p | V2_SUPERIOR | v2 가 v2-zh 대비 명확히 우위. 번역 오버헤드 가설 반증 확정 → v2 production 복귀 |
| +1%p ~ +5%p | V2_SLIGHTLY_BETTER | v2 가 약간 우위. v2 production 유지. v2-zh 는 R&D archive |
| −1%p ~ +1%p | EQUIVALENT | 언어 차이 무의미. v2 production 유지 (변경 비용 없음이 이득) |
| −1%p ~ −5%p | V2_ZH_SLIGHTLY_BETTER | v2-zh 가 약간 우위. 추가 N≥3 검증 필요 |
| ≤ −5%p | V2_ZH_SUPERIOR | 가설 확증. v2-zh production 전환 검토 |

예비 신호 (v2 R4/R5 historical vs v2-zh 실측): v2-zh 23.1% vs v2 30.8% → Δ=−7.7%p → **V2_SUPERIOR** 방향. v2 재실측 결과로 최종 확정 예정.

---

## 5. 후속 분석 (대기 중)

### 5.1 AI Engineer 분석 (Task #8)

- v2 재실측 완료 후 v2 대비 v2-zh 의 reasoning_content 언어 분포 비교
- 중문 프롬프트가 실제로 중문 reasoning 비율을 높였는지, 혹은 오히려 혼재를 유발했는지
- Initial meld 지연 원인 (중문 규칙 해석 지연 / 점수 계산 보수화 등)
- 가설 확증/반증 최종 판정

### 5.2 PM 논문 초안 GO/No-Go (Task #9)

- 9종 variant dataset (v1/v2/v3/v3-tuned/v4/v4.1/v5/v5.1/v5.2/v2-zh + v2 재실측) 충분성 검토
- v2-zh 결과의 논문 기여도 판정
- Sprint 6 잔여 일정과 초안 착수 타이밍

---

## 6. 방법론 및 제약

### 6.1 제약 (N=1 의 한계)

- v2-zh 실측은 **N=1** 이다. R&D 실험 단계에서는 충분하지만 논문 근거로는 약함.
- DeepSeek 자체 분산이 크다 (R2 v2=5.0% / R4 v2=30.8%). 동일 프롬프트라도 게임 상태 초기화가 다르면 결과가 크게 흔들린다.
- 단일 run 결과를 "가설 확정" 근거로 삼지 않는다. **v2 재실측은 이 분산을 통제하기 위한 baseline re-measurement** 이지 하지 않을 경우 v2-zh 결과를 해석할 기준 자체가 없다.

### 6.2 공정성 (A/B 설계 엄수)

- Prompt 구조: v2 와 v2-zh 는 few-shot 수(5), 섹션 순서, JSON schema 가 완전히 동일
- Timeout: 동일 (770s WS / 700s adapter / 710s Istio VS)
- 대전 환경: 동일 K8s cluster, 동일 AI_COOLDOWN_SEC=0, persona/difficulty/psychLevel 고정
- tokenBudget 차이 (1200 vs 1700) 는 단지 메타데이터이며 실제 request 에 영향 없음 (DeepSeek 은 max_tokens 미지정 시 모델 최대값 사용)

### 6.3 비용

| 구간 | 비용 |
|------|------|
| Smoke 10턴 | $0.004 |
| v2-zh 80턴 | $0.039 |
| v2 재실측 80턴 (예상) | ~$0.04 |
| **총 예상** | **~$0.083** |

DeepSeek 잔액 ~$3.31 대비 1회 실험 3% 소진. 여유 충분. `DAILY_COST_LIMIT_USD=$20` 대비 0.4% 소진.

---

## 7. 배포 상태

### 7.1 v2-zh 코드 배포 (완료)

- ai-adapter 이미지 재빌드: `rummiarena/ai-adapter:v5.2-prompt` (동일 태그 재빌드, ID aba7d4c21b36)
- rollout 완료 (Pod `ai-adapter-b586c68bc-hgfz8`)
- env 설정 (Phase 1): `DEEPSEEK_REASONER_PROMPT_VARIANT=v2-zh`
- PromptRegistry 로그 확인: `등록 변형=[v2,v2-zh,v3,v3-tuned,v4,v4.1,v5,character-ko]` + `per-model-override=[claude:v4, deepseek-reasoner:v2-zh, dashscope:v4]`

### 7.2 v2 재실측 전환 (진행 중)

- env 재설정 (Phase 2): `DEEPSEEK_REASONER_PROMPT_VARIANT=v2`
- rollout 완료 (Pod `ai-adapter-5759b68486-56w7q`)
- PromptRegistry 로그 확인: `per-model-override=[claude:v4, deepseek-reasoner:v2, dashscope:v4]`
- 80턴 대전 진행 중

### 7.3 롤백 절차 (Day 7 후)

v2-zh 실험 종료 후 v2 로 복귀하려면:

```bash
kubectl -n rummikub set env deployment/ai-adapter DEEPSEEK_REASONER_PROMPT_VARIANT=v2
# 또는 완전 기본 매핑 복귀
kubectl -n rummikub set env deployment/ai-adapter DEEPSEEK_REASONER_PROMPT_VARIANT-
```

env 백업: `/tmp/ai-adapter-env-backup-20260417-150831.json`
이전 이미지 백업 태그: `rummiarena/ai-adapter:v5.2-prompt-pre-zh` (ID fe26af00a6c8)

---

## 8. 원시 로그 / 결과 파일

### 파일 전수 (절대 경로)

| 파일 | 상태 | 내용 |
|------|------|------|
| `work_logs/battles/r9-v2-zh/smoke.log` | 완료 | Smoke 10턴, 4 DRAW, fallback 0, TIMEOUT |
| `work_logs/battles/r9-v2-zh/full-80t.log` | 완료 | v2-zh Full 80턴 원시 로그 |
| `work_logs/battles/r9-v2-zh/v2-zh-full-result.json` | 완료 | v2-zh 결과 JSON 백업 (placeDetails 9건 포함) |
| `work_logs/battles/r9-v2-zh/v2-rerun-80t.log` | **진행 중** | v2 재실측 80턴 실시간 append |
| `work_logs/ai-battle-monitoring-20260417.md` | append 중 | **턴별 표 + 구간별 통계 + Phase 1b 비용 판단** (batch-battle SKILL Phase 3 필수 산출물) |
| `docs/04-testing/59-v2-zh-day7-battle-report.md` | 본 문서 | 종합 리포트 (v2 재실측 완료 후 §4/§5 최종판 업데이트) |
| `/tmp/ai-adapter-env-backup-20260417-150831.json` | 보관 | Phase 1 이전 env 백업 (롤백용) |

### 실시간 관찰 방법 (사용자 직접 열람)

**Windows PowerShell**:
```powershell
Get-Content "d:\Users\KTDS\Documents\06.과제\RummiArena\work_logs\battles\r9-v2-zh\v2-rerun-80t.log" -Wait
```

**WSL bash**:
```bash
tail -f /mnt/d/Users/KTDS/Documents/06.과제/RummiArena/work_logs/battles/r9-v2-zh/v2-rerun-80t.log
```

**VSCode**: 파일 열면 저장마다 자동 reload

### AI Adapter 내부 로그 (reasoning_content 중문/영문 확인용)

```bash
# 실시간 스트림
kubectl logs -n rummikub deploy/ai-adapter -c ai-adapter -f | grep -E "DeepSeekAdapter|reasoning|variant="

# 전체 조회
kubectl logs -n rummikub deploy/ai-adapter -c ai-adapter --tail=500 | grep "reasoning"
```

### 비용 실시간 추적

```bash
kubectl -n rummikub exec deploy/redis -- redis-cli HGETALL "quota:daily:$(date -u +%Y-%m-%d)"
# total_cost_usd 는 1e6 scale (나누어 $ 환산)
```

---

## 9. 변경 이력

| 일자 | 변경 | 담당 |
|---|---|---|
| 2026-04-17 | 초판 작성 — v2-zh 80턴 완료 결과 + v2 재실측 대기 섹션 | Claude(main) |
| 2026-04-17 | v2 재실측 완료 후 §4/§5 업데이트 예정 | Claude(main) |
