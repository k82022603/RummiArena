# Day 3 스탠드업 액션 실행 계획

- **작성**: 2026-04-24 (KST, AM 스탠드업 직후)
- **근거**: `work_logs/scrums/2026-04-24-01.md` 11명 반성 → 12개 액션 아이템
- **원칙**: Sprint 7 Production 재편 "오류 0 까지 반복" + "이관 없음"
- **Week 2 마감**: 2026-05-02

## 0. 현재 상태 (기준점)

| 항목 | 상태 |
|------|------|
| Task #1 BUG-UI-009 멜드 9개 복제 렌더링 | ✅ 구현 완료, `feature/bug-ui-009-010-meld-dup-drag-stuck` 브랜치 3 커밋 (`4f5ba6d`/`71558b6`/`73bd7c6`), 재현 spec 6/6 GREEN, push 대기 |
| Task #2 BUG-UI-010 drag stuck | ✅ Task #1 동반 완료 |
| Task #3~#8 나머지 버그 6건 + UX-004 + REG-001 | ⏸ 대기 |

## 1. 실행 타임박스

### Phase 1 — 오전 남은 시간 (~12:00 KST)
**목표**: 독립 병렬 착수 가능한 액션 4종 동시 실행. 의존성 없음.

| 담당 | 작업 | 산출물 | 의존성 |
|------|------|--------|--------|
| **qa** | (a) `pre-deploy-playbook` 스킬을 배포 게이트에 편입하는 PR 초안 (b) BUG-UI-011/012/013 재현 spec 3종 **RED 확정** 선행 작성 | PR draft + `e2e/turn-sync.spec.ts`, `e2e/i18n-render.spec.ts`, `e2e/hand-count-sync.spec.ts` | 없음 |
| **designer** | UX-004 (a) 툴팁/토스트 카피 3개 (잠김/확정 후 가능/규칙 링크) (b) 드롭존 색 토큰 `--drop-allow: #27AE60` / `--drop-block: #C0392B` 정의 (c) 기권 모달 한글 카피 에디트 + i18n 리소스 ko.json diff | Figma 링크 + `src/frontend/src/styles/tokens.ts` diff + `src/frontend/src/locales/ko.json` diff | 없음 |
| **devops** | (a) smoke 정의 상향 — 기존 `/health 200 + helm list` → "1 게임 완주 + 재배치 4유형 + 한글 렌더 diff + drag stuck 0건" (b) rollback 임계치 문서 `docs/05-deployment/08-rollback-criteria.md` 신규 | 문서 2종 + helm/scripts 업데이트 diff | 없음 |
| **pm** | merge gate 정책 문서 `docs/01-planning/17-merge-gate-policy.md` + 스크럼 회고 모드 주 1회 고정 `docs/01-planning/02-project-charter.md §5` 갱신 | 문서 1+1 | 없음 |

**Phase 1 완료 기준**: 4개 산출물 각각 브랜치 커밋까지. 오전 회귀 smoke (Playwright 빠른 서브셋 `@smoke`) GREEN.

### Phase 2 — 오후 (~12:00~17:00 KST)
**목표**: UI 수정 3건 + 서버 검증 1건. UI 페어 코딩 의무.

| 담당 | 작업 | 재현 spec 근거 | 의존성 |
|------|------|---------------|-------|
| **frontend-dev + go-dev 페어** | **BUG-UI-012** 한글 메시지 깨짐 — (a) `ws/handler.go` `Content-Type: text/plain; charset=utf-8` 확인 + (b) frontend `ko.json` 리소스 grep "상업|골셀|차집합" 오타 수정 + (c) 기권 모달 template 변수 치환 점검 | Phase 1 qa 의 `e2e/i18n-render.spec.ts` | Phase 1 designer i18n diff |
| **frontend-dev** | **BUG-UI-013** 손패 카운트 요동 — `tiles.length` vs `tiles.filter(t => !t.pending).length` 구분 + 드로우 애니메이션 state 격리 | Phase 1 qa 의 `e2e/hand-count-sync.spec.ts` | 없음 |
| **frontend-dev** | **BUG-UI-011** 턴 동기화 — `isMyTurn = game.currentPlayerId === session.userId` SSOT 강제 + 버튼 `disabled={!isMyTurn}` 전수 점검 | Phase 1 qa 의 `e2e/turn-sync.spec.ts` | 없음 |
| **architect + designer + frontend-dev 3인 페어** | **UX-004** — `GameClient.tsx:855` early-return 직전에 `showToast({variant:'warning'})` 추가 + "확정" 버튼 pulse animation + 드롭존 색 토큰 적용 | `e2e/extend-lock-hint.spec.ts` (신규 Phase 2) | Phase 1 designer 토큰 |
| **go-dev + qa 페어** | **BUG-UI-014** invalid 1-tile meld 잔존 — `game_service.ConfirmTurn` final `validateAllMelds()` 호출 보강 + `ROLLBACK_FORCED` WS 이벤트 추가 | `src/game-server/internal/service/game_service_confirm_test.go` 신규 + `e2e/invalid-meld-cleanup.spec.ts` | 없음 |

**Phase 2 완료 기준**: 5개 브랜치 각각 Playwright + Go/Jest 회귀 GREEN. 각 PR 머지 전 **별도** smoke.

### Phase 3 — 저녁 (~17:00~19:00 KST)
**목표**: 통합 smoke + 사용자 합동 재플레이테스트 30분. "오류 0" 검증.

1. 모든 feature 브랜치를 `integration/day3-2026-04-24` 로 통합
2. dev 태그 `day3-2026-04-24-ui-triage` 배포 (devops)
3. qa 가 `pre-deploy-playbook` 스킬 실행 — Claude 가 사용자 역할로 게임 완주 검증
4. **사용자(애벌레) 합동 재플레이테스트 30분** — 새 스크린샷 세트 캡처 후 22:04~22:18 세트와 비교
5. 회귀 0건 → Day 4 prod 태그 `day4-2026-04-25` 승인 / 회귀 있으면 **Day 3.5 연장** 선언 (이관 금지 원칙 준수)

## 2. Week 2 (2026-04-25 ~ 2026-05-02) 장기 액션

| 담당 | 작업 | 기한 |
|------|------|------|
| **ai-engineer + designer** | 룰-UX 동기화 SSOT 초안 `docs/02-design/43-rule-ux-sync-ssot.md` — V-04/V-13a/V-13e 가 AI 프롬프트/서버 에러코드/프론트 안내문구/E2E 시나리오 4축에 어떻게 표현되는지 단일 표 | Day 5 (2026-04-26) |
| **node-dev** | UX 타이머 레지스트리 — `docs/02-design/41-timeout-chain-breakdown.md` 에 **§6 UX 체감 레이어** 추가 (25s/55s UI 타이머 ↔ backend 700s 매핑) | Day 5 |
| **security + go-dev + qa** | WS 프레임 조작 보안 테스트 케이스 (세션 소유자·현재 턴·규칙 재검증) — `src/game-server/internal/security/ws_auth_test.go` 신규 | Week 2 |
| **architect** | 구조 부채 누적 카운터 PR 리뷰 체크리스트 — 동일 함수 3회 핫픽스 쌓이면 리팩터 ADR 강제 정책 | Week 2 |
| **frontend-dev** | `handleDragEnd` 484줄 → 조커/재배치/일반 3개 독립 핸들러 분리 | 금주 (architect 와 페어) |
| **claude (메인)** | (a) MEMORY.md 249줄 → 토픽별 파일 분해, index 150자/줄 규칙 엄격 적용 (b) Agent 프롬프트 템플릿 3종 (`standup-reflection`, `bug-triage`, `pair-review`) `.claude/skills/` 하부 추가 | 금주 |

## 3. 회귀 방지 게이트 (이번 Sprint 7 Week 2 부터 적용)

Phase 1 devops + pm + qa 산출물을 기반으로 **머지 전 필수 체크리스트**:

- [ ] `pre-deploy-playbook` 스킬 실행 증거 PR 첨부
- [ ] 재현 spec `RED → GREEN` 커밋 히스토리 (spec 을 구현 전에 먼저 커밋)
- [ ] `handleDragEnd` / 동일 파일 3회 이상 핫픽스 누적 시 리팩터 ADR 링크
- [ ] UI 수정은 architect + frontend-dev + designer 페어 증거 (PR 코멘트 3인 승인)
- [ ] 한글 i18n 변경 시 designer 카피 에디트 승인

## 4. 실행 순서 (오늘 당장)

### 즉시 (사용자 승인 후)
1. Task #1 `feature/bug-ui-009-010-meld-dup-drag-stuck` push + PR 생성 — Day 2 묶음 PR 교훈으로 BUG 당 분리 원칙 고수하되, 근본 원인이 공통이므로 009+010 은 한 PR 허용
2. Phase 1 병렬 착수 — qa/designer/devops/pm 에이전트 4명 동시 호출

### 그 다음 (Phase 1 Gate 통과 후)
3. Phase 2 병렬 — frontend-dev/go-dev/architect 페어 동시 호출
4. Phase 3 통합 + 사용자 합동 테스트

## 5. 다음 단계 (사용자에게 확인 요청 사항)

현재 즉시 결정 필요:
- **A**: Task #1 을 지금 push + PR 생성 후 Phase 1 병렬 착수?
- **B**: Task #1 을 완성도 쌓고 Day 3 저녁 통합 PR 한 번에 push?
- **C**: Phase 1 순서 조정 필요?

**기본 권장**: A — push + PR 먼저 하고 Phase 1 병렬. 이유: (1) Day 2 묶음 PR 교훈으로 버그별 분리 머지가 회귀 추적에 유리, (2) 사용자가 PR 리뷰 진행 동안 Phase 1 팀이 독립 작업 가능, (3) 오후 Phase 2 착수 시 Task #1 가 이미 main 에 반영돼 기반 제공.

---
**참조**: `work_logs/scrums/2026-04-24-01.md` (스탠드업 원문) / `work_logs/plans/2026-04-24-sprint7-ui-bug-triage-plan.md` (Day 3 트리아지 원플랜) / `work_logs/plans/tmp-analysis/bug-ui-009-architect-review.md` (architect 532줄)
