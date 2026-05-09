# 세션 로그

- **날짜**: 2026-05-09 ~ 2026-05-10
- **세션**: v9-ollama-place 구현 + N=3 실측
- **시작**: 2026-05-09 (오후)
- **종료**: 2026-05-10 00:04
- **Phase / Sprint**: Sprint 7 이후 핫픽스 세션

## 목표

LLaMA(qwen2.5:3b) place rate **15.8% → 30%+** 달성.
v8 "TypeScript 사전 계산 + JSON 박제" 철학 유지 + 5개 전략 신규 추가.

## 완료한 작업

### 1. 페어프로그래밍 팀 구성
- TeamCreate `llama-v9-pair`: node-dev (Driver) + frontend-dev-opus (Navigator)
- 초기에 개별 background 에이전트 실수 → 사용자 지적 후 TeamCreate로 재구성

### 2. v9 알고리즘 구현 (신규 파일)
- `src/ai-adapter/src/prompt/v9-ollama-place-prompt.ts` (946줄)
  - `scoreSetWithJoker`: 조커 = 대체 위치 숫자값 (v8: 30점 고정 오류 수정)
  - `findValidRunsV9`: 조커 갭 채우기(gap=1) + 양끝 확장, 순환 방지
  - `findOptimalInitialMeld`: DFS + 최다 타일 우선 + 500ms timeout
  - `findNewRackSets`: 랙 전용 새 세트 탐색 (신규)
  - `findAllExtensions`: 다중 그룹 동시 확장 (신규, while 루프)
  - `findRunSplits`: 6장+ 런 분할 후 랙 삽입, V-03 5조건 게이트 (신규)
  - `findJokerExchange`: 조커 교체, jokerReturnedCodes 파이프라인 (신규)
  - `findOptimalPostMeldMove`: 5전략 조합 오케스트레이터 (신규)
- `src/ai-adapter/src/prompt/registry/variants/v9-ollama-place.variant.ts`
- 단위 테스트 31개 작성 (`v9-ollama-place-prompt.spec.ts`), 31/31 PASS

### 3. BLOCKER-1: jokerReturnedCodes AI 경로 누락 수정
- `src/ai-adapter/src/common/dto/move-response.dto.ts`: `jokerReturnedCodes?: string[]` 추가
- `src/game-server/internal/client/ai_client.go`: `JokerReturnedCodes []string` 추가
- `src/game-server/internal/handler/ws_handler.go`: `processAIPlace` → `ConfirmRequest` 전달

### 4. Registry + Helm 반영
- `prompt-registry.service.ts`: v9 import + register 1줄 추가
- `helm/charts/ai-adapter/values.yaml`: `OLLAMA_PROMPT_VARIANT: "v9-ollama-place"`
- `docs/02-design/42-prompt-variant-standard.md`: §2·§3 v9 반영

### 5. Docker 이미지 빌드 + K8s 배포
- `rummiarena/ai-adapter:v9-ollama-place-8631831`
- kubectl set image 반영 후 로그로 variant 실반영 확인

### 6. N=3 실측 완료
| 게임 | Place rate | 타일 | INVALID | 시간 |
|------|-----------|------|---------|------|
| G1 | 25.6% (10/39) | 29장 | 1회 (ERR_NO_RACK_TILE, T73) | 1484.5s |
| G2 | 28.2% (11/39) | 33장 | 0회 | 822.9s |
| G3 | 23.1% (9/39) | 30장 | 0회 | 656.4s |
| **평균** | **25.6%** | **30.7장** | 총 1회 | 987.9s |

### 7. 문서 작성
- `docs/04-testing/108-v9-ollama-place-session-report-2026-05-09.md` (세션 문제 리포트 6건)
- `docs/04-testing/109-v9-ollama-place-experiment-2026-05-09.md` (N=3 실측 보고서)

## 이슈 / 블로커

| # | 내용 | 상태 |
|---|------|------|
| P1 | 초기 TeamCreate 생략 → 사용자 지적 후 재구성 | 해소 |
| P2 | v9 이미지 미빌드로 첫 self-play가 v2 fallback 실행 (40분 낭비) | 해소 |
| P3 | `docker build &` + `run_in_background:true` 충돌로 빌드 무효 | 해소 |
| P4 | T03 NOT_YOUR_TURN 에러 (Known Issue, WS race condition) | 미해소(서버 이슈) |
| P5 | T73 ERR_NO_RACK_TILE (V-03 게이트 edge case 누락) | v10 대상 |
| P6 | 목표 30% 미달 (N=3 평균 25.6%) | v10 개선 |

## 다음 세션 TODO

- [ ] v10: ERR_NO_RACK_TILE 재현 + V-03 게이트 강화 (P0)
- [ ] v10: 조커 포함 그룹/런 확장 지원 (P1)
- [ ] v10: `findRunSplits` 조커 포함 런 지원 (P1)
- [ ] localhost:30000 로비 ELO 실측 확인
- [ ] Context Caching 최적화 검토 (DeepSeek 비용 절감)

## 메모

- v8의 핵심 인사이트(TS 사전 계산 + JSON 박제) 유지하며 v9 달성
- N=3 평균 25.6%: 통계적으로 30% 목표 미달이나 v8 대비 1.6배 개선 확인
- Game 1 응답시간 38.0s는 NOT_YOUR_TURN 지연(T03: 87.6s) 영향, G2~3 정상 수렴(16~21s)
