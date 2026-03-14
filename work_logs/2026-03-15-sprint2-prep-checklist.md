# Sprint 2 선행 작업 체크리스트

- **작성일**: 2026-03-15
- **작성자**: 애벌레 (PM)
- **Sprint 2 시작일**: 2026-03-29
- **목적**: Sprint 2 킥오프 전 완료해야 할 인프라/환경/관리 항목 정리

---

## 1. CI/CD 인프라 선행 구성

### 1.1 SonarQube 준비

- [ ] SonarQube 컨테이너 기동 확인 (Docker Compose, 포트 9000)
  ```
  docker run -d --name sonarqube -p 9000:9000 sonarqube:community
  ```
- [ ] SonarQube admin 비밀번호 변경 (기본: admin/admin → 변경 필수)
- [ ] SonarQube 접속 확인: `http://localhost:9000`
- [ ] 프로젝트 3개 생성 (game-server, ai-adapter, frontend)
- [ ] sonar-project.properties 템플릿 준비

> **주의**: SonarQube는 단독 실행 모드(~4GB). 다른 개발 서비스와 동시 실행 자제

### 1.2 GitLab 환경 구성

- [ ] GitLab.com 계정 생성 또는 기존 계정 확인
  - 옵션 A (권장): GitLab SaaS(gitlab.com) 사용 → 로컬 메모리 절약
  - 옵션 B: GitLab CE 로컬 Docker 컨테이너 (4GB+ 필요, S2-R01 리스크)
- [ ] GitLab 프로젝트 생성: `RummiArena`
- [ ] GitLab Runner 토큰 발급
  - GitLab 프로젝트 Settings > CI/CD > Runners > New project runner
- [ ] GitLab Runner 설치 및 등록
  ```
  # Helm 기반 K8s Runner 또는 Docker 기반 로컬 Runner
  gitlab-runner register \
    --url https://gitlab.com \
    --token <RUNNER_TOKEN> \
    --executor docker \
    --docker-image alpine:latest
  ```
- [ ] Runner 상태 확인 (Online)

### 1.3 CI/CD Variables 등록

- [ ] `SONAR_HOST_URL` = `http://localhost:9000` (또는 SonarQube 접근 가능 URL)
- [ ] `SONAR_TOKEN` = SonarQube에서 발급한 토큰
- [ ] `GITOPS_TOKEN` = GitOps repo 접근용 PAT (ArgoCD 연동)
- [ ] `DOCKER_REGISTRY` = Container Registry URL
- [ ] `TRIVY_SEVERITY` = `CRITICAL,HIGH`

### 1.4 미러링/동기화 설정

- [ ] GitHub -> GitLab 미러링 설정
  - 옵션 A: GitLab Pull Mirror (GitLab 프로젝트 Settings > Repository > Mirroring)
  - 옵션 B: Dual remote push (`git remote add gitlab <URL>`)
  - 옵션 C: GitHub Actions에서 GitLab push 트리거
- [ ] 미러링 동작 확인 (Push → GitLab 동기화 → 파이프라인 트리거)

### 1.5 첫 파이프라인 실행

- [ ] `.gitlab-ci.yml` 템플릿 작성 (build → test → lint → scan 4단계)
- [ ] 테스트 Push → 파이프라인 자동 실행 확인
- [ ] 파이프라인 성공 확인 (또는 실패 원인 기록)
- [ ] 파이프라인 소요 시간 측정 (목표: 5분 이내)

---

## 2. Sprint 2 백로그 관리

- [ ] Sprint 2 백로그 GitHub Issues 6개 등록 (S2-01 ~ S2-06)
- [ ] Sprint 2 마일스톤 업데이트 (due: 2026-04-11)
- [ ] sprint-2 라벨 생성
- [ ] Sprint 1 미해결 이슈 검토 및 이월 여부 결정
- [ ] Sprint 2 계획서 최종 검토 (`docs/01-planning/08-sprint2-plan.md`)

---

## 3. 개발 환경 점검

### 3.1 기존 서비스 상태 확인

- [ ] PostgreSQL 컨테이너 (rummikub-postgres) 실행 중
- [ ] Redis 컨테이너 실행 가능 확인
- [ ] game-server 빌드 확인 (`go build ./...`)
- [ ] ai-adapter 빌드 확인 (`npm ci && npm run build`)
- [ ] frontend 빌드 확인 (`npm ci && npm run build`)
- [ ] K8s namespace rummikub Pod 상태 확인

### 3.2 메모리 프로파일 확인

- [ ] .wslconfig RummiArena 프로파일 확인 (10GB/swap4GB/6코어)
- [ ] `switch-wslconfig.sh rummiarena` 정상 동작 확인
- [ ] Docker Desktop 메모리 할당량 확인

### 3.3 AI Adapter 의존성

- [ ] OpenAI API 키 설정 확인 (최소 1개 LLM 실행 가능해야 E2E 테스트 가능)
- [ ] Ollama 설치 상태 확인 (로컬 LLM 옵션)
- [ ] AI Adapter fallback DRAW 정책 동작 확인

---

## 4. 문서 준비

- [ ] Sprint 2 계획서 작성 완료 (`docs/01-planning/08-sprint2-plan.md`)
- [ ] Sprint 2 킥오프 미팅 노트 작성 (`work_logs/scrums/2026-03-29-sprint2-kickoff.md`)
- [ ] WBS 업데이트 (Sprint 2 항목 반영)
- [ ] 리스크 관리 문서 업데이트 (S2-R01 ~ S2-R05 추가)

---

## 5. 체크 포인트

| 일자 | 점검 항목 | 완료 |
|------|----------|------|
| 03-15 | Sprint 2 계획서 + 킥오프 노트 + 체크리스트 작성 | [ ] |
| 03-16~28 | Sprint 1 잔여 작업 마무리 (현재 Sprint 진행) | [ ] |
| 03-28 | Sprint 1 회고 + Sprint 2 선행 작업 완료 확인 | [ ] |
| 03-29 | Sprint 2 킥오프 미팅 실행 | [ ] |

---

## 진행 상태

| 항목 | 상태 | 비고 |
|------|------|------|
| Sprint 2 계획서 | 완료 | `docs/01-planning/08-sprint2-plan.md` |
| Sprint 2 킥오프 미팅 노트 | 완료 (사전 작성) | `work_logs/scrums/2026-03-29-sprint2-kickoff.md` |
| Sprint 2 선행 체크리스트 | 완료 (본 문서) | `work_logs/2026-03-15-sprint2-prep-checklist.md` |
| Sprint 2 마일스톤 업데이트 | 완료 | due: 2026-04-11, description 업데이트 |
| sprint-2 라벨 생성 | 완료 | GitHub Labels |
| GitHub Issues 등록 | 완료 | S2-01 ~ S2-06 |
| SonarQube 기동 | 미완료 | Sprint 2 Day 3 예정 |
| GitLab 환경 구성 | 미완료 | Sprint 2 Day 1 예정 |
| CI/CD Variables | 미완료 | GitLab 구성 후 |
| 미러링 설정 | 미완료 | GitLab 구성 후 |
| 첫 파이프라인 실행 | 미완료 | CI 구성 완료 후 |

---

*작성: 애벌레 (PM) | 2026-03-15*
