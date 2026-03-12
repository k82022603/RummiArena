# Kubernetes (kubectl) 매뉴얼

## 1. 개요
Docker Desktop 내장 단일 노드 K8s 클러스터.
모든 서비스(게임 서버, AI Adapter, DB 등)를 Pod로 배포.

## 2. 설치
Docker Desktop에 내장. 별도 설치 불필요.
```bash
kubectl version --client
```

## 3. 프로젝트 네임스페이스
```bash
kubectl create namespace rummikub       # 앱 서비스
kubectl create namespace argocd         # ArgoCD
kubectl create namespace sonarqube      # SonarQube
kubectl create namespace istio-system   # Istio (Phase 5)
kubectl create namespace monitoring     # Prometheus/Grafana (Phase 5)
```

## 4. 주요 명령어

### 기본 조회
```bash
kubectl get pods -n rummikub
kubectl get svc -n rummikub
kubectl get deployments -n rummikub
kubectl get all -n rummikub
```

### 로그 확인
```bash
kubectl logs <pod-name> -n rummikub
kubectl logs <pod-name> -n rummikub -f          # 실시간
kubectl logs <pod-name> -n rummikub --previous   # 이전 크래시
```

### 디버깅
```bash
kubectl describe pod <pod-name> -n rummikub
kubectl exec -it <pod-name> -n rummikub -- /bin/sh
kubectl top pods -n rummikub
```

### Secret 관리
```bash
# AI API Key 등록
kubectl create secret generic ai-api-keys -n rummikub \
  --from-literal=OPENAI_API_KEY=sk-xxx \
  --from-literal=ANTHROPIC_API_KEY=sk-ant-xxx \
  --from-literal=DEEPSEEK_API_KEY=sk-xxx

# Google OAuth
kubectl create secret generic google-oauth -n rummikub \
  --from-literal=CLIENT_ID=xxx \
  --from-literal=CLIENT_SECRET=xxx

# 카카오톡
kubectl create secret generic kakao-api -n rummikub \
  --from-literal=REST_API_KEY=xxx
```

### 포트 포워딩 (로컬 접속)
```bash
kubectl port-forward svc/frontend 3000:3000 -n rummikub
kubectl port-forward svc/game-server 8080:8080 -n rummikub
kubectl port-forward svc/argocd-server 8443:443 -n argocd
```

## 5. Traefik Ingress 설치

> NGINX Ingress Controller는 2026-03 EOL. Traefik으로 대체.
> 상세: `docs/05-deployment/02-gateway-architecture.md`

```bash
# Traefik Helm 저장소 추가
helm repo add traefik https://traefik.github.io/charts
helm repo update

# Namespace 생성
kubectl create namespace traefik

# Traefik 설치 (커스텀 values)
helm install traefik traefik/traefik \
  --namespace traefik \
  --values helm/traefik/values.yaml

# 확인
kubectl get pods -n traefik
kubectl get svc -n traefik
```

## 6. 트러블슈팅

| 문제 | 명령어 |
|------|--------|
| Pod 상태 확인 | `kubectl describe pod <name>` |
| 이벤트 확인 | `kubectl get events -n rummikub --sort-by=.lastTimestamp` |
| DNS 확인 | `kubectl run tmp --rm -it --image=busybox -- nslookup game-server.rummikub.svc.cluster.local` |
| 리소스 부족 | `kubectl top nodes && kubectl top pods -A` |

## 6. 참고 링크
- kubectl 치트시트: https://kubernetes.io/docs/reference/kubectl/cheatsheet/
- K8s 개념: https://kubernetes.io/docs/concepts/
