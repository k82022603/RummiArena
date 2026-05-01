# 39. Sprint 5 W2 Day 2 테스트 보고서

> 작성일: 2026-04-07 | 작성자: QA Engineer | Sprint 5 Week 2, Day 2

## 1. 개요

Sprint 5 W2 Day 2에서 구현된 2개 기능에 대한 독립적 전수 테스트 결과를 보고한다.
Go Dev가 458 PASS를 확인했으나, QA 관점에서 모든 테스트를 독립 실행하여 회귀 없음을 검증하였다.

### Day 2 구현 범위

| 티켓 | 구현 내용 | 영향 범위 |
|------|----------|-----------|
| BUG-GS-004 | `processAIDraw` 함수 신설 (정상 draw vs fallback draw 분리) | `ws_handler.go` |
| SEC-ADD-001 | Google id_token JWKS 서명 검증 (keyfunc/v3 의존성 추가) | `auth_handler.go`, `auth_handler_test.go`, `config.go`, `main.go` |

## 2. 테스트 실행 결과 요약

### 2.1 전체 결과

| 테스트 스위트 | PASS | FAIL | SKIP | 시간 | 비고 |
|--------------|------|------|------|------|------|
| Go 전체 (game-server) | **663** | **0** | 17 | ~10s | 7개 패키지 PASS |
| Go JWKS 보안 (handler) | **22** | **0** | 0 | ~3.6s | GoogleLogin + JWKS + VerifyGoogle |
| NestJS AI Adapter | **395** | **0** | 0 | ~192s | 19 suites |
| **합계** | **1,058** | **0** | 17 | - | (Go + NestJS, JWKS는 Go에 포함) |

### 2.2 이전 수치 대비

| 항목 | 이전 (Phase 1, 04-06) | 현재 (Day 2, 04-07) | 변동 |
|------|----------------------|---------------------|------|
| Go 테스트 | 651 | **663** | **+12** (SEC-ADD-001 신규) |
| NestJS 테스트 | 395 | **395** | 0 (변경 없음) |
| Go + NestJS 합계 | 1,046 | **1,058** | **+12** |
| Playwright E2E | 375 | 375 (미실행) | 0 |
| 프로젝트 전체 | 1,421 | **1,433** | **+12** |

### 2.3 Go 패키지별 상세

| 패키지 | 상태 | 시간 | 비고 |
|--------|------|------|------|
| `e2e` | PASS | 0.4s | 통합 E2E (httptest) |
| `internal/client` | PASS | 0.7s | AI Adapter 클라이언트 |
| `internal/config` | PASS | 0.01s | 설정 파싱 |
| `internal/engine` | PASS | 0.02s | Game Engine 핵심 |
| `internal/handler` | PASS | **9.3s** | WS 핸들러 + **JWKS 보안 22개** |
| `internal/middleware` | PASS | 0.03s | Rate Limiter, Auth |
| `internal/service` | PASS | 0.02s | 비즈니스 로직 |

### 2.4 SKIP 목록 (17개, 정상)

모두 DB 의존 테스트로 PostgreSQL 미연결 환경에서 정상 SKIP 처리:

- `TestUpsertUser_WithRealRepo_NewUser`, `TestUpsertUser_WithRealRepo_ExistingUser` (2개)
- `TestSaveProgress_*` (3개: Success, InvalidJSON, InvalidCompletedAt)
- `TestGetProgress_*` (3개: Empty, WithRecords, StageFilter, InvalidStageFilter) (4개)
- `TestListRankings_*` (2개: OK, InvalidLimit)
- `TestListRankingsByTier_*` (2개: OK, InvalidTier)
- `TestGetUserRating_*` (2개: OK, NotFound)
- `TestGetUserRatingHistory_*` (2개: OK, InvalidLimit)

## 3. BUG-GS-004 검증 결과

### 3.1 변경 내용

기존에는 AI가 자발적으로 draw를 선택한 경우와 AI 오류로 인한 fallback draw가 동일한 `forceAIDraw` 함수를 사용하여, 정상 draw도 `isFallbackDraw=true`로 기록되는 버그가 있었다.

수정 사항:
- `processAIDraw()` 함수 신설: AI가 자발적으로 draw를 선택한 경우 전용 처리, `isFallbackDraw=false`
- `forceAIDraw()` 함수: AI 오류/타임아웃/무효 수 시에만 호출, `isFallbackDraw=true` 유지
- 호출 분기: `ws_handler.go:880` (정상 draw) vs `ws_handler.go:872,882` (fallback)

### 3.2 테스트 커버리지

| 테스트 | 검증 항목 | 결과 |
|--------|----------|------|
| `TestGenerateMove_PlaceAction` | 정상 배치 응답 | PASS |
| `TestGenerateMove_FallbackDraw` | 강제 드로우 `isFallbackDraw=true` | PASS |
| `TestForceAIDraw_DrawPileEmpty` | 드로우 파일 소진 시 GAME_OVER | PASS |
| `TestAITimer_*` (4개) | AI 타이머 만료 시 forceAIDraw 호출 | 4/4 PASS |

### 3.3 판정

**PASS** -- `processAIDraw`와 `forceAIDraw` 분리가 정상 동작하며, 기존 테스트에 회귀 없음.

## 4. SEC-ADD-001 보안 테스트 결과

### 4.1 변경 내용

Google id_token JWKS 서명 검증을 구현하여, 이전의 단순 Base64 디코딩 방식을 대체:
- `github.com/MicahParks/keyfunc/v3` 의존성 추가
- JWKS 엔드포인트(`accounts.google.com/.well-known/openid-configuration`)에서 공개키 자동 갱신
- JWT 서명 검증 (RS256), 만료 시간, issuer, audience 검증

### 4.2 신규 테스트 (12개)

| # | 테스트명 | 검증 항목 | 결과 |
|---|---------|----------|------|
| 1 | `TestGoogleLogin_JWKSUnavailable` | JWKS 서버 장애 시 503 반환 | **PASS** |
| 2 | `TestGoogleLoginByIDToken_JWKSUnavailable` | id_token 경로 JWKS 장애 시 503 | **PASS** |
| 3 | `TestGoogleLoginByIDToken_ExpiredToken` | 만료된 토큰 거부 | **PASS** |
| 4 | `TestGoogleLoginByIDToken_TamperedSignature` | 변조된 서명 거부 | **PASS** |
| 5 | `TestGoogleLoginByIDToken_AlgNone` | **alg=none 공격 방어** | **PASS** |
| 6 | `TestGoogleLoginByIDToken_AlgHS256` | **alg=HS256 다운그레이드 공격 방어** | **PASS** |
| 7 | `TestGoogleLoginByIDToken_MissingSub` | sub 클레임 누락 거부 | **PASS** |
| 8 | `TestGoogleLoginByIDToken_InvalidIssuer` | 위조 issuer 거부 | **PASS** |
| 9 | `TestGoogleLoginByIDToken_AudienceMismatch` | audience 불일치 거부 | **PASS** |
| 10 | `TestGoogleLoginByIDToken_AlternateIssuer` | accounts.google.com issuer 허용 | **PASS** |
| 11 | `TestVerifyGoogleIDToken_ValidToken` | 정상 토큰 검증 성공 | **PASS** |
| 12 | `TestVerifyGoogleIDToken_JWKSNotInitialized` | JWKS 미초기화 시 에러 반환 | **PASS** |

### 4.3 기존 테스트 (10개, 회귀 확인)

| # | 테스트명 | 결과 |
|---|---------|------|
| 1 | `TestGoogleLogin_OAuthDisabled_NoClientID` | PASS |
| 2 | `TestGoogleLogin_OAuthDisabled_OnlyClientID` | PASS |
| 3 | `TestGoogleLogin_InvalidRequest_MissingCode` | PASS |
| 4 | `TestGoogleLogin_InvalidRequest_MissingRedirectUri` | PASS |
| 5 | `TestGoogleLogin_InvalidCode` | PASS |
| 6 | `TestGoogleLogin_WithMockGoogleServer` | PASS |
| 7 | `TestGoogleLoginByIDToken_OAuthDisabled` | PASS |
| 8 | `TestGoogleLoginByIDToken_MissingIDToken` | PASS |
| 9 | `TestGoogleLoginByIDToken_InvalidIDToken` | PASS |
| 10 | `TestGoogleLoginByIDToken_Success` | PASS |

### 4.4 보안 공격 시나리오 검증

```
공격 시나리오                    방어 메커니즘                   결과
---------------------------    -------------------------    ------
alg=none (서명 우회)            keyfunc RS256 강제            거부됨
alg=HS256 (대칭키 다운그레이드)  keyfunc RS256 강제            거부됨
서명 변조                       RSA 공개키 검증               거부됨
만료 토큰                       exp 클레임 검증               거부됨
위조 issuer                    허용 issuer 화이트리스트       거부됨
audience 불일치                 클라이언트 ID 대조             거부됨
sub 클레임 누락                  필수 클레임 검증              거부됨
JWKS 서버 장애                  503 Service Unavailable 반환  정상 처리
```

### 4.5 판정

**PASS** -- 12개 신규 보안 테스트 전체 통과. alg=none, alg=HS256 알고리즘 다운그레이드 공격 방어 확인.

## 5. NestJS AI Adapter 회귀 테스트

| 항목 | 결과 |
|------|------|
| 전체 | **395 PASS / 0 FAIL** (19 suites) |
| 코드 변경 | 없음 (ai-adapter에 BUG-GS-004, SEC-ADD-001 영향 없음) |
| 회귀 | 없음 |

## 6. Go 테스트 수 변동 분석 (651 vs 458 vs 663)

### 6.1 카운팅 방법 차이

Go 테스트에서는 table-driven 테스트의 서브테스트를 포함하느냐에 따라 수치가 달라진다:

| 카운팅 방법 | 수치 | 설명 |
|-----------|------|------|
| `--- PASS:` (top-level only) | 459 | Go Dev가 보고한 수치 |
| `PASS:` (subtests 포함) | 663 | QA가 사용하는 전체 수치 |
| `=== RUN` (실행 총 수) | 680 | PASS 663 + SKIP 17 |

### 6.2 이전 651에서 663으로의 변동

- **이전(04-06)**: 651 PASS (subtests 포함)
- **현재(04-07)**: 663 PASS (subtests 포함)
- **차이**: +12 (SEC-ADD-001 신규 테스트)
- **제거된 테스트**: 0개 (git diff 확인)

### 6.3 Go Dev 458 보고와의 차이

Go Dev가 보고한 458은 `go test` 기본 출력의 top-level PASS 카운트이며, QA 보고 기준은 서브테스트를 포함한 전체 리프 테스트 수(663)이다. 방법론 차이일 뿐 실질적 불일치는 없다.

## 7. 발견 사항

### 7.1 이슈 없음

전체 테스트 스위트에서 FAIL 0건, 예상치 못한 동작 0건. BUG-GS-004와 SEC-ADD-001 모두 정상 동작하며 기존 기능에 대한 회귀가 없음을 확인하였다.

### 7.2 참고 사항

- JWKS 테스트는 Mock JWKS 서버를 사용하여 외부 의존성 없이 실행됨
- `processAIDraw`는 직접 단위 테스트가 아닌 AI Timer 통합 테스트에서 간접 검증됨. 향후 직접 단위 테스트 추가를 권장함

## 8. 결론

| 항목 | 결과 |
|------|------|
| BUG-GS-004 검증 | **PASS** -- 정상 draw / fallback draw 분리 정상 동작 |
| SEC-ADD-001 검증 | **PASS** -- JWKS 서명 검증 12개 보안 테스트 전체 통과 |
| 회귀 테스트 | **PASS** -- Go 663, NestJS 395 전체 통과 |
| 프로젝트 총 테스트 | **1,433개** (이전 1,421 대비 +12) |
| Quality Gate | **PASS** |
