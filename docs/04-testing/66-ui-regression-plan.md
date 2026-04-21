# 66. UI Regression Test 운영 계획

- **작성일**: 2026-04-21 (Day 11)
- **작성자**: Claude Code 메인 세션
- **계기**: Sprint 6 Day 11 UI 수정 13건 이후 사용자 실측에서 "게임 진행 불가" 발견. 기존 테스트 (Jest 97 + Playwright 390) 가 이 regression 을 못 잡음 → **운영 계획 부재**가 구조적 원인으로 드러남
- **상태**: Sprint 6 마감 전 초안, Sprint 7 에 CI 통합 예정

## 1. 목적

- UI 계층의 회귀 버그를 **상위 계층(Playwright E2E)에 도달하기 전**에 차단
- 사용자 실측으로만 발견되는 버그를 **자동화 계층으로 이관**
- 기존 테스트가 못 잡는 **WS 이벤트 ↔ UI 상태 계약** 공백 해소
- 회귀 테스트의 **트리거·게이트·실패 대응**을 표준화

비목표:
- backend 계층 (game-server, ai-adapter) 의 regression — 별도 계획
- 비기능적 검증 (성능, 보안) — Sprint 7+

## 2. 테스트 계층 정의

```
┌──────────────────────────────────────────┐
│  E2E (Playwright)                          │  실제 브라우저, DnD, WS
│  - 핵심 사용자 플로우                       │  목표: 100개
│  - 드래그 좌표·dnd-kit collision detection │
└──────────────────────────────────────────┘
      ┌────────────────────────────────────────┐
      │  Integration (Jest + @testing-library)   │  컴포넌트 + 스토어 + 이벤트
      │  - handleDragEnd 분기 단위 단언          │  목표: 50개
      │  - gameStore 다중 selector 상호작용       │  (신규 카테고리)
      └────────────────────────────────────────┘
┌──────────────────────────────────────────────┐
│  Unit (Jest)                                   │  순수 함수 · selector · 분기 컴포넌트
│  - player-display, turn-action-label, tileState │  목표: 150+
│  - mergeCompatibility, validatePendingBlock    │  (현재 97, 확장 필요)
└──────────────────────────────────────────────┘
```

### 각 계층이 잡는 회귀 유형

| 계층 | 대표 회귀 예 (오늘 실측 기반) |
|------|------------------------------|
| Unit | `else → "고수"` fallback, `getPlayerDisplayName` 빈 괄호, `selectMyTileCount` pendingMyTiles drift |
| Integration | `handleDragEnd` 의 `line 788 서버 그룹 merge` 에 호환성 필터 없음, `resetPending` 여러 WS 이벤트 경로 race |
| E2E | `closestCenter` 가 빈 공간 드롭을 인접 그룹으로 매핑, K11(JK)-K12-K13 런 자동 감지 실패 |

## 3. 트리거 매트릭스

| 시점 | 범위 | 성공 기준 | 예상 시간 |
|------|------|-----------|-----------|
| **Pre-commit (local)** | 변경 파일 + 직접 import 하는 파일의 Jest | 100% PASS | ≤ 10s |
| **Pre-push (local)** | Jest 전체 | 100% PASS | ≤ 90s |
| **PR 생성 시 (CI)** | Jest 전체 + Playwright 영향 범위 (`--grep`) | Jest 100% + Playwright ≥ 98% | ≤ 10m |
| **PR Merge 직전 (CI)** | Jest 전체 + Playwright 전체 | 위 기준 | ≤ 20m |
| **배포 전 (CI)** | 위 + 수동 smoke (Pod 재배포 후 로그인 + 게임 진입) | 모두 GREEN | ≤ 30m |
| **정기 (주 1회, 목요일)** | 위 + flaky 재검증 + 커버리지 리포트 | 커버리지 유지 | ≤ 45m |

## 4. 품질 게이트

### 4.1 Jest (절대 규칙)

- **100% PASS 필수** (flaky 허용 X)
- 실패 테스트 = 즉시 수정. 덮어쓰기·skip·주석 처리 금지
- 신규 기능 추가 시 단위 테스트 동반 (happy + edge 최소 각 1)

### 4.2 Playwright (상대 기준)

- PASS rate ≥ 98% 권장, ≥ 95% 최소선
- Flaky 2회 재시도 후에도 실패하면 **real failure** 간주
- 오늘 `T7-02 R1a 픽스처 버그`, `lobby-and-room 타임아웃 프리셋 스테일 3건` 같은 **테스트 자체 결함**은 별도 `test/fix` 브랜치로 즉시 수정

### 4.3 Coverage (지표)

- `src/lib/` 100% (순수 함수)
- `src/store/` 80%+ (상태 관리)
- `src/components/game/` 70%+ (UI)
- 전체 65%+ (현재 추정)

## 5. 실패 대응 워크플로우

```
Jest 실패 → Pre-commit 차단
        → 개발자가 수정
        → 수정 후 재커밋

Playwright real failure → PR 차단
        → 개발자 + QA 협의
        → 원인 분류: (a) 프로덕션 버그 / (b) 테스트 결함 / (c) flaky
        → (a) 프로덕션: 즉시 수정 또는 revert
        → (b) 테스트: test/fix 브랜치에서 수정
        → (c) flaky: playwright.config retry=2 + 이슈 등록

Smoke 실패 (배포 후) → Pod rollback
        → incident-response SKILL 발동
        → 포스트모템
```

## 6. 회귀 매트릭스 유지

### 6.1 매트릭스 문서 (SSOT)

- `docs/04-testing/65-day11-ui-scenario-matrix.md` (qa 작성, 20+개 시나리오)
- 분기 변경 시마다 갱신 (Sprint 7 매주 금요일 15분)
- `docs/02-design/31-game-rule-traceability.md` 와 상호 참조

### 6.2 시나리오 추가 트리거

다음 경우 **반드시 시나리오 추가**:
1. 사용자 실측에서 P0/P1 버그 발견 — 수정 커밋과 동시에 테스트 추가
2. 신규 게임 규칙 (V-16 이상) 도입
3. WS 이벤트 신규 타입 추가

### 6.3 오래된 시나리오 폐기

- 분기별 리뷰 시 3개월 이상 실패 이력 없음 + 동일 경로 다른 시나리오로 커버됨 → 제거 검토
- 폐기 시 `git log` 에 이유 명시

## 7. CI 통합 (Sprint 7)

### 7.1 단계별 게이트

- GitLab CI `test-frontend-unit` stage — Jest (현재 없음, 신설)
- GitLab CI `test-frontend-e2e` stage — Playwright (기존)
- SonarQube 커버리지 업로드 (frontend 신규)

### 7.2 병렬화

- Playwright sharding (n=4) 로 시간 단축
- 실패 screenshot/trace 자동 아티팩트 업로드

## 8. 오늘 세션 교훈 반영

### 8.1 왜 기존 1528개 테스트가 오늘 버그를 못 잡았나

- **서버 단독 + 클라이언트 단독** 은 많았지만 **계약 테스트 부재**
- 드래그 좌표 기반 E2E 시나리오 부재 (대부분 static assertion)
- 사용자 실측 시나리오 카탈로그 부재 (이제 `65-*.md` 로 해결)

### 8.2 즉시 반영 항목

1. **qa 가 현재 작성 중인 20개 시나리오** 를 계약 테스트로 정착
2. **Integration 계층 신설** — `handleDragEnd` 단위 단언
3. **실측 이미지 보관 정책** — `src/frontend/test-results/` 에 버그 재현 스크린샷 유지 (이미 커밋 대상, CLAUDE.md 규정)

## 9. 역할 분담

| 역할 | 담당 |
|------|------|
| 계획 유지 (본 문서) | frontend-dev 리더 + qa |
| 매트릭스 유지 (§65) | qa |
| Unit 작성 | frontend-dev |
| Integration 작성 | frontend-dev + qa 페어 |
| E2E 작성 | qa |
| CI 통합 | devops |
| 회귀 감사 (분기) | architect + qa |

## 10. 관련 SKILL 연동

- `.claude/skills/ui-regression/SKILL.md` — 본 계획의 실행 자동화
- `.claude/skills/code-modification/SKILL.md` — 코드 수정 시 Phase 4 검증에 본 계획 인용
- `.claude/skills/code-fix/SKILL.md` — 수정 완료 후 regression 실행

## 12. UI 영역의 고유 복잡도 (필독)

본 프로젝트에서 **UI 는 가장 어려운 계층**이다. backend 영역(AI 대전·프롬프트 튜닝·v6 shaper 등)은 스크립트 기반 재현이 가능하고 실측도 정형화돼 있지만, UI 는 질적으로 다른 복잡도를 갖는다. 회귀 테스트 설계 시 이를 반드시 반영한다.

### 12.1 자동화하기 어려운 것들

| 영역 | 어려움 | 대응 |
|------|--------|------|
| **dnd-kit 충돌 검출** | `closestCenter` vs `pointerWithin` vs `rectIntersection` 선택에 따라 drop target 이 달라짐. 테스트에서 드래그 좌표를 정확히 재현하기 위해 실제 브라우저(Playwright) + DOMRect 측정 필요 | E2E 에서 `locator.dragTo` + `boundingBox` 기반 좌표 단언. Unit 으로 불가 |
| **WS 이벤트 race** | TURN_START / TURN_END / INVALID_MOVE / GAME_OVER 가 사용자 액션과 비동기로 도착. pending 상태가 순서에 따라 다르게 해소됨 | Integration 계층에서 WS mock 으로 이벤트 순서 permutation 테스트 |
| **드래그·드롭 시 layout shift** | 타일 크기 변경·랙 overflow·사이드 패널 토글 등으로 dnd-kit rectangle cache 가 stale. 오늘 오전 Tile +24% 확대가 잠재 원인으로 지목됨 | E2E 에서 뷰포트 1920×1080 / 1366×768 양쪽 실측 + `measuring.droppable.frequency="always"` 설정 고려 |
| **사용자 실측 의존** | 드롭 실패·애니메이션 끊김·쌍방향 동기화 지연은 개발자 로컬에서 재현 안 되는 경우 많음 | 실측 스크린샷 아카이브(`src/frontend/test-results/`) + 사용자 피드백 → 시나리오 즉시 등록 (§6.2) |
| **게임 규칙 ↔ UI 연쇄** | 런/그룹 판정, 조커 대체 값, 최초 등록 30점, 재배치 합병 — 4개 이상 로직이 한 드롭 이벤트에 얽힘 | `docs/02-design/31-game-rule-traceability.md` 를 **의무 참조 대상**으로. 수정 전 행렬 확인 필수 |

### 12.2 구체적 함정 사례 (오늘 세션)

- **F-2 `abcec27`**: "pending 그룹 직접 드롭 시 호환성 체크" 한 줄 추가. 프롬프트 명세 부족으로 "빈 공간 드롭·1장짜리 미확정 블록·런 확장" 엣지 케이스 누락 → 회귀
- **G-3 `60df5ca`**: `filter` → `removeFirstOccurrence` 치환. 로직 자체는 정확했으나 **다른 경로 (서버 확정 그룹 merge) 에는 동일 수정 미적용** → 불완전 수정
- **`closestCenter` 가 빈 공간을 인접 그룹으로 매핑** (architect 진단): 원래부터 있던 미해결 아키텍처 이슈. 타일 크기 +24% 확대로 체감 빈도 급증
- **"그룹 (미확정)"·"런 (미확정)" 라벨이 1장짜리 블록에도 붙음**: `classifySetType` 이 타입 단정. 사용자가 "규칙 위반인가" 혼란

### 12.3 UI 회귀를 놓치지 않는 3원칙

1. **사용자 실측이 최종 진실**: 자동화 테스트 다 GREEN 이어도, 사용자가 "게임 못 하겠다" 하면 우리가 놓친 것. 실측 이미지·시나리오를 카탈로그화 (§6)
2. **반사실적 검증 의무**: UI 수정 프롬프트에 "이 변경이 영향 줄 수 있는 다른 경로 3개를 먼저 나열" 강제. 오늘 F-2 가 이 단계를 건너뛰어 발생
3. **계층 분리 검증**: 같은 규칙이 `mergeCompatibility.ts`, `GameClient.handleDragEnd`, `GameBoard.validatePendingBlock`, 서버 엔진 4곳에 분산 구현됨. 한 곳 수정 시 나머지 3곳 영향 체크 — `docs/02-design/31` 매트릭스로 강제

### 12.4 Sprint 7 선행 과제

- 클라이언트 규칙 검증을 `src/frontend/src/lib/clientRuleValidator.ts` 단일 모듈로 통합 (architect §4.3 권고)
- `closestCenter` → 게임보드 특화 custom collision detection (architect §4.2)
- 실측 스크린샷 자동 업로드 파이프라인 (Sentry 또는 자체 WS telemetry, architect §4.7)

## 11. 변경 이력

- **2026-04-21 v1.0**: 최초 작성. Day 11 실측 후속 대응.
- **2026-04-21 v1.1**: §12 "UI 영역의 고유 복잡도" 추가 (사용자 피드백 반영 — "이번 프로젝트 제일 힘든 영역은 UI").
