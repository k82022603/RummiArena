# Helm 매뉴얼

## 1. 개요
Kubernetes 패키지 매니저. Chart로 앱 배포 템플릿 관리.
ArgoCD가 이 Helm Chart를 감시하여 GitOps 배포 수행.

## 2. 설치
```bash
# Windows (winget)
winget install Helm.Helm

# 또는 WSL2
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

# 확인
helm version
```

## 3. 프로젝트 Helm 구조

> **현재 상태 (Sprint 1, 2026-03-13)**: 5개 서비스 Helm chart + 인프라 chart 배포 완료.

```
helm/
├── Chart.yaml              # Umbrella Chart 정의 (5개 서비스 의존성)
├── deploy.sh               # 배포 스크립트
├── charts/
│   ├── game-server/        # Go 게임 서버 (NodePort 30080)
│   │   ├── Chart.yaml
│   │   ├── values.yaml
│   │   └── templates/
│   │       ├── deployment.yaml
│   │       ├── service.yaml
│   │       ├── configmap.yaml
│   │       └── secret.yaml
│   ├── frontend/           # Next.js 프론트엔드 (NodePort 30000)
│   ├── ai-adapter/         # NestJS AI 어댑터 (NodePort 30081)
│   ├── redis/              # Redis 7 (ClusterIP)
│   ├── postgres/           # PostgreSQL 16 (NodePort 30432)
│   ├── rummikub/           # 네임스페이스 리소스 (ResourceQuota)
│   │   └── templates/
│   │       └── resource-quota.yaml
│   ├── traefik/            # Traefik Ingress values
│   └── argocd/             # ArgoCD values
└── environments/
    └── dev-values.yaml     # 개발 환경 오버라이드
```

## 4. 주요 명령어

### Chart 관리
```bash
# 의존성 업데이트
helm dependency update helm/

# 템플릿 렌더링 확인 (실제 배포 없이)
helm template rummikub helm/ -f helm/environments/dev-values.yaml

# Lint (문법 검사)
helm lint helm/
```

### 배포 (수동, ArgoCD 없이 테스트할 때)

현재 프로젝트에서는 Umbrella Chart가 아닌 **서비스별 개별 Helm install**로 배포한다.

```bash
# 개별 서비스 설치 (현재 방식)
helm install postgres helm/charts/postgres -n rummikub
helm install redis helm/charts/redis -n rummikub
helm install game-server helm/charts/game-server -n rummikub
helm install ai-adapter helm/charts/ai-adapter -n rummikub
helm install frontend helm/charts/frontend -n rummikub

# 업그레이드 (특정 서비스)
helm upgrade game-server helm/charts/game-server -n rummikub

# 삭제
helm uninstall game-server -n rummikub

# 전체 상태 확인
helm list -n rummikub

# Umbrella Chart로 일괄 설치 (대안)
helm install rummikub helm/ -n rummikub -f helm/environments/dev-values.yaml
```

### 외부 Chart 저장소
```bash
# ArgoCD
helm repo add argo https://argoproj.github.io/argo-helm

# Prometheus/Grafana
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts

# SonarQube
helm repo add sonarqube https://SonarSource.github.io/helm-chart-sonarqube

# Istio
helm repo add istio https://istio-release.storage.googleapis.com/charts

helm repo update
```

## 5. values.yaml 환경 분리

각 서비스별 `values.yaml`에 리소스 제한, NodePort, 환경 변수 등이 정의되어 있다.

```yaml
# helm/charts/game-server/values.yaml (예시)
replicaCount: 1
image:
  repository: rummiarena/game-server
  tag: dev
  pullPolicy: Never
service:
  type: NodePort
  port: 8080
  nodePort: 30080
resources:
  requests:
    memory: "128Mi"
    cpu: "100m"
  limits:
    memory: "256Mi"
    cpu: "300m"
```

환경별 오버라이드는 `environments/dev-values.yaml`에서 관리한다 (ArgoCD 연동 시 활용).

## 6. 트러블슈팅

| 문제 | 해결 |
|------|------|
| `Error: INSTALLATION FAILED` | `helm template`로 렌더링 확인 |
| values 반영 안 됨 | `-f` 파일 경로 확인, `helm get values` 확인 |
| Chart 의존성 에러 | `helm dependency update` 실행 |

## 7. 참고 링크
- 공식 문서: https://helm.sh/docs/
- Chart 개발 가이드: https://helm.sh/docs/chart_template_guide/
