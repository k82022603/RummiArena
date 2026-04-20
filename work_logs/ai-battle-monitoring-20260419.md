# AI 대전 모니터링 — 2026-04-19

> v6 ContextShaper Smoke 10회 배치 (batch-battle SKILL Phase 3 기록)

## 배치 정보
- **BatchTag**: r11-smoke-20260419-153217
- **PID**: 13721
- **킥오프**: 2026-04-19 15:32:17 KST
- **Sequence**: passthrough×2, joker-hinter×4, pair-warmup×4
- **예상 완료**: 2026-04-20 05:30 KST
- **직전 배치 폐기**: r11-smoke-20260419-140341 (argparse error false success, 6분 종료)

## Run 1/10 — passthrough (진행 중)

시작: 15:32:18 KST

### 턴별 데이터 (T2~T38, AI 19턴)

| 턴 | 레이턴시 | action | 누적 tiles | 구간 |
|----|---------|--------|-----------|------|
| T02 | 262.5s | PLACE 9 | 9 | 초반 |
| T04 | 157.3s | DRAW | 9 | 초반 |
| T06 | 167.4s | DRAW | 9 | 초반 |
| T08 | 214.1s | PLACE 1 | 10 | 초반 |
| T10 | 209.6s | DRAW | 10 | 초반 |
| T12 | 108.8s | PLACE 3 | 13 | 초반 |
| T14 | 296.9s | DRAW | 13 | 초반 |
| T16 | 172.9s | DRAW | 13 | 초반 |
| T18 | 240.4s | PLACE 2 | 15 | 초반 |
| T20 | 275.1s | DRAW | 15 | 초반 |
| T22 | 203.2s | PLACE 1 | 16 | 초반 |
| T24 | 198.8s | DRAW | 16 | 초반 |
| T26 | 203.0s | PLACE 2 | 18 | 중반 |
| T28 | 324.2s | DRAW | 18 | 중반 |
| T30 | 218.5s | DRAW | 18 | 중반 |
| T32 | 231.8s | DRAW | 18 | 중반 |
| T34 | 232.4s | DRAW | 18 | 중반 |
| T36 | **394.4s** | DRAW | 18 | 중반 (역대 max 349s 초과) |
| T38 | 246.4s | DRAW | 18 | 중반 |

### 구간별 집계

| 구간 | AI 턴 수 | avg latency | max latency | PLACE 수 |
|-----|---------|-------------|-------------|----------|
| 초반 T2~T24 | 12 | **209s** | 296.9s | 5 |
| 중반 T26~T38 | 7 | **264s** | **394.4s** | 1 |
| 후반 T56~T80 | 0 | — | — | — |

### 현재까지 요약
- AI 턴 19 중 PLACE 6 / DRAW 13 / fallback **0**
- place_rate 중간값: **31.6%** (6/19)
- tiles_placed 중간: 18
- 역대 DeepSeek avg 176s 대비 초반 +19%, 중반 +50% (후반부 자율추론 확장 조짐)

## 5분 주기 스냅샷

| 시각 | 현재 턴 | 활성 게임 | fallback | 비용 | 특이사항 |
|-----|--------|---------|---------|------|----------|
| 16:43 | T38 | 1 | 0 | ~$0.02 | T36 394s (max 349s 초과) |

## 이전 테스트 비교 (역대 DeepSeek Reasoner)

| 실험 | 회차 | place_rate | avg latency | max latency | fallback |
|-----|-----|-----------|-------------|-------------|----------|
| v2 (Round 4) | N=1 | 23.1% | — | — | — |
| v2 (Round 5 Run 3) | N=1 | 30.8% | 211s | 356s | 0 |
| **v2 (Day 8 N=3)** | **N=3** | **29.07% ± 2.45%p** | **203s** | — | — |
| v3 (Day 8 N=3) | N=3 | 29.03% ± 3.20%p | — | — | — |
| v4 unlimited (Day 7) | N=1 | 20.5% | — | 1337s | 0 |
| v2-zh (Day 7) | N=1 | 23.1% | 146.7s | — | — |
| **passthrough (현재, 진행 중)** | N=1 | **31.6% 중간** | 초반 209 / 중반 264 | 394 | 0 |

**sanity check 판정**: passthrough = v2 bitwise 동일 전제 → 최종 place_rate 가 26.6%~31.5% (v2 N=3 평균 ±2.45%p) 범위면 PASS. 현재 31.6% 는 상단 경계 근처.

### 스냅샷 [2026-04-19 16:53:57 KST]

| 항목 | 값 |
|------|-----|
| Run | 1/10 (passthrough) |
| 경과 | 01:21:35 |
| AI 턴 n | 22 |
| place / draw / fallback | 7 / 14 / 0
0 |
| cumul tiles | 21 |
| place_rate 중간 | 31.8% |
| 초반 T1-25 | n=12 avg=209s p95=275s max=297s |
| 중반 T26-55 | n=9 avg=258s p95=394s max=394s |
| 후반 T56-80 | n=0 |
| 활성 게임 | 1 |
| 비용 누적 | $0.5515 / $20 |
| sanity | — |

### 스냅샷 [2026-04-19 16:54:49 KST]

| 항목 | 값 |
|------|-----|
| Run | 1/10 (passthrough) |
| 경과 | 01:22:27 |
| AI 턴 n | 22 |
| place / draw / fallback | 7 / 14 / 00 |
| cumul tiles | 21 |
| place_rate 중간 | 31.8% |
| 초반 T1-25 | n=12 avg=209s p95=275s max=297s |
| 중반 T26-55 | n=9 avg=258s p95=394s max=394s |
| 후반 T56-80 | n=0 |
| 활성 게임 | 1 |
| 비용 누적 | $0.5515 / $20 |
| sanity | — |

### 스냅샷 [2026-04-19 16:56:02 KST]

| 항목 | 값 |
|------|-----|
| Run | 1/10 (passthrough) |
| 경과 | 01:23:40 |
| AI 턴 n | 22 |
| place / draw / fallback | 7 / 14 / 00 |
| cumul tiles | 21 |
| place_rate 중간 | 31.8% |
| 초반 T1-25 | n=12 avg=209s p95=275s max=297s |
| 중반 T26-55 | n=9 avg=258s p95=394s max=394s |
| 후반 T56-80 | n=0 |
| 활성 게임 | 1 |
| 비용 누적 | $0.5515 / $20 |
| sanity | — |

### 스냅샷 [2026-04-19 16:57:38 KST]

| 항목 | 값 |
|------|-----|
| Run | 1/10 (passthrough) |
| 경과 | 01:25:16 |
| AI 턴 n | 23 |
| place / draw / fallback | 7 / 15 / 0 |
| cumul tiles | 21 |
| place_rate 중간 | 30.4% |
| 초반 T1-25 | n=12 avg=209s p95=275s max=297s |
| 중반 T26-55 | n=10 avg=253s p95=394s max=394s |
| 후반 T56-80 | n=0 |
| 활성 게임 | 1 |
| 비용 누적 | $0.5539 / $20 |
| sanity | — |

### 스냅샷 [2026-04-19 16:57:52 KST]

| 항목 | 값 |
|------|-----|
| Run | 1/10 (passthrough) |
| 경과 | 01:25:30 |
| AI 턴 n | 23 |
| place / draw / fallback | 7 / 15 / 0 |
| cumul tiles | 21 |
| place_rate 중간 | 30.4% |
| 초반 T1-25 | n=12 avg=209s p95=275s max=297s |
| 중반 T26-55 | n=10 avg=253s p95=394s max=394s |
| 후반 T56-80 | n=0 |
| 활성 게임 | 1 |
| 비용 누적 | $0.5539 / $20 |
| sanity | — |

### 스냅샷 [2026-04-19 17:05 KST] — Claude main 직접 복귀

| 항목 | 값 |
|------|-----|
| Run | 1/10 (passthrough) |
| 경과 | 01:32:12 |
| 현재 턴 | T48 thinking (AI 24번째) |
| AI 턴 n | 23 완료 |
| place / draw / fallback | 7 / 16 / **0** |
| cumul tiles | 21 |
| place_rate 중간 | 30.43% |
| 초반 T1-25 (n=12) | avg=209s / p95=297s / max=297s |
| 중반 T26-55 (n=11) | avg=251s / p95=394s / max=394s |
| 후반 T56-80 | 미진입 |
| 활성 게임 | 1 |
| DeepSeek 누적 | $0.057 (24 requests) |
| sanity 중간 판정 | PASS 범위 상단 (26.6~31.5% 내 30.43%) |

**새 턴 데이터 (이전 16:43 보고 대비 +4 AI 턴)**:
| T40 | 219.3s | PLACE 3 (cumul 21) |
| T42 | 251.0s | DRAW |
| T44 | 208.2s | DRAW |
| T46 | 227.3s | DRAW |

특이: 후반 진입 전. 중반 p95=394s 유지. T40 PLACE 외 중반 DRAW 연속 6회 → place_rate 상승세 둔화 (이전 31.6% → 30.43%).

### 스냅샷 [2026-04-19 17:20 KST]

| 항목 | 값 |
|------|-----|
| Run | 1/10 (passthrough) |
| 경과 | 01:47:43 |
| 현재 턴 | T56 thinking (AI 28번째) — **후반 구간 진입** |
| AI 턴 n | 27 완료 |
| place / draw / fallback | 8 / 19 / **0** |
| cumul tiles | 24 |
| place_rate 중간 | **29.6%** (v2 baseline 29.07% 중앙값에 수렴) |
| 초반 T1-25 (n=12) | avg=209s / p95=297s / max=297s |
| 중반 T26-55 (n=15) | avg=253s / p95=394s / max=394s |
| 후반 T56-80 (n=0) | 미완료 (T56 thinking 중) |
| 활성 게임 | 1 |
| DeepSeek 누적 | $0.0674 (28 requests) |
| sanity 판정 | **PASS 중앙 수렴** (29.6% ∈ 26.6~31.5%) |

**새 턴 (17:05 대비 +4 AI 턴, 후반 진입)**:
- T48: 337.9s DRAW
- T50: 251.2s DRAW
- T52: 254.2s DRAW
- T54: 189.3s **PLACE 3** (cumul=24)
- T56: thinking... (후반 구간 첫 턴)

### 스냅샷 [2026-04-19 17:22 KST]

| 항목 | 값 |
|------|-----|
| Run | 1/10 (passthrough) |
| 경과 | 01:48:55 |
| 현재 턴 | T56 thinking (268s 경과 중) |
| AI 턴 n | 27 완료 (이전 스냅샷과 동일) |
| place / draw / fallback | 8 / 19 / 0 |
| cumul tiles | 24 |
| place_rate 중간 | 29.6% |
| 후반 T56-80 (n=0) | T56 추론 268s/700s 진행 (ai-adapter attempt=1/3) |
| 활성 게임 | 1 |
| DeepSeek 누적 | $0.067 (28 req, T56 완료 전) |

**hang 아님 확인**: ai-adapter 로그 17:17:15 KST 에 T56 요청 시작, 현재 17:22 시점 경과 268s. DeepSeek Reasoner 중반 평균 253s 약간 상회 (후반 자율추론 조짐 정상).

### 스냅샷 [2026-04-19 17:37 KST]

| 항목 | 값 |
|------|-----|
| Run | 1/10 (passthrough) |
| 경과 | 02:04:41 |
| 현재 턴 | T64 thinking (AI 32번째) |
| AI 턴 n | 31 완료 |
| place / draw / fallback | 8 / 23 / **0** |
| cumul tiles | 24 |
| place_rate 중간 | **25.8%** ⚠ (이전 29.6% → 후반 DRAW 연속 4회로 하락) |
| 초반 T1-25 (n=12) | avg=209s / p95=297s / max=297s |
| 중반 T26-55 (n=15) | avg=253s / p95=394s / max=394s |
| 후반 T56-80 (n=4) | avg=271s / p95=331s / max=331s |
| 활성 게임 | 1 |
| DeepSeek 누적 | $0.0781 (32 req) |
| sanity 판정 | **경계 하단 이탈 직전** (25.8% < 26.6% 임계) |

**새 턴 (+4 AI 턴, 후반 진입)**:
- T56: 277.5s DRAW (후반 첫 턴)
- T58: 151.0s DRAW
- T60: 322.7s DRAW
- T62: 330.7s DRAW

**주의**: Run 1 잔여 T64-T80 = AI 9턴에서 PLACE 안 나오면 최종 sanity 이탈 (≤24%). Run 2 passthrough 에서 교차 확인 필요.
**긍정**: 후반 p95=331s 는 700s timeout 체인 대비 여유 큼. Task #19 timeout 유지 가능 방향.
> **[KILLED 2026-04-21 — v6 결론으로 불필요]** Task #19 (gpt-5-mini turn 80 × 3N 본실측) 는 Day 9~10 v6 두 축 동시 확증으로 marginal value=0 확정, Kill 처리. 근거: `work_logs/decisions/2026-04-21-01-plan-b-activation.md` §4.

### 스냅샷 [2026-04-19 17:54 KST]

| 항목 | 값 |
|------|-----|
| Run | 1/10 (passthrough) |
| 경과 | 02:21:41 |
| 현재 턴 | T70 thinking (AI 35번째) |
| AI 턴 n | 34 완료 |
| place / draw / fallback | **9** / 25 / **0** |
| cumul tiles | **27** |
| place_rate 중간 | **26.5%** ↑ (이전 25.8% → T64 PLACE 3 회복) |
| 초반 T1-25 (n=12) | avg=209s / p95=297s / max=297s |
| 중반 T26-55 (n=15) | avg=253s / p95=394s / max=394s |
| 후반 T56-80 (n=7) | avg=283s / p95=**371s** / max=**371s** (갱신) |
| 활성 게임 | 1 |
| DeepSeek 누적 | $0.0872 (35 req) |
| sanity 판정 | **PASS 하단 경계** (26.5% ≥ 26.6% 딱 근처, 경계 복귀) |

**새 턴 (+3 AI 턴)**:
- T64: 259.1s **PLACE 3** (cumul=27) ← 회복 시작
- T66: 371.5s DRAW (후반 max 갱신)
- T68: 270.4s DRAW

### 스냅샷 [2026-04-19 18:11 KST] — 🚨 후반 p95 임계 초과

| 항목 | 값 |
|------|-----|
| Run | 1/10 (passthrough) |
| 경과 | 02:38:40 |
| 현재 턴 | T76 thinking (AI 38번째) |
| AI 턴 n | 37 완료 |
| place / draw / fallback | **10** / 27 / **0** |
| cumul tiles | **30** |
| place_rate 중간 | **27.0%** (↑ 26.5% → T72 PLACE 3 회복) |
| 초반 T1-25 (n=12) | avg=209s / p95=297s / max=297s |
| 중반 T26-55 (n=15) | avg=253s / p95=394s / max=394s |
| 후반 T56-80 (n=10) | **avg=308s / p95=513s ⚠ / max=513s** |
| 활성 게임 | 1 |
| DeepSeek 누적 | $0.0977 (38 req) |
| sanity 판정 | PASS 하단 복귀 (27.0% ∈ 26.6~31.5%) |
| **🚨 timeout signal** | **후반 p95=513s > 500s 임계** → 본실측 turn 80×3N 에는 1100s 체인 권고 *[KILLED 2026-04-21 — v6 결론으로 본실측 자체 불필요, 1100s 체인 조정 회피]* |

**새 턴 (+3 AI 턴, 후반 p95 임계 돌파)**:
- T70: **513.1s DRAW** ⚠ (700s timeout 대비 73%, fallback 미발생)
- T72: 291.3s **PLACE 3** (cumul=30)
- T74: 288.2s DRAW

**분석**: T70 이 DeepSeek 역대 max 349s 를 훨씬 초과 (513s). DeepSeek Reasoner 후반 자율추론 확장 극대화 관찰. **fallback 은 미발생**, timeout 700s 한도 내 정상 완료. 다만 본실측 (turn 80 × 3N = 9 runs) 에서 **최소 1 run 은 700s 초과 fallback 가능성** 존재. **Task #19 timeout 1100s 체인 조정 권고**.
> **[KILLED 2026-04-21]** Task #19 본실측 자체가 v6 Kill 결론으로 불필요 확정. 700s timeout 체인 변경도 회피 (KDP #7 SSOT 보호). 근거: `work_logs/decisions/2026-04-21-01-plan-b-activation.md`.

장애 보고서 기준: fallback 1건 발생 조건에 해당 X (p95 초과는 signal 레벨). 

---

## ✅ Run 1/10 passthrough — 최종 확정 (2026-04-19 18:16:25 KST)

| 지표 | 값 |
|------|-----|
| **place_rate** | **28.2%** (11 PLACE / 39 AI 턴) |
| tiles placed | **31** |
| 소요 | **9845s (164분)** |
| DeepSeek 비용 | **$0.039** |
| fallback | **0** |
| turn 도달 | 80 turn TIMEOUT (정상 종료) |
| avg latency | 252.4s |
| p50 | 246.4s |
| min / max | 108.8s / **513.1s** |

**sanity 판정**: v2 baseline 29.07% ± 2.45%p (26.6~31.5%) 범위 → **28.2% PASS** ✅ (하단 근처, 통계적으로 v2 bitwise 동일 전제 지지)

**PLACE 턴 상세** (11회):
T2(9), T8(1), T12(3), T18(2), T22(1), T26(2), T40(3), T54(3), T64(3), T72(3), T78(1)

---

## 🟢 Run 2/10 passthrough — 진행 중 (18:16:55 KST 시작)

| 항목 | 값 |
|------|-----|
| 현재 턴 | T12 thinking (AI 6번째) |
| AI 턴 n | 5 완료 |
| place/draw/fallback | 1 / 4 / 0 |
| cumul tiles | 3 |
| Run 2 초반 avg | **107s** (Run 1 초반 avg 209s 대비 **51% 감소**) |
| 활성 게임 | 1 (game:d711ed58) |
| DeepSeek 누적 (Run 1+2) | $0.1123 (46 req) |

**특이**: Run 2 초반 latency 가 Run 1 대비 현저히 짧음. DeepSeek 내부 캐싱 / 간단한 초기 rack 가능성. 추적 필요.

---

## 이전 테스트 비교표 (passthrough Run 1 최종 공식 추가)

| 실험 | N | place_rate | 소요 | avg latency | max | fallback |
|-----|---|-----------|------|-------------|-----|----------|
| v2 (Day 8) | 3 | **29.07% ± 2.45%p** | — | 203s | — | — |
| v3 (Day 8) | 3 | 29.03% ± 3.20%p | — | — | — | — |
| v4 unlimited (Day 7) | 1 | 20.5% | — | — | 1337s | 0 |
| DeepSeek 역대 | — | — | — | 176s | 349s | — |
| **passthrough Run 1** | **1** | **28.2%** ✅ | **164m** | **252s** | **513s** ⚠ | **0** |
| passthrough Run 2 (중간 n=5) | — | 20% | — | 107s | 178s | 0 |

### 스냅샷 [2026-04-19 18:45 KST]

| 항목 | 값 |
|------|-----|
| Run | **2/10** (passthrough) |
| 경과 (전체) | 03:12:37 |
| Run 2 경과 | 28분 |
| 현재 턴 | T22 thinking (AI 11번째) |
| AI 턴 n | 10 완료 |
| place / draw / fallback | 2 / 8 / **0** |
| cumul tiles | 6 |
| place_rate 중간 | 20.0% (n=10 분산 큼, 초반 판정 유보) |
| 초반 T1-25 (n=10) | avg=**143s** / p95=231s / max=231s |
| 중반 T26-55 | 미진입 |
| 후반 T56-80 | 미진입 |
| 활성 게임 | 1 (game:d711ed58) |
| DeepSeek 누적 (Run1+2) | $0.1218 (51 req, Run 2 분 ~$0.03) |

**새 턴 (Run 2 초반 10턴)**:
- T2: 80s PLACE 3 (cumul=3) — Run 1 T2 262s 대비 -69%
- T4: 103s DRAW / T6: 94s DRAW / T8: 82s DRAW
- T10: 178s DRAW / T12: 160s DRAW / T14: 125s DRAW
- T16: 161s PLACE 3 (cumul=6)
- T18: 216s DRAW / T20: 231s DRAW

**Run 2 vs Run 1 초반 비교**:
- Run 1 초반 avg 209s / Run 2 초반 avg **143s** (-32%)
- Run 1 초반 max 297s / Run 2 초반 max 231s (-22%)
- **hypothesis**: DeepSeek API 서버 응답 성능 시간대별 변동 (Run 1 은 15:32~, Run 2 는 18:17~)

**현재까지 timeout signal**: Run 2 아직 중반/후반 미진입. 500s+ 재발 확증 대기.

### 스냅샷 [2026-04-19 19:02 KST]

| 항목 | 값 |
|------|-----|
| Run | 2/10 (passthrough) |
| 경과 (전체) | 03:29:35 |
| Run 2 경과 | 45분 |
| 현재 턴 | T30 thinking (AI 15번째) |
| AI 턴 n | 14 완료 |
| place / draw / fallback | 3 / 11 / **0** |
| cumul tiles | 10 |
| place_rate 중간 | 21.4% |
| 초반 T1-25 (n=12) | **avg=158s / p95=313s / max=313s** |
| 중반 T26-55 (n=2) | avg=239s / p95=290s / max=290s |
| 후반 T56-80 | 미진입 |
| 활성 게임 | 1 |
| DeepSeek 누적 (Run1+2) | $0.1317 (55 req, Run 2 분 ~$0.05) |

**새 턴 (+4)**:
- T22: 313.5s DRAW (초반인데 고지연)
- T24: 155.4s **PLACE 4** (cumul=10)
- T26: 188.1s DRAW (중반 진입)
- T28: 290.3s DRAW

**Run 1 vs Run 2 초반 최종 비교 (n=12 동일)**:
- avg: Run 1 209s / Run 2 **158s** (-24%)
- max: Run 1 297s / Run 2 **313s** (+5%)
- p95: Run 1 297s / Run 2 313s

**관측**: Run 2 avg 는 낮지만 max 는 Run 1 보다 높음. T22 313s 가 초반 단일 long-tail. **후반에서 500s+ 재발 가능성 높음**. 현재 timeout 체인 조정 권고 유지.

**Run 2 예상 완료**: 중반/후반 avg 가정 250~300s → 추가 70~90분 → 20:12~20:32 KST

### 스냅샷 [2026-04-19 19:19 KST]

| 항목 | 값 |
|------|-----|
| Run | 2/10 (passthrough) |
| 경과 (전체) | 03:46:39 |
| Run 2 경과 | 62분 |
| 현재 턴 | T38 thinking (AI 19번째) |
| AI 턴 n | 18 완료 |
| place / draw / fallback | 4 / 14 / **0** |
| cumul tiles | 13 |
| place_rate 중간 | 22.2% |
| 초반 T1-25 (n=12) | avg=158s / p95=313s / max=313s |
| 중반 T26-55 (n=6) | avg=**264s** / p95=337s / max=337s |
| 후반 T56-80 | 미진입 |
| 활성 게임 | 1 |
| DeepSeek 누적 (Run1+2) | $0.1431 (59 req, Run 2 분 $0.045) |

**새 턴 (+4)**:
- T30: 337.2s DRAW
- T32: 246.9s DRAW
- T34: 245.0s **PLACE 3** (cumul=13)
- T36: 274.9s DRAW

**Run 1 vs Run 2 중반 비교 (동일 AI 12턴 기준 vs 현재 6턴)**:
- Run 1 중반 (n=15): avg 253s / p95 394s
- Run 2 중반 (n=6):  avg 264s / p95 337s
- Run 2 중반이 Run 1 과 유사 범위. avg 약간 높고 p95 낮음

**예상 Run 2 완료**: T38~T80 남음 → 22턴 × avg 260s ≈ 95분 → **20:54 KST**

### 스냅샷 [2026-04-19 19:36 KST]

| 항목 | 값 |
|------|-----|
| Run | 2/10 (passthrough) |
| 경과 (전체) | 04:03:34 |
| Run 2 경과 | 79분 |
| 현재 턴 | T46 thinking (AI 23번째) |
| AI 턴 n | 22 완료 |
| place / draw / fallback | 5 / 17 / **0** |
| cumul tiles | 16 |
| place_rate 중간 | 22.7% |
| 초반 T1-25 (n=12) | avg=158s / p95=313s / max=313s |
| 중반 T26-55 (n=10) | avg=**262s** / p95=337s / max=337s |
| 후반 T56-80 | 미진입 |
| 활성 게임 | 1 |
| DeepSeek 누적 (Run1+2) | $0.1541 (63 req, Run 2 분 $0.056) |

**새 턴 (+4)**:
- T38: 278.5s DRAW
- T40: 308.4s DRAW
- T42: 241.4s **PLACE 3** (cumul=16)
- T44: 207.5s DRAW

**Run 1 vs Run 2 중반 최종 (거의 동일)**:
- Run 1 중반 (n=15): avg 253s / p95 394s
- Run 2 중반 (n=10): avg 262s / p95 337s

Run 2 남은: T46-T80 = AI 18턴 × avg 270s ≈ 81분 → **Run 2 완료 ~21:00 KST**

### 스냅샷 [2026-04-19 19:53 KST]

| 항목 | 값 |
|------|-----|
| Run | 2/10 (passthrough) |
| 경과 (전체) | 04:20:31 |
| Run 2 경과 | 96분 |
| 현재 턴 | T52 thinking (AI 26번째) |
| AI 턴 n | 25 완료 |
| place / draw / fallback | 5 / 20 / **0** |
| cumul tiles | 16 |
| place_rate 중간 | 20.0% ⚠ (하락. Run 1 동일 시점 26.9%) |
| 초반 T1-25 (n=12) | avg=158s / p95=313s / max=313s |
| 중반 T26-55 (n=13) | avg=**270s** / p95=337s / max=337s |
| 후반 T56-80 | 미진입 |
| 활성 게임 | 1 |
| DeepSeek 누적 (Run1+2) | $0.1637 (66 req, Run 2 분 $0.066) |

**새 턴 (+3)**:
- T46: 337.1s DRAW
- T48: 226.0s DRAW
- T50: 322.8s DRAW

**Run 1 vs Run 2 동일 시점 (T50 직후) 비교**:
- Run 1 동일 시점: place 7 / 26 = **26.9%**
- Run 2 현재: place 5 / 25 = **20.0%** (-7%p)

**해석**: Run 2 가 Run 1 대비 place 수 적음. 후반 T56-T80 에서 회복 가능성 있으나 최종 sanity 이탈(<26%) 가능성 ↑. N=2 통계 단일 편차 가능.

**Run 2 예상 완료**: T52-T80 = AI 15턴 × avg 270s ≈ 68분 → **~21:01 KST**

### 스냅샷 [2026-04-19 20:10 KST]

| 항목 | 값 |
|------|-----|
| Run | 2/10 (passthrough) |
| 경과 (전체) | 04:37:30 |
| Run 2 경과 | 113분 |
| 현재 턴 | T60 thinking (AI 30번째) — **후반 진입** |
| AI 턴 n | 29 완료 |
| place / draw / fallback | **6** / 23 / **0** |
| cumul tiles | 19 |
| place_rate 중간 | 20.7% (T54 PLACE 3 추가, 여전히 경계 하단 아래) |
| 초반 T1-25 (n=12) | avg=158s / p95=313s / max=313s |
| 중반 T26-55 (n=15) | avg=**263s** / p95=**419s** ⚠ / max=**419s** (Run 1 394s 초과) |
| 후반 T56-80 (n=2) | avg=303s / p95=384s / max=384s |
| 활성 게임 | 1 |
| DeepSeek 누적 (Run1+2) | $0.1770 (70 req, Run 2 분 $0.079) |

**새 턴 (+4)**:
- T52: 419.0s DRAW ⚠ (Run 2 중반 max, Run 1 394s 초과)
- T54: 225.6s **PLACE 3** (cumul=19)
- T56: 383.9s DRAW (후반 첫 턴)
- T58: 221.9s DRAW

**Run 1 vs Run 2 동일 시점 (T58 완료)**:
- Run 1: place 8 / 29 = **27.6%**
- Run 2: place 6 / 29 = **20.7%** (-7%p 격차 유지)

**타임아웃 신호 강화**:
- Run 1: 중반 max 394s (T36), 후반 max 513s (T70)
- Run 2: 중반 max 419s (T52), 후반 첫 턴 384s (T56)
- Run 2 후반에서도 500s+ 재발 매우 유력 → **Task #19 1100s 체인 확증 방향** *[KILLED 2026-04-21 — Task #19 자체 Kill]*

**Run 2 예상 완료**: T60-T80 = AI 11턴 × avg 300s ≈ 55분 → **~21:05 KST**

### 스냅샷 [2026-04-19 20:27 KST]

| 항목 | 값 |
|------|-----|
| Run | 2/10 (passthrough) |
| 경과 (전체) | 04:54:33 |
| Run 2 경과 | 130분 |
| 현재 턴 | T66 thinking (AI 33번째) |
| AI 턴 n | 32 완료 |
| place / draw / fallback | **8** / 24 / **0** |
| cumul tiles | 23 |
| place_rate 중간 | **25.0%** ↑ (20.7% → T60 PLACE 1 + T64 PLACE 3 회복) |
| 초반 T1-25 (n=12) | avg=158s / p95=313s / max=313s |
| 중반 T26-55 (n=15) | avg=263s / p95=419s / max=419s |
| 후반 T56-80 (n=5) | avg=289s / p95=**384s** / max=384s (Run 1 513s 대비 낮음) |
| 활성 게임 | 1 |
| DeepSeek 누적 (Run1+2) | $0.1857 (73 req, Run 2 분 $0.087) |

**새 턴 (+3)**:
- T60: 317.9s **PLACE 1** (cumul=20) — 후반 첫 PLACE
- T62: 336.0s DRAW
- T64: 186.1s **PLACE 3** (cumul=23) — 빠른 PLACE 회복

**핵심 관측**:
- Run 2 후반 현재 p95=384s < Run 1 후반 p95=513s → Run 2 후반 latency 더 안정
- place_rate 회복세: 20.7% → 25.0% (+4.3%p)
- 잔여 8턴에서 3 PLACE 나오면 11/40=27.5% PASS

**Run 2 예상 완료**: T66-T80 = 8 AI턴 × 290s ≈ 39분 → **~21:06 KST**

### 스냅샷 [2026-04-19 20:44 KST] — 🚨 FALLBACK 발생

| 항목 | 값 |
|------|-----|
| Run | 2/10 (passthrough) |
| 경과 (전체) | 05:11:29 |
| Run 2 경과 | 147분 |
| 현재 턴 | T72 thinking (AI 36번째) |
| AI 턴 n | 35 완료 |
| place / draw / **fallback** | **9** / 25 / **1** ⚠ |
| cumul tiles | 26 |
| place_rate 중간 | 25.7% |
| 초반 T1-25 (n=12) | avg=158s / p95=313s / max=313s |
| 중반 T26-55 (n=15) | avg=263s / p95=419s / max=419s |
| 후반 T56-80 (n=8) | avg=**327s** / p95=**710s** ⚠ / max=**710s (fallback)** |
| 활성 게임 | 1 |
| DeepSeek 누적 (Run1+2) | $0.1937 (76 req) |
| **🚨 장애** | **T66 AI_TIMEOUT @ 710.5s** — adapter_floor 700s 초과 10.5s |

**장애보고서**: `work_logs/incidents/2026-04-19-01-timeout.md` 작성 완료

**새 턴**:
- T66: **710.5s DRAW (fallback: AI_TIMEOUT)** ⚠ — adapter_floor 700s 초과
- T68: 257.8s **PLACE 3** (cumul=26) — 정상 복귀
- T70: 205.9s DRAW

**근본 원인**: adapter_floor=700s 가 DeepSeek Reasoner 후반 자율 추론 확장 최대 시간에 부족. PassthroughShaper (v2 bitwise) 문제 아님. **Task #19 본실측 kickoff 전 1100s 체인 업그레이드 필수**.
> **[KILLED 2026-04-21]** v6 Kill 로 Task #19 본실측 불필요. 1100s 체인 업그레이드는 회피 (`work_logs/decisions/2026-04-21-01-plan-b-activation.md` §4.2-4).

**결정**: 배치 계속 진행 (연속 3건 아님). 애벌레 즉시 알림.

---

## ✅ Run 2/10 passthrough — 최종 확정 (2026-04-19 20:55:24 KST)

| 지표 | 값 |
|------|-----|
| **place_rate** | **28.2%** (11 PLACE / 39 AI 턴) — **Run 1 과 동일!** |
| tiles placed | **30** |
| 소요 | **9507.7s (158분)** |
| DeepSeek 비용 | **$0.039** |
| **fallback** | **1** (AI_TIMEOUT x1 @ T66 710.5s) |
| turn 도달 | 80 turn TIMEOUT (정상 종료) |
| avg latency | 243.8s |
| p50 | 226.0s |
| min / max | 80.0s / **710.5s** |

**PLACE 턴 상세** (11회):
T2(3), T16(3), T24(4), T34(3), T42(3), T54(3), T60(1), T64(3), T68(3), T72(1), T78(3)

**sanity 판정**: v2 baseline 26.6~31.5% 범위 → **28.2% PASS** ✅

---

## 🎯 passthrough N=2 통합 결과 (Sanity Check 확증)

| 지표 | Run 1 | Run 2 | N=2 평균 |
|------|-------|-------|----------|
| place_rate | 28.2% | 28.2% | **28.2%** ✅ |
| tiles | 31 | 30 | 30.5 |
| 소요 | 164분 | 158분 | 161분 |
| 비용 | $0.039 | $0.039 | $0.078 |
| fallback | 0 | 1 | 총 1 |
| avg | 252.4s | 243.8s | 248.1s |
| max | 513s | **710s** ⚠ | 710s |

**🎉 결론**: **passthrough = v2 bitwise 동일 전제 N=2 교차 확증 PASS**
- Run 1, Run 2 **완전히 동일** place_rate 28.2%
- v2 baseline 29.07% ± 2.45%p 내 일관된 수렴
- Node Dev PassthroughShaper 구현 검증 완료
- **timeout 1100s 체인 조정 필수** (max 710s 재확증)

---

## 🟢 Run 3/10 joker-hinter — **v6 첫 실측 시작!** (20:55:55 KST)

| 항목 | 값 |
|------|-----|
| env 전환 확인 | ✅ `DEEPSEEK_REASONER_CONTEXT_SHAPER=joker-hinter` |
| 시작 | 20:56:18 KST |
| 현재 | T12 thinking (AI 6번째) |
| AI 턴 n | 5 완료 |
| place / draw / fallback | **0** / 5 / 0 |
| cumul tiles | 0 |
| 초반 n=5 avg | **69.6s** ⚠ (passthrough Run 1 초반 avg 209s 대비 **-67%!**) |
| 활성 게임 | 1 (game:acd1225f) |

**Run 3 초기 5 AI 턴 (전부 DRAW)**:
- T02: 55.3s DRAW
- T04: 63.7s DRAW
- T06: 59.5s DRAW
- T08: 92.1s DRAW
- T10: 77.6s DRAW

**중요 관측 — joker-hinter 효과 초기 signal**:
1. **초반 latency 급감** — avg 70s (passthrough 209s 대비 -67%)
2. **초반 5턴 연속 DRAW, place 0** — passthrough 는 T2 에서 바로 PLACE 나왔음
3. **가설**: joker-hinter 가 Rack 에 조커 없을 때 hints 가 empty 로 주입됨 → DeepSeek 추론이 매우 짧음. 추론 생략으로 조기 DRAW 선택 경향?
4. 초기 rack 운도 영향 (Run 1 T2 9tiles PLACE 은 예외적 행운)

**주의**: 5턴은 너무 적음. 중반/후반 관찰 필수.

---

## 이전 테스트 비교표 (대폭 확장)

| 실험 | N | place_rate | 소요 | avg | max | fallback |
|-----|---|-----------|------|-----|-----|----------|
| v2 (Day 8) | 3 | 29.07% ± 2.45%p | — | 203s | — | — |
| v3 (Day 8) | 3 | 29.03% ± 3.20%p | — | — | — | — |
| v4 unlimited (Day 7) | 1 | 20.5% | — | — | 1337s | 0 |
| DeepSeek 역대 | — | — | — | 176s | 349s | — |
| **passthrough Run 1** | 1 | **28.2%** | 164m | 252s | 513s | 0 |
| **passthrough Run 2** | 1 | **28.2%** | 158m | 244s | **710s** ⚠ | **1** |
| **passthrough N=2 평균** | **2** | **28.2%** ✅ | 161m | 248s | 710s | 1 |
| **joker-hinter Run 3** (n=5 초반) | — | 0% | — | **70s** ⚠ | 92s | 0 |

### 스냅샷 [2026-04-19 21:19 KST] — Run 3 joker-hinter 중요 진행

| 항목 | 값 |
|------|-----|
| Run | 3/10 (joker-hinter) |
| 경과 (전체) | 05:46:28 |
| Run 3 경과 | 23분 |
| 현재 턴 | T28 thinking (AI 14번째) |
| AI 턴 n | 13 완료 |
| place / draw / fallback | 2 / 11 / **0** |
| cumul tiles | 10 |
| place_rate 중간 | 15.4% (초반~중반 초입) |
| 초반 T1-25 (n=12) | **avg=96s / p95=161s / max=161s** ⚠ |
| 중반 T26-55 (n=1) | avg=208s / p95=208s / max=208s |
| 후반 T56-80 | 미진입 |
| 활성 게임 | 1 |
| DeepSeek 누적 | $0.2231 (94 req, Run 3 분 ~$0.019) |

**새 턴 (+9, 중요 데이터)**:
- T12: 102s DRAW / T14: 82s DRAW / T16: 92s DRAW
- **T18: 86.9s PLACE 6** (cumul=6) ⭐ **initial meld** (Run 1 T2, Run 2 T2 대비 16턴 지연)
- T20: 161s DRAW / T22: 128s DRAW / T24: 147s DRAW
- **T26: 207.9s PLACE 4** (cumul=10)

**🎯 joker-hinter 관측 (v6 첫 실측)**:
1. **초반 latency 급감**: avg 96s (passthrough 209/158s 대비 **-54%~-39%**)
2. **initial meld 대폭 지연**: T2 → T18 (16턴 늦음)
3. **초반 place 부족**: 2/13 = 15.4% (Run 1 동시점 ~41%, Run 2 ~25%)
4. **중반 진입 시 latency 상승**: T26=208s, passthrough 중반 avg 253/263s 근접

**해석**:
- Rack 에 조커 없을 때 JokerHinterShaper `hints: []` → DeepSeek 추론 단축 가설 **확증**
- 이후 DeepSeek 은 draw 반복으로 타일 수집 → T18 에서 Rack 모아 6tiles PLACE (initial meld)
- 중반부터는 Rack 에 조커 생겨 hints 생성됐을 수도 → latency 상승 + PLACE 재개

**Run 3 최종 sanity 예측**: 초반 2 PLACE + 중반 1 PLACE 시작 → 전체 8~10 PLACE 예상 → 최종 20~25% → **경계 하단 이탈 가능성 ↑**

**timeout signal**: 후반 500s+ 는 아직 미도달. 추후 관찰.

**Run 3 예상 완료**: 초반 빠른 속도 고려 + 중반/후반 정상 속도 → **~23:00~23:30 KST**

### 스냅샷 [2026-04-19 21:36 KST] — Run 3 joker-hinter 중반 진입

| 항목 | 값 |
|------|-----|
| Run | 3/10 (joker-hinter) |
| 경과 (전체) | 06:03:26 |
| Run 3 경과 | 40분 |
| 현재 턴 | T38 thinking (AI 19번째) |
| AI 턴 n | 18 완료 |
| place / draw / fallback | **4** / 14 / **0** |
| cumul tiles | 14 |
| place_rate 중간 | **22.2%** ↑ (15.4% → T32+T36 PLACE 회복) |
| 초반 T1-25 (n=12) | avg=**96s** / p95=161s / max=161s |
| 중반 T26-55 (n=6) | avg=**203s** / p95=240s / max=240s |
| 후반 T56-80 | 미진입 |
| 활성 게임 | 1 |
| DeepSeek 누적 | $0.2347 (99 req, Run 3 분 $0.030) |

**새 턴 (+5)**:
- T28: 205.8s DRAW / T30: 211.9s DRAW
- **T32: 167.0s PLACE 1** (cumul=11)
- T34: 183.4s DRAW
- **T36: 240.2s PLACE 3** (cumul=14)

**joker-hinter vs passthrough 구간별 비교**:

| 구간 | passthrough 평균 | joker-hinter (현재) | Δ |
|------|-----------------|---------------------|---|
| 초반 avg | ~184s | **96s** | **-48%** |
| 중반 avg | ~258s | **203s** | **-21%** |
| 중반 p95 | ~407s | 240s | -41% |
| 중반 max | ~407s | 240s | -41% |

**joker-hinter 효과 업데이트**:
1. 전체 latency 단축 추세 (초반 -48%, 중반 -21%)
2. place_rate 회복 중 (15.4% → 22.2%) — 중반 place 활동 재개
3. **초반 지연 대가로 중반부터 PLACE 빈도 정상화** 경향
4. 최종 sanity 는 후반 T56-80 에 달림 (잔여 AI 21턴)

**Run 3 예상 완료**: T38-T80 = AI 21턴 × avg 210s ≈ 74분 → **~22:50 KST**

### 스냅샷 [2026-04-19 21:53 KST] — Run 3 place_rate PASS 복귀 🎉

| 항목 | 값 |
|------|-----|
| Run | 3/10 (joker-hinter) |
| 경과 (전체) | 06:20:23 |
| Run 3 경과 | 57분 |
| 현재 턴 | T46 thinking (AI 23번째) |
| AI 턴 n | 22 완료 |
| place / draw / fallback | **6** / 16 / **0** |
| cumul tiles | 19 |
| place_rate 중간 | **27.3%** ✅ (22.2% → PASS 경계 복귀) |
| 초반 T1-25 (n=12) | avg=96s / p95=161s / max=161s |
| 중반 T26-55 (n=10) | avg=**220s** / p95=278s / max=278s |
| 후반 T56-80 | 미진입 |
| 활성 게임 | 1 |
| DeepSeek 누적 | $0.245 (103 req, Run 3 분 $0.040) |

**새 턴 (+4)**:
- T38: 268.4s DRAW
- **T40: 258.6s PLACE 4** (cumul=18)
- T42: 278.2s DRAW
- **T44: 180.8s PLACE 1** (cumul=19)

**🎯 joker-hinter v6 첫 실측 중간 평가 (n=22)**:

| 지표 | passthrough 평균 | joker-hinter Run 3 | Δ |
|------|-----------------|--------------------|---|
| place_rate 중간 | 26~28% | **27.3%** | 유사 |
| 초반 avg | 184s | 96s | **-48%** |
| 중반 avg | 258s | 220s | -15% |
| 중반 p95 | ~407s | 278s | -32% |
| 중반 max | ~407s | 278s | -32% |

**해석**:
- **place_rate 회복**: 초반 지연 후 중반에 passthrough 수준으로 수렴
- **latency 전반적 단축**: 특히 초반 -48%, 중반 -15%
- **joker-hinter 효과 판정**: 아직 후반 T56-T80 미관찰. 최종 place_rate 가 26~29% 범위면 **passthrough 와 구분 불가** (v2 텍스트 튜닝과 유사 결론)

**Run 3 예상 완료**: T46-T80 = AI 18턴 × avg 220s ≈ 66분 → **~22:59 KST**

### 스냅샷 [2026-04-19 22:10 KST] — Run 3 PLACE 급상승

| 항목 | 값 |
|------|-----|
| Run | 3/10 (joker-hinter) |
| 경과 (전체) | 06:37:25 |
| Run 3 경과 | 74분 |
| 현재 턴 | T52 thinking (AI 26번째) |
| AI 턴 n | 25 완료 |
| place / draw / fallback | **8** / 17 / **0** |
| cumul tiles | 23 |
| place_rate 중간 | **32.0%** ⚠ (PASS 상단 31.5% 초과!) |
| 초반 T1-25 (n=12) | avg=96s / p95=161s / max=161s |
| 중반 T26-55 (n=13) | avg=**251s** / p95=**456s** ⚠ / max=**456s** |
| 후반 T56-80 | 미진입 |
| 활성 게임 | 1 |
| DeepSeek 누적 | $0.2554 (106 req, Run 3 분 $0.050) |

**새 턴 (+3) — PLACE 연속 2회**:
- T46: 243.6s DRAW
- **T48: 456.0s PLACE 3** (cumul=22) — 중반 max 대폭 갱신
- **T50: 360.9s PLACE 1** (cumul=23)

**중요 관측**:
1. **latency 급등 + PLACE 연속**: T48=456s, T50=361s — 추론 시간 길어지며 meld 구성 성공
2. **가설 수정**: 이제 Rack 에 조커/pair 가 생겨 hints 가 실제 주입되기 시작 → DeepSeek 이 적극 활용
3. **place_rate 32.0% PASS 상단 초과** — joker-hinter 가 중반부터 **positive** 효과 가능성
4. 잔여 T52-T80 = AI 16턴. 속도가 다시 감소하면 최종 28~30% 예상

**중반 avg 상승**: 220s → 251s (passthrough 258s 근접)
**중반 max 갱신**: 278s → **456s** (passthrough 407s 추월)

**Run 3 예상 완료**: T52-T80 = AI 16턴 × avg 300s (후반 가정) ≈ 80분 → **~23:30 KST**

### 스냅샷 [2026-04-19 22:27 KST] — Run 3 후반 진입

| 항목 | 값 |
|------|-----|
| Run | 3/10 (joker-hinter) |
| 경과 (전체) | 06:54:22 |
| Run 3 경과 | 91분 |
| 현재 턴 | T58 thinking (AI 29번째) |
| AI 턴 n | 28 완료 |
| place / draw / fallback | 8 / 20 / **0** |
| cumul tiles | 23 (변화 없음, 3 turn 연속 DRAW) |
| place_rate 중간 | **28.6%** (32.0% → 하락 수렴) |
| 초반 T1-25 (n=12) | avg=96s / p95=161s / max=161s |
| 중반 T26-55 (n=15) | avg=**259s** / p95=456s / max=456s |
| 후반 T56-80 (n=1) | T56 = 349.1s DRAW |
| 활성 게임 | 1 |
| DeepSeek 누적 | $0.2647 (109 req, Run 3 분 $0.059) |

**새 턴 (+3, 3 연속 DRAW)**:
- T52: 315.4s DRAW
- T54: 300.8s DRAW
- T56: **349.1s DRAW** (후반 첫 턴)

**joker-hinter vs passthrough 구간별 (업데이트)**:

| 구간 | passthrough N=2 | joker-hinter Run 3 | Δ |
|------|-----------------|---------------------|---|
| 초반 avg | 184s | **96s** | **-48%** |
| 중반 avg | 258s | **259s** | **+0%** (수렴!) |
| 중반 p95 | ~407s | 456s | +12% |
| 중반 max | ~407s | 456s | +12% |
| 후반 avg | 308s | 349s (n=1) | TBD |
| place_rate | 28.2% | **28.6%** | **+0.4%p** |

**🎯 중요 재평가**:
- 초반 speed 이점은 중반에 **완전히 사라짐** (avg 259s ≈ passthrough 258s)
- place_rate **28.6%** ≈ passthrough 28.2% — **Δ +0.4%p, 통계적 구분 불가**
- joker-hinter 가 initial meld 지연을 일으켰지만 중반~후반에 회복해 passthrough 와 유사 결과
- **v6 텍스트 튜닝과 동일 결론 도달 가능성 ↑** (구조 튜닝도 ~28% 수렴)

**Run 3 예상 완료**: T58-T80 = AI 12턴 × avg 325s ≈ 65분 → **~23:32 KST**

### 스냅샷 [2026-04-19 22:44 KST] — Run 3 후반 latency 급상승

| 항목 | 값 |
|------|-----|
| Run | 3/10 (joker-hinter) |
| 경과 (전체) | 07:11:20 |
| Run 3 경과 | 108분 |
| 현재 턴 | T62 thinking (AI 31번째) |
| AI 턴 n | 30 완료 |
| place / draw / fallback | **9** / 21 / **0** |
| cumul tiles | 25 |
| place_rate 중간 | **30.0%** (28.6%→30.0%, T60 PLACE 효과) |
| 초반 T1-25 (n=12) | avg=96s / p95=161s / max=161s |
| 중반 T26-55 (n=15) | avg=259s / p95=456s / max=456s |
| 후반 T56-80 (n=3) | **avg=408s ⚠ / p95=441s / max=441s** (passthrough max 513s 대비 낮음) |
| 활성 게임 | 1 |
| DeepSeek 누적 | $0.2731 (111 req, Run 3 분 $0.066) |

**새 턴 (+2)**:
- T58: 433.2s DRAW
- **T60: 441.2s PLACE 2** (cumul=25)

**joker-hinter 후반 특성 관찰**:
- 후반 avg 408s — 중반(259s)보다 **+58%**, passthrough 후반(308s)보다 **+32%**
- **원인 가설**: Rack 에 조커/pair 생김 → hints 주입 → DeepSeek 이 hints 를 열심히 분석하며 추론 길어짐
- 하지만 **500s+ 는 아직 없음** (max 441s) — passthrough 의 513/710s 보다 낮음

**joker-hinter 전체 profile 비교**:

| 구간 | passthrough N=2 avg | joker-hinter Run 3 | Δ |
|------|---------------------|---------------------|---|
| 초반 avg | 184s | 96s | **-48%** |
| 중반 avg | 258s | 259s | 0% |
| **후반 avg** | **308s** | **408s** | **+32%** |
| place_rate (중간) | 28.2% | **30.0%** | **+1.8%p** |

**Run 3 예상 완료**: T62-T80 = AI 10턴 × avg 420s ≈ 70분 → **~23:54 KST**

### 스냅샷 [2026-04-19 23:01 KST] — Run 3 후반 DRAW 연속

| 항목 | 값 |
|------|-----|
| Run | 3/10 (joker-hinter) |
| 경과 (전체) | 07:28:21 |
| Run 3 경과 | 125분 |
| 현재 턴 | T70 thinking (AI 35번째) |
| AI 턴 n | 34 완료 |
| place / draw / fallback | 9 / 25 / **0** |
| cumul tiles | 25 (변화 없음, 4 DRAW 연속) |
| place_rate 중간 | **26.5%** (30.0%→26.5%, PASS 하단 경계) |
| 초반 T1-25 (n=12) | avg=96s / p95=161s / max=161s |
| 중반 T26-55 (n=15) | avg=259s / p95=456s / max=456s |
| 후반 T56-80 (n=7) | avg=**341s** / p95=441s / max=441s |
| 활성 게임 | 1 |
| DeepSeek 누적 | $0.2848 (115 req, Run 3 분 $0.078) |

**새 턴 (+4, 모두 DRAW)**:
- T62: 355.0s DRAW
- T64: 318.0s DRAW
- T66: 278.6s DRAW
- T68: 211.2s DRAW

**joker-hinter vs passthrough 최종 근접치 (n=34)**:

| 지표 | passthrough N=2 | joker-hinter Run 3 | Δ |
|------|-----------------|---------------------|---|
| 초반 avg | 184s | 96s | -48% |
| 중반 avg | 258s | 259s | 0% |
| 후반 avg | 308s | **341s** | +11% |
| 후반 max | 513s | **441s** | -14% |
| place_rate 중간 | 28.2% | **26.5%** | **-1.7%p** |

**결론 방향**: place_rate 격차 -1.7%p — **통계 구분 불가 (|Δ| < 2%p)** 영역. joker-hinter 는 v2 (passthrough) 와 사실상 동일한 효과. latency profile 만 다름.

**Run 3 예상 완료**: T70-T80 = AI 6턴 × avg 340s ≈ 34분 → **~23:35 KST**

### 스냅샷 [2026-04-19 23:18 KST] — Run 3 최종 근접

| 항목 | 값 |
|------|-----|
| Run | 3/10 (joker-hinter) |
| 경과 (전체) | 07:45:21 |
| Run 3 경과 | 142분 |
| 현재 턴 | T76 thinking (AI 38번째) |
| AI 턴 n | 37 완료 |
| place / draw / fallback | **10** / 27 / **0** |
| cumul tiles | **29** |
| place_rate 중간 | **27.0%** (26.5%→27.0%, T72 PLACE 4 회복) |
| 초반 T1-25 (n=12) | avg=96s / p95=161s / max=161s |
| 중반 T26-55 (n=15) | avg=259s / p95=456s / max=456s |
| 후반 T56-80 (n=10) | avg=**325s** / p95=441s / max=441s |
| 활성 게임 | 1 |
| DeepSeek 누적 | $0.2918 (118 req, Run 3 분 $0.085) |

**새 턴 (+3)**:
- T70: 283.6s DRAW
- **T72: 282.3s PLACE 4** (cumul=29) — 4 tiles 큰 PLACE
- T74: 298.5s DRAW

**Run 3 near-final 판정**:
- 잔여 T76, T78, T80 = AI 2~3턴
- 0 PLACE → 27.0% / 1 PLACE (3 tiles 가정) → 29.3%
- 예상 최종: **27~30%** 범위

**joker-hinter vs passthrough 후반 profile (Run 3 n=10)**:

| 구간 | passthrough 평균 | joker-hinter | Δ |
|------|-----------------|--------------|---|
| 초반 avg | 184s | 96s | **-48%** |
| 중반 avg | 258s | 259s | 0% |
| 후반 avg | 308s | **325s** | +6% (완화) |
| 후반 max | 513s | **441s** | **-14%** (낮음) |
| 후반 p95 | ~507s | **441s** | **-13%** (낮음) |

**주목**: joker-hinter **후반 long-tail 억제 효과** — max 441s 로 passthrough 의 513/710s 보다 안정

**Run 3 예상 완료**: **~23:35 KST** (잔여 5분, AI 2턴)

---

## ✅ Run 3/10 joker-hinter — 최종 확정 (2026-04-19 23:26:04 KST)

| 지표 | 값 |
|------|-----|
| **place_rate** | **25.6%** (10 PLACE / 39 AI 턴) |
| tiles placed | **29** |
| 소요 | **8985.9s (150분)** |
| DeepSeek 비용 | **$0.039** |
| **fallback** | **0** (passthrough Run 2 의 1건 대비 깨끗) |
| turn 도달 | 80 turn TIMEOUT (정상 종료) |
| avg latency | **230.4s** |
| p50 | 240.2s |
| min / max | **55.3s / 456.0s** |

**PLACE 턴 상세** (10회):
T18(6), T26(4), T32(1), T36(3), T40(4), T44(1), T48(3), T50(1), T60(2), T72(4)

---

## 🎯 joker-hinter Run 3 vs passthrough N=2 평균 (공식 첫 비교)

| 지표 | passthrough N=2 | joker-hinter Run 3 | Δ |
|------|-----------------|---------------------|---|
| **place_rate** | **28.2%** | **25.6%** | **-2.6%p** |
| tiles | 30.5 | 29 | -1.5 |
| avg latency | 248s | 230s | -7% |
| min | 80s | **55s** | -31% |
| **max** | **710s** ⚠ | **456s** | **-36%** (long-tail 억제) |
| fallback | 1 | **0** | 더 안정 |
| 소요 | 161m | 150m | -7% |

**QA §10.3 임계치 대비 Run 3 단독 판정**:
- GO (Δ ≥ +5%p): ✗
- **Pivot (2 ≤ |Δ| < 5%p)**: ✓ **여기 (Δ = -2.6%p)**
- Kill (|Δ| < 2%p): ✗

**N=1 판정은 잠정**. Run 4~6 재현성 확보 후 최종 결정.

---

## 🟢 Run 4/10 joker-hinter (2회차) — 진행 중 (23:26:35 KST 시작)

| 항목 | 값 |
|------|-----|
| 현재 | T08 thinking (AI 5번째) |
| AI 턴 n | 4 완료 |
| Run 4 초반 avg (n=3 지금까지) | **93.5s** (Run 3 초반 5턴 avg 69.6s 대비 +34%) |
| 활성 게임 | 1 (game:0519d3ea) |
| DeepSeek 누적 (Run1~4) | $0.3047 (124 req) |
| 초기 턴 | 전부 DRAW (Run 3 와 동일 패턴) |

**새 턴 (Run 4 초반 3)**:
- T02: 103.6s DRAW
- T04: 84.0s DRAW
- T06: 93.0s DRAW

**Run 4 관찰**: Run 3 초반 패턴 **재현** — hints empty 시 짧은 DRAW 연속. joker-hinter 의 특성 확증.

---

## 이전 테스트 비교표 (v6 Run 3 공식 추가)

| 실험 | N | place_rate | avg | max | fallback | 소요 |
|-----|---|-----------|-----|-----|----------|------|
| v2 (Day 8) | 3 | **29.07% ± 2.45%p** | 203s | — | — | — |
| v3 (Day 8) | 3 | 29.03% ± 3.20%p | — | — | — | — |
| v4 unlimited (Day 7) | 1 | 20.5% | — | 1337s | 0 | — |
| **passthrough Run 1** | 1 | 28.2% | 252s | 513s | 0 | 164m |
| **passthrough Run 2** | 1 | 28.2% | 244s | 710s | 1 | 158m |
| **passthrough N=2 평균** | **2** | **28.2%** ✅ | 248s | 710s | 1 | 161m |
| **joker-hinter Run 3** | **1** | **25.6%** | **230s** | **456s** | **0** | **150m** |
| **joker-hinter vs passthrough Δ** | — | **-2.6%p** | -7% | -36% | -1 | -7% |

### 스냅샷 [2026-04-19 23:52 KST] — Run 4 초반 강한 place

| 항목 | 값 |
|------|-----|
| Run | **4/10** (joker-hinter 2회차) |
| 경과 (전체) | 08:19:15 |
| Run 4 경과 | 26분 |
| 현재 턴 | T20 thinking (AI 10번째) |
| AI 턴 n | 9 완료 |
| place / draw / fallback | **3** / 6 / **0** |
| cumul tiles | **12** |
| place_rate 중간 | **33.3%** (초반 n=9, 분산 큼) |
| 초반 T1-25 (n=9) | avg=**167s** / p95=251s / max=251s |
| 중반 T26-55 | 미진입 |
| 후반 T56-80 | 미진입 |
| 활성 게임 | 1 (game:0519d3ea) |
| DeepSeek 누적 (Run1~4) | $0.3166 (130 req, Run 4 분 ~$0.012) |

**Run 4 초반 9턴 상세**:
- T02: 103.6s DRAW / T04: 84.0s DRAW / T06: 93.0s DRAW
- **T08: 250.9s PLACE 6** (cumul=6) ⭐ **initial meld** (Run 3 T18 대비 10턴 빠름!)
- T10: 194.6s DRAW / T12: 236.3s DRAW
- **T14: 184.9s PLACE 3** (cumul=9)
- T16: 241.0s DRAW
- **T18: 117.0s PLACE 3** (cumul=12)

**Run 3 vs Run 4 초반 비교**:

| 지표 | Run 3 (초반 n=12) | Run 4 (초반 n=9) |
|-----|-------------------|-------------------|
| initial meld 턴 | T18 | **T08** (-10턴) |
| 초반 avg | 96s | 167s |
| 초반 place | 0 (0/12) | **3** (3/9 = 33%) |

**해석**:
- Run 4 가 훨씬 적극적으로 PLACE → 초기 Rack 운이 좋았거나, hints 조합이 유리했던 경우
- 초반 latency 가 Run 3 (96s) 보다 길어짐 (167s) — hints 가 실제 주입되어 추론 길어졌다는 signal
- **joker-hinter 변동성 매우 큼** — N=1 판정은 부정확

**Run 4 예상 완료**: T20-T80 = AI 31턴 × avg 230s ≈ 119분 → **~01:52 KST**

### 스냅샷 [2026-04-20 00:09 KST] — Run 4 초반 완료, 중반 진입

| 항목 | 값 |
|------|-----|
| Run | 4/10 (joker-hinter 2회차) |
| 경과 (전체) | 08:36:15 |
| Run 4 경과 | 43분 |
| 현재 턴 | T28 thinking (AI 14번째) |
| AI 턴 n | 13 완료 |
| place / draw / fallback | **4** / 9 / **0** |
| cumul tiles | **15** |
| place_rate 중간 | **30.8%** (PASS 상단 근접) |
| 초반 T1-25 (n=12) | avg=**183s** / p95=254s / max=254s |
| 중반 T26-55 (n=1) | 207.9s |
| 후반 T56-80 | 미진입 |
| 활성 게임 | 1 |
| DeepSeek 누적 | $0.3259 (134 req, Run 4 분 $0.021) |

**새 턴 (+4)**:
- T20: 253.6s DRAW / T22: 182.0s **PLACE 3** (cumul=15)
- T24: 253.5s DRAW / T26: 207.9s DRAW

**🎯 Run 4 vs Run 3 초반 완전 대조 (n=12 동일)**:

| 지표 | Run 3 | Run 4 | Δ |
|-----|-------|-------|---|
| 초반 avg | 96s | **183s** | **+91%** |
| 초반 max | 161s | 254s | +58% |
| 초반 place | 0 (0/12) | **4** (4/12=33%) | +33%p |
| initial meld | T18 | **T08** | -10턴 |

**해석**: Run 4 초반 avg 183s 는 passthrough 184s 와 **거의 동일** — Run 3 의 96s 와 완전히 다른 profile. 이는:
1. Run 4 초기 Rack 에 조커/pair 가 있어 hints 풀 주입
2. DeepSeek 이 hints 를 유용하게 활용 → 긴 추론 + 적극 PLACE
3. **joker-hinter 효과는 Rack 상황 의존적** (적응적)

**passthrough/joker-hinter 수렴 가설**: joker-hinter 가 "Rack 따라 다르게 행동" 하지만 **장기 평균은 v2와 유사**. Run 5~6 추가 결과 필요.

**Run 4 예상 완료**: T28-T80 = AI 27턴 × avg 230s ≈ 103분 → **~01:52 KST**

### 스냅샷 [2026-04-20 00:26 KST] — Run 4 중반 진입 안정

| 항목 | 값 |
|------|-----|
| Run | 4/10 (joker-hinter 2회차) |
| 경과 (전체) | 08:53:12 |
| Run 4 경과 | 60분 |
| 현재 턴 | T36 thinking (AI 18번째) |
| AI 턴 n | 17 완료 |
| place / draw / fallback | **5** / 12 / **0** |
| cumul tiles | **18** |
| place_rate 중간 | **29.4%** (PASS 중앙 수렴!) |
| 초반 T1-25 (n=12) | avg=183s / p95=254s / max=254s |
| 중반 T26-55 (n=5) | avg=**240s** / p95=316s / max=316s |
| 후반 T56-80 | 미진입 |
| 활성 게임 | 1 |
| DeepSeek 누적 | $0.3359 (138 req, Run 4 분 $0.031) |

**새 턴 (+4)**:
- **T28: 212.8s PLACE 3** (cumul=18)
- T30: 316.4s DRAW / T32: 225.3s DRAW / T34: 237.1s DRAW

**Run 4 안정적 추이**:
- place_rate 30.8% → **29.4%** — v2 baseline 29.07% 근처 수렴
- 중반 avg 240s (Run 3 중반 259s 와 유사)
- 중반 max 316s (Run 3 중반 456s 대비 낮음)

**joker-hinter N=2 잠정 집계 (Run 3 최종 + Run 4 중간)**:

| 항목 | Run 3 최종 | Run 4 중간 (n=17) | 잠정 평균 |
|------|-----------|-------------------|-----------|
| place_rate | 25.6% | 29.4% | **~27.5%** |
| 초반 avg | 96s | 183s | 140s (passthrough 184s 근접) |

**Run 4 예상 완료**: T36-T80 = AI 23턴 × avg 240s ≈ 92분 → **~01:58 KST**

### 스냅샷 [2026-04-20 00:43 KST] — Run 4 DRAW 연속

| 항목 | 값 |
|------|-----|
| Run | 4/10 (joker-hinter 2회차) |
| 경과 (전체) | 09:10:11 |
| Run 4 경과 | 77분 |
| 현재 턴 | T42 thinking (AI 21번째) |
| AI 턴 n | 20 완료 |
| place / draw / fallback | 5 / 15 / **0** |
| cumul tiles | 18 (변화 없음, 4 DRAW 연속) |
| place_rate 중간 | **25.0%** ↓ (29.4%→25.0%, T34-T40 DRAW 연속) |
| 초반 T1-25 (n=12) | avg=183s / p95=254s / max=254s |
| 중반 T26-55 (n=8) | avg=**282s** / p95=**431s** / max=431s |
| 후반 T56-80 | 미진입 |
| 활성 게임 | 1 |
| DeepSeek 누적 | $0.3462 (141 req, Run 4 분 $0.041) |

**새 턴 (+3, 모두 DRAW)**:
- T36: 285.9s DRAW
- **T38: 431.0s DRAW** (Run 4 중반 max)
- T40: 342.5s DRAW

**Run 4 추이 변화**:
- 초반 강세 (4 PLACE, 29.4%) → 중반 DRAW 연속 → **25.0%** 하락
- Run 3 최종 25.6% 와 **수렴 방향**

**Run 4 vs Run 3 중반 비교**:

| 지표 | Run 3 (n=15) | Run 4 (n=8) |
|-----|--------------|--------------|
| 중반 avg | 259s | 282s |
| 중반 max | 456s | 431s |

**Run 4 예상 완료**: T42-T80 = AI 19턴 × avg 280s ≈ 89분 → **~02:12 KST**

### 스냅샷 [2026-04-20 01:00 KST] — Run 4 place 회복

| 항목 | 값 |
|------|-----|
| Run | 4/10 (joker-hinter 2회차) |
| 경과 (전체) | 09:26:26 |
| Run 4 경과 | 94분 |
| 현재 턴 | T50 thinking (AI 25번째) |
| AI 턴 n | 24 완료 |
| place / draw / fallback | **7** / 17 / **0** |
| cumul tiles | **22** |
| place_rate 중간 | **29.2%** ↑ (25.0%→29.2%, T42+T48 PLACE 회복) |
| 초반 T1-25 (n=12) | avg=183s / p95=254s / max=254s |
| 중반 T26-55 (n=12) | avg=**266s** / p95=431s / max=431s |
| 후반 T56-80 | 미진입 |
| 활성 게임 | 1 |
| DeepSeek 누적 | $0.3563 (145 req, Run 4 분 $0.051) |

**새 턴 (+4)**:
- **T42: 259.4s PLACE 3** (cumul=21)
- T44: 182.5s DRAW
- T46: 260.4s DRAW
- **T48: 229.5s PLACE 1** (cumul=22)

**Run 4 추이 안정화**:
- 30.8% → 25.0% → **29.2%** — v2 baseline 29.07% 근처 수렴

**Run 4 예상 완료**: T50-T80 = AI 15턴 × avg 270s ≈ 68분 → **~02:08 KST**

### 스냅샷 [2026-04-20 01:16 KST] — Run 4 후반 진입

| 항목 | 값 |
|------|-----|
| Run | 4/10 (joker-hinter 2회차) |
| 경과 (전체) | 09:43:06 |
| Run 4 경과 | 110분 |
| 현재 턴 | T58 thinking (AI 29번째) |
| AI 턴 n | 28 완료 |
| place / draw / fallback | **8** / 20 / **0** |
| cumul tiles | **23** |
| place_rate 중간 | **28.6%** (v2 baseline 중앙 유지) |
| 초반 T1-25 (n=12) | avg=183s / p95=254s / max=254s |
| 중반 T26-55 (n=15) | avg=**272s** / p95=431s / max=431s |
| 후반 T56-80 (n=1) | T56=195.6s PLACE 1 |
| 활성 게임 | 1 |
| DeepSeek 누적 | $0.3678 (149 req, Run 4 분 $0.062) |

**새 턴 (+4)**:
- T50: 240.5s DRAW / T52: 233.3s DRAW
- T54: 411.2s DRAW (중반 큰 턴)
- **T56: 195.6s PLACE 1** (cumul=23) — 후반 첫 턴, PLACE 로 시작

**Run 4 중반 최종 요약 (n=15)**:
- avg 272s (Run 3 중반 259s 근접, passthrough 258s 근접)
- p95 431s / max 431s

**Run 4 vs Run 3 중반 요약**:

| 지표 | Run 3 (n=15) | Run 4 (n=15) |
|-----|--------------|--------------|
| 중반 avg | 259s | 272s |
| 중반 max | 456s | 431s |
| 중반 place | 6 | 5+ |

**Run 4 예상 완료**: T58-T80 = AI 12턴 × avg 280s ≈ 56분 → **~02:12 KST**

### 스냅샷 [2026-04-20 01:33 KST] — Run 4 후반 안정

| 항목 | 값 |
|------|-----|
| Run | 4/10 (joker-hinter 2회차) |
| 경과 (전체) | 10:00:03 |
| Run 4 경과 | 127분 |
| 현재 턴 | T66 thinking (AI 33번째) |
| AI 턴 n | 32 완료 |
| place / draw / fallback | **9** / 23 / **0** |
| cumul tiles | **26** |
| place_rate 중간 | **28.1%** (v2 baseline 중앙 안정) |
| 초반 T1-25 (n=12) | avg=183s / p95=254s / max=254s |
| 중반 T26-55 (n=15) | avg=272s / p95=431s / max=431s |
| 후반 T56-80 (n=5) | avg=**262s** / p95=317s / max=317s |
| 활성 게임 | 1 |
| DeepSeek 누적 | $0.3790 (153 req, Run 4 분 $0.074) |

**새 턴 (+4)**:
- T58: 280.8s DRAW / T60: 287.3s DRAW
- **T62: 230.8s PLACE 3** (cumul=26)
- T64: 316.6s DRAW

**Run 4 후반 vs Run 3 후반**:

| 지표 | Run 3 후반 (n=10) | Run 4 후반 (n=5) |
|-----|-------------------|-------------------|
| avg | 325s | **262s** (-19%) |
| p95 | 441s | 317s |
| max | 441s | 317s |

**주목**: Run 4 후반이 Run 3 보다 안정. 500s+ 재발 없음. Run 4 max 316s로 long-tail 극단 억제.

**Run 4 예상 완료**: T66-T80 = AI 8턴 × avg 280s ≈ 37분 → **~02:10 KST**

### Run 3 vs Run 4 최종 수렴 예상

| 지표 | Run 3 최종 | Run 4 예상 | joker-hinter N=2 평균 |
|------|-----------|-----------|------------------------|
| place_rate | 25.6% | 28~30% | **~27~28%** |
| 비용 | $0.039 | $0.08+ | — |
| 소요 | 150m | ~165m | — |
| fallback | 0 | 0 | **0** (passthrough 1 대비 더 안정) |


### 스냅샷 [2026-04-20 01:50 KST] — Run 4 PLACE 반등

| 항목 | 값 |
|------|-----|
| Run | 4/10 (joker-hinter 2회차) |
| 경과 (전체) | 10:17:01 |
| Run 4 경과 | 143분 |
| 현재 턴 | T74 thinking (AI 37번째) |
| AI 턴 n | 36 완료 |
| place / draw / fallback | **11** / 25 / **0** |
| cumul tiles | **32** |
| place_rate 중간 | **30.6%** (T66+T70 PLACE 반등) |
| 초반 T1-25 (n=12) | avg=183s / p95=254s / max=254s |
| 중반 T26-55 (n=15) | avg=272s / p95=431s / max=431s |
| 후반 T56-80 (n=9) | avg=**248s** / p95=336s / max=336s (매우 안정) |
| 활성 게임 | 1 |
| DeepSeek 누적 | $0.3890 (157 req, Run 4 분 $0.084) |

**새 턴 (+4)**:
- **T66: 335.8s PLACE 3** (cumul=29)
- T68: 207.1s DRAW
- **T70: 186.5s PLACE 3** (cumul=32)
- T72: 192.6s DRAW

**Run 4 후반 특히 안정**:
- 후반 avg 248s (Run 3 325s 대비 -24%)
- 후반 max 336s (Run 3 441s 대비 -24%)
- passthrough 후반 max 513/710s 대비 압도적으로 안정

**Run 4 예상 완료**: T74-T80 = AI 4턴 × avg 250s ≈ 17분 → **~02:07 KST**

**Run 4 최종 예상**: 잔여 4턴에 1~2 PLACE → 최종 **30~32%** 범위

---

## ✅ Run 4/10 joker-hinter — 최종 확정 (2026-04-20 02:00:21 KST)

| 지표 | 값 |
|------|-----|
| **place_rate** | **30.8%** (12 PLACE / 39 AI 턴) |
| tiles placed | **35** |
| 소요 | **9225.0s (154분)** |
| DeepSeek 비용 | **$0.039** |
| fallback | **0** |
| avg latency | **236.5s** |
| p50 | 236.2s |
| min / max | **84.0s / 431.0s** |

**PLACE 턴 상세** (12회): T8(6), T14(3), T18(3), T22(3), T28(3), T42(3), T48(1), T56(1), T62(3), T66(3), T70(3), T74(3)

---

## 🎯 **joker-hinter N=2 공식 확정 — passthrough N=2 와 완벽 동일**

| 지표 | passthrough N=2 | joker-hinter N=2 | Δ |
|------|-----------------|-------------------|---|
| place_rate | **28.2%** | **28.2%** | **0.0%p** |
| tiles 평균 | 30.5 | **32.0** | +1.5 |
| avg latency | 248s | **233s** | -6% |
| max | **710s** (Run 2) | **456s** (Run 3) | **-36%** |
| fallback | 1 | **0** | **더 안정** |

**🎉 Day 9 중간 결론: 구조 축 (joker-hinter) 도 "구분 불가"**
- Day 8 텍스트 축: v2 vs v3 Δ=0.04%p → 구분 불가
- Day 9 구조 축: passthrough vs joker-hinter Δ=**0.0%p** → 완벽 동일
- **"프롬프트 텍스트 튜닝" 과 "컨텍스트 구조 튜닝" 모두 v2 baseline 수준에 수렴**

**QA §10.3 공식 판정 (joker-hinter, N=2)**: **Kill** (|Δ|<2%p)
- 단 N=2 는 통계적 부족. Run 5, 6 로 N=4 확증 후 최종 Kill 판정
- joker-hinter **장점 (max latency -36%, fallback 0)** 는 유지됨 → 완전 Kill 대신 **"Quality-of-Life 개선"** 으로 평가 가능

---

## 🟢 Run 5/10 joker-hinter (3회차) — 진행 중 (02:00:52 KST 시작)

| 항목 | 값 |
|------|-----|
| 현재 | T10 thinking (AI 6번째) |
| AI 턴 n | 4 완료 |
| place / draw / fallback | 0 / 4 / 0 |
| cumul tiles | 0 |
| Run 5 초반 avg (n=4) | **89.9s** (Run 3 초반 passive 모드 재현) |
| 활성 게임 | 1 (game:022a21df) |
| DeepSeek 누적 (Run1~5) | $0.4039 (165 req, Run 5 분 ~$0.013) |

**Run 5 초기 (n=4, 모두 DRAW)**:
- T02: 86.1s / T04: 108.8s / T06: 77.5s / T08: 87.4s

**관찰**: Run 5 초반 패턴 = **Run 3 와 유사 (passive 모드)**. Run 3/5 가 "조커 없는 Rack", Run 4 는 "조커 있는 Rack" 가설 재확증.

---

## 이전 테스트 비교표 (joker-hinter N=2 공식 추가)

| 실험 | N | place_rate | avg | max | fallback | 소요 |
|-----|---|-----------|-----|-----|----------|------|
| v2 (Day 8) | 3 | 29.07% ± 2.45%p | 203s | — | — | — |
| v3 (Day 8) | 3 | 29.03% ± 3.20%p | — | — | — | — |
| **passthrough N=2** | 2 | **28.2%** | 248s | 710s ⚠ | 1 | 161m |
| **joker-hinter Run 3** | 1 | 25.6% | 230s | 456s | 0 | 150m |
| **joker-hinter Run 4** | 1 | **30.8%** | 237s | 431s | 0 | 154m |
| **joker-hinter N=2** | 2 | **28.2%** ✅ | 233s | 456s | **0** | 152m |
| **passthrough vs joker-hinter Δ** | — | **0.0%p** | -6% | **-36%** | -1 | -6% |

### 스냅샷 [2026-04-20 02:24 KST] — Run 5 초반 완료

| 항목 | 값 |
|------|-----|
| Run | 5/10 (joker-hinter 3회차) |
| 경과 (전체) | 10:50:54 |
| Run 5 경과 | 23분 |
| 현재 턴 | T20 thinking (AI 10번째) |
| AI 턴 n | 9 완료 |
| place / draw / fallback | **2** / 7 / **0** |
| cumul tiles | 9 |
| place_rate 중간 | 22.2% (초반, 분산 큼) |
| 초반 T1-25 (n=9) | **avg=120s** / p95=220s / max=220s |
| 중반 T26-55 | 미진입 |
| 후반 T56-80 | 미진입 |
| 활성 게임 | 1 |
| DeepSeek 누적 | $0.4121 (170 req, Run 5 분 $0.022) |

**Run 5 초반 9턴 상세**:
- T02~T14 (7턴): 전부 DRAW (avg 97s)
- **T16: 178.8s PLACE 3** (cumul=3) ⭐ initial meld
- **T18: 219.9s PLACE 6** (cumul=9) — 연속 PLACE

**Run 5 = Run 3/Run 4 사이 "중간 모드"**:

| 지표 | Run 3 (passive) | Run 5 (중간) | Run 4 (active) |
|-----|-----------------|--------------|----------------|
| initial meld | T18 | **T16** | T8 |
| 초반 avg | 96s | **120s** | 183s |
| 초반 place (n=9) | 0 | **2** | 3 |

joker-hinter 의 **3가지 모드** 관찰:
- passive (Rack 조커 없음) — Run 3
- 중간 (Rack 조커 소수) — Run 5 ?
- active (Rack 조커 다수) — Run 4

**Run 5 예상 완료**: T20-T80 = AI 31턴 × avg 220s (중반 가정) ≈ 114분 → **~04:18 KST**

### 스냅샷 [2026-04-20 02:41 KST] — Run 5 중반 진입

| 항목 | 값 |
|------|-----|
| Run | 5/10 (joker-hinter 3회차) |
| 경과 (전체) | 11:07:52 |
| Run 5 경과 | 40분 |
| 현재 턴 | T28 thinking (AI 14번째) |
| AI 턴 n | 13 완료 |
| place / draw / fallback | 2 / 11 / **0** |
| cumul tiles | 9 (변화 없음, 4 DRAW 연속) |
| place_rate 중간 | **15.4%** ⚠ |
| 초반 T1-25 (n=12) | avg=**161s** / p95=356s / max=356s |
| 중반 T26-55 (n=1) | 308.8s |
| 후반 T56-80 | 미진입 |
| 활성 게임 | 1 |
| DeepSeek 누적 | $0.4240 (174 req, Run 5 분 $0.031) |

**새 턴 (+4, 모두 DRAW)**:
- T20: 356.4s DRAW / T22: 244.9s DRAW / T24: 241.1s DRAW / T26: 308.8s DRAW

**Run 5 초반 latency 급증**: T20 이후 latency 길어짐 (356s, 245s, 241s, 309s)
- 초반 avg 120s → **161s**
- 초기엔 passive (DRAW 짧게), T16-T18 PLACE 직후부터 active 패턴 전환

**Run 3 vs Run 5 동일 시점 (T26 진입)**:

| 지표 | Run 3 (passive) | Run 5 (중간→active) |
|-----|-----------------|---------------------|
| 초반 avg | 96s | **161s** |
| place 수 | 0 | 2 |
| place_rate | 0% | 15.4% |

**Run 5 예상 완료**: T28-T80 = AI 27턴 × avg 250s ≈ 113분 → **~04:34 KST**

### 스냅샷 [2026-04-20 02:58 KST] — Run 5 place 회복

| 항목 | 값 |
|------|-----|
| Run | 5/10 (joker-hinter 3회차) |
| 경과 (전체) | 11:24:50 |
| Run 5 경과 | 57분 |
| 현재 턴 | T36 thinking (AI 18번째) |
| AI 턴 n | 17 완료 |
| place / draw / fallback | **4** / 13 / **0** |
| cumul tiles | **15** |
| place_rate 중간 | **23.5%** ↑ (15.4% → T30+T34 PLACE 회복) |
| 초반 T1-25 (n=12) | avg=161s / p95=356s / max=356s |
| 중반 T26-55 (n=5) | avg=**268s** / p95=328s / max=328s |
| 후반 T56-80 | 미진입 |
| 활성 게임 | 1 |
| DeepSeek 누적 | $0.4347 (178 req, Run 5 분 $0.042) |

**새 턴 (+4)**:
- T28: 238.3s DRAW
- **T30: 198.4s PLACE 3** (cumul=12)
- T32: 264.9s DRAW
- **T34: 328.3s PLACE 3** (cumul=15)

**Run 5 중간 집계**:
- place_rate 15.4% → 23.5% 회복 추세
- 중반 avg 268s (Run 3/4 와 유사)
- 중반 max 328s (500s 임계 여유)

**Run 5 예상 완료**: T36-T80 = AI 22턴 × avg 270s ≈ 99분 → **~04:37 KST**

### 스냅샷 [2026-04-20 03:15 KST] — Run 5 DRAW 연속, 낮은 place_rate

| 항목 | 값 |
|------|-----|
| Run | 5/10 (joker-hinter 3회차) |
| 경과 (전체) | 11:41:49 |
| Run 5 경과 | 74분 |
| 현재 턴 | T44 thinking (AI 22번째) |
| AI 턴 n | 21 완료 |
| place / draw / fallback | 4 / 17 / **0** |
| cumul tiles | 15 (변화 없음, 4 DRAW 연속) |
| place_rate 중간 | **19.0%** ⚠ (이탈 하단) |
| 초반 T1-25 (n=12) | avg=161s / p95=356s / max=356s |
| 중반 T26-55 (n=9) | avg=**253s** / p95=328s / max=328s |
| 후반 T56-80 | 미진입 |
| 활성 게임 | 1 |
| DeepSeek 누적 | $0.4454 (182 req, Run 5 분 $0.053) |

**새 턴 (+4, 모두 DRAW)**:
- T36: 191.8s / T38: 289.8s / T40: 252.4s / T42: 205.3s

**Run 5 부진 추이**:
- 15.4% → 23.5% → **19.0%** — Run 3 (passive 25.6%) 보다 낮음
- 중반 avg 253s (Run 3/4 유사)

**Run 3/4/5 동일 시점 (T42 진입) 비교**:

| 지표 | Run 3 | Run 4 | Run 5 |
|-----|-------|-------|-------|
| place_rate | 25% | 33% | **19%** ⚠ |
| latency 중반 | 253s | 266s | 253s |

**Run 5 예상 완료**: T44-T80 = AI 19턴 × avg 260s ≈ 82분 → **~04:37 KST**

**Run 5 최종 예상**: 잔여 19턴에 4~7 PLACE → 최종 21~28% 범위

### 스냅샷 [2026-04-20 03:32 KST] — Run 5 T50 PLACE

| 항목 | 값 |
|------|-----|
| Run | 5/10 (joker-hinter 3회차) |
| 경과 (전체) | 11:58:48 |
| Run 5 경과 | 91분 |
| 현재 턴 | T52 thinking (AI 26번째) |
| AI 턴 n | 25 완료 |
| place / draw / fallback | **5** / 20 / **0** |
| cumul tiles | **18** |
| place_rate 중간 | **20.0%** (T50 PLACE 3 회복) |
| 초반 T1-25 (n=12) | avg=161s / p95=356s / max=356s |
| 중반 T26-55 (n=13) | avg=**253s** / p95=**423s** / max=423s |
| 후반 T56-80 | 미진입 |
| 활성 게임 | 1 |
| DeepSeek 누적 | $0.4567 (186 req, Run 5 분 $0.064) |

**새 턴 (+4)**:
- T44: 265.8s DRAW / T46: 167.3s DRAW / T48: 148.8s DRAW
- **T50: 423.2s PLACE 3** (cumul=18) — 중반 max 갱신 + PLACE 회복

**Run 5 잔여**: T52-T80 = AI 15턴. 잔여 4~6 PLACE 필요로 21~27% 최종.

**Run 5 예상 완료**: AI 15턴 × avg 280s ≈ 70분 → **~04:42 KST**

### 스냅샷 [2026-04-20 03:49 KST] — Run 5 후반 진입

| 항목 | 값 |
|------|-----|
| Run | 5/10 (joker-hinter 3회차) |
| 경과 (전체) | 12:15:46 |
| Run 5 경과 | 108분 |
| 현재 턴 | T60 thinking (AI 30번째) |
| AI 턴 n | 29 완료 |
| place / draw / fallback | **6** / 23 / **0** |
| cumul tiles | **21** |
| place_rate 중간 | **20.7%** |
| 초반 T1-25 (n=12) | avg=161s / p95=356s / max=356s |
| 중반 T26-55 (n=15) | avg=**259s** / p95=423s / max=423s |
| 후반 T56-80 (n=2) | avg=247s / p95=253s / max=253s |
| 활성 게임 | 1 |
| DeepSeek 누적 | $0.4682 (190 req, Run 5 분 $0.075) |

**새 턴 (+4)**:
- T52: 328.5s DRAW
- **T54: 274.1s PLACE 3** (cumul=21)
- T56: 241.9s DRAW (후반 첫 턴)
- T58: 252.7s DRAW

**Run 5 잔여**: T60-T80 = AI 11턴. 중반 avg 259s, 후반 n=2로 안정.

**Run 5 최종 예상**:
- 3 PLACE 추가 → **22.5%** (이탈)
- 4 PLACE 추가 → **25.0%** (이탈 경계)
- 5 PLACE 추가 → **27.5%** (PASS 하단)

**Run 5 예상 완료**: AI 11턴 × avg 270s ≈ 50분 → **~04:39 KST**

### 스냅샷 [2026-04-20 04:05 KST] — Run 5 T60 PLACE

| 항목 | 값 |
|------|-----|
| Run | 5/10 (joker-hinter 3회차) |
| 경과 (전체) | 12:31:44 |
| Run 5 경과 | 124분 |
| 현재 턴 | T66 thinking (AI 33번째) |
| AI 턴 n | 32 완료 |
| place / draw / fallback | **7** / 25 / **0** |
| cumul tiles | **24** |
| place_rate 중간 | **21.9%** |
| 초반 T1-25 (n=12) | avg=161s / p95=356s / max=356s |
| 중반 T26-55 (n=15) | avg=259s / p95=423s / max=423s |
| 후반 T56-80 (n=5) | avg=**275s** / p95=306s / max=306s |
| 활성 게임 | 1 |
| DeepSeek 누적 | $0.4775 (193 req, Run 5 분 $0.084) |

**새 턴 (+3)**:
- **T60: 271.7s PLACE 3** (cumul=24)
- T62: 304.8s DRAW
- T64: 305.6s DRAW

**Run 5 잔여**: T66-T80 = AI 8턴.
**Run 5 최종 예상**:
- 2 PLACE → 9/40 = 23% (이탈)
- 3 PLACE → 10/40 = 25% (이탈 경계)
- 4 PLACE → 11/40 = 27.5% (PASS 하단)

**Run 5 예상 완료**: AI 8턴 × avg 280s ≈ 37분 → **~04:42 KST**

### 스냅샷 [2026-04-20 04:22 KST] — Run 5 연속 PLACE 회복

| 항목 | 값 |
|------|-----|
| Run | 5/10 (joker-hinter 3회차) |
| 경과 (전체) | 12:48:43 |
| Run 5 경과 | 141분 |
| 현재 턴 | T74 thinking (AI 37번째) |
| AI 턴 n | 36 완료 |
| place / draw / fallback | **9** / 27 / **0** |
| cumul tiles | **30** |
| place_rate 중간 | **25.0%** (21.9% → T66+T70 PLACE 회복) |
| 후반 T56-80 (n=9) | avg=**285s** / p95=339s / max=339s (안정) |
| 활성 게임 | 1 |
| DeepSeek 누적 | $0.4903 (197 req, Run 5 분 $0.097) |

**새 턴 (+4)**:
- **T66: 301.4s PLACE 3** (cumul=27)
- T68: 239.9s DRAW
- **T70: 318.7s PLACE 3** (cumul=30)
- T72: 339.3s DRAW

**Run 5 최종 예상**: 잔여 4 AI턴, 1~2 PLACE → 최종 **25~28%**

**Run 5 예상 완료**: 잔여 4턴 × avg 290s ≈ 19분 → **~04:41 KST**

---

## ✅ Run 5/10 joker-hinter — 최종 확정 (2026-04-20 04:38:17 KST)

| 지표 | 값 |
|------|-----|
| **place_rate** | **25.6%** (10 PLACE / 39 AI 턴) |
| tiles placed | **33** |
| 소요 | **9444.2s (157분)** |
| DeepSeek 비용 | **$0.039** |
| fallback | **0** |
| avg latency | 242.1s |
| min / max | **77.5s / 517.8s** ⚠ (T78, 500s 재돌파) |

**PLACE 턴 상세** (10회): T16(3), T18(6), T30(3), T34(3), T50(3), T54(3), T60(3), T66(3), T70(3), T74(3)

---

## 🎯 joker-hinter N=3 **공식 확정**

| Run | place_rate | max latency | fallback |
|-----|-----------|-------------|----------|
| Run 3 | 25.6% | 456s | 0 |
| Run 4 | 30.8% | 431s | 0 |
| **Run 5** | **25.6%** | **517.8s** ⚠ | 0 |
| **N=3 평균** | **27.3%** | 517s | **0** |

**passthrough N=2 vs joker-hinter N=3**:
- Δ place_rate = 28.2% - 27.3% = **-0.9%p**
- QA §10.3 판정: **Kill** (|Δ|<2%p) ✅

**Kill 확정 이유**:
- Δ 매우 작음 (0.9%p, Day 8 텍스트 축 0.04%p 수준의 "구분 불가")
- joker-hinter 가 passthrough 대비 유의미한 개선 없음
- 단 **quality-of-life 개선 있음**: fallback 0 (passthrough 1), 후반 max 대부분 안정

**T78 517s 관찰**: Run 5 에서만 후반 500s+ 재돌파 (passthrough Run 1 513s, Run 2 710s 와 유사 수준). joker-hinter 의 long-tail 억제가 절대적이지 않고 확률적.

---

## 🟢 Run 6/10 joker-hinter (4회차 마지막) — 진행 중 (04:38:47 KST 시작)

| 항목 | 값 |
|------|-----|
| 현재 | T02 thinking |
| env 확인 | ✅ joker-hinter 유지 |
| 활성 게임 | game:a645b70b |
| DeepSeek 누적 (Run1~6) | $0.4984 (200 req) |

---

## 이전 테스트 비교표 (joker-hinter N=3 공식 추가)

| 실험 | N | place_rate | max | fallback |
|-----|---|-----------|-----|----------|
| v2 (Day 8) | 3 | 29.07% ± 2.45%p | — | — |
| v3 (Day 8) | 3 | 29.03% ± 3.20%p | — | — |
| **passthrough N=2** | 2 | **28.2%** | 710s | 1 |
| **joker-hinter N=3** | 3 | **27.3%** | 517s | **0** |
| **Δ (jokerN=3 - passN=2)** | — | **-0.9%p** (Kill) | **-27%** | **-1** (quality-of-life) |

### 스냅샷 [2026-04-20 04:56 KST] — Run 6 초반 active 모드

| 항목 | 값 |
|------|-----|
| Run | 6/10 (joker-hinter 4회차 마지막) |
| 경과 (전체) | 13:22:41 |
| Run 6 경과 | 17분 |
| 현재 턴 | T12 thinking (AI 6번째) |
| AI 턴 n | 5 완료 |
| place / draw / fallback | **1** (T8 PLACE 6) / 4 / **0** |
| cumul tiles | 6 |
| place_rate 중간 | 20% (초반) |
| 초반 avg (n=5) | **151s** |
| 활성 게임 | 1 |
| DeepSeek 누적 | $0.508 (206 req) |

**새 턴 Run 6 초반 5**:
- T02: 88.7s / T04: 67.5s / T06: 116.8s (모두 DRAW)
- **T08: 218.4s PLACE 6** (cumul=6) ⭐ initial meld (Run 4 와 동일 T8)
- T10: 263.1s DRAW

**Run 6 = Run 4 active 모드 재현**: T8 initial meld + 긴 추론 (151s avg, Run 3/5 의 ~96s passive 대비)

**Run 6 예상 완료**: ~07:10 KST

### 스냅샷 [2026-04-20 05:12 KST] — Run 6 초반

| 항목 | 값 |
|------|-----|
| Run | 6/10 (joker-hinter 4회차 마지막) |
| 경과 (전체) | 13:38:40 |
| Run 6 경과 | 33분 |
| 현재 턴 | T20 thinking (AI 10번째) |
| AI 턴 n | 9 완료 |
| place / draw / fallback | **2** / 7 / **0** |
| cumul tiles | 9 |
| place_rate 중간 | 22.2% (초반 n=9) |
| 초반 (n=9) | avg=**222s** / max=341s |
| 활성 게임 | 1 |
| DeepSeek 누적 | $0.5173 (210 req, Run 6 분 $0.019) |

**새 턴 (+4)**:
- T12: 308.2s DRAW / T14: 335.5s DRAW
- T16: 257.6s DRAW
- **T18: 341.1s PLACE 3** (cumul=9) — 2nd PLACE

**Run 6 특성**: Run 4 처럼 T8 initial meld 했지만 Run 4 보다 긴 latency (222s vs 183s). Rack 에 조커 많을 가능성 ↑.

**joker-hinter 4-run 초반 avg 분포**:
- Run 3: 96s (passive)
- Run 4: 183s
- Run 5: 161s
- Run 6: **222s** (가장 길음)

**Run 6 예상 완료**: AI 31턴 × avg 280s ≈ 145분 → **~07:37 KST**

### 스냅샷 [2026-04-20 05:29 KST] — Run 6 초반 매우 느림

| 항목 | 값 |
|------|-----|
| Run | 6/10 (joker-hinter 4회차) |
| 경과 (전체) | 13:55:37 |
| Run 6 경과 | 50분 |
| 현재 턴 | T24 thinking (AI 12번째) |
| AI 턴 n | 11 완료 |
| place / draw / fallback | 2 / 9 / **0** |
| cumul tiles | 9 |
| place_rate 중간 | 18.2% ⚠ |
| 초반 (n=11) | avg=**259s** / max=**443s** |
| 활성 게임 | 1 |
| DeepSeek 누적 | $0.5236 (212 req) |

**새 턴 (+2)**:
- T20: 443.1s DRAW ⚠ (초반 max)
- T22: 407.8s DRAW

**Run 6 초반 극단 latency**: avg 259s (passthrough 184s 대비 +41%, joker-hinter 다른 run 대비 가장 길음)

**Run 6 예상 완료**: AI 29턴 × avg 280s ≈ 135분 → **~07:44 KST**

### 스냅샷 [2026-04-20 05:45 KST] — Run 6 중반 진입

| 항목 | 값 |
|------|-----|
| Run | 6/10 (joker-hinter 4회차) |
| 경과 (전체) | 14:11:36 |
| Run 6 경과 | 66분 |
| 현재 턴 | T30 thinking (AI 15번째) |
| AI 턴 n | 14 완료 |
| place / draw / fallback | **3** / 11 / **0** |
| cumul tiles | 12 |
| place_rate 중간 | 21.4% |
| 초반 T1-25 (n=12) | avg=**271s** / p95=443s / max=443s |
| 중반 T26-55 (n=2) | avg=328s / max=330s |
| 후반 T56-80 | 미진입 |
| 활성 게임 | 1 |
| DeepSeek 누적 | $0.5317 (215 req, Run 6 분 $0.033) |

**새 턴 (+3)**:
- T24: 404.2s DRAW
- **T26: 325.5s PLACE 3** (cumul=12)
- T28: 330.0s DRAW

**Run 6 특성**: 초반 avg **271s** (joker-hinter 모든 run 중 가장 길음). Run 6 는 Rack 에 조커/pair 가 매우 많아 hints 주입 과잉 → 추론 시간 긴 "hyper-active" 모드.

**Run 6 예상 완료**: AI 26턴 × avg 290s ≈ 126분 → **~07:51 KST**

### 스냅샷 [2026-04-20 06:02 KST] — Run 6 중반 DRAW 연속

| 항목 | 값 |
|------|-----|
| Run | 6/10 (joker-hinter 4회차) |
| 경과 (전체) | 14:28:35 |
| Run 6 경과 | 83분 |
| 현재 턴 | T38 thinking (AI 19번째) |
| AI 턴 n | 18 완료 |
| place / draw / fallback | 3 / 15 / **0** |
| cumul tiles | 12 (변화 없음, 4 DRAW 연속) |
| place_rate 중간 | **16.7%** ⚠ |
| 초반 T1-25 (n=12) | avg=271s / p95=443s / max=443s |
| 중반 T26-55 (n=6) | avg=**271s** / p95=330s / max=330s |
| 후반 T56-80 | 미진입 |
| 활성 게임 | 1 |
| DeepSeek 누적 | $0.5440 (219 req, Run 6 분 $0.045) |

**새 턴 (+4, 모두 DRAW)**:
- T30: 204.3s / T32: 275.9s / T34: 269.8s / T36: 222.3s

**Run 6 부진 심화**: place_rate 21.4% → 16.7%
**Run 6 예상 완료**: ~07:37 KST

### 스냅샷 [2026-04-20 06:19 KST] — Run 6 회복

| 항목 | 값 |
|------|-----|
| Run | 6/10 (joker-hinter 4회차) |
| 경과 (전체) | 14:45:35 |
| Run 6 경과 | 100분 |
| 현재 턴 | T46 thinking (AI 23번째) |
| AI 턴 n | 22 완료 |
| place / draw / fallback | **5** / 17 / **0** |
| cumul tiles | **18** |
| place_rate 중간 | **22.7%** ↑ (16.7% → T40+T44 PLACE 회복) |
| 초반 T1-25 (n=12) | avg=271s / p95=443s / max=443s |
| 중반 T26-55 (n=10) | avg=266s / p95=369s / max=369s |
| 후반 T56-80 | 미진입 |
| 활성 게임 | 1 |
| DeepSeek 누적 | $0.5548 (223 req, Run 6 분 $0.056) |

**새 턴 (+4)**:
- T38: 368.7s DRAW
- **T40: 169.7s PLACE 3** (cumul=15)
- T42: 351.6s DRAW
- **T44: 137.2s PLACE 3** (cumul=18)

**Run 6 예상 완료**: T46-T80 = AI 18턴 × avg 280s ≈ 84분 → **~07:43 KST**

### 스냅샷 [2026-04-20 06:35 KST] — Run 6 중반 마무리

| 항목 | 값 |
|------|-----|
| Run | 6/10 (joker-hinter 4회차) |
| 경과 (전체) | 15:01:32 |
| Run 6 경과 | 116분 |
| 현재 턴 | T54 thinking (AI 27번째) |
| AI 턴 n | 26 완료 |
| place / draw / fallback | **6** / 20 / **0** |
| cumul tiles | **21** |
| place_rate 중간 | **23.1%** |
| 초반 T1-25 (n=12) | avg=271s / p95=443s / max=443s |
| 중반 T26-55 (n=14) | avg=**255s** / p95=369s / max=369s |
| 후반 T56-80 | 미진입 |
| 활성 게임 | 1 |
| DeepSeek 누적 | $0.5658 (227 req, Run 6 분 $0.067) |

**새 턴 (+4)**:
- T46: 197.8s DRAW
- **T48: 151.5s PLACE 3** (cumul=21)
- T50: 197.1s DRAW
- T52: 365.8s DRAW

**Run 6 예상 완료**: T54-T80 = AI 14턴 × avg 270s ≈ 63분 → **~07:38 KST**

### 스냅샷 [2026-04-20 07:20 KST] — Run 6 후반 강력 회복

| 항목 | 값 |
|------|-----|
| Run 6 | T78 thinking (AI 39번째, 거의 완료) |
| place/draw/fallback | **10** / 28 / **0** |
| cumul tiles | **27** |
| place_rate 중간 | **26.3%** (16.7→26.3% 회복) |
| 후반 T56-80 (n=11) | avg=222s / p95=299s / max=299s |

**후반 강력 회복**: T60 PLACE 3 + T68/T72/T76 PLACE 1 (4 PLACE 연속 패턴).
**joker-hinter N=4 예상 평균** (Run 6 = 26.3% 가정): **27.1%** → Δ -1.1%p Kill 유지

---

## 🟢 Resume: Run 7/10 pair-warmup 시작 (2026-04-20 07:47:55 KST)

**참고**: Run 6 joker-hinter 중단 (T78 에서 사용자 네트워크 변경), joker-hinter N=3 평균 27.3% Kill 확증으로 재실행 생략. Run 7~10 은 pair-warmup × 4.

### 스냅샷 [2026-04-20 08:05 KST] — Run 7 pair-warmup 초반 🎯

| 항목 | 값 |
|------|-----|
| Run | **7/10 (pair-warmup 1회차, v6 2번째 shaper 첫 실측)** |
| RESUME_PID | 26314 (생존 17분) |
| Run 7 경과 | 17분 |
| 현재 턴 | T18 thinking (AI 9번째) |
| AI 턴 n | 8 완료 |
| place / draw / fallback | **3** / 5 / **0** |
| cumul tiles | **13** |
| place_rate 중간 | **37.5%** ⭐ (초반, 분산 큼) |
| 초반 avg (n=8) | **105s** |
| 활성 게임 | 1 (game:31a5d996) |
| DeepSeek 누적 | $0.6213 (263 req, Run 7 분 $0.021) |

**Run 7 초기 8 AI 턴 상세**:
- **T02: 75.9s PLACE 6** (cumul=6) ⭐ **initial meld T2** (joker-hinter 모든 run 대비 가장 빠름)
- T04: 117.1s DRAW / T06: 83.1s DRAW / T08: 79.2s DRAW
- **T10: 109.4s PLACE 4** (cumul=10)
- T12: 90.7s DRAW / T14: 114.3s DRAW
- **T16: 166.9s PLACE 3** (cumul=13)

### 🎯 pair-warmup vs joker-hinter (초반 n=8 비교)

| 지표 | joker-hinter 4-run 평균 | **pair-warmup Run 7** |
|------|------------------------|------------------------|
| initial meld | T8~T18 | **T2** (빠름!) |
| 초반 avg | 96~271s (분산) | 105s |
| 초반 place_rate | 0~33% | **37.5%** |
| 3 PLACE 도달 시점 | T26~T36 | **T16** |

**가설**: pair-warmup 은 Rack 에 pair 조합이 있으면 즉시 PLACE 가능하도록 힌트 주입. joker-hinter 는 조커 없으면 passive, pair-warmup 은 **거의 항상 pair 존재** (14 tiles 중 동번호 2장 나올 확률 매우 높음).

### vs v2 baseline

- passthrough N=2 평균: 28.2%
- pair-warmup Run 7 중간: **37.5%** (단 n=8)
- 만약 최종 수렴값이 30%+ 유지되면 **Δ > +2%p → Pivot 또는 GO**

**Run 7 예상 완료**: AI 32턴 × avg 150s ≈ 80분 → **~09:07 KST** (pair-warmup 빠른 추론 가정 시)

### 스냅샷 [2026-04-20 08:22 KST] — 🚨 DNS 장애 발생 후 복구

| 항목 | 값 |
|------|-----|
| Run | 7/10 (pair-warmup 1회차) |
| 경과 (전체) | 16h50m |
| Run 7 경과 | 34분 |
| 현재 턴 | T48 thinking (AI 24번째) |
| AI 턴 n | 23 완료 (13 정상 + 10 오염) |
| place / draw / fallback | **5** / 18 (8 정상 + 10 0.1s) / **0** |
| cumul tiles | 19 |
| place_rate 오염 (전체) | 21.7% |
| place_rate 유효 (정상턴만) | **38.5%** (5/13) |
| 장애 | 🚨 T26-T44 DNS 장애, T46 자가 복구 |
| 활성 게임 | 1 |
| DeepSeek 누적 | $0.632 (278 req) |

**장애 보고서**: `work_logs/incidents/2026-04-20-01-dns.md`

**근본 원인**: 사용자 네트워크 변경 여진 → ai-adapter Pod DNS `getaddrinfo ENOTFOUND api.deepseek.com` → retryCount=3 fail → auto-draw → rate limit → T46 자가 복구

**결정**:
- Run 7 완주 허용 (T46 복귀)
- 통계는 오염으로 최종 집계 제외
- pair-warmup N=4 → **N=3 (Run 8-10)** 로 축소

### 스냅샷 [2026-04-20 08:41 KST] — Run 7 복구 후 안정 진행

| 항목 | 값 |
|------|-----|
| Run | 7/10 (pair-warmup 1회차, **오염**) |
| Run 7 경과 | 53분 |
| 현재 턴 | T58 thinking (AI 29번째) |
| AI 턴 n | 28 완료 (18 유효 + 10 오염) |
| place / draw / PENALTY / 오염 | **7** / 10 / **1** (T50) / 10 auto |
| cumul tiles | **23** |
| place_rate (전체 포함) | 25.0% |
| place_rate (유효턴만) | **38.9%** (7/18) ⭐ |
| 초반 T1-25 (n=12 유효) | avg=123s / p95=249s / max=249s |
| 중반 T26-55 (정상 5턴) | avg=241s / max=338s |
| 후반 T56-80 (n=1) | T56=144s |
| DeepSeek 누적 | $0.650 (283 req) |

**새 턴 (+5)**:
- T48: 216.4s DRAW (정상)
- **T50: 337.9s PENALTY_DRAW** ⚠ (새 종류, invalid place 시도 후 penalty draw 가능성)
- **T52: 193.9s PLACE 3** (cumul=22)
- T54: 300.8s DRAW
- **T56: 143.7s PLACE 1** (cumul=23) — 후반 시작

**DNS 장애 재발 없음**. T46 이후 정상 진행.

**Run 7 예상 완료**: T58-T80 = AI 12턴 × avg 230s ≈ 46분 → **~09:27 KST**

### 스냅샷 [2026-04-20 08:58 KST] — Run 7 후반 강세 지속

| 항목 | 값 |
|------|-----|
| Run | 7/10 (pair-warmup 1회차, 오염) |
| Run 7 경과 | 70분 |
| 현재 턴 | T68 thinking (AI 34번째) |
| AI 턴 n | 33 (23 유효 + 10 오염) |
| place / draw / PENALTY / 오염 | **8** / 14 / 1 / 10 |
| cumul tiles | **26** |
| **place_rate 유효** | **8/23 = 34.8%** ⭐ |
| 초반 T1-25 (n=12) | avg=123s / p95=249s |
| 중반 T26-55 (n=5 정상) | avg=241s / max=338s |
| 후반 T56-80 (n=6) | avg=**196s** / max=271s |
| DeepSeek 누적 | $0.666 (288 req) |

**새 턴 (+5)**:
- T58: 270.8s DRAW / T60: 197.7s DRAW / T62: 220.4s DRAW
- **T64: 163.2s PLACE 3** (cumul=26)
- T66: 179.5s DRAW

**Run 7 후반 매우 안정**: avg 196s (joker-hinter 후반 mean ~290s 대비 -32%). 500s 재발 없음.

**Run 7 예상 완료**: T68-T80 = AI 7턴 × avg 200s ≈ 23분 → **~09:21 KST**

### 스냅샷 [2026-04-20 09:15 KST] — Run 7 후반 마무리

| 항목 | 값 |
|------|-----|
| Run | 7/10 (pair-warmup 1회차, 오염) |
| Run 7 경과 | 87분 |
| 현재 턴 | T76 thinking (AI 38번째) |
| AI 턴 n | 37 (27 유효 + 10 오염) |
| place / draw / PENALTY / 오염 | 8 / 18 / 1 / 10 |
| cumul tiles | 26 |
| **place_rate 유효** | **8/27 = 29.6%** (34.8% → 29.6% 하락 수렴) |
| place_rate 전체 | 21.6% (오염 포함) |
| 후반 T56-80 (n=10 정상) | avg=**241s** / max=321s |
| DeepSeek 누적 (2일) | **$0.681** (289+3 req, UTC 날짜 전환 반영) |

**새 턴 (+4, 모두 DRAW)**:
- T68: 204.5s / T70: 287.5s / T72: 320.6s / T74: 224.4s

**UTC 날짜 전환** (04-20 00:00 UTC = KST 09:00): Redis `quota:daily:{UTC 날짜}` 새 키 생성. 2일치 합산 $0.681.

**Run 7 예상 완료**: T76-T80 = AI 3턴 × 230s ≈ 12분 → **~09:27 KST**

**Run 7 최종 예상 place_rate (유효)**:
- 0 PLACE → 29.6%
- 1 PLACE → 32.1%

---

## ✅ Run 7/10 pair-warmup — 최종 확정 (2026-04-20 09:21:35 KST)

⚠ **Run 7 DNS 장애 오염 포함** — 공식 통계 제외 권고

| 지표 | 값 |
|------|-----|
| **place_rate (Python, 80턴 기준)** | **26.3%** (10 PLACE / 38 AI 턴, 오염 포함) |
| **place_rate (유효턴만)** | **33.3%** (10/30, 오염 T26-T44 제외) |
| tiles placed | **33** |
| 소요 | **5594.5s (93분)** ⚠ (오염 구간 0.1s × 10 으로 단축됨) |
| DeepSeek 비용 | **$0.038** |
| fallback | 0 |
| avg | 140.3s (오염 포함이라 왜곡) |
| min/max | **0.1s (오염) / 337.9s** |

**PLACE 턴 상세** (10회): T02(6), T10(4), T16(3), T20(2), T46(4), T52(3), T56(1), T64(3), **T76(5)**, T78(2)

**PENALTY_DRAW 1건**: T50

---

## 🟢 Run 8/10 pair-warmup (2회차) — 진행 중 (09:22 경 시작)

| 항목 | 값 |
|------|-----|
| 현재 | T20 thinking (AI 10번째) |
| AI 턴 n | 9 완료 (모두 DRAW) |
| Run 8 초반 9턴 avg | **65.9s** ⚠ (매우 짧음) |
| 새 게임 | game:b6068945 |

**Run 8 초반 9 AI 턴 (모두 DRAW)**:
- T02: 56.4s / T04: 64.4s / T06: 72.9s / T08: 62.4s
- T10: 52.5s / T12: 77.8s / T14: 68.6s / T16: 78.7s / T18: 59.2s

**주의**: 9턴 연속 80s 이하 → DeepSeek 이 거의 추론 안 하는 수준. Rack 에 pair 조합 없거나 (무관심 hints), pair-warmup "super-passive" 모드 가능성. **DNS 장애는 아님** (0.1s 가 아닌 실제 60s+ 추론).

### 스냅샷 [2026-04-20 09:49 KST] — Run 8 중반 진입

| 항목 | 값 |
|------|-----|
| Run | 8/10 (pair-warmup 2회차) |
| Run 8 경과 | 27분 |
| 현재 턴 | T32 thinking (AI 16번째) |
| AI 턴 n | 15 완료 |
| place / draw / fallback | **2** / 13 / **0** |
| cumul tiles | 9 |
| place_rate 중간 | 13.3% (초반, 분산 큼) |
| 초반 T1-25 (n=12) | avg=**75s** / p95=149s / max=149s |
| 중반 T26-55 (n=3) | avg=194s / max=224s |
| 활성 게임 | 1 |
| DeepSeek 누적 | $0.715 (2일 합산, 310 req) |

**새 턴 (+6)**:
- T20: 62.3s DRAW / T22: 90.6s DRAW
- **T24: 149.4s PLACE 6** (cumul=6) ⭐ initial meld T24 (Run 7 T02 대비 22턴 지연)
- T26: 224.3s DRAW
- **T28: 152.6s PLACE 3** (cumul=9)
- T30: 205.1s DRAW

**Run 8 특성**:
- 초반 avg 75s (pair-warmup 중 가장 짧음, joker-hinter Run 3 의 96s passive 와 유사)
- initial meld T24 (Run 7 T2, Run 8 T24) — pair-warmup 도 run-to-run 분산 큼
- 중반 진입 시 latency 즉시 상승 (194s) — 정상 모드로 전환

**Run 8 예상 완료**: 잔여 AI 25턴 × avg 180s ≈ 75분 → **~11:04 KST**

### 스냅샷 [2026-04-20 10:06 KST] — Run 8 중반

| 항목 | 값 |
|------|-----|
| Run | 8/10 (pair-warmup 2회차) |
| Run 8 경과 | 44분 |
| 현재 턴 | T40 thinking (AI 20번째) |
| AI 턴 n | 19 완료 |
| place / draw / fallback | **3** / 16 / **0** |
| cumul tiles | 12 |
| place_rate 중간 | **15.8%** |
| 초반 T1-25 (n=12) | avg=75s / p95=149s / max=149s |
| 중반 T26-55 (n=7) | avg=**228s** / max=357s |
| 활성 게임 | 1 |
| DeepSeek 누적 | $0.728 (2일 합산) |

**새 턴 (+4)**:
- T32: 356.9s DRAW (중반 max)
- T34: 186.6s DRAW
- T36: 264.4s DRAW
- **T38: 204.5s PLACE 3** (cumul=12)

**Run 8 예상 완료**: 잔여 AI 21턴 × avg 230s ≈ 80분 → **~11:20 KST**

### 스냅샷 [2026-04-20 10:23 KST] — Run 8 중반 마무리

| 항목 | 값 |
|------|-----|
| Run | 8/10 (pair-warmup 2회차) |
| Run 8 경과 | 61분 |
| 현재 턴 | T50 thinking (AI 25번째) |
| AI 턴 n | 24 완료 |
| place / draw / PENALTY / auto | **5** / 18 / **1** (T46) / 0 |
| cumul tiles | **18** |
| place_rate 중간 | **20.8%** |
| 초반 T1-25 (n=12) | avg=75s / p95=149s |
| 중반 T26-55 (n=12) | avg=**222s** / p95=357s / max=357s |
| DeepSeek 누적 | $0.743 (2일) |

**새 턴 (+5)**:
- T40: 194.0s DRAW
- **T42: 331.8s PLACE 1** (cumul=13)
- T44: 175.4s DRAW
- **T46: 138.0s PENALTY_DRAW** ⚠ (pair-warmup 2번째 PENALTY, Run 7 T50 에 이어)
- **T48: 235.0s PLACE 5** (cumul=18)

**pair-warmup PENALTY 누적**: 2건 (Run 7 T50 + Run 8 T46)
- 가설: pair hints 가 invalid meld 시도 유도 — joker-hinter 는 PENALTY 0건
- Run 9, 10 에서 PENALTY 계속 발생하면 pair-warmup 알고리즘 버그 의심

**Run 8 예상 완료**: 잔여 AI 15턴 × 230s ≈ 58분 → **~11:21 KST**

### 스냅샷 [2026-04-20 10:40 KST] — Run 8 중반 마무리

| 항목 | 값 |
|------|-----|
| Run | 8/10 (pair-warmup 2회차) |
| Run 8 경과 | 78분 |
| 현재 턴 | T56 thinking (AI 28번째, 후반 진입) |
| AI 턴 n | 27 완료 |
| place / draw / PENALTY / auto | **6** / 20 / 1 / 0 |
| cumul tiles | **21** |
| place_rate 중간 | **22.2%** |
| 초반 T1-25 (n=12) | avg=75s / p95=149s |
| 중반 T26-55 (n=15) | avg=**228s** / max=357s |
| DeepSeek 누적 | $0.753 (2일) |

**새 턴 (+3)**:
- T50: 247.2s DRAW
- **T52: 260.1s PLACE 3** (cumul=21)
- T54: 249.4s DRAW

**Run 8 예상 완료**: 잔여 13턴 × 230s ≈ 50분 → **~11:30 KST**

### 스냅샷 [2026-04-20 10:56 KST] — Run 8 후반 PLACE 회복

| 항목 | 값 |
|------|-----|
| Run | 8/10 (pair-warmup 2회차) |
| Run 8 경과 | 94분 |
| 현재 턴 | T64 thinking (AI 32번째) |
| AI 턴 n | 31 완료 |
| place / draw / PENALTY / auto | **8** / 22 / 1 / 0 |
| cumul tiles | **26** |
| place_rate 중간 | **25.8%** (22.2→25.8, T56+T60 PLACE 회복) |
| 후반 T56-80 (n=4) | avg=289s / max=380s |
| DeepSeek 누적 | $0.766 (2일) |

**새 턴 (+4)**:
- **T56: 379.7s PLACE 2** (cumul=23) — 후반 첫 PLACE
- T58: 240.1s DRAW
- **T60: 302.5s PLACE 3** (cumul=26)
- T62: 232.0s DRAW

**Run 8 예상 완료**: 잔여 9턴 × 280s ≈ 42분 → **~11:38 KST**

### 스냅샷 [2026-04-20 11:12 KST] — Run 8 종반 회복 지속

| 항목 | 값 |
|------|-----|
| Run | 8/10 (pair-warmup 2회차) |
| Run 8 경과 | 110분 |
| 현재 턴 | T70 thinking (AI 35번째) |
| AI 턴 n | 34 완료 |
| place / draw / PENALTY | **9** / 24 / 1 |
| cumul tiles | **30** |
| place_rate 중간 | **26.5%** (25.8%→26.5%, T66 PLACE 4) |
| 후반 T56-80 (n=7) | avg=**309s** / max=**416s** |
| DeepSeek 누적 | $0.778 (2일) |

**새 턴 (+3)**:
- T64: 270.8s DRAW
- **T66: 322.4s PLACE 4** (cumul=30)
- T68: 416.1s DRAW (후반 max)

**Run 8 예상 완료**: 잔여 6턴 × 300s ≈ 30분 → **~11:42 KST**

**Run 8 최종 예상**: 잔여 6턴에 1~2 PLACE → 최종 **27.5~30.8%**

### 스냅샷 [2026-04-20 11:29 KST] — Run 8 거의 완료

| 항목 | 값 |
|------|-----|
| Run | 8/10 (pair-warmup 2회차) |
| Run 8 경과 | 127분 |
| 현재 턴 | T78 thinking (AI 39번째) |
| AI 턴 n | 38 완료 |
| place / draw / PENALTY | **10** / 27 / 1 |
| cumul tiles | **33** |
| place_rate 중간 | **26.3%** |
| DeepSeek 누적 | $0.790 (2일) |

**새 턴 (+4)**:
- **T70: 248.3s PLACE 3** (cumul=33)
- T72: 336.1s DRAW / T74: 237.6s DRAW / T76: 251.4s DRAW

**Run 8 예상 완료**: 잔여 T78, T80 = AI 2턴 × 250s ≈ 8분 → **~11:37 KST**

---

## ✅ Run 8/10 pair-warmup — 최종 확정 (2026-04-20 11:34:14 KST)

| 지표 | 값 |
|------|-----|
| **place_rate** | **28.9%** (11 PLACE / 38 AI 턴) |
| tiles placed | **34** |
| 소요 | **7927.3s (132분)** |
| DeepSeek 비용 | **$0.038** |
| fallback | **0** |
| PENALTY | 1 (T46) |
| avg / p50 / min / max | 203.2s / 224.3s / **52.5s** / **416.1s** |

**PLACE 턴 상세** (11회): T24(6), T28(3), T38(3), T42(1), T48(5), T52(3), T56(2), T60(3), T66(4), T70(3), T78(1)

---

## 🎯 pair-warmup N=1 (Run 8 깨끗) vs passthrough

| 지표 | passthrough N=2 | **Run 8 pair-warmup** | Δ |
|------|-----------------|------------------------|---|
| place_rate | 28.2% | **28.9%** | **+0.7%p** |
| max latency | 710s | **416s** | -41% |
| fallback | 1 | **0** | 더 안정 |
| PENALTY | 0 | 1 | pair 특이 |

**Δ +0.7%p** → **|Δ|<2%p Kill 영역** (passthrough 와 사실상 동일). joker-hinter 결과와 일관.

---

## 🟢 Run 9/10 pair-warmup (3회차) — 진행 중 (11:34:45 KST 시작)

| 항목 | 값 |
|------|-----|
| 현재 | T06 thinking (AI 3번째) |
| AI 턴 n | 2 완료 |
| place / draw | **1** (T02 PLACE 6) / 1 |
| 초기 turns | T02: 297.0s PLACE 6, T04: 203.4s DRAW |
| 활성 게임 | game:e9d8c4f3 |
| DeepSeek 누적 | $0.803 (2일 합산) |

**Run 9 특성 (초기)**: T02 PLACE 6 (initial meld T2, Run 7 처럼 빠름). Run 9 = "active 모드" 같음.

---

## 이전 테스트 비교표 (pair-warmup Run 7+8 공식 추가)

| 실험 | N | place_rate | max | fallback | PENALTY |
|-----|---|-----------|-----|----------|---------|
| passthrough N=2 | 2 | 28.2% | 710s | 1 | 0 |
| joker-hinter N=3 | 3 | 27.3% | 517s | 0 | 0 |
| **pair-warmup Run 7** (오염) | - | 26.3% (공식) / 33.3% (유효) | 338s | 0 | 1 |
| **pair-warmup Run 8** | 1 | **28.9%** | 416s | 0 | 1 |
| **pair-warmup N=2 평균** (Run 7 유효 + Run 8) | 2 | **~31%** (유효 기준) | 416s | 0 | 2 |

### 스냅샷 [2026-04-20 12:03 KST] — Run 9 초반

| 항목 | 값 |
|------|-----|
| Run | 9/10 (pair-warmup 3회차) |
| Run 9 경과 | 28분 |
| 현재 턴 | T14 thinking (AI 7번째) |
| AI 턴 n | 6 완료 |
| place / draw / fallback | **2** / 4 / **0** |
| cumul tiles | 9 |
| place_rate 중간 | 33.3% (초반) |
| 초반 avg (n=6) | **262s** (Run 8 75s 대비 매우 김) |
| DeepSeek 누적 | $0.815 (2일) |

**Run 9 초반 6 AI 턴**:
- **T02: 297.0s PLACE 6** (cumul=6) ⭐ initial meld T2
- T04: 203.4s DRAW / T06: 267.4s DRAW
- **T08: 273.9s PLACE 3** (cumul=9)
- T10: 176.5s DRAW / T12: 352.6s DRAW

**Run 9 특성**: "hyper-active" 모드 (초반 avg 262s, Run 6 joker hyper-active 271s 와 유사). pair hints 많이 주입되는 rack.

**Run 9 예상 완료**: 초반 느리면 ~14:10 KST

### 스냅샷 [2026-04-20 12:19 KST] — Run 9 초반 마무리

| 항목 | 값 |
|------|-----|
| Run | 9/10 (pair-warmup 3회차) |
| Run 9 경과 | 44분 |
| 현재 턴 | T20 thinking (AI 10번째) |
| AI 턴 n | 9 완료 |
| place / draw / PENALTY | **3** / 6 / 0 |
| cumul tiles | 12 |
| place_rate 중간 | **33.3%** (초반 n=9) |
| 초반 avg | **268s** / max=365s |
| DeepSeek 누적 | $0.824 (2일) |

**새 턴 (+3)**:
- T14: 298.8s DRAW
- T16: 364.7s DRAW
- **T18: 179.3s PLACE 3** (cumul=12)

Run 9 초반 강세 + hyper-active latency 지속

### 스냅샷 [2026-04-20 12:35 KST] — Run 9 중반 진입 DRAW 연속

| 항목 | 값 |
|------|-----|
| Run | 9/10 (pair-warmup 3회차) |
| Run 9 경과 | 60분 |
| 현재 턴 | T30 thinking (AI 15번째) |
| AI 턴 n | 14 완료 |
| place / draw / PENALTY | 3 / 11 / 0 |
| cumul tiles | 12 (변화 없음, 5 DRAW 연속) |
| place_rate 중간 | **21.4%** ⬇ (33.3→21.4%) |
| DeepSeek 누적 | $0.836 (2일) |

**새 턴 (+4, 모두 DRAW)**:
- T22: 207.7s / T24: 225.2s / T26: 157.1s / T28: 279.3s

T20 PLACE 3 이후 (이전 보고) 5 DRAW 연속 → place_rate 하락. Run 8 처럼 후반 회복 기대.

### 스냅샷 [2026-04-20 12:52 KST] — Run 9 중반

| 항목 | 값 |
|------|-----|
| Run | 9/10 (pair-warmup 3회차) |
| Run 9 경과 | 77분 |
| 현재 턴 | T38 thinking (AI 19번째) |
| AI 턴 n | 18 완료 |
| place / draw / PENALTY | **4** / 14 / 0 |
| cumul tiles | 15 |
| place_rate 중간 | **22.2%** (T34 PLACE 3 회복) |
| 초반 T1-25 (n=12) | avg=275s / p95=365s |
| 중반 T26-55 (n=6) | avg=**254s** / max=328s |
| DeepSeek 누적 | $0.848 (2일) |

**새 턴 (+4)**:
- T30: 327.5s DRAW / T32: 275.2s DRAW
- **T34: 274.1s PLACE 3** (cumul=15)
- T36: 213.5s DRAW

### 스냅샷 [2026-04-20 13:09 KST] — Run 9 DRAW 연속 지속

| 항목 | 값 |
|------|-----|
| Run | 9/10 (pair-warmup 3회차) |
| Run 9 경과 | 94분 |
| 현재 턴 | T46 thinking (AI 23번째) |
| AI 턴 n | 22 완료 |
| place / draw / PENALTY | 4 / 18 / 0 |
| cumul tiles | 15 (변화 없음) |
| place_rate 중간 | **18.2%** ⬇ (22.2%→18.2%, 4 DRAW 연속) |
| 중반 T26-55 (n=10) | avg=252s / max=328s |
| DeepSeek 누적 | $0.860 (2일) |

**새 턴 (+4, 모두 DRAW)**:
- T38: 187.7s / T40: 259.9s / T42: 265.0s / T44: 282.1s

Run 9 place_rate 부진. 후반 T56+ 에서 Run 8 처럼 회복 필요.

### 스냅샷 [2026-04-20 13:26 KST] — Run 9 PLACE 회복

| 항목 | 값 |
|------|-----|
| Run | 9/10 (pair-warmup 3회차) |
| Run 9 경과 | 111분 |
| 현재 턴 | T52 thinking (AI 26번째) |
| AI 턴 n | 25 완료 |
| place / draw / PENALTY | **5** / 20 / 0 |
| cumul tiles | **17** |
| place_rate 중간 | **20.0%** (18.2→20.0%, T50 PLACE 2) |
| 중반 T26-55 (n=13) | avg=**260s** / max=328s |
| DeepSeek 누적 | $0.869 (2일) |

**새 턴 (+3)**:
- T46: 306.3s DRAW / T48: 292.1s DRAW
- **T50: 254.4s PLACE 2** (cumul=17)

---

## 🏁 배치 종료 — 방안 A 확정 (2026-04-20 13:45 KST)

### Run 9 최종 (공식) — 오염 포함

| 지표 | 값 |
|------|-----|
| place_rate (공식) | **15.4%** (6 PLACE / 39 AI 턴, 오염 포함) |
| place_rate (유효) | **20.7%** (6/29, 오염 T58-T76 제외) |
| tiles | 20 |
| 소요 | 7460.6s (124분) |
| PENALTY | 0 |
| 오염 턴 | 10 (T58~T76, auto-draw 1.7~2.3s) |

### Run 10 종료 (미완, 전체 오염)

- Run 10 T02 부터 전체 오염 (20+ 턴 1.8~2.2s auto-draw)
- T42 시점에 사용자 방안 A 확정 → 즉시 종료
- DNS 장애 지속 재발 (네트워크 변경 후 Pod DNS 캐시 불안정)

---

## 📊 v6 Smoke 배치 최종 공식 결과

### 2일에 걸친 실측 전체 요약

| Shaper | Runs 완료 | 유효 N | 최종 place_rate | 평균 | Δ vs passthrough |
|--------|---------|--------|----------------|------|-------------------|
| **passthrough** | Run 1, 2 | 2 | 28.2%, 28.2% | **28.2%** | baseline |
| **joker-hinter** | Run 3, 4, 5 (+6 중단) | 3 | 25.6%, 30.8%, 25.6% | **27.3%** | -0.9%p (Kill) |
| **pair-warmup** | Run 7 (오염), Run 8, Run 9 (오염), Run 10 (오염) | **1** | 28.9% (Run 8 만) | **28.9%** | +0.7%p (Kill) |

### 비용 최종
- 2일 합산: **~$0.88** (DeepSeek Smoke 실측)
- 한도 $20 대비 4.4% 사용

### 🎯 최종 결론: **v6 Kill 확정**

**Day 8 결론 재확증**:
- 텍스트 축 (v2 vs v3): Δ 0.04%p → 구분 불가
- **구조 축** (passthrough vs joker-hinter vs pair-warmup): **Δ |0.7~0.9%p| → 구분 불가**

**DeepSeek Reasoner 는 루미큐브에서 ~28% 천장 (수렴)**. 프롬프트 텍스트/구조 어떤 변형도 이 천장을 뚫지 못함. **구조 축 실험 Kill**.

### 장애 이력
- 2026-04-19 Day 9: Smoke 배치 argparse bug (cleanup 후 재실행)
- 2026-04-19 Day 9 Run 2: T66 AI_TIMEOUT @ 710s (1건 fallback)
- 2026-04-20 Day 10 Run 7: DNS 장애 (네트워크 변경 여진, 10턴 오염)
- 2026-04-20 Day 10 Run 9: DNS 장애 재발 (10턴 오염)
- 2026-04-20 Day 10 Run 10: DNS 장애 전체 (조기 종료)

### 산출물
- **본 monitoring 문서**: `work_logs/ai-battle-monitoring-20260419.md`
- **장애 보고서 1건**: `work_logs/incidents/2026-04-20-01-dns.md`
- **배치 로그 10개**: `work_logs/battles/r11-smoke-20260419-153217/`

### Day 10 다음 작업
- Day 9/10 리포트 작성 (AI Engineer 위임) — v6 Kill 결론 공식 기록
- Day 9 데일리 마감 (애벌레 지시 대기)
