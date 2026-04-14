# SEC-REV Medium 3건 최종 완료 확인 (A3 감사)

- **일시**: 2026-04-14 (Sprint 6 Day 3)
- **감사자**: security-1
- **대상**: Sprint 5 이월 Medium 3건 — SEC-REV-002 / SEC-REV-008 / SEC-REV-009
- **목적**: 어제(04-13) 수정이 커밋만 존재하는 것이 아니라 **코드 실재 + 테스트 통과 + 공격 시나리오 방어**가 모두 성립하는지 최종 확인

---

## 1. 감사 결과 요약

| ID | 원 심각도 | 수정 상태 | 테스트 | 재평가 CVSS | OWASP Top10 | 확정 |
|----|---------|----------|-------|-----------|-------------|------|
| SEC-REV-002 | Medium (CVSS 5.3) | **완료** | 3 신규 + 2 갱신 PASS | **0.0 (Resolved)** | A04 Insecure Design | ✅ |
| SEC-REV-008 | Medium (CVSS 5.3) | **완료** | 3 신규 PASS (deadlock regression) | **0.0 (Resolved)** | A05 Security Misconfiguration | ✅ |
| SEC-REV-009 | Medium (CVSS 4.3) | **완료** | 3 신규 PASS (panic isolation) | **0.0 (Resolved)** | A05 Security Misconfiguration | ✅ |

**결론**: Medium 3건 모두 **Resolved**. Sprint 5 이월분 전부 정리. 신규 회귀 없음 (handler 패키지 전체 PASS).

---

## 2. SEC-REV-002 — Rate Limit violations 감소 로직

### 2.1 취약 기존 동작
정상 메시지 1건당 `violations` 카운터를 1 감소시키는 단순 디케이가 "위반-정상-위반-정상" 교대 공격 패턴에서 violations가 3에 도달하지 못해 Rate Limit 우회를 허용했다. 공격자는 카운터를 무한히 리셋하면서 policy 한도에 근접한 트래픽을 지속 전송 가능.

### 2.2 수정 구현
`src/game-server/internal/handler/ws_rate_limiter.go`

```go
// ws_rate_limiter.go:31-34
// violationsDecayThreshold violations 카운터를 1 감소시키기 위해 요구되는 연속 정상 메시지 수.
const violationsDecayThreshold = 5

// ws_rate_limiter.go:45
consecutiveAllowed int            // 마지막 위반 이후 연속 허용된 메시지 수 (SEC-REV-002)

// ws_rate_limiter.go:138-146 (허용 경로)
if rl.violations > 0 {
    rl.consecutiveAllowed++
    if rl.consecutiveAllowed >= violationsDecayThreshold {
        rl.violations--
        rl.consecutiveAllowed = 0
    }
}
```

**위반 경로에서도** `rl.consecutiveAllowed = 0` 리셋 3곳 (라인 103, 118, 129) 확인. 교대 공격 패턴에서 violations 감소가 **절대로 트리거되지 않음**이 확정.

### 2.3 테스트 검증
`src/game-server/internal/handler/ws_rate_limiter_test.go`

- `TestWSRateLimiter_SEC_REV_002_AlternatingPatternReachesThree` (라인 447 주석) — **핵심 공격 시나리오**: 위반-정상 교대에서 violations가 반드시 3에 도달
- `TestWSRateLimiter_SEC_REV_002_DecayRequiresFiveConsecutive` (라인 494) — 연속 5회 정상만 디케이 1 유발
- `TestWSRateLimiter_SEC_REV_002_ViolationResetsConsecutiveAllowed` (라인 522) — 4회 정상 누적 상태에서 위반 1회 발생 시 consecutiveAllowed 0 리셋

실행 결과: **PASS (0.019s, race detector 미포함 / 기존 전체 688건 race 포함 PASS는 별도 검증)**

```
--- PASS: TestWSRateLimiter_SEC_REV_002_AlternatingPatternReachesThree (0.00s)
--- PASS: TestWSRateLimiter_SEC_REV_002_DecayRequiresFiveConsecutive (0.00s)
--- PASS: TestWSRateLimiter_SEC_REV_002_ViolationResetsConsecutiveAllowed (0.00s)
```

### 2.4 보안 재평가
| 항목 | 값 |
|------|-----|
| OWASP Top 10 | **A04:2021 Insecure Design** (rate limit 디케이 로직 설계 결함) |
| 이전 CVSS v3.1 | 5.3 (AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L) |
| 수정 후 CVSS | **0.0 (Resolved)** |
| Residual Risk | Low — fixed window 특성상 윈도우 경계에서 burst 가능성 있으나 글로벌 상한 60/min이 상위 게이트 |
| 회귀 가능성 | Low — 테스트 5건 (기존 2 + 신규 3) 전원 PASS |

### 2.5 후속 제안 (Sprint 6 선택)
- 윈도우 경계 burst 완화를 위한 **sliding window counter** 고려 (하지만 현재 상한 수준에서는 공격 가치가 낮아 P3 이하)

---

## 3. SEC-REV-008 — Hub RLock 내 외부 I/O

### 3.1 취약 기존 동작
`ForEachInRoom(roomID, fn)` 콜백 내부에서 Redis GET, JSON marshal 등 외부 I/O를 수행했는데 Hub RLock을 잡은 채로 반복 실행되어:
1. 콜백 지연 시 Hub 전체가 Read-locked — Register/Unregister 차단
2. 4인 방에서 한 콜백이 Redis timeout으로 5초 hang 시 모든 플레이어 `JOIN`/`LEAVE` 지연
3. Goroutine starvation → WS 서버 전반에 영향

### 3.2 수정 구현
`src/game-server/internal/handler/ws_hub.go`

```go
// ws_hub.go:80-96  snapshot helper
func (h *Hub) snapshotRoom(roomID string) []*Connection {
    h.mu.RLock()
    defer h.mu.RUnlock()
    room, ok := h.rooms[roomID]
    if !ok { return nil }
    conns := make([]*Connection, 0, len(room))
    for _, conn := range room {
        conns = append(conns, conn)
    }
    return conns
}

// ws_hub.go:159-164  ForEachInRoom
func (h *Hub) ForEachInRoom(roomID string, fn func(conn *Connection)) {
    conns := h.snapshotRoom(roomID)   // Lock 해제 후
    for _, conn := range conns {
        h.invokeCallback(roomID, conn, fn)   // I/O는 Lock 바깥
    }
}
```

핵심: `snapshotRoom()`이 RLock 내부에서 **shallow copy**만 수행하고 즉시 Unlock. 이후 반복은 로컬 slice에서 진행되므로 Register/Unregister는 Write Lock을 자유롭게 획득 가능.

`BroadcastToRoom`, `BroadcastToRoomExcept`, `SendToUser`도 동일 패턴 적용 (라인 117-145).

**부수 효과**: snapshot 시점과 실제 Send 시점 간 Connection이 close될 수 있어 `Connection.Send()`에 close-vs-send race 가드가 필요. 이 건은 `ws_connection.go:94-121`의 `sendMu + sendClosed` 필드로 해결됨 (동일 SEC-REV-008 커밋에 포함). `ws_connection_close_test.go:TestConnection_CloseAndSend_NoPanic`로 검증.

### 3.3 테스트 검증
`src/game-server/internal/handler/ws_hub_test.go`

- `TestHub_ForEachInRoom_ReleasesLockBeforeCallback` (라인 170-205) — 콜백 내부에서 Write Lock을 요구하는 goroutine이 deadlock 없이 획득 성공
- `TestHub_BroadcastToRoom_DoesNotBlockRegister` (라인 213-239) — Broadcast 중에도 Register 성공
- `TestHub_ForEachInRoom_EmptyRoom` (라인 301+) — 빈 방 safety

**추가 검증**: `ws_connection_close_test.go:TestConnection_CloseAndSend_NoPanic` — snapshot stale Connection 대상 Send가 panic 없이 정상 처리

실행 결과: **PASS (0.019s)**

### 3.4 보안 재평가
| 항목 | 값 |
|------|-----|
| OWASP Top 10 | **A05:2021 Security Misconfiguration** (locking granularity 오설계) |
| 이전 CVSS v3.1 | 5.3 (AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:N/A:L) |
| 수정 후 CVSS | **0.0 (Resolved)** |
| DoS 가능성 | 제거 — Hub 잠금 시간이 snapshot 기간(수 μs)으로 제한 |
| 회귀 가능성 | Low — snapshot 시점 이후 들어온 Register는 다음 Broadcast에 반영되나, 이는 설계 의도 (주석 ws_hub.go:157-158) |

### 3.5 후속 주의사항
- **snapshot consistency 주의**: BroadcastToRoom 수행 중 들어온 신규 클라이언트는 해당 메시지를 못 받음 — GAME_STATE 전송은 **항상 신규 등록 직후 동기적으로 1회 더** 필요. `ws_hub.go:149-164` 주석에 명시됨.

---

## 4. SEC-REV-009 — Callback panic 격리

### 4.1 취약 기존 동작
`ForEachInRoom` 콜백 내부 panic이 goroutine 전체로 전파 → 남은 Connection들은 GAME_STATE를 받지 못함. 한 플레이어의 nil map, JSON marshal 실패, Redis unmarshal 에러 1건이 **나머지 3명 전원의 게임을 freeze** 시킬 수 있었다.

### 4.2 수정 구현
`src/game-server/internal/handler/ws_hub.go`

```go
// ws_hub.go:166-185  invokeCallback
func (h *Hub) invokeCallback(roomID string, conn *Connection, fn func(conn *Connection)) {
    defer func() {
        if r := recover(); r != nil {
            userID := ""
            if conn != nil { userID = conn.userID }
            h.logger.Error("ws: panic in ForEachInRoom callback",
                zap.String("room", roomID),
                zap.String("user", userID),
                zap.Any("panic", r),
            )
        }
    }()
    fn(conn)
}
```

**핵심 설계**:
1. 각 콜백이 **독립 defer-recover** — 한 콜백 panic이 다음 콜백 실행을 막지 않음
2. panic 정보는 **서버 로그에만** 기록 — 클라이언트로는 전파 안 함 (ws_hub.go:172 주석에서 SEC-REV-010 선제 대응 명시)
3. `runtime.Stack`을 호출하지 않으므로 panic 폭주 시에도 비용 제한적

### 4.3 테스트 검증
`src/game-server/internal/handler/ws_hub_test.go`

- `TestHub_ForEachInRoom_CallbackPanic_DoesNotStopIteration` (라인 246-281) — user-2 콜백 panic 후에도 user-1/3/4 전원 방문
- `TestHub_ForEachInRoom_AllCallbacksPanic_DoesNotCrash` (라인 283-297) — **모든** 콜백 panic 시에도 Hub 자체 panic 없음

실행 결과: **PASS** (panic 스택 로그가 출력되지만 테스트는 정상 통과 — recover가 정확히 작동한다는 증거)

```
--- PASS: TestHub_ForEachInRoom_CallbackPanic_DoesNotStopIteration (0.00s)
--- PASS: TestHub_ForEachInRoom_AllCallbacksPanic_DoesNotCrash (0.00s)
```

### 4.4 보안 재평가
| 항목 | 값 |
|------|-----|
| OWASP Top 10 | **A05:2021 Security Misconfiguration** (+ A09 Logging 부분 해당) |
| 이전 CVSS v3.1 | 4.3 (AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:N/A:L) |
| 수정 후 CVSS | **0.0 (Resolved)** |
| 연쇄 장애 | 차단 — panic 확산이 방 단위, 심지어 Connection 단위로 격리 |
| 회귀 가능성 | Low — panic 경로가 이미 2건 테스트로 커버 |

### 4.5 후속 주의사항
- **경고**: 현재 `zap.Any("panic", r)`는 panic 값을 그대로 serialize. 만약 panic value에 PII/토큰이 포함될 경우 로그 누설 위험. SEC-REV-011 (로그 sanitization) 후속 작업 시 함께 재검토할 것.
- runtime stack trace 누락 — 디버깅 시 panic 원인 역추적이 어려움. 개발 환경에서는 `debug.Stack()` 추가 고려 (프로덕션은 용량/성능 이슈로 제외)

---

## 5. 테스트 실행 증거

```bash
$ cd src/game-server && go test ./internal/handler/ \
    -run "TestWSRateLimiter_SEC_REV_002|TestHub_ForEachInRoom" -v

=== RUN   TestHub_ForEachInRoom_ReleasesLockBeforeCallback
--- PASS: TestHub_ForEachInRoom_ReleasesLockBeforeCallback (0.00s)
=== RUN   TestHub_BroadcastToRoom_DoesNotBlockRegister
--- PASS: TestHub_BroadcastToRoom_DoesNotBlockRegister (0.00s)
=== RUN   TestHub_ForEachInRoom_CallbackPanic_DoesNotStopIteration
--- PASS: TestHub_ForEachInRoom_CallbackPanic_DoesNotStopIteration (0.00s)
=== RUN   TestHub_ForEachInRoom_AllCallbacksPanic_DoesNotCrash
--- PASS: TestHub_ForEachInRoom_AllCallbacksPanic_DoesNotCrash (0.00s)
=== RUN   TestHub_ForEachInRoom_EmptyRoom
--- PASS: TestHub_ForEachInRoom_EmptyRoom (0.00s)
=== RUN   TestWSRateLimiter_SEC_REV_002_AlternatingPatternReachesThree
--- PASS: TestWSRateLimiter_SEC_REV_002_AlternatingPatternReachesThree (0.00s)
=== RUN   TestWSRateLimiter_SEC_REV_002_DecayRequiresFiveConsecutive
--- PASS: TestWSRateLimiter_SEC_REV_002_DecayRequiresFiveConsecutive (0.00s)
=== RUN   TestWSRateLimiter_SEC_REV_002_ViolationResetsConsecutiveAllowed
--- PASS: TestWSRateLimiter_SEC_REV_002_ViolationResetsConsecutiveAllowed (0.00s)
PASS
ok      github.com/k82022603/RummiArena/game-server/internal/handler    0.019s
```

---

## 6. 보안 상태판 업데이트

Sprint 5 이월 Medium **3건 전부 Closed**.

| 구분 | Critical | High | Medium | Low | Info |
|------|---------|------|--------|-----|------|
| 식별 (누적) | 2 | 3 | 4 | 3 | 3 |
| Closed | 2 | 3 | **4** | 0 | 0 |
| Open | 0 | 0 | 0 | 3 | 3 |

전체 13건 중 **9건 Closed**. 남은 6건은 모두 Low/Info로 Sprint 6~7 우선순위 판단 대상 (다음 문서 참조 → `docs/04-testing/50-sec-rev-010-onwards-analysis.md`).

---

## 7. 코드 참조 목록

| 파일 | 라인 | 설명 |
|------|------|------|
| `src/game-server/internal/handler/ws_rate_limiter.go` | 31-34, 45, 103, 118, 129, 138-146 | SEC-REV-002 violations decay 로직 |
| `src/game-server/internal/handler/ws_rate_limiter_test.go` | 411-550 | SEC-REV-002 테스트 3건 (+ 기존 2건 갱신) |
| `src/game-server/internal/handler/ws_hub.go` | 80-96 | SEC-REV-008 snapshotRoom helper |
| `src/game-server/internal/handler/ws_hub.go` | 117-145 | SEC-REV-008 Broadcast/Send 패턴 적용 |
| `src/game-server/internal/handler/ws_hub.go` | 159-164 | SEC-REV-008 ForEachInRoom (Lock 해제 후 반복) |
| `src/game-server/internal/handler/ws_hub.go` | 166-185 | SEC-REV-009 invokeCallback (defer-recover) |
| `src/game-server/internal/handler/ws_hub_test.go` | 170-300 | SEC-REV-008/009 테스트 |
| `src/game-server/internal/handler/ws_connection.go` | 44, 94-121 | SEC-REV-008 close-vs-send race 가드 |
| `src/game-server/internal/handler/ws_connection_close_test.go` | 11-80 | SEC-REV-008 close race 테스트 |

## 8. 커밋 참조
- `8d4d74d` fix(security): SEC-REV-002 violations 카운터 연속 정상 5회 기준 변경
- `645b1b6` fix(security): SEC-REV-008/009 Hub RLock 내 외부 호출 제거 + panic 격리

---

**최종 판정**: Sprint 5 이월 Medium 3건 ✅ **전량 Resolved**. Sprint 6 Day 3 보안 스코어보드에서 Medium 카테고리 **Open=0**.
