# UI 회귀 테스트 (UI Regression)

> "자동화 다 GREEN이어도 사용자가 '게임 못 하겠다' 하면 우리가 놓친 것."

## 언제 사용하나

- 프론트엔드 파일(`src/frontend/src/`) 수정 직후
- PR 생성 전 (`code-modification` Phase 4 일부)
- Pod 재배포 후 smoke 검증
- 사용자 실측 버그 리포트 수신 직후

## 핵심 흐름

1. **Phase 0**: 수정 범위 파악 — `git diff` 계층 분류
2. **Phase 1**: Unit 테스트 — Jest 수정 파일 대상
3. **Phase 2**: Integration 테스트 — store 연동 검증
4. **Phase 3**: E2E 테스트 — Playwright 시나리오 매트릭스
5. **Phase 4**: 반사실적 체크리스트 — "이 수정이 없었다면?"
6. **Phase 5**: 사용자 실측 24h 의무 — 발견 즉시 E2E spec 추가

## 관련 문서

- `docs/04-testing/66-ui-regression-plan.md`
- `docs/04-testing/65-day11-ui-scenario-matrix.md`

## 변경 이력

| 날짜 | 버전 | 내용 |
|------|------|------|
| 2026-04-21 | 1.0 | 최초 신설 (Day 11 사고 기반) |
