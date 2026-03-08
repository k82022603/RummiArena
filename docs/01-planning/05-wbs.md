# WBS (Work Breakdown Structure)

## 전체 프로젝트 단계

```
RummiArena
├── Phase 1: 기획 & 환경 구축
├── Phase 2: 핵심 게임 개발 (MVP)
├── Phase 3: AI 연동 & 멀티플레이
├── Phase 4: 플랫폼 기능 확장
├── Phase 5: DevSecOps 고도화
└── Phase 6: 운영 & 실험
```

---

## Phase 1: 기획 & 환경 구축

### Sprint 0 (인프라)

| ID | 작업 | 산출물 |
|----|------|--------|
| 1.1.1 | 프로젝트 기획 문서 작성 | docs/01-planning/* |
| 1.1.2 | GitHub 저장소 구성 + Issue 템플릿 | .github/ |
| 1.1.3 | Docker Desktop K8s 활성화 | - |
| 1.1.4 | NGINX Ingress Controller 설치 | K8s Ingress |
| 1.1.5 | ArgoCD 설치 (Helm) | argocd namespace |
| 1.1.6 | GitLab Runner 등록 | .gitlab-ci.yml |
| 1.1.7 | SonarQube 설치 (Docker) | sonarqube 서비스 |
| 1.1.8 | Helm Umbrella Chart 초기 구조 | helm/ |
| 1.1.9 | GitOps 레포 구조 설정 | environments/ |

---

## Phase 2: 핵심 게임 개발 (MVP)

### Sprint 1: 게임 엔진

| ID | 작업 | 산출물 |
|----|------|--------|
| 2.1.1 | 루미큐브 타일 데이터 모델 설계 | 타일 구조체/클래스 |
| 2.1.2 | 타일 풀(Pool) 생성 및 셔플 | 초기 분배 로직 |
| 2.1.3 | 그룹 유효성 검증 로직 | 검증 함수 |
| 2.1.4 | 런 유효성 검증 로직 | 검증 함수 |
| 2.1.5 | 조커 처리 로직 | 조커 규칙 구현 |
| 2.1.6 | 최초 등록 (30점) 조건 검증 | 등록 검증 함수 |
| 2.1.7 | 턴 관리 (턴 전환, 드로우) | 턴 매니저 |
| 2.1.8 | 승리 조건 판정 | 게임 종료 로직 |
| 2.1.9 | 게임 엔진 단위 테스트 | 테스트 코드 |

### Sprint 2: 백엔드 API

| ID | 작업 | 산출물 |
|----|------|--------|
| 2.2.1 | 프로젝트 초기화 (NestJS or Go) | src/game-server/ |
| 2.2.2 | REST API 설계 (Room CRUD) | API 엔드포인트 |
| 2.2.3 | WebSocket 서버 구현 | 실시간 통신 |
| 2.2.4 | Redis 연동 (게임 상태 저장) | Redis 클라이언트 |
| 2.2.5 | PostgreSQL 연동 (유저, 전적) | DB 스키마 |
| 2.2.6 | Health / Metrics 엔드포인트 | /health, /metrics |
| 2.2.7 | 구조화 JSON 로그 설정 | Logger 설정 |
| 2.2.8 | Dockerfile 작성 | Docker 이미지 |
| 2.2.9 | Helm Chart 작성 | helm/charts/game-server/ |

### Sprint 3: 프론트엔드 기본

| ID | 작업 | 산출물 |
|----|------|--------|
| 2.3.1 | Next.js 프로젝트 초기화 | src/frontend/ |
| 2.3.2 | Google OAuth 로그인 구현 | 로그인 페이지 |
| 2.3.3 | 로비 화면 (Room 목록/생성) | 로비 UI |
| 2.3.4 | 게임 보드 기본 레이아웃 | 게임 화면 |
| 2.3.5 | 타일 랙 UI (내 타일) | 하단 랙 컴포넌트 |
| 2.3.6 | 타일 드래그 & 드롭 (dnd-kit) | 인터랙션 |
| 2.3.7 | WebSocket 연결 | 실시간 동기화 |
| 2.3.8 | Dockerfile 작성 | Docker 이미지 |
| 2.3.9 | Helm Chart 작성 | helm/charts/frontend/ |

---

## Phase 3: AI 연동 & 멀티플레이

### Sprint 4: AI Adapter

| ID | 작업 | 산출물 |
|----|------|--------|
| 3.1.1 | AI Adapter 인터페이스 설계 | 공통 인터페이스 |
| 3.1.2 | OpenAI Adapter 구현 | OpenAI 연동 |
| 3.1.3 | Claude Adapter 구현 | Claude 연동 |
| 3.1.4 | DeepSeek Adapter 구현 | DeepSeek 연동 |
| 3.1.5 | Ollama Adapter 구현 | 로컬 LLaMA 연동 |
| 3.1.6 | 프롬프트 설계 (게임 상태 → 행동) | 프롬프트 템플릿 |
| 3.1.7 | 유효성 검증 실패 시 재요청 로직 | 재시도 핸들러 |
| 3.1.8 | AI 호출 로그/메트릭 수집 | 로깅 |
| 3.1.9 | Helm Chart 작성 | helm/charts/ai-adapter/ |

### Sprint 5: 실시간 멀티플레이 완성

| ID | 작업 | 산출물 |
|----|------|--------|
| 3.2.1 | Room 기반 게임 세션 관리 | Room Manager |
| 3.2.2 | Human + AI 혼합 매칭 로직 | 매칭 시스템 |
| 3.2.3 | 턴 동기화 (Human 턴 ↔ AI 턴) | 턴 오케스트레이터 |
| 3.2.4 | 테이블 재배치 동기화 | 재조합 동기화 |
| 3.2.5 | 연결 끊김 / 재연결 처리 | 복구 로직 |
| 3.2.6 | 통합 테스트 (2~4인 게임) | E2E 테스트 |

---

## Phase 4: 플랫폼 기능 확장

### Sprint 6: 관리자 & 통계

| ID | 작업 | 산출물 |
|----|------|--------|
| 4.1.1 | 관리자 페이지 기본 구조 | src/admin/ |
| 4.1.2 | 활성 게임 모니터링 | Room 대시보드 |
| 4.1.3 | AI 모델별 통계 (승률, 응답시간) | 통계 화면 |
| 4.1.4 | 사용자 관리 (목록, 차단) | 유저 관리 |
| 4.1.5 | 카카오톡 알림 연동 | 알림 서비스 |
| 4.1.6 | ELO 랭킹 시스템 | 랭킹 로직 |

---

## Phase 5: DevSecOps 고도화

### Sprint 7: 보안 & 품질

| ID | 작업 | 산출물 |
|----|------|--------|
| 5.1.1 | SonarQube 파이프라인 연동 | CI 품질 게이트 |
| 5.1.2 | Trivy 이미지 스캔 자동화 | CI 보안 게이트 |
| 5.1.3 | OWASP ZAP 스캔 (선택) | DAST 결과 |
| 5.1.4 | Sealed Secrets 도입 | Secret 관리 |
| 5.1.5 | Prometheus + Grafana 설치 | 모니터링 |
| 5.1.6 | Istio Service Mesh 설치 | mTLS, 트래픽 관리 |
| 5.1.7 | Kiali + Jaeger 설치 | 서비스 토폴로지/트레이싱 |
| 5.1.8 | AI Adapter 가중치 라우팅 (Istio VirtualService) | A/B 테스트 |
| 5.1.9 | Circuit Breaker 설정 (Istio DestinationRule) | 장애 격리 |
| 5.1.10 | 부하 테스트 (k6) | 성능 테스트 결과 |

---

## Phase 6: 운영 & 실험

### Sprint 8+: 지속 운영

| ID | 작업 | 산출물 |
|----|------|--------|
| 6.1.1 | AI vs AI 토너먼트 실행 | 실험 결과 |
| 6.1.2 | 모델별 전략 비교 분석 | 분석 리포트 |
| 6.1.3 | 프롬프트 최적화 | 개선된 프롬프트 |
| 6.1.4 | 운영 가이드 작성 | docs/06-operations/ |
| 6.1.5 | OpenShift 이관 검토 | 이관 계획 |
