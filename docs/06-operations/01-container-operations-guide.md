# 컨테이너 운영 가이드

**문서 번호**: OPS-001
**작성일**: 2026-03-09
**적용 대상**: RummiArena 로컬 개발/테스트 환경 (WSL2 + Docker Desktop)

---

## 1. 개요

16GB 물리 RAM 환경에서 RummiArena와 hybrid-rag-knowledge-ops 프로젝트는 **병행 운용하지 않는다.**
프로젝트 전환 시 반드시 이전 프로젝트의 컨테이너를 중지하고, WSL2 리소스를 정리한 후 시작한다.

---

## 2. 컨테이너 시작 전 체크리스트

### 2.1 필수 체크 (매번 확인)

```
□ 1. hybrid-rag 컨테이너 전체 중지 확인
□ 2. .wslconfig 프로파일 전환 (hybrid-rag → rummiarena)
□ 3. WSL2 재시작 (프로파일 변경 시)
□ 4. Linux 파일 캐시 해제
□ 5. Docker 빌드 캐시 / 미사용 이미지 정리
□ 6. 메모리 상태 확인 (free -h)
```

### 2.2 체크 절차 상세

#### Step 1: hybrid-rag 컨테이너 중지 확인

```bash
# hybrid-rag 컨테이너가 실행 중인지 확인
docker ps --format "table {{.Names}}\t{{.Status}}" | grep kp-

# 실행 중이면 전체 중지
cd /mnt/d/Users/KTDS/Documents/06.과제/hybrid-rag-knowledge-ops/infrastructure/docker
docker compose down
```

> **왜?** hybrid-rag는 12개 핵심 컨테이너만으로 ~6 GiB 메모리를 점유한다.
> (ai-service 3GB + ES 1.5GB + Neo4j 0.8GB + 나머지)
> 병행 운용 시 WSL2 10GB 할당으로는 OOM이 발생한다.

#### Step 2: .wslconfig 프로파일 전환

```bash
# 현재 프로파일 확인
bash scripts/switch-wslconfig.sh status

# RummiArena 프로파일로 전환 (10GB / 6코어 / 4GB swap)
bash scripts/switch-wslconfig.sh rummiarena
```

| 프로파일 | memory | swap | processors | 용도 |
|---------|--------|------|-----------|------|
| hybrid-rag | 14 GB | 4 GB | 8 | AI Service + ES + Neo4j 등 21개 |
| **rummiarena** | **10 GB** | **4 GB** | **6** | PG + Redis + K8s + 앱 서비스 |

> 프로파일 변경 시 Step 3 (WSL2 재시작) 필수.

#### Step 3: WSL2 재시작 (프로파일 변경 시)

```powershell
# PowerShell에서 실행
wsl --shutdown
# Docker Desktop이 자동 재시작됨 (1~2분 대기)
```

> 프로파일을 변경하지 않았으면 이 단계 생략 가능.

#### Step 4: Linux 파일 캐시 해제

```powershell
# PowerShell에서 실행 (sudo 불필요)
wsl -u root sh -c "echo 3 > /proc/sys/vm/drop_caches"
```

> **왜?** WSL2는 Linux buff/cache(3~6 GiB)를 Windows에 반환하지 않는다.
> `drop_caches`로 WSL2 내부 free 메모리를 확보해야 컨테이너가 안정적으로 실행된다.
> 실행 중 컨테이너에 영향 없음 (미사용 캐시만 해제).

#### Step 5: Docker 정리

```bash
# 빌드 캐시 정리
docker builder prune -f

# 미사용 이미지 정리 (실행 중 컨테이너 이미지는 보존)
docker image prune -a -f

# 결과 확인
docker system df
```

#### Step 6: 메모리 상태 확인

```bash
free -h
```

**시작 기준**:
- free > 2 GiB 또는 available > 5 GiB
- Swap 사용 < 1 GiB
- buff/cache < 2 GiB

---

## 3. 컨테이너 시작

### 3.1 현재 (Sprint 0: PostgreSQL만)

```bash
cd /mnt/d/Users/KTDS/Documents/06.과제/RummiArena

# 볼륨 생성 (최초 1회)
docker volume create rummikub_pgdata

# 시작
docker compose up -d

# 상태 확인
docker compose ps

# 접속 테스트
docker exec -it rummikub-postgres psql -U rummikub -d rummikub -c "SELECT version();"
```

### 3.2 확장 (Sprint 1~: PG + Redis)

```bash
docker compose up -d
docker compose ps
```

### 3.3 K8s 모드 (Sprint 2~)

```bash
# Docker Desktop에서 Kubernetes 활성화 후
kubectl get nodes
kubectl create namespace rummikub
helm install rummiarena ./helm -n rummikub
```

---

## 4. 컨테이너 중지 및 프로젝트 전환

### 4.1 RummiArena → hybrid-rag 전환 시

```bash
# 1. RummiArena 컨테이너 중지
cd /mnt/d/Users/KTDS/Documents/06.과제/RummiArena
docker compose down

# 2. 프로파일 전환
bash scripts/switch-wslconfig.sh hybrid-rag
```

```powershell
# 3. PowerShell에서 WSL 재시작
wsl --shutdown

# 4. 캐시 해제 (Docker Desktop 재시작 후)
wsl -u root sh -c "echo 3 > /proc/sys/vm/drop_caches"
```

```bash
# 5. hybrid-rag 컨테이너 시작
cd /mnt/d/Users/KTDS/Documents/06.과제/hybrid-rag-knowledge-ops/infrastructure/docker
docker compose up -d
```

---

## 5. 메모리 예산 (RummiArena 10GB 기준)

| 항목 | 예상 사용량 | 비고 |
|------|:----------:|------|
| WSL2 커널 + systemd | ~300 MB | 고정 |
| Docker Engine | ~200 MB | 고정 |
| Claude Code + MCP | ~400 MB | MCP 4개 기준 |
| PostgreSQL | ~100 MB | idle 기준 |
| Redis | ~50 MB | Sprint 1~ |
| 앱 서비스 (3개) | ~1.5 GB | Sprint 2~ |
| K8s 컴포넌트 | ~500 MB | Sprint 2~ |
| buff/cache | ~1 GB | drop_caches 후 |
| **합계** | **~4 GB** | Sprint 0~1 기준 |
| **가용 여유** | **~6 GB** | 빌드, 테스트 등 |

> hybrid-rag(~6 GiB 컨테이너만)에 비해 RummiArena는 훨씬 가벼움.

---

## 6. 트러블슈팅

### 포트 충돌

hybrid-rag와 RummiArena가 같은 포트를 사용하는 경우:

| 포트 | hybrid-rag | RummiArena | 충돌 |
|------|-----------|-----------|:----:|
| 5432 | kp-postgresql | rummikub-postgres | **충돌** |
| 80 | kp-nginx | - | - |
| 3000 | kp-frontend | frontend (추후) | **충돌** |
| 8080 | kp-api-gateway | game-server (추후) | **충돌** |

> **해결**: 반드시 이전 프로젝트 컨테이너를 `docker compose down`으로 완전 중지 후 시작.
> `docker compose stop`은 포트를 해제하지만, `down`이 더 확실함.

### hybrid-rag 컨테이너가 남아있는 경우

```bash
# 모든 중지된 컨테이너 확인
docker ps -a --filter "name=kp-" --format "table {{.Names}}\t{{.Status}}"

# 중지된 kp-* 컨테이너 일괄 삭제 (디스크 절약)
docker ps -a --filter "name=kp-" --filter "status=exited" -q | xargs -r docker rm
```

---

## 7. 관련 문서

| 문서 | 위치 |
|------|------|
| 로컬 인프라 가이드 | [05-deployment/01-local-infra-guide.md](../05-deployment/01-local-infra-guide.md) |
| WSL2 설정 매뉴얼 | [00-tools/23-wslconfig.md](../00-tools/23-wslconfig.md) |
| Docker Desktop 매뉴얼 | [00-tools/01-docker-desktop.md](../00-tools/01-docker-desktop.md) |
| hybrid-rag 리소스 정리 가이드 | [hybrid-rag: DEV-003](../../../hybrid-rag-knowledge-ops/knowledge_service/docs/05_development/03_pre_test_resource_cleanup.md) |

---

*작성: Claude Code (Opus 4.6) | 2026-03-09*
