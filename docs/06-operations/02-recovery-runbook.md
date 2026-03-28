# RummiArena 운영자 복구 매뉴얼 (Runbook)

> **대상**: Claude 없이 human 단독으로 인프라를 복구해야 하는 상황
> **작성일**: 2026-03-28
> **환경**: LG Gram 15Z90R (i7-1360P, RAM 16GB) / WSL2 / Docker Desktop K8s

---

## 목차

1. [빠른 참조 — 헬스체크 명령어](#1-빠른-참조--헬스체크-명령어)
2. [K8s 버전 복구](#2-k8s-버전-복구)
3. [docker-compose 버전 복구](#3-docker-compose-버전-복구)
4. [장애 유형별 체크리스트](#4-장애-유형별-체크리스트)
5. [Secret 값 레퍼런스](#5-secret-값-레퍼런스)

---

## 1. 빠른 참조 — 헬스체크 명령어

```bash
# K8s 전체 파드 상태
kubectl get pods -n rummikub

# 서비스 엔드포인트 확인
curl http://localhost:30080/health        # game-server
curl -I http://localhost:30000            # frontend (307 정상)
curl -I http://localhost:30001            # admin (200 정상)

# ArgoCD 상태
kubectl get application rummikub -n argocd

# docker-compose 상태
docker compose -f docker-compose.dev.yml ps
```

**K8s 정상 상태 기준**:

| 파드 | 기대 상태 | 포트 |
|------|-----------|------|
| postgres | Running | 30432 |
| redis | Running | (ClusterIP only) |
| game-server | Running | 30080 |
| ai-adapter | Running | 30081 |
| frontend | Running | 30000 |
| admin | Running | 30001 |
| ollama | Running | (ClusterIP only) |

---

## 2. K8s 버전 복구

### 2-1. 전제 조건

```bash
# Docker Desktop K8s 켜져 있는지 확인
kubectl cluster-info

# namespace 존재 확인
kubectl get ns rummikub
```

### 2-2. 이미지 빌드 (최초 또는 코드 변경 시)

K8s는 `imagePullPolicy: Never` 로 설정되어 있으므로 **반드시 로컬 Docker에 이미지가 있어야** 한다.

```bash
cd /mnt/d/Users/KTDS/Documents/06.과제/RummiArena

# game-server (Go)
docker build -t rummiarena/game-server:dev ./src/game-server

# ai-adapter (NestJS)
docker build -t rummiarena/ai-adapter:dev ./src/ai-adapter

# frontend (Next.js)
docker build -t rummiarena/frontend:dev ./src/frontend

# admin (Next.js)
docker build -t rummiarena/admin:dev ./src/admin
```

> **확인**: `docker images | grep rummiarena`

### 2-3. 전체 재배포 (Helm)

```bash
cd /mnt/d/Users/KTDS/Documents/06.과제/RummiArena

# Helm 업그레이드 (ArgoCD 없이 직접)
helm upgrade --install rummikub ./helm \
  -n rummikub \
  -f helm/environments/dev-values.yaml \
  --create-namespace
```

### 2-4. Secret 주입 (필수 — Helm으로 주입 안 되는 값)

**Helm이 secret을 빈 값으로 렌더링하므로, 배포 후 반드시 kubectl로 덮어써야 한다.**

```bash
# game-server-secret
kubectl patch secret game-server-secret -n rummikub \
  --type='json' \
  -p='[
    {"op":"replace","path":"/data/JWT_SECRET","value":"'"$(echo -n 'REDACTED_JWT_SECRET' | base64)"'"},
    {"op":"replace","path":"/data/DB_PASSWORD","value":"'"$(echo -n 'REDACTED_DB_PASSWORD' | base64)"'"}
  ]'

# frontend-secret
kubectl patch secret frontend-secret -n rummikub \
  --type='json' \
  -p='[{"op":"replace","path":"/data/NEXTAUTH_SECRET","value":"'"$(echo -n 'REDACTED_NEXTAUTH_SECRET' | base64)"'"}]'

# postgres-secret (CrashLoopBackOff 발생 시)
kubectl create secret generic postgres-secret \
  -n rummikub \
  --from-literal=POSTGRES_USER=rummikub \
  --from-literal=POSTGRES_PASSWORD=REDACTED_DB_PASSWORD \
  --from-literal=POSTGRES_DB=rummikub \
  --dry-run=client -o yaml | kubectl apply -f -
```

> **왜 이렇게 하나?** ArgoCD `selfHeal: true` 가 Helm으로 렌더링된 빈 값을 계속 적용한다.
> `argocd/application.yaml`의 `ignoreDifferences`가 이 필드들을 Drift 감지에서 제외시켜 kubectl 패치가 유지된다.

### 2-5. 파드 재시작

```bash
# 특정 서비스 재시작
kubectl rollout restart deployment/<서비스명> -n rummikub
# 예: kubectl rollout restart deployment/game-server -n rummikub

# 특정 파드만 삭제 (새 파드 자동 생성)
kubectl delete pod -n rummikub -l app=game-server

# 모든 파드 재시작 (주의: 순서 없이 동시 재시작)
kubectl rollout restart deployment --all -n rummikub
```

### 2-6. ArgoCD 조작

```bash
# ArgoCD 포트포워딩
kubectl port-forward svc/argocd-server -n argocd 8443:443 &

# 브라우저 접속: https://localhost:8443
# ID: admin / PW: REDACTED_ARGOCD_PASSWORD

# CLI로 강제 동기화
argocd app sync rummikub --server localhost:8443 --insecure

# ArgoCD 비밀번호 초기화 (분실 시)
argocd account bcrypt --password <새비밀번호>
kubectl -n argocd patch secret argocd-secret \
  -p '{"stringData": {
    "admin.password": "<bcrypt_hash>",
    "admin.passwordMtime": "'"$(date +%FT%T%Z)"'"
  }}'
kubectl rollout restart deployment argocd-server -n argocd
```

### 2-7. 자주 발생하는 장애 복구

#### PostgreSQL CrashLoopBackOff

```bash
# 원인 확인
kubectl logs -n rummikub -l app=postgres | tail -20

# 비밀번호 누락인 경우 → Secret 재생성
kubectl create secret generic postgres-secret \
  -n rummikub \
  --from-literal=POSTGRES_USER=rummikub \
  --from-literal=POSTGRES_PASSWORD=REDACTED_DB_PASSWORD \
  --from-literal=POSTGRES_DB=rummikub \
  --dry-run=client -o yaml | kubectl apply -f -

# PVC가 깨진 경우 → 데이터 초기화 (주의: DB 데이터 삭제됨)
kubectl delete pvc -n rummikub --all
# stuck PVC 강제 제거
kubectl patch pvc rummikub-pgdata -n rummikub -p '{"metadata":{"finalizers":null}}'
# 파드 재시작
kubectl delete pod -n rummikub -l app=postgres
```

#### game-server CrashLoopBackOff

```bash
# 로그 확인 (가장 먼저)
kubectl logs -n rummikub deployment/game-server --tail=30

# JWT_SECRET 누락인 경우
kubectl patch secret game-server-secret -n rummikub \
  --type='json' \
  -p='[{"op":"replace","path":"/data/JWT_SECRET","value":"'"$(echo -n 'REDACTED_JWT_SECRET' | base64)"'"}]'
kubectl delete pod -n rummikub -l app=game-server

# DB 연결 실패인 경우 — postgres 먼저 정상화 후 game-server 재시작
```

#### ErrImageNeverPull (admin / frontend)

```bash
# 원인 1: 로컬 Docker에 이미지 없음
docker images | grep rummiarena/<서비스>

# 해결: 이미지 빌드
docker build -t rummiarena/admin:dev ./src/admin
docker build -t rummiarena/frontend:dev ./src/frontend

# 원인 2: K8s Deployment가 다른 이미지명(예: registry.gitlab.com/...)을 참조
kubectl get deployment admin -n rummikub -o jsonpath='{.spec.template.spec.containers[0].image}'

# 해결: dev-values.yaml 확인 → 로컬 이미지명(rummiarena/...:dev)으로 수정 후 Helm 재배포
```

#### ResourceQuota 초과 (파드 생성 안 됨)

```bash
# 현황 확인
kubectl get resourcequota -n rummikub

# 불필요한 구 ReplicaSet 파드 정리
kubectl get rs -n rummikub               # 구 RS 확인
kubectl scale rs <old-rs-name> --replicas=0 -n rummikub

# 또는 종료된 파드 정리
kubectl delete pod --field-selector=status.phase=Succeeded -n rummikub
kubectl delete pod --field-selector=status.phase=Failed -n rummikub
```

#### frontend NEXTAUTH_SECRET 오류 (`NO_SECRET`)

```bash
# 로그 확인
kubectl logs -n rummikub deployment/frontend --tail=20

# Secret 주입
kubectl patch secret frontend-secret -n rummikub \
  --type='json' \
  -p='[{"op":"replace","path":"/data/NEXTAUTH_SECRET","value":"'"$(echo -n 'REDACTED_NEXTAUTH_SECRET' | base64)"'"}]'
kubectl rollout restart deployment/frontend -n rummikub
```

---

## 3. docker-compose 버전 복구

### 3-1. 환경 파일 준비

```bash
cd /mnt/d/Users/KTDS/Documents/06.과제/RummiArena

# .env 파일 생성 (없는 경우)
cat > .env << 'EOF'
POSTGRES_USER=rummikub
POSTGRES_PASSWORD=REDACTED_DB_PASSWORD
POSTGRES_DB=rummikub
REDIS_PASSWORD=
JWT_SECRET=REDACTED_JWT_SECRET
NEXTAUTH_SECRET=REDACTED_NEXTAUTH_SECRET
NEXTAUTH_URL=http://localhost:3000
ADMIN_NEXTAUTH_URL=http://localhost:3001
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
EOF

# ai-adapter 환경 파일 (OpenAI/Ollama 키 필요 시)
cp src/ai-adapter/.env.example src/ai-adapter/.env 2>/dev/null || \
cat > src/ai-adapter/.env << 'EOF'
OPENAI_API_KEY=
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_DEFAULT_MODEL=gemma3:1b
OPENAI_DEFAULT_MODEL=gpt-4o-mini
EOF
```

### 3-2. 전체 기동 (최초)

```bash
cd /mnt/d/Users/KTDS/Documents/06.과제/RummiArena

# 이미지 빌드 + 기동
docker compose -f docker-compose.dev.yml up --build -d

# 상태 확인
docker compose -f docker-compose.dev.yml ps
```

**접속 주소**:

| 서비스 | URL |
|--------|-----|
| game-server | http://localhost:8080 |
| ai-adapter | http://localhost:8081 |
| frontend | http://localhost:3000 |
| admin | http://localhost:3001 |
| postgres | localhost:5432 |

### 3-3. 재기동 (코드 변경 없이)

```bash
docker compose -f docker-compose.dev.yml restart
```

### 3-4. 특정 서비스만 재기동

```bash
docker compose -f docker-compose.dev.yml restart game-server
docker compose -f docker-compose.dev.yml restart frontend
```

### 3-5. 코드 변경 후 재빌드

```bash
# 특정 서비스만
docker compose -f docker-compose.dev.yml up --build -d game-server

# 전체 재빌드
docker compose -f docker-compose.dev.yml up --build -d
```

### 3-6. 로그 확인

```bash
# 실시간 로그
docker compose -f docker-compose.dev.yml logs -f game-server

# 마지막 50줄
docker compose -f docker-compose.dev.yml logs --tail=50 game-server

# 전체 서비스
docker compose -f docker-compose.dev.yml logs -f
```

### 3-7. 완전 초기화 (데이터 포함 삭제)

```bash
# 컨테이너 + 볼륨 삭제 (DB 데이터 삭제됨 — 주의!)
docker compose -f docker-compose.dev.yml down -v

# 이미지도 삭제
docker compose -f docker-compose.dev.yml down -v --rmi local
```

### 3-8. 자주 발생하는 장애 복구

#### postgres 기동 실패 (`POSTGRES_PASSWORD is required`)

```bash
# .env 파일 확인
cat .env | grep POSTGRES_PASSWORD

# .env에 값이 없으면 추가
echo "POSTGRES_PASSWORD=REDACTED_DB_PASSWORD" >> .env

# 재기동
docker compose -f docker-compose.dev.yml up -d postgres
```

#### game-server DB 연결 실패

```bash
# 로그 확인
docker compose -f docker-compose.dev.yml logs game-server | tail -30

# postgres 먼저 healthy 상태 확인
docker compose -f docker-compose.dev.yml ps postgres

# postgres가 healthy 되면 game-server 재시작
docker compose -f docker-compose.dev.yml restart game-server
```

#### 포트 충돌 (이미 사용 중)

```bash
# 포트 사용 프로세스 확인
ss -tlnp | grep 8080

# 기존 컨테이너 정리 후 재시작
docker compose -f docker-compose.dev.yml down
docker compose -f docker-compose.dev.yml up -d
```

#### 메모리 부족 (LG Gram 16GB 환경)

```bash
# 교대 실행 전략: K8s와 docker-compose 동시 실행 금지
# K8s 종료 후 docker-compose 사용

# K8s 파드 전체 스케일다운 (K8s 클러스터는 유지)
kubectl scale deployment --all --replicas=0 -n rummikub

# 또는 WSL 메모리 프로파일 전환
# ~/.wslconfig 수정 후 wsl --shutdown
```

---

## 4. 장애 유형별 체크리스트

### 체크리스트 A: "서비스가 안 켜진다"

```
□ kubectl get pods -n rummikub    # 파드 상태 확인
□ kubectl logs -n rummikub deployment/<서비스>  # 로그 확인
□ 이미지 존재 확인: docker images | grep rummiarena
□ Secret 값 확인: kubectl get secret <서비스>-secret -n rummikub -o yaml
□ ResourceQuota 확인: kubectl get resourcequota -n rummikub
```

### 체크리스트 B: "배포했는데 반영이 안 된다"

```
□ git push origin main 완료 여부
□ ArgoCD Sync 상태: kubectl get application rummikub -n argocd
□ ArgoCD 강제 Sync: argocd app sync rummikub (or UI에서 SYNC 버튼)
□ Helm 직접 적용: helm upgrade --install rummikub ./helm -n rummikub -f helm/environments/dev-values.yaml
```

### 체크리스트 C: "재시작 후 게임 상태가 날아갔다"

```
□ Redis 파드 확인: kubectl get pods -n rummikub -l app=redis
□ Redis 데이터 확인: kubectl exec -n rummikub -it <redis-pod> -- redis-cli keys "*"
□ game-server Redis 연결 확인: curl http://localhost:30080/health
□ → {"redis":true} 이면 정상
```

### 체크리스트 D: "ArgoCD UI 접속 안 됨"

```bash
# 포트포워딩 재시작
kubectl port-forward svc/argocd-server -n argocd 8443:443 &

# 파드 상태 확인
kubectl get pods -n argocd

# 비밀번호 재설정 (분실 시)
argocd account bcrypt --password REDACTED_ARGOCD_PASSWORD
# → bcrypt 해시 값 복사 후 아래 명령 실행
kubectl -n argocd patch secret argocd-secret \
  -p '{"stringData": {"admin.password": "<위에서복사한해시>", "admin.passwordMtime": "'"$(date +%FT%T%Z)"'"}}'
kubectl rollout restart deployment argocd-server -n argocd
```

---

## 5. Secret 값 레퍼런스

> **주의**: 아래 값은 **개발 환경 전용**. 운영 환경에서는 반드시 교체.

| Secret 이름 | 키 | 값 |
|------------|----|----|
| postgres-secret | POSTGRES_USER | rummikub |
| postgres-secret | POSTGRES_PASSWORD | REDACTED_DB_PASSWORD |
| postgres-secret | POSTGRES_DB | rummikub |
| game-server-secret | JWT_SECRET | REDACTED_JWT_SECRET |
| game-server-secret | DB_PASSWORD | REDACTED_DB_PASSWORD |
| frontend-secret | NEXTAUTH_SECRET | REDACTED_NEXTAUTH_SECRET |
| ArgoCD | admin 비밀번호 | REDACTED_ARGOCD_PASSWORD |

### K8s에 일괄 주입하는 스크립트

```bash
#!/bin/bash
# inject-secrets.sh — K8s 개발 환경 Secret 일괄 주입

NS=rummikub

echo "=== postgres-secret ==="
kubectl create secret generic postgres-secret -n $NS \
  --from-literal=POSTGRES_USER=rummikub \
  --from-literal=POSTGRES_PASSWORD=REDACTED_DB_PASSWORD \
  --from-literal=POSTGRES_DB=rummikub \
  --dry-run=client -o yaml | kubectl apply -f -

echo "=== game-server-secret ==="
kubectl patch secret game-server-secret -n $NS \
  --type='json' \
  -p='[
    {"op":"replace","path":"/data/JWT_SECRET","value":"'"$(echo -n 'REDACTED_JWT_SECRET' | base64)"'"},
    {"op":"replace","path":"/data/DB_PASSWORD","value":"'"$(echo -n 'REDACTED_DB_PASSWORD' | base64)"'"}
  ]'

echo "=== frontend-secret ==="
kubectl patch secret frontend-secret -n $NS \
  --type='json' \
  -p='[{"op":"replace","path":"/data/NEXTAUTH_SECRET","value":"'"$(echo -n 'REDACTED_NEXTAUTH_SECRET' | base64)"'"}]'

echo "=== 완료 ==="
kubectl get secret -n $NS
```

저장 위치: `scripts/inject-secrets.sh`
실행 방법: `bash scripts/inject-secrets.sh`

---

## 부록: 유용한 명령어 모음

```bash
# 파드 안으로 들어가서 디버깅
kubectl exec -it -n rummikub deployment/game-server -- sh

# 파드 간 네트워크 확인 (game-server → postgres)
kubectl exec -n rummikub deployment/game-server -- nc -zv postgres 5432

# K8s 이벤트 확인 (파드 생성 실패 원인)
kubectl get events -n rummikub --sort-by='.lastTimestamp' | tail -20

# Helm 렌더링 미리 보기 (배포 전 확인)
helm template rummikub ./helm -f helm/environments/dev-values.yaml | grep -A10 "kind: Secret"

# 전체 리소스 사용량
kubectl top pods -n rummikub

# ArgoCD App 상세 (왜 Degraded인지)
kubectl get application rummikub -n argocd -o yaml | grep -A5 "health:\|sync:"
```
