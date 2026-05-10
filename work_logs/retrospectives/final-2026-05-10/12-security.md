# security — RummiArena 최종 회고

- **역할**: 보안 엔지니어 — DevSecOps, 보안 설계, 취약점 관리, 인증/인가 검토
- **프로젝트 기간**: 2026-03-08 ~ 2026-05-10 (약 63일)
- **작성일**: 2026-05-10

---

## 나는 누구였나

나는 프로젝트의 보안 파수꾼이었다.

코드가 기능적으로 동작하더라도 안전하지 않으면 의미가 없다. 사용자의 데이터가 유출되거나, 인증이 우회되거나, Rate Limit이 없어서 API가 남용되면 그 기능은 오히려 위험이 된다.

나는 "이 코드가 동작하는가?"가 아니라 "이 코드가 안전한가?"를 묻는 사람이었다.

---

## 전체 여정을 돌아보며

Sprint 1에서 보안의 기반을 잡았다. JWT_SECRET fail-fast(빈 문자열 시 기동 차단), CVE 수정 7건(next, multer, golang-jwt, x/crypto). 첫 Sprint에 보안을 포함한 것이 이후 프로젝트 전체의 보안 기준을 설정했다.

Sprint 4에서 보안 P0 5건을 처리했다. SQL injection 방어(GORM prepared statement), XSS 방어(Content-Type 헤더), 인증 없는 Admin API 보호, WebSocket 인증 검증, 개발 전용 dev-login 프로덕션 차단.

Sprint 5에서 Rate Limiting을 구현했다. REST: Redis Sliding Window Counter(10~60 req/min), WebSocket: In-memory Fixed Window(60 msg/min). AI 비용 한도도 이때 구현됐다(일일 $20, 시간당 사용자 $5).

Sprint 7에서 SEC-A, SEC-B, SEC-C를 완료했다:
- SEC-A: Go 1.24 → 1.25.9 + go-redis v9.7.3 업그레이드 (govulncheck code-called 25건 → 0건)
- SEC-B: Rate Limiting 강화
- SEC-C: 인증/인가 완전 분리 (OAuth 핸들러에서 프로필 정보 덮어쓰기 금지)

Sprint 7 말에 보안 부채 6건을 식별했다(SEC-DEBT-001~006). 모두 미해결 상태로 프로젝트가 종료됐다.

---

## 가장 힘들었던 순간

SEC-REV-009 처리였다.

WebSocket 연결 시 인증 토큰이 URL 쿼리 파라미터로 전달되는 구조가 있었다. 이것은 서버 로그에 토큰이 노출될 수 있는 취약점이다. 수정하려면 WebSocket 연결 프로토콜을 바꿔야 했고, 그것은 frontend-dev와 go-dev 양쪽 코드를 동시에 바꿔야 하는 작업이었다.

보안 패치는 단독으로 완료할 수 없는 경우가 많다. 여러 팀원의 코드를 동시에 바꿔야 하고, 그 과정에서 게임 흐름 회귀가 발생할 수 있다. "보안을 고치면서 기능이 깨지는" 딜레마가 있었다.

SEC-DEBT-003(WebSocket 인증 토큰 갱신)이 미해결로 남은 것이 가장 아쉽다.

---

## 가장 보람찼던 순간

SEC-A PR#54에서 govulncheck code-called 25건 → 0건이 됐을 때다.

Go 1.24 → 1.25.9, go-redis v9.7.3 업그레이드. 단순한 버전 업그레이드로 보일 수 있지만, 그 25건의 취약점들이 실제로 코드에서 호출되는 경로에 있었다. "코드에서 호출된다"는 것은 공격자가 악용할 수 있다는 뜻이다. 그것을 0건으로 만들었다.

그리고 Critical/High CVE 0건을 63일 내내 유지한 것. Trivy가 매 파이프라인마다 스캔하고, 새로운 취약점이 발견되면 즉시 패치했다. "보안 패치도 테스트한다"는 문화가 이 팀에 자리잡았다.

---

## 이 프로젝트에서 내가 성장한 것

**OAuth는 identity 확인만, 프로필은 별도 API에서.** SEC-C의 핵심이었다. 많은 프로젝트에서 OAuth 핸들러가 DisplayName, AvatarURL 같은 프로필 정보를 덮어쓴다. 이것은 의도치 않은 프로필 변경을 만든다. `docs/03-development/06-coding-conventions.md` §5.5에 명시된 이 원칙이 인증 설계의 SSOT가 됐다.

**보안 부채는 식별만으로는 부족하다.** SEC-DEBT-001~006을 식별했다. 하지만 6건 모두 미해결로 프로젝트가 종료됐다. 식별된 부채는 반드시 타임라인과 함께 처리 계획을 수립해야 한다. "나중에"는 없다.

**보안은 개발 속도의 적이 아니다.** Rate Limiting, 인증, JWT 검증. 이것들이 처음부터 설계에 포함됐기 때문에 개발 후반에 수정하는 비용이 없었다. 보안을 처음부터 포함하면 나중에 고치는 것보다 훨씬 빠르다.

---

## 애벌레에게 전하는 말

"보안 패치도 테스트한다"는 문화를 강제해주셔서 고맙습니다. 보안 패치는 빠르게 적용해야 한다는 압박 때문에 테스트를 건너뛰기 쉽습니다. 하지만 보안 패치가 회귀를 만들면 더 큰 문제가 된다. 그 원칙을 지켜주셨습니다.

SEC-DEBT-003(WebSocket 인증 토큰 갱신)이 미해결로 남은 것이 아쉽습니다. 다음에 이 시스템을 다시 다룬다면 그것부터 처리해야 합니다. WebSocket 연결에 만료된 토큰이 사용될 수 있는 상황입니다.

---

## 팀에게 전하는 말

devops에게: Trivy를 CI에 붙이는 것과 그 결과를 실제로 처리하는 것이 모두 필요합니다. 당신이 CI 인프라를 만들었고, 내가 그 결과를 처리했습니다. 협업이 없었다면 Critical/High 0건은 불가능했습니다.

go-dev에게: game-server의 SQL injection 방어(GORM prepared statement)와 API 인증 미들웨어가 보안 기반이었습니다. 서버 레벨에서 보안이 견고했기 때문에 애플리케이션 레벨 취약점 표면이 줄었습니다.

node-dev에게: ai-adapter의 Rate Limiting과 비용 한도 구현이 실제 운영에서 중요한 보안 제어입니다. LLM API 남용이 막혀있다는 것이 비용 보안의 핵심입니다.

frontend-dev에게: next-auth v4에서 v5로의 이주가 미완인 것이 SEC-DEBT-001입니다. 다음 버전에서 꼭 처리하면 좋겠습니다.
