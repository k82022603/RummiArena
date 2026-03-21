# Sprint 1 회고 (Retrospective)

- **Sprint**: Sprint 1
- **기간**: 2026-03-13 ~ 2026-03-21 (공식 마감: 2026-03-28, 조기 완료)
- **작성**: 2026-03-21

## Sprint 1 목표 vs 실적

| 목표 | 상태 | 비고 |
|------|------|------|
| GitLab CI 파이프라인 구축 (#18) | ✅ 완료 | lint/test/quality/build/update-gitops 11개 job GREEN |
| SonarQube Quality Gate 연동 (#19) | ✅ 완료 | 3개 프로젝트 PASSED |
| GitLab Runner K8s 등록 (#9) | ✅ 완료 | Runner ID 52262488 online |
| ArgoCD Application 등록 | ✅ 완료 | Synced+Healthy (조기 추가) |
| CVE 수정 7건 | ✅ 완료 | next, multer, golang-jwt, x/crypto 등 |
| Mermaid 다이어그램 5개 수정 | ✅ 완료 | GitHub 렌더링 오류 해결 |
| 통합 테스트 50개 GREEN | ✅ 완료 | engine 95.8%, service 58.1% |
| dev-login + 게스트 로그인 UI | ✅ 완료 | NextAuth CredentialsProvider |
| E2E 수동 시나리오 확인 | ✅ 완료 | 로그인→방생성→참가→시작 |
| DevSecOps CI/CD 가이드 문서 | ✅ 완료 | 11-devsecops-cicd-guide.md |

## Velocity

- **계획 SP**: 28 SP
- **완료 SP**: 28 SP (100%)
- **실제 기간**: 9일 (2026-03-13 ~ 03-21)

## KPT (Keep / Problem / Try)

### Keep (잘 된 것)
- GitLab CI YAML anchor(`&local-runner`) 패턴 — 공유 런너 차단이 확실하게 동작
- ArgoCD selfHeal + prune 자동 sync — GitOps 사이클 완성
- SonarQube Quality Gate 조건을 현실적으로 설정 (신규 코드 기준)
- 에이전트 팀 병렬 운용 — 아키텍처/보안/AI 관점을 동시 수렴
- Mermaid 다이어그램 표준화 (SKILL.md GitHub 렌더링 규칙 정비)

### Problem (아쉬웠던 것)
- dev-values.yaml 이미지 태그 블록이 주석 처리 상태 — update-gitops가 실제로 동작하지 않음
- JWT_SECRET 빈 문자열 기본값 — fail-fast 로직 없이 WARN만 출력 (보안 취약점)
- game-server에 AI Adapter HTTP client 코드 없음 — Sprint 2 최대 블로커
- 5일 공백(03-16 ~ 03-20) — Runner stuck_or_timeout_failure 19건 누적

### Try (Sprint 2에서 시도할 것)
- dev-values.yaml 이미지 태그 활성화 → 실제 GitOps 이미지 자동 배포
- JWT_SECRET fail-fast 로직 추가 (빈 문자열 시 서버 기동 차단)
- game-server AI HTTP client 인터페이스 Day 1에 합의
- 교대 실행 스케줄 사전 확정 (Ollama ON / SonarQube ON / K8s Full 세 모드)

## 완료 선언

Sprint 1의 핵심 수용 조건(CI GREEN, SonarQube PASSED, ArgoCD Synced, Runner online)이 모두 충족됨.
**Sprint 1 공식 완료 선언: 2026-03-21**
