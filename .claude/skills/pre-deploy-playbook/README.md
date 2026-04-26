# 배포 전 게임룰 시나리오 게이트

> "게임룰에 의해 사용자가 UI에서 게임 가능한지 테스트는 안해보는거야?" -- 사용자 (2026-04-24)

## 언제 사용하나

- PR `ready for review` 전환 직전 (merge gate)
- devops 재배포 직후 (BUILD_ID 변경 확인 후)
- 사용자에게 "테스트해보세요" 전달 직전

## 핵심 흐름

1. **Phase 1 -- Pre-flight**: Pod BUILD_ID 확인, endpoint 200/307, Ollama warmup
2. **Phase 2 -- 룰 시나리오 실행**: 신규 5 spec + 1게임 완주 메타 + 기존 390 spec 회귀
3. **Phase 3 -- 단언 체크리스트**: 드래그 정합성, 턴 경계, 룰 검증, invariants 4종
4. **Phase 4 -- 실패 대응**: 분류(A/B/C/D) + 배포 게이트 차단 + 아티팩트 수집
5. **Phase 5 -- 리포트**: GO / NO-GO 판정 + 매트릭스 편입

## 관련 문서

- `docs/04-testing/81-e2e-rule-scenario-matrix.md` -- 룰 19 x UI 행위 매트릭스
- `docs/04-testing/82-missed-regression-retroactive-map.md` -- 과거 놓친 증상 역매핑
- `docs/02-design/31-game-rule-traceability.md` -- 룰 추적성

## 변경 이력

| 날짜 | 버전 | 내용 |
|------|------|------|
| 2026-04-21 | v1.0 | 최초 신설 (ui-regression에서 분리) |
| 2026-04-21 | v1.1 | 기본 AI 모델 GPT -> Ollama, cold start 대응 |
| 2026-04-24 | v2.0 | 룰 19 매트릭스 기반 재작성. 신규 5 spec + 1게임 완주 + invariants 4종 |
