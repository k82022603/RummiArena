# E2E 이터레이션 1 보고서

- **날짜**: 2026-04-26
- **이미지**: `rummiarena/frontend:g-b-2f703b5`
- **커밋**: `2f703b5`
- **트리거**: G-B pendingStore 브릿지 구현 후 배포 전 검증

---

## 결과 요약

| 구분 | 수 |
|------|---|
| PASS | 9 |
| FAIL | 5 |
| SKIP | 3 |
| 총 TC | 17 |

## 상세 결과

| spec | TC | 결과 | 분류 |
|------|-----|------|------|
| rule-turn-boundary-invariants | SC1/SC2/SC3 | PASS | — |
| rule-invalid-meld-cleanup | SC1/SC2/SC3 | PASS | — |
| rule-ghost-box-absence | SC1/SC3 | PASS | — |
| rule-initial-meld-30pt | SC2/SC4 | SKIP | fixme |
| rule-extend-after-confirm | SC2 | SKIP | fixme |
| rule-extend-after-confirm | SC1 | FAIL | 의도된 RED (G-E: F-04 extend) |
| rule-extend-after-confirm | SC3 | FAIL | 의도된 RED (G-E: F-04 extend) |
| rule-initial-meld-30pt | SC1(V04-SC1) | FAIL | 의도된 RED (G-F: F-09 ConfirmTurn) |
| rule-initial-meld-30pt | SC3(V04-SC3) | FAIL | 의도된 RED (G-E: F-04 FINDING-01) |
| **rule-ghost-box-absence** | **GHOST-SC2** | **FAIL** | **예상 외 RED — G-B 미해소** |

## GHOST-SC2 근본 원인 분석

### 실패 assertion
```
line 175: expect(mid.pendingGroupIdsSize).toBeGreaterThanOrEqual(1)
Expected: >= 1
Received:    0
```

### 원인
1. E2E 테스트는 `dndDrag(page, y5, anchor)` 로 Y5a → R11a(서버 그룹) 드래그 수행
2. GameClient의 **인라인 handleDragEnd**가 실행됨 (dragEndReducer가 아님)
3. PRE_MELD 상태에서 서버 그룹에 드롭 → 인라인 코드가 이 경우를 pending 그룹 생성 없이 처리 (silent reject 또는 다른 경로)
4. `gameStore.pendingGroupIds`에 아무것도 추가되지 않음 → size=0

### G-B 구현의 한계
- G-B는 `dragEndReducer`에 action 필드를 추가하고 `pendingStore`에 마커 플래그를 추가함
- 하지만 **GameClient.handleDragEnd 인라인 코드**는 여전히 dragEndReducer를 호출하지 않음
- Jest 단위 테스트는 dragEndReducer 직접 호출로 통과했지만, 실제 브라우저 E2E에서는 인라인 코드가 실행됨
- game-analyst 교차 검증에서 "테스트 마커는 실제 동작을 보장하지 않는다" 경고가 정확히 적중

### 수정 계획
GameClient.handleDragEnd에서 실제로 dragEndReducer를 호출하고, 그 결과를 pendingStore.applyMutation으로 적용하는 브릿지 코드 추가 필요.

---

## 판정: NO-GO

사용자 전달 차단. GHOST-SC2 수정 후 이터레이션 2 실행.
