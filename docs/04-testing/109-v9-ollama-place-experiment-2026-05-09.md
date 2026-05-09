# v9-ollama-place 알고리즘 실측 실험 보고서

- **날짜**: 2026-05-09
- **담당**: Claude (설계·구현·실측), game-analyst (게임룰 리뷰), node-dev Driver + frontend-dev-opus Navigator (페어프로그래밍)
- **모델**: qwen2.5:3b (K8s Ollama Pod, CPU-only)
- **프롬프트**: v9-ollama-place
- **대전 구성**: Human(AutoDraw) vs AI, 80턴 제한
- **결론**: ✅ **place rate 25.6% (N=3 평균) — v8 대비 +9.8%p (+1.6배)** / 목표 30% 미달

---

## 1. 실험 배경

### v7 → v8 → v9 진화 맥락

| 버전 | 도입일 | 전략 | place rate |
|---|---|---|---|
| v2 | (기본) | LLM 자체 추론 | 0% (FORFEIT 반복) |
| v7-ollama-meld | 2026-04-22 | 4-step 절차 + few-shot | 0% (모든 턴 DRAW) |
| v8-ollama-place | 2026-05-01 | TypeScript 사전 계산 + JSON 박제 | **15.8%** (3/19 AI턴) |
| **v9-ollama-place** | **2026-05-09** | **v8 + 5개 전략 추가 + 조커 점수 정확화** | **25.6% (N=3 평균)** |

**핵심 인사이트** (v8에서 확립): 3B 모델에게 루미큐브 조합 계산을 맡기는 것 자체가 오류. TypeScript 알고리즘이 사전 계산하고 모델은 JSON을 복사만 하는 구조가 정답.

### v8의 알고리즘 공백

v8은 place rate 15.8%를 달성했지만, DRAW의 84%가 다음 세 가지 공백에서 비롯됐다:

| 공백 | DRAW 원인 비중 | v8 상태 |
|---|---|---|
| 초기 등록 후 랙 전용 새 세트 미지원 | ~40% | `findTableExtension`만 존재 |
| 단일 그룹 1타일 확장만 가능 | ~25% | 첫 번째 확장에서 반환 |
| 조커 점수 30점 고정 오류 | ~10% | `scoreSet`에서 JK → 30 고정 |
| 런 조커 완전 미지원 | ~10% | `if (!t || t.isJoker) continue` |

---

## 2. v9 알고리즘 설계

v8 파일(`v8-ollama-place-prompt.ts`)은 수정하지 않고, 독립 파일로 신규 구현.

### 신규/개선 함수 목록

| 함수 | v8 대비 변화 | 게임룰 |
|---|---|---|
| `scoreSetWithJoker` | 조커 = 대체 위치 숫자값 (v8: 30점 고정) | — |
| `findValidRunsV9` | 조커 갭 채우기(gap=1) + 양끝 확장, 순환 방지 | V-15 |
| `findOptimalInitialMeld` | DFS + 최다 타일 우선 + 500ms timeout (v8: 그리디 즉시 반환) | V-01 |
| `findNewRackSets` | **신규** — 랙 전용 새 세트 탐색 | V-03 |
| `findAllExtensions` | **신규** — 다중 그룹 동시 확장 (v8: 첫 번째만) | V-06 |
| `findRunSplits` | **신규** — 6장+ 런 분할 후 랙 삽입 (V-03 5조건 게이트) | V-13b |
| `findJokerExchange` | **신규** — 조커 교체 전략 (jokerReturnedCodes 파이프라인) | V-13e |
| `findOptimalPostMeldMove` | **신규** — 5전략 조합 오케스트레이터 | V-03, V-06 |

### 오케스트레이터 전략 우선순위

```
전략 1: findNewRackSets       — 랙 전용 새 세트
전략 2: findAllExtensions     — 다중 그룹 동시 확장
전략 3: 1+2 조합              — 타일 중복 없으면 동시 적용
전략 4: findRunSplits         — 6장+ 런 분할 (종반 또는 미배치 구간)
전략 5: findJokerExchange     — 조커 교체 (drawPileCount=0 또는 상대 ≤3장)
→ tilesPlaced 내림차순 정렬 → 최선 선택
```

---

## 3. 실험 설계

| 항목 | 설정 |
|---|---|
| 모델 | qwen2.5:3b |
| 프롬프트 | v9-ollama-place |
| 이미지 | `rummiarena/ai-adapter:v9-ollama-place-8631831` |
| K8s 환경 | `OLLAMA_PROMPT_VARIANT=v9-ollama-place` |
| 최대 턴 | 80턴 |
| ws_timeout | 270s |
| 대전 구성 | Human(AutoDraw) vs AI |
| persona / difficulty | calculator / expert / psychologyLevel=2 |
| 실측 횟수 | **N=3** |

---

## 4. 실측 결과

### 4.1 Game 1 (2026-05-09 22:46~23:11)

| 지표 | 값 |
|---|---|
| **Place rate** | **25.6% (10/39 AI턴)** |
| Place 횟수 | 10회 |
| Place 타일 수 | 29장 |
| Draw | 29회 |
| Fallback (INVALID_MOVE) | 1회 (ERR_NO_RACK_TILE, T73) |
| 총 턴 수 | 80턴 |
| 소요 시간 | 1484.5s (24.7분) |
| 평균 응답시간 | 38.0s (p50=27.2s, min=8.1s, max=87.6s) |
| 게임 결과 | TIMEOUT |

PLACE 상세 (Game 1):

| 턴 | 배치 수 | 누적 | 응답시간 | 전략 |
|---|---|---|---|---|
| T03 | 3장 | 3 | 87.6s | 초기 등록 (DFS) |
| T07 | 3장 | 6 | 67.9s | findNewRackSets |
| T21 | 3장 | 9 | 41.9s | findNewRackSets |
| T25 | 3장 | 12 | 48.3s | findNewRackSets |
| T41 | 3장 | 15 | 51.9s | findNewRackSets |
| T51 | 3장 | 18 | 64.0s | findNewRackSets |
| T59 | 3장 | 21 | 48.5s | findNewRackSets |
| T65 | 3장 | 24 | 50.9s | findNewRackSets |
| T75 | 4장 | 28 | 56.4s | findAllExtensions |
| T79 | 1장 | 29 | 54.9s | findAllExtensions |

### 4.2 Game 2 (2026-05-09 23:39~23:53)

| 지표 | 값 |
|---|---|
| **Place rate** | **28.2% (11/39 AI턴)** |
| Place 횟수 | 11회 |
| Place 타일 수 | 33장 |
| Draw | 28회 |
| Fallback (INVALID_MOVE) | **0회** |
| 총 턴 수 | 80턴 |
| 소요 시간 | 822.9s (13.7분) |
| 평균 응답시간 | 21.1s (p50=10.2s, min=7.9s, max=67.5s) |
| 게임 결과 | TIMEOUT |

PLACE 상세 (Game 2):

| 턴 | 배치 수 | 누적 | 응답시간 |
|---|---|---|---|
| T11 | 6장 | 6 | 27.5s |
| T15 | 4장 | 10 | 27.8s |
| T23 | 4장 | 14 | 37.0s |
| T29 | 3장 | 17 | 41.5s |
| T33 | 1장 | 18 | 49.1s |
| T39 | 1장 | 19 | 41.4s |
| T43 | 3장 | 22 | 50.6s |
| T49 | 1장 | 23 | 41.8s |
| T61 | 3장 | 26 | 52.0s |
| T75 | 4장 | 30 | 63.0s |
| T79 | 3장 | 33 | 67.5s |

### 4.3 Game 3 (2026-05-09 23:53~2026-05-10 00:04)

| 지표 | 값 |
|---|---|
| **Place rate** | **23.1% (9/39 AI턴)** |
| Place 횟수 | 9회 |
| Place 타일 수 | 30장 |
| Draw | 30회 |
| Fallback (INVALID_MOVE) | **0회** |
| 총 턴 수 | 80턴 |
| 소요 시간 | 656.4s (10.9분) |
| 평균 응답시간 | 16.8s (p50=10.0s, min=7.5s, max=57.5s) |
| 게임 결과 | TIMEOUT |

PLACE 상세 (Game 3):

| 턴 | 배치 수 | 누적 | 응답시간 |
|---|---|---|---|
| T03 | 6장 | 6 | 34.7s |
| T29 | 3장 | 9 | 28.2s |
| T33 | 3장 | 12 | 29.7s |
| T37 | 1장 | 13 | 28.5s |
| T53 | 3장 | 16 | 37.6s |
| T59 | 5장 | 21 | 45.0s |
| T65 | 3장 | 24 | 47.1s |
| T71 | 3장 | 27 | 54.2s |
| T79 | 3장 | 30 | 57.5s |

### 4.4 N=3 종합

| 지표 | Game 1 | Game 2 | Game 3 | **평균 (N=3)** |
|---|---|---|---|---|
| Place rate | 25.6% | 28.2% | 23.1% | **25.6%** |
| Place 횟수 | 10 | 11 | 9 | **10.0** |
| Tiles placed | 29 | 33 | 30 | **30.7** |
| INVALID_MOVE | 1 | 0 | 0 | **1회 (총)** |
| 소요 시간 | 1484.5s | 822.9s | 656.4s | **987.9s** |
| 평균 응답시간 | 38.0s | 21.1s | 16.8s | **25.3s** |

---

## 5. v8 vs v9 비교

| 지표 | v8 (N=1, 40턴) | v9 Game 1 (80턴) | **v9 N=3 평균** |
|---|---|---|---|
| Place rate | 15.8% | 25.6% | **25.6%** |
| Place 횟수 | 3회 | 10회 | **10.0회** |
| Tiles placed | 8장 | 29장 | **30.7장** |
| INVALID_MOVE | 0회 | 1회 | **1회 (총)** |
| 평균 응답시간 | 19.7s | 38.0s | **25.3s** |

> 주의: v8은 40턴 기준, v9는 80턴 기준. 직접 비교 시 주의 필요.
> v9 N=3 평균 응답시간: Game 1이 NOT_YOUR_TURN 지연(T03: 87.6s)으로 38.0s로 튀었으나, Game 2~3는 21.1s/16.8s로 정상 수렴.

---

## 6. 발견 이슈 및 분석

### 6.1 ERR_NO_RACK_TILE (T73, V-03 위반)

```json
{"errorCode": "ERR_NO_RACK_TILE", "tableGroups": [...]}
```

- **현상**: AI가 랙 타일 없이 테이블 재배열만 하는 요청 전송
- **원인 추정**: `findRunSplits` 또는 `findJokerExchange`의 V-03 게이트(랙 1장 이상 필수)가 edge case에서 누락. `findOptimalPostMeldMove` 오케스트레이터의 `tilesFromRack.length >= 1` 검증 통과 후 서버에서 실패
- **영향**: INVALID_MOVE 1건, DRAW fallback
- **후속 조치**: v10에서 V-03 게이트 강화 예정

### 6.2 DRAW 연속 구간 (T27~T39, T67~T71)

- **현상**: 8턴 이상 연속 DRAW 발생 구간 존재
- **원인 추정**: 테이블 그룹이 4장 만석이거나 조커 포함인 경우 v9의 모든 전략이 적용 불가. `findAllExtensions`는 조커 포함 그룹을 보수적으로 스킵(P0 game-analyst 권고)
- **완화 가능**: 조커 포함 그룹/런 확장 지원 추가 (v10 대상)

### 6.3 NOT_YOUR_TURN 에러 (T03)

- **현상**: 첫 AI 턴에서 `ERROR: [NOT_YOUR_TURN]` 후 PLACE 성공
- **원인**: WS 타이밍 race condition (game-server Known Issue). v8에서도 동일 발생
- **영향**: 응답시간 87.6s (첫 DFS 계산 포함). 게임 결과에 영향 없음

---

## 7. 목표 달성 현황

| 목표 | 기준 | 결과 (N=1) | **결과 (N=3)** |
|---|---|---|---|
| Place rate ≥ 30% | v8 15.8% 대비 2배 | ❌ 25.6% (-4.4%p) | ❌ **25.6% 평균** (-4.4%p) |
| INVALID_MOVE 0회 | v8 수준 유지 | ⚠️ 1회 발생 | ⚠️ **총 1회** (Game 1만, G2·G3 0회) |
| 게임 완주 | FORFEIT 없음 | ✅ TIMEOUT(정상) | ✅ **3게임 모두 TIMEOUT** |
| 비용 $0 | 로컬 Ollama | ✅ $0 | ✅ **$0** |

---

## 8. 다음 단계 (v10 후보)

| 항목 | 우선순위 | 예상 효과 |
|---|---|---|
| ERR_NO_RACK_TILE 재현 및 V-03 게이트 강화 | **P0** | INVALID_MOVE 0으로 복구 |
| 조커 포함 그룹/런 확장 지원 | P1 | DRAW 연속 구간 감소 |
| `findRunSplits` 조커 포함 런 지원 (TODO(v10)) | P1 | 런 분할 기회 확대 |
| N=3 통계 확보 후 GO/KILL 판단 | ~~P1~~ **완료** | 25.6% — 30% 미달, v10 GO 결정 |
| 갭=2 조커 2장 지원 | P2 | 런 생성 기회 추가 |

---

## 9. 참고 문서

- `docs/04-testing/103-llama-v7-prompt-experiment-2026-05-01.md` — v2 vs v7 베이스라인
- `docs/04-testing/105-v8-ollama-place-experiment-2026-05-01.md` — v8 실측
- `docs/04-testing/106-llama-cpu-place-success-story-2026-05-01.md` — v8 회고 에세이
- `docs/04-testing/108-v9-ollama-place-session-report-2026-05-09.md` — 세션 문제 리포트
- `src/ai-adapter/src/prompt/v9-ollama-place-prompt.ts` — v9 알고리즘 소스
- `src/ai-adapter/src/prompt/v9-ollama-place-prompt.spec.ts` — 단위 테스트 31개
- `docs/02-design/42-prompt-variant-standard.md` §2·§3 — variant SSOT
