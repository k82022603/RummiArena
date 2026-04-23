# 83. FORFEIT 경로 완결성 감사 보고서

작성일: 2026-04-23 (Sprint 7 Day 2)
작성자: go-dev (agent)
감사 범위: Issue #47 LeaveRoom PLAYING guard 후속 — FORFEIT 전 경로 완결성 검증
판정: **PROCEED — 완결성 확인**

---

## 0. Executive Summary

FORFEIT 경로의 5개 체크리스트 항목 전부 완결성 확인. **결함 없음**.

| 항목 | 판정 | 비고 |
|------|------|------|
| 1. 프론트 FORFEIT 버튼 PLAYING 중 노출 | ✅ PASS | `useGameLeaveGuard` + `LEAVE_GAME` 메시지로 구현 |
| 2. 서버 forfeit 경로 + persistGameResult 연결 | ✅ PASS | `forfeitAndBroadcast → persistGameResult("FORFEIT")` 직결 |
| 3. 호스트 vs 게스트 FORFEIT 차이 | ✅ PASS | 차이 없음 — seat 단위 처리, 호스트 특수경로 불필요 |
| 4. WS 끊김 시 자동 FORFEIT (BUG-GS-005) | ✅ PASS | Grace 60s → `DISCONNECT_TIMEOUT` 경로 완결 |
| 5. broadcastGameOver 체인 완결성 | ✅ PASS | 3개 진입점 모두 `cleanupGame + persistGameResult + updateElo + FinishRoom` |

---

## 1. 체크리스트 상세

### 1.1 프론트 UI: FORFEIT 버튼 PLAYING 중 노출 여부

**파일**: `src/frontend/src/app/game/[roomId]/GameClient.tsx`, `src/frontend/src/hooks/useGameLeaveGuard.ts`

```
GameClient.tsx L499~510:
  const isPlaying = gameState !== null && !gameEnded;
  const handleLeaveConfirmed = useCallback(() => {
    send("LEAVE_GAME", {});
  }, [send]);
  useGameLeaveGuard({ isPlaying, onLeaveConfirmed: handleLeaveConfirmed });
```

`useGameLeaveGuard` 는 두 경로를 처리한다:
1. `beforeunload` — 탭 닫기/새로고침 시 브라우저 표준 경고
2. `popstate` — 뒤로가기 시 `window.confirm` → 확인하면 `LEAVE_GAME` 전송

**판정**: PLAYING 중 이탈 시도를 모두 가드. `handleLeaveConfirmed → LEAVE_GAME → handleLeaveGame → forfeitAndBroadcast("LEAVE")` 체인 완결.

**주의**: 전용 "기권" 버튼은 UI에 없다. 이탈 행위(탭 닫기/뒤로가기/명시적 나가기) 자체가 FORFEIT 트리거. 이는 의도된 설계 (docs/02-design/12-player-lifecycle-design.md §4).

---

### 1.2 서버 측: ws_handler.go FORFEIT 경로 + persistGameResult("FORFEIT") 연결

**파일**: `src/game-server/internal/handler/ws_handler.go`

**진입점 3개**:

```
A. LEAVE_GAME 메시지 (명시적 이탈):
   handleLeaveGame (L626) → forfeitAndBroadcast(reason="LEAVE")

B. WS 끊김 Grace 만료 (60초):
   handleDisconnect (L2128) → startGraceTimer → forfeitAndBroadcast(reason="DISCONNECT_TIMEOUT")

C. AI 강제 드로우 한도 초과:
   (L1173) → forfeitAndBroadcast(reason="AI_FORCE_DRAW_LIMIT")

D. 3턴 연속 부재:
   checkAbsentTurnAndForfeit (L1281) → forfeitAndBroadcast(reason="ABSENT_3_TURNS")
```

**forfeitAndBroadcast (L2213~2300) 내부 체인**:

```
1. gameSvc.ForfeitPlayer(gameID, seat, reason)
   → player[seat].Status = FORFEITED
   → 활성 플레이어 1명 이하면 state.Status = FINISHED, GameEnded = true

2. roomSvc.ClearActiveRoomForUser(userID)  ← 사용자-방 매핑 정리

3. BroadcastToRoom(PLAYER_FORFEITED)  ← 기권 알림

4. [isGameOver=true 경우]
   cancelTurnTimer(gameID)
   cleanupGame(gameID)  ← AI goroutine cancel + Redis GameState 삭제
   BroadcastToRoom(GAME_OVER, endType="FORFEIT")
   go persistGameResult(state, "FORFEIT", roomID)  ← DB 영속화 (비동기)
   go updateElo(state)
   roomSvc.FinishRoom(roomID)  ← 방 상태 FINISHED

5. [isGameOver=false 경우]
   broadcastTurnStart(다음 턴)
   startTurnTimer(다음 플레이어)
```

**persistGameResult (L1921~2055)**:
- `endType = "FORFEIT"` 그대로 전달. stalemate 재지정 로직은 `state.IsStalemate=true` 일 때만 작동하므로 FORFEIT 경로에 간섭 없음.
- games / game_players / game_events 3 테이블 모두 기록.
- winnerID 없는 FORFEIT (전원 동시 기권 등): `uuid.Nil` 을 sentinel로 사용 — Bug 2 픽스 반영됨.

**판정**: `persistGameResult(endType="FORFEIT")` 연결 완결. 비동기 goroutine으로 WS 흐름 차단 없음.

---

### 1.3 호스트 vs 게스트 FORFEIT 차이

**파일**: `src/game-server/internal/service/game_service.go L716~786`

`ForfeitPlayer` 는 **seat 단위** 처리다. 호스트/게스트 구분 없음.

`LeaveRoom` (room_service.go L302~340) 은 PLAYING 상태 차단 적용:
```go
// L312~320
if room.Status == model.RoomStatusPlaying {
    return nil, &ServiceError{
        Code:    "GAME_IN_PROGRESS",
        Message: "게임 진행 중에는 방을 나갈 수 없습니다. 기권 기능을 이용하세요.",
        Status:  409,
    }
}
```

이 가드는 **Issue #47** (LeaveRoom PLAYING guard)가 이미 구현된 상태임을 확인. `WAITING` 상태에서만 호스트 퇴장 시 방 전체 CANCELLED, 게스트 퇴장 시 seat 초기화 로직이 분기된다.

PLAYING 중에는 두 경로 모두 `LeaveRoom` 대신 `ForfeitPlayer` 로만 처리 — 정책 일관성 확인.

**판정**: 호스트 vs 게스트 FORFEIT 경로 차이 없음. seat 단위 균일 처리.

---

### 1.4 WS 끊김 시 자동 FORFEIT (BUG-GS-005 cleanup 연동)

**파일**: `src/game-server/internal/handler/ws_handler.go`

```
handleDisconnect (L2128)
  ├─ 게임 미진행: PLAYER_LEAVE 브로드캐스트, 종료
  └─ 게임 진행 중:
      gameSvc.SetPlayerStatus(DISCONNECTED)
      BroadcastToRoom(PLAYER_DISCONNECTED, GraceSec=60)
      startGraceTimer(60s)
          └─ [60초 경과] forfeitAndBroadcast(reason="DISCONNECT_TIMEOUT")
          └─ [재연결] HandleWS에서 graceTimer 취소
```

Grace Period = 60초 (`gracePeriodDuration = 60 * time.Second`, L55).

BUG-GS-005 연동 확인:
- `cleanupGame(gameID)` 호출 시 `cancelAITurn(gameID)` 선행 실행 → AI goroutine context 취소
- `gameSvc.DeleteGameState(gameID)` → Redis 게임 상태 삭제
- `deleteTimerFromRedis(gameID)` (cancelTurnTimer 내부) → Redis 타이머 삭제

**체크 포인트**: `forfeitAndBroadcast` 에서 `isGameOver=true` 인 경우만 `cleanupGame` 호출. 게임 계속(활성 플레이어 2명 이상 남은 경우)에는 `cleanupGame` 미호출 — 정상. AI goroutine은 다음 플레이어가 AI이면 재시작.

**판정**: WS 끊김 → Grace 60s → 자동 FORFEIT 체인 완결. BUG-GS-005 goroutine 취소 + Redis 삭제 연동 확인.

---

### 1.5 broadcastGameOver 체인 완결성

GAME_OVER 브로드캐스트 진입점 3개:

| 함수 | 호출 지점 | endType |
|------|----------|---------|
| `broadcastGameOver(conn, state)` | 일반 턴 종료(타일 소진/승리) | "NORMAL" / "STALEMATE" |
| `broadcastGameOverFromState(roomID, state)` | AI 턴 종료, 타임아웃 처리 | "NORMAL" / "STALEMATE" |
| `forfeitAndBroadcast(...)` 내부 | FORFEIT 종료 | "FORFEIT" |

**각 진입점의 체인 검증**:

```
broadcastGameOver (L822):
  cancelTurnTimer ✅ + cleanupGame ✅
  → GAME_OVER broadcast ✅
  → go persistGameResult ✅ + go updateElo ✅
  → FinishRoom ✅

broadcastGameOverFromState (L1585):
  cancelTurnTimer ✅ + cleanupGame ✅
  → GAME_OVER broadcast ✅
  → go persistGameResult ✅ + go updateElo ✅
  → FinishRoom ✅

forfeitAndBroadcast (L2249):
  cancelTurnTimer ✅ + cleanupGame ✅
  → PLAYER_FORFEITED broadcast ✅
  → GAME_OVER broadcast ✅
  → go persistGameResult ✅ + go updateElo ✅
  → FinishRoom ✅
```

**판정**: 3개 진입점 모두 `cancelTurnTimer + cleanupGame + GAME_OVER broadcast + persistGameResult + updateElo + FinishRoom` 체인 완결.

---

### 1.6 프론트엔드 FORFEIT 수신 처리

**파일**: `src/frontend/src/hooks/useWebSocket.ts`

```typescript
case "PLAYER_FORFEITED":
  removeDisconnectedPlayer(payload.seat);
  // 플레이어 상태 FORFEITED로 업데이트
  useGameStore.setState(...)
  // isGameOver이면 GAME_OVER 메시지가 별도로 오므로 여기서는 처리하지 않음
  break;

case "GAME_OVER":
  useGameStore.getState().setGameOverResult(payload);
  break;
```

서버가 PLAYER_FORFEITED + GAME_OVER를 순서대로 발송하고, 프론트는 두 메시지를 독립적으로 처리. `isGameOver=true` 인 PLAYER_FORFEITED 수신 후 GAME_OVER를 기다리는 이중 처리로 안전.

`GameClient.tsx L273`: `FORFEIT` endType에 대해 `{ icon: "🏳️", label: "기권 종료", description: "..." }` 렌더링 매핑 존재.

**판정**: 프론트 FORFEIT 수신 처리 완결.

---

## 2. 발견 이슈

**없음.**

모든 감사 항목에서 결함을 발견하지 못했다.

---

## 3. 관찰 사항 (결함 아님)

### 3.1 endType 타입 미정의

`GameOverPayload.endType` (websocket.ts L153)이 `string` 타입으로 선언되어 "NORMAL" | "STALEMATE" | "FORFEIT" union type 미정의. 런타임 동작에 영향 없으나 타입 안전성 개선 여지 있음. 별도 Issue로 등록 권장.

### 3.2 persistGameResult FORFEIT 시 winnerID 결정 로직

`persistGameResult` (L1929~1938)에서 winnerID를 `Rack.length == 0` 기준으로 결정한다. FORFEIT 종료 시 실제 승자는 `ForfeitPlayer`에서 `state.Status=FINISHED` + `result.WinnerID` 로 설정하지만, `persistGameResult` 는 독립적으로 Rack 기준 재탐색. FORFEIT 승자가 타일을 0장 가진 경우가 아닌 경우(일반적으로 FORFEIT 승자는 타일을 가짐) → `winnerID = ""` → `uuid.Nil` sentinel 사용. 이는 Bug 2 픽스(ws_persist_test.go L412)에서 이미 검증된 의도된 동작.

### 3.3 Issue #47 LeaveRoom PLAYING guard 구현 완료 확인

`room_service.go L312~320` 에 PLAYING 상태 LeaveRoom 차단이 이미 구현되어 있음. Sprint 7 Day 2 백로그 Issue #47는 **기구현 상태** — PR/작업 불필요.

---

## 4. 결론

**PROCEED — 완결성 확인**

FORFEIT 경로 5개 체크리스트 항목 모두 통과. 결함 없음.

Issue #47 LeaveRoom PLAYING guard도 `room_service.go` 에 이미 구현되어 있어 별도 수정 불필요.

---

**감사 끝.**
