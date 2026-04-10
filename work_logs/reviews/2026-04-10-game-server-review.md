# Game Server 소스코드 리뷰 (2026-04-10)

> **리뷰어**: Go Backend Developer (game-server 담당)
> **범위**: `src/game-server/` 전체 (테스트 제외), `docs/02-design/29-error-code-registry.md`, `docs/02-design/06-game-rules.md`
> **근거**: Sprint 5 W2 Day 5 에러코드 전수 검토 + 게임룰 구현 검증

---

## 1. 에러코드 감사

### 1.1 레지스트리 vs 코드 불일치

#### 1.1.1 코드에 있지만 레지스트리에 없는 에러 코드

| 코드 | 파일:라인 | HTTP/WS | 설명 |
|------|-----------|---------|------|
| `GAME_NOT_STARTED` | `ws_handler.go:353` | WS ERROR | 게임 시작 전 게임 액션 메시지 수신 시 |
| `INTERNAL_ERROR` | `ws_handler.go:403,455,495,568,634` | WS ERROR | WebSocket 내부 오류 (5곳) |
| `GAME_NOT_PLAYING` | `game_service.go:625` | 400 | 진행 중이 아닌 게임에서 기권 시도 |

- **`GAME_NOT_STARTED`**: 레지스트리 1.4절(WebSocket Layer)에 누락. WS 전용 에러로, 게임이 시작되지 않은 상태에서 PLACE_TILES/DRAW_TILE 등을 보낼 때 발생.
- **`INTERNAL_ERROR` (WS)**: 레지스트리 1.4절에 WebSocket 내부 에러가 누락. HTTP의 INTERNAL_ERROR(1.2절)만 등록됨. WS에서도 동일 코드를 S2C ERROR 메시지로 전송.
- **`GAME_NOT_PLAYING`**: 레지스트리 1.1절에 등록되어 있으나, 설명이 "진행 중인 게임이 아님"으로만 되어 있고 `game_service.go`의 `ForfeitPlayer`에서만 사용됨. 레지스트리의 파일 목록에 명확히 `game_service.go:ForfeitPlayer`를 표기해야 함.

#### 1.1.2 레지스트리에 있지만 코드에서 사용되지 않는 엔진 에러

| 코드 | 레지스트리 | 실제 코드 | 상태 |
|------|-----------|-----------|------|
| `ERR_NO_REARRANGE_PERM` | 1.5절 (V-13) | `errors.go:52` 정의만 | **정의만 존재, ValidateTurnConfirm에서 미사용** |
| `ERR_NOT_YOUR_TURN` | 미등록 | `errors.go:55` 정의만 | Service 레이어에서 `NOT_YOUR_TURN`으로 별도 처리 |
| `ERR_DRAW_PILE_EMPTY` | 미등록 | `errors.go:56` 정의만 | `pool.go:52`에서 fmt.Errorf 내 문자열로만 사용 |
| `ERR_TURN_TIMEOUT` | 미등록 | `errors.go:57` 정의만 | 코드 어디에서도 사용되지 않음 |
| `ERR_INVALID_TILE_CODE` | 미등록 | `errors.go:60` 정의만 | 코드 어디에서도 사용되지 않음 |

#### 1.1.3 WS Close Code 레지스트리 누락

레지스트리 1.4절에는 Close 4005(RATE_LIMITED)만 등록되어 있으나, 코드에는 5개의 WS Close Code가 정의되어 있다:

| Close Code | 상수 | 파일:라인 | 레지스트리 |
|:----------:|-------|-----------|:----------:|
| 1000 | `CloseNormal` | `ws_message.go:40` | 미등록 |
| 4001 | `CloseAuthFail` | `ws_message.go:41` | 미등록 |
| 4002 | `CloseNoRoom` | `ws_message.go:42` | 미등록 |
| 4003 | `CloseAuthTimeout` | `ws_message.go:43` | 미등록 |
| 4004 | `CloseDuplicate` | `ws_message.go:44` | 미등록 |
| 4005 | `CloseRateLimited` | `ws_message.go:45` | 등록됨 |

#### 1.1.4 WS 인증 에러 코드 레지스트리 누락

`ws_handler.go:230-294`의 `authenticate()` 함수에서 다음 WS ERROR 코드가 사용되지만 레지스트리에 미등록:

| 코드 | 라인 | 설명 |
|------|------|------|
| `UNAUTHORIZED` | 236, 252, 267, 275, 293 | WS 인증 실패 (토큰 없음/무효/방 미참가) |
| `INVALID_MESSAGE` | 246, 259 | AUTH 단계 JSON 파싱 실패 |

### 1.2 동일 상태 코드 충돌

#### 1.2.1 CRITICAL: HTTP 429 충돌 (기존 확인)

레지스트리 3.1절에 기술된 대로 확인됨:

```
room_service.go:97   : AI_COOLDOWN  -> 429 (ServiceError)
rate_limiter.go:182  : RATE_LIMITED -> 429 (middleware 직접 응답)
```

추가 확인: 응답 포맷도 상이함.

- `AI_COOLDOWN`: `{"error": {"code": "AI_COOLDOWN", "message": "..."}}`
- `RATE_LIMITED`: `{"error": "RATE_LIMITED", "message": "...", "retryAfter": N}` (flat 구조)

#### 1.2.2 WARNING: WS ERROR 코드 "INVALID_MESSAGE" 다의적 사용

`INVALID_MESSAGE` 코드가 7곳에서 서로 다른 의미로 사용됨:

| 파일:라인 | 의미 |
|-----------|------|
| `ws_connection.go:194` | JSON 파싱 실패 (ReadPump) |
| `ws_handler.go:246` | AUTH 단계 JSON 파싱 실패 |
| `ws_handler.go:259` | AUTH 페이로드 파싱 실패 |
| `ws_handler.go:373` | 알 수 없는 메시지 타입 |
| `ws_handler.go:384` | PLACE_TILES 페이로드 파싱 실패 |
| `ws_handler.go:422` | CONFIRM_TURN 페이로드 파싱 실패 |
| `ws_handler.go:588,593` | CHAT 페이로드 파싱 실패 / 200자 초과 |

`ws_handler.go:373`은 "알 수 없는 메시지 타입"인데 `INVALID_MESSAGE`로 반환. `UNKNOWN_MESSAGE_TYPE` 등으로 세분화하면 클라이언트 디버깅이 용이해진다. 단 현재 프론트엔드가 message 문자열로 분기한다면 호환성 영향 없음.

### 1.3 P1 수정 권고 (AI_COOLDOWN 429 -> 403)

#### 1.3.1 변경 대상 파일 및 라인

**Service Layer** (1곳):

- **파일**: `src/game-server/internal/service/room_service.go`
- **라인**: 97
- **현재**: `Status: 429`
- **변경**: `Status: 403`

```go
// AS-IS (room_service.go:93-99)
return nil, &ServiceError{
    Code:    "AI_COOLDOWN",
    Message: "AI 게임은 5분에 1회만 생성할 수 있습니다.",
    Status:  429,  // <-- 이 줄만 변경
}

// TO-BE
return nil, &ServiceError{
    Code:    "AI_COOLDOWN",
    Message: "AI 게임은 5분에 1회만 생성할 수 있습니다.",
    Status:  403,  // 비즈니스 제약은 Forbidden
}
```

**Frontend 연동** (확인 필요):

- 프론트엔드에서 HTTP 429를 수신하면 rate limit UI를 표시하는 코드가 있다면, 403 + `error.code === "AI_COOLDOWN"` 분기를 추가해야 함.
- 기존 429 분기에서 AI_COOLDOWN을 처리하는 코드가 있다면 제거해야 함.

**테스트 파일** (확인 필요):

```bash
# 429를 기대하는 테스트가 있는지 확인
grep -rn "429.*AI_COOLDOWN\|AI_COOLDOWN.*429" src/game-server/ --include="*_test.go"
```

#### 1.3.2 P2 수정: Rate Limiter 응답 포맷 통일

- **파일**: `src/game-server/internal/middleware/rate_limiter.go`
- **라인**: 182-186

```go
// AS-IS
c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
    "error":      "RATE_LIMITED",
    "message":    "Too many requests",
    "retryAfter": retryAfter,
})

// TO-BE (공통 에러 포맷 + retryAfter 유지)
c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
    "error": gin.H{
        "code":    "RATE_LIMITED",
        "message":  "Too many requests",
    },
    "retryAfter": retryAfter,
})
```

---

## 2. 게임룰 구현 검증

### 2.1 타일 구성

**규칙**: 4색(R,B,Y,K) x 13숫자 x 2세트(a,b) + 조커 2개 = 106개

**코드 검증** (`engine/tile.go:89-112`, `engine/pool.go:17-23`):

| 검증 항목 | 결과 | 근거 |
|-----------|:----:|------|
| 4색 정의 | PASS | `tile.go:10-14`: R, B, Y, K |
| 13숫자 범위 | PASS | `tile.go:96`: `for n := 1; n <= 13; n++` |
| 2세트(a,b) | PASS | `tile.go:93`: `sets := []string{"a", "b"}` |
| 조커 2장 | PASS | `tile.go:108-109`: JK1, JK2 |
| 총 106장 | PASS | `tile.go:92`: `make([]*Tile, 0, 106)`, 4x13x2+2=106 |
| 조커 점수 30점 | PASS | `tile.go:18`: `JokerScore = 30` |
| 일반 타일 점수 = 숫자값 | PASS | `tile.go:69-72`: `return t.Number` |
| 타일 파싱 | PASS | `tile.go:31-64`: Parse 함수가 색상/숫자/세트 검증 |

### 2.2 그룹/런 검증

#### 2.2.1 그룹 (Group)

**규칙**: 같은 숫자, 서로 다른 색, 3~4장

**코드 검증** (`engine/group.go:10-40`):

| 검증 항목 | 결과 | 근거 |
|-----------|:----:|------|
| 3~4장 | PASS | `group.go:11`: `len(tiles) < 3 \|\| len(tiles) > 4` |
| 같은 숫자 | PASS | `group.go:24-25`: `t.Number != refNumber` |
| 색상 중복 불가 | PASS | `group.go:27-29`: `colorSeen[t.Color]` |
| 조커 건너뛰기 | PASS | `group.go:19-21`: `if t.IsJoker { continue }` |
| 조커만 세트 불가 | PASS | `group.go:35-37`: `refNumber == 0` 체크 |

**그룹 점수 계산** (`engine/group.go:44-62`):

| 검증 항목 | 결과 | 근거 |
|-----------|:----:|------|
| 조커 = 대체 숫자값 | PASS | `group.go:55-57`: 조커에 refNumber 적용 |

#### 2.2.2 런 (Run)

**규칙**: 같은 색, 연속 숫자, 3장 이상, 13-1 순환 없음

**코드 검증** (`engine/run.go:14-92`):

| 검증 항목 | 결과 | 근거 |
|-----------|:----:|------|
| 3장 이상 | PASS | `run.go:15`: `len(tiles) < 3` |
| 같은 색상 | PASS | `run.go:47`: `t.Color != refColor` |
| 연속 숫자 | PASS | `run.go:76`: span 계산으로 비연속 감지 |
| 숫자 중복 불가 | PASS | `run.go:63`: `sorted[i] == sorted[i-1]` |
| 13-1 순환 불가 | PASS | `run.go:88`: `possibleStart+runLen-1 > 13` |
| 범위 1~13 | PASS | `run.go:84-88`: possibleStart < 1, end > 13 검증 |
| 조커만 세트 불가 | PASS | `run.go:53-55`: `len(nonJokerNumbers) == 0` 체크 |
| 상한 없음 (최대 13장) | PASS | 코드에 상한 체크 없음, 테스트로 13장 런 검증 완료 |

**런 점수 계산** (`engine/run.go:109-153`):

| 검증 항목 | 결과 | 근거 |
|-----------|:----:|------|
| 조커 위치 추론 (갭 채우기) | PASS | `run.go:125-142`: 내부 갭 우선, 나머지 후방/전방 배치 |

### 2.3 초기 멜드

**규칙**: 첫 배치 합산 30점 이상, 자신의 랙 타일만 사용

**코드 검증** (`engine/validator.go:122-162`):

| 검증 항목 | 결과 | 근거 |
|-----------|:----:|------|
| V-04: 30점 이상 | PASS | `validator.go:159`: `score < 30` |
| V-05: 랙 타일만 사용 | PASS | `validator.go:126-131`: tableBefore 타일 보전 확인 |
| 복수 세트 합산 | PASS | `validator.go:145-157`: 루프로 모든 세트 점수 합산 |
| 조커 점수 = 대체 타일 값 | PASS | groupScore/runScore 내부에서 위치 기반 계산 |
| hasInitialMeld 상태 관리 | PASS | `game_service.go:335-337`: 검증 통과 후 true 설정 |
| 최초 등록 전 테이블 재배치 불가 (V-05) | PASS | `validator.go:126-131`: beforeCodes가 afterCodes에 보전되는지 확인 |

**문제점**: 초기 멜드 점수 계산에서 `setIsSubsetOf`가 "새로 추가된 랙 타일만으로 구성된 세트"만 점수에 포함한다(`validator.go:147`). 이는 게임 규칙에 부합한다 (최초 등록은 랙 타일로만 구성된 세트의 합산).

### 2.4 조커 처리

**규칙**: 대체 가능, 교환 시 같은 턴 내 사용 필수

**코드 검증**:

| 검증 항목 | 결과 | 근거 |
|-----------|:----:|------|
| 조커 대체 (그룹) | PASS | `group.go:19-21`: 조커는 숫자/색상 검증에서 skip |
| 조커 대체 (런) | PASS | `run.go:41-42`: 조커는 색상/숫자 추출에서 skip |
| 조커 교환 후 즉시 사용 (V-07) | PASS | `validator.go:165-176`: JokerReturnedCodes가 tableAfter에 존재하는지 확인 |
| 조커만으로 세트 불가 | PASS | `group.go:35-37`, `run.go:53-55` |
| 조커 교환 시 보전 검증 면제 | PASS | `validator.go:186-189`: jokerReturnedCodes를 beforeFreq에서 차감 |

### 2.5 턴 관리

**규칙**: 시간 제한, 무효 시 원복 + 페널티 드로우

**코드 검증**:

| 검증 항목 | 결과 | 근거 |
|-----------|:----:|------|
| V-08: 자기 턴 확인 | PASS | `game_service.go:236,299,515,574`: `currentSeat != seat` |
| V-09: 턴 타임아웃 | PASS | `ws_handler.go:1018-1091`: startTurnTimer + HandleTimeout |
| 타임아웃 시 스냅샷 롤백 | PASS | `turn_service.go:109`: `ResetTurn` 호출 후 DrawTile |
| 타임아웃 시 자동 드로우 1장 | PASS | `turn_service.go:113`: DrawTile 호출 |
| 턴 순서 (seat 0->1->2->3->0) | PASS | `game_service.go:722-745`: advanceTurn |
| FORFEITED 플레이어 스킵 | PASS | `game_service.go:741`: PlayerStatusForfeited 체크 |
| **페널티 드로우 3장** | **MISSING** | 아래 상세 참조 |

#### 2.5.1 MISSING: 페널티 드로우 3장 미구현

`docs/02-design/06-game-rules.md` 섹션 6.1에 명시:

> **실패 시**: 스냅샷으로 복원 + 패널티 드로우 3장

그러나 실제 코드(`game_service.go:321-327`)에서는:

```go
if err := engine.ValidateTurnConfirm(validateReq); err != nil {
    if s.restoreSnapshot(state, gameID, req.Seat, playerIdx) {
        _ = s.gameRepo.SaveGameState(state)
    }
    return s.buildValidationFailResult(state, err), &ServiceError{...}
}
```

검증 실패 시 **스냅샷 복원은 수행하지만 페널티 드로우 3장은 수행하지 않는다**. 클라이언트에 422 에러만 반환하고 턴을 유지한다(재시도 가능).

현재 동작: 무효 배치 -> 스냅샷 롤백 -> 422 에러 -> **턴 유지 (재시도 허용)**

규칙 문서 동작: 무효 배치 -> 스냅샷 롤백 -> **페널티 드로우 3장** -> 턴 종료

**영향도**: Medium. 현재 구현은 플레이어에게 관대하여 재시도를 허용하므로, 게임 플레이 경험상 더 나을 수 있으나 공식 규칙과 다름. 공식 Rummikub 규칙에서도 "시간 내 유효한 배치를 완성하지 못하면" 페널티 드로우이므로, 타임아웃 시에만 적용하는 현재 구현이 의도적 설계일 수 있음.

### 2.6 드로우/승리 조건

**코드 검증**:

| 검증 항목 | 결과 | 근거 |
|-----------|:----:|------|
| V-10: 드로우 파일 소진 시 패스 | PASS | `game_service.go:523-539`: DrawPile 길이 0이면 패스 |
| V-11: 교착 상태 판정 | PASS | `game_service.go:533-535`: ConsecutivePassCount >= activePlayerCount |
| V-12: 승리 조건 (랙 0장) | PASS | `game_service.go:345-347`: `len(rackAfter) == 0` |
| 교착 시 점수 비교 | PASS | `game_service.go:431-478`: tileScore 기반 최솟값 |
| 교착 시 동점 처리 | PASS | `game_service.go:460-465`: score+count 동점 시 winnerID="" |
| 드로우 시 1장만 뽑기 | PASS | `game_service.go:543-544`: DrawPile[0] 1장만 |
| 드로우 + 배치 동일 턴 불가 | PASS | 드로우 시 즉시 advanceToNextTurn 호출 |
| 초기 분배 14장 | PASS | `pool.go:66-82`: `tilesPerPlayer = 14` |
| 플레이어 2~4명 | PASS | `pool.go:69`: `playerCount < 2 \|\| playerCount > 4` |

#### 교착 카운터 리셋 로직 검증

| 이벤트 | ConsecutivePassCount | 코드 |
|--------|:--------------------:|------|
| 배치 성공 (ConfirmTurn) | 0으로 리셋 | `game_service.go:333` |
| 드로우 (타일 획득) | 0으로 리셋 | `game_service.go:546` |
| 드로우 파일 소진 패스 | +1 | `game_service.go:525` |

### 2.7 테이블 조작

**규칙**: 기존 세트 분할/재조합 허용, hasInitialMeld=true 시에만, 랙에서 최소 1장 추가 필수

**코드 검증**:

| 검증 항목 | 결과 | 근거 |
|-----------|:----:|------|
| V-03: 랙에서 최소 1장 추가 | PASS | `validator.go:87-89`: tilesAdded < 1 |
| V-06: 테이블 타일 미유실 (총 수) | PASS | `validator.go:94-96`: 총 타일 수 비교 |
| V-06 강화: 코드 수준 빈도 비교 | PASS | `validator.go:113-115`: validateTileConservation |
| V-13: 재배치 권한 (hasInitialMeld) | **PARTIAL** | 아래 상세 참조 |
| 분할/재조합 허용 | PASS | 클라이언트가 전체 테이블 상태를 전송, 서버는 결과만 검증 |

#### 2.7.1 FINDING: V-13 (ErrNoRearrangePerm) 정의만 있고 미사용

`engine/errors.go:52`에 `ErrNoRearrangePerm = "ERR_NO_REARRANGE_PERM"` 상수가 정의되어 있으나, `validator.go`의 `ValidateTurnConfirm`에서 **사용되지 않는다**.

현재 V-13 검증은 V-05를 통해 **간접적으로** 보장된다:

1. `hasInitialMeld=false`일 때 `validateInitialMeld(req)` 호출
2. `validateInitialMeld`에서 `tableBefore` 타일이 `tableAfter`에 보전되는지 확인 (V-05)
3. 기존 테이블 타일을 재배치하면 V-05 위반으로 거부됨

그러나 `ERR_NO_REARRANGE_PERM`이 아닌 `ERR_INITIAL_MELD_SOURCE`가 반환되므로, 클라이언트가 "재배치 권한 없음"과 "랙 외 타일 사용"을 구분할 수 없다. 사용자 경험상으로는 동일한 결과이므로 **기능적 버그는 아니지만**, 에러 메시지가 부정확할 수 있다.

---

## 3. 발견사항 요약 (Critical/High/Medium/Low)

### Critical (0건)

없음.

### High (1건)

| ID | 분류 | 파일:라인 | 설명 | 권고 |
|----|------|-----------|------|------|
| H-01 | 에러코드 | `room_service.go:97` | **HTTP 429 충돌**: AI_COOLDOWN과 RATE_LIMITED가 동일 429. 프론트엔드 오분류 발생 | P1: `Status: 429` -> `Status: 403` 변경 |

### Medium (5건)

| ID | 분류 | 파일:라인 | 설명 | 권고 |
|----|------|-----------|------|------|
| M-01 | 응답포맷 | `rate_limiter.go:182-186` | Rate Limiter 429 응답이 flat 구조로, API 공통 에러 포맷(`error.code`) 위반 | P2: `{"error": {"code": ..., "message": ...}}` 구조로 변경 |
| M-02 | 레지스트리 | `ws_message.go:40-45` | WS Close Code 5개 중 4개가 레지스트리에 미등록 (4001-4004) | 레지스트리 1.4절에 WS Close Code 섹션 추가 |
| M-03 | 레지스트리 | `ws_handler.go:353` | `GAME_NOT_STARTED` WS 에러 코드가 레지스트리에 미등록 | 레지스트리 1.4절에 추가 |
| M-04 | 게임룰 | `game_service.go:321-327` | 무효 배치 시 **페널티 드로우 3장 미구현**. 스냅샷 롤백 후 턴 유지(재시도 허용)로 구현됨. 규칙 문서(06-game-rules.md 6.1절)와 불일치 | 의도적 설계면 규칙 문서 갱신, 아니면 구현 보완 |
| M-05 | 게임룰 | `engine/errors.go:52` | V-13 `ERR_NO_REARRANGE_PERM`이 정의만 되고 미사용. V-05로 간접 보장되나 에러 메시지 부정확 | `validateInitialMeld` 진입 전 재배치 감지 시 전용 에러 반환 검토 |

### Low (5건)

| ID | 분류 | 파일:라인 | 설명 | 권고 |
|----|------|-----------|------|------|
| L-01 | dead code | `engine/errors.go:55-60` | `ErrNotYourTurn`, `ErrDrawPileEmpty`, `ErrTurnTimeout`, `ErrInvalidTileCode` 상수가 engine에 정의되었으나 engine 내부에서 미사용 (service 레이어에서 별도 처리) | 레이어 분리 원칙상 engine 상수 정리 또는 service에서 참조하도록 통일 |
| L-02 | 게임룰 | 해당없음 | **AI 5턴 연속 강제 드로우 시 비활성화** 규칙(06-game-rules.md 8.1절)이 미구현. AI 강제 드로우 횟수 추적 코드 없음 | Sprint 6 이후 구현 검토 (현재 AI 대전에서 실질적 문제 없음) |
| L-03 | 에러코드 | `ws_handler.go` 다수 | WS `INTERNAL_ERROR` 코드가 레지스트리 1.4절에 미등록 | 레지스트리에 추가 |
| L-04 | 에러코드 | `ws_handler.go:373` | "알 수 없는 메시지 타입"에 `INVALID_MESSAGE` 사용. `UNKNOWN_MESSAGE_TYPE`으로 세분화 가능 | 장기 개선 |
| L-05 | 게임룰 | `ws_handler.go:694` | `MaxPlayers: 4` 하드코딩. 방 설정에서 실제 값을 읽어야 함 | `TODO` 주석이 이미 있음, 향후 수정 |

### Info (3건)

| ID | 분류 | 설명 |
|----|------|------|
| I-01 | 설계 | HTTP 409 코드가 4개 비즈니스 에러에서 공유되나, `error.code`로 구분 가능하여 충돌 아님 |
| I-02 | 설계 | HTTP 400 `INVALID_REQUEST`가 10+ 곳에서 사용됨. 레지스트리 P3 권고(세분화)는 Sprint 6 이후 |
| I-03 | 설계 | 타임아웃 시 ResetTurn+DrawTile로 구현됨. 공식 Rummikub 규칙의 "페널티 드로우 3장"과 다르나, 타임아웃은 자동 드로우 1장이 현재 설계 의도 |

---

## 부록: 변경 작업 체크리스트

### 즉시 수정 (P1)

- [ ] `room_service.go:97` — `Status: 429` -> `Status: 403`
- [ ] `room_service_test.go` — AI_COOLDOWN 관련 테스트에서 기대 HTTP 상태 코드 확인/수정
- [ ] 프론트엔드 — 429에서 AI_COOLDOWN 처리 코드가 있다면 403으로 변경
- [ ] 에러코드 레지스트리 — AI_COOLDOWN 행의 HTTP Status를 403으로 갱신

### 단기 수정 (P2)

- [ ] `rate_limiter.go:182-186` — 응답 포맷을 공통 에러 구조로 통일
- [ ] 레지스트리 — WS Close Code 4001-4004, GAME_NOT_STARTED, INTERNAL_ERROR(WS) 추가
- [ ] 프론트엔드 Rate Limit 처리 코드 — 응답 구조 변경에 대응

### 장기 검토 (P3)

- [ ] 페널티 드로우 3장 규칙 — 의도적 생략인지 문서화 또는 구현
- [ ] V-13 `ERR_NO_REARRANGE_PERM` — 전용 에러 메시지 분리 검토
- [ ] `INVALID_REQUEST` / `INVALID_MESSAGE` 세분화
- [ ] AI 5턴 연속 강제 드로우 비활성화 로직
