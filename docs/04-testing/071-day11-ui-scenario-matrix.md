# Day 11 UI ONLY 시나리오 매트릭스

작성일 2026-04-21 (Day 11 오후)
작성자 QA Engineer
브랜치 `chore/day11-wrap-up`

---

## 0. 배경

Day 11 오전/오후 frontend-dev 가 UI 버그 13건을 연속 수정한 직후,
사용자 애벌레가 **실측에서 "게임을 할 수 없다"** 고 신고했다.
기존 테스트 커버리지 (Jest 100 + Playwright 390) 가 아래 유형의 regression 을
잡지 못한 것이 원인이다.

| 놓친 레이어 | 사례 |
|------------|------|
| 순수 함수 | `validatePendingBlock`, `calculateScore` → 단위 테스트는 있으나 통합 흐름 검증 부족 |
| 컴포넌트 단위 Props → 표시 | `GameBoard` 의 pending 라벨/테두리, `PlayerCard` 배지 교차 검증 부족 |
| store 상태 파생 | `selectMyTileCount` 같은 파생 선택자, 확장 selector 부족 |
| 시나리오 통합 | 사용자가 발견한 K11(JK)-K12-K13 자동 감지, 혼색+연속불가 라벨, 30점 경고 |

본 문서는 Day 11 오후 QA 에이전트가 새로 작성한 **UI ONLY 20개 시나리오** 의 기준표이다.
`backend/WebSocket` 없이 `gameStore 직접 조작 + 컴포넌트 렌더링` 으로 검증 가능한 범위만 대상으로 한다.

---

## 1. 커버리지 매트릭스

| # | ID | 분류 | 대상 모듈 | 기대 동작 |
|---|----|------|-----------|-----------|
| 1 | S-01 | BlockValidity | `GameBoard.validatePendingBlock` | K11(JK)-K12-K13 → `valid-run` |
| 2 | S-02 | BlockValidity | `GameBoard.validatePendingBlock` | K11(JK)-K12(JK)-K13 2조커 런 → `valid-run` |
| 3 | S-03 | BlockRender | `GameBoard` | 미확정 블록 invalid → 빨간 `ring-2 ring-red-400` + "무효 세트" 라벨 |
| 4 | S-04 | BlockRender | `GameBoard` | 3장 미만 pending → "미확정" 라벨 표시 |
| 5 | S-05 | BlockRender | `GameBoard` | 혼색 연속불가 (9Y-10Y-11Y-12Y + 1B 하나 그룹으로 병합됐을 때) → 무효 라벨 |
| 6 | S-06 | BlockRender | `GameBoard` | `validMergeGroupIds` 지정 시 드래그 중 녹색 pulse ring |
| 7 | S-07 | TurnHistory | `TurnHistoryPanel` + `getTurnActionLabel` | `PENALTY_DRAW` → "강제 드로우 (유효하지 않은 조합 반복)" |
| 8 | S-08 | TurnHistory | `TurnHistoryPanel` + `getTurnActionLabel` | `DRAW_TILE` → "드로우" |
| 9 | S-09 | Score | `practice-engine.calculateScore` | K11(JK)-K12-K13 = 30+12+13 = 55점 (조커 30점 고정) |
| 10 | S-10 | Score | `practice-engine.calculateScore` | R7-B7-JK 그룹 = 7+7+30 = 44점 |
| 11 | S-11 | BlockValidity | `validatePendingBlock` | 같은 숫자 4색 그룹 R13-B13-Y13-K13 → `valid-group` |
| 12 | S-12 | BlockValidity | `validatePendingBlock` | 같은 색 연속 런 Y5-Y6-Y7 → `valid-run` |
| 13 | S-13 | Selector | `selectMyTileCount` + GameBoard tileCount 정합 | pendingMyTiles 반복 드래그로 길이 3→4→5→4 변경 시 매 단계 일치 |
| 14 | S-14 | MergeCompat | `isCompatibleWithGroup` + `computeValidMergeGroups` | K11(JK)-K12 런에 K13 드롭 시 머지 허용 |
| 15 | S-15 | MergeCompat | `computeValidMergeGroups` | B1 타일을 9Y-10Y-11Y-12Y 런(Y) 에 드롭 시 머지 금지 |
| 16 | S-16 | GhostTile | `detectDuplicateTileCodes` + GameBoard 렌더 | 드래그-반환-드래그 시퀀스 후 같은 tile code 2 블록에 동시 렌더 금지 (G-3) |
| 17 | S-17 | ActionBar | `ActionBar` | allGroupsValid=false 시 "확정" 버튼 disabled (G-2 근본 방어) |
| 18 | S-18 | PlayerCard | `PlayerCard` difficulty fallback | difficulty=undefined → "—" / "고수" 아님 (P0-3) |
| 19 | S-19 | PlayerCard | `PlayerCard` persona 괄호 | persona=calculator → 제목 "GPT (계산기)" |
| 20 | S-20 | TileSize | `Tile` SIZE_CLASS | rack 52x72 / table 44x60 재확인 (P2-3) |

---

## 2. 시나리오별 Given / When / Then

### S-01 · K11(JK)-K12-K13 런 자동 감지 (사용자가 직접 발견)
- **Given**: pending 블록 `[JK1, K12a, K13a]`
- **When**: `validatePendingBlock` 호출
- **Then**: `"valid-run"` 반환. 조커 1개가 K11 슬롯을 채운 검정색 런.
- **근거**: 오전 실측 로그 — 사용자가 "K12 놓고 K13 추가했는데 자동 합쳐짐" 이라고 보고.

### S-02 · 2조커 + 소수 일반 타일
- **Given**: pending 블록 `[JK1, JK2, K13a]` 또는 `[JK1, JK2, K12a, K13a]`
- **When**: `validatePendingBlock` 호출
- **Then**:
  - `[JK1,JK2,K13a]` — 일반 타일 1개라 숫자/색 모두 size=1 → 구현상 `valid-group` 분기 선진입. UI 상 "그룹 (미확정)" 표시는 허용 가능한 완성형이므로 `valid-run` 또는 `valid-group` 모두 허용.
  - `[JK1,JK2,K12a,K13a]` — 숫자 집합 {12,13} → `valid-run` 확정.
- **비고**: 2조커 + 단일 일반타일 케이스는 의미상 "판정 보류" 가 이상적이지만, 현재 구현은 그룹 분기를 먼저 수행한다. 치명적이지 않아 시나리오는 느슨한 기대(`valid-*`)로 작성.

### S-03 · 혼색 + 비연속 invalid 라벨 + 빨간 테두리
- **Given**: `GameBoard` props — `tableGroups=[{id:"p1", tiles:["R7a","B9a","Y3a"], type:"run"}]`, `pendingGroupIds=new Set(["p1"])`
- **When**: 컴포넌트 렌더
- **Then**:
  - "무효 세트" 라벨 렌더 (`text-red-400`)
  - 타일 컨테이너 `ring-2 ring-red-400` 클래스 포함
  - role=alert 안내 "색 혼합 또는 숫자 불연속"

### S-04 · 3장 미만 → "미확정" 라벨
- **Given**: pendingGroupIds 에 등록된 그룹 하나, tiles = `["R7a","R8a"]` (2장)
- **When**: GameBoard 렌더
- **Then**: "런 (미확정)" 라벨 (현재 group.type=run 기본). 빨간 경고는 없어야 함.

### S-05 · 그룹 내 혼색 (숫자 일치지만 색 중복)
- **Given**: tiles = `["R7a","R7b","B7a"]` (두 빨간 타일 + 파랑 7)
- **When**: validatePendingBlock
- **Then**: `"invalid"` 반환. 같은 숫자지만 색 중복.

### S-06 · validMergeGroupIds 녹색 pulse
- **Given**: `GameBoard` props — `isDragging=true, validMergeGroupIds=new Set(["g1"]), groupsDroppable=true`
- **When**: 렌더
- **Then**: `g1` 그룹 wrapper 에 `animate-pulse` + `ring-green-400/40` 클래스 존재.

### S-07 · PENALTY_DRAW 한글 번역
- **Given**: turnHistory 1건 `{turnNumber:5, action:"PENALTY_DRAW", placedTiles:[], seat:1, placedAt:...}`
- **When**: `TurnHistoryPanel` 렌더
- **Then**: 엔트리 내 italic 텍스트에 "강제 드로우 (유효하지 않은 조합 반복)" 표시.

### S-08 · DRAW_TILE 한글 번역
- **Given**: action = `"DRAW_TILE"`, placedTiles 비어있음
- **When**: 렌더
- **Then**: "드로우" 표시. 대문자 원문 `DRAW_TILE` 노출 금지.

### S-09 · 조커 포함 런 점수
- **Given**: groups = `[{tiles:["JK1","K12a","K13a"], type:"run"}]`
- **When**: `calculateScore`
- **Then**: 30 + 12 + 13 = **55점**

### S-10 · 조커 포함 그룹 점수
- **Given**: groups = `[{tiles:["R7a","B7a","JK1"], type:"group"}]`
- **When**: `calculateScore`
- **Then**: 7 + 7 + 30 = **44점**

### S-11 · 4색 그룹
- **Given**: `["R13a","B13a","Y13a","K13a"]`
- **When**: validatePendingBlock
- **Then**: `"valid-group"` (4개 이하 허용)

### S-12 · 같은 색 3연속 런
- **Given**: `["Y5a","Y6a","Y7a"]`
- **When**: validatePendingBlock
- **Then**: `"valid-run"`

### S-13 · tileCount 정합성
- **Given**: mySeat=0, players=`[{seat:0,type:HUMAN,tileCount:14}]`, pendingMyTiles 반복 업데이트
- **When**: 드래그-되돌리기 반복 시퀀스:
  - pending=`[R1a,R2a,R3a]` (14-3=11이 아니라 pendingMyTiles.length=3 우선)
  - pending=`[R1a,R2a,R3a,B5a]`
  - pending=`[R1a,R2a,R3a,B5a,Y7a]`
  - pending=`[R1a,R2a,R3a,B5a]` (되돌리기)
  - pending=null (확정, tileCount=10)
- **Then**: 각 단계에서 `selectMyTileCount` = 3 → 4 → 5 → 4 → 10

### S-14 · K11(JK)-K12 런에 K13 호환
- **Given**: group `[JK1, K12a]` type=run, 드래그 타일 `K13a`
- **When**: `isCompatibleWithGroup`
- **Then**: true (런 양 끝 확장 후보 K11/K13 모두 가능).

### S-15 · 파랑 타일을 노랑 런에 머지 금지 (F-2)
- **Given**: group `[Y9a,Y10a,Y11a,Y12a]` type=run, 드래그 타일 `B1a`
- **When**: `isCompatibleWithGroup`
- **Then**: false — 색이 다름.

### S-16 · 고스트 타일 중복 방지 (G-3)
- **Given**: pendingTableGroups = `[{id:"g1", tiles:["B1a","B2a","B1a"], type:"run"}]` (버그 재현 상태)
- **When**: `detectDuplicateTileCodes`
- **Then**: `["B1a"]` 반환. 확정 차단 근거.
- **추가 검증**: 정상 케이스 `[Y9-12 런 + B1-3 런]` → 빈 배열.

### S-17 · allGroupsValid=false → 확정 disabled
- **Given**: `ActionBar` props — `isMyTurn=true, hasPending=true, allGroupsValid=false`
- **When**: 렌더
- **Then**: "확정" 버튼에 `disabled` 속성.

### S-18 · PlayerCard difficulty 미정의
- **Given**: player `{type:"AI_OPENAI", persona:"fox", tileCount:14}` (difficulty 누락)
- **When**: 렌더
- **Then**: "—" 표시, "고수"/"중수"/"하수" 절대 출력 금지.

### S-19 · PlayerCard persona=calculator
- **Given**: player `{type:"AI_OPENAI", persona:"calculator", difficulty:"expert", tileCount:14}`
- **When**: 렌더
- **Then**: `title="GPT (계산기)"` 요소 존재 + 하단에 "고수" 배지.

### S-20 · Tile 크기 재확인
- **Given**: `<Tile code="R7a" size="rack">` 와 `<Tile code="R7a" size="table">`
- **When**: 렌더
- **Then**:
  - rack: className 에 `w-[52px]` `h-[72px]`
  - table: className 에 `w-[44px]` `h-[60px]`

---

## 3. 구현 방침

### Jest (주)
- 새 파일: `src/frontend/src/__tests__/day11-ui-scenarios.test.tsx`
- 사용 API:
  - `validatePendingBlock` 순수 함수 호출
  - `calculateScore`, `isCompatibleWithGroup`, `computeValidMergeGroups` 순수 함수
  - `selectMyTileCount` + `useGameStore.setState` (zustand 직접 조작)
  - `render(<GameBoard ... />)`, `render(<PlayerCard ... />)`, `render(<TurnHistoryPanel ... />)`, `render(<Tile ... />)`
- 금지: 실제 WebSocket, 실제 API fetch, GameClient 전체 렌더 (`DndContext` 의존성 복잡)

### Playwright (부, 여력되면)
- 새 파일: `src/frontend/e2e/day11-game-ui-scenarios.spec.ts`
- 범위: `/practice/stage1` 연습 모드에서 DOM CSS 검증 정도. 본 세션에서는 Jest 최우선.

---

## 4. 제약 / 미커버

- **실제 드래그 앤 드롭**: `@dnd-kit` 의 `PointerSensor` 시뮬레이션 난이도 높음 → Playwright E2E 에 위임. Jest 에서는 `handleDragEnd` 후처리 로직만 store 상태 주입으로 근사.
- **자동 병합 (S-01 실제 UI 조작)**: `GameClient.tsx:807-875` 의 `shouldCreateNewGroup` 판정 분기는 순수 함수로 추출돼 있지 않아 컴포넌트 통합 테스트 필요 → **TODO**. 대신 `validatePendingBlock` + `isCompatibleWithGroup` 조합으로 **판정 로직**만 우선 커버.
- **턴 타이머 10초 경고 색상** (# 21 제안): `TurnTimer` 의존성이 `gameState.turnTimeoutSec` + `useGameStore.remainingMs` + 타이머 interval 로 복잡 → 우선순위 낮음, 본 세션 제외.

---

## 5. 커버 이후 다음 단계

- PR #6 후보: GameClient 의 `shouldCreateNewGroup` / `handleDragEnd` 분기를 순수 헬퍼로 추출하는 리팩터 (Frontend Dev)
- PR #7 후보: `@dnd-kit` 기반 pointer 시뮬레이션 helper 도입 (Jest 에서 드래그 실제 흐름까지 검증)
- Sprint 7: 추출된 헬퍼로 컴포넌트-통합 시나리오 재작성
