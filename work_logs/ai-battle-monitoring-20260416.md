# AI 대전 모니터링 — 2026-04-16 (Day 4 야간 연장 / Phase 2 재실행)

- **시작 시각**: 2026-04-16 01:01:25 KST
- **대상**: Phase 2 재실행 — DeepSeek Reasoner × 3 Run, 80턴
- **스크립트**: `/tmp/phase2-rerun.sh` → `python3 scripts/ai-battle-3model-r4.py --models deepseek --max-turns 80`
- **로그 경로**: `work_logs/battles/r6-fix/phase2-master.log` + `phase2-deepseek-run{1,2,3}.log`
- **배경**: Day 4 Run 3 가 Istio VS 510s drift 로 void 처리되어 재실행. 수정 사항: Istio VS 710s + DTO @Max(720000) + game-server http.Client +60s 버퍼 + viper default 700 + production fatal 체크
- **목표**: fallback 0, 80턴 완주, avg turn > 60s, total cost ≤ $0.15 (3 Run 합산)
- **SKILL**: `batch-battle` Phase 3b (ScheduleWakeup 패턴)

---

## 사전점검 (retroactive)

| 항목 | 결과 | 판정 |
|------|------|------|
| game-server Pod (game-server-55ff667f79-47mk6) | 2/2 Running, restart 0 | ✅ |
| ai-adapter Pod (ai-adapter-7869b6bffd-xzqhw) | 2/2 Running, restart 0 | ✅ |
| game-server env `AI_ADAPTER_TIMEOUT_SEC` | 700 | ✅ |
| ai-adapter env `AI_ADAPTER_TIMEOUT_SEC` | exit=1 (제거됨) | ✅ |
| Istio VirtualService `timeout / perTryTimeout` | 710s / 710s | ✅ |
| Envoy config_dump | `"timeout": "710s"` 전파 확인 | ✅ |
| DTO `@Max` timeoutMs | 720000 | ✅ |
| v4 활성 env | `DEEPSEEK_REASONER_PROMPT_VARIANT=v4` | ✅ |
| Redis 활성 게임 (사전 정리) | 0 (Run 1 시작 후 1개) | ✅ |
| Smoke PASS | 10턴 2 place / 0 fallback / avg 148s | ✅ |

---

## Run 1 — 2026-04-16 01:01:25 KST 시작

### 턴별 데이터

| 턴 | 시각 (KST) | AI 행동 | 타일 | 누적 | 응답시간 | 비고 |
|----|------------|---------|------|------|----------|------|
| T01 | 01:01:27 | Human DRAW (from GAME_STATE) | - | - | - | 초기 상태 |
| T02 | 01:04:24 | AI **PLACE** (6 tiles) | 6 | 6 | 176.6s | 초반 큰 배치 — Calculator 페르소나 v4 특성 |
| T03 | 01:04:24 | Human DRAW | - | - | - | |
| T04 | 01:07:14 | AI DRAW | 0 | 6 | 170.4s | |
| T05 | 01:07:14 | Human DRAW | - | - | - | |
| T06 | 01:09:17 | AI DRAW | 0 | 6 | 122.8s | |
| T07 | 01:09:17 | Human DRAW | - | - | - | |
| T08 | 01:13:02 | AI DRAW | 0 | 6 | 225.3s | |
| T09 | 01:13:02 | Human DRAW | - | - | - | |
| T10 | 01:14:** | AI thinking... | - | - | (진행 중) | 체크 시점 |

### Run 1 구간별 집계 (01:14 시점, 첫 체크)

| 항목 | 값 |
|------|-----|
| 완료 AI 턴 | 4 (T02, T04, T06, T08) |
| Place rate | 25% (1 place / 4 turns) |
| Tiles placed | 6 |
| Fallback | **0** |
| 응답시간 avg | 173.8s |
| 응답시간 max | 225.3s |
| 응답시간 min | 122.8s |
| Game ID | c4f2afe6-1a62-45f6-8eaf-fc3394f93422 |

### 판정

- **정상**. T02 의 6-tile 배치는 smoke 때와 동일 패턴 — 초반 큰 배치 후 관망. 응답 시간 122~225s 범위는 DeepSeek 의 역대 중반 구간과 일치 (메모리 memory: 평균 211s, max 356s).
- 예상 Run 1 완료: ~03:00 KST (AI 턴 약 40개 × 평균 180s ≈ 120분)

### 다음 wake-up

01:30 KST 예약 (ScheduleWakeup 900s)

---

## Run 2 — (Run 1 완료 후 + 30s cool-down)

_대기 중_

---

## Run 3 — (Run 2 완료 후 + 30s cool-down)

_대기 중_

---

## 최종 총평 (3 Run 완료 후)

_대기 중_

---

## 비용 추적

| 시각 | Redis `quota:daily:2026-04-16` total_cost | requests | 예상 대비 |
|------|-------------------------------------------|----------|-----------|
| 01:14 | (집계 전) | - | - |

DeepSeek per-turn $0.001 기준 예상 총 비용: 3 Run × 40 AI turns × $0.001 = **~$0.12** (일일 한도 $20 의 0.6%)

---

## 참고

- 본 파일은 `batch-battle` SKILL Phase 3 "모니터링 이력 기록" 절차를 retroactive 로 생성한 것임 (원래 대전 시작 전에 생성했어야 함)
- Phase 3b (메인 Claude 비동기 모니터링, ScheduleWakeup 패턴) 도 본 세션에서 SKILL 에 신규 추가됨
- 다음 대전부터는 시작 전에 본 문서 템플릿이 자동 생성되도록 루틴화 필요
