# Docker Desktop 매뉴얼

## 1. 개요

컨테이너 런타임 + 내장 Kubernetes 클러스터 제공.
이 프로젝트의 전체 인프라 기반.

## 2. 설치

### 2.1 사전 조건
- Windows 11
- WSL2 활성화
- Hyper-V 활성화 (Istio/VirtualBox 공존 가능)

### 2.2 설치 절차
1. https://www.docker.com/products/docker-desktop 에서 다운로드
2. 설치 후 Settings > General > **Use the WSL 2 based engine** 체크
3. Settings > Resources > WSL Integration > 사용할 WSL 배포판 활성화

### 2.3 Kubernetes 활성화
1. Settings > Kubernetes > **Enable Kubernetes** 체크
2. Apply & Restart
3. 확인: `kubectl cluster-info`

### 2.4 리소스 할당 (권장)
Settings > Resources:
| 항목 | 최소 | 권장 (Istio/Ollama 포함) |
|------|------|--------------------------|
| CPU | 4 cores | 6+ cores |
| Memory | 8 GB | 16 GB |
| Swap | 1 GB | 2 GB |
| Disk | 40 GB | 80 GB |

## 3. 프로젝트 설정

### 3.1 K8s 컨텍스트 확인
```bash
kubectl config current-context
# 출력: docker-desktop
```

### 3.2 네임스페이스 생성
```bash
kubectl create namespace rummikub
kubectl create namespace argocd
kubectl create namespace istio-system    # Phase 5
kubectl create namespace monitoring      # Phase 5
```

### 3.3 기본 네임스페이스 설정
```bash
kubectl config set-context --current --namespace=rummikub
```

## 4. 주요 명령어

```bash
# 클러스터 상태 확인
kubectl cluster-info
kubectl get nodes
kubectl top nodes                        # 리소스 사용량

# K8s 리셋 (문제 발생 시)
# Docker Desktop > Settings > Kubernetes > Reset Kubernetes Cluster
```

## 5. 트러블슈팅

| 문제 | 원인 | 해결 |
|------|------|------|
| K8s 시작 안 됨 | WSL2 미활성화 | `wsl --update` 실행 |
| Pod 생성 실패 (OOM) | 메모리 부족 | Settings에서 메모리 증가 |
| ImagePullBackOff | Registry 접근 불가 | Docker login 확인 |
| K8s stuck at "Starting" | 클러스터 손상 | Reset Kubernetes Cluster |

## 6. 참고 링크
- 공식 문서: https://docs.docker.com/desktop/
- K8s on Docker Desktop: https://docs.docker.com/desktop/kubernetes/
