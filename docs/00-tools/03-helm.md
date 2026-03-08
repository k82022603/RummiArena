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
```
helm/
├── Chart.yaml              # Umbrella Chart 정의
├── values.yaml             # 기본 values
├── charts/
│   ├── game-server/
│   │   ├── Chart.yaml
│   │   ├── values.yaml
│   │   └── templates/
│   │       ├── deployment.yaml
│   │       ├── service.yaml
│   │       ├── ingress.yaml
│   │       └── configmap.yaml
│   ├── frontend/
│   ├── ai-adapter/
│   ├── redis/
│   └── postgres/
└── environments/
    ├── dev-values.yaml
    └── prod-values.yaml
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
```bash
# 설치
helm install rummikub helm/ -n rummikub -f helm/environments/dev-values.yaml

# 업그레이드
helm upgrade rummikub helm/ -n rummikub -f helm/environments/dev-values.yaml

# 삭제
helm uninstall rummikub -n rummikub

# 상태 확인
helm list -n rummikub
helm status rummikub -n rummikub
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

```yaml
# environments/dev-values.yaml
global:
  environment: dev
  imageTag: latest

gameServer:
  replicas: 1
  resources:
    limits:
      memory: 512Mi
      cpu: 500m

aiAdapter:
  timeout: 10000
  maxRetries: 3
```

## 6. 트러블슈팅

| 문제 | 해결 |
|------|------|
| `Error: INSTALLATION FAILED` | `helm template`로 렌더링 확인 |
| values 반영 안 됨 | `-f` 파일 경로 확인, `helm get values` 확인 |
| Chart 의존성 에러 | `helm dependency update` 실행 |

## 7. 참고 링크
- 공식 문서: https://helm.sh/docs/
- Chart 개발 가이드: https://helm.sh/docs/chart_template_guide/
