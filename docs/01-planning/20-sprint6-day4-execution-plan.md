# Sprint 6 Day 4 실행 계획 — Round 6 대전 + PR 4 + 토큰 절약 실적용

- **날짜**: 2026-04-15 (Sprint 6 Day 4, 화요일)
- **메인 축**: Round 6 v4 실전 대전 (4 Phase)
- **서브 축 1**: 대시보드 PR 4 ModelCardGrid (라이브 검증 대기 해제 → Frontend Dev 재배치)
- **서브 축 2**: 토큰 절약 5가지 실적용 (어제 오후 합의 → 오늘 첫 실행)
- **부주제 연속**: 외부 도구 silent change 대응 (어제 부주제 3회차 이어짐)
- **참조**: `work_logs/scrums/2026-04-15-01.md` (오늘 킥오프 스크럼)

## 1. 라이브 검증 이월 확정 — Day 4 계획 변경 요약

애벌레 본업 일정으로 라이브 검증 4건(BUG-UI-LAYOUT-001 / REARRANGE-002 / CLASSIFY-001a/b)이 **2일 연속 이월**. Day 5 이후 재평가. 이로 인한 계획 변경:

| 변경 전 | 변경 후 |
|---------|---------|
| Phase 0 (라이브 검증 수집) → Phase 0.5 (v4 활성화) | Phase 0 제거, Phase 0.5부터 시작 |
| Frontend Dev: 핫픽스 대기 → 피드백 수신 시 브랜치 분기 | Frontend Dev: PR 4 ModelCardGrid 설계+착수로 전환 |
| 라이브 검증 Gate가 Round 6 선행 조건 | Round 6는 AI vs AI라 UI 이슈 독립 → 바로 진행 |

## 2. Round 6 4 Phase 상세 실행 계획

### Phase 0.5 — v4 활성화 (5분, ~09:30 목표)

**목표**: 모든 활성 variant를 v4로 전환하고 PromptRegistry 로그에 load가 찍히는지 확인

**담당**: Node Dev

**실행 순서**:
1. 현재 env 백업
   ```bash
   kubectl -n rummikub get deployment ai-adapter -o jsonpath='{.spec.template.spec.containers[0].env}' > /tmp/ai-adapter-env-before.json
   ```
2. v4 활성화 (3개 variant 동시 전환)
   ```bash
   kubectl -n rummikub set env deployment/ai-adapter \
     DEEPSEEK_REASONER_PROMPT_VARIANT=v4 \
     CLAUDE_PROMPT_VARIANT=v4 \
     DASHSCOPE_PROMPT_VARIANT=v4
   ```
3. Pod 재시작 대기 (~30초)
   ```bash
   kubectl -n rummikub rollout status deployment/ai-adapter --timeout=60s
   ```
4. PromptRegistry 로그에서 v4 load 확인
   ```bash
   kubectl -n rummikub logs deployment/ai-adapter --tail=50 | grep -E "PromptRegistry|variant"
   ```
5. **GPT / Ollama는 v3 유지** (v4 부적합 판정, SP5 문서 참조)

**성공 기준**: 로그에 `variant=v4` 문자열 3회 이상 (DeepSeek / Claude / DashScope 각 1회 이상)

**실패 시**: 즉시 rollback
```bash
kubectl -n rummikub set env deployment/ai-adapter \
  DEEPSEEK_REASONER_PROMPT_VARIANT- \
  CLAUDE_PROMPT_VARIANT- \
  DASHSCOPE_PROMPT_VARIANT-
```

### Phase 1 — Smoke 테스트 (15분, ~09:35 ~ ~09:50)

**목표**: v4가 실제 대전 환경에서 catastrophic failure 없이 최소 동작하는지 증명

**담당**: AI Engineer (실행), QA (게이트 판정)

**구성**:
- DeepSeek Reasoner × 1 게임 (10턴 제한)
- DashScope × 1 게임 (10턴 제한)
- Claude는 Phase 1에서 제외 (비용 절감)

**명령어**:
```bash
python scripts/ai-battle-3model-r4.py \
  --models deepseek \
  --turns 10 \
  --run-tag r6-phase1-smoke-deepseek
```
```bash
python scripts/ai-battle-3model-r4.py \
  --models dashscope \
  --turns 10 \
  --run-tag r6-phase1-smoke-dashscope
```

**중단 기준 (어느 하나라도 발생 시 즉시 No-Go)**:
- fallback ≥ 2/10 턴 (20% 이상)
- p95 latency > 300초
- WebSocket 예외 발생
- PromptRegistry error log

**GO 조건**: 두 게임 모두 fallback < 2/10, p95 < 300s, 정상 완주

### Phase 2 — 본 대전 (~6시간, ~10:00 ~ ~16:00)

**목표**: v3 vs v4 차이를 실측 데이터로 확보. Round 4~5 (v2) 기준선과 비교 가능한 규모 확보.

**담당**: AI Engineer (실행 + 모니터링), QA (실시간 품질 게이트), Go Dev (game-server 모니터링)

**매트릭스** (총 8 게임 × 80턴 = 640턴):

| 모델 | 게임 수 | variant | 예상 비용 |
|------|---------|---------|-----------|
| DeepSeek Reasoner | 3 | v4 | ~$0.36 ($0.04 × 3 × 3) |
| Claude Sonnet 4 | 2 | v4 | ~$6.66 ($1.11 × 2 × 3) |
| DashScope (qwen3-max) | 3 | v4 | ~$5 (추정) |

**Phase 2 총 예산**: ~$12 (예산 $17 중)

**실시간 게이트 (QA 주도)**:
- fallback ≥ 5/40 게임 (12.5%) → **즉시 중단 요청**
- place rate < 20% → **즉시 중단 요청**
- game-server goroutine leak / Redis 누수 → **즉시 중단 요청**

**모니터링 주기**:
- 10분마다: `kubectl -n rummikub logs deployment/ai-adapter --tail=20`
- 30분마다: DB 쿼리로 진행 중인 게임 상태 확인
- 1시간마다: 누적 fallback / place rate 집계

### Phase 3 — 대조군 (~1시간, ~16:00 ~ ~17:00)

> **Day 4 실행 중 업데이트 (2026-04-15)**: Phase 3 는 Phase 2 에 **흡수**됨. 최종 실행 계획은 DeepSeek×2 + Claude×2 + OpenAI×2 = 6 게임 순차 (원안 8게임에서 DashScope 3 제외 + OpenAI 2 추가). OpenAI × 2 가 Phase 3 대조군 역할 겸함. OpenAI variant 는 **v2 유지** (PromptRegistry default, empirical 검증 완료 — 아래 §3bis 참조).

**목표** (원안): GPT × 1 게임을 v3로 실행하여 **"v4 변경 없는 대조군"**을 확보. Round 4~5와 직접 비교 가능.

**담당**: AI Engineer

**구성**:
- GPT-5-mini × 1 게임 (80턴, v3 유지)
- Ollama 제외 (성능 낮음, 시간 낭비)

**명령어**:
```bash
python scripts/ai-battle-3model-r4.py \
  --models openai \
  --turns 80 \
  --run-tag r6-phase3-control-gpt-v3
```

**예상 비용**: ~$1.5 ($0.025 × 80 × 1 = $2 내외)

#### §3bis — OpenAI variant 결정 empirical 확정 (2026-04-15 Day 4 추가)

Phase 3 원안에 "v3 유지" 라고 적혀 있었지만, Day 4 실행 중 발견된 사실:

1. **"v3"는 존재한 적 없음** — SP3 (2026-04-14) 에서 드러난 바, Round 4~5 전체가 실제로는 v2 였음 ("v3 유지" 라는 말 자체가 과거 문서의 잘못된 표현). 따라서 "유지" 라는 단어는 v2 에 적용됨
2. **SP5 §3.4 의 "GPT 는 v4 미적합" 판단을 실측 검증** — 동일 fixture 로 v2 vs v4 N=3 반복 비교 결과:
   - tiles_placed: v2=v4=6.33 (동일 품질)
   - reasoning_tokens: v2=4,224 → v4=3,179 (**-25%**, Cohen d **-1.46**, large negative)
   - `reasoning_tokens` 필드는 gpt-5-mini API 에 **노출됨** (SP5 의 "노출 안 됨" 주장 수정)
3. **empirical 결론**: v4 는 GPT 에게 사고 탄력을 억제하는 효과. v2 가 최적. 상세:
   - 집계 리포트: `docs/04-testing/57-v4-gpt-empirical-verification.md`
   - 단일 샘플 트레이스 (LangSmith): `docs/04-testing/58-langsmith-trace-gpt-v4-sample.md`
   - 후속 리포트: `docs/03-development/21-prompt-v4-baseline-dry-run-report.md` §3.4.1

**최종 실행**: OpenAI × 2 게임 모두 **v2 default** (어떤 PROMPT_VARIANT env override 도 적용하지 않음) — Phase 2 에 이미 통합됨.

### Phase 4 — 리포트 작성 (~1시간, ~17:00 ~ ~18:00)

**목표**: Round 6 실측 결과를 v3 vs v4 비교 관점으로 문서화

**담당**: AI Engineer

**산출물**: `docs/03-development/22-round6-v3-vs-v4-measured-comparison.md`

**포함 내용**:
- Phase별 요약 (Phase 1 smoke, Phase 2 본 대전, Phase 3 대조군)
- 모델별 핵심 지표: place rate, fallback count, p95 latency, 총 비용, 총 시간
- v3 (Round 4~5 실은 v2) vs v4 (Round 6) 비교 테이블
- **주의 사항**: "v3"로 알려진 Round 4~5는 실제로는 v2였다 (SP3 발견). 따라서 오늘 비교는 **v2(Round 4~5) vs v4(Round 6)**가 실측 가능한 비교이며, "v3 효과"는 여전히 미측정 상태
- Anthropic 2026-04-07 effort 재변경의 Claude 성능 영향 분석 (섞인 변수 주의)

## 3. Frontend Dev 재배치 — 대시보드 PR 4 ModelCardGrid

**배경**: 라이브 검증 이월로 핫픽스 대기 해제. 가용 시간 대부분을 PR 4에 투입.

**산출물**: `src/admin/src/components/tournament/ModelCardGrid.tsx` (+ E2E)

**구성 요소** (Designer와 합의):
- 모델 카드 × N개 (현재 5: OpenAI / Claude / DeepSeek / DashScope / Ollama)
- 카드별 표시 항목:
  - 모델명 + 로고
  - 등급 배지 (A+ / A / B / C / F)
  - place rate (%) — 핵심 지표
  - fallback count
  - cost per turn ($)
  - 최근 대전 결과 링크
- 레이아웃: responsive grid (mobile 1열, tablet 2열, desktop 3열)
- 색상: `MODEL_COLORS` (PR 2에서 Designer가 정의한 색각 안전 팔레트) 재활용

**E2E 테스트**: 5 cards rendered, sort by place rate, click → detail modal

**담당 시간**: Day 4 낮 (4~5시간 예상)

## 4. 부주제 후속 조치 — 어제 부주제 3회차 연속

어제 스크럼에서 발견된 **threads.com 스니펫 오류 + 2026-04-07 재변경 + 2026-04-09 Advisor Strategy 공식화**에 대한 팀 합의 사항:

1. **threads.com 스니펫 적용 금지** (반대 해석 포함)
2. `effortLevel` 명시 고정 검토 (Go Dev 제안)
3. 세션 시작 시점 effort/버전 자동 기록 (DevOps 제안, Day 5+ 구현)
4. 테스트 재현 조건에 "Claude Code effort level" 추가 (QA 제안)
5. "외부 도구 silent change 탐지" ADR 후보 초안 (Architect 주도, Day 4 저녁~Day 5)
6. Advisor Strategy 기반 Agent Teams 템플릿 개편 (PM 주도, Day 5)
7. 대시보드 metric 카드에 "측정 시점 도구 상태" 각주 검토 (Designer 제안)

## 5. 액션 아이템 16건 전수 (스크럼 로그 재등록)

| # | 담당 | 할 일 | 기한 | 의존 |
|---|------|-------|------|------|
| 1 | 애벌레 | 라이브 검증 4건 — Day 5+ 재이월 확정 | Day 5 스크럼 재평가 | - |
| 2 | Frontend Dev | 대시보드 PR 4 ModelCardGrid 설계 + 착수 | Day 4 낮 | Designer 색상 합의 |
| 3 | Node Dev | v4 kubectl set env 활성화 + PromptRegistry 로그 확인 | Day 4 오전 (~09:30) | - |
| 4 | AI Engineer | Phase 1 smoke (DeepSeek 10턴 + DashScope 10턴) | Day 4 오전 (~09:35) | #3 |
| 5 | QA | smoke 결과 즉시 게이트 판정 (fallback ≥ 2/10 or p95 > 300s면 No-Go) | Day 4 오전 (~09:50) | #4 |
| 6 | AI Engineer | Phase 2 본 대전 (DeepSeek×3 + Claude×2 + DashScope×3) | Day 4 낮 (~10:00~16:00) | #5 GO |
| 7 | QA | Phase 2 실시간 품질 게이트 (fallback ≥ 5/40 or place rate < 20%면 중단) | Day 4 낮 | #6 |
| 8 | Go Dev | Round 6 중 game-server 상시 모니터링 (goroutine / Redis / WS) | Day 4 낮 | #6 |
| 9 | AI Engineer | Phase 3 대조군 (GPT × 1, v3 유지) | Day 4 저녁 (~16:00~17:00) | #6 완료 |
| 10 | AI Engineer | Round 6 결과 리포트 `docs/03-development/22` (v3 vs v4 실측) | Day 4 저녁 (~17:00~18:00) | #9 완료 |
| 11 | Security | SEC-REV-013 의존성 감사 (0.5d) + 공급망 리스크 초안 | Day 4 | - |
| 12 | Go Dev | `ws_handler.go 2174줄 분할 리팩터(R-01)` 초안 | Day 4~5 (대전 관찰 여유 시) | - |
| 13 | Architect | "외부 도구 silent change 탐지" ADR 후보 초안 + Round 6 회고 구조 | Day 4 저녁~Day 5 | #10 (리포트 참조) |
| 14 | DevOps | `scripts/agent-team-prelude.sh` (effort/버전 자동 기록) 설계 | Day 5 (오늘 대전 집중) | - |
| 15 | PM | Advisor Strategy 기반 Agent Teams 템플릿 개편 초안 | Day 5 | #13 참조 |
| 16 | Designer | 대시보드 PR 4 ModelCardGrid 설계 지원 + "도구 상태 각주" UX 제안 | Day 4 낮 (여유 시) | #2 |

**Bonus**: 팀 전체 — threads.com 스니펫 적용 금지 합의 기록 (이 문서가 근거)

**Bonus**: Team Lead — 오늘 답변 길이 의식적 제어 + 외부 스니펫 공유 전 공식 문서 교차검증 루틴화 (상시)

## 6. Day 4 타임라인 (가설)

```
09:00  스크럼 직후, 계획 문서 작성 (이 문서 + 21번 문서)
09:30  Phase 0.5 — v4 활성화
09:35  Phase 1 smoke 시작
09:50  Phase 1 게이트 판정
10:00  Phase 2 본 대전 시작
       └─ Frontend Dev: PR 4 ModelCardGrid 병렬 착수
       └─ Security: SEC-REV-013 병렬 착수
12:00  Phase 2 중간 점검 (2h 경과)
14:00  Phase 2 중간 점검 (4h 경과)
16:00  Phase 2 완료
16:00  Phase 3 대조군 시작
17:00  Phase 3 완료
17:00  Phase 4 리포트 작성
18:00  Phase 4 완료 + Day 4 마감 스크럼 준비
18:30  Day 4 마감 스크럼
19:00  Day 4 데일리 로그 + 바이브 로그 + 커밋 + 푸시
```

**총 예상 소요**: 10시간 (스크럼 포함)

## 7. 비상 시나리오

| 상황 | 대응 |
|------|------|
| Phase 1 smoke No-Go (fallback 초과) | Phase 2 취소, 문제 분석 → v4 prompt 튜닝 재계획 |
| Phase 2 중단 (게이트 위반) | 현재까지 결과로 Phase 4 리포트 작성, Phase 3는 수행 |
| Phase 2 중 Claude만 비정상 (Anthropic 4/7 변경 영향 의심) | DeepSeek/DashScope는 완주, Claude 결과는 "도구 변경 섞임" 주석 |
| API 잔액 부족 경고 | DashScope 3 게임을 2 게임으로 축소 |
| game-server OOM / WS 폭증 | Go Dev가 즉시 진단, 대전 일시 중지 |

## 8. 성공 기준 요약

**Day 4 전체 성공**:
- ✅ Phase 0.5 ~ 4 전수 완료
- ✅ Round 6 리포트 `docs/03-development/22` 작성
- ✅ PR 4 ModelCardGrid 최소 skeleton 완성
- ✅ SEC-REV-013 감사 완료
- ✅ 토큰 절약 5가지 실적용 기록 확보 (별도 문서 `21-token-economy-measures-application.md`)

**Round 6 자체 성공** (별개):
- ✅ v4가 Round 4~5 대비 **측정 가능한** place rate 변화
- ✅ fallback rate v2 대비 개선
- ✅ 리포트에서 "v2 vs v4"로 정직한 비교 (v3는 여전히 미측정)
