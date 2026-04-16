# v5 Smoke Test 결과 — Round 8 준비

- 일자: 2026-04-17 (Sprint 6 Day 6)
- 모델: DeepSeek Reasoner (deepseek-reasoner)
- Variant: v5 → v5.1 (zero-shot, ~355 tokens)
- 환경: `DEEPSEEK_REASONER_PROMPT_VARIANT=v5`

---

## 1. Smoke Test #1 — 10턴, v5.0 (16:39~16:45)

| 지표 | 결과 |
|------|:---:|
| Place | 0 (0 tiles) |
| Draw | 4 |
| Fallback | **0** |
| Rate | 0.0% |
| Turns | 10 (AI 5턴) |
| Time | 392.4s |
| Cost | $0.004 |
| Avg response | 97.8s |
| Max response | 108.1s |

**판정**: JSON 파싱 OK, 0 fallback. 단 place 0 — AI 턴 5회로 Initial Meld (sum>=30) 달성 전 종료.

---

## 2. Smoke Test #2 — 30턴, v5.0 (16:47~17:15)

| 지표 | 결과 | v2 참고 (80턴) |
|------|:---:|:---:|
| Place | **4** (13 tiles) | ~12 (37 tiles) |
| Draw | 10 | — |
| Fallback | **3** (INVALID_MOVE) | 0 |
| Rate | **28.6%** | 30.8% |
| Turns | 30 (AI 15턴) | 80 |
| Time | 1,655.2s | ~8,237s |
| Cost | $0.014 | ~$0.04 |
| Avg response | **118.1s** | 211s |
| Max response | **269.8s** | 356s |

### Place Details

| 턴 | Tiles | 누적 | 응답(s) |
|:---:|:---:|:---:|:---:|
| T02 | 6 | 6 | 204.0 |
| T08 | 3 | 9 | 129.7 |
| T12 | 3 | 12 | 189.5 |
| T22 | 1 | 13 | 129.6 |

### Fallback 원인 분석

3건 모두 동일 패턴:

```
T10: "랙에 타일 Y13a이(가) 없습니다" (INVALID_MOVE → force draw)
T14: "랙에 타일 Y10b이(가) 없습니다" (INVALID_MOVE → force draw)
T24: "랙에 타일 Y9a이(가) 없습니다"  (INVALID_MOVE → force draw)
```

**근본 원인**: 모델이 자기 랙에 없는 타일을 `tilesFromRack`에 포함.
v2에서는 Validation Checklist 항목 4가 이를 방어했으나, v5 zero-shot에서 제거됨.

**v5.1 패치**: 시스템 프롬프트의 tilesFromRack 설명을 강화:
```
- before: tilesFromRack = only tiles you placed from your rack (not table tiles).
- after:  tilesFromRack = ONLY tiles from "My Rack Tiles" below. Using any tile not in your rack → rejected.
```

Nature 원칙 범위 내 (규칙 명확화, 메타인지 지시 아님). 토큰 증가: +5 tokens.

---

## 3. Smoke Test #3 — 30턴, v5.1 (17:23~18:25)

| 지표 | 결과 | v5.0 (#2) | v2 참고 |
|------|:---:|:---:|:---:|
| Place | **4** (13 tiles) | 4 (13 tiles) | ~12 |
| Draw | 10 | 10 | — |
| Fallback | **0** | 3 | 0 |
| Rate | **28.6%** | 28.6% | 30.8% |
| Turns | 30 | 30 | 80 |
| Time | 3,683.8s | 1,655.2s | ~8,237s |
| Cost | $0.014 | $0.014 | ~$0.04 |
| Avg response | 263.1s | 118.1s | 211s |
| Max response | 445.7s | 269.8s | 356s |

### Place Details

| 턴 | Tiles | 누적 | 응답(s) |
|:---:|:---:|:---:|:---:|
| T08 | 4 | 4 | 236.7 |
| T12 | 3 | 7 | 306.9 |
| T24 | 3 | 10 | 214.2 |
| T28 | 3 | 13 | 185.9 |

### v5.1 패치 효과 확정

| 지표 | v5.0 (#2) | v5.1 (#3) | 변화 |
|------|:---:|:---:|:---:|
| **Fallback** | **3** | **0** | **-3 (완전 제거)** |
| Place rate | 28.6% | 28.6% | 동등 |
| Tiles placed | 13 | 13 | 동등 |

tilesFromRack 한 줄 강화(+5 tokens)로 INVALID_MOVE fallback 3건 완전 제거. Place rate/tiles 동등 유지.

응답시간 차이(avg 118s → 263s)는 **랜덤 핸드 차이**. #2는 T02에서 즉시 6-tile meld 달성, #3은 T08까지 Initial Meld 미달성 → 더 오래 탐색.

---

## 4. v5.0 → v5.1 3회 Smoke 종합

| 지표 | #1 (10턴) | #2 (30턴, v5.0) | #3 (30턴, v5.1) |
|------|:---:|:---:|:---:|
| Place rate | 0% | 28.6% | 28.6% |
| Fallback | 0 | 3 | **0** |
| Avg resp | 97.8s | 118.1s | 263.1s |
| Cost | $0.004 | $0.014 | $0.014 |

**총 비용**: $0.032 (3회 smoke 합계)

---

## 5. 판정

v5.1 **Smoke PASS**:
- [x] Fallback 0
- [x] JSON 파싱 정상
- [x] Place rate 28.6% (v2 30.8%에 근접)
- [x] tilesFromRack 패치 효과 확정

---

## 6. Round 8 본 대전 — DeepSeek v5.1, 80턴 (18:30~20:34)

| 지표 | **v5.1 (R8)** | v2 (R5 Run 3) | v4 (R6 avg) | v4.1 (R7) |
|------|:---:|:---:|:---:|:---:|
| **Place rate** | **20.5%** | **30.8%** | 25.95% | 20.5% |
| Place count | 8 | ~12 | 10 | 8 |
| Tiles placed | 20 | ~37 | 34 | 30 |
| **Fallback** | **0** | 0 | 0.5/game | 1 |
| Avg response | **189.6s** | 211s | 320s | 272s |
| Max response | 459.8s | 356s | 691s | 711s |
| Time | 7,394s (2h 3m) | ~8,237s | ~12,487s | 10,606s |
| Cost | $0.039 | ~$0.04 | ~$0.039 | $0.039 |

### Place Details (8회)

| 턴 | Tiles | 누적 | 응답(s) |
|:---:|:---:|:---:|:---:|
| T10 | 4 | 4 | 176.7 |
| T24 | 3 | 7 | 156.3 |
| T30 | 2 | 9 | 280.5 |
| T34 | 3 | 12 | 225.5 |
| T40 | 3 | 15 | 459.8 |
| T46 | 1 | 16 | 327.1 |
| T52 | 3 | 19 | 139.7 |
| T60 | 1 | 20 | 195.9 |

### 특이사항

- T64~T80 (9 AI턴) 전부 0.0~0.1s draw — **draw pile 고갈**. 실질 사고 턴 30/39.
- 실질 place rate (T02~T62, 사고 턴만): 8/30 = **26.7%**
- **Fallback 0** — v5.1 패치(tilesFromRack 강화) 80턴에서도 유효

### 전체 variant 순위 확정

```
v2 (30.8%) > v4 (25.95%) > v5.1 (20.5%) = v4.1 (20.5%)
```

v5 zero-shot(Nature 논문 원칙)은 fallback 0 + 속도 개선을 달성했으나, **v2의 few-shot 5개가 DeepSeek의 규칙 이해에 실질적으로 기여**한 것으로 판단됨. Nature 논문의 "few-shot degrades" 일반론이 Rummikub 도메인에서는 부분적으로만 성립.

---

## 7. 결론 및 교훈

1. **v2가 여전히 최강** — 1,200 tok, few-shot 5개 포함, 30.8%
2. **zero-shot은 만능이 아니다** — Nature 논문은 수학/코딩 벤치마크 기준. 보드게임 규칙처럼 도메인 특수 규칙이 복잡한 태스크에서는 few-shot이 "규칙 명확화" 역할을 수행
3. **v5.1의 긍정적 성과**: fallback 0 + avg 190s (v2 대비 -10%) + 비용 동일
4. **프롬프트 최적해는 v2와 v5 사이** — few-shot은 유지하되 메타인지 지시(Checklist/Step-by-step)는 제거한 variant가 최적일 수 있음

---

## 8. 다음 단계

- [x] v5.1 패치 적용 + 이미지 빌드
- [x] Smoke Test #3 → fallback 0 PASS
- [x] Round 8 DeepSeek 80턴 → 20.5%, fallback 0
- [ ] 결과 분석 리포트 (`docs/03-development/22` 또는 신규 문서)
- [ ] v2 production 복귀 결정 (또는 v5.2 hybrid 검토)
