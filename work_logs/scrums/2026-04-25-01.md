# 스탠드업 미팅 — UI 전면 재설계 Kickoff

- **날짜**: 2026-04-25 12:00 KST
- **유형**: 긴급 스탠드업 (재설계 착수)
- **소집 사유**: 사용자(애벌레) 명령 — "UI 소스코드 완전히 갈아엎어. 처음부터 새롭게 짤 생각하고 다시 게임 분석하고 다시 설계해. 팀원 모두 달려들어 제대로 만들란 말이다." + "클로드 네가 PM 역할하지 말고, PM이 PM 역할하게 해라."
- **주재**: **pm** (본 sprint 부터 PM 역할 본인이 인수, Claude main 은 dispatcher 로 한정)
- **참석자 (8명)**: pm, architect, **game-analyst (신규)**, frontend-dev, go-dev, designer, qa, security
- **모드**: 스탠드업 (긴급 — 시간 제한 없음)

---

## 0. 배경 + PM 책임 명시 (3분, pm)

### 0-1. 사용자 실측 사고 24시간 3건

1. **2026-04-24 21:45~21:51** — 보드 그룹 (12B,12K,12R) × 2 복제 + 11s 그룹 소실. 11턴 0배치 후 FORFEIT.
2. **2026-04-25 10:20~10:25** — 그룹 ID 중복 토스트, 11턴 0배치 후 FORFEIT (2차 ELO -15)
3. **2026-04-25 11:30 직전** — 사용자가 B10 을 (B10/B11/B12) 런에 드래그하려 했는데 source guard false positive 로 모든 배치 차단

상세 사고 보고서: `docs/04-testing/84-ui-turn11-duplication-incident.md`, `docs/04-testing/86-ui-2nd-incident-2026-04-25.md`.

### 0-2. PM 본인 책임 명시 (자기 부채)

본 PM 은 Day 3 (2026-04-24) 스탠드업을 주재했고, 그 결과로 14건의 PR (#70~#83) 머지를 승인했다. 그러나 다음 3대 게이트를 **사전 정의했음에도 실제 강제하지 않았다**:

1. **묶음 PR 금지** (Day 2 교훈) — PR #81 이 F1~F5 5건을 한 PR 로 통합 머지되어 bisect 불가능 구조 발생. PM 본인이 PR 분리 요구하지 않고 통과시킨 책임.
2. **PR 머지 후 즉시 재빌드** — frontend v1, ai-adapter v1 이미지 드리프트 2회. PM 이 머지 직후 빌드 트리거 검증 안 함.
3. **RED spec 선행 원칙** — Day 3 가이드 문서 자체가 "RED 없이 구조 제안" 상태로 흘러갔다. PM 이 가이드 템플릿 체크박스 강제 안 함.

사용자 명령 "팀원 모두 달려들어 제대로 만들란 말이다" 는 본 PM 이 14명 (현 8명 + 향후 합류) 동원 책임자라는 의미다. Day 3 14건 머지는 외형 성과지표일 뿐, 사용자가 게임을 못 하게 만든 것이 결과 지표다. 본 PM 은 외형에 만족하고 결과를 검증하지 않은 직무 유기다.

본 sprint 부터 본 PM 은 다음을 직접 강제한다:

- 모든 PR commit message 에 game-analyst 룰 ID 매핑 의무화. 미매핑 PR 은 본 PM 이 자동 거절.
- PR 머지 후 30분 내 재빌드 + 이미지 SHA 검증 안 되면 머지 자체 무효 처리.
- 가이드/설계 문서도 RED spec (Mermaid + invariant + acceptance criteria) 선행 후에만 본문 작성 허용.

### 0-3. 권한 이동 결정 (본 PM 이 8명 합의 도출 후 명문화)

사용자 발언:
- "지금은 클로드메인도 아키텍트도 못 믿겠다."
- "기본 테스트도 안하고 사용자 테스트 하라고 들이미는 클로드 부터 교체하고 싶다고."
- "클로드 네가 PM 역할하지 말고, PM이 PM 역할하게 해라."

본 PM 이 사용자 발언을 근거로 다음 권한 이동을 명문화한다 (Claude main 의 self-deprive 가 아닌, **PM 의 결정**):

| 역할 | 변경 전 | 변경 후 |
|------|---------|---------|
| **Claude main** | 메인 세션 — 분석/설계/구현 결정 | **dispatcher / 산출물 전달자만** (게임 도메인 결정권 박탈) |
| **architect** | 시스템 + 게임 도메인 설계 | **시스템 토폴로지 / 컴포넌트 분해만** (게임 도메인 결정권 박탈) |
| **game-analyst (신규)** | (없음) | **게임 도메인 SSOT** (룰 / 행동 매트릭스 / 상태 머신 SSOT 권한) |
| **pm** | 일정 조율 | **본 sprint 의사결정 최종권자** (Claude main 결정 위임 금지) |

세 역할 (Claude main, architect, game-analyst) 의 의견 충돌 시 **game-analyst 우선**. 단, game-analyst 명세를 벗어난 사항은 **PM 이 최종 판단**.

### 0-4. 현재 상태

GameClient.tsx HEAD 로 revert 완료. 모든 야간 guard / 토스트 / source guard 제거. dragEndReducer 와 테스트는 보존 (분석 자료로 활용, 단 game-analyst 명세 매핑 미통과 시 폐기 대상).

---

## 1. 각자 공유

### pm (본인)
- **어제**: Day 3 PR 14건 머지 주재했으나 묶음 PR(#81) 승인·재빌드 누락·RED spec 선행 미강제 3대 게이트 방치. 외형 성과(14건 머지)에 만족했고 결과(사용자 실측 사고 3건)를 검증하지 않음. 사용자 신뢰 위기 직접 책임자.
- **오늘**: (1) 본 스탠드업 주재 + 8명 발언 수합 + 권한 이동 명문화. (2) Sprint 7 Week 2 백로그 (W2-A~J) 동결 + UI 전면 재설계 Kickoff WBS 재작성. (3) `work_logs/plans/2026-04-25-rebuild-standup-cadence.md` (다음 스탠드업 운영 계획) 발행. (4) game-analyst SSOT 도착 시 본 PM 이 후속 풀 dispatch 직접 실행. (5) PR 머지 정책 (룰 ID 매핑 의무화) 본 sprint 즉시 발효.
- **블로커**: 16GB RAM 교대 실행 제약에서 8명 병렬 worktree 동시 구동 메모리 한계는 본 PM 이 "단일 critical path = game-analyst" 로 정리해 해소 (다른 7명은 SSOT 도착 전 가벼운 사전 작업만). 기존 `handleDragEnd` 484줄 코드 폐기 vs 보존 결단은 game-analyst SSOT 매핑 결과로 자동 결정 (룰 ID 매핑 안 되면 폐기).

### architect
- **어제**: Day 3 Phase 1 분석 계획서 4건 (BUG-UI-009/010/011/013/014 + EXT/GHOST 회귀 nav) 발행, F4 `effectiveHasInitialMeld` 7지점 역순 revert bisect 경로 W2-A 로 이관 확정.
- **오늘**: `docs/02-design/58-ui-component-decomposition.md` 스켈레톤 (시스템 토폴로지 + dnd-kit ↔ Zustand ↔ WS 데이터 흐름 3-layer 골격) 만 선착, game-analyst 게임룰 enumeration 수령 후 컴포넌트 분해·이벤트 계약 본격 설계.
- **블로커**: game-analyst 의 룰 SSOT (재배치 4유형 × 초기 멜드 30 × 조커 회수 경계조건) enumeration 미수령 — 이것 없이 컴포넌트 책임 경계 못 그음.

### game-analyst (신규 — general-purpose 임시 대행)
- **어제**: 신규 영입 — 사용자 실측 사고 3건(Turn#11 보드 복제, 그룹 ID 중복, B10 드래그 차단) 리뷰 및 페르소나 정의(`.claude/agents/game-analyst-agent.md`) 숙지.
- **오늘**: 게임룰 SSOT 3종 산출 — `docs/02-design/55-game-rules-enumeration.md` (60+ V-*/UR-* 룰 ID), `56-action-state-matrix.md` (행동×상태 매트릭스), `56b-state-machine.md` (Mermaid stateDiagram). **현재 백그라운드 실행 중, ETA 60~120분.**
- **블로커**: native 에이전트 미등록 상태(general-purpose 임시 대행) — Sprint 7 Week 2 내 `.claude/agents/` 정식 등록 + Agent Model Policy 표 편입 필요. PM 액션 아이템 #12 로 등재.

### frontend-dev
- **어제**: 사전 작업으로 `docs/03-development/25-frontend-current-inventory.md` (현행 컴포넌트/store/hook 인벤토리) 작성 완료. **본 PM 이 사전 작업 인정.**
- **오늘**: game-analyst SSOT 도착 후 인벤토리와 룰 매핑 → 폐기/보존 분류표 작성. SSOT 도착 전까지 추가 코드 작성 금지.
- **블로커**: game-analyst SSOT 미수령.

### go-dev
- **어제**: PR #77 `BUG-UI-014` ConfirmTurn final validation + `ROLLBACK_FORCED` 브로드캐스트를 `ws_handler.go`에 구현하고 머지 완료.
- **오늘**: `ws_handler.go:1061` `processAIPlace`에서 `tableGroups[i] = service.TilePlacement{Tiles: g.Tiles}` — `ID` 필드 미할당으로 AI 그룹이 빈 ID로 테이블에 적재되는 버그 수정 PR 작성; 병행해 `engine/ValidateTurnConfirm` V-01~V-09 전 분기의 테스트 커버리지 audit(`docs/04-testing/87-server-rule-audit.md`) 수행.
- **블로커**: game-analyst의 룰 SSOT 미도착 시 V-04 `effectiveHasInitialMeld` 기준 모호 — 해당 문서 수신 전까지 현행 `ErrInitialMeldScore` 판정 기준으로 audit 진행하되, 매핑 결과에 `[PENDING-SSOT]` 태그 부착.

### designer
- **어제**: PR #73 UX-004 드롭존 색 토큰 + 카피 3종 머지 완료했으나, 사용자가 "왜 안 되는지" 즉시 인식 불가한 UX 구조 문제가 게임 포기로 이어졌음을 확인.
- **오늘**: `docs/02-design/57-game-rule-visual-language.md` 신설 — 게임룰 위반/허용을 즉시 인식 가능한 색/아이콘/메시지 시스템 설계 초안 작성하되, game-analyst의 룰 enumeration 수신 전까지 비주얼 구현 보류하고 구조·원칙·토큰만 확립.
- **블로커**: game-analyst의 룰 목록 미수신 — 어떤 룰을 시각화할지 모르는 상태에서 guard/toast 양산하면 "꼼수" 재현이므로, 룰 enumeration 받기 전 본격 비주얼 디자인 착수 불가.

### qa
- **어제**: Claude main 야간 1095 jest 테스트 머지 후 사용자 정상 배치 회귀 — 테스트가 게임룰 SSOT 미반영 사고 묵인.
- **오늘**: `dragEndReducer*.test.ts` 877건 game-analyst 룰 명세 매핑 → 미정합 전수 폐기 후보 분류 + `docs/04-testing/88-test-strategy-rebuild.md` 작성.
- **블로커**: game-analyst 룰 enumeration 미수령 — SSOT 명세 없으면 폐기/유지 판정 불가.

### security
- **어제**: Day 2 SEC-A/B/C 머지 후 Critical/High=0 유지, SEC-REV-002/008/009 3건 종결 확인.
- **오늘**: `docs/04-testing/89-state-corruption-security-impact.md` 작성 — 클라이언트 state 조작으로 CONFIRM_TURN 위조 가능성, ws_handler.go:1059 processAIPlace ID 누락 권한 우회 위험, WS 메시지 서버측 재검증 부재 3건 평가.
- **블로커**: game-analyst SSOT 룰셋 미수령 시 invalid commit 판정 기준이 흔들려 평가 결론 보류 가능.

---

## 2. Claude main 자기 부채 인정 (PM 이 회의록에 기록)

본 PM 은 Claude main 의 다음 부채를 **본 회의 결정사항으로 명문화**한다 (사용자 정당성 100%):

1. **자가 검증 부재** — 1095 jest 테스트 짰지만 reducer 추상 input/output 만 검증, 실제 사용자 시점 보드 시뮬레이션 0건. 브라우저 (또는 headless playwright) 통해 1턴이라도 자가 플레이 안 함.
2. **테스트 통과 = 동작 보장 자의적 단정** — 테스트 GREEN 이라도 사용자 실측에서 깨졌으면 "테스트가 잘못 짜진 것"인데, 매번 "사용자 테스트 권장" 으로 떠밀음.
3. **band-aid 양산** — source guard, invariant validator, handleConfirm 추가 게이트, 토스트 톤다운 등 5종. 게임룰 본질 분석 없이 증상 가리기.
4. **스크린샷 픽셀 오독 2회** — 등록 전/완료 (1차), 11K/11B 색 (2차). 매번 사용자가 정정.
5. **꼼수 명시 — 송출 시점 ID 부여** — "stateTableToWSGroups 에서 빈 ID 자동 부여" 같은 cosmetic fix. 사용자가 "꼼수 쓰지말라는 지침 없는거냐?" 즉시 잡아냄.

본 PM 이 강제하는 조치 (헌장적 효력):

- Claude main 게임 결정권 박탈 (이미 본 로그 §0-3 에 명시)
- 향후 모든 PR 의 commit message 에 game-analyst 룰 ID 매핑 **의무화**, 미매핑 시 본 PM 이 자동 거절
- 사용자 테스트 요청 금지 — self-play harness 없는 빌드 배포 금지

---

## 3. 논의 사항

### 3-1. SSOT 권한 분배 (PM 확정)

| 영역 | SSOT | 결정권 |
|------|------|--------|
| 루미큐브 게임룰 / 행동 매트릭스 / 상태 머신 | **game-analyst** | architect/Claude main 의견과 충돌 시 game-analyst 우선 |
| 시스템 통신 / 데이터 흐름 / 컴포넌트 분해 | architect | game-analyst 명세를 입력으로 받아 시스템 설계 |
| 서버 검증 로직 | game-analyst (룰) + go-dev (구현) | game-analyst 명세 → go-dev 검증 코드 |
| 시각/UX 약속 | designer | game-analyst 룰 받아 시각 언어 |
| 테스트 정책 | qa | game-analyst 매트릭스 기반 |
| 보안 영향 분석 | security | 독립 |
| **dispatcher / 산출물 전달** | **Claude main** | **결정권 없음** |
| **본 sprint 최종 의사결정** | **pm (본인)** | **모든 충돌 + 일정/우선순위/PR 머지 게이트** |

### 3-2. critical path 확인 (PM 결정)

7명 발언 일치: **game-analyst 의 SSOT 3종 (55, 56, 56b) 도착 전 후속 작업 착수 불가**.

본 PM 이 다음을 결정:
- game-analyst 가 본 sprint 의 단일 critical path
- 다른 7명 agent 는 **블록 상태** (game-analyst SSOT 도착 알림은 본 PM 이 직접 발신)
- 차단 조건 위반 시 (SSOT 미수령 상태에서 코드 작성) PR 머지 거절

### 3-3. PR 머지 정책 (본 sprint 즉시 발효, PM 강제)

본 PM 이 본 sprint 부터 다음 게이트를 직접 강제한다:

| # | 게이트 | 검증 방법 | 위반 시 |
|---|--------|----------|--------|
| G1 | commit message 에 game-analyst 룰 ID (V-* / UR-*) 매핑 | grep `^V-\|^UR-` in commit body | 자동 거절 |
| G2 | RED spec 선행 (test 또는 invariant 문서) | PR description 에 RED commit SHA 명시 | 자동 거절 |
| G3 | 묶음 PR 금지 (1 PR = 1 룰 ID 권장, 최대 3) | PR 변경 파일 수 + 룰 매핑 수 검증 | 분리 요구 |
| G4 | 머지 30분 내 재빌드 + 이미지 SHA 검증 | CI 로그 + image tag = HEAD SHA | 머지 무효 처리 |
| G5 | 사용자 테스트 요청 금지 (self-play harness 없는 빌드) | self-play harness 통과 로그 첨부 | 거절 |

### 3-4. 사용자 신뢰 회복 약속 (PM 합의 명문화)

- **사용자 테스터 노릇 안 함** — self-play harness 로 자체 검증 후에만 빌드 배포
- **band-aid 0** — 게임룰 위반은 룰 명세에서 정의, 우회 가드 금지
- **"꼼수" 0** — 매번 산출물에 "근거된 룰 ID" 명시
- **PR 머지 정책** — 본 sprint 의 모든 PR 은 game-analyst 명세에 매핑된 룰 ID 를 commit message 에 명시

---

## 4. 액션 아이템 (PM 직접 추적)

| # | 담당 | 할 일 | 기한 | 추적 |
|---|------|-------|------|------|
| 1 | **game-analyst** | `docs/02-design/55-game-rules-enumeration.md` (60+ V-*/UR-* 룰 ID) | 2026-04-25 18:00 | PM 직접 |
| 2 | **game-analyst** | `docs/02-design/56-action-state-matrix.md` (행동 × 상태 매트릭스) | 2026-04-25 18:00 | PM 직접 |
| 3 | **game-analyst** | `docs/02-design/56b-state-machine.md` (Mermaid stateDiagram + invariant) | 2026-04-25 21:00 | PM 직접 |
| 4 | architect | `docs/02-design/58-ui-component-decomposition.md` 스켈레톤 (게임룰 enum 도착 후 본격) | 2026-04-26 12:00 | PM |
| 5 | go-dev | `docs/04-testing/87-server-rule-audit.md` + AI placement ID 부여 fix PR | 2026-04-26 18:00 | PM |
| 6 | designer | `docs/02-design/57-game-rule-visual-language.md` (구조·원칙·토큰만) | 2026-04-26 18:00 | PM |
| 7 | qa | `docs/04-testing/88-test-strategy-rebuild.md` + 폐기 대상 테스트 목록 | 2026-04-26 18:00 | PM |
| 8 | security | `docs/04-testing/89-state-corruption-security-impact.md` | 2026-04-25 18:00 | PM |
| 9 | frontend-dev | `docs/03-development/25-frontend-current-inventory.md` 사전 작업 인정 + SSOT 도착 후 매핑표 추가 | 2026-04-26 12:00 | PM |
| 10 | **pm (본인)** | 본 스탠드업 로그 발행 + cadence plan + 다음 스탠드업 (2026-04-26 09:00) 예약 | 2026-04-25 13:00 | 자체 |
| 11 | Claude main | game-analyst SSOT 도착 전 일체 분석/설계/구현 결정 안 함, dispatcher 역할만 | 즉시 | PM |
| 12 | **pm (본인)** | game-analyst native 에이전트 정식 등록 + Agent Model Policy 표 편입 (Sprint 7 W2 내) | 2026-05-02 | PM |
| 13 | **pm (본인)** | PR 머지 정책 G1~G5 게이트 강제 시작 (본 sprint 즉시) | 즉시 | 자체 |

---

## 5. 다음 스탠드업

- **언제**: **2026-04-26 09:00 KST** (이후 매일 09:00 정례)
- **목표**: game-analyst SSOT 3종 발행 후 architect/frontend-dev/qa/designer/go-dev 의 후속 착수 확인
- **차단 조건**: game-analyst 항목 1~3 미완 → 후속 작업 착수 금지 (본 PM 이 차단 통보)
- **사용자 실측 사고 발생 시**: 즉시 임시 스탠드업 소집 (24시간 룰 적용)
- **회고 모드**: 본 sprint 동안 주 1회, **부주제 3 (놓친 회귀)** 고정 (헌장 §9.3)

상세 일정은 `work_logs/plans/2026-04-25-rebuild-standup-cadence.md` 참조.

---

## 6. 메모

### 사용자 발언 인용 (sprint 불변 원칙)
- "꼼수 쓰지말라는 지침 없는거냐?"
- "guard 만들어 놓은 것 모두 없애...게임룰에 의한 로직을 만들란 말이다."
- "소스 더럽게 짜지 말라고."
- "팀원 모두 달려들어 제대로 만들란 말이다."
- "지금은 클로드메인도 아키텍트도 못 믿겠다."
- "기본 테스트도 안하고 사용자 테스트 하라고 들이미는 클로드 부터 교체하고 싶다고."
- **"클로드 네가 PM 역할하지 말고, PM이 PM 역할하게 해라."** (본 PM 인수 근거)

### PM 본인 다짐
본 sprint 동안 본 PM 은 다음을 자기 자신에게 강제한다:
1. PR 머지 G1~G5 게이트 100% 강제. 1건이라도 빠지면 본 sprint 동안 PM 자격 박탈 (사용자 판단).
2. 매일 09:00 스탠드업 결석 0회.
3. 사용자 실측 사고 발생 시 24시간 내 임시 스탠드업 소집.
4. game-analyst SSOT 외 의사결정 시 반드시 회의록 + 근거 명시.

---

**서명**: pm (본인 명의), 2026-04-25 12:00 KST
**다음 액션**: 본 PM 이 game-analyst SSOT 도착 알림 수신 즉시 후속 7명 풀 dispatch 실행
**부록**: frontend-dev 발언 추가 (§1) — 사전 작업 인정 처리 완료
