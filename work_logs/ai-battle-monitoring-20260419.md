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
