# Sprint 2 회고 (Retrospective)

- **Sprint**: Sprint 2
- **기간**: 2026-03-22 ~ (진행 중, Day 3에 주요 이슈 선완료)
- **작성**: 2026-03-22

## Sprint 2 목표 vs 실적

| 이슈 | 목표 | 상태 | SP | 비고 |
|------|------|------|-----|------|
| #20 | AI 캐릭터 시스템 (NestJS) | ✅ 완료 | 8 | CharacterService + 262개 테스트 |
| #21 | AI Turn Orchestrator (Go) | ✅ 완료 | 8 | goroutine + forceAIDraw 폴백 |
| #22 | Admin 대시보드 실 API 연동 | ✅ 완료 | 5 | getAdminToken() 3단계 fallback |
| #23 | 연습 모드 Stage 1~6 | ✅ 완료 | 8 | dnd-kit + joker-aware |
| #25 | ELO DB + 계산 엔진 (Go) | ✅ 완료 | 8 | Pairwise + Redis Sorted Set |
| #26 | ELO Admin 통계 패널 | ✅ 완료 | 5 | recharts PieChart + 리더보드 |
| #27 | ELO 랭킹 프론트엔드 | ✅ 완료 | 8 | /rankings + SVG LineChart |

**총계: 50 SP / 50 SP = 100%** (Sprint 2 원계획 30 SP + ELO 조기 착수 20 SP)

## Velocity

- **Sprint 2 원계획**: 30 SP (#20~#23)
- **ELO 조기 착수**: 21 SP (#25~#27, Phase 4 → Phase 2 선행)
- **완료 SP**: 50 SP (100% + 67% 초과)
- **실제 기간**: Day 1~3 (2026-03-22 기준 완료)

## KPT (Keep / Problem / Try)

### Keep (잘 된 것)
- **에이전트 병렬 운용 정착**: go-dev / node-dev / frontend-dev 동시 실행으로 3개 이슈를 반일 내 처리
- **실게임 통합 테스트**: WebSocket Python 스크립트로 자동화된 E2E 검증 → 실제 문제 3건 발견
- **ELO Pairwise 설계**: N명 게임에서 N×(N-1)/2 쌍 계산 → 확장성 확보
- **CI 13개 job ALL GREEN 유지**: ELO 추가 후에도 파이프라인 안정성 유지
- **Redis Sorted Set 추가**: PostgreSQL 단독에서 캐시 계층 추가 → 랭킹 조회 성능 개선
- **setter 패턴 (`WithEloRepo`, `WithRedisClient`)**: 기존 테스트 영향 없이 의존성 주입

### Problem (아쉬웠던 것)
- **자율 실행 중 Y 승인 5회 발생**: K8s 재시작/Secret 패치 등 시스템 작업에서 permission 요청. 사용자 외출 중 작업 중단 발생
- **AutoMigrate 에러 전파**: rooms constraint 오류 → elo_ratings 테이블 미생성 → 수동 SQL로 임시 해결. 에러 무시 후 계속 진행하는 로직 없음
- **K8s Secret 초기값 미설정**: DB_PASSWORD 빈 문자열 → 매 배포 시 수동 패치 필요. 운영 가이드 미비
- **elo_history FK 설계 미스**: 감사 로그 테이블에 FK 제약 → dev-login 사용자로 테스트 불가. 처음부터 DisableForeignKey=true 였어야 함
- **gemma3:4b 응답 지연**: ~40s/call → MIN_RETRIES×5 = 최악 200s. 프롬프트 최적화 미완
- **GORM TableName 규칙 미명시**: `elo_history` vs `elo_histories` — 불규칙 복수형 주의사항 문서화 필요

### Try (Sprint 3에서 시도할 것)
- K8s Secret 자동 주입 (Helm --set 또는 external-secrets) — DB_PASSWORD 수동 패치 제거
- AutoMigrate 에러 개별 처리 (`migrateEach()`로 분리, 실패해도 계속)
- gemma3:4b 프롬프트 개선 (JSON-only 강제, 응답 시간 목표 ~15s)
- 실제 Google OAuth 사용자 ELO 테스트 (현재 dev-login UUID만 검증)
- Redis ELO Sorted Set 조회 API (`GET /api/rankings` 성능 비교: DB vs Redis)

## 주요 기술 결정

| 결정 | 이유 |
|------|------|
| ELO Phase 4 → Phase 2 선행 | Sprint 2 일정 여유 + 랭킹 없이 멀티플레이 QA 어려움 |
| place+빈 tiles → draw 자동 변환 | 소형 LLM(4B) 대응, 재시도 낭비 방지 |
| updateElo() goroutine 비동기 | GAME_OVER 응답 지연 방지 |
| DisableForeignKeyConstraintWhenMigrating: true | 감사 로그 테이블 FK 자동생성 방지 |
| Redis Sorted Set 병행 유지 | 랭킹 조회 캐시, DB 부하 분산 |

## 완료 선언

Sprint 2 핵심 수용 조건:
- ✅ AI 턴이 자동으로 진행된다 (goroutine + forceAIDraw)
- ✅ ELO 랭킹이 게임 종료 후 자동 업데이트된다 (PostgreSQL + Redis)
- ✅ 관리자 대시보드에서 ELO 통계를 볼 수 있다
- ✅ 플레이어가 /rankings에서 순위를 확인할 수 있다
- ✅ CI 13개 job ALL GREEN

**Sprint 2 공식 완료 선언: 2026-03-22**
