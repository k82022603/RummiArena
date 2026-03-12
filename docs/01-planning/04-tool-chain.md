# 도구 체인 및 환경 구성 (Tool Chain & Environment)

## 1. 전체 도구 체인 맵

```mermaid
flowchart LR
    subgraph Dev["개발"]
        d1["VSCode\nGit"]
    end
    subgraph CI["빌드/CI"]
        c1["GitLab CI\nGitLab Runner\nDocker"]
    end
    subgraph QA["품질/보안"]
        q1["SonarQube\nTrivy\nOWASP ZAP*"]
    end
    subgraph CD["배포/CD"]
        cd1["ArgoCD\nHelm\nK8s"]
    end
    subgraph Ops["운영/모니터링"]
        o1["kubectl\nPrometheus*\nGrafana*\nJSON Logs"]
    end
    subgraph Comm["소통"]
        co1["카카오톡\nGitHub Issues"]
    end
    Dev --> CI --> QA --> CD --> Ops --> Comm
```

> `*` 표시: Phase 5 이후 도입

## 2. ALM (Application Lifecycle Management) 도구

| 단계 | 도구 | 용도 |
|------|------|------|
| 백로그/이슈 관리 | **GitHub Projects + Issues** | Kanban 보드, Sprint 관리, 이슈 추적 |
| 소스 관리 | **GitHub** | 소스 코드 저장소 |
| CI (빌드/테스트) | **GitLab CI + GitLab Runner** | Docker 빌드, 테스트, 이미지 Push |
| 코드 품질 | **SonarQube** | 정적 분석, 코드 스멜, 커버리지 |
| 보안 스캔 | **Trivy** | 컨테이너 이미지 취약점 스캔 |
| DAST | **OWASP ZAP** (Phase 5) | 동적 보안 테스트 |
| CD (배포) | **ArgoCD + Helm** | GitOps 기반 배포 |
| 알림 | **카카오톡 API** | 빌드/배포/장애 알림 |

## 3. GitHub + GitLab CI 이중 구조

소스 관리는 GitHub, CI/CD 빌드는 GitLab CI로 이중 구조를 사용한다.

```mermaid
flowchart LR
    subgraph GitHub["GitHub\n(소스 관리)"]
        GH_Repo["소스 저장소\nk82022603/RummiArena"]
        GH_Issues["Issues/Projects\n(백로그 관리)"]
    end

    subgraph GitLab["GitLab\n(CI/CD 빌드)"]
        GL_Mirror["미러 저장소\n(자동 동기화)"]
        GL_CI["GitLab CI\n(.gitlab-ci.yml)"]
        GL_Runner["GitLab Runner\n(K8s Pod)"]
        GL_Registry["Container Registry\n(이미지 저장)"]
    end

    subgraph K8s["Docker Desktop K8s\n(배포 환경)"]
        ArgoCD["ArgoCD\n(GitOps 배포)"]
    end

    GH_Repo -->|미러링| GL_Mirror
    GL_Mirror --> GL_CI
    GL_CI --> GL_Runner
    GL_Runner -->|이미지 Push| GL_Registry
    GL_Registry -->|이미지 Pull| ArgoCD
```

### 3.1 동기화 방식
- **GitHub -> GitLab 미러링**: GitLab의 Pull Mirroring 기능으로 자동 동기화
- 대안: GitHub Webhook -> GitLab Trigger API로 Push 이벤트 시 CI 파이프라인 트리거

### 3.2 GitLab Runner 위치
- Docker Desktop K8s 클러스터 내부에 Pod로 배포 (Helm chart)
- Runner executor: `kubernetes` (K8s Pod 기반 빌드)
- 교대 실행 전략: CI/CD 모드에서 실행 (~6GB RAM)

### 3.3 컨테이너 레지스트리 전략
| 옵션 | 장점 | 단점 | 선택 |
|------|------|------|------|
| GitLab Container Registry | GitLab CI 통합, 무료 | GitLab 계정 필요 | **우선 채택** |
| GitHub Container Registry (ghcr.io) | GitHub 통합, 무료 (public) | CI가 GitLab이므로 추가 설정 | 대안 |
| Docker Hub | 범용성 | 무료 pull 제한 | 비권장 |

> 우선 GitLab Container Registry를 사용하고, 필요 시 ghcr.io로 전환 검토

## 4. 개발 환경

| 항목 | 설정 |
|------|------|
| OS | Windows 11 + WSL2 |
| 런타임 | Docker Desktop (Kubernetes 활성화) |
| IDE | VSCode + 관련 확장 |
| Node.js | v20 LTS |
| Go | 1.22+ (Backend Go 선택 시) |
| Helm | v3.x |
| kubectl | Docker Desktop 내장 |

## 5. 카카오톡 연동 계획

### 5.1 사전 준비
- [카카오 디벨로퍼스](https://developers.kakao.com) 앱 등록
- 카카오톡 메시지 API 활성화
- 앱 키 발급 (REST API Key)

### 5.2 연동 대상 이벤트
| 이벤트 | 알림 내용 |
|--------|-----------|
| CI 빌드 실패 | 빌드 실패 알림 + 에러 요약 |
| 배포 완료 | ArgoCD Sync 완료 알림 |
| SonarQube 품질 게이트 실패 | 코드 품질 이슈 알림 |
| 보안 취약점 발견 | Trivy/ZAP 결과 알림 |
| AI 장애 | AI Adapter 응답 실패율 임계치 초과 |
| 게임 이벤트 | 게임 초대, 결과 알림 (선택) |

### 5.3 구현 방식
- 카카오톡 나에게 보내기 API 활용 (개인 알림)
- 또는 카카오워크 봇 API (팀 채널 알림)
- GitLab CI에서 Webhook -> 카카오 API 호출

## 6. SonarQube 구성 계획

### 6.1 배포 방식
- Docker Desktop K8s에 Helm으로 배포
- 또는 Docker Compose로 별도 실행 (리소스 절약)

### 6.2 연동 구조
```mermaid
flowchart LR
    CI["GitLab CI\nPipeline"] --> Scanner["sonar-scanner\n실행"] --> SQ["SonarQube 서버\n분석 결과 전송"] --> QG["Quality Gate\n판정"] --> Alert["실패 시\n카카오톡 알림"]
```

### 6.3 품질 게이트 기준 (초기)
| 메트릭 | 기준 |
|--------|------|
| Coverage | >= 60% |
| Duplicated Lines | <= 5% |
| Bugs | 0 (New Code) |
| Vulnerabilities | 0 (New Code) |
| Code Smells | <= 10 (New Code) |

## 7. 보안 스캔 도구 체인 (DevSecOps)

```mermaid
flowchart LR
    SAST["SAST\nSonarQube\n(코드 분석)"] --> SCA["SCA\nnpm audit\n(의존성 취약점)"] --> Container["Container\nTrivy\n(이미지 스캔)"] --> DAST["DAST\nOWASP ZAP*\n(동적 테스트)"]
```

### 파이프라인 내 보안 게이트
1. `sonar-scanner` -> 품질 게이트 통과
2. `npm audit` / `go vet` -> 취약 의존성 0
3. `trivy image` -> CRITICAL/HIGH 취약점 0
4. (Phase 5 Sprint 8) OWASP ZAP -> 배포 후 자동 스캔

## 8. Oracle VM 활용 방안 (비권장)

> **현재 장비(LG 그램, RAM 16GB)에서는 사용하지 않는다.**
> VM은 물리 RAM을 나눠 쓰므로, 16GB 환경에서 VM 추가 시 오히려 성능 악화.
> 별도 PC(32GB+)가 확보되거나, 멀티노드 K8s 실험이 필요할 때만 검토.

대안: **교대 실행 전략**으로 Docker Desktop 하나에서 모드별 서비스 전환.

## 9. Istio Service Mesh 구성 계획

> 도입 시점: **Phase 5 Sprint 9** (Sprint 7~8에서 Observability/보안 도구 선행 구축 후)

### 9.1 도입 목적
- **mTLS**: 서비스 간 자동 암호화 통신
- **트래픽 관리**: AI Adapter별 가중치 라우팅, Canary 배포
- **관측성**: Kiali 대시보드로 서비스 토폴로지/트래픽 시각화
- **장애 주입**: AI 응답 지연 시뮬레이션 (Chaos Engineering)
- **Rate Limiting**: AI API 호출 제한

### 9.2 적용 대상 서비스

```mermaid
graph TB
    Traefik["Traefik\n(외부 Ingress Gateway)"]
    Traefik --> FE["frontend\n(+ Envoy sidecar)"]
    Traefik --> GS["game-server\n(+ Envoy sidecar)"]
    Traefik --> Admin["admin\n(+ Envoy sidecar)"]

    GS -->|"mTLS"| AI["ai-adapter\n(+ Envoy sidecar)"]
    GS -->|"mTLS"| Redis[("Redis\n(게임 상태)")]
    GS -->|"mTLS"| PG[("PostgreSQL\n(영속 데이터)")]

    AI --> OpenAI["OpenAI\n(External API)"]
    AI --> Claude["Claude\n(External API)"]
    AI --> DeepSeek["DeepSeek\n(External API)"]
    AI --> Ollama["Ollama\n(Internal)"]
```

> **역할 분리**: Traefik이 외부 트래픽(North-South)을 담당하고, Istio는 서비스 간 통신(East-West)에만 집중한다. Istio Ingress Gateway는 사용하지 않는다.
> 상세: `docs/05-deployment/02-gateway-architecture.md`

### 9.3 핵심 활용 시나리오
| 시나리오 | Istio 기능 |
|----------|-----------|
| AI 모델 A/B 테스트 | VirtualService 가중치 라우팅 |
| 서비스 간 암호화 | PeerAuthentication (mTLS) |
| AI 타임아웃 제어 | DestinationRule timeout 설정 |
| Circuit Breaker | DestinationRule outlierDetection |
| 트래픽 시각화 | Kiali + Jaeger |
| 카나리 배포 실험 | VirtualService + Subset |

### 9.4 설치 방식
- istioctl 또는 Helm으로 설치
- Docker Desktop K8s에서 동작 가능 (메모리 추가 ~2GB 필요)
- Kiali, Jaeger 애드온 함께 설치 (Prometheus는 Sprint 7에서 선행 설치)

### 9.5 주의사항
- 리소스 소모가 큼 -> Phase 5 Sprint 9에서 도입 (Sprint 7 Observability 이후)
- Sidecar injection으로 Pod 메모리 증가
- Oracle VM에서 별도 클러스터 구성도 고려

## 10. Observability 도입 타임라인

```mermaid
flowchart LR
    subgraph Phase2_3["Phase 2~3\n(Sprint 1~5)"]
        L1["구조화 JSON 로그\n(stdout)"]
        M1["Health/Readiness\nProbe"]
        M2["/metrics\n엔드포인트"]
    end

    subgraph Phase5_S7["Phase 5\nSprint 7"]
        P1["Prometheus\n(메트릭 수집)"]
        G1["Grafana\n(대시보드)"]
        LC["로그 수집\n(Loki 또는 EFK Lite)"]
    end

    subgraph Phase5_S9["Phase 5\nSprint 9"]
        K1["Kiali\n(서비스 토폴로지)"]
        J1["Jaeger\n(분산 트레이싱)"]
        I1["Istio\n(Service Mesh)"]
    end

    Phase2_3 -->|기본 관측| Phase5_S7
    Phase5_S7 -->|풀스택 관측| Phase5_S9
```

| 단계 | 시기 | 도구 | 목적 |
|------|------|------|------|
| 기본 로그 | Phase 2~3 (Sprint 1~5) | 구조화 JSON 로그, Health Probe, /metrics | 개발 중 기본 관측 |
| 메트릭 수집 | Phase 5 Sprint 7 | Prometheus, Grafana, 로그 수집 | 리소스/성능 모니터링 |
| 풀스택 관측 | Phase 5 Sprint 9 | Kiali, Jaeger, Istio | 서비스 토폴로지, 분산 트레이싱 |

## 11. 추가 실험 가능 도구

| 도구 | 용도 | 단계 |
|------|------|------|
| Backstage | 개발자 포털 | Phase 6 이후 |
| k6 / Artillery | 부하 테스트 | Phase 5 Sprint 9 |
| Vault | Secret 관리 | Phase 5 Sprint 8 |
| Cert-Manager | TLS 인증서 자동화 | Phase 5 Sprint 8 |
| Telepresence | 로컬-K8s 개발 브릿지 | 선택 |
| Kustomize | Helm 대안 실험 | 선택 |
| **Istio** | **Service Mesh (트래픽 관리, mTLS, 관측)** | **Phase 5 Sprint 9** |
