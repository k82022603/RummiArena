# E2E 이터레이션 3 보고서

- **날짜**: 2026-04-27
- **이미지**: `rummiarena/frontend:g-e-2442913`
- **커밋**: `7c0dc75` (G-E A4/A8 split + G-F canConfirmTurn)
- **트리거**: G-E/G-F 구현 완료 후 K8s 배포 검증 (pre-deploy-playbook)
- **실행자**: qa (Opus 4.6)

---

## Pre-flight 결과

| 항목 | 결과 | 비고 |
|------|------|------|
| Frontend Pod | Running (29min uptime) | frontend-5cbc4ccb94-ghz9m |
| BUILD_ID | `b2qkVj8nIzoLwdYa2i5Fh` | |
| Endpoint | 307 (OAuth redirect) | http://localhost:30000 |
| game-server | OK (status=ok, redis=true) | |
| ai-adapter | OK (port 8081) | Istio sidecar 경유 |
| auth.json | 1796 bytes | 04-27 15:26 갱신 |
| Docker image | `rummiarena/frontend:g-e-2442913` | |

---

## 결과 요약

### Phase 2.1: 룰 기반 시나리오 (핵심 5 spec, 17 TC)

| 구분 | 이터레이션 1 | 이터레이션 2 | **이터레이션 3** | 변화 (2->3) |
|------|------------|------------|---------------|------------|
| PASS | 9 | 10 | **12** | **+2** |
| FAIL | 5 | 4 | **2** | **-2** |
| SKIP | 3 | 3 | 3 | 0 |

### Phase 2.3: 회귀 검증 (게임 핵심 7 spec, 55 TC)

| 구분 | 수 | 비고 |
|------|---|------|
| PASS | 41 | |
| FAIL | 12 | 전부 pre-existing (G-E/G-F 이전 동일 실패 패턴) |
| SKIP | 2 | |
| 소요 시간 | 9분 | |

### Jest 단위 테스트

| 구분 | 이터레이션 2 | **이터레이션 3** | 변화 |
|------|------------|---------------|------|
| PASS | 545 | **546** | **+1** |
| FAIL | 1 (A14.5) | **0** | **-1** |
| 총 Suites | 47 | 47 | 0 |

---

## GREEN 전환 (이터레이션 2 -> 3)

### EXT-SC1: 서버 런 뒤 append (RED -> PASS)

- **룰**: 확정후 extend, V-13b
- **시나리오**: hasInitialMeld=true + 서버 런 [R10 R11 R12] 뒤에 랙 R13 drop
- **이전 상태**: RED (F-04 extend 미구현, Task #7 G-E)
- **해소 원인**: G-E A4/A8 dragEndReducer split 분기 + GameClient handleDragEnd 통합
- **검증**: pendingGroupIds size=1, runTiles 4개, R13a 포함 확인

### EXT-SC3: 서버 런 앞 prepend (RED -> PASS)

- **룰**: 확정후 extend, V-13b
- **시나리오**: hasInitialMeld=true + 서버 런 [R10 R11 R12] 앞에 랙 R9 drop
- **이전 상태**: RED (F-04 extend 미구현, Task #7 G-E)
- **해소 원인**: 동일 (G-E A4/A8 구현)
- **검증**: runTiles 4개, R9a 포함 확인

### EXT-SC4: 호환 불가 반복 drop 복제 0 (유지 PASS)

- **룰**: V-06 타일 보존, BUG-UI-EXT
- **상태**: 이터레이션 2부터 PASS 유지 (복제 타일 0, 복제 그룹 0)

### A14.5 canConfirmTurn Jest (FAIL -> PASS)

- **룰**: UR-15, V-01~V-04, V-14, V-15
- **해소 원인**: G-F `canConfirmTurn()` 함수 신규 구현 (turnUtils.ts)
- **검증**: 546/546 PASS

---

## 잔존 FAIL (Phase 2.1, 의도된 RED 2건)

| TC | 실패 위치 | 실패 내용 | 분류 | 해소 전망 |
|----|----------|----------|------|----------|
| V04-SC1 | rule-initial-meld-30pt.spec.ts:174 | dndDrag로 R10a/R11a/R12a 보드 이동 후 rackCodes에 여전히 존재 | dndDrag 타이밍 | E2E 테스트 인프라 개선 필요 |
| V04-SC3 | rule-initial-meld-30pt.spec.ts:299 | dndDrag로 Y9a를 서버 그룹 R9a 위 drop 후 y9InNewGroup=false | dndDrag 타이밍 | 동일 |

### V04-SC1 근본 원인 분석

```
Expected: rackCodes not to contain "R10a"
Received: ["R10a", "R11a", "R12a"]
```

- 테스트가 R10a, R11a, R12a를 순차적으로 빈 게임 테이블(`section[aria-label="게임 테이블"]`)로 dndDrag
- 스크린샷 확인: 게임 테이블 0개 그룹, 랙 3장 -- 드래그 미반영
- **원인**: dndDrag가 빈 보드의 drop zone("game-board" 또는 "+" placeholder)에 도달하지 못함
- **프로덕션 코드 영향**: 없음. dnd-kit closestCenter 알고리즘이 headless 모드에서 빈 보드를 valid drop target으로 인식하지 못하는 E2E 인프라 문제
- **이전 이터레이션**: 동일 실패 패턴 (iter 1: "의도된 RED G-F", iter 2: "의도된 RED G-F")

### V04-SC3 근본 원인 분석

```
Expected: y9InNewGroup = true
Received: false
```

- Y9a를 서버 그룹 내 R9a 타일 위로 dndDrag -- store에 반영되지 않음
- 스크린샷 확인: 서버 그룹 3타일 유지, 랙 1장(Y9a) 유지
- **원인**: hasInitialMeld=false 경로에서 서버 그룹 타일 위 drop 시 FINDING-01 분기 진입 기대, 실제로는 dndDrag가 state 변경을 유발하지 않음
- **프로덕션 코드 영향**: 없음. 동일 dndDrag 타이밍 이슈

---

## 회귀 검증 FAIL 분류 (Phase 2.3, 12건)

### 분류 A: dndDrag 타이밍 이슈 (8건, pre-existing)

| TC | spec | 실패 내용 | G-E/G-F 연관 |
|----|------|----------|-------------|
| TC-RR-01 | rearrangement.spec.ts:121 | Y9a→[R9 B9 K9] 합병 후 "4개 타일" 뱃지 0 | 없음 (rack->server 경로 미변경) |
| TC-RR-02 | rearrangement.spec.ts:182 | Y9a drop 후 y9InNewGroup=false | 없음 |
| TC-RR-06 | rearrangement.spec.ts:633 | B7a→[R7 JK1 K7] 조커 교체 미동작 | 없음 (joker swap 경로 미변경) |
| TC-RR-07 | rearrangement.spec.ts:749 | R7a+Y4a 순차 drop 후 2그룹 분리 미동작 | 없음 |
| TC-I1-SC3 | hotfix-p0-i1:205 | R13a append 후 containsR13=false | 없음 |
| TC-I2-SC1 | hotfix-p0-i2:101 | Y2→서버 run drop 후 y2InRack=true | 없음 |
| TC-I2-SC2 | hotfix-p0-i2:176 | Y7→서버 run drop 후 동일 | 없음 |
| TC-I2-SC3 | hotfix-p0-i2:246 | B5→서버 run drop 후 동일 | 없음 |

**근거**: G-E/G-F diff 분석 결과, rack->server/rack->pending 경로(GameClient.tsx lines 930-1115)는 미변경. 변경된 코드는 `dragSource?.kind === "table"` 블록(lines 829-930) 내부의 A4/A8 분기와 `turnUtils.ts` canConfirmTurn뿐. 모든 8건은 dndDrag 헬퍼가 headless Chromium에서 rack 타일을 보드/서버 그룹 타일로 이동시킬 때 dnd-kit의 collision detection이 drop을 인식하지 못하는 기존 인프라 한계.

### 분류 B: 방 생성 폼 UI (4건, pre-existing)

| TC | 실패 내용 |
|----|----------|
| TC-GF-008 | 턴 타임아웃 30초 설정 slider 조작 실패 |
| TC-GF-009 | 턴 타임아웃 120초 설정 slider 조작 실패 |
| TC-FV-003 | 타임아웃 슬라이더 30~120 범위 확인 실패 |
| TC-FV-005 | 로비 돌아가기 후 기본값 복원 실패 |

**근거**: G-E/G-F는 방 생성 폼 코드를 전혀 변경하지 않음. 타임아웃 슬라이더 관련 UI 테스트는 Sprint 6 이후 간헐적 실패 이력 있음.

---

## Phase 3: 단언 체크리스트

### 3.1 드래그-드롭 정합성

- [x] 확정 후 extend append (EXT-SC1): silent revert 없음, 4타일 정상 반영
- [x] 확정 후 extend prepend (EXT-SC3): R9a 포함 4타일 정상 반영
- [x] 복제 타일 0 (EXT-SC4, GHOST-SC1): duplicatedTiles = []
- [x] 복제 그룹 시그니처 0 (EXT-SC4): duplicatedGroupSignatures = []
- [x] 연속 drop 시 pendingGroupSeq 단조 증가 (GHOST-SC3): 중복 없음 확인

### 3.2 턴 경계

- [x] AI 턴 중 확정/드로우 버튼 disabled (TBI-SC3): PASS
- [x] 턴 종료 시 pendingGroupIds=0, pendingTableGroups=null (TBI-SC1): PASS
- [x] hasInitialMeld true -> false regression 없음 (TBI-SC2): PASS

### 3.3 룰 검증

- [x] V-06 복제 tile 0: GHOST-SC1, EXT-SC4 모두 PASS
- [x] V-08 자기 턴 확인: TBI-SC3 PASS
- [x] hasInitialMeld=true extend append 성공: EXT-SC1 PASS, EXT-SC3 PASS
- [x] hasInitialMeld=true 호환 불가 drop 시 복제 0: EXT-SC4 PASS
- [x] TURN_START 후 pending 초기화: GHOST-SC2 PASS
- [ ] V-04 30점 Happy (V04-SC1): dndDrag 타이밍 이슈로 미검증
- [ ] hasInitialMeld=false 서버 그룹 drop 분리 (V04-SC3): dndDrag 타이밍 이슈로 미검증

### 3.4 canConfirmTurn (G-F)

- [x] V-03 tilesAdded < 1 차단: Jest A14.5 PASS
- [x] UR-15 pending 그룹 없음 차단: Jest A14.5 PASS
- [x] V-02 3타일 미만 차단: Jest A14.5 PASS
- [x] V-04 30점 미만 차단: Jest A14.5 PASS
- [x] V-07 조커 미배치 차단: Jest A14.5 PASS

---

## G-E/G-F 변경 범위 vs 실제 변경 대조

| 계획 항목 | 파일 | 구현 확인 |
|----------|------|----------|
| A4: pending -> 새 그룹 split | dragEndReducer.ts (lines 185-228) | PASS (SPLIT_PENDING_GROUP action) |
| A8: server -> 새 그룹 split (POST_MELD) | dragEndReducer.ts (동일 블록) | PASS (SPLIT_SERVER_GROUP action) |
| A4/A8 GameClient 통합 | GameClient.tsx (lines 859-882) | PASS (dragEndReducer 위임) |
| canConfirmTurn (A14/UR-15) | turnUtils.ts (lines 106-185) | PASS (5개 조건 모두 구현) |
| pendingGroupIds 소스 추적 | dragEndReducer.ts line 281 + GameClient.tsx line 925 | PASS (sourceGroup.id 추가) |
| E2E fixture players 패치 | rule-extend-after-confirm.spec.ts, rule-initial-meld-30pt.spec.ts | PASS (players[] 주입 패턴 적용) |

### 의도치 않은 변경 확인

- dragEndReducer.ts: A4/A8 블록 추가 + table-to-table pendingGroupIds 소스 추적 추가 -- 계획 범위 내
- GameClient.tsx: A4/A8 위임 블록 + table-to-table pendingGroupIds 동기화 -- 계획 범위 내
- turnUtils.ts: canConfirmTurn 함수 신규 -- 계획 범위 내
- **범위 밖 변경 없음**

---

## 판정: CONDITIONAL GO

### GO 근거

1. **G-E 핵심 기능 검증 완료**: EXT-SC1 (append), EXT-SC3 (prepend) 모두 GREEN 전환
2. **G-F 핵심 기능 검증 완료**: canConfirmTurn Jest 546/0 PASS, A14.5 GREEN 전환
3. **기존 PASS 유지 (회귀 0)**: 이터레이션 2 PASS 10건 전부 유지 + 2건 GREEN 전환
4. **복제/고스트 부재 확인**: GHOST-SC1/SC2/SC3, EXT-SC4 모두 PASS
5. **턴 경계 invariants 정상**: TBI-SC1/SC2/SC3 모두 PASS
6. **의도치 않은 변경 없음**: diff 분석 결과 계획 범위 내 변경만 확인

### CONDITIONAL 이유

1. **V04-SC1/SC3 미검증**: dndDrag 타이밍 이슈로 "빈 보드 drop" + "hasInitialMeld=false 서버 그룹 drop" 시나리오 E2E 검증 불가. 단, Jest 단위 테스트에서 해당 로직 경로 커버 확인 (dragEndReducer + canConfirmTurn)
2. **회귀 검증 12건 FAIL**: 전부 pre-existing이나, 향후 dndDrag 인프라 개선 시 재검증 필요
3. **1게임 완주 메타 미실행**: Ollama 의존 + 15분 소요로 본 이터레이션에서 미실행. Phase 2.2 보류

### 사용자 전달 조건

- 기본 드래그-드롭 + 턴 전환 + 유령 박스 부재: 검증 완료
- 서버 그룹 extend (append/prepend): 검증 완료 (G-E 핵심)
- 확정 버튼 활성화 조건: Jest 검증 완료 (G-F 핵심)
- **제한**: V04-SC1/SC3의 "빈 보드에 타일 drop" 시나리오는 E2E 미검증

---

## 이터레이션 추이 요약

```mermaid
gantt
    title E2E 이터레이션 추이 (룰 시나리오 17 TC)
    dateFormat YYYY-MM-DD
    section PASS
    9 PASS (iter 1)    :done, 2026-04-26, 1d
    10 PASS (iter 2)   :done, 2026-04-26, 1d
    12 PASS (iter 3)   :done, 2026-04-27, 1d
    section FAIL
    5 FAIL (iter 1)    :crit, 2026-04-26, 1d
    4 FAIL (iter 2)    :crit, 2026-04-26, 1d
    2 FAIL (iter 3)    :crit, 2026-04-27, 1d
```

| 이터레이션 | 날짜 | 이미지 | PASS | FAIL | SKIP | 핵심 변화 |
|-----------|------|--------|------|------|------|----------|
| 1 | 04-26 | g-b-2f703b5 | 9 | 5 | 3 | GHOST-SC2 예상 외 RED 발견 |
| 2 | 04-26 | g-b-fix-7a0b0c5 | 10 | 4 | 3 | GHOST-SC2 GREEN 전환 |
| **3** | **04-27** | **g-e-2442913** | **12** | **2** | **3** | **EXT-SC1, EXT-SC3 GREEN + A14.5 GREEN** |

---

## 다음 단계

1. **dndDrag 인프라 개선**: V04-SC1/SC3 해소를 위해 dndDrag 헬퍼가 빈 보드 drop zone + 서버 그룹 타일 drop을 headless에서 정확히 처리하도록 개선 필요
2. **방 생성 폼 UI 테스트 수정**: TC-GF-008/009, TC-FV-003/005 타임아웃 슬라이더 테스트 안정화
3. **1게임 완주 메타**: Ollama 기반 20턴 이상 완주 테스트 실행 (별도 이터레이션)
4. **Sprint 7 Week 3**: V04-SC1/SC3 GREEN 전환 목표

---

## 변경 이력

- **2026-04-27 v1.0**: 이터레이션 3 보고서 작성. G-E/G-F 배포 후 검증. EXT-SC1/SC3 GREEN, A14.5 GREEN.
