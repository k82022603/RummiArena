# ArgoCD 매뉴얼

## 1. 개요
GitOps 기반 CD(Continuous Delivery) 도구.
Git 저장소의 Helm Chart 상태를 감시하여 K8s 클러스터에 자동 배포.
CI(GitLab)는 빌드만, CD(ArgoCD)는 배포만 담당.

## 2. 설치

### 2.1 Helm으로 설치
```bash
helm repo add argo https://argoproj.github.io/argo-helm
helm repo update

helm install argocd argo/argo-cd \
  --namespace argocd \
  --create-namespace \
  --set server.service.type=NodePort
```

### 2.2 초기 비밀번호 확인
```bash
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
```

### 2.3 웹 UI 접속
```bash
kubectl port-forward svc/argocd-server -n argocd 8443:443
# 브라우저에서 https://localhost:8443
# ID: admin / PW: 위에서 확인한 비밀번호
```

### 2.4 CLI 설치 (선택)
```bash
# Windows
winget install argoproj.argocd

# WSL2
curl -sSL -o argocd https://github.com/argoproj/argo-cd/releases/latest/download/argocd-linux-amd64
chmod +x argocd && sudo mv argocd /usr/local/bin/
```

## 3. 프로젝트 Application 설정

### 3.1 Application YAML
```yaml
# argocd/application.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: rummikub
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/k82022603/RummiArena.git  # 또는 GitOps 레포
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
      prune: true        # Git에서 삭제된 리소스 K8s에서도 삭제
      selfHeal: true     # 수동 변경 감지 시 자동 복구
    syncOptions:
      - CreateNamespace=true
```

### 3.2 Application 등록
```bash
kubectl apply -f argocd/application.yaml
```

## 4. 주요 명령어

```bash
# 로그인
argocd login localhost:8443 --insecure

# 앱 목록
argocd app list

# 앱 상태
argocd app get rummikub

# 수동 Sync
argocd app sync rummikub

# 롤백
argocd app rollback rummikub

# Diff 확인 (Git vs 클러스터)
argocd app diff rummikub
```

## 5. GitOps 워크플로우

```
1. 개발자가 코드 Push (GitHub)
2. GitLab CI가 빌드 → 이미지 Push → GitOps 레포 values.yaml 업데이트
3. ArgoCD가 GitOps 레포 변경 감지
4. Helm chart 기반 K8s 배포 (자동 Sync)
5. Sync 완료 → 카카오톡 알림 (Webhook)
```

## 6. 트러블슈팅

| 문제 | 해결 |
|------|------|
| OutOfSync 상태 유지 | `argocd app sync` 또는 `selfHeal: true` 확인 |
| 레포 접근 에러 | ArgoCD Settings > Repositories에서 인증 설정 |
| Helm 렌더링 에러 | `helm template` 로컬 확인 |
| 리소스 부족 | ArgoCD server/repo-server 리소스 limit 조정 |

## 7. 참고 링크
- 공식 문서: https://argo-cd.readthedocs.io/
- Helm + ArgoCD: https://argo-cd.readthedocs.io/en/stable/user-guide/helm/
