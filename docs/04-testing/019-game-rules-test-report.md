# 17. 게임 규칙(Game Rules) 전면 테스트 보고서

- **작성일**: 2026-03-29
- **작성자**: 애벌레 (QA Engineer)
- **테스트 범위**: Game Engine (`src/game-server/internal/engine/`) 전체
- **도구**: Go testify (유닛), Playwright (E2E)

---

## 1. 테스트 결과 요약

### 1.1 Go 유닛 테스트

| 구분 | 수량 | 결과 |
|------|------|------|
| 기존 테스트 | 67개 | 67 PASS |
| 신규 테스트 | 271개 (서브테스트 포함) | 271 PASS |
| **합계** | **338개** | **338 PASS (100%)** |
| 커버리지 | - | **95.3%** |

### 1.2 Playwright E2E 테스트

| 구분 | 수량 | 결과 |
|------|------|------|
| 기존 E2E | 44개 | 44 PASS |
| 신규 game-rules.spec.ts | 18개 | 18 PASS |
| **합계** | **62개** | **62 PASS (100%)** |

---

## 2. 발견된 버그

### BUG-GR-001: `runScore` 조커 위치 계산 오류 (수정 완료)

| 항목 | 내용 |
|------|------|
| **심각도** | Medium |
| **파일** | `src/game-server/internal/engine/run.go:runScore()` |
| **증상** | 조커가 런의 앞쪽(min 이전)에 올 수 있는 경우에도 무조건 뒤쪽(max 이후)에 배치하여 점수를 과다 계산 |
| **재현** | `runScore([JK1, R2a, R3a])` → 기대값 6 (JK=R1 시) 또는 9 (JK=R4 시) |
| **원인** | `runScore`가 `min(nonJokerNumbers)`를 런 시작점으로 고정하여, 조커가 앞에 올 가능성을 무시 |
| **수정** | 조커를 max 이후에 먼저 배치하고, 13 초과 시 min 이전으로 분배하는 로직으로 변경 |
| **영향** | 점수 계산은 최초 등록(initial meld) 30점 검증에 직접 사용되지 않음 (validator는 `Tile.Score()` 사용). 향후 AI 전략 분석이나 교착 점수 비교 시 영향 가능 |
| **상태** | FIXED |

#### 수정 전 코드

```go
func runScore(tiles []*Tile) int {
    // ...
    min := nonJokerNums[0]
    sum := 0
    for i := 0; i < len(tiles); i++ {
        sum += min + i  // 항상 min부터 시작 -> 조커가 앞에 올 경우 과다 계산
    }
    return sum
}
```

#### 수정 후 코드

```go
func runScore(tiles []*Tile) int {
    // ...
    // 내부 갭을 채운 후 남은 조커를 max 뒤에 먼저 배치
    jokersAfter := remaining
    if maxNum+jokersAfter > 13 {
        jokersAfter = 13 - maxNum
    }
    jokersBefore := remaining - jokersAfter
    start := minNum - jokersBefore
    // ...
}
```

---

## 3. 테스트 케이스 상세

### 3.1 그룹(Group) 유효성 검증

| TC-ID | 케이스 | 입력 | 기대 | 결과 |
|-------|--------|------|------|------|
| G-3C-01 | 3색 R+B+Y | R3a, B3a, Y3b | VALID | PASS |
| G-3C-02 | 3색 R+B+K | R3a, B3a, K3b | VALID | PASS |
| G-3C-03 | 3색 R+Y+K | R3a, Y3a, K3b | VALID | PASS |
| G-3C-04 | 3색 B+Y+K | B3a, Y3a, K3b | VALID | PASS |
| G-4C-01~13 | 4색 그룹 (숫자 1~13) | R/B/Y/K 조합 | VALID | 13 PASS |
| G-INV-01 | 2장 그룹 | R3a, B3a | ERR_SET_SIZE | PASS |
| G-INV-02 | 5장 그룹 | R3a, B3a, Y3a, K3b, R3b | ERR_SET_SIZE | PASS |
| G-INV-03 | 색상 중복 | R3a, R3b, B3a | ERR_GROUP_COLOR_DUP | PASS |
| G-INV-04 | 숫자 불일치 | R3a, B4a, Y3a | ERR_GROUP_NUMBER | PASS |
| G-JK-01~05 | 조커 포함 유효 그룹 | 다양한 조합 | VALID | 5 PASS |
| G-JK-INV-01 | 조커+색 중복 | JK1, R3a, R3b | ERROR | PASS |
| G-JK-INV-02 | 조커+숫자 다름 | JK1, R3a, B4a | ERROR | PASS |
| G-JK-ONLY | 조커만 3장 | JK1, JK2, JK1 | ERR_RUN_NO_NUMBER | PASS |

### 3.2 런(Run) 유효성 검증

| TC-ID | 케이스 | 입력 | 기대 | 결과 |
|-------|--------|------|------|------|
| R-LEN-03~13 | 3~13장 런 | R1~Rn (각 길이) | VALID | 11 PASS |
| R-HI-01~03 | 끝이 13인 런 | R11~R13 등 | VALID | 3 PASS |
| R-CLR-01~04 | 모든 색상 런 | 색상별 5-6-7 | VALID | 4 PASS |
| R-INV-01 | 2장 런 | R1a, R2a | ERR_SET_SIZE | PASS |
| R-INV-02~04 | 비연속 런 | 다양한 갭 | ERR_RUN_SEQUENCE | 3 PASS |
| R-INV-05 | 색상 혼합 | R1a, B2a, R3a | ERR_RUN_COLOR | PASS |
| R-INV-06~07 | 순환(13-1) | R12-R13-R1 등 | ERROR | 2 PASS |
| R-INV-08~09 | 숫자 중복 | R3a-R3b-R4a 등 | ERR_RUN_DUPLICATE | 2 PASS |
| R-JK-01~07 | 조커 포함 유효 런 | 다양한 위치 | VALID | 7 PASS |
| R-JK-INV-01 | 조커+색 혼재 | JK1, R2a, B3a | ERROR | PASS |
| R-JK-INV-02 | 조커+큰 갭 | R1a, R13a, JK1 | ERROR | PASS |
| R-JK-BD-01~03 | 경계값 조커 | 다양한 | VALID | 3 PASS |
| R-SORT-01 | 정렬 안 된 입력 | R5a, R3a, R4a | VALID | PASS |
| R-FULL-01 | 13장 전체 런 | B1~B13 | VALID | PASS |
| R-12-13-JK-JK | 4장 경계 | R12-R13-JK-JK | VALID (10~13) | PASS |

### 3.3 최초 등록(Initial Meld) — 30점 규칙

| TC-ID | 케이스 | 점수 | 기대 | 결과 |
|-------|--------|------|------|------|
| IM-01 | 27점 (9*3) | 27 | ERR_INITIAL_MELD_SCORE | PASS |
| IM-02 | 30점 (10*3) | 30 | VALID | PASS |
| IM-03 | 33점 (11*3) | 33 | VALID | PASS |
| IM-04 | 3점 (1*3) | 3 | ERR_INITIAL_MELD_SCORE | PASS |
| IM-05 | 39점 (13*3) | 39 | VALID | PASS |
| IM-06 | 여러 세트 합계 33점 | 33 | VALID | PASS |
| IM-07 | 조커 포함 (Score=30) | 32 | VALID | PASS |
| IM-08 | 런으로 30점 | 30 | VALID | PASS |
| IM-09 | 런으로 6점 | 6 | ERR_INITIAL_MELD_SCORE | PASS |

### 3.4 턴 규칙 (V-03, V-05, V-06, V-07)

| TC-ID | 규칙 | 케이스 | 기대 | 결과 |
|-------|------|--------|------|------|
| V03-01 | V-03 | 랙에서 타일 미추가 | ERR_NO_RACK_TILE | PASS |
| V05-01 | V-05 | 최초 등록 전 테이블 재배치 | ERR_INITIAL_MELD_SOURCE | PASS |
| V05-02 | V-05 | 기존 테이블 보존 + 새 세트 추가 | VALID | PASS |
| V06-01 | V-06 | 테이블 타일 감소 | ERR_TABLE_TILE_MISSING | PASS |
| V07-01 | V-07 | 조커 교환 후 즉시 사용 | VALID | PASS |
| V07-02 | V-07 | 조커 교환 후 미사용 | ERR_JOKER_NOT_USED | PASS |

### 3.5 재배열 규칙

| TC-ID | 케이스 | 기대 | 결과 |
|-------|--------|------|------|
| RA-01 | 4장 그룹 분리 + 새 런 구성 | VALID | PASS |
| RA-02 | 기존 3장 그룹에 타일 추가 (4장 확장) | VALID | PASS |
| RA-03 | 최초 등록 후 재배열 가능 | VALID | PASS |

### 3.6 점수 계산 (groupScore, runScore)

| TC-ID | 케이스 | 기대 점수 | 결과 |
|-------|--------|-----------|------|
| GS-01~13 | 숫자 1~13 그룹 점수 | num*3 | 13 PASS |
| RS-01 | JK-R2-R3 | 9 (2+3+4) | PASS |
| RS-02 | R11-R12-JK | 36 (11+12+13) | PASS |
| RS-03 | R3-JK-R5 | 12 (3+4+5) | PASS |
| RS-04 | R3-JK-JK-R6 | 18 (3+4+5+6) | PASS |
| RS-05 | 13장 전체 런 | 91 | PASS |

---

## 4. Playwright E2E 테스트 상세

| TC-ID | 스테이지 | 케이스 | 기대 | 결과 |
|-------|---------|--------|------|------|
| GR-01 | 1 | R7+B7+Y7 (3색 그룹) | 클리어 가능 | PASS |
| GR-02 | 1 | R7+B7+Y7+K7 (4색 그룹) | 클리어 가능 | PASS |
| GR-03 | 1 | R7+B7 (2개) | 클리어 불가 | PASS |
| GR-04 | 1 | R7+B7+R3 (숫자 불일치) | 클리어 불가 | PASS |
| GR-05 | 1 | 초기화 후 재배치 | 클리어 가능 | PASS |
| RN-01 | 2 | R4+R5+R6 (3장 런) | 클리어 가능 | PASS |
| RN-02 | 2 | R4+R5+R6+R7 (4장 런) | 클리어 가능 | PASS |
| RN-03 | 2 | R4+R5+B3 (색 혼합) | 클리어 불가 | PASS |
| RN-04 | 2 | R4+R6+R7 (비연속) | 클리어 불가 | PASS |
| RN-05 | 2 | R4+R5 (2장) | 클리어 불가 | PASS |
| JK-01 | 3 | JK1+B7+Y7 (조커 그룹) | 클리어 가능 | PASS |
| JK-02 | 3 | JK1+R5+R6 (조커 런) | 클리어 가능 | PASS |
| JK-03 | 3 | JK1+R5+B7 (무효 조합) | 클리어 불가 | PASS |
| JK-04 | 3 | B7+Y7+K7 (조커 없이) | 클리어 가능 | PASS |
| MX-01 | 4 | 런+그룹 복합 배치 | 클리어 가능 | PASS |
| MX-02 | 4 | 런만 배치 | 클리어 불가 | PASS |
| RST-01 | 1 | 배치 후 초기화 | 랙 복구 | PASS |
| RST-02 | 2 | 초기화 후 확정 비활성 | 비활성화 | PASS |

---

## 5. 커버리지 상세

```
파일                         커버리지
----                         --------
elo_calculator.go            95.5%
errors.go                    100.0%
group.go (ValidateGroup)     100.0%
group.go (groupScore)        100.0%
pool.go                      88.9~100.0%
run.go (ValidateRun)         100.0%
run.go (runScore)            84.6%
tile.go                      100.0%
validator.go                 76.9~100.0%
----
전체 (statements)            95.3%
```

---

## 6. 게임 엔진 코드 품질 평가

### 6.1 잘 구현된 부분

1. **세트 유효성 검증**: 그룹과 런 모두 루미큐브 공식 규칙을 정확히 구현
2. **조커 처리**: 조커가 그룹/런에서 빈 자리를 대체하는 로직이 정확
3. **조커만 세트 방지**: 설계 결정 B.3에 따라 조커만으로 세트 구성 불가
4. **최초 등록 규칙**: 30점 경계값 검증, 자기 랙 타일만 사용 제한
5. **테이블 보존 규칙**: V-06 타일 유실 감지, V-07 조커 교환 즉시 사용 강제
6. **에러 타입 설계**: `ValidationError` 구조체로 에러 코드/메시지/관련 타일 추적

### 6.2 설계 결정 사항 (버그 아님)

1. **조커 Score() = 30점**: 최초 등록 점수 계산에서 조커는 30점으로 계산 (그룹/런 내 위치 숫자가 아님). 이는 validator.go의 `validateInitialMeld`에서 `Parse(code).Score()` 사용으로 구현됨.
2. **ValidateTileSet 우선순위**: 그룹 검증을 먼저 시도하고 실패 시 런 검증. 그룹 에러를 우선 반환.

---

## 7. 파일 변경 이력

| 파일 | 변경 내용 |
|------|-----------|
| `src/game-server/internal/engine/run.go` | `runScore()` 조커 위치 계산 버그 수정 (BUG-GR-001) |
| `src/game-server/internal/engine/game_rules_comprehensive_test.go` | 신규 테스트 파일 (271개 서브테스트) |
| `src/frontend/e2e/game-rules.spec.ts` | 신규 E2E 테스트 파일 (18개 테스트) |
| `docs/04-testing/17-game-rules-test-report.md` | 본 문서 |
