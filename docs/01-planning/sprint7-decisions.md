# Sprint 7 결정·백로그 (Production 기준 재작성)

- **Sprint**: 7 (2026-04-22 ~ )
- **Owner**: 애벌레 (PM/Dev)
- **상태**: 진행 중 (Sprint 7 Week 1 Day 2 마감 / Day 13)
- **Scope 재정의일**: 2026-04-23 (Day 2 마감 후, 사용자 지시 반영)
- **비고**: 정식 Sprint 7 백로그 문서(`22-sprint7-...md`)가 확정되기 전까지 본 파일이 임시 인덱스로 동작한다. 공식화 시 본 파일의 항목을 흡수하고 redirect 주석을 남긴다.
- **재작성 이력 (3회)**:
  1. 2026-04-23 오후 1차 Write (Production 재편 222줄) → `git reset --hard HEAD~1` 사고로 working dir 소실
  2. 2026-04-23 오후 2차 Write (동일 구조 복원) → `git reset --hard origin/main` 사고로 재차 소실
  3. 2026-04-23 오후 3차 Write (본 파일) — **브랜치 `docs/sprint7-decisions-production-rewrite` 에서 직접 push 하여 reset 위험 제거**

---

## 0. Scope 재정의 (2026-04-23 오후 사용자 지시)

Sprint 7 는 **Production 기준** 으로 일체 해소한다. 본 문서에서 다음 표현은 **금지** 한다:

- "Sprint 8 후보", "Sprint 8 이관"
- "Week 2 이월" (Week 2 내부 배치는 허용. Sprint 밖 이월 금지)
- "dev-only 이므로 WONTFIX" (dev-only low 도 해소 대상)
- "후속 PR 로 분리 권장" (Sprint 7 안에서 처리)

근거:

1. **Production 기준** — 개발 환경 의존성도 공급망 공격 벡터이므로 production 수준으로 승격
2. **내일까지 프로그램 외 전부 완료** — 문서/인프라/감사/의존성 모두 Day 3 ~ Day 4 오전 사이 종결
3. **프로그램은 오류 0 까지 반복** — 프로그램 관련 항목은 기한 없이 완료까지 재시도 (E 메이저 bump, H Phase 2a 등 기능성)
4. **UI 수정은 architect + frontend-dev 페어 의무** — V-13e 및 기타 UX 변경은 2명 이상 검토 필수
5. **next-auth v5 이주 Sprint 7 내 처리** — `uuid < 14` 이 production high 로 재판정되어 Sprint 밖 이월 불가

---

## 1. Week 1 백로그 (Day 2 완결 상태)

| ID | 항목 | SP | 상태 | 배치 | 참조 |
|---|---|---|---|---|---|
| I-17 | rooms 테이블 PostgreSQL Phase 1 Dual-Write | 3 SP (2~5) | **DONE** (PR #42 merged) | Day 12 | Issue #43, ADR D-03, PR #40 + #42 |
| SEC-REV-013 (SEC-A) | Go 1.25.9 toolchain + go-redis v9.7.3 | 1 SP | **DONE** (PR #54 merged 05:07 UTC) | Day 2 / Day 13 | `docs/04-testing/75, 78` |
| SEC-REV-013 (SEC-B) | Next 15.5.15 + admin 16.2.4 bump | 2 SP | **DONE** (PR #56 merged 05:28 UTC, 재배포 완료) | Day 2 / Day 13 | `docs/04-testing/75, 78` |
| SEC-REV-013 (SEC-C) | npm audit fix (axios + transitive) | 1 SP | **DONE** (PR #56 에 흡수) | Day 2 / Day 13 | `docs/04-testing/78` |
| Issue #47 | LeaveRoom PLAYING 상태 가드 (409 GAME_IN_PROGRESS) | 2 SP | **DONE** (PR #53 merged 05:07 UTC, Issue CLOSED/COMPLETED) | Day 2 | `docs/04-testing/76` |
| Issue #48 | handleConfirm confirmBusy state (TURN_END race) | 1 SP | **DONE** (PR #55 merged 05:08 UTC, Issue CLOSED/COMPLETED) | Day 2 | `docs/04-testing/76` |
| Issue #49 | FINDING-02 day11 test fixture 수정 (Option A+C) | 1.5 SP | **DONE** (PR #57 merged 05:39 UTC, Issue CLOSED/COMPLETED) | Day 2 | `docs/04-testing/76` |
| ~~SEC-REV-002~~ | Rate limit violations decay | — | **해소 확인** (`ws_rate_limiter.go:138~146`) | 제거 | `docs/04-testing/78` §6.1 |
| ~~SEC-REV-008~~ | Hub RLock 내 외부 호출 | — | **해소 확인** (`ws_hub.go:100~130`) | 제거 | `docs/04-testing/78` §6.2 |
| ~~SEC-REV-009~~ | panic 전파 방어 | — | **해소 확인** (`ws_hub.go:166~180`) | 제거 | `docs/04-testing/78` §6.3 |
| I-14 후속 | `games` INSERT ON CONFLICT DO NOTHING | 1 SP | **흡수됨** (PR #38 + PR #42) | 제거 | `docs/04-testing/75` |
| I-15 후속 | `game.RoomCode` 빈 문자열 NOT NULL 방어 | 1 SP | **흡수됨** (I-17) | 제거 | — |

### Day 2 머지 결과 (2026-04-23)

**한 세션 5 PR 머지** (05:07 ~ 05:39 UTC, 32분 구간):

| PR | 제목 | 머지 시점 | Commit |
|---|---|---|---|
| #53 | fix(#47): LeaveRoom PLAYING 상태 가드 추가 (GAME_IN_PROGRESS 409) | 2026-04-23 05:07:33 UTC | `02a18fe1` |
| #54 | chore(sec-a): Go 1.25.9 + go-redis v9.7.3 toolchain bump | 2026-04-23 05:07:25 UTC | `539e6aad` |
| #55 | fix(#48): handleConfirm confirmBusy state로 중복 확정 방지 | 2026-04-23 05:08:13 UTC | `2a28d7c5` |
| #56 | chore(sec-bc): Next 15.5.15 + admin 16.2.4 + npm audit fix | 2026-04-23 05:28:05 UTC | `ad49d569` |
| #57 | fix(#49): day11 FINDING-02 test fixture 수정 (Option A+C) | 2026-04-23 05:39:26 UTC | `6e47957d` |

**K8s 재배포**: game-server / frontend / admin 모두 `day2-2026-04-23` 태그로 재배포 완료. rooms dual-write 회귀 없음 (D-03 Phase 1 유지).

### SEC-REV-002/008/009 종결 처리 (2026-04-23)

- **근거**: `docs/04-testing/78-sec-a-b-c-audit-delta.md` §6 (SEC-A/B/C 패치 전후 재감사)
- **결론**: **3건 모두 이미 해소됨**. Sprint 6 이관 Medium 항목은 사실상 부재. Sprint 7 TODO 및 MEMORY.md 보안 현황 섹션의 "미완료 SEC-REV-002/008/009" 문구 **제거** 권장.
- **PM 판정**: 신규 작업 불필요. 추적 이슈 미생성 상태이므로 close 조치도 불필요.

### Day 12 P0 제거 근거 (2026-04-23 architect 재확인)

- **P0-1 game_results persistence**: **ALREADY DONE** — PR #38 + PR #42 에서 완결
- **P0-2 GAME_OVER broadcast**: **ALREADY DONE** — PR #38 commit `c4b566a` 에서 완결
- **참조**: `docs/04-testing/75-sec-day12-impact-and-plan.md`
- **PM 판정**: Day 12 용 P0 핫픽스 작업은 종결. Day 2 자유 6h 를 Day 2 P1 에 투입하여 **Week 1 전체 P1 을 Day 2 하루에 소화** 완결.

### Issue #49 Option A+C 채택 근거

- **옵션 A**: day11 test fixture 수정 (B-1 / B-NEW / T7-02 4건, ~30 LOC)
- **옵션 C**: Playwright helper 수정으로 회귀 감지 유지
- **기각된 옵션**: PracticeBoard 리팩터 (범위 과대) — **Scope 재편 후 §3 PRB 로 재편입**
- **결정일**: 2026-04-23, PR #57 머지로 확정
- **참조**: `docs/04-testing/76-issue-47-48-49-impact-and-plan.md`

### I-17 상세 — rooms 테이블 Phase 1 Dual-Write (Day 12 DONE)

- **결정일**: 2026-04-22
- **옵션**: B (MVP → production 전환, Dual-Write)
- **ADR**: `work_logs/decisions/2026-04-22-rooms-postgres-phase1.md` (445줄)
- **Issue**: https://github.com/k82022603/RummiArena/issues/43
- **PR**:
  - #40 (ADR, **merged** 2026-04-22)
  - #42 (구현, **merged** 2026-04-22)
- **SP 실적**: 3 SP
- **배치**: Day 12 (당초 Week 1 중후반 예정이었으나 Day 12 에 조기 완결)
- **상태**: **DONE**. devops smoke 5/5 PASS, Day 2 재배포에서도 회귀 없음 확인.

---

## 2. Week 1 Day 3 ~ Day 4 오전 처리 대상 (문서/인프라 우선 완료)

사용자 지시: **"내일까지 프로그램 관련 빼고 모두 완료"**.

아래 항목은 프로그램 로직 수정이 최소이거나 문서·인프라·설정 중심이다. Day 3 (2026-04-24) 오전 ~ Day 4 (2026-04-25) 오전 사이 **전부 완료** 한다.

| ID | 항목 | SP | 분류 | Day 3 배치 | 참조 |
|---|---|---|---|---|---|
| **A** | CI/CD 감사 잡 3건 (sca-npm-audit + sca-govulncheck + weekly-dep-audit) | 5 | 인프라 | 오전 병렬 | `docs/04-testing/80` (작성 중) |
| **C** | dev-only deps 3건 (@typescript-eslint + @nestjs/cli + jest-env-jsdom) | 3 | 의존성 | 오전 병렬 | `docs/04-testing/79` (작성 중) |
| **I** | PostgreSQL 001 마이그레이션 staging dry-run (prompt_variant_id + shaper_id) | 2 | 인프라 | 오전 후반 | `docs/02-design/46, 47` |
| **G** | Istio DestinationRule 세밀 조정 | 2 | 인프라 | 오후 | `docs/02-design/20` |
| **J** | Playwright 전수 회귀 + 회귀 보고서 81 | 2 | QA | 저녁 | `docs/04-testing/81` (작성 중) |
| **P2_ADR** | next-auth v5 (Auth.js) 이주 **ADR 선행** | 3 ADR + 미정 이주 | 문서 | Day 3 오전 ADR / Day 4~ 이주 | `docs/04-testing/78` §5.1 |

### 2.1 next-auth v5 이주 Sprint 7 편입 근거

- **이전 분류**: "Sprint 8 후보" (기존 Sprint 7 초안)
- **재판정 (2026-04-23 Day 2 마감)**:
  - `uuid < 14` (GHSA-w5hq-g745-h8pq Missing buffer bounds check) 는 **next-auth v4 강제 종속**
  - next-auth v4 는 업스트림 지원 종료 (v5 beta 출시 후 fix forward only)
  - Production 인증 경로에서 사용 → **production moderate → production high** 로 승격
- **Sprint 7 내 처리 구조**:
  - Day 3 오전: ADR 작성 (session strategy, callbacks, adapter 재설계) — **3 SP**
  - Day 4 ~ Day 6: 이주 실구현 (Playwright 인증 스펙 전수 통과 필요) — **8 SP**
  - Day 7: 회귀 게이트
- **리스크**: Middleware API 재작성, session callback signature 변경, JWT strategy migration. 실패 시 revert 경로 명시 필수.

### 2.2 jest-environment-jsdom jest 30 동반 bump 처리 재명시

- **원 계획**: `jest-environment-jsdom` 30.3.0 단독 bump (dev-only)
- **실측 재분석**: jest-environment-jsdom 30.x 는 jest 30.x peer dependency 요구
  - frontend 현재 jest 29.7.0 유지 중
  - jest-environment-jsdom 만 30 으로 올리면 peer warning 발생, 일부 hooks 미작동 리스크
- **Day 3 처리 방침**: `jest-environment-jsdom` 과 `jest` 를 **동반 bump** (29.7.0 → 30.x). Jest 공식 v29 → v30 migration guide 준수
- **회귀 게이트**: `npm test -- --ci --coverage` 전수 PASS (599 테스트)
- **롤백 기준**: 신규 FAIL 1건이라도 발생 → 동반 revert. dev-only 이지만 **Sprint 7 내 해소 의무**. 재시도는 Day 5 오전.

---

## 3. Week 1 Day 3 ~ Week 2 내 완결 — 프로그램 관련 (오류 0 까지 반복)

사용자 지시: **"프로그램은 오류 0 까지 계속 반복"**. 기한 없이 Sprint 7 Week 2 마감 (2026-05-02) 전까지 완결.

| ID | 항목 | SP | 분류 | 배치 | 참조 / 에이전트 |
|---|---|---|---|---|---|
| **B** | V-13a `ErrNoRearrangePerm` orphan 리팩터 | 2 | 백엔드 | Day 3 오전 | go-dev |
| **D** | V-13e 조커 재드래그 UX | 3 | **UI (architect + frontend-dev 페어 의무)** | Day 3 오전 | `docs/02-design/49` 작성 중 |
| **E** | @nestjs/core v10 → v11 + file-type transitive bump | 5+2 | 의존성 메이저 | Day 3 오후 ~ Day 5 반복 | `docs/02-design/51` (작성 중) |
| **F** | FORFEIT 경로 완결성 점검 (Issue #47 후속) | 3 | 백엔드 | Day 3 오후 | `docs/04-testing/76` |
| **H** | D-03 Phase 2a rooms PostgreSQL shadow read | 8 | 인프라/백엔드 | Day 3 저녁 ~ Day 5 | `docs/02-design/50` (작성 중), ADR D-03 |
| **H2** | D-03 Phase 2b shadow-match guard + Phase 2c read-cutover | 5 | 인프라/백엔드 | Day 4 ~ Day 6 | ADR D-03 Phase 2b/2c (Sprint 7 내 반드시) |
| **NA** | next-auth v5 이주 실구현 | 8 | 프론트/백엔드 | Day 4 ~ Day 6 (ADR 후) | §2.1 |
| **P3** | I-17 Phase 3 rooms Postgres-Primary 전면 전환 | 8 | 인프라/백엔드 | Day 6 ~ Day 7 | ADR D-03 Phase 3 |
| **M1** | @nestjs/common + file-type transitive 완결 검증 | 2 | 의존성 | Day 5 ~ Day 6 | `docs/04-testing/78` §4.1 |
| **M2** | gorm.io/gorm / pgx/v5 drift 정리 | 2 | 의존성 | Day 5 ~ Day 6 | `docs/04-testing/75` |
| **DS** | DashScope 실제 API 키 발급 후 production 활성화 | 1 | 외부연동 | Day 4 ~ | 사용자 액션 필요 |
| **Istio5.2** | Istio Phase 5.2 서킷 브레이커 확장 | 3 | 인프라 | Day 5 ~ Day 6 | — |
| **PRB** | PracticeBoard 리팩터 (Issue #49 기각 옵션 재편입) | 5 | UI (페어 의무) | Day 5 ~ Day 7 | Issue #49 영향도 연장 |
| **MODEL** | 다른 모델 비교 재실험 — Claude/GPT "28% 천장" 재현성 | 5 | AI 실험 | Day 6 ~ Day 7 | MEMORY.md AI 대전 섹션 |

### 3.1 UI 수정 페어 코딩 의무 (D, PRB 해당)

사용자 지시: **"UI 수정은 architect + frontend-dev 페어 의무"**.

1. architect 가 설계/검토 세션을 먼저 연다 (30분~1h)
2. frontend-dev 가 구현을 진행한다
3. architect 가 머지 전 PR 리뷰를 붙인다 (체크리스트: 회귀 가능성, 접근성, Playwright 회귀 영향)
4. 리뷰 없이 머지 금지. 리뷰 PR 코멘트 또는 ADR 코멘트 증거 남김

### 3.2 프로그램 오류 0 재시도 원칙

- E (@nestjs/core v11), H (Phase 2a shadow), H2 (Phase 2b/2c), NA (next-auth v5 이주) 은 **오류 0** 까지 재시도
- 1회 시도에서 실패 → revert → 원인 분석 → 다음 블록에서 재시도. 기한 없음.
- Sprint 7 Week 2 마감 (2026-05-02) 까지 완결하되, 마감 당일에도 오류 잔존 시 **Sprint 7 연장** 판단 (Sprint 밖 이월 금지).

---

## 4. 번다운 현황 (Day 2 마감 기준, Production 재편)

| 구분 | 계획 SP | 완료 SP | 잔여 SP | 비고 |
|---|---|---|---|---|
| Day 12 P0 | 0 (이미 해결) | 0 | 0 | PR #38 + #42 |
| Day 12 rooms Phase 1 | 3 | 3 | 0 | PR #40 + #42 |
| Day 2 P1 (SEC-A/B/C + Issue #47/#48/#49) | 8.5 | 8.5 | 0 | PR #53~#57 |
| **Week 1 Day 3~4 오전 (§2)** | **17** | 0 | **17** | A, C, I, G, J, P2_ADR |
| **Week 1~2 프로그램 (§3)** | **49** | 0 | **49** | B, D, E, F, H, H2, NA, P3, M1, M2, DS, Istio5.2, PRB, MODEL |
| **Sprint 7 총계 (Scope 재편 후)** | **77.5** | 11.5 | **66** | Day 2 소화 15% |

### 4.1 Scope 재편 전후 비교

| 항목 | 재편 전 | 재편 후 |
|---|---|---|
| Sprint 7 총 SP | 26.5 (Week 1 20 + Week 2 6.5 부분) | **77.5** (이관 항목 전량 재편입) |
| 이관 항목 수 | 4건 | 0건 |
| Day 2 마감 잔여 | ~18 SP | 66 SP |
| Sprint 7 예상 종료 | Week 2 초반 | **Week 2 마감 ~ 연장 (오류 0 기준)** |

**재편의 의미**: Sprint 7 는 dev-only/iteration 수준이 아닌 **공급망+기능+Auth 전면 정리 Sprint** 로 승격. 본 재편은 사용자 판단이며, PM 은 번아웃 리스크를 Day 3 집행 계획 §7 에서 별도 관리한다.

---

## 5. Sprint 7 킬 목록 (결정 완료)

- ~~DeepSeek v3-tuned A/B 대전~~ — v6 Kill 결론으로 불필요 (2026-04-21)
- ~~Task #19 본실측~~ — Task #21 A안 Kill + Plan B 로 대체 (2026-04-21)
- ~~Day 12 backend P0-1 game_results persistence~~ — 2026-04-23 architect A 재확인 결과 PR #38 + #42 로 이미 해결
- ~~Day 12 backend P0-2 GAME_OVER broadcast~~ — 2026-04-23 architect A 재확인 결과 PR #38 commit `c4b566a` 로 이미 해결
- ~~SEC-REV-002 / SEC-REV-008 / SEC-REV-009 Sprint 6 이관 Medium~~ — 2026-04-23 재감사 결과 3건 모두 기해소 확인
- ~~Issue #49 PracticeBoard 리팩터 **기각**~~ — 2026-04-23 Scope 재편으로 §3 PRB 로 **재편입**

**명시적 제거 금지 항목** (재편 후): 없음. Sprint 7 내 전부 처리 대상.

---

## 6. 참고 링크

- Day 3 집행 계획: `docs/01-planning/day3-execution-plan.md` (Production 기준 재작성)
- Sprint 7 로드맵 (Observability 중심): `docs/01-planning/09-roadmap-and-backlog.md` §Sprint 7
- Sprint 6 킥오프: `docs/01-planning/17-sprint6-kickoff-directives.md`
- SEC-A/B/C 감사 델타: `docs/04-testing/78-sec-a-b-c-audit-delta.md`
- SEC Day 12 영향도: `docs/04-testing/75-sec-day12-impact-and-plan.md`
- Issue #47/#48/#49 영향도: `docs/04-testing/76-issue-47-48-49-impact-and-plan.md`
- ADR D-03: `work_logs/decisions/2026-04-22-rooms-postgres-phase1.md`
- 최근 결정 로그: `work_logs/decisions/`
