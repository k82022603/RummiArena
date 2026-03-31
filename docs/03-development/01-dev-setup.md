# 개발 환경 셋업 매뉴얼

## 1. 개요

RummiArena 프로젝트의 개발 환경을 처음부터 구성하는 가이드.
각 도구의 상세 사용법은 [도구 매뉴얼](../00-tools/00-index.md)을 참조한다.

## 2. 사전 요구사항

| 항목 | 요구 | 비고 |
|------|------|------|
| OS | Windows 11 + WSL2 | Ubuntu 24.04 권장 |
| RAM | 16GB 이상 | 8GB 미만 시 서비스 동시 실행 불가 |
| Docker Desktop | 설치 + WSL2 backend | K8s 활성화 |
| Git | 설치됨 | WSL2 내부 |

## 3. 셋업 체크리스트

### Step 1: WSL2 + .wslconfig

```powershell
# PowerShell (관리자)
wsl --install -d Ubuntu-24.04
```

`C:\Users\{사용자명}\.wslconfig` 생성:

```ini
[wsl2]
memory=10GB
swap=4GB
processors=6

[experimental]
autoMemoryReclaim=dropcache
sparseVhd=true
```

```powershell
wsl --shutdown
wsl
```

> 상세: [23-wslconfig.md](../00-tools/23-wslconfig.md)

### Step 2: Docker Desktop

1. Docker Desktop 설치 → WSL2 backend 활성화
2. Settings > Kubernetes > Enable Kubernetes
3. 확인:

```bash
docker --version
kubectl cluster-info
```

> 상세: [01-docker-desktop.md](../00-tools/01-docker-desktop.md)

### Step 3: Git + GitHub 설정

```bash
# Git 설정
git config --global user.name "이름"
git config --global user.email "이메일"

# 저장소 클론
git clone https://github.com/k82022603/RummiArena.git
cd RummiArena
```

### Step 4: GitHub CLI (gh)

```bash
# 설치 (sudo 없이)
mkdir -p ~/.local/bin
# gh 바이너리 다운로드 후 ~/.local/bin에 배치

# PATH 추가 (~/.bashrc)
export PATH="$HOME/.local/bin:$PATH"

# 인증
gh auth login
```

> 상세: [24-github-cli-mcp.md](../00-tools/24-github-cli-mcp.md)

### Step 5: GITHUB_TOKEN 환경변수

```bash
# ~/.bashrc에 추가
export GITHUB_TOKEN="ghp_xxxxx"

# 적용
source ~/.bashrc
```

Claude Code MCP (github 서버)와 gh CLI 모두 이 토큰을 사용한다.

### Step 6: PostgreSQL

두 가지 방식 중 하나를 선택한다. 로컬 개발 초기에는 docker-compose를, K8s 환경에서는 Helm 방식을 사용한다.

#### 방식 A: docker-compose (로컬 개발)

```bash
# 볼륨 생성 (최초 1회)
docker volume create rummikub_pgdata

# 시작
docker compose up -d

# 접속 확인
docker exec rummikub-postgres pg_isready
# /var/run/postgresql:5432 - accepting connections

# psql 접속
docker exec -it rummikub-postgres psql -U rummikub -d rummikub
```

#### 방식 B: Helm (K8s 배포, Step 8 이후)

```bash
# rummikub namespace에 PostgreSQL 배포
helm install postgres oci://registry-1.docker.io/bitnamicharts/postgresql \
  --namespace rummikub \
  --set auth.username=rummikub \
  --set auth.password=REDACTED_DB_PASSWORD \
  --set auth.database=rummikub

# 접속 확인 (NodePort 30432)
psql -h localhost -p 30432 -U rummikub -d rummikub
```

### Step 7: Claude Code + MCP 서버

Claude Code 실행 시 프로젝트 루트의 `.mcp.json`을 자동 로드한다.

```bash
# Claude Code 시작
claude

# MCP 서버 상태 확인
/mcp
```

현재 설정된 MCP 서버 (4개):

| MCP 서버 | 패키지 | 용도 |
|----------|--------|------|
| github | `@modelcontextprotocol/server-github` | Issues, PR, Branch |
| filesystem | `@modelcontextprotocol/server-filesystem` | 파일/디렉토리 확장 |
| postgres | `@bytebase/dbhub` | DB 스키마/SQL |
| kubernetes | `mcp-server-kubernetes` | kubectl 자동화 |

> Docker 연동은 MCP 없이 Bash `docker` / `docker compose` 명령으로 직접 실행.

> 상세: [21-claude-code.md](../00-tools/21-claude-code.md)

### Step 8: K8s 배포 (Helm)

```bash
# 네임스페이스 생성
kubectl create namespace rummikub
kubectl create namespace argocd
kubectl config set-context --current --namespace=rummikub

# 5개 서비스 Helm 배포 순서
helm install postgres  oci://registry-1.docker.io/bitnamicharts/postgresql \
  --namespace rummikub \
  --set auth.username=rummikub \
  --set auth.password=REDACTED_DB_PASSWORD \
  --set auth.database=rummikub

helm install redis oci://registry-1.docker.io/bitnamicharts/redis \
  --namespace rummikub \
  --set auth.enabled=false

helm install game-server ./helm/game-server \
  --namespace rummikub

helm install ai-adapter ./helm/ai-adapter \
  --namespace rummikub

helm install frontend ./helm/frontend \
  --namespace rummikub

# 배포 상태 확인
kubectl get pods -n rummikub
kubectl get svc -n rummikub
```

#### NodePort 매핑

| 서비스 | NodePort | 내부 포트 |
|--------|----------|----------|
| game-server | 30080 | 8080 |
| ai-adapter | 30081 | 8081 |
| frontend | 30000 | 3000 |
| postgres | 30432 | 5432 |

### Step 9: game-server 환경변수 (AI Adapter 연동)

game-server가 ai-adapter와 통신하려면 다음 환경변수가 ConfigMap/Secret에 설정되어야 한다.

| 환경변수 | 리소스 종류 | 기본값 | 필수 | 설명 |
|----------|-------------|--------|------|------|
| `AI_ADAPTER_URL` | ConfigMap | `http://ai-adapter:8081` | Y | ai-adapter 서비스 Base URL. 미설정 시 AI 턴이 전면 비활성화된다 (경고 로그 출력, 모든 AI 턴 강제 draw). |
| `AI_ADAPTER_TIMEOUT_SEC` | ConfigMap | `200` | N | ai-adapter HTTP 호출 전체 타임아웃 (초). Ollama 재시도 고려 시 200초 권장. |
| `AI_ADAPTER_INTERNAL_TOKEN` | Secret | (없음) | Y | 내부 서비스 인증 토큰. `X-Internal-Token` 헤더로 전달. ai-adapter 측과 동일한 값 필요. |

이 값들은 `helm/charts/game-server/values.yaml`에 정의되어 있으며, ArgoCD sync를 통해 K8s에 배포된다.

```bash
# 현재 설정 확인
kubectl get configmap game-server-config -n rummikub -o yaml | grep AI_ADAPTER
kubectl get secret game-server-secret -n rummikub -o jsonpath='{.data.AI_ADAPTER_INTERNAL_TOKEN}' | base64 -d
```

> **주의**: `AI_ADAPTER_URL`이 누락되면 game-server 기동은 정상이지만, AI 플레이어가 참여한 게임에서 모든 AI 턴이 강제 draw로 처리된다. AI 대전 기능을 사용하려면 반드시 설정해야 한다.

## 4. 환경 검증

셋업 완료 후 아래 항목을 확인한다:

```bash
# 1. WSL2 리소스
free -h                        # memory ~10GB 확인
nproc                          # 6 확인

# 2. Docker
docker ps                      # rummikub-postgres 실행 중

# 3. PostgreSQL
docker exec rummikub-postgres pg_isready

# 4. Git
git remote -v                  # github.com/k82022603/RummiArena

# 5. GitHub CLI
gh auth status                 # Logged in to github.com

# 6. kubectl (K8s 활성화 시)
kubectl get nodes              # docker-desktop Ready

# 7. K8s 서비스 (Step 8 완료 후)
kubectl get pods -n rummikub   # 5개 pods Running
kubectl get svc -n rummikub    # NodePort 30080/30081/30000/30432 확인
curl http://localhost:30080/health   # game-server {"status":"ok",...}
```

## 5. 프로젝트 디렉토리 구조

```
RummiArena/
├─ docs/
│  ├─ 00-tools/        # 도구 매뉴얼 (25개+)
│  ├─ 01-planning/     # 기획 (헌장, 요구사항, 리스크, 도구체인, WBS)
│  ├─ 02-design/       # 설계 (아키텍처, DB, API, AI Adapter, 세션)
│  ├─ 03-development/  # 개발 가이드 (이 문서)
│  ├─ 05-deployment/   # 배포 가이드
│  └─ ...
├─ src/
│  ├─ frontend/        # Next.js
│  ├─ game-server/     # Go (gin + gorilla/websocket + GORM) — Sprint 1 핵심 구현 완료
│  ├─ ai-adapter/      # NestJS (TypeScript)
│  └─ admin/           # Next.js 관리자 대시보드
├─ helm/               # Helm charts (5개 서비스)
│  ├─ game-server/
│  ├─ ai-adapter/
│  └─ frontend/
├─ work_logs/          # 작업 로그
├─ docker-compose.yml  # Docker 서비스 정의
├─ .mcp.json           # Claude Code MCP 설정
└─ CLAUDE.md           # Claude Code 프로젝트 지침
```

## 6. 알려진 이슈

| 이슈 | 원인 | 해결 |
|------|------|------|
| WSL OOM으로 터미널 멈춤 | MCP 서버 프로세스 fork 폭주, 또는 memory 과할당 | `ps aux --sort=-%mem`으로 원인 특정, .wslconfig 조정 |
| docker MCP 사용 금지 | `@thelord/mcp-server-docker-npx` fork 버그 (876개 프로세스) | Bash `docker` 명령으로 대체 |
| kubernetes MCP 미로드 | 커뮤니티 패키지, 로드 불안정 | Docker Desktop K8s 활성화 상태에서 재시도 |
| kp-* 컨테이너 잔존 | 다른 프로젝트(hybrid-rag) 컨테이너 | 필요 시 `docker rm`으로 정리 |

## 7. 관련 문서

| 문서 | 내용 |
|------|------|
| [01-local-infra-guide.md](../05-deployment/01-local-infra-guide.md) | 로컬 인프라 전체 구성 |
| [00-index.md](../00-tools/00-index.md) | 도구 매뉴얼 인덱스 |
| [04-tool-chain.md](../01-planning/04-tool-chain.md) | 도구 체인 전체 맵 |
| [01-architecture.md](../02-design/01-architecture.md) | 시스템 아키텍처 |
