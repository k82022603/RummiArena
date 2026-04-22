# Sprint 7 결정·백로그 (작업 중)

- **Sprint**: 7 (2026-04-22 ~ )
- **Owner**: 애벌레 (PM/Dev)
- **상태**: 진행 중 (Sprint 7 Week 1 Day 12 착수)
- **비고**: 정식 Sprint 7 백로그 문서(`22-sprint7-...md`)가 확정되기 전까지 본 파일이 임시 인덱스로 동작한다. 공식화 시 본 파일의 항목을 흡수하고 redirect 주석을 남긴다.

## 목적

Sprint 7 기간 중 발생한 설계·이관 결정을 한 파일에 모아 **Issue / PR / ADR / 백로그 포인트** 를 한눈에 추적한다. `docs/01-planning/09-roadmap-and-backlog.md` §Sprint 7 (Observability) 과는 별개로, Sprint 6 에서 넘어온 운영·데이터 정합성 항목을 관리한다.

## 백로그 (Week 1)

| ID | 항목 | SP | 상태 | 배치 | 참조 |
|---|---|---|---|---|---|
| I-17 | rooms 테이블 PostgreSQL Phase 1 Dual-Write | 3 SP (2~5) | PR #42 merge 대기 | Week 1 중후반 (Day 13~14) | Issue #43, ADR D-03, PR #40 (merged), PR #42 (open) |
| SEC-REV-013 | 의존성 감사 패치 3 PR (Go toolchain / next / npm audit) | 5 SP | 예정 | Day 12 ~ Day 13 | `docs/04-testing/70-*` |
| I-14 후속 | `games` INSERT ON CONFLICT DO NOTHING (PK 충돌 방어) | 1 SP | 예정 | Week 1 | PR #38 TODO |
| I-15 후속 | `game.RoomCode` 빈 문자열 NOT NULL 방어 | 1 SP | I-17 구현으로 흡수 | Week 1 | I-17 과 통합 |
| V-13a | `ErrNoRearrangePerm` orphan 리팩터 | 2 SP | 예정 | Week 1~2 | go-dev |
| V-13e | 조커 재드래그 UX | 3 SP | 예정 | Week 1~2 | frontend-dev |

### I-17 상세 — rooms 테이블 Phase 1 Dual-Write

- **결정일**: 2026-04-22
- **옵션**: B (MVP → production 전환, Dual-Write)
- **ADR**: `work_logs/decisions/2026-04-22-rooms-postgres-phase1.md` (445줄)
- **Issue**: https://github.com/k82022603/RummiArena/issues/43
- **PR**:
  - #40 (ADR, **merged** 2026-04-22)
  - #42 (구현, feat/rooms-postgres-phase1-impl, **open**)
- **SP 추정**: 3 (2~5 범위, 메모리 정본 + PG best-effort 1-depth 변경 18 call-site)
- **배치**: Week 1 중후반 (Day 13 ~ Day 14 근처). Day 12 는 backend P0 핫픽스 마감 우선.
- **상태**: **PR #42 merge 대기** (ADR 승인 완료, 구현 PR 검토 중)

## 백로그 (Week 2 ~ 이후)

| ID | 항목 | SP | 배치 |
|---|---|---|---|
| I-17 Phase 2 | rooms 테이블 Postgres-Primary 전면 전환 (복구 경로, 동시성 제어) | 8 SP | Sprint 8 예상 |
| Istio Phase 5.2 | 서킷 브레이커 확장 | 3 SP | Week 2 |
| PostgreSQL 001 마이그레이션 | `prompt_variant_id` + `shaper_id` | 2 SP | Week 1~2 (staging 먼저) |
| DashScope | 실제 API 키 발급 후 production 활성화 | 1 SP | Week 2 |

## Sprint 7 킬 목록 (결정 완료)

- ~~DeepSeek v3-tuned A/B 대전~~ — v6 Kill 결론으로 불필요 (2026-04-21)
- ~~Task #19 본실측~~ — Task #21 A안 Kill + Plan B 로 대체 (2026-04-21)

## 참고 링크

- Sprint 7 로드맵 (Observability 중심): `docs/01-planning/09-roadmap-and-backlog.md` §Sprint 7
- Sprint 6 킥오프: `docs/01-planning/17-sprint6-kickoff-directives.md`
- 최근 결정 로그: `work_logs/decisions/`
