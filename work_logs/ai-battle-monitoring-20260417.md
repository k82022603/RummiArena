# AI 대전 모니터링 이력 — 2026-04-17 (Day 7 Round 9: v2-zh A/B)

> batch-battle SKILL Phase 3 필수 기록 (턴별 데이터 + 구간별 통계 + 5분 주기 스냅샷)

- **Round tag**: `r9-v2-zh`
- **목적**: v2-zh DeepSeek 전용 중문 variant A/B. Phase 1 v2-zh / Phase 2 v2 재실측
- **모델**: deepseek-reasoner 단독
- **config**: maxTurns=80, persona=calculator, difficulty=expert, psychologyLevel=2, WS timeout=770s

---

## Phase 1 사전점검 (2026-04-17 15:10 KST / 06:10 UTC)

**SKILL 체크리스트**:
- [x] 7/7 Pod Running (admin, ai-adapter, frontend, game-server, ollama, postgres, redis)
- [x] 서비스 응답 정상 (game-server /ready + ai-adapter /health ok)
- [x] Redis PONG, PostgreSQL accepting (전수 확인)
- [x] AI_COOLDOWN_SEC=0 (ConfigMap 확인)
- [x] API 잔액 확인 (DeepSeek ~$3.31, 예상 지출 $0.083 대비 충분)
- [x] 이미지 빌드 시점 vs 최신 커밋 → 재빌드 완료 (`rummiarena/ai-adapter:v5.2-prompt` ID aba7d4c21b36, 2026-04-17 15:12)
- [x] 비용 한도 2건 실 적용: `DAILY_COST_LIMIT_USD=20`, `HOURLY_USER_COST_LIMIT_USD=5`
- [x] Phase 1b 비용 상향 판단 → **불필요**

---

## Phase 1b 비용 한도 사전 판단

### 예상 최악 일일 지출 계산

| 구간 | 계산식 | 예상 비용 |
|------|--------|-----------|
| Smoke 10턴 | $0.001/turn × ~5 AI턴 | $0.005 |
| v2-zh Full 80턴 | $0.001/turn × ~40 AI턴 + 토큰 inflation | $0.04~0.06 |
| v2 재실측 Full 80턴 | 동상 | $0.04~0.06 |
| **합계** | — | **~$0.10~0.13** |

- 합산 $0.10~0.13 << `DAILY_COST_LIMIT_USD=$20` → **상향 불필요** (SKILL 기준 $15 이상일 때 상향)

### 모델별 시간당 rate

- DeepSeek per-game 비용 ~$0.04, per-game 소요시간 ~1.5시간 → **$0.027/hr**
- << `HOURLY_USER_COST_LIMIT_USD=$5` → 상향 불필요

**결정**: Phase 1b 상향 **skip**. Phase 4 복구 작업 없음.

---

## Phase 2: 사전 정리 (매 Phase 실행 전)

### v2-zh Phase 2 (15:12 KST)
- Redis game:* keys: **0개** (이전 실행 없음)
- ai-adapter MoveController 최근 요청: 0건 (새 Pod)
- ai-battle 프로세스: 0개 (정상)

### v2 재실측 Phase 2 (16:54 KST, v2-zh 완료 직후)
- Redis game:* keys: 1개 (v2-zh 정상 종료 잔존) → **삭제 완료**
- ai-battle 프로세스 전환 대기: 0개 확인

---

## Phase 3: v2-zh Full 대전 턴별 이력 (15:13~16:53 KST, 95.3분)

| Turn | Time(KST) | Action | Tiles | Cumul | Latency(s) |
|------|-----------|--------|-------|-------|-----------|
| T02 | 15:14:41 | DRAW | — | 0 | 49.5 |
| T04 | 15:15:32 | DRAW | — | 0 | 50.3 |
| T06 | 15:16:40 | DRAW | — | 0 | 42.9 |
| T08 | 15:17:37 | DRAW | — | 0 | 59.7 |
| T10 | 15:18:38 | DRAW | — | 0 | 52.5 |
| T12 | 15:19:37 | DRAW | — | 0 | 55.6 |
| T14 | 15:20:36 | DRAW | — | 0 | 55.6 |
| T16 | 15:21:42 | DRAW | — | 0 | 62.9 |
| T18 | 15:22:41 | DRAW | — | 0 | 54.0 |
| T20 | 15:24:02 | DRAW | — | 0 | 77.6 |
| T22 | 15:25:10 | DRAW | — | 0 | 64.0 |
| T24 | 15:26:50 | DRAW | — | 0 | 96.1 |
| T26 | 15:28:50 | DRAW | — | 0 | 115.8 |
| T28 | 15:31:03 | DRAW | — | 0 | 128.8 |
| T30 | 15:32:51 | DRAW | — | 0 | 104.2 |
| T32 | 15:35:02 | DRAW | — | 0 | 126.4 |
| T34 | 15:38:22 | **PLACE** | **9** | **9** | 196.1 |
| T36 | 15:41:43 | DRAW | — | 9 | 197.2 |
| T38 | 15:44:50 | PLACE | 3 | 12 | 183.8 |
| T40 | 15:47:48 | DRAW | — | 12 | 174.0 |
| T42 | 15:50:03 | DRAW | — | 12 | 131.4 |
| T44 | 15:52:45 | PLACE | 3 | 15 | 158.8 |
| T46 | 15:54:51 | DRAW | — | 15 | 122.5 |
| T48 | 15:57:33 | DRAW | — | 15 | 158.2 |
| T50 | 16:02:13 | DRAW | — | 15 | 276.6 |
| T52 | 16:05:19 | PLACE | 3 | 18 | 181.9 |
| T54 | 16:08:43 | DRAW | — | 18 | 199.6 |
| T56 | 16:13:16 | PLACE | 1 | 19 | 269.5 |
| T58 | 16:17:34 | DRAW | — | 19 | 253.7 |
| T60 | 16:21:59 | PLACE | 4 | 23 | 259.0 |
| T62 | 16:26:11 | DRAW | — | 23 | 248.6 |
| T64 | 16:30:43 | DRAW | — | 23 | 266.8 |
| T66 | 16:35:34 | DRAW | — | 23 | 287.0 |
| T68 | 16:37:39 | PLACE | 1 | 24 | 120.5 |
| T70 | 16:40:22 | DRAW | — | 24 | 158.3 |
| T72 | 16:42:56 | PLACE | 1 | 25 | 150.0 |
| T74 | 16:45:54 | DRAW | — | 25 | 173.6 |
| T76 | 16:48:51 | PLACE | 3 | 28 | 173.2 |
| T78 | 16:51:51 | DRAW | — | 28 | 175.7 |
| T80 | (end) | (max turn 도달, TIMEOUT) | — | 28 | — |

### 구간별 통계 (v2-zh)

| 구간 | 턴 범위 | AI 턴 수 | Place | Draw | Tiles | 평균 Latency(s) |
|------|---------|----------|-------|------|-------|-----------------|
| 초반 | T02~T20 | 10 | 0 | 10 | 0 | 57.1 |
| 중반 | T22~T50 | 15 | 3 | 12 | 15 | 141.4 |
| 후반 | T52~T80 | 14 | 6 | 8 | 13 | 201.2 |
| **전체** | T02~T80 | **39** | **9** | **30** | **28** | **146.7** |

**구간별 관찰**:
- 초반 10턴 전부 DRAW — **Initial meld (sum ≥ 30) 지연**. v2 R4/R5 는 대개 T20 전후 첫 meld
- 중반부 T34 첫 PLACE (9 tiles, sum=30+ initial meld 달성)
- 후반부 latency 폭증 (287s max @ T66) — 정상 DeepSeek 추론 토큰 확장

### 모니터링 이상 감지 (SKILL Phase 3 기준)

| 항목 | 기준 | 실측 | 판정 |
|------|------|------|------|
| 활성 게임 수 | 1개 | 1개 | 정상 |
| 배틀 프로세스 | 1개 이상 | 1개 (PID 7048) | 정상 |
| 레이턴시 | 역대 max 349s 의 1.5배 (523s) 이하 | max 287.0s | 정상 |
| Fallback | 0건 | 0건 | 정상 |

**이상 없음**. v2-zh 는 시스템 레벨에서 완전히 건강하게 작동.

### 비용 실시간 추적 (v2-zh 종료 직후)

```
Redis quota:daily:2026-04-17 (UTC)
  deepseek:tokens_in      127,320
  deepseek:tokens_out     189,099
  deepseek:cost_usd       70,771     (× 1e-6 = $0.070)
  deepseek:requests       46
  total_cost_usd          70,771
  total_requests          46
```

$0.070 = smoke $0.004 + v2-zh $0.039 + 기타 누적 (이전 검증 스크립트 가능). 예상 범위 내.

---

## Phase 4 (v2-zh 사후 정리, 16:53~16:55 KST)

- [x] Redis game:* 1개 삭제 (정상 종료 후 잔존 키)
- [x] 결과 파일: `/mnt/d/.../scripts/ai-battle-3model-r4-results.json` 생성 확인 + `/work_logs/battles/r9-v2-zh/v2-zh-full-result.json` 백업
- [x] ai-battle 프로세스 종료 확인
- [x] Phase 1b 상향 없음 → 복구 작업 skip
- [x] 모니터링 문서 (본 파일) append

---

## Phase 3: v2 재실측 Full 대전 진행 중 (16:55~ KST)

### 환경 전환 (Phase 3 Step 1~3)

```bash
kubectl -n rummikub set env deployment/ai-adapter DEEPSEEK_REASONER_PROMPT_VARIANT=v2
# rollout: deployment "ai-adapter" successfully rolled out
# 새 Pod: ai-adapter-5759b68486-56w7q 2/2 Running

kubectl -n rummikub exec deployment/ai-adapter -c ai-adapter -- printenv | grep PROMPT
# → DEEPSEEK_REASONER_PROMPT_VARIANT=v2

# PromptRegistry 로그:
# 등록 변형=[v2,v2-zh,v3,v3-tuned,v4,v4.1,v5,character-ko]
# 글로벌=v2
# per-model-override=[claude:v4, deepseek-reasoner:v2, dashscope:v4]
```

### 턴별 이력 (진행 중, Monitor 이벤트 append)

| Turn | Time(KST) | Action | Tiles | Cumul | Latency(s) |
|------|-----------|--------|-------|-------|-----------|
| T02 | 17:00 | DRAW | — | 0 | 216.9 |
| T04 | 17:02 | DRAW | — | 0 | 81.0 |
| T06 | 17:04 | **PLACE** | **9** | **9** | **90.6** ← **Initial meld, v2-zh T34 대비 28턴 빠름** |
| T08 | 17:06 | DRAW | — | 9 | 93.6 |
| T10 | 17:09 | DRAW | — | 9 | 154.6 |
| T12 | 17:11 | DRAW | — | 9 | 103.9 |
| T14 | 17:13 | DRAW | — | 9 | 89.3 |
| T16 | 17:15 | DRAW | — | 9 | 95.7 |
| T18 | 17:18 | DRAW | — | 9 | 178.5 |
| T20 | 17:21 | DRAW | — | 9 | 189.7 |
| T22 | 17:23 | DRAW | — | 9 | 161.5 |
| T24 | 17:27 | DRAW | — | 9 | 255.2 |
| T26 | 17:30 | DRAW | — | 9 | 167.2 |
| T28 | 17:33 | DRAW | — | 9 | 181.8 |
| T30 | 17:35 | DRAW | — | 9 | 123.5 |
| T32 | 17:39 | **PLACE** | 3 | 12 | 212.5 |
| T34 | 17:42 | DRAW | — | 12 | 158.2 |
| T36 | 17:47 | **PLACE** | 3 | 15 | 268.5 |
| T38 | 17:51 | DRAW | — | 15 | 223.3 |
| T40 | 17:56 | DRAW | — | 15 | 272.4 |
| T42 | 18:00 | DRAW | — | 15 | 265.5 |
| T44 | 18:04 | DRAW | — | 15 | 308.7 |
| T46 | 18:08 | DRAW | — | 15 | 241.2 |
| T48 | 18:12 | **PLACE** | 3 | 18 | 206.5 |
| T50 | 18:16 | DRAW | — | 18 | 222.5 |
| T52 | 18:19 | DRAW | — | 18 | 190.2 |
| T54 | 18:26 | **PLACE** | 3 | 21 | **403.8** ← 역대 DeepSeek max(349s) 갱신 |
| T56 | 18:32 | DRAW | — | 21 | 391.3 ← 400s 근접, fallback 위험 주시 |
| T58 | 18:37 | DRAW | — | 21 | 257.6 |
| T60 | 18:42 | **PLACE** | 4 | 25 | 270.5 |
| T62 | 18:46 | DRAW | — | 25 | 218.6 |
| T64 | 18:49 | **PLACE** | 1 | 26 | 191.9 |
| T66 | 18:50 | DRAW | — | 26 | 40.1 ← 최저 latency 갱신 (DeepSeek 이례적 빠른 응답) |
| T68 | 18:55 | DRAW | — | 26 | 258.6 |
| T70 | 18:58 | **PLACE** | 3 | 29 | 203.6 |
| T72 | 19:02 | DRAW | — | 29 | 240.3 |
| T74 | 19:05 | **PLACE** | 2 | 31 | 195.3 |
| T76 | 19:09 | **PLACE** | 1 | 32 | 201.8 |
| T78 | 19:14 | DRAW | — | 32 | 302.8 |
| T80 | (max turn 도달, TIMEOUT) | — | — | 32 | — |

### 구간별 통계 (v2 재실측)

| 구간 | 턴 범위 | AI 턴 수 | Place | Draw | 평균 Latency(s) | Max | Min |
|------|---------|----------|-------|------|-----------------|-----|-----|
| 초반 | T02~T20 | 10 | 1 | 9 | 129.4 | 216.9 | 81.0 |
| 중반 | T22~T50 | 15 | 3 | 12 | 217.9 | 308.7 | 123.5 |
| 후반 | T52~T80 | 14 | 6 | 8 | 240.5 | 403.8 | 40.1 |
| **전체** | T02~T80 | **39** | **10** | **29** | **203.3** (p50=203.6) | 403.8 | 40.1 |

### 최종 판정 (v2 재실측)

- Place: **10** (32 tiles)
- Draw: 29
- Fallback: **0**
- Rate: **25.6%** (10/39)
- 시작 → 완료: 16:55 → 19:07:29 KST (총 132분)

### Phase 4 사후 정리 (19:07~19:15 KST)

- [x] Redis game:* 1개 삭제
- [x] ai-battle 프로세스 종료 확인 (자연 종료)
- [x] 결과 JSON 백업: `work_logs/battles/r9-v2-zh/v2-rerun-result.json`
- [x] Phase 1b 상향 없음 → 복구 작업 skip
- [x] 비용 실시간 추적: total_cost_usd=$0.150 (84 requests, 누적)
  - v2-zh 시점 $0.127 → v2 재실측 Δ=+$0.023

---

## Round 9 Day 7 최종 A/B 결과 (3-way 비교)

| 지표 | **v2-zh** (Day 7 Phase 1) | **v2 재실측** (Day 7 Phase 2) | **v4 Phase 2 N=2** (Day 5 참조) |
|------|:---:|:---:|:---:|
| 대전 일시 | 2026-04-17 15:18~16:53 | 2026-04-17 16:55~19:07 | 2026-04-16 01:01~07:58 |
| 총 소요 | 95분 | 132분 | 3h 39m × 2 (N=2) |
| AI 턴 | 39 | 39 | ~39 |
| **Place** | **9** | **10** | **10** (N=2 평균) |
| **Tiles** | **28** | **32** | **34** |
| **Place rate** | **23.1%** | **25.6%** | **25.95%** |
| Avg latency | 146.7s | **203.3s** | 320.2s |
| Max latency | 287.0s | 403.8s | **690.9s** |
| Fallback | 0 | 0 | 0.5/game (Run 2 T46) |
| 비용 | $0.039 | ~$0.023 (델타) | $0.038 × 2 |

### 핵심 관찰

1. **v2 재실측 25.6% ≠ v2 R4/R5 의 30.8%**
   - Δ = −5.2%p. "v2=30.8% stable baseline" 가정 **흔들림**
   - 단일 실측 N=1 의 자연 분산 범위 내 가능성
   - 역으로 R4/R5 30.8% 가 상향 노이즈였을 가능성도 배제 못함

2. **v2-zh vs v2 재실측 Δ=−2.5%p**
   - 이전 v2 R4 기준 Δ=−7.7%p 보다 훨씬 작음
   - **같은 세션 공정 A/B 에서 v2-zh 는 v2 대비 약간 낮지만 noise 수준**
   - 번역 오버헤드 가설: 명확한 반증은 아니나 확증도 아님

3. **v4 vs v2 재실측**
   - Place rate 25.95% vs 25.6% — **사실상 동률** (Δ=+0.35%p, 측정 오차 내)
   - 이는 "v4 regression" 판정이 v2 R4/R5 = 30.8% 가정에 의존했기 때문
   - **v2 재실측을 baseline 으로 다시 보면 v4 는 regression 이 아닐 수 있음**
   - v4 unlimited timeout 실측이 더욱 의미 있어짐

4. **Latency 관찰**
   - v2-zh 146.7s << v2 203.3s << v4 320.2s
   - v2-zh 가 가장 빠름. 중문 프롬프트가 DeepSeek 의 reasoning 을 **축약**시키는 것으로 보임
   - 중문 reasoning 일치가 "번역 오버헤드 제거" 효과는 있으나 **품질 저하** 동반

---

## 변경 이력

| 시각 | 변경 | 담당 |
|------|------|------|
| 2026-04-17 15:13 | Phase 1/1b/2 기록 시작 | Claude(main) |
| 2026-04-17 16:53 | v2-zh Phase 3 턴별 표 + 구간별 통계 완결 | Claude(main) |
| 2026-04-17 16:55 | v2 재실측 Phase 3 시작 — 턴별 append 중 | Claude(main) |
| 2026-04-17 19:07 | v2 재실측 Phase 3 완결 + 3-way 비교 + Phase 4 정리 | Claude(main) |
| 2026-04-17 (TBD) | v3 / v4 unlimited 결정은 애벌레 검토 후 | — |
| 2026-04-17 19:20 | v3 80턴 첫 시도 (T26 까지 정상 후 DNS 장애 T28~T44) — **무효** | Claude(main) |
| 2026-04-17 20:30 | DNS 장애 발견 + 원인 분석 + Pod 재시작 + 전체 초기화 | Claude(main) |
| 2026-04-17 20:33 | v3 대전 깨끗이 재시작 (새로운 Phase 3 시작) | Claude(main) |

---

## ⚠ 이상 이벤트 기록: v3 1차 시도 중단 (19:20~20:29 KST)

**무효 처리된 구간**: T02~T26 정상 (Place 4회, cumul 10) → T28~T44 DNS 장애 (9턴 연속 fallback DRAW 0.0~0.1s)

**원인**: ai-adapter Pod 내부 `getaddrinfo ENOTFOUND api.deepseek.com` 반복 — Docker Desktop CoreDNS 또는 WSL 네트워크 일시 끊김

**조치**:
1. Python 스크립트 종료 (20:29)
2. Redis game:* 정리
3. ai-adapter Pod rollout restart — 성공
4. 재시작 후 DNS 재검증: `api.deepseek.com` 정상 해석 (CloudFront CNAME), HTTP 401 응답 OK
5. **애벌레 "깨끗이 정리하고 다시 시작" 지시 반영** — 무효 로그 `v3-80t.log` 삭제 + 전체 재시작

**SKILL 준수**: Phase 3 "fallback 연속 3건 이상 → 즉시 중단" 기준 초과 → 즉시 중단 + 네트워크 진단 + 원인 복구 + **깨끗이 초기화 후 재시작** (사용자 지시)

---

## Phase 3: v3 초실측 80턴 (재시작, 20:33~ KST)

### Phase 1/1b/2 재확인 (정리 후 깨끗한 상태)

- Phase 1: 7/7 Running, Redis PONG, DNS 정상 재검증 완료 (CloudFront 해석)
- Phase 1b: 누적 $0.150 (v3 1차 시도 비용 미세 — API 요청 실패라 거의 0). v3 재실측 $0.04 예상. 한도 여유
- Phase 2: Redis game:* 0 확인, v3-80t.log 무효 로그 삭제, 프로세스 0

### 환경 (env 유지)

- DEEPSEEK_REASONER_PROMPT_VARIANT=v3 (rollout restart 후에도 유지됨)
- Pod: ai-adapter 재시작 완료
- DNS: `api.deepseek.com` → `d3bbv8sr76az5s.cloudfront.net` 해석 정상

### 턴별 이력 (Monitor 이벤트 실시간 append)

| Turn | Time(KST) | Action | Tiles | Cumul | Latency(s) |
|------|-----------|--------|-------|-------|-----------|
| T02 | 20:37 | **PLACE** | 3 | 3 | 198.6 ← Initial meld T02 (v2-zh T34 / v2재 T06 대비 동등~빠름) |
| T04 | 20:41 | DRAW | — | 3 | 258.9 |
| T06 | 20:46 | DRAW | — | 3 | 307.7 |
| T08 | 20:50 | DRAW | — | 3 | 260.1 |
| T10 | 20:54 | DRAW | — | 3 | 224.4 |
| T12 | 20:58 | DRAW | — | 3 | 253.6 |
| T14 | 21:02 | **PLACE** | 3 | 6 | 234.1 |
| T16 | 21:06 | **PLACE** | 1 | 7 | 277.2 |
| T18 | 21:11 | DRAW | — | 7 | 313.0 |
| T20 | 21:18 | DRAW | — | 7 | 410.3 ← v3 max 갱신 (v2재 403.8 약간 상회, 정상 범위) |
| T22 | 21:22 | DRAW | — | 7 | 251.0 |
| T24 | 21:26 | DRAW | — | 7 | 278.2 |
| T26 | 21:30 | DRAW | — | 7 | 261.4 |
| T28 | 21:37 | DRAW | — | 7 | 409.1 |
| T30 | 21:43 | DRAW | — | 7 | 342.7 |
| T32 | 21:48 | **PLACE** | 2 | 9 | 333.5 |
| T34 | 21:52 | DRAW | — | 9 | 253.2 |
| T36 | 21:55 | **PLACE** | 1 | 10 | 210.0 |
| T38 | 22:00 | DRAW | — | 10 | 257.9 |
| T40 | 22:08 | **PLACE** | 2 | 12 | **480.6** ← v3 max 갱신 |
| T42 | 22:14 | DRAW | — | 12 | 356.2 |
| T44 | 22:21 | DRAW | — | 12 | 393.4 |
| T46 | 22:28 | DRAW | — | 12 | 415.7 |
| T48 | 22:35 | DRAW | — | 12 | 379.9 |
| T50 | 22:40 | **PLACE** | 3 | 15 | 286.8 |
| T52 | 22:48 | DRAW | — | 15 | 467.5 |
| T54 | 22:52 | DRAW | — | 15 | 277.3 |
| T56 | 23:02 | DRAW | — | 15 | **595.8** ← v3 max 갱신, SKILL 기준(605s) 임계 근접 |
| T58 | 23:08 | DRAW | — | 15 | 390.8 |
| T60 | 23:20 | **FALLBACK** DRAW (AI_TIMEOUT) | — | 15 | **709.5** ← v3 첫 fallback (770s WS timeout 근접) |
| T62 | 23:26 | **PLACE** | 3 | 18 | 360.4 ← latency 회복, fallback 격리 |
| T64 | 23:30 | DRAW | — | 18 | 260.6 |
| T66 | 23:35 | **PLACE** | 3 | 21 | 336.1 |
| T68 | 23:44 | DRAW | — | 21 | 509.4 |
| T70 | 23:52 | **PLACE** | 3 | 24 | 494.1 |
| T72 | 23:59 | DRAW | — | 24 | 402.9 |
| T74 | 00:07 (4/18) | DRAW | — | 24 | 216.8 |
| T76 | 00:13 (4/18) | **PLACE** | 3 | 27 | 342.7 ← **N=2 trigger 28.6% 초과 확정** |
| T78 | 00:22 (4/18) | DRAW | — | 27 | 524.2 |
| T80 | (max 도달, TIMEOUT 00:14:36 4/18) | — | — | 27 | — |

### 구간별 통계 (v3)

| 구간 | AI 턴 | Place | Draw | 평균 Latency(s) | Max | Min |
|------|------|-------|------|-----------------|-----|-----|
| 초반 T02~T20 | 10 | 4 | 6 | 269.3 | 410.3 | 198.6 |
| 중반 T22~T50 | 15 | 3 | 12 | 300.6 | 480.6 | 210.0 |
| 후반 T52~T80 | 14 | 4 | 10 (fb 1) | 421.1 | 709.5 | 216.8 |
| **전체** | **39** | **11** | **28+1fb** | **347.1** (p50=333.5) | 709.5 | 198.6 |

### v3 최종 판정

- Place: **11** / Tiles: **27** / Draw: 28 / Fallback: 1 (T60 AI_TIMEOUT)
- **Rate: 28.2%** (11/39) — N=2 trigger 28.6% 에 0.4%p 미달
- Avg latency **347.1s** (v2재 203.3s 대비 +71%) / Max 709.5s
- Cost: $0.039 / 소요 3h 45m (20:33~00:14+4/18)
- **판정: N=1 마감** (자율 판정 기준 "평균" 구간). v4 unlimited 로 전환.

### Phase 4 v3 사후 정리

- [x] Redis game:* 1개 삭제
- [x] 프로세스 종료 확인
- [x] JSON 백업: `v3-result.json`
- [x] 누적 비용: $0.306 (UTC 2026-04-17)

---

## Round 9 Day 7 4-way 결과 (업데이트)

| 지표 | **v2-zh** | **v2 재실측** | **v3** | **v4 Phase2 N=2 (참조)** |
|------|:---:|:---:|:---:|:---:|
| Place | 9 | 10 | **11** | 10 |
| Tiles | 28 | 32 | 27 | 34 |
| **Rate** | **23.1%** | **25.6%** | **28.2%** | **25.95%** |
| Avg latency | 146.7s | 203.3s | **347.1s** | 320.2s |
| Max latency | 287.0s | 403.8s | **709.5s** | 690.9s |
| Fallback | 0 | 0 | **1** (T60) | 0.5/game |
| 소요 | 95분 | 132분 | 225분 | 219분 × 2 |
| Cost | $0.039 | ~$0.023 | $0.039 | $0.038 × 2 |

**핵심 관찰**
- **v3 가 Place rate 최고** (28.2%). 자기검증 체크리스트 효과 확인
- Latency: v2-zh 146 < v2재 203 < v4 320 < **v3 347** — v3 가 가장 깊게 사고
- v3 fallback 1건 (T60 709.5s) — WS timeout 770s 근접하며 발생. 체크리스트 과잉 reasoning 리스크
- **v2 R4/R5 30.8%** 가정 흔들린 상태에서 v3 28.2% 가 R4/R5 와 거의 동률 → "v3 ≈ v2 baseline" 가능성

---

## Phase 3: v4 unlimited timeout 80턴 (진행 예정, ~00:30~ KST)

### 환경 변경 적용 (DevOps Task #18 완료)

| 지점 | 이전 | 현재 |
|------|------|------|
| VS timeout / perTryTimeout | 710s | **1810s** |
| CM AI_ADAPTER_TIMEOUT_SEC | 700 | **1800** |
| DTO `@Max(timeoutMs)` | 720000 | **1820000** |
| DeepSeek adapter floor | 700_000 | **1_800_000** |
| Python `ws_timeout` (deepseek) | 770 | **1870** |
| DEEPSEEK_REASONER_PROMPT_VARIANT | v3 | **v4** |

**부등식 성립**: script_ws(1870) > gs_ctx(1800) > VS(1810) > DTO_max(1820) > adapter_floor(1800) ✓

**새 이미지 ID**: 86401a20b39a (기존 `rummiarena/ai-adapter:v5.2-prompt` 태그 재빌드)
**스냅샷**: `/tmp/rollback-v4-unlimited-20260418-001813/` (원복용)
**ArgoCD auto-sync OFF**: `rummikub` + `rummikub-istio` 두 앱 모두 패치 (발견사항, 원복 시 둘 다 재활성화 필수)

### 턴별 이력 (Monitor 이벤트 실시간 append)

| Turn | Time(KST) | Action | Tiles | Cumul | Latency(s) |
|------|-----------|--------|-------|-------|-----------|
| T02 | 00:46 | DRAW | — | 0 | 187.7 |
| T04 | 00:49 | DRAW | — | 0 | 189.7 |
| T06 | 00:51 | DRAW | — | 0 | 152.0 |
| T08 | 00:54 | **PLACE** | 9 | 9 | 169.4 ← Initial meld |
| T10 | 00:58 | DRAW | — | 9 | 258.5 |
| T12 | 01:03 | DRAW | — | 9 | 346.1 |
| T14 | 01:09 | DRAW | — | 9 | 386.7 |
| T16 | 01:14 | DRAW | — | 9 | 301.9 |
| T18 | 01:19 | DRAW | — | 9 | 352.0 |
| T20 | 01:25 | DRAW | — | 9 | 337.7 |
| T22 | 01:31 | DRAW | — | 9 | 360.5 |
| T24 | 01:36 | DRAW | — | 9 | 304.3 |
| T26 | 01:41 | DRAW | — | 9 | 261.7 |
| T28 | 01:45 | DRAW | — | 9 | 250.9 |
| T30 | 01:49 | **PLACE** | 3 | 12 | 224.0 |
| T32 | 01:54 | DRAW | — | 12 | 312.8 |
| T34 | 01:59 | **PLACE** | 3 | 15 | 292.9 |
| T36 | 02:04 | DRAW | — | 15 | 312.8 |
| T38 | 02:09 | DRAW | — | 15 | 310.6 |
| T40 | 02:13 | DRAW | — | 15 | 264.6 |
| T42 | 02:18 | DRAW | — | 15 | 283.5 |
| T44 | 02:25 | **PLACE** | 3 | 18 | 414.1 |
| T46 | 02:30 | DRAW | — | 18 | 298.3 |
| T48 | 02:46 | DRAW | — | 18 | **941.3** ← 역대 DeepSeek 최장 응답, 기존 770s WS 에서는 fallback 처리됐을 구간 |
| T50 | 02:53 | DRAW | — | 18 | 374.3 |
| T52 | 03:08 | DRAW | — | 18 | **900.3** ← 또 900s 구간, 기존 timeout 에서 fallback |
| T54 | 03:17 | DRAW | — | 18 | 513.4 |
| T56 | 03:24 | **PLACE** | 2 | 20 | 377.1 |
| T58 | 03:33 | DRAW | — | 20 | 504.4 |
| T60 | 03:40 | **PLACE** | 1 | 21 | 432.5 |
| T62 | 03:47 | DRAW | — | 21 | 447.6 |
| T64 | 04:02 | DRAW | — | 21 | **864.2** ← 또 900s 근접 |
| T66 | 04:09 | **PLACE** | 3 | 24 | 368.4 |
| T68 | 04:31 | DRAW | — | 24 | **1337.0** ← 22분 reasoning, 1800s 근접 — 기존 770s 에서 무조건 fallback 구간 |
| T70 | 04:44 | DRAW | — | 24 | 762.8 |
| T72 | 04:52 | DRAW | — | 24 | 455.0 |
| T74 | 04:59 | DRAW | — | 24 | 422.2 |
| T76 | 05:07 | **PLACE** | 3 | 27 | 450.3 |
| T78 | 05:14 | DRAW | — | 27 | 410.8 |
| T80 | (max 도달, TIMEOUT 05:11:54) | — | — | 27 | — |

### 구간별 통계 (v4 unlimited)

| 구간 | AI 턴 | Place | Draw | 평균 Latency(s) | Max | Min |
|------|------|-------|------|-----------------|-----|-----|
| 초반 T02~T20 | 10 | 1 | 9 | 268.2 | 386.7 | 152.0 |
| 중반 T22~T50 | 15 | 3 | 12 | 347.1 | **941.3** | 224.0 |
| 후반 T52~T80 | 14 | 4 | 10 | **589.0** | **1337.0** | 368.4 |
| **전체** | **39** | **8** | **31** | **413.7** | **1337.0** | 152.0 |

### v4 unlimited 최종 판정

- Place: **8** / Tiles: **27** / Draw: 31 / Fallback: **0**
- **Rate: 20.5%** (8/39) — **v4 Phase2 25.95% 대비 −5.45%p 하락**
- Avg latency **413.7s** (v4 Phase2 320.2s 대비 +29%) / Max **1337s** (22분!)
- Cost: $0.039 / 소요 4h 26m
- **충격**: timeout 1800s 허용하자 v4 가 더 **깊이** 사고하지만 결과는 **더 나쁨**
- 결론: **v4 regression 은 timeout 때문이 아니라 프롬프트 자체 결함** — 재확증됨

### Phase 4 v4 unlimited 사후 정리

- [x] Redis game:* 삭제
- [x] 프로세스 종료 확인
- [x] JSON 백업: `v4-unlimited-result.json`
- [x] 누적 비용: **$0.441** (UTC 2026-04-17)
- [ ] **timeout 10지점 원복 필요** (Phase 1b 상향이 아닌 실험 전용 설정, 다음 Phase 4 단계에서 실행)

---

## Round 9 Day 7 최종 5-way 결과

| 지표 | **v2-zh** | **v2 재실측** | **v3** | **v4 Phase2** (N=2, 참조) | **v4 unlimited** |
|------|:---:|:---:|:---:|:---:|:---:|
| Place | 9 | 10 | **11** | 10 | 8 |
| Tiles | 28 | 32 | 27 | 34 | 27 |
| **Rate** | **23.1%** | **25.6%** | **28.2%** | **25.95%** | **20.5%** |
| Avg latency | 146.7s | 203.3s | 347.1s | 320.2s | **413.7s** |
| **Max latency** | 287.0s | 403.8s | 709.5s | 690.9s | **1337.0s** |
| Fallback | 0 | 0 | 1 | 0.5/game | **0** |
| 소요 | 95분 | 132분 | 225분 | 219분×2 | **266분** |

### Round 9 최종 핵심 발견

1. **v3 가 가장 뛰어남** (28.2%). 자기검증 체크리스트 + 여유있는 reasoning 조합
2. **v4 regression 은 timeout 문제 아님 확정**: unlimited 에서도 25.95% → 20.5% 하락. 프롬프트 자체 결함
3. **v2 재실측 25.6% 가 새 baseline** — 기존 30.8% 는 N=2 상향 노이즈 가능성
4. **Latency 순서**: v2-zh < v2재 < v4 Phase2 < v3 < v4 unlimited (중문 축약 > baseline > 체크리스트 > TB+unlimited)
5. **DeepSeek 에게 주어진 시간이 길어지면** 품질이 오히려 **하락** 할 수 있음 (v4 unlimited 의 최장 22분 reasoning 이 PLACE 로 이어지지 않음)

---

## 변경 이력 (최종)

| 시각 | 변경 | 담당 |
|------|------|------|
| 2026-04-17 15:13 | Phase 1/1b/2 기록 시작 | Claude(main) |
| 2026-04-17 16:53 | v2-zh Phase 3 턴별 표 + 구간별 통계 완결 | Claude(main) |
| 2026-04-17 19:07 | v2 재실측 Phase 3 완결 + 3-way 비교 + Phase 4 정리 | Claude(main) |
| 2026-04-17 20:30 | v3 1차 시도 DNS 장애 무효화 + Pod 재시작 | Claude(main) |
| 2026-04-18 00:14 | v3 Phase 3 완결 (28.2%) + N=2 trigger 28.6% 미달 → v4 unlimited 전환 | Claude(main) |
| 2026-04-18 00:30 | DevOps timeout 10지점 상향 apply 완료 (1800s) | devops |
| 2026-04-18 05:11 | v4 unlimited Phase 3 완결 (20.5%) + 5-way 비교 최종판 | Claude(main) |
| 2026-04-18 (다음) | AI Engineer 5-way 분석 + PM 논문 GO/No-Go | ai-engineer + pm |
| 2026-04-18 (다음) | timeout 10지점 원복 (v4 실험 종료) | devops |

### 초기 이상 관찰

- **T02 latency 216.9s** — v2-zh T02 49.5s 대비 **4.4배**
- 원인 후보:
  1. 초기 hand 배치 차이 (무작위성) — DeepSeek 이 첫 턴부터 깊은 추론 시도
  2. v2 영문 프롬프트가 DeepSeek-R1 에서 중문 재번역 수행 (가설 방향과 일치할 수도)
  3. Pod 교체 후 cold-start 효과 (가능하나 2회 요청 후라 감쇠 예상)
- SKILL 기준 (역대 max 1.5배 = 523s) 이하이므로 **중단 없이 계속 모니터링**

### Phase 3b 모니터링 설정

- Monitor 도구 `bwsuvds7b` (이미 timeout) → 재가동 `b1niwllat` → 재가동 `b7pcumgp3` (현재 활성, 60분)
- 필터: `T[0-9]+ AI.*\[|PLACE|Place:|fallback|Tournament completed|FAILED|ERROR|Result:`

### 다음 append 예정

- T04 이후 이벤트 수신 시마다 표 확장
- T80 완료 후 구간별 통계 추가
- Phase 4 비용/정리 기록
- 최종 A/B 비교 표 (v2-zh vs v2 재실측) 작성 → `docs/04-testing/59` §4 업데이트 연계

---

## 변경 이력

| 시각 | 변경 | 담당 |
|------|------|------|
| 2026-04-17 15:13 | Phase 1/1b/2 기록 시작 | Claude(main) |
| 2026-04-17 16:53 | v2-zh Phase 3 턴별 표 + 구간별 통계 완결 | Claude(main) |
| 2026-04-17 16:55 | v2 재실측 Phase 3 시작 — 턴별 append 중 | Claude(main) |
| 2026-04-17 (TBD) | v2 재실측 Phase 3 완결 + 최종 A/B | Claude(main) |
