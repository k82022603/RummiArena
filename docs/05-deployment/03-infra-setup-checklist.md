# 인프라 설치 준비 체크리스트

> Phase 1 (Sprint 0) — Traefik + ArgoCD + GitLab Runner 설치 준비
> 작성일: 2026-03-12 | 작성자: DevOps Agent
> **현행화: 2026-04-03 (Sprint 5 기준) — Pipeline #96 17/17 ALL GREEN, Kaniko 빌드, K8s Executor 반영**

---

## 1. 현재 인프라 상태 보고

### 1.1 점검 기준일

~~2026-03-12 기준 상태 (초안 추정)~~ → **2026-04-03 Sprint 5 기준 실측 상태로 갱신 (Pipeline #96 17/17 ALL GREEN)**

### 1.2 Docker Desktop / Kubernetes

| 항목 | 상태 | 비고 |
|------|------|------|
| Docker Desktop | ✅ Running | WSL2 Backend |
| K8s 활성화 | ✅ Active | `docker-desktop` context |
| kubectl context | `docker-desktop` | 확인됨 |
| 노드 수 | 1 (단일 노드) | Docker Desktop K8s 기본 |
| WSL 프로파일 | RummiArena: 10GB / swap 4GB / 6코어 | switch-wslconfig.sh 사용 |

### 1.3 K8s Pod 상태 (rummikub namespace, Sprint 4 기준)

| Pod | 상태 | NodePort |
|-----|------|----------|
| frontend | ✅ Running | 30000 |
| game-server | ✅ Running | 30080 |
| admin | ✅ Running | 30001 |
| ai-adapter | ✅ Running | ClusterIP |
| ollama | ✅ Running | ClusterIP |
| postgres | ✅ Running | ClusterIP |
| redis | ✅ Running | ClusterIP |

> **보존 규칙**: `kp-*` 접두사 컨테이너는 hybrid-rag-knowledge-ops 프로젝트 소속. 절대 삭제/중지하지 않는다.

### 1.4 Helm / ArgoCD / Traefik

| 항목 | 상태 | 비고 |
|------|------|------|
| Helm 설치 | ✅ 설치됨 | Helm 3 |
| `helm/` 디렉토리 | ✅ 존재 | charts/ 7개 + traefik/ |
| Traefik 릴리스 | ✅ **Running** (`traefik` namespace) | Sprint 5+ North-South 활성화 예정 |
| ArgoCD 릴리스 | ✅ Running (`argocd` namespace) | repo-server 가끔 Error — 재시작으로 복구 |
| GitLab Runner | ✅ **online** (ID: 52262488) | **K8s Executor** (gitlab-runner NS, v18.9.0) |
| `rummikub` namespace | ✅ Active | 앱 서비스 7개 |
| `argocd` namespace | ✅ Active | GitOps CD |
| `traefik` namespace | ✅ Active | Traefik v3 Pod Running |

> **Traefik 현황**: Pod는 Running이나 현재 rummikub 서비스는 NodePort 직접 접근 중. IngressRoute 연동은 Sprint 5+ 예정.
> 상세: [02-gateway-architecture.md](./02-gateway-architecture.md)

### 1.5 소스 코드 / GitOps 구조

| 항목 | 상태 |
|------|------|
| `helm/` 디렉토리 | ✅ **존재** — charts/ 7개 (admin, ai-adapter, frontend, game-server, ollama, postgres, redis) + traefik/ |
| `argocd/` 디렉토리 | ✅ **존재** — application.yaml, ingress-route.yaml |
| `.gitlab-ci.yml` | ✅ **존재** — **17개 job ALL GREEN** (Pipeline #96, 2026-04-03) |
| `src/` 서비스 코드 | ✅ **존재** — frontend, game-server, ai-adapter, admin |

### 1.6 설치 완료 체크리스트 (Sprint 4 기준)

```
[x] Docker Desktop이 실행 중인지 확인
[x] K8s 활성화 여부 확인 (kubectl cluster-info)
[x] Helm 3 설치 여부 확인 (helm version)
[x] WSL 프로파일이 RummiArena 프로파일(10GB)로 설정되어 있는지 확인
[x] hybrid-rag 서비스가 과도하게 메모리를 점유하지 않는지 확인 (free -h)
[x] Traefik 설치 (traefik namespace, Pod Running)
[x] ArgoCD 설치 및 GitOps 연동
[x] GitLab Runner 등록
[x] rummikub namespace 생성 및 서비스 7개 배포
```

---

## 2. 설치 순서 및 의존성

```mermaid
flowchart TB
    Pre["사전 확인\n(Docker, K8s, Helm,\nWSL 메모리)"]
    NS["네임스페이스 생성\ntraefik / argocd / rummikub\nsonarqube"]
    HelmDir["helm/ 디렉토리 생성\nChart.yaml + values.yaml"]
    Traefik["Traefik 설치\n(Helm)"]
    TraefikVerify["Traefik 검증\n(Pod Ready, Dashboard)"]
    ArgoCD["ArgoCD 설치\n(Helm)"]
    ArgoCDVerify["ArgoCD 검증\n(웹 UI 접속)"]
    ArgoApp["ArgoCD Application\n등록 (helm/ 감시)"]
    GitLabRepo["GitLab 프로젝트\n생성 또는 미러 설정"]
    Runner["GitLab Runner\n컨테이너 실행"]
    RunnerReg["Runner 등록\n(gitlab-runner register)"]
    End["설치 완료\n전체 파이프라인 검증"]

    Pre --> NS
    NS --> HelmDir
    HelmDir --> Traefik
    Traefik --> TraefikVerify
    TraefikVerify --> ArgoCD
    ArgoCD --> ArgoCDVerify
    ArgoCDVerify --> ArgoApp
    ArgoApp --> GitLabRepo
    GitLabRepo --> Runner
    Runner --> RunnerReg
    RunnerReg --> End
```

> Traefik이 ArgoCD보다 먼저 설치되어야 한다. ArgoCD 웹 UI 접근 시 Traefik IngressRoute를 사용할 수 있기 때문이다. 단, 로컬 환경에서는 port-forward로 대체 가능하므로 순서 교환이 가능하다.

---

## 3. 리소스 예산 계획

### 3.1 교대 실행 모드별 메모리 예산

| 모드 | 실행 서비스 | 메모리 소요 | 가용 여유 |
|------|------------|-----------|---------|
| Dev 모드 | PG + Redis + Traefik + App x3 + Claude Code | ~6.5GB | ~3.5GB |
| CI 모드 | PG + GitLab Runner + SonarQube | ~6.0GB | ~4.0GB |
| Deploy 테스트 모드 | PG + Redis + K8s + Traefik + ArgoCD | ~5.0GB | ~5.0GB |
| AI 실험 모드 | PG + Redis + Traefik + AI Adapter + Ollama(7B) | ~8.0GB | ~2.0GB |

> WSL 상한: 10GB. 상기 수치는 idle 기준이며 빌드/테스트 시 일시적으로 +1~2GB 증가한다.

### 3.2 서비스별 리소스 할당 계획

| 서비스 | 메모리 Request | 메모리 Limit | CPU Request | CPU Limit | 비고 |
|--------|--------------|------------|------------|---------|------|
| WSL2 커널 + systemd | — | ~300MB | — | — | 고정 |
| Docker Engine | — | ~200MB | — | — | 고정 |
| Claude Code + MCP | — | ~400MB | — | — | 4개 서버 기준 |
| PostgreSQL | 64Mi | 128Mi | 100m | 500m | K8s 외부 Docker Compose |
| Redis | 32Mi | 64Mi | 50m | 200m | Sprint 1 추가 예정 |
| K8s 컴포넌트 | — | ~500MB | — | — | API server, etcd, scheduler |
| **Traefik** | 64Mi | 128Mi | 100m | 500m | Helm values로 제한 |
| **ArgoCD** (합산) | 256Mi | 512Mi | 100m | 500m | server + repo-server + app-controller |
| **GitLab Runner** | 256Mi | 512Mi | 200m | 1000m | K8s Executor (gitlab-runner NS) |
| **SonarQube** | 512Mi | 2Gi | 200m | 1000m | CI 모드에서만 실행 |
| App 서비스 x3 | 128Mi x3 | 512Mi x3 | 100m x3 | 500m x3 | Sprint 1~ |

### 3.3 K8s ResourceQuota 계획 (rummikub namespace)

```yaml
# helm/rummikub/templates/resource-quota.yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: rummikub-quota
  namespace: rummikub
spec:
  hard:
    requests.cpu: "2"
    requests.memory: 2Gi
    limits.cpu: "4"
    limits.memory: 4Gi
    pods: "20"
```

---

## 4. Traefik 설치 체크리스트

### 4.1 사전 확인

```bash
# K8s 클러스터 정상 동작 확인
kubectl cluster-info

# 노드 Ready 상태 확인
kubectl get nodes

# 기존 Ingress Controller 없는지 확인 (충돌 방지)
kubectl get pods --all-namespaces | grep -E "ingress|nginx"

# 현재 메모리 여유 확인 (2GB 이상 필요)
free -h
```

### 4.2 Step 1 — Helm Repository 추가

```bash
# Traefik 공식 Helm 저장소 추가
helm repo add traefik https://traefik.github.io/charts

# 저장소 목록 갱신
helm repo update

# 추가 확인
helm repo list | grep traefik

# 최신 차트 버전 확인
helm search repo traefik/traefik --versions | head -5
```

### 4.3 Step 2 — Namespace 생성

```bash
# traefik 네임스페이스 생성
kubectl create namespace traefik

# 생성 확인
kubectl get namespace traefik
```

### 4.4 Step 3 — Helm values 파일 준비

아래 파일을 `helm/traefik/values.yaml`에 작성한다 (디렉토리가 없으면 먼저 생성).

```bash
mkdir -p helm/traefik
```

```yaml
# helm/traefik/values.yaml
# Traefik v3.x — RummiArena 로컬 개발 환경 최적화

# 단일 노드 환경
deployment:
  replicas: 1

# 리소스 제한 (16GB RAM, WSL 10GB 기준)
resources:
  requests:
    cpu: "100m"
    memory: "64Mi"
  limits:
    cpu: "500m"
    memory: "128Mi"

# 진입점 포트 설정
ports:
  web:
    port: 8000
    expose:
      default: true
    exposedPort: 80
    protocol: TCP
  websecure:
    port: 8443
    expose:
      default: true
    exposedPort: 443
    protocol: TCP
  # Traefik Dashboard 전용 포트
  traefik:
    port: 9000
    expose:
      default: false    # 외부 미노출 (port-forward로 접근)
    exposedPort: 9000
    protocol: TCP

# Dashboard 활성화 (개발 환경)
ingressRoute:
  dashboard:
    enabled: true
    matchRule: Host(`traefik.localhost`)
    # 개발 환경: 인증 없음 (운영 시 basicAuth 미들웨어 추가 필수)
    entryPoints: ["traefik"]

# API 및 Dashboard 활성화
api:
  dashboard: true
  insecure: true      # 로컬 전용. 운영에서는 false

# 로그 설정
logs:
  general:
    level: INFO
  access:
    enabled: true
    format: json

# Kubernetes 프로바이더 설정
providers:
  kubernetesIngress:
    enabled: true
    # IngressClass 이름
    ingressClass: traefik
  kubernetesGateway:
    enabled: true      # Gateway API 호환 (차세대 표준 대비)

# 서비스 타입 (Docker Desktop K8s에서 LoadBalancer = localhost)
service:
  type: LoadBalancer

# Health/Readiness Probe
readinessProbe:
  httpGet:
    path: /ping
    port: 9000
  initialDelaySeconds: 5
  periodSeconds: 10

livenessProbe:
  httpGet:
    path: /ping
    port: 9000
  initialDelaySeconds: 15
  periodSeconds: 20
```

### 4.5 Step 4 — Traefik 설치

```bash
# 설치 (dry-run으로 먼저 확인)
helm install traefik traefik/traefik \
  --namespace traefik \
  --values helm/traefik/values.yaml \
  --dry-run

# 실제 설치
helm install traefik traefik/traefik \
  --namespace traefik \
  --values helm/traefik/values.yaml

# 설치 상태 확인
helm status traefik -n traefik
```

### 4.6 Step 5 — Traefik 검증

```bash
# Pod 상태 (Running이어야 함)
kubectl get pods -n traefik

# Service 상태 (EXTERNAL-IP가 localhost 또는 <pending>이 아닌 경우 확인)
kubectl get svc -n traefik

# Pod 상세 (문제 발생 시)
kubectl describe pod -n traefik -l app.kubernetes.io/name=traefik

# Dashboard 접속 (port-forward)
kubectl port-forward -n traefik svc/traefik 9000:9000
# 브라우저: http://localhost:9000/dashboard/

# 또는 matchRule로 설정된 Host 기반 접근
# /etc/hosts에 추가: 127.0.0.1 traefik.localhost
# 브라우저: http://traefik.localhost/dashboard/
```

### 4.7 Traefik 설치 체크리스트 표

| 단계 | 작업 | 확인 |
|------|------|------|
| 1 | `helm repo add traefik` 완료 | `[ ]` |
| 2 | `kubectl create namespace traefik` 완료 | `[ ]` |
| 3 | `helm/traefik/values.yaml` 작성 완료 | `[ ]` |
| 4 | `helm install traefik` 완료 (에러 없음) | `[ ]` |
| 5 | `kubectl get pods -n traefik` → Running | `[ ]` |
| 6 | Dashboard 접속 성공 (http://localhost:9000/dashboard/) | `[ ]` |
| 7 | `/etc/hosts`에 `traefik.localhost` 추가 | `[ ]` |

---

## 5. ArgoCD 설치 체크리스트

### 5.1 사전 확인

```bash
# Traefik이 먼저 Running인지 확인
kubectl get pods -n traefik

# 여유 메모리 확인 (ArgoCD: ~300~500MB 추가 소요)
free -h

# argocd namespace 없는지 확인
kubectl get namespace argocd 2>/dev/null || echo "namespace not found (OK)"
```

### 5.2 Step 1 — Helm Repository 추가

```bash
# ArgoCD 공식 Helm 저장소 추가
helm repo add argo https://argoproj.github.io/argo-helm
helm repo update

# 최신 차트 버전 확인
helm search repo argo/argo-cd --versions | head -5
```

### 5.3 Step 2 — ArgoCD values 파일 준비

```bash
mkdir -p helm/argocd
```

```yaml
# helm/argocd/values.yaml
# ArgoCD — RummiArena 로컬 개발 환경 최적화

# 서버 설정
server:
  # 로컬 개발 환경: insecure 모드 (TLS 종단은 Traefik에서)
  extraArgs:
    - --insecure
  service:
    type: ClusterIP    # Traefik IngressRoute로 외부 노출
  resources:
    requests:
      cpu: 50m
      memory: 64Mi
    limits:
      cpu: 500m
      memory: 256Mi

# Repo Server (Helm 렌더링 담당)
repoServer:
  resources:
    requests:
      cpu: 50m
      memory: 64Mi
    limits:
      cpu: 500m
      memory: 256Mi

# Application Controller
controller:
  resources:
    requests:
      cpu: 100m
      memory: 128Mi
    limits:
      cpu: 500m
      memory: 512Mi

# Redis (ArgoCD 내장)
redis:
  resources:
    requests:
      cpu: 50m
      memory: 32Mi
    limits:
      cpu: 200m
      memory: 64Mi

# ApplicationSet Controller (필요 시)
applicationSet:
  enabled: false    # 단순 환경에서는 비활성화 (메모리 절약)

# Notifications (카카오톡 연동은 추후 Sprint에서)
notifications:
  enabled: false    # 추후 활성화

# Dex (OIDC — Google OAuth 연동 추후)
dex:
  enabled: false    # Sprint 0에서는 비활성화

# 자동 Sync 기본 설정
configs:
  params:
    # 모든 앱에 automated sync 기본 적용
    application.instanceLabelKey: argocd.argoproj.io/app-name
```

### 5.4 Step 3 — ArgoCD 설치

```bash
# namespace 생성
kubectl create namespace argocd

# 설치 (dry-run 먼저)
helm install argocd argo/argo-cd \
  --namespace argocd \
  --values helm/argocd/values.yaml \
  --dry-run

# 실제 설치
helm install argocd argo/argo-cd \
  --namespace argocd \
  --values helm/argocd/values.yaml

# 설치 상태
helm status argocd -n argocd
```

### 5.5 Step 4 — 초기 비밀번호 확인 및 변경

```bash
# 초기 admin 비밀번호 확인
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d
echo

# 웹 UI 접속 (port-forward)
kubectl port-forward svc/argocd-server -n argocd 8443:80
# 브라우저: http://localhost:8443
# ID: admin / PW: 위에서 확인한 값

# ArgoCD CLI 로그인 (CLI 설치 후)
argocd login localhost:8443 --insecure --username admin

# 비밀번호 변경 (보안)
argocd account update-password \
  --current-password <초기비밀번호> \
  --new-password <새비밀번호>
```

### 5.6 Step 5 — ArgoCD Traefik IngressRoute 등록 (선택)

port-forward 없이 브라우저에서 접근하려면 Traefik IngressRoute를 등록한다.

```yaml
# argocd/ingress-route.yaml
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: argocd-server
  namespace: argocd
spec:
  entryPoints:
    - web
  routes:
    - match: Host(`argocd.localhost`)
      kind: Rule
      services:
        - name: argocd-server
          port: 80
```

```bash
# /etc/hosts 추가
echo "127.0.0.1 argocd.localhost" | sudo tee -a /etc/hosts

# IngressRoute 등록
kubectl apply -f argocd/ingress-route.yaml

# 브라우저: http://argocd.localhost
```

### 5.7 Step 6 — ArgoCD Application 등록

```yaml
# argocd/application.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: rummikub
  namespace: argocd
  annotations:
    argocd.argoproj.io/sync-wave: "0"
spec:
  project: default
  source:
    repoURL: https://github.com/k82022603/RummiArena.git
    targetRevision: main
    path: helm
    helm:
      valueFiles:
        - environments/dev-values.yaml
  destination:
    server: https://kubernetes.default.svc
    namespace: rummikub
  syncPolicy:
    automated:
      prune: true        # Git 삭제 리소스 → K8s도 삭제
      selfHeal: true     # 수동 변경 감지 시 자동 복구
    syncOptions:
      - CreateNamespace=true
      - PrunePropagationPolicy=foreground
```

```bash
# helm/ 디렉토리 구조가 준비된 후 Application 등록
kubectl apply -f argocd/application.yaml

# 상태 확인
kubectl get application -n argocd
```

### 5.8 ArgoCD 설치 체크리스트 표

| 단계 | 작업 | 확인 |
|------|------|------|
| 1 | `helm repo add argo` 완료 | `[ ]` |
| 2 | `kubectl create namespace argocd` 완료 | `[ ]` |
| 3 | `helm/argocd/values.yaml` 작성 완료 | `[ ]` |
| 4 | `helm install argocd` 완료 (에러 없음) | `[ ]` |
| 5 | 모든 ArgoCD Pod Running 확인 | `[ ]` |
| 6 | 초기 비밀번호 확인 및 변경 | `[ ]` |
| 7 | 웹 UI 접속 성공 | `[ ]` |
| 8 | `argocd/application.yaml` 작성 완료 | `[ ]` |
| 9 | Application 등록 및 Synced 상태 확인 | `[ ]` |

---

## 6. GitLab Runner 및 CI/CD 파이프라인 (2026-04-03 현행화)

### 6.1 현재 상태 (Pipeline #96 17/17 ALL GREEN)

| 항목 | 값 |
|------|-----|
| Runner ID | 52262488 |
| Runner 이름 | rummiarena-k8s-runner |
| Executor | **kubernetes** (gitlab-runner namespace) |
| Runner 버전 | 18.9.0 |
| 태그 | `k8s`, `rummiarena` |
| 상태 | **online** |
| 빌드 도구 | **Kaniko v1.23.2** (DinD 대체, 2026-04-03~) |
| 파이프라인 | **17/17 ALL GREEN** (Pipeline #96, 2026-04-03) |
| Pipeline URL | https://gitlab.com/k82022603/RummiArena/-/pipelines/2427283301 |

> **DinD -> Kaniko 전환**: K8s Executor는 `privileged=false` 보안 정책으로 DinD가 불가하다. Kaniko는 Docker daemon 없이 userspace에서 이미지를 빌드하므로 privileged 권한이 불필요하다. 상세: [14-ci-operations-manual.md](../03-development/14-ci-operations-manual.md)

### 6.2 파이프라인 구조 (17개 Job)

```mermaid
flowchart LR
    subgraph Lint["Lint (병렬 4 jobs)"]
        LG["lint-go"]
        LN["lint-nest"]
        LF["lint-frontend"]
        LA["lint-admin"]
    end

    subgraph Test["Test (병렬 2 jobs)"]
        TG["test-go"]
        TN["test-nest"]
    end

    subgraph Quality["Quality (병렬 2 jobs)"]
        SQ["sonarqube"]
        TR["trivy-fs"]
    end

    subgraph Build["Build (Kaniko + Trivy)"]
        direction TB
        subgraph P1["Phase 1 (병렬)"]
            BGS["build-game-server"]
            BAI["build-ai-adapter"]
        end
        subgraph P2["Phase 2 (후속)"]
            BFE["build-frontend"]
            BAD["build-admin"]
        end
        subgraph Scan["Image Scan"]
            S1["scan-game-server"]
            S2["scan-ai-adapter"]
            S3["scan-frontend"]
            S4["scan-admin"]
        end
        P1 --> P2
    end

    UG["update-gitops"]

    Lint --> Test --> Quality --> Build --> UG
```

### 6.3 빌드 전략: Kaniko + Phase 직렬화

| 항목 | DinD (이전) | Kaniko (현재) |
|------|-----------|-------------|
| Docker daemon | 필요 (privileged 필수) | **불필요** (userspace 빌드) |
| 보안 | privileged container 필요 | **rootless**, 권한 상승 불필요 |
| 메모리 | ~512MB+ (dockerd) | **~300MB** (executor) |
| 캐시 | `--cache-from` (이미지 pull) | `--cache-repo` (Registry 레이어 캐시) |
| 인증 | `docker login` | `/kaniko/.docker/config.json` |
| 이미지 | `docker:26-dind` | `gcr.io/kaniko-project/executor:v1.23.2-debug` |
| Trivy 스캔 | 동일 job 내 docker socket | **별도 job** (Registry 풀링) |

**Phase 1/2 직렬화**: 4개 Kaniko 빌드가 동시 Registry push 시 대역폭 경쟁으로 타임아웃 발생. Phase 1(game-server+ai-adapter) 완료 후 Phase 2(frontend+admin) 시작.

### 6.4 CI/CD Variables 현재 상태

GitLab 레포 > Settings > CI/CD > Variables:

| 변수명 | 상태 | Masked | Protected | 비고 |
|-------|------|--------|-----------|------|
| `SONAR_HOST_URL` | SET | No | No | `http://host.docker.internal:9001` |
| `SONAR_TOKEN` | SET | Yes | No | SonarQube 분석 토큰 |
| `GITOPS_TOKEN` | SET | Yes | No | GitHub PAT (GitOps repo push) |
| `CI_REGISTRY_USER` | 자동 | - | - | GitLab 자동 제공 |
| `CI_REGISTRY_PASSWORD` | 자동 | - | - | GitLab 자동 제공 |

### 6.5 Container Registry

| 리포지토리 | 경로 | 최종 빌드 |
|------------|------|-----------|
| game-server | `registry.gitlab.com/k82022603/rummiarena/game-server` | Pipeline #96 |
| ai-adapter | `registry.gitlab.com/k82022603/rummiarena/ai-adapter` | Pipeline #96 |
| frontend | `registry.gitlab.com/k82022603/rummiarena/frontend` | Pipeline #96 |
| admin | `registry.gitlab.com/k82022603/rummiarena/admin` | Pipeline #96 |
| cache | `registry.gitlab.com/k82022603/rummiarena/cache` | Kaniko 레이어 캐시 |

### 6.6 GitLab Runner / CI 체크리스트 (2026-04-03 최종)

| 단계 | 작업 | 확인 |
|------|------|------|
| 1 | GitLab 레포 생성 (gitlab.com SaaS) | `[x]` |
| 2 | GitLab Runner K8s Executor 배포 (gitlab-runner NS) | `[x]` |
| 3 | Runner 태그 `k8s`, `rummiarena` 설정 | `[x]` |
| 4 | CI/CD Variables 등록 (SONAR_HOST_URL, SONAR_TOKEN, GITOPS_TOKEN) | `[x]` |
| 5 | `.gitlab-ci.yml` 17개 Job 구성 완료 | `[x]` |
| 6 | lint 4/4 PASS | `[x]` |
| 7 | test 2/2 PASS | `[x]` |
| 8 | quality 2/2 PASS (SonarQube + Trivy FS) | `[x]` |
| 9 | build 4/4 PASS (Kaniko + Phase 직렬화) | `[x]` |
| 10 | scan 4/4 PASS (Trivy Image) | `[x]` |
| 11 | update-gitops 1/1 PASS | `[x]` |
| 12 | **17/17 ALL GREEN** (Pipeline #96) | `[x]` |

---

## 7. helm/ 디렉토리 구조 준비

Traefik/ArgoCD 설치 전에 `helm/` 디렉토리 뼈대를 먼저 만들어야 한다.

### 7.1 목표 디렉토리 구조

```
helm/
├── Chart.yaml                    # Umbrella Chart
├── values.yaml                   # 공통 기본값
├── charts/
│   ├── game-server/
│   │   ├── Chart.yaml
│   │   ├── values.yaml
│   │   └── templates/
│   │       ├── deployment.yaml
│   │       ├── service.yaml
│   │       ├── ingress.yaml
│   │       ├── configmap.yaml
│   │       ├── hpa.yaml          # HorizontalPodAutoscaler
│   │       └── resource-quota.yaml
│   ├── frontend/
│   ├── ai-adapter/
│   ├── redis/
│   ├── postgres/
│   ├── ollama/
│   ├── admin/
│   └── rummikub/                 # 공통 리소스 (ResourceQuota)
├── environments/
│   ├── dev-values.yaml           # 개발 환경 overrides (CI가 이미지 태그 자동 업데이트)
│   └── prod-values.yaml          # 운영 환경 overrides (미래)
├── traefik/
│   └── values.yaml               # Traefik 전용 values
└── argocd/
    └── values.yaml               # ArgoCD 전용 values
```

### 7.2 Umbrella Chart.yaml

```yaml
# helm/Chart.yaml
apiVersion: v2
name: rummikub
description: RummiArena 멀티 LLM 루미큐브 전략 실험 플랫폼
type: application
version: 0.1.0
appVersion: "0.1.0"

dependencies:
  - name: game-server
    version: "0.1.0"
    repository: "file://charts/game-server"
  - name: frontend
    version: "0.1.0"
    repository: "file://charts/frontend"
  - name: ai-adapter
    version: "0.1.0"
    repository: "file://charts/ai-adapter"
```

### 7.3 dev-values.yaml 기본 구조

```yaml
# helm/environments/dev-values.yaml
global:
  environment: dev
  imageTag: latest
  imagePullPolicy: IfNotPresent

gameServer:
  replicas: 1
  image:
    repository: registry.gitlab.com/k82022603/rummiarena/game-server
    tag: latest
  resources:
    requests:
      cpu: "100m"
      memory: "128Mi"
    limits:
      cpu: "500m"
      memory: "512Mi"
  env:
    LOG_LEVEL: debug
    AI_ADAPTER_URL: "http://ai-adapter:8081"

aiAdapter:
  replicas: 1
  image:
    repository: registry.gitlab.com/k82022603/rummiarena/ai-adapter
    tag: latest
  resources:
    requests:
      cpu: "100m"
      memory: "128Mi"
    limits:
      cpu: "500m"
      memory: "512Mi"
  env:
    MAX_RETRIES: "3"
    TIMEOUT_MS: "10000"

frontend:
  replicas: 1
  image:
    repository: registry.gitlab.com/k82022603/rummiarena/frontend
    tag: latest
  resources:
    requests:
      cpu: "50m"
      memory: "64Mi"
    limits:
      cpu: "300m"
      memory: "256Mi"
```

---

## 8. 롤백 절차

### 8.1 Traefik 롤백

```bash
# Helm 릴리스 이력 확인
helm history traefik -n traefik

# 이전 버전으로 롤백
helm rollback traefik 1 -n traefik

# 또는 완전 삭제 후 재설치
helm uninstall traefik -n traefik
kubectl delete namespace traefik
# → Step 4.2부터 재시작
```

### 8.2 ArgoCD 롤백

```bash
# Helm 이력 확인
helm history argocd -n argocd

# 이전 버전으로 롤백
helm rollback argocd 1 -n argocd

# 완전 삭제 후 재설치
helm uninstall argocd -n argocd
kubectl delete namespace argocd
# → Step 5.2부터 재시작
```

> ArgoCD 삭제 시 등록된 Application도 모두 삭제된다. `argocd/application.yaml`이 Git에 저장되어 있으면 재설치 후 `kubectl apply -f argocd/application.yaml`로 복구 가능하다.

### 8.3 GitLab Runner 롤백

```bash
# Runner Pod 재시작 (K8s Executor)
kubectl rollout restart deploy/gitlab-runner -n gitlab-runner

# Runner Pod 상태 확인
kubectl get pods -n gitlab-runner

# Runner 로그 확인
kubectl logs -n gitlab-runner -l app=gitlab-runner --tail=50
```

### 8.4 K8s 클러스터 전체 리셋

> 최후 수단. 모든 K8s 리소스가 삭제된다.

```
Docker Desktop > Settings > Kubernetes > Reset Kubernetes Cluster
```

리셋 후 재설치 순서:
1. 네임스페이스 재생성
2. Traefik 재설치
3. ArgoCD 재설치
4. ArgoCD Application 재등록

### 8.5 롤백 의사결정 트리

```mermaid
flowchart TB
    Issue["문제 발생"] --> What{"어느 서비스?"}

    What -->|Traefik| TCheck["kubectl describe pod -n traefik"]
    What -->|ArgoCD| ACheck["kubectl describe pod -n argocd"]
    What -->|Runner| RCheck["kubectl logs -n gitlab-runner\n-l app=gitlab-runner"]

    TCheck --> TFix{"수정 가능?"}
    TFix -->|values 오류| TValFix["values.yaml 수정 후\nhelm upgrade"]
    TFix -->|심각한 오류| TRoll["helm rollback traefik N -n traefik"]
    TRoll --> TWorking{"복구됨?"}
    TWorking -->|No| TDelete["helm uninstall → 재설치"]

    ACheck --> AFix{"수정 가능?"}
    AFix -->|values 오류| AValFix["values.yaml 수정 후\nhelm upgrade"]
    AFix -->|심각한 오류| ARoll["helm rollback argocd N -n argocd"]
    ARoll --> AWorking{"복구됨?"}
    AWorking -->|No| ADelete["helm uninstall → 재설치"]

    RCheck --> RFix{"등록 문제?"}
    RFix -->|토큰 만료| RRereg["Runner 재등록"]
    RFix -->|Pod 오류| RRestart["kubectl rollout restart\ndeploy/gitlab-runner -n gitlab-runner"]
```

---

## 9. 네임스페이스 전체 생성 스크립트

설치 시작 전에 한 번에 모든 네임스페이스를 생성한다.

```bash
# Phase 1 필수 네임스페이스
kubectl create namespace traefik    2>/dev/null || echo "traefik already exists"
kubectl create namespace argocd     2>/dev/null || echo "argocd already exists"
kubectl create namespace rummikub   2>/dev/null || echo "rummikub already exists"
kubectl create namespace sonarqube  2>/dev/null || echo "sonarqube already exists"

# Phase 5 예약 (지금 생성해도 무방)
kubectl create namespace istio-system  2>/dev/null || echo "istio-system already exists"
kubectl create namespace monitoring    2>/dev/null || echo "monitoring already exists"

# 전체 확인
kubectl get namespaces
```

---

## 10. /etc/hosts 설정

Docker Desktop K8s에서 로컬 도메인으로 접근하려면 `/etc/hosts`에 추가한다.

```bash
# WSL2 내부에서
sudo tee -a /etc/hosts <<EOF
# RummiArena 로컬 개발 환경
127.0.0.1 traefik.localhost
127.0.0.1 argocd.localhost
127.0.0.1 rummikub.localhost
EOF

# Windows hosts 파일에도 추가 (브라우저에서 접근 시)
# C:\Windows\System32\drivers\etc\hosts (관리자 권한)
# 127.0.0.1 traefik.localhost
# 127.0.0.1 argocd.localhost
# 127.0.0.1 rummikub.localhost
```

---

## 11. 전체 설치 완료 검증

모든 설치가 완료된 후 아래 항목을 확인한다.

```bash
# 전체 Pod 상태 (모두 Running이어야 함)
kubectl get pods --all-namespaces

# 메모리 사용량 (10GB 초과 시 교대 실행 전략 적용)
free -h

# Helm 릴리스 목록
helm list --all-namespaces

# ArgoCD Application 상태 (Synced + Healthy)
kubectl get application -n argocd

# Traefik 라우터 목록 (Dashboard)
# http://localhost:9000/dashboard/#/http/routers
```

### 최종 체크리스트 (2026-04-03 기준)

| 항목 | 확인 |
|------|------|
| `traefik` namespace + Pod Running | `[x]` |
| `argocd` namespace + 모든 Pod Running | `[x]` |
| `rummikub` namespace + 서비스 7개 Running | `[x]` |
| `gitlab-runner` namespace + Runner Pod Running | `[x]` |
| Traefik Dashboard 접속 성공 | `[x]` |
| ArgoCD 웹 UI 접속 성공 | `[x]` |
| ArgoCD Application 등록 (Synced) | `[x]` |
| GitLab Runner online (ID: 52262488, K8s Executor) | `[x]` |
| CI/CD 파이프라인 **17/17 ALL GREEN** (Pipeline #96) | `[x]` |
| Container Registry 4개 이미지 push 완료 | `[x]` |
| update-gitops → dev-values.yaml 태그 업데이트 | `[x]` |
| WSL 메모리 10GB 이하 유지 | `[x]` |
| `kp-*` 컨테이너 영향 없음 확인 | `[x]` |

---

## 12. 참고 문서

| 문서 | 내용 |
|------|------|
| `docs/05-deployment/01-local-infra-guide.md` | 로컬 인프라 전체 구성 |
| `docs/05-deployment/02-gateway-architecture.md` | Traefik 선정 근거 및 배포 계획 |
| `docs/00-tools/01-docker-desktop.md` | Docker Desktop K8s 활성화 |
| `docs/00-tools/02-kubernetes.md` | kubectl 사용법 |
| `docs/00-tools/03-helm.md` | Helm Chart 관리 |
| `docs/00-tools/05-gitlab-ci.md` | GitLab CI 파이프라인 |
| `docs/00-tools/06-argocd.md` | ArgoCD GitOps |
| `docs/00-tools/07-sonarqube.md` | SonarQube 설치 |
| `docs/00-tools/23-wslconfig.md` | WSL 프로파일 관리 |
| `docs/03-development/13-cicd-readiness-checklist.md` | CI/CD 준비 체크리스트 (17/17 GREEN) |
| `docs/03-development/14-ci-operations-manual.md` | CI/CD 운영 매뉴얼 (트러블슈팅) |
| `docs/03-development/11-devsecops-cicd-guide.md` | DevSecOps CI/CD 구조 가이드 |

---

> **문서 이력**
> | 버전 | 날짜 | 작성자 | 내용 |
> |------|------|--------|------|
> | 1.0 | 2026-03-12 | DevOps Agent | 초안 작성 (현황 점검, 설치 체크리스트, 롤백 절차) |
> | 1.1 | 2026-03-23 | DevOps Agent | Sprint 4 현행화 -- Pod 상태, Helm/ArgoCD 실측 반영 |
> | 2.0 | 2026-04-03 | DevOps Agent | Pipeline #96 17/17 ALL GREEN 반영 -- GitLab Runner K8s Executor, DinD->Kaniko 전환, 빌드 직렬화, CI/CD Variables, Container Registry 현행화 |
