# Sprint 7 프로젝트 회고 -- node-dev

- **역할**: ai-adapter 개발 (NestJS/TypeScript)
- **Sprint**: Sprint 7 (2026-04-22 ~ 2026-04-29)
- **작성일**: 2026-04-29

---

## 잘한 점 (Keep)
- DeepSeek V4-Flash/V4-Pro 모델 통합을 성공적으로 수행했다. `deepseek.adapter.ts`에 V4 모델명 + 응답 파싱을 추가하고, thinking/non-thinking 모드 전환을 지원. V4-Pro thinking 채택의 기술적 기반을 만들었다.
- 타임아웃 체인 SSOT(`docs/02-design/41-timeout-chain-breakdown.md`) 700 -> 1000초 전수 상향을 문서 기반으로 정확히 실행했다. 부등식 계약 `script_ws(1070) > gs_ctx(1060) > http_client(1060) > istio_vs(1010) > adapter(1000) > llm_vendor`가 깨지지 않도록 10개 지점을 동시에 수정.
- PR #80에서 ai-adapter 의존성 drift를 해소했다. `path-to-regexp` overrides 제거로 NestJS v11 Express 5 호환성 확보. Jest 428 -> 599 PASS 증가(누적분 포함), 회귀 0.
- `41-timeout-chain-breakdown.md` SS6 UX 타이머 16개 레지스트리를 문서화하여, 프론트엔드 타이머와 서버 타이머의 관계를 한눈에 볼 수 있게 했다.
- Claude non-thinking disabled 명시 + DeepSeek spec 타임아웃 동기화를 PR 하나에서 처리(커밋 `9c123e0`).

## 아쉬운 점 (Problem)
- Day 3에 ai-adapter 재빌드 시 PR #80 머지 전 `origin/main` fetch -> drift 재현으로 새 pod CrashLoop 사고를 일으켰다. 병렬 fetch/build/merge 타이밍에 대한 사전 경고를 하지 못했다.
- V4-Flash가 전 모드에서 place 0%로 탈락하고, V4-Pro non-thinking도 14.3%로 탈락한 과정에서, 모델별 특성 분석이 ai-engineer에게만 의존했다. adapter 구현자가 모델 행동 패턴을 더 이해했어야 했다.

## 시도할 점 (Try)
- ai-adapter 이미지 태그에 커밋 SHA를 포함하여, 배포된 이미지가 어느 커밋 기반인지 즉시 확인할 수 있게 한다.
- LLM vendor 응답 파싱 변경 시 mock 응답 fixture를 함께 업데이트하는 체크리스트를 adapter 코드 내 주석으로 남긴다.

## 이번 스프린트에서 가장 기억에 남는 순간
- V4-Pro thinking 모드로 3게임 완주(place rate 31.9%, fallback 0, avg 102s)한 결과를 본 순간. adapter 코드의 타임아웃 체인이 제대로 동작해서 1000초 대기가 정상 응답으로 이어진 것이 보람 있었다.

## 팀에게 한마디
- adapter는 LLM과 게임 엔진 사이의 다리인데, 다리가 튼튼해도 양쪽 끝의 땅이 불안하면 소용없다. ai-engineer와 go-dev 사이에서 더 적극적으로 통역하겠다.
