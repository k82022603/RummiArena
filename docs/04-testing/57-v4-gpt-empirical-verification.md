# 57. v4 vs v2 GPT-5-mini 실측 검증 보고서

- **작성일**: 2026-04-15 (Day 4)
- **모델**: gpt-5-mini
- **검증 목적**: SP5 (`docs/03-development/21-prompt-v4-baseline-dry-run-report.md`) 의 "GPT-5-mini 는 v4 reasoner 지시를 무시한다" 가정을 실 API 호출로 검증
- **스크립트**: `src/ai-adapter/scripts/verify-v4-gpt-empirical.ts`
- **LangSmith**: enabled (project=rummiarena-v4-verification)

## 결론 (TL;DR)

**V4_IGNORED** — v4 역효과 — v2 가 우세

판정 근거:
- reasoning_tokens: v2 mean=4224 std=779 | v4 mean=3179 std=644 | Cohen's d=-1.46
- tiles_placed: v2 mean=6.33 std=1.15 | v4 mean=6.33 std=1.15 | Cohen's d=0.00
- latency_ms: v2 mean=62225 | v4 mean=46145
- intra-variant variance: v2 reasoning range=1408 | v4 reasoning range=1280 (high range = noise dominates signal)
- v4 가 v2 보다 더 적은 reasoning 또는 더 적은 tiles 배치. 역효과 가능성.

## 1. Fixture

두 호출에 동일한 게임 상태를 사용했다.

```json
{
  "tableGroups": [
    {
      "tiles": [
        "R3a",
        "R4a",
        "R5a"
      ]
    },
    {
      "tiles": [
        "B7a",
        "Y7a",
        "K7a"
      ]
    },
    {
      "tiles": [
        "Y10a",
        "Y11a",
        "Y12a"
      ]
    },
    {
      "tiles": [
        "K1a",
        "B1a",
        "R1a"
      ]
    }
  ],
  "myTiles": [
    "R6a",
    "R8a",
    "R9a",
    "B10a",
    "K10a",
    "Y9a",
    "B5b",
    "Y2b",
    "K12a",
    "B13a",
    "JK1",
    "R12b"
  ],
  "turnNumber": 14,
  "drawPileCount": 42,
  "initialMeldDone": true,
  "opponents": [
    {
      "playerId": "P2",
      "remainingTiles": 9
    },
    {
      "playerId": "P3",
      "remainingTiles": 11
    },
    {
      "playerId": "P4",
      "remainingTiles": 7
    }
  ]
}
```

- 턴: 14, 손패: 12, 보드: 4 groups, 조커 1개
- initialMeldDone: true (중반)
- 상대: P2(9), P3(11), P4(7)

## 2A. Multi-run 통계 (N=3)

동일 fixture / 동일 prompt 를 N 회 반복하여 GPT-5-mini 의 stochastic 변동성과 v4 효과를 분리한다.

| metric | v2 mean | v2 std | v4 mean | v4 std | Δ mean | Cohen d |
|--------|---------|--------|---------|--------|--------|---------|
| latency_ms | 62225 | 11078 | 46145 | 8157 | -16079 | — |
| completion_tokens | 4430 | 760 | 3388 | 623 | -1041 | -1.50 |
| **reasoning_tokens** | 4224 | 779 | 3179 | 644 | -1045 | **-1.46** |
| **tiles_placed** | 6.33 | 1.15 | 6.33 | 1.15 | 0.00 | **0.00** |

### Per-run samples

| run | v2 reasoning_tok | v2 tiles | v2 latency | v4 reasoning_tok | v4 tiles | v4 latency |
|-----|------------------|----------|------------|------------------|----------|------------|
| 1 | 4608 | 5 | 69984ms | 3264 | 7 | 47853ms |
| 2 | 3328 | 7 | 49538ms | 3776 | 5 | 53313ms |
| 3 | 4736 | 7 | 67152ms | 2496 | 7 | 37270ms |

**Cohen d 해석**: |d|<0.2 = trivial, 0.2~0.5 = small, 0.5~0.8 = medium, >0.8 = large.

## 2. 마지막 호출 결과 (대표)

| 항목 | v2 | v4 | Δ |
|------|----|----|---|
| 성공 여부 | OK | OK | — |
| HTTP status | 200 | 200 | — |
| Latency (ms) | 67152 | 37270 | -29882 |
| prompt_tokens | 2447 | 3966 | 1519 |
| completion_tokens | 4938 | 2722 | -2216 |
| **reasoning_tokens** | 4736 | 2496 | -2240 |
| total_tokens | 7385 | 6688 | — |
| cached_prompt_tokens | 1792 | 3840 | — |

## 3. Move 분석

| 항목 | v2 | v4 |
|------|----|----|
| action | place | place |
| tableGroups (count) | 6 | 5 |
| tilesFromRack (count) | 7 | 7 |
| tilesPlacedTotal | 19 | 19 |
| rack 보존성 (rack 외 타일 미사용) | true | true |
| reasoning 길이 (chars) | 178 | 242 |

### 3.1 v4 키워드가 reasoning 본문에 등장했는가

| 키워드 | v2 | v4 |
|--------|----|----|
| legality | no | yes |
| initialMeld | no | no |
| count | no | no |
| point | no | no |
| residual | no | no |
| thinkingBudget | no | no |
| actionBias | no | no |
| fiveAxis | no | no |

## 4. Raw 응답

### 4.1 v2 응답

```json
{"action":"place","tableGroups":[{"tiles":["R3a","R4a","R5a","R6a"]},{"tiles":["B7a","Y7a","K7a"]},{"tiles":["Y9a","Y10a","Y11a"]},{"tiles":["Y12a","K12a","R12b"]},{"tiles":["K1a","B1a","R1a"]},{"tiles":["B10a","K10a","JK1"]}],"tilesFromRack":["R6a","Y9a","K12a","R12b","B10a","K10a","JK1"],"reasoning":"Extend red run with R6; make yellow run Y9-11 using Y9 from rack; form group of 12s with Y12,K12,R12; form group of 10s with B10,K10 and Joker; preserve other table tiles/groups."}
```

### 4.2 v4 응답

```json
{"action":"place","tableGroups":[{"tiles":["R3a","R4a","R5a","R6a","JK1","R8a","R9a"]},{"tiles":["B7a","Y7a","K7a"]},{"tiles":["Y9a","Y10a","Y11a"]},{"tiles":["K1a","B1a","R1a"]},{"tiles":["Y12a","K12a","R12b"]}],"tilesFromRack":["R6a","R8a","R9a","JK1","Y9a","K12a","R12b"],"reasoning":"Extend red run R3-5 to R3-9 using R6,R8,R9 and JK as R7 (7 tiles run). Move Y12 to form a group of 12s with K12 and R12, and extend yellow run by adding Y9 to make Y9-10-11. Placed 7 rack tiles, all sets valid, kept other table groups intact."}
```

## 5. 해석 및 권고

### 권고: SP5 결정 유지 (GPT 는 v3 또는 v2 사용)

- GPT-5-mini 는 reasoning_tokens 필드를 노출하지만 v4 지시(Thinking Time Budget, 5축 평가)에 의해 토큰 사용량이 유의미하게 변화하지 않았다.
- v4 의 추가 지시는 GPT 에게 효과가 작거나 무시됨. SP5 의 "GPT 제외" 결정은 실측으로 정당화된다.
- 향후 v4.1 GPT variant 는 reasoning 토큰 유도 대신 response_format json_schema 강화 + token efficiency hint 방향으로 분기 권장.

## 6. 재현 방법

```bash
export OPENAI_API_KEY=$(kubectl -n rummikub get secret ai-adapter-secret -o jsonpath='{.data.OPENAI_API_KEY}' | base64 -d)
export LANGSMITH_API_KEY=...   # 사용자 제공
export LANGCHAIN_TRACING_V2=true
export LANGCHAIN_PROJECT=rummiarena-v4-verification
cd src/ai-adapter
./node_modules/.bin/ts-node --transpile-only scripts/verify-v4-gpt-empirical.ts
```

## 7. 한계

- N=1 fixture 단일 호출. 통계적 유의성 없음. 본 보고서는 "신호 탐지" 목적.
- GPT-5-mini 의 reasoning 은 비공개 chain-of-thought 이므로 본문 분석은 최종 reasoning 필드만 가능.
- 동일 fixture 라도 stochastic sampling 의 영향 가능 (temperature 미지정 = 1.0 reasoning 모델 기본값).

---

*본 보고서는 `verify-v4-gpt-empirical.ts` 자동 생성. 수동 편집 금지 (재실행 시 덮어씀).*
