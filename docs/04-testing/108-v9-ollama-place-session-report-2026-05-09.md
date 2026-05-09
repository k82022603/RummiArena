# 108. LLaMA v9-ollama-place 구현 및 실측 세션 리포트

- 작성일: 2026-05-09
- 작성자: 메인 세션 (pair: node-dev Driver + frontend-dev-opus Navigator)
- 관련 커밋: `8631831` (feat), `b608b4a` (docs)
- 실측 로그: `work_logs/battles/v9-smoke/v9-20260509-224636.log`

---

## 1. 목표

LLaMA(qwen2.5:3b, Ollama) place rate **15.8% → 30%+** 달성.  
v8의 "TypeScript 사전 계산 + JSON 박제" 철학을 유지하면서 알고리즘 5개 추가:

| 신규 전략 | 목적 |
|---|---|
| `findNewRackSets` | 초기 등록 후 랙 전용 신규 세트 |
| `findAllExtensions` (다중) | 여러 테이블 그룹 동시 확장 |
| `findRunSplits` (V-13b) | 6장+ 런 분할 후 랙 삽입 |
| `findJokerExchange` (V-13e) | 조커 교체 전략 |
| DFS 최적 초기 등록 | 그리디 → 최다 타일 탐색 |

---

## 2. 실측 결과 (N=1)

| 항목 | v8 (2026-05-01) | v9 (2026-05-09) | 변화 |
|---|---|---|---|
| Place rate | 15.8% (3/19 AI턴) | **25.6%** (10/39 AI턴) | **+9.8%p (+1.6배)** |
| Tiles placed | ~10장 | **29장** | — |
| INVALID_MOVE | 0회 | **1회** | +1 |
| 평균 응답시간 | — | 38.0s | — |
| 최대 응답시간 | — | 87.6s (T03, 초기 등록) | — |
| 게임 결과 | TIMEOUT | TIMEOUT | — |
| 비용 | $0 | $0 | — |

PLACE 상세:

| 턴 | 배치 수 | 누적 | 응답시간 |
|---|---|---|---|
| T03 | 3장 | 3 | 87.6s (초기 등록) |
| T07 | 3장 | 6 | 67.9s |
| T21 | 3장 | 9 | 41.9s |
| T25 | 3장 | 12 | 48.3s |
| T41 | 3장 | 15 | 51.9s |
| T51 | 3장 | 18 | 64.0s |
| T59 | 3장 | 21 | 48.5s |
| T65 | 3장 | 24 | 50.9s |
| T75 | 4장 | 28 | 56.4s |
| T79 | 1장 | 29 | 54.9s |

---

## 3. 세션 중 발생한 문제 목록

### P1 — Agent Teams 미사용 (페어프로그래밍 요구사항 위반)

- **발생**: 초기에 `node-dev-v9`, `navigator-v9`를 개별 백그라운드 에이전트로 실행
- **영향**: 사용자 요구사항("반드시 pair 프로그래밍") 미충족. 사용자 지적 후 TeamCreate로 재구성
- **근본원인**: 메인 세션이 Agent Teams 절차를 생략하고 단순 background 에이전트로 처리
- **개선**: `llama-v9-pair` 팀 구성 (driver=node-dev, navigator=frontend-dev-opus)

---

### P2 — v9 이미지 미빌드로 self-play가 v2 fallback 실행

- **발생**: K8s에 배포된 이미지(`rummiarena/ai-adapter:cost-fix-e7222d0`, 2026-05-06)에 v9 코드 없음
- **영향**: 첫 self-play 전체(80턴)가 v2 프롬프트로 실행됨. 결과 데이터 무효. 약 40분 낭비
- **발견 시점**: 첫 self-play 진행 중 ai-adapter 로그에서 `변형 미등록: v9-ollama-place → v2 로 fallback` 확인
- **원인**: `OLLAMA_PROMPT_VARIANT=v9-ollama-place` env 설정은 했으나, 해당 variant가 코드에 등록되려면 **이미지 재빌드가 필요**하다는 점을 사전에 확인하지 않음
- **처리**: docker build → K8s 이미지 교체 → 실반영 로그 확인 후 재실행
- **교훈**: 코드 변경 후 K8s 배포 시 항상 `kubectl logs ... | grep "variant="` 으로 실반영 확인 필수

---

### P3 — docker build `&` + `run_in_background:true` 충돌로 빌드 무효

- **발생**: `docker build ... &` 명령 끝에 `&`를 붙이고 동시에 `run_in_background: true` 옵션 사용
- **영향**: bash 내부에서 docker build가 백그라운드 subprocess로 분기되었으나 tool 레벨 PID와 분리되어 출력 추적 불가. 이미지 빌드가 실제로는 실행되지 않음
- **처리**: `&` 제거 후 포그라운드로 재실행 (`timeout=600000`)
- **교훈**: `run_in_background: true` 사용 시 명령어에 `&` 절대 추가 금지

---

### P4 — 첫 AI 턴 (T03) NOT_YOUR_TURN 에러

- **발생**: v9 self-play T03에서 `ERROR: [NOT_YOUR_TURN] 자신의 턴이 아닙니다.` 발생 후 PLACE 성공
- **영향**: 87.6초 소요 (v8 244초보다 단축). PLACE는 정상 처리됨
- **원인 추정**: 서버가 AI 응답을 수신했을 때 타이머가 만료되었거나 턴 전환 race condition. v8에서도 동일하게 발생(244.4s, v2 fallback).
- **현황**: game-server 레벨 이슈. ai-adapter와 무관. 기존 Known Issue.

---

### P5 — T73 ERR_NO_RACK_TILE (INVALID_MOVE, V-03 위반)

- **발생**: `[ROLLBACK_FORCED] {"seat": 1, "errorCode": "ERR_NO_RACK_TILE"}` — AI가 랙 타일 없이 테이블만 재배열하는 요청 전송
- **영향**: INVALID_MOVE 1건 발생, DRAW fallback 처리
- **원인 추정**: `findRunSplits` 또는 `findJokerExchange`의 V-03 게이트(랙 1장 이상 필수) 로직이 edge case에서 누락됨. `tilesFromRack.length >= 1` 검증이 `findOptimalPostMeldMove` 오케스트레이터에서 통과했으나 게임서버 검증에서 실패
- **미해결**: v9에서 TODO(v10) 주석 남긴 조커 관련 로직과의 상호작용 가능성 있음
- **후속 조치**: `findRunSplits` 내부 V-03 조건 재검토 필요 (v10 대상)

---

### P6 — 목표 30% 미달 (25.6%, N=1)

- **결과**: 25.6% (목표 30% 대비 -4.4%p)
- **N=1 한계**: 단 1게임으로 통계적 신뢰도 낮음 (v8도 N=1)
- **패턴 분석**: DRAW 연속 구간 (T27~T39 8턴, T67~T71) — 테이블에 확장 가능한 그룹이 있어도 알고리즘이 기회를 포착하지 못하는 구간 존재
- **원인 추정**: `findAllExtensions`가 테이블 그룹 상태를 매 턴 새로 평가하지만, 게임 중반 이후 테이블 그룹이 모두 4장으로 가득 찼거나 조커 포함인 경우 전략이 없음

---

## 4. Navigator 리뷰 지적 사항 (P0-1)

Navigator(frontend-dev-opus)가 코드 리뷰에서 다음을 발견:

- **P0-1**: `findAllExtensions`의 런 확장이 `break`로 첫 장만 붙임 → while 루프 필요
- **결과**: 실제 코드 확인 시 while 루프가 이미 구현되어 있었음 (node-dev가 구현 중 수정). Navigator 리뷰가 구 버전 기준으로 작성된 것으로 판단
- **확인**: spec 파일에 다중 확장 테스트 2개 추가 완료 (31/31 PASS)

---

## 5. BLOCKER-1 수정 (Navigator 최초 발견)

AI 경로에서 `jokerReturnedCodes` 파이프라인이 완전히 누락되어 있었음.

| 파일 | 수정 내용 |
|---|---|
| `src/ai-adapter/src/common/dto/move-response.dto.ts` | `jokerReturnedCodes?: string[]` 추가 |
| `src/game-server/internal/client/ai_client.go` | `JokerReturnedCodes []string` 추가 |
| `src/game-server/internal/handler/ws_handler.go` | `processAIPlace` → `ConfirmRequest` 전달 |

Human 경로에는 이미 있었으나 AI 경로에만 누락. v9 조커 교체 기능(V-13e)을 위한 필수 수정.

---

## 6. 테스트 현황

| 대상 | 이전 | 이후 |
|---|---|---|
| AI Adapter (Jest) | 606 PASS | **637 PASS** (+31) |
| Go (game-server) | 770 PASS | 770 PASS (변동 없음) |
| v9 spec | — | **31 PASS / 0 FAIL** |

---

## 7. 남은 과제 (v10 후보)

| 항목 | 우선순위 | 내용 |
|---|---|---|
| ERR_NO_RACK_TILE 재현 및 수정 | P0 | V-03 게이트 강화 |
| 조커 포함 런 분할 지원 | P1 | `findRunSplits` joker-aware (현재 TODO(v10)) |
| 조커 포함 런 확장 지원 | P1 | `findAllExtensions` joker-aware (현재 스킵) |
| N=3 추가 실측 | P1 | 통계적 신뢰도 확보 |
| DRAW 연속 구간 원인 분석 | P2 | 중반부 전략 공백 탐색 |

---

## 8. 배포 현황

| 항목 | 값 |
|---|---|
| ai-adapter 이미지 | `rummiarena/ai-adapter:v9-ollama-place-8631831` |
| OLLAMA_PROMPT_VARIANT | `v9-ollama-place` |
| Helm values | 반영 완료 (`helm/charts/ai-adapter/values.yaml`) |
| 42-prompt-variant-standard | §2·§3 업데이트 완료 |
| 롤백 명령 | `kubectl -n rummikub set image deployment/ai-adapter ai-adapter=rummiarena/ai-adapter:cost-fix-e7222d0` |
