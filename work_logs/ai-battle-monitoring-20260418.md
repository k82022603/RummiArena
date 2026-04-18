# AI 대전 모니터링 — 2026-04-18 (Day 8, Round 10)

- **작성일 시작**: 2026-04-18 (Sprint 6 Day 8 아침)
- **작성자**: Claude (메인 세션, Opus 4.7 xhigh)
- **대전 범위**: Round 10 = v3 재검증 3회 (Step 2) + v2 재연 2회 추가 (Step 4)
- **실행 계획 기준**: `work_logs/plans/2026-04-18-day8-execution-plan.md`
- **SKILL**: `.claude/skills/batch-battle/SKILL.md` (Phase 1 ~ 5)
- **상태**: Phase 1 사전점검 완료 → Phase 2 사전정리 → Phase 3 v3 Run 1 진입

---

## Phase 1 사전점검 체크리스트 (2026-04-18 아침)

- [x] **7/7 Pod Running** (admin, ai-adapter, frontend, game-server, ollama, postgres, redis)
- [x] **게임서버 /ready** = `{"status":"ready"}`
- [x] **Redis PONG, PostgreSQL accepting**
- [x] **ConfigMap**:
  - game-server: `AI_ADAPTER_TIMEOUT_SEC=1800`
  - ai-adapter: `DAILY_COST_LIMIT_USD=20`, `HOURLY_USER_COST_LIMIT_USD=5` (평상시값)
- [x] **Istio VS ai-adapter**: timeout `1810s`, perTryTimeout `1810s`
- [x] **ai-battle 스크립트 ws_timeout**: 1870s (DeepSeek 모델 config)
- [x] **부등식**: ws(1870) > istio(1810) > adapter(1800) ✅
- [x] **DeepSeek API 잔액**: ~$3.08 (이전 날 확인, 추가 $0.12 예상 후 $2.96)
- [x] **배틀 프로세스 0개, Redis game:* 0개**
- [x] **DEEPSEEK_REASONER_PROMPT_VARIANT**: v4 → **v3 로 전환 진행 중**

## Phase 1b 비용 한도 판단

| 예상 지출 | 값 |
|---------|-----|
| v3 3회 × $0.04 | **$0.12** |
| Daily 한도 $20 | **여유** |
| 시간당 $0.013/hr | **HOURLY 한도 $5 대비 여유** |

**결론**: 한도 상향 불필요, 평상시값 유지.

---

## Phase 2 사전 정리

- Redis game:* = 0 (이전에 조회 시 비어있음 확인)
- 배틀 프로세스 0개 (ps aux 확인)
- /move 요청 없음 (최근 로그 무관)

---

## Phase 3 실행 계획 — v3 Run 1~3

### 환경 설정 (variant 전환 후)

| 지점 | 값 |
|------|-----|
| DeepSeek Reasoner variant | **v3** |
| Istio VS timeout | 1810s |
| ai-adapter AI_ADAPTER_TIMEOUT_SEC | 1800s |
| game-server AI_ADAPTER_TIMEOUT_SEC | 1800s |
| ai-battle ws_timeout | 1870s |

### 실행 스크립트

```bash
for i in 1 2 3; do
  python3 scripts/ai-battle-3model-r4.py --models deepseek \
    > work_logs/battles/r10-v3-rerun/v3-run${i}.log 2>&1
  mv scripts/ai-battle-3model-r4-results.json \
     work_logs/battles/r10-v3-rerun/v3-run${i}-result.json
  echo "=== Run ${i} 종료 $(date '+%Y-%m-%d %H:%M:%S') ===" >> \
    work_logs/battles/r10-v3-rerun/phase2-master.log
  # 결과 JSON 에서 place rate 추출
  cat work_logs/battles/r10-v3-rerun/v3-run${i}-result.json | \
    python3 -c "import json,sys; d=json.load(sys.stdin); m=d['models'][0]; \
    print(f'  Place rate={m[\"placeRate\"]}% | Fallback={m[\"aiFallback\"]} | Turns={m[\"totalTurns\"]} | Time={m[\"elapsed\"]}s')" \
    >> work_logs/battles/r10-v3-rerun/phase2-master.log
  sleep 30
done
```

---

## 턴별 모니터링 표 (실시간 append)

### Run 1 (시작 2026-04-18 07:05:41, variant=v3, timeout=1810s)

| 턴 | 레이턴시 | action | 누적 tiles | 비고 |
|----|---------|--------|-----------|------|
| T02 | 92.3s | PLACE 6 tiles | 6 | Initial meld 성공 |
| T04 | 100.7s | DRAW | 6 | |
| T06 | 199.2s | PLACE 3 tiles | 9 | |
| T08 | 180.4s | DRAW | 9 | |
| T10 | 166.5s | DRAW | 9 | |
| T12 | 246.0s | DRAW | 9 | 현 시점 최대 응답 |
| T14 | 198.6s | DRAW | 9 | |
| T16 | 181.8s | PLACE 1 tile | 10 | |
| T18 | 199.2s | DRAW | 10 | |
| T20 | 168.0s | DRAW | 10 | |
| T22 | 179.2s | DRAW | 10 | |
| T24 | 120.9s | PLACE 3 tiles | 13 | 빠름 |
| T26 | 254.7s | DRAW | 13 | 현 시점 최대 |
| T28 | 234.3s | DRAW | 13 | |
| T30 | 203.4s | DRAW | 13 | |
| T32 | 252.3s | PLACE 3 tiles | 16 | |
| T34 | 144.5s | DRAW | 16 | 빠름 |
| T36 | 208.9s | DRAW | 16 | |
| T38 | 165.8s | DRAW | 16 | |
| T40 | 257.7s | DRAW | 16 | |
| T42 | 309.3s | DRAW | 16 | |
| T44 | 304.9s | DRAW | 16 | |
| T46 | 214.6s | PLACE 3 tiles | 19 | |
| T48 | 131.5s | DRAW | 19 | 빠름 |
| T50 | 156.5s | PLACE 4 tiles | 23 | 빠름+4타일 |
| T52 | 391.8s | DRAW | 23 | |
| T54 | 246.7s | PLACE 1 tile | 24 | |
| T56 | 260.7s | DRAW | 24 | |
| T58 | 168.8s | DRAW | 24 | |
| T60 | 177.6s | DRAW | 24 | |
| T62 | 190.4s | PLACE 3 tiles | 27 | |
| T64 | 535.4s | DRAW | 27 | **현 시점 최대** |
| T66 | 176.8s | PLACE 4 tiles | 31 | |
| T68 | 152.6s | DRAW | 31 | |
| T70 | 159.7s | DRAW | 31 | |
| T72 | 196.3s | DRAW | 31 | |
| T74 | 305.5s | PLACE 1 tile | 32 | |
| T76 | — | DRAW | 32 | (Run 1 최종) |
| T78 | — | DRAW | 32 | (Run 1 최종) |
| T80 | — | DRAW | 32 | (Run 1 최종) |

**Run 1 최종 결과** (2026-04-18 09:24:33):
- Place 11 / AI 턴 39 / **Rate 28.2%** / Tiles 32 / Fallback 0
- Elapsed 8331.9s (2h 19m) / Cost $0.039
- Avg resp 213.6s / p50 198.6s / max 535.4s (T64)

### Run 2 (시작 2026-04-18 09:25:03, variant=v3, timeout=1810s, PID 19443)

| 턴 | 레이턴시 | action | 누적 tiles | 비고 |
|----|---------|--------|-----------|------|
| T02 | 149.6s | PLACE 6 tiles | 6 | Initial meld |
| T04 | 158.7s | DRAW | 6 | |
| T06 | 101.7s | PLACE 1 tile | 7 | 빠름 |
| T08 | 140.7s | DRAW | 7 | |
| T10 | 253.9s | DRAW | 7 | |
| T12 | 220.7s | DRAW | 7 | |
| T14 | 154.1s | DRAW | 7 | |
| T16 | 173.4s | DRAW | 7 | |
| T18 | 202.3s | DRAW | 7 | |
| T20 | 240.5s | DRAW | 7 | |
| T22 | 131.1s | PLACE 3 tiles | 10 | |
| T24 | 124.0s | DRAW | 10 | 빠름 |
| T26 | 204.0s | DRAW | 10 | |
| T28 | 236.0s | DRAW | 10 | |
| T30 | 290.0s | DRAW | 10 | |
| T32 | 298.8s | PLACE 3 tiles | 13 | |
| T34 | 378.9s | DRAW | 13 | |
| T36 | 161.4s | PLACE 1 tile | 14 | |
| T38 | 233.8s | DRAW | 14 | |
| T40 | 369.3s | PLACE 2 tiles | 16 | |
| T42 | 265.9s | DRAW | 16 | |
| T44 | 411.5s | DRAW | 16 | |
| T46 | 458.2s | DRAW | 16 | 현 시점 최대 |
| T48 | 455.9s | DRAW | 16 | |
| T50 | 285.5s | PLACE 1 tile | 17 | |
| T52 | 376.5s | DRAW | 17 | |
| T54 | 226.9s | PLACE 3 tiles | 20 | |
| T56 | 244.4s | DRAW | 20 | |
| T58 | 196.8s | DRAW | 20 | |
| T60 | 260.6s | DRAW | 20 | |
| T62 | 783.2s | DRAW | 20 | **후반 추론 급등** |
| T64 | 473.7s | DRAW | 20 | |
| T66 | 302.3s | DRAW | 20 | |
| T68 | 418.8s | DRAW | 20 | |
| T70 | 434.4s | PLACE 3 tiles | 23 | |
| T72 | — | DRAW | 23 | (Run 2 후반) |
| T74 | — | DRAW | 23 | (Run 2 후반) |
| T76 | — | DRAW | 23 | (Run 2 후반) |
| T78 | 283.7s | PLACE 3 tiles | 26 | |
| T80 | — | DRAW | 26 | (Run 2 최종) |

**Run 2 최종 결과** (2026-04-18 12:27:08):
- Place 10 / AI 턴 39 / **Rate 25.6%** / Tiles 26 / Fallback 0
- Elapsed 10924.2s (3h 2m) / Cost $0.039
- Avg resp 280.1s / p50 253.9s / max 783.2s (T62)

### Run 3 (시작 2026-04-18 12:27:38, variant=v3, timeout=1810s, PID 20674)

| 턴 | 레이턴시 | action | 누적 tiles | 비고 |
|----|---------|--------|-----------|------|
| T02 | 42.2s | DRAW | 0 | **이례적: T02 DRAW** (hand meld 불가 판단 빠름) |
| T04 | 48.7s | PLACE 4 tiles | 4 | Delayed initial meld, 여전히 빠름 |
| T06 | 100.0s | DRAW | 4 | |
| T08 | 111.2s | DRAW | 4 | |
| T10 | 90.3s | DRAW | 4 | |
| T12 | 137.7s | DRAW | 4 | |
| T14 | 146.7s | PLACE 4 tiles | 8 | |
| T16 | 105.5s | DRAW | 8 | |
| T18 | 147.1s | PLACE 2 tiles | 10 | |
| T20 | 104.6s | DRAW | 10 | |
| T22 | 124.3s | DRAW | 10 | |
| T24 | 160.0s | DRAW | 10 | |
| T26 | 186.9s | PLACE 2 tiles | 12 | |
| T28 | 184.4s | DRAW | 12 | |
| T30 | 268.2s | DRAW | 12 | |
| T32 | 202.3s | PLACE 3 tiles | 15 | |
| T34 | 220.3s | DRAW | 15 | |
| T36 | 184.6s | DRAW | 15 | |
| T38 | 319.4s | DRAW | 15 | |
| T40 | 261.1s | DRAW | 15 | |
| T42 | 433.5s | DRAW | 15 | 현 시점 최대 |
| T44 | 353.6s | PLACE 1 tile | 16 | |
| T46 | 149.2s | DRAW | 16 | 빠름 |
| T48 | 397.5s | DRAW | 16 | |
| T50 | 325.0s | DRAW | 16 | |
| T52 | 479.6s | DRAW | 16 | |
| T54 | 673.8s | DRAW | 16 | 현 시점 최대 |
| T56 | 186.8s | PLACE 3 tiles | 19 | |
| T58 | 290.4s | DRAW | 19 | |
| T60 | 359.4s | PLACE 3 tiles | 22 | 연속 PLACE 시작 |
| T62 | 325.5s | PLACE 2 tiles | 24 | |
| T64 | 255.9s | DRAW | 24 | |
| T66 | 267.4s | PLACE 1 tile | 25 | |
| T68 | 425.3s | DRAW | 25 | |
| T70 | 227.9s | PLACE 1 tile | 26 | |
| T72 | 437.8s | PLACE 1 tile | 27 | |
| T74 | 204.5s | DRAW | 27 | |
| T76 | 209.2s | DRAW | 27 | |
| T78 | 238.8s | PLACE 3 tiles | 30 | |
| T80 | — | (종료) | 30 | Run 3 완료 |

**Run 3 최종 결과** (2026-04-18 15:04:07):
- Place 13 / AI 턴 39 / **Rate 33.3%** / Tiles 30 / Fallback 0
- Elapsed 9387.5s (2h 36m) / Cost $0.039
- Avg resp 240.7s / p50 209.2s / max 673.8s

---

## v3 3회 종합 비교표

| Run | Place | Tiles | **Rate** | Fallback | Elapsed | Avg resp | Max resp | Cost |
|-----|-------|-------|---------|----------|---------|---------|---------|------|
| 1 | 11 | 32 | 28.2% | 0 | 8332s | 213.6s | 535.4s | $0.039 |
| 2 | 10 | 26 | 25.6% | 0 | 10924s | 280.1s | 783.2s | $0.039 |
| 3 | 13 | 30 | **33.3%** | 0 | 9388s | 240.7s | 673.8s | $0.039 |
| **3회 평균** | **11.3** | **29.3** | **29.0%** | **0** | **9548s** | **244.8s** | — | **$0.117** |

비교: Day 7 v2 재실측 25.6% (N=1), R4/R5 v2 baseline 30.8% (N=2, 하드코딩 경로)

→ **v3 평균 29.0% > Day 7 v2 재실측 25.6% (+3.4%p)**, **< R4/R5 v2 30.8% (-1.8%p)**

### Run 2

| 턴 | 시각 | 레이턴시 | 입력토큰 | 출력토큰 | action | 비고 |
|----|------|---------|---------|---------|--------|------|
| (Run 1 완료 후 시작) |

### Run 3

| 턴 | 시각 | 레이턴시 | 입력토큰 | 출력토큰 | action | 비고 |
|----|------|---------|---------|---------|--------|------|
| (Run 2 완료 후 시작) |

---

## 5분 주기 모니터링 스냅샷

### Snapshot 1 — 2026-04-18 07:30:01 (wake-up #1)

```
Run 1/3 · 경과 24m · 현재 T18/80 (22.5%)
AI 턴 집계: place=3(+10 tiles) / draw=5 / fallback=0
응답시간: avg=171s / max=246s (1810s 한도 대비 14%)
프로세스: 생존 (PID 18087) / ai-adapter + game-server Pod Running
특이사항: 정상. T02 initial meld 6 tiles, 초반 페이스 양호
외삽: 40 AI 턴 × 170s ≈ 113분 → Run 1 완료 ~09:00
다음 wake-up: 07:50 (1200s)
```

### Snapshot 2 — 2026-04-18 07:52:07 (wake-up #2)

```
Run 1/3 · 경과 46m · 현재 T32/80 (40%)
AI 턴 집계: place=4(+13 tiles) / draw=11 / fallback=0
응답시간: avg=182s / max=255s (1810s 한도 대비 14%)
프로세스: 생존 (PID 18087) / ai-adapter+game-server Pod Running
특이사항: 정상. 22분간 7 AI 턴 추가, T24 PLACE 3 tiles 신규.
외삽: 40 AI 턴 × 182s ≈ 124분 → Run 1 완료 ~09:10
다음 wake-up: 08:12 (1200s)
```

### Snapshot 3 — 2026-04-18 08:14:06 (wake-up #3)

```
Run 1/3 · 경과 68m · 현재 T44/80 (55%)
AI 턴 집계: place=5(+16 tiles) / draw=16 / fallback=0
응답시간: avg=194s / max=309s (1810s 한도 대비 17%)
프로세스: 생존 (PID 18087) / ai-adapter+game-server Pod Running
특이사항: 정상. 22분간 6 AI 턴 추가, T32 PLACE 3 tiles 신규.
외삽: 40 AI 턴 × 194s ≈ 130분 → Run 1 완료 ~09:15
다음 wake-up: 08:34 (1200s)
```

### Snapshot 4 — 2026-04-18 08:35:05 (wake-up #4)

```
Run 1/3 · 경과 89m · 현재 T54/80 (67.5%)
AI 턴 집계: place=7(+23 tiles) / draw=19 / fallback=0
응답시간: avg=202s / max=392s (1810s 한도 대비 22%)
프로세스: 생존 (PID 18087) / ai-adapter+game-server Pod Running
특이사항: 정상. 21분간 5 AI 턴 추가, T46/T50 연속 PLACE 7 tiles 신규.
중반부 place 가속 — 현재 AI 턴 기준 7/26=26.9%
외삽: 40 AI 턴 × 202s ≈ 135분 → Run 1 완료 ~09:22
다음 wake-up: 08:55 (1200s)
```

### Snapshot 5 — 2026-04-18 08:56:06 (wake-up #5)

```
Run 1/3 · 경과 110m · 현재 T64/80 (80%)
AI 턴 집계: place=9(+27 tiles) / draw=22 / fallback=0
응답시간: avg=204s / max=392s (1810s 한도 대비 22%)
프로세스: 생존 (PID 18087) / Pod Running
특이사항: 정상. 21분간 5 AI 턴 추가, T54/T62 PLACE 4 tiles 신규.
AI 턴 기준 place rate 29.0% (상승 지속)
외삽: 남은 9 AI 턴 × 204s ≈ 30분 → Run 1 완료 ~09:26
다음 wake-up: 09:16 (1200s)
```

### Snapshot 6 — 2026-04-18 09:17:06 (wake-up #6)

```
Run 1/3 · 경과 131m · 현재 T76/80 (95%)
AI 턴 집계: place=11(+32 tiles) / draw=26 / fallback=0
응답시간: avg=212s / max=535s (T64, 1810s 한도 대비 30%)
프로세스: 생존 (PID 18087) / Pod Running
특이사항: 정상. 21분간 6 AI 턴 추가, T66/T74 PLACE 5 tiles 신규.
AI 턴 기준 place rate 29.7% — Day 8 새벽 v3 (28.2%) 근사
외삽: 남은 3 AI 턴 × 212s ≈ 11분 → Run 1 완료 ~09:28
다음 wake-up: 09:37 → Run 1 종료 확인 + Run 2 시작 확인 예상
```

### Snapshot 7 — 2026-04-18 09:39:06 (wake-up #7)

```
Run 1/3 완료 → Run 2/3 진행 중
Run 1 최종: Place 11 / Rate 28.2% / Tiles 32 / Fallback 0 / 8332s / $0.039
Run 2 경과 14m · 현재 T12/80 (15%)
Run 2 AI 집계: place=2(+7 tiles) / draw=3 / fallback=0
Run 2 응답시간: avg=161s / max=254s
프로세스: 생존 (PID 19443, Run 1 PID 18087 종료) / Pod Running
특이사항: Run 1 완료 정상. Run 2 초반 페이스 양호 — Initial meld 6 tiles 성공.
외삽: Run 2 완료 ~11:45, Run 3 완료 ~14:00
다음 wake-up: 09:59 (1200s)
```

### Snapshot 8 — 2026-04-18 10:01:11 (wake-up #8)

```
Run 2/3 · 경과 36m · 현재 T26/80 (32.5%)
AI 턴 집계: place=3(+10 tiles) / draw=9 / fallback=0
응답시간: avg=171s / max=254s (1810s 한도 대비 14%)
프로세스: 생존 (PID 19443) / Pod Running
특이사항: 정상. T22 PLACE 3 tiles 신규. 중반 draw streak(T08~T20 중 7턴 연속 draw) 주목
외삽: 40 AI 턴 × 171s ≈ 114분 → Run 2 완료 ~11:20
다음 wake-up: 10:21 (1200s)
```

### Snapshot 9 — 2026-04-18 10:23:12 (wake-up #9)

```
Run 2/3 · 경과 58m · 현재 T36/80 (45%)
AI 턴 집계: place=4(+13 tiles) / draw=13 / fallback=0
응답시간: avg=203s / max=379s (1810s 한도 대비 21%)
프로세스: 생존 (PID 19443) / Pod Running
특이사항: 정상. T32 PLACE 3 tiles 신규. 레이턴시 점진적 상승 (후반 추론 증가)
AI 턴 기준 place rate 23.5% (Run 1 중반 대비 약간 낮음)
외삽: 40 AI 턴 × 203s ≈ 137분 → Run 2 완료 ~11:42
다음 wake-up: 10:43 (1200s)
```

### Snapshot 10 — 2026-04-18 10:45:12 (wake-up #10)

```
Run 2/3 · 경과 80m · 현재 T44/80 (55%)
AI 턴 집계: place=6(+16 tiles) / draw=15 / fallback=0
응답시간: avg=214s / max=379s (1810s 한도 대비 21%)
프로세스: 생존 (PID 19443) / Pod Running
특이사항: 정상. 22분간 4 AI 턴 추가. T36/T40 PLACE 3 tiles 신규.
AI 턴 기준 place rate 28.6% (Run 1 28.2%와 근사 — 재현성 신호)
외삽: 40 AI 턴 × 214s ≈ 143분 → Run 2 완료 ~11:48
다음 wake-up: 11:05 (1200s)
```

### Snapshot 11 — 2026-04-18 11:07:07 (wake-up #11)

```
Run 2/3 · 경과 102m · 현재 T52/80 (65%)
AI 턴 집계: place=7(+17 tiles) / draw=18 / fallback=0
응답시간: avg=244s / max=458s (1810s 한도 대비 25%)
프로세스: 생존 (PID 19443) / Pod Running
특이사항: 정상. T44~T48 draw streak 중 응답시간 400s대 진입 (중후반 추론 심화)
AI 턴 기준 place rate 28.0% (Run 1 28.2%와 1oth 자리까지 일치 — 재현성 강한 신호)
외삽: 40 AI 턴 × 244s ≈ 163분 → Run 2 완료 ~12:08 (20분 지연)
다음 wake-up: 11:27 (1200s)
```

### Snapshot 12 — 2026-04-18 11:28:14 (wake-up #12)

```
Run 2/3 · 경과 123m · 현재 T60/80 (75%)
AI 턴 집계: place=8(+20 tiles) / draw=21 / fallback=0
응답시간: avg=246s / max=458s (1810s 한도 대비 25%)
프로세스: 생존 (PID 19443) / Pod Running
특이사항: 정상. T54 PLACE 3 tiles 신규 (이번 wake-up 에서 유일 PLACE)
AI 턴 기준 place rate 27.6% (Run 1 28.2% 지속적 근사)
외삽: 40 AI 턴 × 246s ≈ 164분 → Run 2 완료 ~12:10 (소폭 빨라짐)
다음 wake-up: 11:48 (1200s)
```

### Snapshot 13 — 2026-04-18 11:50:06 (wake-up #13)

```
Run 2/3 · 경과 145m · 현재 T66/80 (82.5%)
AI 턴 집계: place=8(+20 tiles) / draw=24 / fallback=0
응답시간: avg=271s / max=783s (1810s 한도 대비 43%)
프로세스: 생존 (PID 19443) / Pod Running
특이사항: T62 783s 응답 — DeepSeek 후반 추론 급등. 여전히 fallback 여유
현재 place rate 25.0% (Run 1 28.2% 대비 소폭 하락, 후반 PLACE 여부 관건)
외삽: 145분에 32 AI 턴 → 남은 8 AI 턴 ≈ 36분 → Run 2 완료 ~12:26
다음 wake-up: 12:10 (1200s)
```

### Snapshot 14 — 2026-04-18 12:11:08 (wake-up #14)

```
Run 2/3 · 경과 166m · 현재 T72/80 (90%)
AI 턴 집계: place=9(+23 tiles) / draw=26 / fallback=0
응답시간: avg=281s / max=783s (1810s 한도 대비 43%)
프로세스: 생존 (PID 19443) / Pod Running
특이사항: 정상. T70 PLACE 3 tiles 신규, 400s대 응답 지속
현재 place rate 25.7% (Run 1 28.2%보다 약간 낮음)
외삽: 남은 5 AI 턴 × 281s ≈ 23분 → Run 2 완료 ~12:34
다음 wake-up: 12:31 (1200s) → Run 2 종료 + Run 3 시작 예상
```

### Snapshot 15 — 2026-04-18 12:32:06 (wake-up #15)

```
Run 2/3 완료 → Run 3/3 진행 중
Run 2 최종: Place 10 / Rate 25.6% / Tiles 26 / Fallback 0 / 10924s / $0.039
Run 3 경과 4m · 현재 T08/80 (10%)
Run 3 AI 집계: place=1(+4 tiles) / draw=2 / fallback=0
Run 3 응답시간: avg=64s / max=100s (극도로 빠름)
프로세스: 생존 (PID 20674, Run 2 PID 19443 종료) / Pod Running
특이사항: **Run 3 T02 DRAW, T04 PLACE 4 tiles** — 이례적 시작. 초반 응답 40~100s (Run 1/2 대비 훨씬 빠름)
v3 재현성 중간 평가: Run 1 28.2% + Run 2 25.6% → 평균 26.9%, Day 7 v2 재실측 25.6%와 근접
외삽: Run 3 완료 ~15:00 (초반 빠르나 후반 상승 예상)
다음 wake-up: 12:52 (1200s)
```

### Snapshot 16 — 2026-04-18 12:54:13 (wake-up #16)

```
Run 3/3 · 경과 26m · 현재 T28/80 (35%)
AI 턴 집계: place=4(+12 tiles) / draw=9 / fallback=0
응답시간: avg=116s / max=187s (1810s 한도 대비 10%)
프로세스: 생존 (PID 20674) / Pod Running
특이사항: **Run 3 응답시간 극도로 빠름** (Run 1 214s / Run 2 281s 대비 절반 이하)
현재 place rate 30.8% — Run 1 28.2%, Run 2 25.6% 대비 상승
외삽: 26분에 13 AI 턴 → 40 AI 턴에 82분 → Run 3 완료 ~13:50 (빠름!)
다음 wake-up: 13:14 (1200s)
```

### Snapshot 17 — 2026-04-18 13:16:07 (wake-up #17)

```
Run 3/3 · 경과 48m · 현재 T40/80 (50%)
AI 턴 집계: place=5(+15 tiles) / draw=14 / fallback=0
응답시간: avg=152s / max=319s (1810s 한도 대비 18%)
프로세스: 생존 (PID 20674) / Pod Running
특이사항: 정상. T32 PLACE 3 tiles 신규. 응답시간 점진적 상승하지만 여전히 Run 1/2 대비 빠름
현재 place rate 26.3% (Run 1 28.2%, Run 2 25.6% 사이)
외삽: 40 AI 턴 × 152s ≈ 101분 → Run 3 완료 ~14:10
다음 wake-up: 13:36 (1200s)
```

### Snapshot 18 — 2026-04-18 13:38:06 (wake-up #18)

```
Run 3/3 · 경과 70m · 현재 T48/80 (60%)
AI 턴 집계: place=6(+16 tiles) / draw=17 / fallback=0
응답시간: avg=178s / max=434s (1810s 한도 대비 24%)
프로세스: 생존 (PID 20674) / Pod Running
특이사항: 정상. T44 PLACE 1 tile 신규. 중후반 응답 상승 패턴 (Run 1/2와 유사)
현재 place rate 26.1% (Run 1 28.2%, Run 2 25.6% 사이로 수렴)
외삽: 40 AI 턴 × 178s ≈ 118분 → Run 3 완료 ~14:25
다음 wake-up: 13:58 (1200s)
```

### Snapshot 19 — 2026-04-18 13:59:06 (wake-up #19)

```
Run 3/3 · 경과 91m · 현재 T54/80 (67.5%)
AI 턴 집계: place=6(+16 tiles) / draw=20 / fallback=0
응답시간: avg=203s / max=480s (1810s 한도 대비 27%)
프로세스: 생존 (PID 20674) / Pod Running
특이사항: T48/T50/T52 3턴 연속 DRAW, place rate 소폭 하락
현재 place rate 23.1% (Run 1 28.2%, Run 2 25.6%보다 낮음)
외삽: 40 AI 턴 × 203s ≈ 135분 → Run 3 완료 ~14:50
다음 wake-up: 14:19 (1200s)
```

### Snapshot 20 — 2026-04-18 14:20:06 (wake-up #20)

```
Run 3/3 · 경과 112m · 현재 T60/80 (75%)
AI 턴 집계: place=7(+19 tiles) / draw=22 / fallback=0
응답시간: avg=222s / max=674s (1810s 한도 대비 37%)
프로세스: 생존 (PID 20674) / Pod Running
특이사항: T56 PLACE 3 tiles 회복. T54 673.8s 대기 후 성공. 여전히 timeout 여유
현재 place rate 24.1% (Run 2 25.6%와 근사)
외삽: 남은 11 AI 턴 × 222s ≈ 41분 → Run 3 완료 ~15:02
다음 wake-up: 14:40 (1200s)
```

### Snapshot 21 — 2026-04-18 14:41:08 (wake-up #21)

```
Run 3/3 · 경과 134m · 현재 T68/80 (85%)
AI 턴 집계: place=10(+25 tiles) / draw=23 / fallback=0
응답시간: avg=232s / max=674s (1810s 한도 대비 37%)
프로세스: 생존 (PID 20674) / Pod Running
특이사항: **후반 PLACE 폭발** — T60/T62/T66 3연속 PLACE로 place rate 24.1→30.3% 반등
현재 place rate 30.3% (Run 1 28.2%, Run 2 25.6% 모두 상회)
외삽: 남은 7 AI 턴 × 232s ≈ 27분 → Run 3 완료 ~15:08
다음 wake-up: 15:01 → Run 3 종료 + 자동 Chain 진입 예상
```

### Snapshot 23 — 2026-04-18 15:07:20 (wake-up #23, Run 3 종료 감지 + Chain 진입)

```
** Run 3 완료 감지 (exit=0) **
v3 3회 평균: 29.0% (28.2 / 25.6 / 33.3) — Day 7 v2 재실측 25.6% 대비 +3.4%p

** Chain 1 Phase 4 사후정리 완료 **
- Redis game:* 0건
- ai-battle 프로세스 0개
- v3-run1/2/3-result.json 3개 확보

** Chain 2 Timeout 원복 완료 **
- game-server ConfigMap AI_ADAPTER_TIMEOUT_SEC: 1800 → 700
- game-server Deployment rollout 성공
- Istio VS ai-adapter: timeout 1810s→710s, perTryTimeout 1810s→710s
- scripts/ai-battle-3model-r4.py deepseek ws_timeout 1870→770
- 부등식 검증: script_ws(770) > istio_vs(710) > gs_ctx(700) ✅

** Chain 3 v2 재연 배틀 백그라운드 시작 **
- DEEPSEEK_REASONER_PROMPT_VARIANT v3→v2 전환 + rollout
- PID 22213 (bash) + 22235 (python3)
- Run 2 시작 15:07:20, 환경 timeout=700s
- 결과 저장: work_logs/battles/r10-v2-rerun/
- 예상 완료 Run 2 ~17:15, Run 3 ~19:35

다음 wake-up: 15:27 (1200s) → v2 Run 2 진행 모니터링
```

### Snapshot 24 — 2026-04-18 15:19:16 (wake-up #24, v2 Run 2 진행)

```
v2 Run 2/2 · 경과 12m · 현재 T08/80 (10%)
AI 턴 집계: place=2(+9 tiles) / draw=1 / fallback=0
응답시간: avg=211s / max=263s (700s 한도 대비 38%)
프로세스: 생존 (PID 22235) / Pod Running (원복된 짧은 timeout 환경)
특이사항: **Initial meld 7 tiles** (v3 Run1/2 6, Run3 4 대비 높음)
초반 place 2/3 = 66.7% (v3 Run들보다 양호한 출발)
외삽: 40 AI 턴 × 211s ≈ 141분 → Run 2 완료 ~17:28
다음 wake-up: 15:47 (1200s)
```

### Snapshot 25 — 2026-04-18 15:29:06 (wake-up #25, v2 Run 2)

```
v2 Run 2/2 · 경과 22m · 현재 T12/80 (15%)
AI 턴 집계: place=2(+9 tiles) / draw=3 / fallback=0
응답시간: avg=225s / max=281s (700s 한도 대비 40%)
프로세스: 생존 (PID 22235) / Pod Running
특이사항: 정상. 초반 place 2/5=40% 유지
외삽: 40 AI 턴 × 225s ≈ 150분 → Run 2 완료 ~17:37
다음 wake-up: 15:49 (1200s)
```

### Snapshot 26 — 2026-04-18 15:41:06 (wake-up #26, v2 Run 2)

```
v2 Run 2/2 · 경과 34m · 현재 T18/80 (22.5%)
AI 턴 집계: place=2(+9 tiles) / draw=6 / fallback=0
응답시간: avg=228s / max=281s (700s 한도 대비 40%)
프로세스: 생존 (PID 22235) / Pod Running
특이사항: T08~T16 5턴 연속 DRAW — 초반 PLACE 폭발 후 draw streak 진입
현재 place rate 25.0% (Day 7 v2 재실측과 동일 — 재현성)
외삽: 40 AI 턴 × 228s ≈ 152분 → Run 2 완료 ~17:40
다음 wake-up: 16:01 (1200s)
```

### Snapshot 27 — 2026-04-18 15:50:06 (wake-up #27, v2 Run 2)

```
v2 Run 2/2 · 경과 43m · 현재 T22/80 (27.5%)
AI 턴 집계: place=3(+10 tiles) / draw=7 / fallback=0
응답시간: avg=248s / max=339s (700s 한도 대비 48%)
프로세스: 생존 (PID 22235) / Pod Running
특이사항: T20 PLACE 1 tile — 6턴 draw streak 탈출. 응답시간 점진 상승
현재 place rate 30.0% (Run 1/2/3 Day 7 대비 개선)
외삽: 40 AI 턴 × 248s ≈ 165분 → Run 2 완료 ~17:55
다음 wake-up: 16:10 (1200s)
```

### Snapshot 28 — 2026-04-18 16:02:06 (wake-up #28, v2 Run 2)

```
v2 Run 2/2 · 경과 55m · 현재 T26/80 (32.5%)
AI 턴 집계: place=4(+13 tiles) / draw=8 / fallback=0
응답시간: avg=263s / max=390s (700s 한도 대비 56%)
프로세스: 생존 (PID 22235) / Pod Running
특이사항: T24 PLACE 3 tiles 신규. place rate 30→33.3% 상승
응답시간 지속 상승 중 — 1/3 지점에 이미 390s 도달
외삽: 40 AI 턴 × 263s ≈ 175분 → Run 2 완료 ~18:02
다음 wake-up: 16:22 (1200s)
```

### Snapshot 29 — 2026-04-18 16:11:05 (wake-up #29, v2 Run 2)

```
v2 Run 2/2 · 경과 64m · 현재 T30/80 (37.5%)
AI 턴 집계: place=4(+13 tiles) / draw=10 / fallback=0
응답시간: avg=269s / max=390s (700s 한도 대비 56%)
프로세스: 생존 (PID 22235) / Pod Running
특이사항: 정상. T26/T28 연속 DRAW. 응답시간 점진 상승
현재 place rate 28.6% (Run 1/v3 Run 1 수준)
외삽: 40 AI 턴 × 269s ≈ 179분 → Run 2 완료 ~18:06
다음 wake-up: 16:31 (1200s)
```

### Snapshot 30 — 2026-04-18 16:23:06 (wake-up #30, v2 Run 2)

```
v2 Run 2/2 · 경과 76m · 현재 T34/80 (42.5%)
AI 턴 집계: place=4(+13 tiles) / draw=12 / fallback=0
응답시간: avg=273s / max=390s (700s 한도 대비 56%)
프로세스: 생존 (PID 22235) / Pod Running
특이사항: T26~T32 4연속 DRAW — 중반 draw streak 재발
현재 place rate 25.0% (Day 7 재실측 25.6%와 근사)
외삽: 40 AI 턴 × 273s ≈ 182분 → Run 2 완료 ~18:09
다음 wake-up: 16:43 (1200s)
```

### Snapshot 31 — 2026-04-18 16:32:06 (wake-up #31, v2 Run 2)

```
v2 Run 2/2 · 경과 85m · 현재 T38/80 (47.5%)
AI 턴 집계: place=4(+13 tiles) / draw=14 / fallback=0
응답시간: avg=272s / max=390s (700s 한도 대비 56%)
프로세스: 생존 (PID 22235) / Pod Running
특이사항: T26~T36 6연속 DRAW 장기화
현재 place rate 22.2% — 중반 draw streak로 하락
외삽: 40 AI 턴 × 272s ≈ 182분 → Run 2 완료 ~18:09
다음 wake-up: 16:52 (1200s)
```

### Snapshot 32 — 2026-04-18 16:44:06 (wake-up #32, v2 Run 2)

```
v2 Run 2/2 · 경과 97m · 현재 T42/80 (52.5%)
AI 턴 집계: place=5(+16 tiles) / draw=15 / fallback=0
응답시간: avg=289s / max=471s (700s 한도 대비 67%)
프로세스: 생존 (PID 22235) / Pod Running
특이사항: T40 PLACE 3 tiles — draw streak 탈출 (7턴 만에). 최대 응답 471s 등장
현재 place rate 25.0% (Day 7 재실측과 거의 동일)
외삽: 40 AI 턴 × 289s ≈ 193분 → Run 2 완료 ~18:20
다음 wake-up: 17:04 (1200s)
```

### Snapshot 33 — 2026-04-18 16:53:06 (wake-up #33, v2 Run 2)

```
v2 Run 2/2 · 경과 106m · 현재 T44/80 (55%)
AI 턴 집계: place=5(+16 tiles) / draw=16 / fallback=0
응답시간: avg=294s / max=471s (700s 한도 대비 67%)
프로세스: 생존 (PID 22235) / Pod Running
특이사항: 정상. T42 DRAW 추가
현재 place rate 23.8% (Day 7 재실측 25.6%에 근접)
외삽: 40 AI 턴 × 294s ≈ 196분 → Run 2 완료 ~18:23
다음 wake-up: 17:13 (1200s)
```

### Snapshot 34 — 2026-04-18 17:05:07 (wake-up #34, v2 Run 2)

```
v2 Run 2/2 · 경과 118m · 현재 T48/80 (60%)
AI 턴 집계: place=6(+19 tiles) / draw=17 / fallback=0
응답시간: avg=293s / max=471s (700s 한도 대비 67%)
프로세스: 생존 (PID 22235) / Pod Running
특이사항: T44 PLACE 3 tiles — draw streak 재탈출
현재 place rate 26.1% (Day 7 재실측 25.6%와 근접)
외삽: 40 AI 턴 × 293s ≈ 195분 → Run 2 완료 ~18:22
다음 wake-up: 17:25 (1200s)
```

### Snapshot 35 — 2026-04-18 17:14:07 (wake-up #35, v2 Run 2)

```
v2 Run 2/2 · 경과 127m · 현재 T50/80 (62.5%)
AI 턴 집계: place=6(+19 tiles) / draw=18 / fallback=0
응답시간: avg=300s / max=471s (700s 한도 대비 67%)
프로세스: 생존 (PID 22235) / Pod Running
특이사항: T48 460s 응답 (한도 66%, 여유). 후반 추론 증가 중
현재 place rate 25.0% (Day 7 재실측과 동일)
외삽: 40 AI 턴 × 300s ≈ 200분 → Run 2 완료 ~18:27
다음 wake-up: 17:34 (1200s)
```

### Snapshot 36 — 2026-04-18 17:26:06 (wake-up #36, v2 Run 2)

```
v2 Run 2/2 · 경과 139m · 현재 T56/80 (70%)
AI 턴 집계: place=8(+25 tiles) / draw=19 / fallback=0
응답시간: avg=304s / max=471s (700s 한도 대비 67%)
프로세스: 생존 (PID 22235) / Pod Running
특이사항: **T50/T54 PLACE 6 tiles** — 후반 반등. Run 2 의 tile 총합이 Run 1 (32) 에 근접
현재 place rate 29.6% (상승 중)
외삽: 남은 13 AI 턴 × 304s ≈ 66분 → Run 2 완료 ~18:32
다음 wake-up: 17:46 (1200s)
```

### Snapshot 37 — 2026-04-18 17:35:06 (wake-up #37, v2 Run 2)

```
v2 Run 2/2 · 경과 148m · 현재 T60/80 (75%)
AI 턴 집계: place=8(+25 tiles) / draw=21 / fallback=0
응답시간: avg=305s / max=471s (700s 한도 대비 67%)
프로세스: 생존 (PID 22235) / Pod Running
특이사항: 정상. T56/T58 연속 DRAW
현재 place rate 27.6% (v3 평균 29.0%에 근접)
외삽: 남은 11 AI 턴 × 305s ≈ 56분 → Run 2 완료 ~18:31
다음 wake-up: 17:55 (1200s)
```

### Snapshot 38 — 2026-04-18 17:47:08 (wake-up #38, v2 Run 2)

```
v2 Run 2/2 · 경과 160m · 현재 T64/80 (80%)
AI 턴 집계: place=9(+27 tiles) / draw=22 / fallback=0
응답시간: avg=306s / max=471s (700s 한도 대비 67%)
프로세스: 생존 (PID 22235) / Pod Running
특이사항: T62 PLACE 2 tiles — place rate 29.0% (v3 평균과 **정확히 일치**)
외삽: 남은 9 AI 턴 × 306s ≈ 46분 → Run 2 완료 ~18:33
다음 wake-up: 18:07 (1200s)
```

### Snapshot 39 — 2026-04-18 17:56:07 (wake-up #39, v2 Run 2)

```
v2 Run 2/2 · 경과 169m · 현재 T68/80 (85%)
AI 턴 집계: place=10(+30 tiles) / draw=23 / fallback=0
응답시간: avg=304s / max=471s (700s 한도 대비 67%)
프로세스: 생존 (PID 22235) / Pod Running
특이사항: T66 PLACE 3 tiles — 후반 PLACE 가속 (v3 Run 3 와 유사 패턴)
현재 place rate 30.3% (v3 평균 상회 중)
외삽: 남은 7 AI 턴 × 304s ≈ 35분 → Run 2 완료 ~18:31
다음 wake-up: 18:16 (1200s)
```

### Snapshot 40 — 2026-04-18 18:08:08 (wake-up #40, v2 Run 2)

```
v2 Run 2/2 · 경과 181m · 현재 T74/80 (92.5%)
AI 턴 집계: place=11(+31 tiles) / draw=25 / fallback=0
응답시간: avg=298s / max=471s (700s 한도 대비 67%)
프로세스: 생존 (PID 22235) / Pod Running
특이사항: T70 PLACE 1 tile — Run 2 tile 총합 31 (v3 Run 1 32 에 근접)
현재 place rate 30.6% (v3 평균 29.0% 상회)
외삽: 남은 4 AI 턴 × 298s ≈ 20분 → Run 2 완료 ~18:28
다음 wake-up: 18:28 (1200s) → Run 2 종료 감지 + Run 3 시작 예상
```

### Snapshot 41 — 2026-04-18 18:17:07 (wake-up #41, v2 Run 2)

```
v2 Run 2/2 · 경과 190m · 현재 T78/80 (97.5%)
AI 턴 집계: place=12(+32 tiles) / draw=26 / fallback=0
응답시간: avg=297s / max=471s (700s 한도 대비 67%)
프로세스: 생존 (PID 22235) / Pod Running
특이사항: T74 PLACE 1 tile — **tiles 32 도달 (v3 Run 1 과 동일)**
현재 place rate 31.6% (v3 평균 29.0% 상회)
외삽: 남은 2 AI 턴 × 297s ≈ 10분 → Run 2 완료 ~18:27
다음 wake-up: 18:37 (1200s) → Run 2 종료 확정 + Run 3 시작 감지
```

### Snapshot 42 — 2026-04-18 18:29:07 (wake-up #42, Run 2 종료 + Run 3 시작)

```
** Run 2 완료 감지 (18:17:58) **
Place 12 / Rate 30.8% / Tiles 32 / Fallback 0 / 11437s / $0.039
→ **R4/R5 baseline (30.8%) 정확히 재현**! Day 7 재실측 25.6% 가 하위 꼬리 해석 강화

v2 Run 3/2 · 경과 11m · 현재 T14/80 (17.5%)
AI 턴 집계: place=1(+6 tiles) / draw=5 / fallback=0
응답시간: avg=90s / max=124s (매우 빠름, v3 Run 3 유사 패턴)
프로세스: 생존 (PID 23886) / Pod Running
특이사항: T02~T10 5턴 연속 DRAW → T12 Initial meld 6 tiles 지연 시작
외삽: 40 AI 턴 × 90s ≈ 60분 → Run 3 완료 ~19:19 (빠름)
다음 wake-up: 18:49 (1200s)
```

### Snapshot 43 — 2026-04-18 18:38:07 (wake-up #43, v2 Run 3)

```
v2 Run 3/2 · 경과 20m · 현재 T22/80 (27.5%)
AI 턴 집계: place=3(+12 tiles) / draw=7 / fallback=0
응답시간: avg=108s / max=141s (700s 한도 대비 20%)
프로세스: 생존 (PID 23886) / Pod Running
특이사항: T16/T20 연속 PLACE. 응답 매우 빠름 (v3 Run 3 패턴과 유사)
현재 place rate 30.0%
외삽: 40 AI 턴 × 108s ≈ 72분 → Run 3 완료 ~19:30
다음 wake-up: 18:58 (1200s)
```

### Snapshot 44 — 2026-04-18 18:51:06 (wake-up #44, v2 Run 3)

```
v2 Run 3/2 · 경과 33m · 현재 T32/80 (40%)
AI 턴 집계: place=5(+16 tiles) / draw=10 / fallback=0
응답시간: avg=124s / max=172s (700s 한도 대비 25%)
프로세스: 생존 (PID 23886) / Pod Running
특이사항: T26/T30 PLACE. 응답 여전히 매우 빠름
현재 place rate 33.3% (v3 Run 3 최고값과 동일)
외삽: 40 AI 턴 × 124s ≈ 83분 → Run 3 완료 ~19:42
다음 wake-up: 19:11 (1200s)
```

### Snapshot 45 — 2026-04-18 18:59:07 (wake-up #45, v2 Run 3)

```
v2 Run 3/2 · 경과 41m · 현재 T38/80 (47.5%)
AI 턴 집계: place=6(+17 tiles) / draw=12 / fallback=0
응답시간: avg=135s / max=249s (700s 한도 대비 36%)
프로세스: 생존 (PID 23886) / Pod Running
특이사항: T34 PLACE 1 tile. 응답시간 여전히 빠르지만 중반 진입하며 상승 중
현재 place rate 33.3% (v3 Run 3 최고치 유지)
외삽: 40 AI 턴 × 135s ≈ 90분 → Run 3 완료 ~19:49
다음 wake-up: 19:19 (1200s)
```

### Snapshot 46 — 2026-04-18 19:12:06 (wake-up #46, v2 Run 3)

```
v2 Run 3/2 · 경과 54m · 현재 T46/80 (57.5%)
AI 턴 집계: place=7(+21 tiles) / draw=15 / fallback=0
응답시간: avg=144s / max=249s (700s 한도 대비 36%)
프로세스: 생존 (PID 23886) / Pod Running
특이사항: T44 PLACE 4 tiles — 중후반 PLACE 반등
현재 place rate 31.8% (v3 평균 29.0% 상회)
외삽: 남은 18 AI 턴 × 144s ≈ 43분 → Run 3 완료 ~19:55
다음 wake-up: 19:32 (1200s)
```

### Snapshot 47 — 2026-04-18 19:20:07 (wake-up #47, v2 Run 3)

```
v2 Run 3/2 · 경과 62m · 현재 T50/80 (62.5%)
AI 턴 집계: place=7(+21 tiles) / draw=17 / fallback=0
응답시간: avg=153s / max=281s (700s 한도 대비 40%)
프로세스: 생존 (PID 23886) / Pod Running
특이사항: 정상. T46/T48 연속 DRAW, 응답시간 중반 진입
현재 place rate 29.2%
외삽: 남은 16 AI 턴 × 153s ≈ 41분 → Run 3 완료 ~20:01
다음 wake-up: 19:40 (1200s)
```

### Snapshot 48 — 2026-04-18 19:33:07 (wake-up #48, v2 Run 3)

```
v2 Run 3/2 · 경과 75m · 현재 T56/80 (70%)
AI 턴 집계: place=8(+22 tiles) / draw=19 / fallback=0
응답시간: avg=160s / max=281s (700s 한도 대비 40%)
프로세스: 생존 (PID 23886) / Pod Running
특이사항: T52 PLACE 1 tile. 여전히 빠른 응답 유지
현재 place rate 29.6% (v3 평균과 근사)
외삽: 남은 13 AI 턴 × 160s ≈ 35분 → Run 3 완료 ~20:08
다음 wake-up: 19:53 (1200s)
```

### Snapshot 49 — 2026-04-18 19:41:07 (wake-up #49, v2 Run 3)

```
v2 Run 3/2 · 경과 83m · 현재 T60/80 (75%)
AI 턴 집계: place=9(+25 tiles) / draw=20 / fallback=0
응답시간: avg=168s / max=281s (700s 한도 대비 40%)
프로세스: 생존 (PID 23886) / Pod Running
특이사항: T58 PLACE 3 tiles — rate 상승 지속
현재 place rate 31.0% (v3 평균 29.0% 상회)
외삽: 남은 11 AI 턴 × 168s ≈ 31분 → Run 3 완료 ~20:12
다음 wake-up: 20:01 (1200s)
```

### Snapshot 50 — 2026-04-18 19:54:06 (wake-up #50, v2 Run 3)

```
v2 Run 3/2 · 경과 96m · 현재 T64/80 (80%)
AI 턴 집계: place=9(+25 tiles) / draw=22 / fallback=0
응답시간: avg=181s / max=362s (700s 한도 대비 52%)
프로세스: 생존 (PID 23886) / Pod Running
특이사항: T60/T62 연속 DRAW, 응답시간 후반 상승
현재 place rate 29.0% (v3 평균 29.0%와 정확히 일치)
외삽: 남은 9 AI 턴 × 181s ≈ 27분 → Run 3 완료 ~20:21
다음 wake-up: 20:14 (1200s)
```

### Snapshot 51 — 2026-04-18 20:02:08 (wake-up #51, v2 Run 3)

```
v2 Run 3/2 · 경과 104m · 현재 T68/80 (85%)
AI 턴 집계: place=11(+30 tiles) / draw=22 / fallback=0
응답시간: avg=187s / max=362s (700s 한도 대비 52%)
프로세스: 생존 (PID 23886) / Pod Running
특이사항: **T64/T66 연속 PLACE 5 tiles** — 후반 PLACE 가속 (v3 Run 3 패턴 재현)
현재 place rate 33.3% (Run 2 30.8% 상회, v3 Run 3 최고치와 동일)
외삽: 남은 7 AI 턴 × 187s ≈ 22분 → Run 3 완료 ~20:24
다음 wake-up: 20:22 (1200s) → Run 3 종료 + Chain 5 진입 가능성
```

### Snapshot 52 — 2026-04-18 20:15:10 (wake-up #52, v2 Run 3)

```
v2 Run 3/2 · 경과 117m · 현재 T72/80 (90%)
AI 턴 집계: place=11(+30 tiles) / draw=24 / fallback=0
응답시간: avg=188s / max=362s (700s 한도 대비 52%)
프로세스: 생존 (PID 23886) / Pod Running
특이사항: 정상. T68/T70 연속 DRAW
현재 place rate 31.4%
외삽: 남은 5 AI 턴 × 188s ≈ 16분 → Run 3 완료 ~20:31
다음 wake-up: 20:35 (1200s) → Run 3 종료 확정 + Chain 5 진입 예상
```

### Snapshot 53 — 2026-04-18 20:23:09 (wake-up #53, v2 Run 3 막바지)

```
v2 Run 3/2 · 경과 125m · 현재 T76/80 (95%)
AI 턴 집계: place=12(+33 tiles) / draw=25 / fallback=0
응답시간: avg=202s / max=**693s** (700s 한도 대비 99%)
프로세스: 생존 (PID 23886) / Pod Running
특이사항: **T72 693s** 로 한도 99% 근접 (타이밍상 운 좋게 통과). T74 PLACE 3 tiles 로 회복
현재 place rate 32.4%, tiles 33 (v2 Run 2 32 상회)
외삽: 남은 3 AI 턴 × 202s ≈ 10분 → Run 3 완료 ~20:33
다음 wake-up: 20:35 → Run 3 종료 확정 + Chain 5 진입
```

### Snapshot 54 — 2026-04-18 20:29:58 (wake-up #54, 🎯 Run 3 완료 + Chain 5 진입)

```
** Run 3 완료 감지 (20:29:32) **
Place 12 / Rate 30.8% / Tiles 33 / Fallback 0 / 7864s / $0.039
→ Run 2 (30.8%) 와 정확히 동일 재현!

** v2 N=3 최종 (Day 7 + Run 2 + Run 3) **
Rate = (25.6 + 30.8 + 30.8) / 3 = **29.07%**

** v3 N=3 vs v2 N=3 최종 판정 **
v3 = 29.0%, v2 = 29.07% → Δ = 0.07%p → **통계적으로 구분 불가**

** Chain 5 진입 (순서: 리포트 → 팀 리뷰 → 일일 마감) **
- Chain 5-1 Phase 4: Redis game:* 삭제 (1건), 프로세스 정리 확인 ✅
- Chain 5-2 통계 집계 ✅
- Chain 5-3 리포트 완성본 작성 → ai-engineer 에이전트 background 위임
- Chain 5-4 팀 리뷰 → 리포트 완성 후
- Chain 5-5 일일 마감 → 팀 리뷰 후
```

---

## Run 2 (v2 재연, 시작 2026-04-18 15:07:20, variant=v2, timeout=700s, PID 22235)

> Day 7 재실측 (25.6%) 을 Run 1 로 간주, 이번이 Run 2/3 재연 배치

| 턴 | 레이턴시 | action | 누적 tiles | 비고 |
|----|---------|--------|-----------|------|
| T02 | 223.2s | PLACE 7 tiles | 7 | **Initial meld 7 tiles** (v3 대비 높음) |
| T04 | 263.1s | DRAW | 7 | |
| T06 | 147.7s | PLACE 2 tiles | 9 | |
| T08 | 207.4s | DRAW | 9 | |
| T10 | 281.4s | DRAW | 9 | |
| T12 | 271.0s | DRAW | 9 | |
| T14 | 174.1s | DRAW | 9 | |
| T16 | 255.7s | DRAW | 9 | |
| T18 | 339.2s | DRAW | 9 | |
| T20 | 318.3s | PLACE 1 tile | 10 | Draw streak 탈출 |
| T22 | 389.5s | DRAW | 10 | |
| T24 | 285.1s | PLACE 3 tiles | 13 | |
| T26 | 272.0s | DRAW | 13 | |
| T28 | 341.3s | DRAW | 13 | |
| T30 | 213.2s | DRAW | 13 | |
| T32 | 386.2s | DRAW | 13 | |
| T34 | 234.7s | DRAW | 13 | |
| T36 | 300.8s | DRAW | 13 | |
| T38 | 404.6s | DRAW | 13 | |
| T40 | 470.8s | PLACE 3 tiles | 16 | 현 시점 최대 응답 |
| T42 | 392.9s | DRAW | 16 | |
| T44 | 234.5s | PLACE 3 tiles | 19 | |
| T46 | 337.6s | DRAW | 19 | |
| T48 | 460.6s | DRAW | 19 | |
| T50 | 418.4s | PLACE 3 tiles | 22 | |
| T52 | 323.3s | DRAW | 22 | |
| T54 | 261.7s | PLACE 3 tiles | 25 | |
| T56 | 385.2s | DRAW | 25 | |
| T58 | 254.7s | DRAW | 25 | |
| T60 | 338.4s | DRAW | 25 | |
| T62 | 300.7s | PLACE 2 tiles | 27 | |
| T64 | 208.5s | DRAW | 27 | 빠름 |
| T66 | 328.5s | PLACE 3 tiles | 30 | |
| T68 | 228.0s | DRAW | 30 | |
| T70 | 284.4s | PLACE 1 tile | 31 | |
| T72 | 202.8s | DRAW | 31 | |
| T74 | 369.7s | PLACE 1 tile | 32 | v3 Run 1 동일 |
| T76 | 180.0s | DRAW | 32 | |
| T78 | — | DRAW | 32 | Run 2 종료 구간 |
| T80 | — | — | 32 | Run 2 종료 |

**Run 2 최종 결과** (2026-04-18 18:17:58):
- Place 12 / AI 턴 39 / **Rate 30.8%** / Tiles 32 / Fallback 0
- Elapsed 11437.5s (3h 11m) / Cost $0.039
- Avg resp 293.2s / p50 284.4s / max 470.8s
- **R4/R5 baseline (30.8%) 정확히 재현** — Day 7 재실측 25.6% 가 하위 꼬리였을 가능성

### Run 3 (v2 재연, 시작 2026-04-18 18:18:28, PID 23886)

| 턴 | 레이턴시 | action | 누적 tiles | 비고 |
|----|---------|--------|-----------|------|
| T02 | 96.1s | DRAW | 0 | **초반 응답 매우 빠름** (v3 Run 3 유사) |
| T04 | 96.4s | DRAW | 0 | |
| T06 | 64.4s | DRAW | 0 | |
| T08 | 74.2s | DRAW | 0 | |
| T10 | 86.8s | DRAW | 0 | 5턴 연속 DRAW |
| T12 | 123.9s | PLACE 6 tiles | 6 | 지연된 Initial meld |
| T14 | 141.3s | DRAW | 6 | |
| T16 | 136.6s | PLACE 3 tiles | 9 | |
| T18 | 128.0s | DRAW | 9 | |
| T20 | 135.5s | PLACE 3 tiles | 12 | |
| T22 | 149.0s | DRAW | 12 | |
| T24 | 147.1s | DRAW | 12 | |
| T26 | 171.5s | PLACE 1 tile | 13 | |
| T28 | 142.4s | DRAW | 13 | |
| T30 | 162.6s | PLACE 3 tiles | 16 | |
| T32 | 122.5s | DRAW | 16 | |
| T34 | 208.2s | PLACE 1 tile | 17 | |
| T36 | 249.2s | DRAW | 17 | |
| T38 | 139.3s | DRAW | 17 | |
| T40 | 178.2s | DRAW | 17 | |
| T42 | 217.8s | DRAW | 17 | |
| T44 | 205.0s | PLACE 4 tiles | 21 | |
| T46 | 281.2s | DRAW | 21 | |
| T48 | 224.2s | DRAW | 21 | |
| T50 | 261.8s | DRAW | 21 | |
| T52 | 213.0s | PLACE 1 tile | 22 | |
| T54 | 166.5s | DRAW | 22 | |
| T56 | 279.3s | DRAW | 22 | |
| T58 | 280.1s | PLACE 3 tiles | 25 | |
| T60 | 362.3s | DRAW | 25 | 현 시점 최대 |
| T62 | 351.2s | DRAW | 25 | |
| T64 | 223.3s | PLACE 3 tiles | 28 | |
| T66 | 335.1s | PLACE 2 tiles | 30 | 후반 PLACE 가속 |
| T68 | 226.5s | DRAW | 30 | |
| T70 | 187.8s | DRAW | 30 | |
| T72 | **693.3s** | DRAW | 30 | **한도 99% 근접** (700s 한도) |
| T74 | 221.1s | PLACE 3 tiles | 33 | tiles 33 — v2 Run 2 (32) 상회 |
| T76 | — | DRAW | 33 | Run 3 마지막 구간 |
| T78 | — | DRAW | 33 | |
| T80 | — | — | 33 | Run 3 완료 |

**Run 3 최종 결과** (2026-04-18 20:29:32):
- Place 12 / AI 턴 39 / **Rate 30.8%** / Tiles 33 / Fallback 0
- Elapsed 7864.0s (2h 11m) / Cost $0.039
- Avg resp 201.6s / p50 179.0s / max 693.3s (T72)

---

## 🎯 Round 10 최종 종합 비교표

### v2 N=3 (timeout 700s 환경)

| Run | 일자 | Place | Tiles | **Rate** | Fallback | Elapsed | Avg resp |
|-----|------|-------|-------|---------|----------|---------|---------|
| 1 (Day 7 재실측) | 2026-04-17 | 10 | 32 | 25.6% | 0 | 7929s | 203s |
| 2 | 2026-04-18 | 12 | 32 | 30.8% | 0 | 11437s | 293s |
| 3 | 2026-04-18 | 12 | 33 | **30.8%** | 0 | 7864s | 202s |
| **평균** | — | **11.3** | **32.3** | **29.07%** | **0** | **9077s** | **233s** |

### v3 N=3 (timeout 1810s 환경)

| Run | Place | Tiles | Rate | Fallback | Elapsed | Avg resp |
|-----|-------|-------|------|----------|---------|---------|
| 1 | 11 | 32 | 28.2% | 0 | 8332s | 214s |
| 2 | 10 | 26 | 25.6% | 0 | 10924s | 280s |
| 3 | 13 | 30 | 33.3% | 0 | 9388s | 241s |
| **평균** | **11.3** | **29.3** | **29.0%** | **0** | **9548s** | **245s** |

### ⭐ v2 vs v3 최종 판정

| 지표 | v2 N=3 | v3 N=3 | Δ |
|-----|--------|--------|---|
| Place 평균 | 11.3 | 11.3 | **0** |
| Tiles 평균 | 32.3 | 29.3 | +3.0 |
| **Place Rate 평균** | **29.07%** | **29.0%** | **+0.07%p** |
| Fallback | 0 | 0 | 0 |
| 분포 범위 | 25.6~30.8 | 25.6~33.3 | — |

**결론**: **v2 와 v3 는 통계적으로 구분 불가** (Δ=0.07%p). 두 프롬프트가 실질적으로 동일 성능.

- v2 N=3 분포: 25.6 / 30.8 / 30.8 (σ ≈ 3.0%p)
- v3 N=3 분포: 28.2 / 25.6 / 33.3 (σ ≈ 3.9%p)
- 겹치는 범위 큼 → 모두 동일 모집단 가정 가능
- **Day 7 v2 재실측 25.6% 는 하위 꼬리였음** — 60번 문서 가설 (B) 확증

### 실용적 귀결
1. **주력 프롬프트는 v2 유지** (기존 운영 유지, 변경 불필요)
2. **v3 는 v2 의 완벽한 대체재도 아니고 명확한 열위도 아님**
3. 프롬프트만으로 30.8% 천장 돌파 불가 — 구조적 접근 필요 (Task #20 v6)

---

### Snapshot 22 — 2026-04-18 15:02:15 (wake-up #22)

```
Run 3/3 · 경과 155m · 현재 T78/80 (97.5%) 진행 중
AI 턴 집계: place=12(+27 tiles) / draw=26 / fallback=0
응답시간: avg=241s / max=674s (1810s 한도 대비 37%)
프로세스: 생존 (PID 20674) / Pod Running
특이사항: **후반 연속 PLACE 지속** — T60/T62/T66/T70/T72 5회 PLACE. rate 급등
현재 place rate 31.6% (3개 Run 중 가장 높음!)
외삽: 남은 2 AI 턴 × 241s ≈ 8분 → Run 3 완료 ~15:10 매우 임박
다음 wake-up: 15:17 (900s) → Run 3 종료 확정 + 자동 Chain 진입
```

---

## 구간별 통계 + 비용 (Phase 4 사후 정리에서 append)

| Run | 초반(T1-27) | 중반(T28-54) | 후반(T55-80) | 평균 응답 | 최대 응답 | Place | Tiles | Fallback | 비용 |
|-----|-------------|--------------|--------------|----------|----------|-------|-------|----------|------|
| 1 | | | | | | | | | |
| 2 | | | | | | | | | |
| 3 | | | | | | | | | |
| **3회 평균** | | | | | | | | | |

---

## Phase 4 사후 정리 결과

(v3 Run 3 완료 후 append)

- [ ] Redis game:* 0개 재확인
- [ ] 배틀 프로세스 0개
- [ ] 결과 파일 3개 확보
- [ ] DeepSeek 잔액 재확인
- [ ] variant v3 유지 (Step 3 원복 전까지)

---

## 이상 이력

(발생 시 timestamp + 내용 append)
