# Sprint 7 — UI 버그 긴급 트리아지 계획

- **작성일**: 2026-04-24 (KST)
- **세션 범위**: 2026-04-23 22:04~22:18 플레이테스트 16장 스크린샷 + game-server/ai-adapter 로그 교차 분석
- **계획 수립**: Claude Opus 4.7 (메인) + Explore 에이전트 4명 병렬
- **원문 사용자 진술**: "고쳐진 것이 하나도 없는 듯. AI는 이어붙이기가 되는데 나는 안된다. 다른 오류들도 수두룩."

---

## 1. Context — 왜 이 작업을 지금 하는가

2026-04-23 Day 2 에 5 PR (#53~#57) 머지 후 `day2-2026-04-23` 태그로 K8s 재배포, smoke PASS 판정. 그러나 **실사용자 플레이테스트에서 가드레일 무관한 UX 파괴가 다수 재현**됨. Day 3 는 원래 문서/인프라 17 SP 소화 예정이었으나, 사용자 진술 "고쳐진 게 하나도 없는 듯" 은 Sprint 7 "프로그램은 오류 0 까지 반복" 원칙(2026-04-23 Production 재편)에 정면 위배. 따라서 Day 3 계획을 **UI 긴급 패치 우선**으로 재편한다.

핵심 발견은 두 갈래다:
1. **사용자의 1순위 불만 "이어붙이기"는 실제로 의도적 차단**. `src/frontend/src/app/game/[roomId]/GameClient.tsx:855` (fb85d53 FINDING-01 롤백) + `src/game-server/internal/engine/validator.go:121-132` V-13a(`ErrNoRearrangePerm`) 가 `hasInitialMeld=false` 상태에서 기존 서버 확정 멜드로 drop 시 새 pending 그룹을 강제. AI 는 첫 턴 자동 ConfirmTurn 후 `hasInitialMeld=true` 상태라 extend 가 가능하므로 사용자 눈에는 "AI만 특혜" 로 보임. → **진짜 버그는 아니지만 UX 설명 부재가 치명적.**
2. **스크린샷에서 발견된 진짜 버그 6종** — 9개 멜드 복제 렌더링, drag stuck, 턴 동기화, 한글 인코딩, 손패 카운트 불일치, invalid 1-tile meld 잔존.

두 갈래를 동시에 처리해야 사용자 체감 "오류 0" 에 도달한다.

---

## 2. 스크린샷 타임라인 재구성 (16장, 15분)

| 시각(KST) | 파일 | 요약 |
|-----------|------|------|
| 22:04:03 | `2026-04-23_220403.png` | AI 턴 종료 직후. 보드에 Y10(혹은 R10) 1-tile "멜드4" 잔존. 경고 문구 깨짐. |
| 22:04:18 | `2026-04-23_220418.png` | "1_경고" 배지 노출, 손패 16→19 카운트 요동. |
| 22:06:02 | `2026-04-23_220602.png` | R10 1-tile 그대로. "조기/성급이 다른 타일..." 반복. |
| 22:06:24 | `2026-04-23_220624.png` | B11 을 R11-R12-JK Run 위로 드래그 — dash border highlight 표시 (색상 불일치 검증 부재). |
| 22:07:33 | `2026-04-23_220733.png` | 손패 표시 21장 vs 실제 렌더 불일치, 타이머 5s. |
| 22:08:50 | `2026-04-23_220850.png` | 정상 구간. 4개 멜드 [R11,R12,JK] / [B7,B8,B9] / [B9~B12] / [7그룹]. |
| 22:11:02 | `2026-04-23_221102.png` | 내 턴 전환, 9장 손패 보임. |
| 22:12:08 | `2026-04-23_221208.png` | **6초 경과 화면 동결** — 드래그 시도 후 리스폰스 없음. |
| 22:12:37 | `2026-04-23_221237.png` | **그룹 멜드(7 triplet) 소실 + AI 턴인데 플레이어 버튼 활성**. |
| 22:14:58 | `2026-04-23_221458.png` | 보드 뷰포트 잘림 (스크롤/레이아웃). |
| 22:15:04 | `2026-04-23_221504.png` | 재정상화, 6개 멜드 정상. |
| 22:15:43 | `2026-04-23_221543.png` | **동일 [R11,R12,JK,5] 멜드 9개 복제 렌더링**. "제출하기" 버튼 활성. |
| 22:15:54 | `2026-04-23_221554.png` | 동일 버그 지속, B5 손패에서 떠있는 상태. |
| 22:16:03 | `2026-04-23_221603.png` | 복제 멜드 6개로 감소 (불안정). |
| 22:17:07 | `2026-04-23_221707.png` | AI 턴 진행으로 복구됨. 멜드5 [R5,R6,R7,R8] 이어붙여짐. |
| 22:18:59 | `2026-04-23_221859.png` | **기권 종료 모달** — "rookie (GPT-4o) 승리" / "상업 골셀하며 자동로 차집합 중단되었습니다" 깨진 문구. |

---

## 3. 발견된 버그 분류

### 3.1 진짜 버그 (P0 — 내일까지)

| ID | 증상 | 1차 의심 위치 | 우선순위 |
|----|------|-------------|---------|
| **BUG-UI-009** | 드래그 중 동일 구조 멜드 9개 복제 렌더링 (22:15:43) | `GameClient.tsx` handleDragOver / pending groups state push 중복 or MeldRenderer key 충돌 | 🔴 P0 |
| **BUG-UI-010** | 드래그 취소 후 타일이 "손패 위에 떠있는" 동결 | `dnd-kit onDragCancel/onDragEnd` activeId reset 경로 누락 | 🔴 P0 |
| **BUG-UI-011** | AI 턴 진행 중 플레이어 버튼(제출/되돌리기/새그룹) 활성화 (22:12:37) | `isMyTurn` / `currentPlayerId` useMemo 재계산 타이밍, WS `TURN_CHANGED` 이벤트 → 버튼 disabled 동기화 | 🔴 P0 |
| **BUG-UI-012** | 기권 종료 모달 한글 깨짐 "상업 골셀하며 자동로 차집합" + 경고 배너 "조기/성급이 다른 타일" | (a) i18n 리소스 오타 (b) WS 프레임 UTF-8 → Latin-1 오해석 (c) 서버 문자열 template 변수 치환 실패 — 세 경로 모두 점검 | 🟠 P0 |
| **BUG-UI-013** | 손패 표시 카운트 16→19→18→21 요동, 실제 렌더 타일 수와 불일치 | tiles 배열 + draw pending 병합 시 중복 count, 또는 `length` 계산 시 filter 누락 | 🟠 P0 |
| **BUG-UI-014** | Invalid 1-tile group 멜드(R10 혹은 Y10)가 AI 턴 종료 후에도 보드에 5장 스크린샷 동안 잔존 | `game_service.ConfirmTurn` 최종 상태 `validateAllMelds` 호출 누락 or 서버가 rollback 을 잘못 반영 | 🟠 P1 |

### 3.2 UX 갭 (P0 — 내일까지)

| ID | 증상 | 의도된 설계 | 조치 |
|----|------|------------|------|
| **UX-004** | "AI는 extend 되는데 나는 안 됨" 사용자 오해 | V-13a `ErrNoRearrangePerm` + fb85d53 FINDING-01 롤백 의도적 차단 (초기 등록 30점 미완료 상태 보호) | 인라인 토스트 "초기 등록 확정 후 이어붙이기 가능" + "확정" 버튼 펄스 강조 + 드롭존 색상 구분 (회색=잠김, 초록=허용) |

### 3.3 2차 관찰 (P1~P2, Day 3 이후 별도 티켓)

- 색상 불일치 extend 드롭존 highlight (22:06:24 B11→Red Run) — 프론트 validation 에서 색/숫자 compatibility 사전 필터 필요
- 화면 스크롤로 보드 잘림 (22:14:58) — 반응형 레이아웃 점검
- 6초간 화면 동결(22:12:08) — WS 재연결 인디케이터 부재

---

## 4. 근본 원인 가설 매핑

```
사용자 "고쳐진 것이 하나도 없는 듯"
  ├── "AI extend vs 인간 차단" (1순위 불만)
  │      └─> 실제: 의도적 차단 (V-13a + FINDING-01)
  │          → UX-004 안내 추가로 해결
  │
  └── "다른 오류 수두룩" (2순위)
         ├─> BUG-UI-009 복제 렌더링 (드래그 시뮬레이션 state 중복)
         ├─> BUG-UI-010 drag stuck (dnd-kit 리셋 누락)
         ├─> BUG-UI-011 턴 desync (isMyTurn 재계산 레이스)
         ├─> BUG-UI-012 한글 깨짐 (인코딩 or 리소스 오타)
         ├─> BUG-UI-013 손패 카운트 (tiles 배열 중복 병합)
         └─> BUG-UI-014 invalid meld 잔존 (서버 final validation 누락)
```

---

## 5. 중점 조사·수정 파일 (코드 수정 대상 후보)

### Frontend — `src/frontend/src/app/game/[roomId]/`
- `GameClient.tsx:813~1140` — handleDragEnd 전체 경로, 특히 **pending group 생성 분기** (855~880)
- `GameClient.tsx:818,875,902,934,988,1025,1063,1101` — v-13e `removeRecoveredJoker` 호출 8곳 (조커 관련 잔존 문제 혹시 있는지 확인)
- `components/PracticeBoard*.tsx` / `components/GameBoard*.tsx` — 멜드 렌더 key, MeldRenderer 재사용성
- `hooks/useRearrange*.ts` — pending state 관리
- `locales/ko.json` 또는 `i18n/` — "상대방 기권" 문자열 원본

### Backend — `src/game-server/internal/`
- `engine/validator.go:121~132` — V-13a `validateInitialMeld` (의도대로 동작 중, 수정 아닌 **문서/UI 연결** 필요)
- `service/game_service.go:321` 부근 — `ConfirmTurn` 최종 `validateAllMelds()` 호출 여부 (BUG-UI-014)
- `ws/handler.go` — `TURN_CHANGED` / `BOARD_UPDATED` 이벤트 payload 한글 필드 UTF-8 인코딩 (BUG-UI-012)

### Docs
- `docs/04-testing/73-finding-01-root-cause-analysis.md` — UX-004 연결
- `docs/02-design/31-game-rule-traceability.md` V-13a 행에 "UX 힌트 필요" 주석

---

## 6. 실행 계획 — Day 3 (2026-04-24) 재편

기존 Day 3 계획(17 SP 문서/인프라)에 **UI 트리아지 13 SP 추가**. 원래 계획은 Day 4 로 슬라이드.

### 6.1 AM 블록 (오전, 6h)
- [ ] **아키텍처 정렬 회의 (30min)** — architect + frontend-dev + qa + pm. BUG-UI-009/010/011 동시 수정 순서 확정, Fix 당 별도 PR 분리 여부 합의
- [ ] **BUG-UI-009 재현 + 수정** — frontend-dev + architect 페어 (UI 페어 코딩 의무, Production 재편 원칙)
  - 1) Playwright `meld-dup-render.spec.ts` 로 재현 시나리오 작성 (실패하는 상태로)
  - 2) `GameClient.tsx` handleDragOver 내 pending group push 로직에 `Set`/`Map` 기반 dedup
  - 3) MeldRenderer `key={group.id}` 대신 `key={group.id + '#' + idx}` 충돌 검증
  - 4) 로컬 재현 → dev 배포 → Playwright GREEN
- [ ] **BUG-UI-010 수정** — frontend-dev 단독. `onDragCancel` + `onDragEnd` 공통 cleanup 함수로 추출
- [ ] **BUG-UI-011 수정** — frontend-dev. `isMyTurn = game.currentPlayerId === session.userId` 단일 source of truth 강제, 버튼 `disabled={!isMyTurn}` 전수 점검

### 6.2 PM 블록 (오후, 6h)
- [ ] **BUG-UI-012 수정** — frontend-dev + go-dev
  - (a) 서버 WS 프레임 `Content-Type: text/plain; charset=utf-8` 명시 확인 (`ws/handler.go`)
  - (b) frontend i18n 리소스 파일 grep "상업|골셀|차집합" — 오타 수정
  - (c) 템플릿 변수 치환 실패면 "{winner} 승리" 표현 리팩터
- [ ] **BUG-UI-013 수정** — frontend-dev. `tiles.length` vs `tiles.filter(t => !t.pending).length` 구분 + 드로우 애니메이션 state 격리
- [ ] **BUG-UI-014 조사** — go-dev + qa. Ephemeral reproduction → 서버 `ConfirmTurn` 후 `validateAllMelds` 강제 호출 + invalid 시 `ROLLBACK_FORCED` WS 이벤트 추가
- [ ] **UX-004 구현** — architect + designer + frontend-dev 3인 페어 (UI 변경 페어 코딩 의무)
  - 1) Figma/ASCII 목업 — "잠김" vs "허용" 드롭존 색 토큰 정의
  - 2) `GameClient.tsx:855` early-return 직전에 `showToast({variant:'warning', message:'초기 등록(30점) 확정 후 기존 멜드에 이어붙일 수 있어요'})`
  - 3) "확정" 버튼에 pulse animation + tooltip 추가
  - 4) `docs/04-testing/73-finding-01-root-cause-analysis.md` 마지막에 UX-004 해결 기록

### 6.3 마감 블록 (저녁, 2h)
- [ ] **REG-001 Playwright 회귀 스펙 7종 커밋** — qa
- [ ] **통합 smoke + 실환경 플레이테스트** — 애벌레 + Claude 합동 20분, 새 스크린샷 세트 비교
- [ ] **데일리 마감 + scrum-log + vibe-log** — 사용자 요청 시에만 TaskCreate

### 6.4 슬라이드된 기존 Day 3 항목 (→ Day 4 2026-04-25 로 이동)
- **A** CI/CD 감사 잡 3건, **C** dev-only deps + jest 30, **I** PostgreSQL 001 staging dry-run, **G** Istio DR 세밀 조정, **J** Playwright 전수 회귀 + 보고서 81, **P2_ADR** next-auth v5 이주 ADR
  - 원칙: "프로그램은 오류 0 까지 반복" — UI 패치가 먼저, 인프라는 그 다음

---

## 7. 검증 계획 (End-to-end)

### 7.1 자동
- `cd src/frontend && npx playwright test` — 기존 390개 + 신규 7개 = 397개 GREEN 목표
- `cd src/game-server && go test ./...` — 689개 유지 + BUG-UI-014 관련 engine 테스트 추가
- `cd src/ai-adapter && pnpm test` — 428개 유지

### 7.2 실사용자 재현 시나리오
1. 새 방 생성 → AI 1명(rookie GPT-4o) + 인간 1명
2. 초기 손패 확인 후 **의도적으로 extend 먼저 시도** → UX-004 토스트 떠야 함
3. 30점 초기 등록 → "확정" → 기존 멜드에 extend drag → 성공해야 함
4. 드래그 중 ESC 또는 보드 밖 드롭 → 타일 손패 복귀, activeId 해제 (BUG-UI-010)
5. AI 턴 시작 → 버튼 전부 disabled (BUG-UI-011)
6. 기권 → 종료 모달 한글 정상 출력 (BUG-UI-012)
7. 30분 이상 게임 끝까지 플레이 → 새 스크린샷 세트 캡처 → 비교

### 7.3 배포 게이트
- Day 3 저녁: dev 태그 `day3-2026-04-24-ui-triage`
- 사용자 실측 GREEN → Day 4 오전 prod 태그 `day4-2026-04-25`
- 실측에서 regression 발견 시 Day 4 를 Day 3.5 연장으로 재편 (원칙 준수)

---

## 8. 리스크·주의

- **번아웃 리스크 주시** — Day 2 소화율 이례적, Day 3 도 UI 13 SP + 기존 17 SP 일부 연장. 물리적 여력 없으면 오후 블록 축소 + Day 4 로 이월 허용 (단 이월 표현 금지 → "Day 3.5 연장" 으로 표기)
- **UI 페어 코딩 의무** — architect 리뷰 증거 PR 코멘트 필수 (Sprint 7 재편 원칙)
- **커밋 정책** — 각 BUG ID 별 PR 분리. 묶음 PR 금지 (Day 2 교훈: 묶음 PR 회귀 추적 어려움)
- **메모리 갱신** — BUG-UI-009~014 패턴이 재발성이면 `work_logs/memory/` 에 "드래그 검증 공통 회귀 패턴" 정리

---

## 9. 파일 참조 인덱스 (수정 대상 확정 후보)

```
src/frontend/src/app/game/[roomId]/GameClient.tsx          — 메인 (L813-1140 drag, L855 pending 분기)
src/frontend/src/components/PracticeBoard*.tsx             — 멜드 렌더 key
src/frontend/src/components/MeldRenderer*.tsx              — 중복 렌더 원점 후보
src/frontend/src/hooks/useRearrange*.ts                    — pending state
src/frontend/src/locales/ko.json                           — 한글 리소스
src/frontend/e2e/drag-extend-block.spec.ts                 — 신규
src/frontend/e2e/turn-sync.spec.ts                         — 신규
src/frontend/e2e/meld-dup-render.spec.ts                   — 신규
src/game-server/internal/engine/validator.go:121-132       — V-13a (수정 아님, 문서화)
src/game-server/internal/service/game_service.go:~321      — ConfirmTurn final validation
src/game-server/internal/ws/handler.go                     — UTF-8 charset
docs/04-testing/73-finding-01-root-cause-analysis.md       — UX-004 연결
docs/02-design/31-game-rule-traceability.md                — V-13a 주석
```

---

**작성자**: Claude Opus 4.7 (xhigh) — 메인 세션이 코디, Explore 에이전트 4명이 분석 담당 (사용자 요청 준수).
**승인 대기**: 사용자(애벌레). 이 계획을 Day 3 실행 계획으로 확정하면 ExitPlanMode 후 6.1 AM 블록부터 착수.
