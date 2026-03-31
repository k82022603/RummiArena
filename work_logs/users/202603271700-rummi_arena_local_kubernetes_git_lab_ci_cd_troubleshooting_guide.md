# RummiArena 로컬 Kubernetes + GitLab CI/CD 문제 해결 가이드

---

## 🎯 목적

이 문서는 다음 환경에서 발생한 문제를 **근본적으로 해결**하기 위한 가이드입니다.

- Docker Desktop (WSL2)
- Kubernetes (docker-desktop)
- Helm 배포
- GitLab CI/CD (Container Registry 사용)
- 로컬 개발 모드 병행

---

# 🧨 문제 요약

## 1. ErrImageNeverPull

```
Container image is not present with pull policy of Never
```

### 원인

- `imagePullPolicy: Never`
- 하지만 Kubernetes 노드에 해당 이미지 없음

또는

- 이미지 이름 불일치

```
K8s: registry.gitlab.com/.../admin:latest
Local: docker.io/rummiarena/admin:dev
```

👉 완전히 다른 이미지로 인식됨

---

## 2. 일부 Pod만 Running, 일부는 실패

### 원인

- 롤링 업데이트 중 ReplicaSet 혼재

| 상태 | 원인 |
|------|------|
| Running | 새 이미지 사용 |
| ErrImageNeverPull | 이전 이미지 사용 |

---

## 3. Helm 설치 실패

```
ResourceQuota exists and cannot be imported
```

### 원인

- 기존 리소스가 Helm으로 생성되지 않음
- ownership metadata 없음

---

# 🧠 핵심 개념 정리

## Docker vs Kubernetes 이미지 인식

Kubernetes는 이미지 이름 기준으로만 판단

```
docker.io/rummiarena/admin:dev
≠
registry.gitlab.com/k82022603/rummiarena/admin:latest
```

👉 태그/레포지토리까지 완전히 일치해야 함

---

## imagePullPolicy 전략

| 정책 | 의미 |
|------|------|
| Always | 항상 pull |
| IfNotPresent | 없으면 pull |
| Never | 로컬에 있어야만 실행 |

👉 로컬 개발에서는 `Never` 사용 가능 (단, 이미지 반드시 존재해야 함)

---

# ✅ 해결 전략 (최적 방안)

---

## 🔧 1단계: 로컬 이미지 빌드

```bash
docker build -t docker.io/rummiarena/admin:dev ./src/admin
```

---

## 🔧 2단계: Helm values.yaml 수정

```yaml
image:
  repository: docker.io/rummiarena/admin
  tag: dev
  pullPolicy: Never
```

👉 핵심: **docker build 이미지와 완전 일치**

---

## 🔧 3단계: 기존 리소스 충돌 제거

```bash
kubectl delete resourcequota rummikub-quota -n rummikub
```

또는 (유지 시)

```bash
kubectl label resourcequota rummikub-quota app.kubernetes.io/managed-by=Helm -n rummikub
kubectl annotate resourcequota rummikub-quota meta.helm.sh/release-name=rummikub -n rummikub
kubectl annotate resourcequota rummikub-quota meta.helm.sh/release-namespace=rummikub -n rummikub
```

---

## 🔧 4단계: Helm 재배포

```bash
helm upgrade --install rummikub ./helm -n rummikub
```

---

## 🔧 5단계: Pod 확인

```bash
kubectl get pods -n rummikub
```

---

# 🔥 문제 해결 체크리스트

## ✔ 이미지 확인

```bash
docker images | grep rummiarena/admin
```

## ✔ K8s 설정 확인

```bash
kubectl get deployment admin -n rummikub -o yaml | grep image
```

👉 두 값이 반드시 동일해야 함

---

## ✔ Pod 재시작

```bash
kubectl delete pod -n rummikub -l app=admin
```

---

# 🚀 로컬 개발 Best Practice

## 전략 1: 로컬 전용

- imagePullPolicy: Never
- docker build → 즉시 반영

## 전략 2: 반실무 (추천)

- 로컬: Never
- CI/CD: Always

values 분리:

```bash
values-dev.yaml
values-prod.yaml
```

---

# 🌐 실무 확장 구조 (추천 아키텍처)

## GitLab CI/CD + Registry

1. GitLab CI
2. Docker build
3. GitLab Container Registry push
4. Kubernetes pull

---

## 실무용 Helm 설정

```yaml
image:
  repository: registry.gitlab.com/k82022603/rummiarena/admin
  tag: latest
  pullPolicy: Always
```

---

## private registry 인증

```bash
kubectl create secret docker-registry gitlab-regcred \
  --docker-server=registry.gitlab.com \
  --docker-username=YOUR_USER \
  --docker-password=YOUR_TOKEN
```

---

# 🧨 자주 발생하는 실수

| 문제 | 원인 |
|------|------|
| ErrImageNeverPull | 이미지 없음 |
| 계속 Pod 실패 | 이미지 이름 불일치 |
| Helm 실패 | 기존 리소스 충돌 |
| docker build 했는데 안됨 | K8s와 Docker context 다름 |

---

# 💡 핵심 요약

- Kubernetes는 이미지 이름 기준으로 동작
- 로컬 개발 시 imagePullPolicy=Never → 이미지 반드시 존재해야 함
- Helm 리소스는 ownership 관리 중요
- Docker Desktop 환경에서는 이미지 공유되지만 이름이 핵심

---

# 🏁 결론

현재 문제는 다음 두 가지의 결합:

1. 이미지 이름 불일치
2. Helm 리소스 ownership 충돌

👉 위 가이드를 따르면 **로컬 개발 + CI/CD 모두 안정적으로 운영 가능**

---

필요 시 다음 단계:

- ArgoCD 연동
- GitOps 구조 설계
- 멀티 환경 (dev/staging/prod) 분리

