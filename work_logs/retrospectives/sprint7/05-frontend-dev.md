# Sprint 7 프로젝트 회고 -- frontend-dev

- **역할**: Next.js 프론트엔드 개발. Phase D~G 구현, pendingStore SSOT, dragEndReducer
- **Sprint**: Sprint 7 (2026-04-22 ~ 2026-04-29)
- **작성일**: 2026-04-29

---

## 잘한 점 (Keep)
- Phase D PR 8건(#84, #86, #93~#98)을 하루 만에 완성했다. L3 순수 함수 7종 + dragEndReducer(84 PASS), store 3분할(103 PASS), hook 5종(17 PASS), GameRoom 분해(12 PASS)까지 설계서 순서 그대로 실행. 539/540 Jest PASS 유지.
- P2b Phase A~C4를 통해 pendingStore.draft를 단일 SSOT로 확립했다. gameStore deprecated 13개 필드를 38개 파일에서 완전 제거한 것은 이 스프린트의 가장 큰 구조적 성과. 이후 모든 pending 관련 버그의 디버깅 경로가 단순해졌다.
- dragEndReducer 9개 분기를 single-write 패턴으로 통일했다. dual-write 단계를 거쳐 점진적으로 전환한 것이 회귀를 최소화한 핵심 전략이었다.
- G-B에서 DragAction 7종 + pendingStore 브릿지를 구현하고, G-E에서 A4(SPLIT_PENDING_GROUP) + A8(SPLIT_SERVER_GROUP) 분기를 추가하여 재배치 기능의 핵심 경로를 완성했다.
- P3-2 useDragHandlers 행동 등가 확장(+1064줄, 9개 분기 + guard + UI 부수효과)과 P3-3 Sub-A~D(DndContext + sensors + DragOverlay GameRoom 이전, isMyTurn hook 추출, 토스트 이전)까지 마감 전 완료.

## 아쉬운 점 (Problem)
- Day 3에 `pnpm build`를 안 돌리고 Jest PASS만 보고 머지한 결과 `winnerPlayer.displayName` TS 에러가 발생했다(PR #82 수습). "Jest PASS !== 빌드 성공"이라는 당연한 사실을 놓쳤다.
- SEC-BC(Next 15.5.15) 적용 시 `PlayerRack` aria-label 변경이 E2E spec selector와 충돌하여 v2 전체 33 FAIL을 만들었다. a11y 속성 변경의 E2E 파급을 미리 챙기지 못했다.
- FINDING-01 수정이 3단계까지 간 것(PR #41 -> qa 회귀 -> PR #51)은 1차 수정의 `treatAsBoardDrop` 로직을 충분히 검증하지 않은 탓이다.
- myRack race condition이 P2b Phase C4 완료 직후 터진 것은, 다중 폴백이 가리고 있던 문제가 SSOT 통합으로 드러난 것이지만, 통합 전에 race window를 예측하지 못한 것은 부족했다.

## 시도할 점 (Try)
- PR 생성 전 `pnpm build` + `pnpm tsc --noEmit` 필수 실행. 빌드 로그 없는 PR은 만들지 않는다.
- aria-label / data-testid 변경 시 E2E spec grep을 선행하여 파급 시나리오를 PR description에 명시한다.
- Opus Navigator의 "위험도 분해 권고"를 거부하지 않는다. 한 번에 끝내려는 유혹보다 분해된 단계별 검증이 회귀를 막는다.

## 이번 스프린트에서 가장 기억에 남는 순간
- P2b Phase C4에서 38개 파일의 deprecated 필드를 한 시간 반 만에 정리하고, 612 PASS가 유지된 순간. 정리 정돈한 책장을 보는 듯한 카타르시스였다.

## 팀에게 한마디
- GameClient 1830줄을 끝내 분해하지는 못했지만, 그 안의 로직이 pendingStore와 dragEndReducer라는 두 개의 명확한 경로로 정리된 것은 다음 유지보수자에게 남기는 지도다. 지도가 있으면 1830줄도 무섭지 않다.
