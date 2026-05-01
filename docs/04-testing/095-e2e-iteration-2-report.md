# E2E 이터레이션 2 보고서

- **날짜**: 2026-04-26
- **이미지**: `rummiarena/frontend:g-b-fix-7a0b0c5`
- **커밋**: `7a0b0c5`
- **트리거**: GHOST-SC2 수정 후 전체 재검증

---

## 결과 요약

| 구분 | 이터레이션 1 | 이터레이션 2 | 변화 |
|------|------------|------------|------|
| PASS | 9 | **10** | +1 |
| FAIL | 5 | **4** | -1 |
| SKIP | 3 | 3 | 0 |

## GHOST-SC2 해소 확인

- **이터레이션 1**: FAIL (mid assertion `pendingGroupIdsSize >= 1` → Received: 0)
- **이터레이션 2**: **PASS** (setupGhostScenario players 배열 패치로 isMyTurn + hasInitialMeld 해결)
- **수정 범위**: E2E 테스트만 수정, 프로덕션 코드 무변경
- **근본 원인**: WS 메시지가 currentSeat 덮어쓰기 + players[0].hasInitialMeld 미설정

## 잔존 FAIL 4건 (모두 의도된 RED)

| TC | 실패 이유 | 해소 Task | 비고 |
|----|----------|----------|------|
| EXT-SC1 | F-04 extend 미구현 | Task #7 (G-E) | 서버 그룹 뒤에 append |
| EXT-SC3 | F-04 extend 미구현 | Task #7 (G-E) | 서버 그룹 앞에 prepend |
| V04-SC1 | F-09 ConfirmTurn 미구현 | Task #8 (G-F) | 30점 확정 → hasInitialMeld |
| V04-SC3 | F-04 FINDING-01 미구현 | Task #7 (G-E) | PRE_MELD 서버 드롭 → 분리 |

이 4건은 현재 세션 범위 밖 (G-E/G-F). 다음 Phase에서 해소 예정.

## 판정: CONDITIONAL GO

- GHOST-SC2 해소 ✅
- 기존 PASS 유지 (회귀 0) ✅
- 의도된 RED 4건은 G-E/G-F 범위로 명확히 분류
- **사용자 테스트 가능**: 기본 드래그·드롭 + 턴 전환 + 유령 박스 부재 검증 완료
- **제한**: 서버 그룹 extend(F-04), ConfirmTurn(F-09)은 미구현이므로 사용자가 해당 동작 시도 시 silent reject 발생

## 다음 단계

1. 사용자 실기 테스트 (http://localhost:30000)
2. 사용자 피드백 수렴 후 G-E/G-F 착수 판단
