# 게임룰 ↔ 소스코드 추적성 매트릭스 (Game Rule Traceability Matrix)

> 이 문서는 `06-game-rules.md`에 정의된 모든 게임 규칙이 소스코드에 어떻게 구현되어 있는지 추적한다.
> 게임 엔진 수정 시 반드시 이 문서를 참조하여 규칙 누락을 방지한다.

**최종 갱신**: 2026-04-10
**근거 문서**: `docs/02-design/06-game-rules.md` (규칙 정의서)

---

## 1. 규칙 검증 매트릭스 (V-01 ~ V-15)

| 규칙 ID | 검증 항목 | 구현 파일:라인 | 에러 코드 | 테스트 파일 | 상태 |
|---------|----------|--------------|----------|------------|------|
| **V-01** | 세트가 유효한 그룹 또는 런인가 | `engine/validator.go:80-84` → `ValidateTable()` | `ERR_INVALID_SET` | `validator_test.go:87,135` `group_test.go:18` `run_test.go:9` | **PASS** |
| **V-02** | 세트가 3장 이상인가 | `engine/group.go` (3~4장) `engine/run.go` (3+장) | `ERR_SET_SIZE` | `validator_test.go:62` `group_test.go:47,54` `run_test.go:38` | **PASS** |
| **V-03** | 랙에서 최소 1장 추가했는가 | `engine/validator.go:85-90` | `ERR_NO_RACK_TILE` | `validator_test.go:148-163` | **PASS** |
| **V-04** | 최초 등록 30점 이상인가 | `engine/validator.go:133-162` → `validateInitialMeld()` | `ERR_INITIAL_MELD_SCORE` | `validator_test.go:167-205` `turn_service_test.go:454` | **PASS** |
| **V-05** | 최초 등록 시 랙 타일만 사용했는가 | `engine/validator.go:123-131` → `validateInitialMeld()` | `ERR_INITIAL_MELD_SOURCE` | `validator_test.go:208-229` `turn_service_test.go:497-558` | **PASS** |
| **V-06** | 테이블 타일이 유실되지 않았는가 | `engine/validator.go:91-97` + `111-119` (코드 수준 보전) | `ERR_TABLE_TILE_MISSING` | `validator_test.go:230-250,432-509` `conservation_test.go` (43개) | **PASS** |
| **V-07** | 조커 교체 후 즉시 사용했는가 | `engine/validator.go:106-110,164-181` → `validateJokerReturned()` | `ERR_JOKER_NOT_USED` | `validator_test.go:251-292` `turn_service_test.go:329-452` | **PASS** |
| **V-08** | 자기 턴인가 | `service/game_service.go:295-300` (seat 확인) | `ERR_NOT_YOUR_TURN` | `game_service_test.go` (간접) | **PASS** |
| **V-09** | 턴 타임아웃 | `service/turn_service.go:106-127` → `HandleTimeout()` | `ERR_TURN_TIMEOUT` | `turn_service_test.go:148-198` | **PASS** |
| **V-10** | 드로우 파일이 비어있는가 | `engine/pool.go:49-53` → `Draw()` | `ERR_DRAW_PILE_EMPTY` | `turn_service_test.go:199-230` | **PASS** |
| **V-11** | 교착 상태인가 | `service/game_service.go` (ConsecutivePassCount 기반) | - (게임 종료 처리) | `game_service_test.go:580-603,701-732` | **PASS** |
| **V-12** | 승리 조건 (랙 타일 0장) | `service/game_service.go` (ConfirmTurn 후 랙 체크) | - (GAME_OVER 전송) | `game_service_test.go` (간접) | **PASS** |
| **V-13** | 재배치 권한 (hasInitialMeld) | `engine/errors.go:52` 정의됨 | `ERR_NO_REARRANGE_PERM` | `game_rules_comprehensive_test.go:574` (간접) | **PASS** (V-05로 간접 보장) |
| **V-14** | 그룹에서 같은 색상 중복 불가 | `engine/group.go` (색상 중복 체크) | `ERR_GROUP_COLOR_DUP` | `group_test.go:62` `regression_test.go:554` | **PASS** |
| **V-15** | 런에서 숫자 연속 (13-1 순환 불가) | `engine/run.go:60` → `checkRunDuplicates()` + 순서 검증 | `ERR_RUN_SEQUENCE` `ERR_RUN_RANGE` `ERR_RUN_DUPLICATE` | `run_test.go:53,114,172` | **PASS** |

---

## 2. 비검증 규칙 (게임룰 문서에 있지만 코드에 없는 것)

| 규칙 | 문서 위치 | 구현 상태 | 심각도 | 비고 |
|------|----------|----------|--------|------|
| **패널티 드로우 3장** | §6.1 "실패 시 스냅샷 복원 + 패널티 드로우 3장" | **구현 완료** (2026-04-10) | Medium | `game_service.go:penaltyDrawAndAdvance` + `ws_handler.go:broadcastTurnEndWithPenalty` |
| **AI 5턴 연속 강제 드로우 → 비활성화** | §8.1 "5턴 연속 강제 드로우 시 해당 AI 비활성화" | **구현 완료** (2026-04-10) | Low | `ws_handler.go:incrementForceDrawCounter` + `PlayerState.ConsecutiveForceDrawCount` |
| **끊김 후 3턴 연속 부재 → 제외** | §8.2 "3턴 연속 부재 시 게임에서 제외" | **구현 완료** (2026-04-10) | Low | `ws_handler.go:checkAbsentTurnAndForfeit` + `PlayerState.ConsecutiveAbsentTurns` |

---

## 3. 타일 시스템

| 항목 | 문서 위치 | 구현 파일:라인 | 테스트 | 상태 |
|------|----------|--------------|--------|------|
| 106장 생성 (4색×13×2 + 조커2) | §1.1 | `engine/pool.go` → `NewDrawPile()` | `pool_test.go`, `conservation_test.go` | **PASS** |
| 타일 인코딩 (R7a, JK1 등) | §1.2 | `engine/tile.go` → `ParseTileCode()` | `tile_test.go` | **PASS** |
| 타일 점수 (숫자값, 조커=30) | §1.3 | `engine/tile.go` → `TileScore()` | `tile_test.go` | **PASS** |
| 셔플 (Fisher-Yates) | §2 | `engine/pool.go` → `Shuffle()` | `pool_test.go` | **PASS** |
| 14장 분배 | §2 | `service/game_service.go` → `StartGame()` | `game_service_test.go` | **PASS** |
| 타일 보존 법칙 (총합 106 유지) | §6.4 | `engine/validator.go:91-119` | `conservation_test.go` (43개) | **PASS** |

---

## 4. 턴 관리

| 항목 | 문서 위치 | 구현 파일 | 테스트 | 상태 |
|------|----------|----------|--------|------|
| 턴 순서 (seat 순환) | §5.5 | `service/game_service.go` → `advanceTurn()` | `game_service_test.go` | **PASS** |
| 타임아웃 (30~120초) | §5.4 | `service/turn_service.go:107` + `handler/ws_handler.go` (타이머) | `turn_service_test.go:148` | **PASS** |
| 드로우 (1장 뽑기) | §5.3 | `service/game_service.go:508` → `DrawTile()` | `game_service_test.go` | **PASS** |
| 턴 확정 (confirm) | §5.2 | `service/game_service.go:292` → `ConfirmTurn()` | `game_service_test.go` | **PASS** |
| 스냅샷 롤백 | §5.2, §6.1 | `service/game_service.go:321-327` | `game_service_test.go` | **PASS** |

---

## 5. 승리/종료 조건

| 항목 | 문서 위치 | 구현 파일 | 테스트 | 상태 |
|------|----------|----------|--------|------|
| 정상 승리 (랙 0장) | §7.1 | `service/game_service.go` (ConfirmTurn 후 체크) | `game_service_test.go` | **PASS** |
| 교착 상태 판정 | §7.2 | `service/game_service.go` (ConsecutivePassCount ≥ playerCount) | `game_service_test.go:580-603` | **PASS** |
| 교착 시 점수 비교 | §7.2 | `service/game_service.go` → `calculateScores()` | `game_service_test.go:597` | **PASS** |
| 점수 계산 (조커=30점) | §7.3 | `engine/tile.go` → `TileScore()` | `tile_test.go` | **PASS** |
| 동점 처리 (타일 수 비교) | §7.2 | `service/game_service.go` | 테스트 확인 필요 | **확인 필요** |

---

## 6. 조커 규칙

| 항목 | 문서 위치 | 구현 파일 | 테스트 | 상태 |
|------|----------|----------|--------|------|
| 그룹/런 대체 | §3.3 | `engine/group.go`, `engine/run.go` (조커 필터링) | `group_test.go:104`, `run_test.go:82` | **PASS** |
| 세트 내 복수 조커 | §3.3 | `engine/group.go`, `engine/run.go` | `game_rules_comprehensive_test.go` | **PASS** |
| 조커 교체 (즉시 사용 필수) | §3.3, V-07 | `engine/validator.go:164-181` | `validator_test.go:251-292` | **PASS** |
| 최초 등록 시 조커 점수 | §4.1 | `engine/validator.go:133-162` (inferJokerValue) | `validator_test.go:317-359` | **PASS** |

---

## 7. 연습 모드

| 항목 | 문서 위치 | 구현 파일 | 상태 |
|------|----------|----------|------|
| Stage 1~5 (부분 규칙) | §9.2 | `handler/practice_handler.go` | **구현 완료** |
| Stage 6 (AI 대전) | §9.2 | `handler/practice_handler.go` | **구현 완료** |
| 턴 타임아웃 무제한 | §9.1 | `handler/practice_handler.go` | **구현 완료** |
| ELO 미반영 | §9.1 | `service/game_service.go` | **구현 완료** |

---

## 8. AI 특수 규칙

| 항목 | 문서 위치 | 구현 파일 | 상태 |
|------|----------|----------|------|
| 무효 수 → 재요청 (max 3회) | §8.1 | `ai-adapter/src/adapter/base.adapter.ts` (retry loop) | **PASS** |
| 3회 실패 → 강제 드로우 | §8.1 | `handler/ws_handler.go:866-882` → `forceAIDraw()` | **PASS** |
| **5턴 연속 강제 드로우 → 비활성화** | §8.1 | `handler/ws_handler.go:incrementForceDrawCounter` + `model/tile.go:ConsecutiveForceDrawCount` | **PASS** (2026-04-10) |

---

## 9. 파일 인덱스

게임 규칙 관련 주요 소스 파일 목록.

### Engine (규칙 검증 핵심)
| 파일 | 역할 | 라인 수 |
|------|------|---------|
| `internal/engine/validator.go` | V-01~V-07 턴 확정 검증 | ~180 |
| `internal/engine/group.go` | 그룹 유효성 (V-01, V-02, V-14) | ~80 |
| `internal/engine/run.go` | 런 유효성 (V-01, V-02, V-15) | ~100 |
| `internal/engine/tile.go` | 타일 파싱, 점수 계산 | ~100 |
| `internal/engine/pool.go` | 드로우 파일, 셔플, 분배 | ~60 |
| `internal/engine/errors.go` | 에러 코드 상수 19개 | ~85 |

### Service (비즈니스 로직)
| 파일 | 역할 |
|------|------|
| `internal/service/game_service.go` | ConfirmTurn, DrawTile, 승리/교착 판정 |
| `internal/service/turn_service.go` | HandleTimeout, 턴 순서 관리 |

### Test (테스트 커버리지)
| 파일 | 테스트 수 | 커버 규칙 |
|------|----------|----------|
| `engine/validator_test.go` | ~30 | V-01~V-07 |
| `engine/group_test.go` | ~10 | V-01, V-02, V-14 |
| `engine/run_test.go` | ~15 | V-01, V-02, V-15 |
| `engine/conservation_test.go` | 43 | V-06 (타일 보존) |
| `engine/game_rules_comprehensive_test.go` | ~20 | V-01~V-07 종합 |
| `service/game_service_test.go` | ~30 | V-04, V-06, V-08, V-11, V-12 |
| `service/turn_service_test.go` | ~20 | V-04, V-05, V-07, V-09, V-10 |

---

## 10. 운영 규칙

이 문서는 다음 시점에 반드시 갱신한다:

1. **게임 엔진 코드 수정 시** — 영향받는 규칙 ID의 구현 파일:라인 업데이트
2. **게임 규칙 문서 변경 시** — 새 규칙 추가 또는 기존 규칙 변경 반영
3. **미구현 규칙 구현 시** — §2 "비검증 규칙"에서 해당 항목을 §1로 이동
4. **Sprint 회고 시** — 규칙 위반 사고가 있었으면 이 문서의 누락 여부 점검

**아키텍트 책임**: 게임 엔진 수정 계획서 작성 시 이 문서를 참조하여 규칙 커버리지를 확인한다.
