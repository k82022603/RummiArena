# 스크럼 미팅 로그

- **날짜**: 2026-03-29 (일) [예정]
- **Sprint**: Phase 2 / Sprint 2 킥오프
- **유형**: Sprint 킥오프 미팅
- **참석자**: 애벌레(Owner), PM, Architect, Go Dev, Node Dev, Frontend Dev, Designer, QA, DevOps, Security, AI Engineer

---

## Sprint 1 회고 요약

### 잘된 것 (Keep)

1. **통합 테스트 100% 달성**: game-server 25개 + ai-adapter 6개 + 추가 보강 = 44개 통합 테스트 전원 PASS. 코드 품질에 대한 높은 신뢰도 확보
2. **WebSocket Hub 실구현 성공**: C2S 7종 + S2C 16종 프로토콜 설계 후 구현까지 완료. Frontend 프로토콜 연동으로 실시간 통신 기반 확보. 설계 문서와 구현의 정합성이 높았음
3. **Agent Teams 협업 패턴 안정화**: 오프닝 스탠드업 → 병렬 구현 → 통합 테스트 → 마감 스탠드업 사이클이 정착. 4건 커밋/107파일 규모의 작업을 Day 1에 처리하는 등 생산성 극대화

### 개선점 (Try)

1. **CI/CD 인프라 이월**: GitLab 인스턴스 + Runner 등록과 SonarQube 컨테이너가 Sprint 0에서 Sprint 1로, 다시 Sprint 2로 연속 이월. 코드가 충분히 쌓인 후 연동한다는 판단이었으나, 인프라 셋업은 가능한 빨리 완료하는 것이 안전 → Sprint 2 Week 1에 P0으로 최우선 배치
2. **E2E 게임 흐름 검증 부족**: ConfirmTurn + PlaceTiles 통합 테스트, PLACE_TILES 실시간 프리뷰, INVALID_MOVE 에러 UI 등이 P0/P1이었으나 Sprint 1 내 완료 불확실 → Sprint 2 E2E 테스트(S2-04)에서 체계적 검증 필요

---

## Sprint 2 목표 선언

> **CI/CD 파이프라인(GitLab CI + SonarQube)을 구축하여 코드 품질 게이트를 자동화한다. AI 캐릭터 시스템(하수/중수/고수 x 6캐릭터)을 ai-adapter에 구현하고, Frontend -> GameServer -> AI Adapter 전체 경로의 E2E 테스트를 확보한다. 관리자 대시보드 기본 기능(게임 목록, 상태 모니터링)과 1인 연습 모드 Stage 1~3을 제공한다.**

### 핵심 지표

| 지표 | 목표 |
|------|------|
| 총 SP | 30 SP |
| 기간 | 2026-03-29 ~ 04-11 (14일) |
| Velocity | 3.0 SP/일 (평일 기준) |
| CI 파이프라인 | Push 시 자동 실행, 5분 이내 |
| SonarQube | Coverage >= 60%, Bug 0, Vulnerability 0 |
| E2E 시나리오 | 5개 중 최소 4개 PASS |

---

## 백로그 아이템별 담당/일정 배분

| ID | 백로그 항목 | SP | 우선순위 | 담당 Agent | 일정 | 의존성 |
|----|------------|-----|---------|-----------|------|--------|
| S2-01 | GitLab CI 파이프라인 구축 | 5 | P0 | DevOps | Day 1~2 (03-30~31) | - |
| S2-02 | SonarQube 연동 (코드 품질 게이트) | 4 | P0 | DevOps | Day 3~4 (04-01~02) | S2-01 |
| S2-03 | AI 캐릭터 시스템 구현 | 6 | P0 | AI Engineer, Node Dev | Day 5~6 (04-03, 04-06) | - |
| S2-04 | 게임 흐름 E2E 테스트 | 5 | P1 | QA, Go Dev | Day 7~8 (04-07~08) | S2-03 |
| S2-05 | 관리자 대시보드 기본 기능 | 5 | P1 | Frontend Dev | Day 9 (04-09) | - |
| S2-06 | 1인 연습 모드 Stage 1~3 | 5 | P1 | Frontend Dev, Go Dev | Day 10 (04-10) | - |

### 주차별 목표

- **Week 1 (03-29 ~ 04-04)**: CI/CD 인프라 완성(S2-01, S2-02) + AI 캐릭터 전반부(S2-03 3종) = 12 SP
- **Week 2 (04-05 ~ 04-11)**: AI 캐릭터 후반부 + E2E 테스트 + 관리자 대시보드 + 연습 모드 = 18 SP

### 크리티컬 패스

```
S2-03(6 SP) -> S2-04(5 SP) = 11 SP (AI 캐릭터 + E2E 라인)
```

AI 캐릭터 라인이 크리티컬 패스이다. Week 1에서 CI/CD와 캐릭터 전반부를 병렬 진행하면 병목 없이 소화 가능.

---

## 리스크 대응 방안

### 기존 리스크 (Sprint 1 → Sprint 2)

| ID | 리스크 | 등급 | 대응 전략 |
|----|--------|------|-----------|
| TR-05 | Docker Desktop K8s 리소스 부족 | 높음 | 교대 실행 전략 유지. Sprint 1 경험으로 프로파일 전환 안정화 |
| TR-07 | SonarQube 메모리 과다 사용 | 높음 | 분석 완료 후 즉시 컨테이너 중지. 품질 모드(~4GB) 단독 실행 |
| SR-01 | 1인 개발 병목 | 높음 | Agent Teams 활용 극대화. 주말 버퍼 확보 |

### 신규 리스크

| ID | 리스크 | 등급 | 대응 전략 |
|----|--------|------|-----------|
| S2-R01 | GitLab 인스턴스 메모리 과다 (4GB+) | 높음 | GitLab CE 최소 설정, Puma worker 2개 제한. 3회 OOM 시 GitLab SaaS(gitlab.com) 또는 GitHub Actions 대안 전환 |
| S2-R02 | SonarQube + GitLab 동시 실행 불가 | 중간 | 교대 실행. SonarQube 분석은 GitLab 파이프라인 외부에서 별도 트리거 |
| S2-R03 | AI 캐릭터 프롬프트 품질 검증 어려움 | 중간 | 하수/중수/고수 행동 차이를 정량 메트릭으로 비교 (평균 타일 소진 속도, 무효 수 비율) |
| S2-R04 | E2E 테스트 환경 불안정 | 중간 | docker-compose로 격리. health check 대기 + 재시도 로직 포함 |
| S2-R05 | Day 9~10 (Admin+연습모드) 일정 부담 | 중간 | 완료 못할 경우 연습 모드 Stage 3를 Sprint 3로 이월 |

### 교대 실행 전략 (메모리 관리)

| 작업 단계 | 실행 모드 | 예상 메모리 | 동시 실행 서비스 |
|-----------|----------|-----------|----------------|
| GitLab 구성 (Day 1~2) | CI/CD 모드 | ~6GB | GitLab + Runner |
| SonarQube 분석 (Day 3~4) | 품질 모드 | ~4GB | SonarQube 단독 |
| AI 캐릭터 개발 (Day 5~6) | 개발 모드 | ~5GB | Go + NestJS + Redis + PG |
| E2E 테스트 (Day 7~8) | 개발 모드 | ~6GB | 전 서비스 |
| Admin/연습 모드 (Day 9~10) | 개발 모드 | ~5GB | Go + Frontend + PG |

---

## 액션 아이템 (킥오프 직후)

| # | 담당 | 할 일 | 우선순위 | 기한 |
|---|------|-------|----------|------|
| 1 | DevOps | GitLab.com 계정/프로젝트 생성 또는 로컬 GitLab CE 컨테이너 기동 | P0 | 03-30 |
| 2 | DevOps | GitLab Runner 등록 (Docker Executor) + .gitlab-ci.yml 작성 | P0 | 03-31 |
| 3 | DevOps | SonarQube 기동 + admin 비밀번호 변경 + 프로젝트 설정 | P0 | 04-01 |
| 4 | DevOps | CI 파이프라인에 SonarQube 분석 + Quality Gate 연동 | P0 | 04-02 |
| 5 | AI Engineer | 캐릭터 프롬프트 전반부 작성 (Rookie, Calculator, Shark) | P0 | 04-03 |
| 6 | AI Engineer | 캐릭터 프롬프트 후반부 + 난이도/심리전 레벨 (Fox, Wall, Wildcard) | P0 | 04-06 |
| 7 | QA | E2E 테스트 프레임워크 구성 + 시나리오 1~5 작성 | P1 | 04-08 |
| 8 | Frontend Dev | 관리자 대시보드 (Admin Next.js + Room 목록 + 강제 종료) | P1 | 04-09 |
| 9 | Frontend Dev | 1인 연습 모드 Stage 1~3 + 튜토리얼 | P1 | 04-10 |
| 10 | PM | 데일리 스크럼 + 번다운 차트 업데이트 | P0 | 매일 |

---

## Sprint 2 완료 기준 (DoD)

- [ ] GitLab CI 파이프라인이 Push 시 자동 실행, 빌드/테스트/린트/보안 스캔 통과
- [ ] SonarQube Quality Gate PASSED (Coverage >= 60%, Bug 0, Vulnerability 0)
- [ ] AI 캐릭터 6종 x 3난이도 프롬프트 구현, 하수/중수/고수 행동 차이 확인
- [ ] E2E 테스트 5개 시나리오 중 최소 4개 PASS
- [ ] 관리자 대시보드에서 활성 Room 목록 조회 + 강제 종료 동작
- [ ] 1인 연습 모드 Stage 1~3 플레이 가능 (로그인 불필요)

---

## 메모

- Sprint 1 산출물 기반이 탄탄함 (Game Engine 96.5% 커버리지, 통합 테스트 44개, K8s 5개 서비스 Running)
- CI/CD 인프라(S2-01, S2-02)는 2회 이월된 부채이므로 Sprint 2에서 반드시 해소
- 16GB RAM 제약은 교대 실행 전략으로 관리 가능. Sprint 1에서 패턴이 검증됨
- S2-R01(GitLab 메모리 과다) 발동 시 GitLab SaaS(gitlab.com)로 대안 전환 → Runner만 로컬
- Sprint 2 완료 후 Sprint 3 인터페이스: CI 파이프라인 → 모든 변경 자동 검증, AI 캐릭터 → Sprint 4 전략 비교 실험, E2E → 회귀 테스트 베이스라인

*작성: 애벌레 (PM) | 2026-03-15 (사전 준비)*
