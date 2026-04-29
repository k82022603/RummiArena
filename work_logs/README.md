# 프로젝트 로그 (Project Logs)

개발 과정의 모든 기록을 남기는 공간.

## 디렉토리 구조

```
work_logs/
├── sessions/         세션 로그 (작업 세션별 기록)
├── daily/            데일리 로그 (하루 시작/마무리)
├── scrums/           스크럼 미팅 로그 (하루 2회 정도)
├── vibe/             바이브 로그 (아이디어, 영감, 자유 메모)
├── retrospectives/   회고 로그 (Sprint 회고)
└── decisions/        결정 로그 (기술 결정, 트레이드오프 기록)
```

## 파일 명명 규칙

| 로그 유형 | 파일명 형식 | 예시 | 빈도 |
|-----------|-------------|------|------|
| 세션 로그 | `YYYY-MM-DD-NN.md` | `2026-03-08-01.md` | 세션당 1개 |
| 데일리 로그 | `YYYY-MM-DD.md` | `2026-03-08.md` | 하루 1개 |
| 스크럼 미팅 | `YYYY-MM-DD-NN.md` | `2026-03-08-01.md` | 하루 ~2회 |
| 바이브 로그 | `YYYY-MM-DD.md` | `2026-03-08.md` | 하루 1개 |
| 회고 로그 | `sprint-NN.md` | `sprint-01.md` | Sprint 종료 시 |
| 결정 로그 | `DNN-제목.md` | `D01-백엔드-언어-결정.md` | 결정 시 |

## 회고 로그 목록

### Sprint 7 팀원별 회고 (2026-04-29)

Sprint 7 (2026-04-22 ~ 2026-04-29) 최종 스프린트 팀원별 KPT 회고.

| # | 파일 | 팀원 | 역할 |
|---|------|------|------|
| 01 | `retrospectives/sprint7/01-애벌레.md` | 애벌레 | 프로젝트 오너 |
| 02 | `retrospectives/sprint7/02-architect.md` | architect | 시스템 설계 |
| 03 | `retrospectives/sprint7/03-go-dev.md` | go-dev | game-server 개발 |
| 04 | `retrospectives/sprint7/04-node-dev.md` | node-dev | ai-adapter 개발 |
| 05 | `retrospectives/sprint7/05-frontend-dev.md` | frontend-dev | 프론트엔드 개발 |
| 06 | `retrospectives/sprint7/06-frontend-dev-opus.md` | frontend-dev-opus | 페어코딩 Navigator |
| 07 | `retrospectives/sprint7/07-devops.md` | devops | K8s/Helm/ArgoCD |
| 08 | `retrospectives/sprint7/08-qa.md` | qa | E2E 테스트 |
| 09 | `retrospectives/sprint7/09-ai-engineer.md` | ai-engineer | AI 프롬프트/실험 |
| 10 | `retrospectives/sprint7/10-game-analyst.md` | game-analyst | 게임룰 SSOT |
| 11 | `retrospectives/sprint7/11-designer.md` | designer | UI/UX |
| 12 | `retrospectives/sprint7/12-security.md` | security | DevSecOps |
| 13 | `retrospectives/sprint7/13-pm.md` | pm | 스크럼/마감 관리 |

### 이전 Sprint 회고

| Sprint | 파일 |
|--------|------|
| Sprint 1 | `retrospectives/sprint1-retrospective.md` |
| Sprint 2 | `retrospectives/sprint2-retrospective.md` |
| Sprint 3 | `retrospectives/sprint3-retrospective.md` |
| Sprint 5 | `retrospectives/sprint5-retrospective.md` |

## 로그 성격 비교

| 로그 | 언제 | 무엇을 | 톤 |
|------|------|--------|-----|
| 세션 | 작업 시작/종료 | 커밋, 이슈, 완료 작업, TODO | 정확하고 상세 |
| 데일리 | 하루 시작/마무리 | 어제/오늘/내일/블로커 | 간결 |
| 스크럼 | 작업 전환점 | 각자 공유, 논의, 액션 아이템 | 대화체 |
| 바이브 | 아이디어 떠오를 때 | 영감, 실험 아이디어 | 자유 |
| 회고 | Sprint 종료 | Keep/Problem/Try, 달성도 | 반성적 |
| 결정 | 기술 결정 시 | 선택지, 근거, 영향 범위 | 논리적 |
