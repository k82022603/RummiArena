# Day 8 실행 계획서 — Round 10 v3 재검증 + v2 재연 + 기술 리포트 완성본

- **작성일**: 2026-04-18 (Sprint 6 Day 8 아침)
- **작성자**: Claude (메인 세션, Opus 4.7 xhigh)
- **상태**: 확정, **자율 실행 모드** (애벌레님 승인 기다리지 않고 끝까지 자동 진행)
- **예상 완료**: Day 9 저녁 (약 30시간)
- **예상 비용**: 약 $0.20 (DeepSeek 4회 추가 대전)

---

## 1. 배경 — 왜 이 계획을 세우는가

### 1.1 Round 9 결과 요약

Day 7~8 새벽에 DeepSeek Reasoner 프롬프트 변형 4종을 총 4회 돌렸습니다.

| 프롬프트 | 성공률 | 응답 실패 | 서버 시간 제한 | 비고 |
|---------|--------|----------|--------------|------|
| v2 (영어, 기존 기준선) | 30.8% / 30.8% | 0 / 0 | 500초 | R4/R5 과거 2회, 하드코딩 경로 |
| v2 재실측 | 25.6% | 0 | 700초 | Day 7, Registry 경로 → **5.2%p 하락** |
| v2-zh (중국어 번역) | 23.1% | 0 | 700초 | Day 7 새 시도 |
| v3 | 28.2% | **1건(AI_TIMEOUT)** | 710초 | Day 8 새벽 |
| v4 unlimited (시간 무제한) | 20.5% | 0 | 1810초 | Day 8 새벽, 최대 1337초 걸림 |

### 1.2 핵심 문제 — v2 기준선이 흔들렸습니다

같은 v2 프롬프트를 다시 돌렸더니 30.8% → 25.6% 로 떨어졌습니다. 5.2%p 차이의 원인 후보는 세 가지입니다.

| 원인 후보 | 설명 | 검증 방법 |
|----------|------|---------|
| (A) DeepSeek 내부 업데이트 | API 제공사가 모델을 교체했을 가능성 | 검증 불가 |
| (B) 우연(주사위 운) | 추론 모델은 매번 다른 길로 생각함. ±5%p 흔들림 자연 발생 | **v2를 여러 번 더 돌려보면 확인 가능** |
| (C) 코드 변경으로 프롬프트가 실제로 바뀜 | 2026-04-14 `5ad02e8` PromptRegistry 도입 시점이 수상함 | **파일 비교 한 번이면 즉시 판별** |

### 1.3 전문가 분석 결론

- **AI Engineer 보고서**: `docs/04-testing/60-round9-5way-analysis.md` (575줄) — 원인 (B) 우연이 가장 유력, 하지만 (C) 도 배제 못함. **v2 를 같은 조건에서 3번 반복**해서 평균 내는 게 필수.
- **PM 판단서**: `work_logs/decisions/2026-04-18-paper-gonogo.md` (352줄) — 논문 즉시 착수는 위험, 데이터 보강 후 재판단 권고.

---

## 2. 애벌레님의 결정 사항

PM 권고에서 **범위를 축소** 하셨습니다.

| 항목 | PM 권고 | 애벌레님 결정 |
|------|--------|--------------|
| 논문 착수 | 데이터 보강 후 Day 10 재판단 | **안 함** |
| v2 재연 | 5번 | 2번 추가 (기존 1번 + 2번 = 총 3번) |
| v3 재검증 | 권고 없음 | **3번 전부 새로** (기존 710초 환경 1번은 참고용으로 보관, 1810초 환경에서 3번 새로) |
| v2-zh 보강 | 3번 | **안 함** |
| v4 unlimited 보강 | 3번 | **안 함** |
| 블로그 형태 | 초안 | **완성본** |
| 스크럼 | 정식 스크럼 | **팀원 전체 테스트 결과 평가 회의**로 대체 |
| 일일 마감 | 별도 | 포함 |

### 2.1 왜 v3를 3번 돌리는가

Registry 경로에서 돌린 결과끼리 직접 비교하면 **v3(28.2%) > v2 재실측(25.6%)**. v3가 실제로는 v2보다 나을 가능성이 있습니다. 다만 v3는 한 번만 돌려봐서 우연일 수도 있고, 응답 실패 1건이 포함된 결과라 깨끗한 비교가 아닙니다. 3번 돌려서 평균을 내야 진실이 드러납니다.

### 2.2 왜 1810초 환경을 유지하는가

- 현재 서버 설정이 이미 1810초로 맞춰져 있습니다(v4 unlimited 실험 흔적).
- v3는 원래 347초 평균, 최대 710초 응답이라 1810초 환경에서도 여유. 응답 실패는 거의 발생 안 할 것으로 예상.
- 세 번 모두 같은 환경(1810초)에서 돌리면 통계 해석이 단순해집니다.

---

## 3. 애벌레님 3대 질문에 대한 답변

### Q1. 프롬프트 파일 글자 단위 비교를 통해 무엇을 얻고자 하는가

**한 문장**: v2 흔들림이 코드 변경 때문인지, 우연인지 가려내기.

- 만약 **글자 단위로 완전히 같으면** → 원인 (C) 제거 → (B) 우연으로 귀결 → v2 재연 3회 결과를 그대로 믿을 수 있음
- 만약 **다르면** → 버그이자 **오늘 배치 돌리기 전에 반드시 고쳐야 할 문제**. 다른 프롬프트로 비교한 걸 "v2 재연" 이라고 부를 수 없으므로.

**20분 투자로 배치 12시간의 전제를 확정**. 최우선으로 수행하는 이유.

### Q2. 프롬프트 개선으로 50% 달성은 가능한가

**프롬프트 텍스트만으로 50% 달성은 현실성이 낮음**.

지금까지 시도한 모든 프롬프트 변형이 v2(30.8%)를 못 넘었습니다.

| 프롬프트 | 의도 | 결과 |
|---------|------|------|
| v3 | 중간 튜닝 | 28.2% (v2 이하) |
| v4 / v4.1 | Thinking Budget 지시 | 25.95% (v2 이하) |
| v4 unlimited | 사고시간 극대화 | 20.5% (악화) |
| v2-zh | 중국어 번역 | 23.1% (v2 이하) |
| v5/v5.1/v5.2 | rack 처리 패치 | v2 못 넘음 |

**근본 원인**: DeepSeek Reasoner 내부에 이미 추론 학습(CoT RLHF)이 들어있어 외부 지시가 간섭을 일으킵니다. GPT-5-mini에서도 동일 패턴 관찰(Cohen d -1.46). 즉 "프롬프트로 더 잘 시키려는 시도" 가 역효과를 내는 모델 특성입니다.

**열려있는 다른 축** (별도 연구 주제로):
- 프롬프트 구조 재설계 (Task #20: Agent Teams v6)
- 맥락 축소 (직전 3턴만)
- Few-shot 예시 추가
- 측정 방식 변경 (성공률 대신 승률/점수)

**제 판단**: 현 스프린트 스코프에서 현실적 목표는 **35~40%**, 50%는 별도 과제.

### Q3. 현재 결과를 놓고 가장 유력한 프롬프트 버전은

**지금은 v2 (영어, 30.8%)**. 다만 오늘 배치 끝나면 v3가 역전할 가능성 있음.

| 시나리오 | 앞으로 쓸 버전 |
|---------|--------------|
| v3 3회 평균 ≥ v2 재연 3회 평균 | **v3** 채택 |
| v3 3회 평균 < v2 재연 3회 평균, v2 재연이 25% 근처 유지 | v2, 단 새 기준선 25~27% 확정 |
| v3 3회 평균 < v2 재연 3회 평균, v2 재연이 30% 근처 회복 | v2, 30.8% 기준선 복원 |

오늘 배치의 핵심 출력물은 "v3와 v2 중 무엇이 우리의 주력 프롬프트인가" 확정입니다.

---

## 4. 실행 순서 (7단계)

### Step 1. 프롬프트 파일 글자 단위 비교 (20분)

- **목적**: v2 흔들림 원인 (C) 판별
- **방법**:
  1. 5ad02e8 이전 `deepseek.adapter.ts` 하드코딩 V2 텍스트 추출 (`git show 5ad02e8~1:src/ai-adapter/src/adapter/deepseek.adapter.ts`)
  2. 현재 Registry.resolve('deepseek-reasoner') 출력 텍스트 추출 (`v2-reasoning-prompt.ts`)
  3. diff 명령으로 글자 단위 비교
- **완료 기준**: 결과를 `docs/04-testing/61-v2-prompt-bitwise-diff.md` 에 기록
- **분기**:
  - 완전 동일 → Step 2 로 진행 (계획 유지)
  - 차이 발견 → Registry 경로 내용을 **공식 v2**로 선언하고 차이점 문서화 후 Step 2 진행 (모든 최근 측정이 Registry 경로이므로 실측의 연속성은 유지)

### Step 2. v3 대전 3회 (timeout 1810초, 약 12시간)

- **필수 SKILL**: `batch-battle` 경유 (맨손 Bash 금지)
- **환경**:
  - Istio VS ai-adapter timeout: 1810s (현재 상태 유지)
  - ai-adapter ConfigMap: AI_ADAPTER_TIMEOUT_SEC=1800 (현재 상태 유지)
  - ai-battle 스크립트 ws_timeout: 1870s (이미 설정됨)
  - **DeepSeek variant 전환**: `kubectl -n rummikub set env deployment/ai-adapter DEEPSEEK_REASONER_PROMPT_VARIANT=v3` 실행 후 rollout 확인
  - 현재 값은 **v4** (v4 unlimited 실험 흔적), 배치 시작 **전** 반드시 v3 로 변경
  - printenv 로 v3 확정 확인 후 Phase 2 진입
- **Phase 1 사전점검**: K8s 7 Pod, Redis game:* 0개, 비용 한도 $20 적정, API 잔액 $3.08 여유
- **Phase 1b 비용 한도**: 4번 × $0.04 = $0.16 < $20 → 상향 불필요
- **Phase 2 사전 정리**: Redis 정리, 프로세스 정리
- **Phase 3 실행**: `scripts/ai-battle-3model-r4.py --models deepseek` 3회 순차 백그라운드
- **Phase 3b 비동기 모니터링**: ScheduleWakeup 20~30분 주기로 Run 진행 확인 (애벌레님 수면 중이어도 자율 감시)
- **Phase 4 사후 정리**: Redis 정리, 결과 파일 확인, 비용 확인
- **결과 저장**: `work_logs/battles/r10-v3-rerun/`
  - `phase2-master.log` (오케스트레이션 요약)
  - `v3-run1.log`, `v3-run2.log`, `v3-run3.log` (턴 로그)
  - `v3-run1-result.json`, `v3-run2-result.json`, `v3-run3-result.json`
- **모니터링**: `work_logs/ai-battle-monitoring-20260418.md` (선행 생성 필수, 턴별 실시간 append)

### Step 3. 타임아웃 원복 (30분)

- **변경 지점 (docs/02-design/41 §3 레지스트리 참조)**:
  1. Istio VirtualService ai-adapter: timeout 1810s → **710s**, perTryTimeout 1810s → **710s**
  2. ConfigMap ai-adapter: AI_ADAPTER_TIMEOUT_SEC 1800 → **700**
  3. ConfigMap game-server: AI_ADAPTER_TIMEOUT_SEC 1800 → **700**
  4. ai-battle 스크립트 ws_timeout: 1870 → **770**
- **부등식 계약 (700s 기준) 재검증**: `script_ws(770) > gs_ctx(760) > http_client(760) > istio_vs(710) > DTO_max(720) > adapter_floor(700) > llm_vendor`
- **체크리스트**: docs/02-design/41 §5 전수 수행

### Step 4. v2 재연 2회 추가 (timeout 710초, 약 4~5시간)

- **필수 SKILL**: `batch-battle` 경유
- **환경**:
  - Istio VS: 710s (Step 3 에서 원복됨)
  - ConfigMap: AI_ADAPTER_TIMEOUT_SEC=700
  - ws_timeout: 770s
  - **DeepSeek variant 전환**: `kubectl -n rummikub set env deployment/ai-adapter DEEPSEEK_REASONER_PROMPT_VARIANT=v2`
  - Day 7 재실측(25.6%) 때와 동일 조건 재현. Registry 경로, per-model override 로 v2 강제
  - printenv 로 v2 확정 확인 후 Phase 2 진입
- **Phase 1~4 전부 수행**
- **결과 저장**: `work_logs/battles/r10-v2-rerun/`
  - `v2-run2.log`, `v2-run2-result.json` (기존 Day 7 재실측 25.6% = run1 로 간주)
  - `v2-run3.log`, `v2-run3-result.json`
- **최종 통합**: v2 N=3 결과 = Day 7 재실측(25.6%) + 신규 2회 평균/편차

### Step 7. 블로그/기술 리포트 완성본 작성 (6~10시간) — **★ Chain 5 에서는 최우선 실행**

- **목표**: 초안이 아닌 **완성본**. 공개 가능 수준.
- **위치**: `docs/04-testing/62-deepseek-gpt-prompt-final-report.md` (또는 적절한 docs 경로)
- **길이**: 1000~1500줄
- **범위**:
  - **Part 1 — DeepSeek Reasoner**: v1/v2/v2-zh/v3/v4/v4.1/v5/v5.1/v5.2/v4 unlimited 전수 실측. Round 2~10 진화사.
  - **Part 2 — GPT-5-mini**: v2 결정 과정 (57번 empirical verification 근거). v4 역효과 관찰.
  - **Part 3 — 통합 교훈**: 내부 RLHF 추론 모델에 대한 프롬프트 엔지니어링 원칙. 측정 방법론.
  - **Part 4 — 부록**: 비용, 타임라인, 인프라(timeout 체인), 재현 가이드.
- **톤**: 학술 논문 아니지만 재현 가능한 기술 리포트. 외부 독자도 이해 가능.

### Step 6. 팀원 전체 테스트 결과 평가 회의 (1~2시간) — **★ 리포트 완성 후 실행**

- **SKILL**: `/team:all-hands` 또는 `/team:review`
- **참여 에이전트**: 10명 (pm, architect, go-dev, node-dev, frontend-dev, devops, qa, security, ai-engineer, designer)
- **주제**: Round 9/10 결과 평가 + **방금 작성된 리포트 완성본 리뷰**
- **산출물**: `work_logs/standups/2026-04-18-round9-10-review.md`

### Step 5. Day 7 일일 마감 (30~60분) — **★ 모든 산출물 완성 후 최종 커밋**

- **SKILL**: `/daily-close`
- **포함**: 데일리 로그 + 바이브 로그 + 스탠드업 로그 + 커밋/푸시 일괄
- **범위**: Day 7 (2026-04-17) 마감 + Day 8 성과(Round 10 + 리포트 + 팀 회의)를 함께 반영

### Chain 5 실행 순서 요약

```
리포트 완성본 (Step 7) → 팀 리뷰 (Step 6) → 일일 마감 (Step 5)
```

애벌레님 2026-04-18 지시로 기존 5→6→7 순서를 **7→6→5 로 역전**. 리포트가 있어야 팀 리뷰 대상이 생기고, 모든 산출물 완성 후 일일 마감 커밋으로 묶는 흐름이 자연스럽다.

---

## 5. 타임라인 (예상)

| 시각 (KST) | 단계 | 상태 |
|----------|------|------|
| Day 8 09:00 | Step 1 프롬프트 비교 | 20분 |
| Day 8 09:30 | Step 2 v3 Run 1 시작 | ~4h |
| Day 8 13:30 | Step 2 v3 Run 2 시작 | ~4h |
| Day 8 17:30 | Step 2 v3 Run 3 시작 | ~4h |
| Day 8 21:30 | Step 3 타임아웃 원복 | 30분 |
| Day 8 22:00 | Step 4 v2 Run 2 시작 | ~2.5h |
| Day 9 00:30 | Step 4 v2 Run 3 시작 | ~2.5h |
| Day 9 03:00 | Step 4 완료, Step 5 일일 마감 | 1h |
| Day 9 04:00 | (애벌레님 수면) | — |
| Day 9 09:00 | Step 6 팀 회의 | 2h |
| Day 9 11:00 | Step 7 리포트 완성본 집필 | ~8h |
| Day 9 19:00 | 완료 목표 | — |

> v3 Run 1~3 간 sleep 30초는 오케스트레이션 스크립트가 처리. 중간 크래시 시 ScheduleWakeup 기반 비동기 모니터링이 감지.

---

## 6. 자율 실행 원칙

### 6.1 승인 요청 금지

- 애벌레님 "Y" 승인 절대 요청하지 않음.
- 중간 이상 감지 시에도 SKILL 프로토콜(Phase 3 판정표)에 따라 자동 판단.
- 정말로 위험하다고 판단되는 경우(예: API 잔액 고갈, 연속 응답 실패 3건 이상)만 긴급 알림 검토.

### 6.2 SKILL 경유 원칙

- **배틀 실행** 은 반드시 `Skill(skill="batch-battle")` 호출로 진행.
- **일일 마감** 은 `/daily-close` 스킬 경유.
- **팀 회의** 는 `/team:all-hands` 또는 `/team:review` 스킬 경유.
- 맨손 Bash 로 배틀 스크립트 직접 호출 금지.

### 6.3 모니터링 선행

- 배틀 실행 **직전** 에 `work_logs/ai-battle-monitoring-20260418.md` Write (사후 복원 금지).
- 턴별 표를 Monitor 이벤트마다 실시간 append.
- ScheduleWakeup 주기 20~30분으로 야간 자율 감시.

### 6.4 이상 감지 프로토콜

| 관측 | 판정 | 조치 |
|------|------|------|
| 응답 실패 1~2건 (연속 아님) | 주의 | 로그 스냅샷, 다음 주기 재확인 |
| 응답 실패 연속 3건 | 경고 | ai-adapter 로그 분석 → drift 재발 vs 일시 에러 구분 |
| 프로세스 크래시 | 비상 | kubectl logs + 복구 시도. 복구 가능하면 재실행, 불가 시 계획 수정 |
| API 잔액 $0.5 이하 | 경고 | 진행 중 Run 완료 후 중단 |

---

## 7. 산출물 체크리스트

### 7.1 문서

- [ ] `docs/04-testing/61-v2-prompt-bitwise-diff.md` — Step 1 결과
- [ ] `docs/04-testing/62-deepseek-gpt-prompt-final-report.md` — Step 7 완성본
- [ ] `work_logs/ai-battle-monitoring-20260418.md` — Step 2, 4 턴별 기록
- [ ] `work_logs/daily/2026-04-17.md` — Day 7 마감 로그
- [ ] `work_logs/vibe/2026-04-17.md` — Day 7 바이브 로그
- [ ] `work_logs/standups/2026-04-18-round9-review.md` — Step 6 회의록

### 7.2 데이터

- [ ] `work_logs/battles/r10-v3-rerun/v3-run1-result.json` (v3 Run 1)
- [ ] `work_logs/battles/r10-v3-rerun/v3-run2-result.json` (v3 Run 2)
- [ ] `work_logs/battles/r10-v3-rerun/v3-run3-result.json` (v3 Run 3)
- [ ] `work_logs/battles/r10-v3-rerun/phase2-master.log` (오케스트레이션)
- [ ] `work_logs/battles/r10-v2-rerun/v2-run2-result.json` (v2 재연 2회차)
- [ ] `work_logs/battles/r10-v2-rerun/v2-run3-result.json` (v2 재연 3회차)

### 7.3 커밋

- [ ] Day 7 마감 커밋 (daily-close SKILL 내)
- [ ] Day 8 중간 커밋 (v3 배치 완료 시점)
- [ ] Day 8~9 최종 커밋 (v2 재연 완료 + 리포트 완성본)

---

## 8. 예상 비용

| 배치 | 비용 |
|------|------|
| v3 Run 1 | ~$0.04 |
| v3 Run 2 | ~$0.04 |
| v3 Run 3 | ~$0.04 |
| v2 Run 2 (재연) | ~$0.04 |
| v2 Run 3 (재연) | ~$0.04 |
| **합계** | **~$0.20** |

- DeepSeek 잔액 $3.08 → 완료 후 $2.88 예상
- 일일 한도 $20 → 여유
- 시간당 한도 $5 → DeepSeek $0.013/hr 이므로 안전

---

## 9. 리스크 및 롤백

| 리스크 | 발생 확률 | 대응 |
|--------|---------|------|
| v3가 1810초 환경에서 응답 실패 발생 | 낮음 (최대 응답 710초) | Run 결과 기록, 평균 계산에서 실패 포함 N=3 유지 |
| 타임아웃 원복 시 부등식 깨짐 | 낮음 (체크리스트 있음) | docs/02-design/41 §5 재점검 후 재시도 |
| v2 재연이 또 25% 이하 나와 흔들림 증폭 | 중 | 원인 (B) 우연 분산 확대 확증, 리포트에 솔직히 기술 |
| Claude 세션 중단 (장기 배치 중) | 중 | ScheduleWakeup 기반이라 복구 가능. monitoring.md 가 중간 상태 보존 |
| DeepSeek API 장애 | 낮음 | 해당 Run 재시작. 복구 불가 시 N=2 로 축소 |

---

## 10. 완료 선언 기준

아래 3가지 모두 충족 시 Day 8~9 작업 완료로 간주:

1. **v3 3회 + v2 재연 2회** 전부 결과 파일 + 턴별 monitoring.md 기록 완료
2. **블로그/기술 리포트 완성본** 이 1000줄 이상, 공개 가능 수준으로 docs/04-testing/ 에 저장
3. **Day 7 일일 마감 커밋 + Day 8 중간 커밋 + 최종 커밋** 전부 GitHub 에 푸시

---

## 11. 부록: 참조 문서

- `docs/02-design/41-timeout-chain-breakdown.md` — 타임아웃 체인 SSOT
- `docs/02-design/42-prompt-variant-standard.md` — 프롬프트 variant SSOT
- `docs/04-testing/46-multirun-3model-report.md` — R4/R5 기준선
- `docs/04-testing/57-v4-gpt-empirical-verification.md` — GPT v2 결정 근거
- `docs/04-testing/58-v4.1-deepseek-empirical-verification.md` — v4.1 Phase 2
- `docs/04-testing/59-v2-zh-day7-battle-report.md` — Round 9 Phase 1~2
- `docs/04-testing/60-round9-5way-analysis.md` — Round 9 7개 실험 통합 분석
- `work_logs/decisions/2026-04-18-paper-gonogo.md` — PM 논문 판단서
- `.claude/skills/batch-battle/SKILL.md` — 배틀 실행 SKILL
- `CLAUDE.md §Agent Execution Policy`, `§Agent Model Policy` — 에이전트 운영 규정

---

**이 계획서가 Day 8 자율 실행의 단일 기준점입니다. 계획 변경이 필요하면 애벌레님 지시를 받아 이 문서를 수정한 후 진행합니다.**
