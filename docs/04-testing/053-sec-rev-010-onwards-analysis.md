# SEC-REV-010+ 착수 검토 및 위험도 매트릭스

- **일시**: 2026-04-14 (Sprint 6 Day 3)
- **작성자**: security-1
- **상위 문서**: `docs/04-testing/36-security-review-phase1.md`
- **목적**: Phase 1 리뷰에서 식별된 SEC-REV-010~012 항목 및 Sprint 5~6 운영 과정에서 추가로 발견된 미확정 리스크를 종합, Sprint 6 처리 범위를 결정

---

## 1. Executive Summary

| 구분 | 건수 |
|------|------|
| 기존 식별 (Phase 1 문서) | 3 (SEC-REV-010/011/012) |
| 신규 제안 (A3 감사 추가) | 5 (SEC-REV-013~017) |
| **전체 분석 대상** | **8** |

| 우선순위 | 건수 | 분류 |
|---------|------|------|
| Sprint 6 In-scope (즉시 처리 권장) | 3 | SEC-REV-004, SEC-REV-010, SEC-REV-013 |
| Sprint 6 Stretch (시간 남으면) | 2 | SEC-REV-005 확정, SEC-REV-014 |
| Sprint 7 Deferred | 3 | SEC-REV-011, SEC-REV-015, SEC-REV-016 |
| Deferred / 프로덕션 컷오버 시점 | 2 | SEC-REV-006, SEC-REV-012 |

핵심 권고: **SEC-REV-010 (에러 메시지 sanitization)**은 SEC-REV-009 panic recover가 user-facing 경로로 확산될 가능성을 대비해 **Sprint 6 내 처리 필수**. SEC-REV-013 (dependency audit)은 npm audit / go vet가 CI에 이미 존재하므로 **검증만으로 완료** 가능.

---

## 2. 전체 항목 위험도 매트릭스

| ID | 카테고리 | 심각도 | CVSS (추정) | 공수 (일) | 우선순위 | 배정 제안 | OWASP Top10 |
|----|---------|-------|------------|----------|---------|----------|-------------|
| SEC-REV-004 | CSP unsafe-eval | **High** | 7.5 | 3 | Sprint 6 | frontend-dev | A05 |
| SEC-REV-010 | 에러 메시지 sanitization | Medium | 5.3 | 1 | **Sprint 6** | security-1 / go-dev | A09 |
| SEC-REV-013 | 의존성 Critical/High CVE 검증 | High | N/A | 0.5 | **Sprint 6** | security-1 | A06 |
| SEC-REV-005 | CSP connect-src 와일드카드 | Medium | 4.3 | 1 | Sprint 6 Stretch | frontend-dev | A05 |
| SEC-REV-014 | WS 세션 TTL 재검토 (2h) | Medium | 4.3 | 1 | Sprint 6 Stretch | go-dev | A07 |
| SEC-REV-011 | Chat 서버측 HTML escape | Low | 3.1 | 2 | Sprint 7 | go-dev | A03 |
| SEC-REV-015 | 로그 PII/token redaction | Medium | 4.3 | 2 | Sprint 7 | security-1 | A09 |
| SEC-REV-016 | JWT token rotation / refresh | Medium | 5.0 | 3 | Sprint 7 | go-dev | A07 |
| SEC-REV-003 | Rate limit Reason 노출 | Low | 2.7 | 0.5 | Sprint 7 | go-dev | A04 |
| SEC-REV-006 | HSTS 미적용 | Low | N/A | 0.5 | 프로덕션 | devops | A05 |
| SEC-REV-012 | CheckOrigin 빈 Origin 허용 | Info | 3.1 | 1 | 프로덕션 | go-dev | A07 |
| SEC-REV-017 | WS 세션 Redis key 충돌 검증 | Info | 2.0 | 1 | Sprint 7 | go-dev | A04 |

---

## 3. 개별 항목 상세

### 3.1 SEC-REV-010: 에러 메시지에 사용자 입력 반영 [Medium]

**현황**: Phase 1 문서에서 Low로 분류되었으나, SEC-REV-009 panic recover 경로에서 panic value(`zap.Any("panic", r)`)를 그대로 로그에 기록하는 점을 고려할 때 **Medium으로 상향 제안**.

**취약 시나리오**:
1. 악성 클라이언트가 `placeTiles` 페이로드에 거대 문자열 또는 zero-width character 포함
2. Engine validator가 `fmt.Errorf("invalid tile code: %s", userInput)` 형태로 error 생성
3. 해당 error가 broadcast 경로에 실리면 다른 플레이어 로그에도 전파

**현재 코드 상태**:
- `ws_hub.go:172` 주석 — "Do NOT include the panic value verbatim in messages sent to clients" (작성자 의식 확인됨, 원칙적 방어)
- 그러나 engine 에러 메시지는 아직 **user input echo를 sanitize하지 않음**

**수정 방향**:
1. Engine 에러 반환 시 user-facing 메시지는 고정 문자열, 상세 사유는 서버 로그에만
2. `fmt.Errorf(...%s, userInput)` 패턴 grep로 스캔 → 최소 sanitize(`strconv.Quote` + 길이 제한)
3. zap logger는 `zap.ByteString` 대신 `zap.String` + 자체 escape

**예상 공수**: 1일 (grep → 15곳 내외 수정 + 단위테스트)
**배정**: security-1 or go-dev
**OWASP**: A09:2021 Security Logging and Monitoring Failures (+ A03 Injection 관점)

---

### 3.2 SEC-REV-013: 의존성 Critical/High CVE 검증 [High — 신규]

**배경**: Sprint 5 W1까지 CI에 `npm audit` / `go vet`가 있지만 Critical/High 0건 기준이 **실제로 게이트되고 있는지 미확인**. Trivy scan 결과만 확인되고 있고, 코드 레벨 의존성 감사 보고서가 부재.

**확인 방법**:
1. `src/frontend`, `src/ai-adapter`, `src/admin` — `npm audit --audit-level=high --json`
2. `src/game-server` — `govulncheck ./...` (Go vuln DB 기반, `go vet`보다 정확)
3. 결과를 `docs/04-testing/51-dependency-audit-2026-04-14.md`에 기록

**공수**: 0.5일 (자동 도구 실행 + 결과 기록)
**배정**: security-1
**OWASP**: A06:2021 Vulnerable and Outdated Components
**Note**: Sprint 6 Day 3에 **security-1이 직접 실행하여 당일 완료** 제안

---

### 3.3 SEC-REV-011: Chat 서버측 HTML escape 미적용 [Low → Sprint 7]

**현황**: React JSX가 기본적으로 `{chatMessage}` 형태에서 escape하므로 현재 XSS 루트는 없음. 하지만:
- 관리자 대시보드에서 `dangerouslyInnerHTML`로 렌더링할 가능성 (미확인)
- 카카오톡 알림으로 채팅 내용을 그대로 전달 시 플랫폼별 escape 차이

**방어 방향**: game-server에서 chat payload를 받을 때 `html.EscapeString` 적용 + 길이 제한(이미 100자 추정, 재확인 필요)

**공수**: 2일 (escape + 테스트 + 관리자 UI 검증)
**배정**: go-dev
**Sprint 7로 이월 이유**: React 기본 방어가 현재는 유효, Sprint 6 우선순위 뒤

---

### 3.4 SEC-REV-012: CheckOrigin 빈 Origin 허용 [Info → 프로덕션 컷오버]

**현재 코드** (`ws_handler.go:33-48`):
```go
CheckOrigin: func(r *http.Request) bool {
    origin := r.Header.Get("Origin")
    if origin == "" {
        return true // non-browser client (curl, server-to-server)
    }
    ...
}
```

**평가**:
- 현재 JWT AUTH가 상위 방어로 작동하므로 CSRF 위험 낮음
- 그러나 프로덕션 환경(공개 도메인)에서는 DNS rebinding / 비 브라우저 worm 취약점
- **프로덕션 컷오버 체크리스트**에 등록 — 변경 시 non-browser 클라이언트(테스트 스크립트) 영향 확인 필요

**공수**: 1일 (전환 + 기존 스크립트 마이그레이션)
**배정**: go-dev
**Gate**: 프로덕션 배포 직전 Sprint

---

### 3.5 SEC-REV-014: WS 세션 TTL 2시간 재검토 [Medium — 신규]

**현재 코드** (`ws_handler.go:51`): `wsSessionTTL = 2 * time.Hour`

**평가**:
- 80턴 완주 게임이 ~1h20m (DeepSeek Run 3 기준), safety margin 1.5배
- 하지만 **JWT 만료와 WS 세션 TTL이 독립**하여 JWT 기간(현재 확인 필요) 초과 시 재연결 불가
- 사용자가 장시간 ponder 시 (4인 방) 120분 초과 가능성 — **강제 기권** 위험

**권고**:
1. 게임 예상 최대 시간(4인 thinking time 고려) 재산출
2. JWT 만료 + 세션 TTL 관계 명시
3. TTL 동적 연장 or refresh 메커니즘 고려

**공수**: 1일 (산출 + 설정 외부화)
**배정**: go-dev
**OWASP**: A07:2021 Identification and Authentication Failures
**Sprint 6 Stretch**

---

### 3.6 SEC-REV-015: 로그 PII/token redaction [Medium — 신규]

**배경**: 행동 원칙 4 "로그에 토큰/API 키 절대 출력 안 함" 준수 여부 **미감사**.

**확인 방법**:
1. `grep -rn "zap.String\|zap.Any" src/game-server/internal/` → token/password/authorization 포함 필드 스캔
2. `grep -rn "console.log\|logger\." src/ai-adapter/src/` → LLM API 키 포함 가능 경로
3. 발견된 경우 `***REDACTED***` 또는 해시 처리

**공수**: 2일 (감사 0.5일 + 수정 1.5일)
**배정**: security-1
**OWASP**: A09:2021 Security Logging and Monitoring Failures
**Sprint 7 이월 사유**: 현재 Critical 노출 확인 안 된 상태, 감사 필요. Sprint 6은 SEC-REV-010과 함께 하면 공수 과대.

---

### 3.7 SEC-REV-016: JWT token refresh / rotation [Medium — 신규]

**배경**: 현재 JWT는 단순 만료만 있고 **rotation 메커니즘 부재**. SEC-ADD-001 JWKS는 **서버 서명 키 회전** 목적이며, **클라이언트 토큰 rotation**은 별도 이슈.

**취약점**:
- 장기간 활성 토큰이 leak될 경우 만료까지 재사용 가능
- OAuth refresh token + access token 분리 패턴 부재

**권고**: Sprint 7에 Google OAuth refresh flow 도입
**공수**: 3일
**OWASP**: A07:2021

---

### 3.8 SEC-REV-017: WS 세션 Redis key 충돌 검증 [Info — 신규]

**배경**: Redis session key 충돌 가능성 — `ws_handler.go`의 세션 패턴 미감사.

**확인**: Redis SCAN으로 중복 사용자 ID의 세션 key 존재 여부 검사
**공수**: 1일
**Sprint 7**

---

### 3.9 기존 항목 (SEC-REV-003/004/005/006) 상태 업데이트

| ID | 원 상태 | 2026-04-14 상태 |
|----|--------|----------------|
| SEC-REV-003 | Sprint 6 예정 | 미착수 — Low, Sprint 7 이월 권장 (실제 보안 영향 미미) |
| SEC-REV-004 | Sprint 6 예정 | **미착수 — High, Sprint 6 처리 필요** (frontend-dev 배정) |
| SEC-REV-005 | Sprint 5 W2 예정 | 미착수 — frontend-dev 배정, SEC-REV-004와 동시 처리 권장 |
| SEC-REV-006 | 프로덕션 | 그대로 유지 |

---

## 4. Sprint 6 처리 권고안

### 4.1 즉시 처리 (Day 3~5)
1. **SEC-REV-013** (0.5일, security-1) — 의존성 감사 당일 실행
2. **SEC-REV-010** (1일, security-1/go-dev) — 에러 메시지 user input echo 제거

### 4.2 Sprint 6 내 처리 (Day 5~8)
3. **SEC-REV-004** (3일, frontend-dev) — CSP unsafe-eval 제거 (Next.js 14+ nonce 기반)
4. **SEC-REV-005** (1일, frontend-dev) — connect-src 특정화 (SEC-REV-004와 병행)

### 4.3 Sprint 6 Stretch
5. **SEC-REV-014** (1일, go-dev) — WS 세션 TTL 재산출

### 4.4 Sprint 7 이월 확정
- SEC-REV-003 (rate limit reason 노출 — Low, 실 영향 미미)
- SEC-REV-011 (chat escape — React 기본 방어 유효)
- SEC-REV-015 (로그 PII redaction — 감사 먼저 필요)
- SEC-REV-016 (JWT refresh — 설계 변경)
- SEC-REV-017 (Redis key 충돌 — 감사 필요)

### 4.5 프로덕션 컷오버 시점
- SEC-REV-006 (HSTS — Traefik 설정)
- SEC-REV-012 (CheckOrigin 강화 — 비 브라우저 클라이언트 마이그레이션 필요)

---

## 5. Istio PeerAuth STRICT 영향 분석 (A1 인계용)

**결론**: **ai-adapter에 PeerAuth STRICT 적용 시 인증 체인 이중 검증 문제 없음**. 다만 다음 3가지 사항을 확인 후 적용할 것.

### 5.1 분석
ai-adapter에 `peer-authentication-ai-adapter.yaml`의 STRICT 모드를 적용하면 mesh 외부(non-sidecar)에서 ai-adapter로 오는 트래픽은 전부 차단된다. 현재 설계상 ai-adapter는 **game-server(sidecar injected)에서만 호출**되므로 정상 통신 경로는 mTLS로 유지된다. 다만 **kubelet HTTP health probe**(liveness/readiness `/health`)는 mesh 외부에서 발생하는데, Istio 1.10+ 기본값인 `values.sidecarInjectorWebhook.rewriteAppHTTPProbe=true` 덕분에 sidecar가 kubelet probe를 자동 감지해 pod-local bypass로 rewrite한다 — 따라서 **probe는 mTLS를 거치지 않고 정상 작동**하며 STRICT 적용과 무관. ai-adapter의 현재 probe 경로는 HTTP `/health` (helm/charts/ai-adapter/values.yaml:41-51)로, rewrite 대상에 포함된다. **확인 필요 3가지**: ① istio install 시 `values.sidecarInjectorWebhook.rewriteAppHTTPProbe`가 명시적으로 `false`로 꺼져있지 않은지 (`istio-values.yaml` 확인), ② ai-adapter Pod annotation에 `sidecar.istio.io/rewriteAppHTTPProbers: "false"` override가 없는지, ③ CronJob/외부 스크립트에서 ai-adapter로 직접 호출(curl, admin 디버그 등)이 있는 경우 game-server 경유로 리팩터 or 해당 호출자를 mesh에 편입. 이 3가지가 OK면 STRICT 적용 가능하며, 인증 체인은 "Traefik → game-server(JWT 검증) → sidecar mTLS → ai-adapter"로 단순화되어 오히려 명확해진다.

### 5.2 체크리스트
- [ ] `istio-values.yaml`에서 `rewriteAppHTTPProbe` 값 확인 (기본 true)
- [ ] `helm/charts/ai-adapter/templates/deployment.yaml`에서 sidecar annotation override 없음 확인
- [ ] 외부에서 ai-adapter 직접 호출 없음 확인 (`grep -r "ai-adapter:3000" scripts/`)
- [ ] 적용 후 `istioctl authn tls-check game-server.<ns> ai-adapter.<ns>.svc.cluster.local` 확인

---

## 6. 다음 단계

1. 본 문서 리뷰 후 team-lead 승인
2. SEC-REV-013 감사 당일 착수
3. SEC-REV-010 이슈 생성 및 go-dev 배정
4. SEC-REV-004/005 frontend-dev 사전 공유
5. Sprint 7 백로그에 SEC-REV-011/015/016/017 추가

---

**종합**: Sprint 6 내 **3건 필수 + 2건 stretch**, Sprint 7 이월 **5건**, 프로덕션 컷오버 **2건**. 보안 상태는 **Critical 0 / High 1 Open (SEC-REV-004) / Medium 0 Open** 유지.
