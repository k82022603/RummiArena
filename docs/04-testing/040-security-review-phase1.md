# Phase 1 보안 코드 리뷰

- **날짜**: 2026-04-06
- **리뷰어**: Security Agent
- **대상**: SEC-RL-003, SEC-ADD-002, BUG-WS-001

## 리뷰 요약

| 심각도 | 건수 |
|--------|------|
| Critical | 0 |
| High | 2 |
| Medium | 4 |
| Low | 3 |
| Info | 3 |
| **합계** | **12** |

Critical 이슈는 없다. High 2건은 즉시 수정이 필요하며, Medium 4건은 Sprint 5~6 내 수정을 권장한다.

---

## SEC-RL-003: WS Rate Limiter

### [PASS] Race Condition
`sync.Mutex`로 `check()`와 `reset()` 모두 올바르게 보호된다. `defer rl.mu.Unlock()` 패턴 사용.

### [PASS] 메모리 누수
rate limiter는 Connection 필드로, Connection GC 시 함께 해제. Hub `Unregister()`와 ReadPump `defer` 블록이 참조 제거를 보장.

### [HIGH] SEC-REV-001: 미등록 메시지 타입의 Rate Limit 바이패스

`ws_rate_limiter.go` — 정책 테이블에 없는 메시지 타입은 타입별 한도 검사를 건너뛰고 글로벌 카운터(60/min)만 적용된다. 공격자가 미등록 타입 60건/min을 보내면서 서버 리소스를 소모하는 공격 벡터.

**수정**: 정책 테이블에 없는 타입은 글로벌 카운터 증가 없이 즉시 거부하고 violations 증가.

### [MEDIUM] SEC-REV-002: 위반 카운터 감소 로직

정상 메시지 허용 시 violations가 1씩 감소하므로, 위반-정상-위반-정상 패턴으로 violations가 3에 도달하지 않는다.

### [PASS] DDoS 내성
per-connection 약 200-300바이트. WS 업그레이드 Rate Limit + Hub 중복 차단 + maxMessageSize(8KB) 다층 방어.

### [LOW] SEC-REV-003: 에러 응답에 rate limit 정책 정보 노출

`result.Reason` 값을 클라이언트에 전달하여 정책 구조 역추산 가능. 메시지를 일반화할 것.

---

## SEC-ADD-002: 보안 응답 헤더

### [HIGH] SEC-REV-004: CSP unsafe-inline + unsafe-eval

`script-src 'self' 'unsafe-inline' 'unsafe-eval'`은 CSP의 XSS 방어를 크게 약화. Next.js 14+의 nonce 기반 CSP를 중기 과제로 권장. 현 단계에서는 `unsafe-eval` 제거 테스트 필요.

### [MEDIUM] SEC-REV-005: connect-src ws:/wss: 와일드카드

`ws:` `wss:`가 모든 호스트를 허용. XSS 발생 시 외부 WS 서버로 데이터 유출 가능. `ws://localhost:*`로 특정할 것.

### [LOW] SEC-REV-006: HSTS 미적용
로컬 개발 환경이므로 현재는 정상. 프로덕션 배포 시 Traefik에서 적용.

### [PASS] frame-ancestors/X-Frame-Options
일관성 확인. Clickjacking 방어 올바름.

---

## BUG-WS-001: GameStartNotifier

### [PASS] 인증 검증
Hub에 등록된(인증 완료된) Connection에만 접근. 미인증 연결 차단.

### [MEDIUM] SEC-REV-008: Hub RLock 내 외부 호출
ForEachInRoom 콜백에서 Redis 호출 실행. Hub RLock이 오래 유지될 수 있다.

### [MEDIUM] SEC-REV-009: panic 전파 가능성
ForEachInRoom 콜백 내 panic이 전체 루프를 중단. 방어적 recover 추가 권장.

### [PASS] 경합 조건
REST 핸들러 내 동기 호출로 올바른 순서 보장.

---

## 추가 발견

| ID | 심각도 | 설명 |
|----|--------|------|
| SEC-REV-010 | Low | 에러 메시지에 사용자 입력 반영 |
| SEC-REV-011 | Info | Chat 메시지 서버측 이스케이프 미적용 (React JSX 기본 이스케이프 의존) |
| SEC-REV-012 | Info | CheckOrigin에서 Origin 비어 있으면 허용 (JWT AUTH 보완) |

---

## 수정 우선순위

| ID | 심각도 | 설명 | 기한 |
|----|--------|------|------|
| SEC-REV-001 | **High** | 미등록 타입 rate limit 바이패스 | Sprint 5 W2 즉시 |
| SEC-REV-004 | **High** | CSP unsafe-eval (Next.js 제약으로 중기) | Sprint 6 |
| SEC-REV-005 | **Medium** | connect-src ws: 와일드카드 | Sprint 5 W2 |
| SEC-REV-002 | Medium | 위반 감소 로직 | Sprint 6 |
| SEC-REV-008 | Medium | Hub RLock 내 외부 호출 | Sprint 6 |
| SEC-REV-009 | Medium | panic 전파 가능성 | Sprint 6 |
| SEC-REV-003 | Low | rate limit 정책 정보 노출 | Sprint 6 |
| SEC-REV-006 | Low | HSTS 미적용 | 프로덕션 배포 |
| SEC-REV-010 | Low | 에러 메시지에 사용자 입력 | Sprint 6 |
