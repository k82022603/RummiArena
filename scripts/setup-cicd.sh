#!/usr/bin/env bash
# scripts/setup-cicd.sh
# RummiArena CI/CD 환경 초기 설정 스크립트
#
# Task 순서:
#   1. vm.max_map_count 설정 (SonarQube Elasticsearch 요구사항)
#   2. SonarQube + DB 기동 (docker-compose.cicd.yml)
#   3. SonarQube 기동 확인
#   4. GitLab Runner Helm dry-run 검증
#   5. GitLab Runner Helm 설치 (토큰 있을 때)
#
# 사용법:
#   ./scripts/setup-cicd.sh sonarqube          # SonarQube만 기동
#   ./scripts/setup-cicd.sh runner-dryrun      # Runner Helm dry-run
#   ./scripts/setup-cicd.sh runner-install     # Runner Helm 실제 설치
#   ./scripts/setup-cicd.sh status             # 상태 확인
#   ./scripts/setup-cicd.sh runner-register    # Runner 등록 (대화형)
#   ./scripts/setup-cicd.sh down               # CI 환경 중지

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.cicd.yml"
RUNNER_VALUES="$PROJECT_ROOT/helm/charts/gitlab-runner/values.yaml"
CICD_NS="cicd"

log()  { echo "[$(date '+%H:%M:%S')] $*"; }
info() { echo "[INFO]  $*"; }
warn() { echo "[WARN]  $*" >&2; }
err()  { echo "[ERROR] $*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# 사전 조건 확인
# ---------------------------------------------------------------------------
check_prereqs() {
  command -v docker >/dev/null 2>&1   || err "docker가 설치되어 있지 않습니다."
  docker compose version >/dev/null 2>&1 || err "docker compose v2가 필요합니다."
  log "사전 조건 확인 완료"
}

check_k8s_prereqs() {
  command -v helm >/dev/null 2>&1    || err "helm이 설치되어 있지 않습니다."
  command -v kubectl >/dev/null 2>&1 || err "kubectl이 설치되어 있지 않습니다."
  kubectl cluster-info >/dev/null 2>&1 || err "K8s 클러스터에 연결할 수 없습니다."
  log "K8s 사전 조건 확인 완료"
}

# ---------------------------------------------------------------------------
# SonarQube 기동
# ---------------------------------------------------------------------------
start_sonarqube() {
  log "=== SonarQube 기동 ==="

  # vm.max_map_count 설정 (SonarQube Elasticsearch 요구사항)
  local current_map_count
  current_map_count=$(sysctl -n vm.max_map_count 2>/dev/null || echo "0")
  if [[ "$current_map_count" -lt 262144 ]]; then
    log "vm.max_map_count=$current_map_count → 262144로 설정합니다 (sudo 필요)"
    sudo sysctl -w vm.max_map_count=262144
    log "vm.max_map_count 설정 완료 (재부팅 시 초기화됨)"
    info "영구 설정: echo 'vm.max_map_count=262144' | sudo tee /etc/sysctl.d/99-sonarqube.conf"
  else
    log "vm.max_map_count=$current_map_count (OK)"
  fi

  # 메모리 확인
  local avail_gb
  avail_gb=$(awk '/MemAvailable/ {printf "%.0f", $2/1024/1024}' /proc/meminfo)
  if [[ "$avail_gb" -lt 2 ]]; then
    warn "가용 메모리 ${avail_gb}GB — SonarQube는 최소 2GB 필요합니다."
    warn "Dev 모드 서비스를 먼저 중지하세요: docker compose -f docker-compose.dev.yml down"
  else
    log "가용 메모리: ${avail_gb}GB (OK)"
  fi

  log "SonarQube DB + SonarQube 기동 중..."
  docker compose -f "$COMPOSE_FILE" up -d sonarqube-db sonarqube

  log "SonarQube 기동 확인 중 (최대 3분 대기)..."
  local retries=18
  local i=0
  while [[ $i -lt $retries ]]; do
    local status
    status=$(curl -sf http://localhost:9000/api/system/status 2>/dev/null | grep -o '"status":"[^"]*"' || echo "")
    if echo "$status" | grep -q '"UP"'; then
      log "SonarQube 정상 기동 완료"
      info "URL: http://localhost:9000"
      info "초기 계정: admin / admin (최초 접속 시 비밀번호 변경 필요)"
      return 0
    fi
    log "대기 중... (${i}/${retries}) 상태: ${status:-응답없음}"
    sleep 10
    ((i++))
  done
  warn "SonarQube 기동 타임아웃. 로그를 확인하세요:"
  warn "  docker compose -f docker-compose.cicd.yml logs sonarqube"
}

# ---------------------------------------------------------------------------
# GitLab Runner Helm 설치
# ---------------------------------------------------------------------------
runner_helm_dry_run() {
  check_k8s_prereqs
  log "=== GitLab Runner Helm dry-run ==="

  helm repo add gitlab https://charts.gitlab.io 2>/dev/null || true
  helm repo update

  helm install gitlab-runner gitlab/gitlab-runner \
    -n "$CICD_NS" --create-namespace \
    -f "$RUNNER_VALUES" \
    --dry-run 2>&1 | head -50

  log "dry-run 완료. 실제 설치: ./scripts/setup-cicd.sh runner-install"
}

runner_helm_install() {
  check_k8s_prereqs

  # Runner 토큰 확인
  local token="${RUNNER_TOKEN:-}"
  if [[ -z "$token" ]]; then
    info "RUNNER_TOKEN 환경변수가 없습니다."
    info "GitLab.com → 프로젝트 → Settings → CI/CD → Runners → New project runner"
    read -r -p "Runner 토큰 입력 (glrt-...): " token
  fi
  [[ -z "$token" ]] && err "Runner 토큰이 필요합니다."

  log "=== GitLab Runner Helm 설치 ==="
  helm repo add gitlab https://charts.gitlab.io 2>/dev/null || true
  helm repo update

  # 네임스페이스 생성
  kubectl create namespace "$CICD_NS" --dry-run=client -o yaml | kubectl apply -f -

  if helm status gitlab-runner -n "$CICD_NS" >/dev/null 2>&1; then
    log "기존 릴리즈 업그레이드..."
    helm upgrade gitlab-runner gitlab/gitlab-runner \
      -n "$CICD_NS" \
      -f "$RUNNER_VALUES" \
      --set "runnerToken=$token"
  else
    log "신규 설치..."
    helm install gitlab-runner gitlab/gitlab-runner \
      -n "$CICD_NS" --create-namespace \
      -f "$RUNNER_VALUES" \
      --set "runnerToken=$token"
  fi

  log "Runner Pod 기동 대기..."
  kubectl rollout status deployment/gitlab-runner -n "$CICD_NS" --timeout=120s || \
    warn "Runner Pod 준비 타임아웃"
  kubectl get pods -n "$CICD_NS"
}

# ---------------------------------------------------------------------------
# Docker Runner 등록 (docker-compose.cicd.yml의 gitlab-runner 컨테이너)
# ---------------------------------------------------------------------------
runner_register() {
  log "=== GitLab Runner 등록 (Docker 컨테이너) ==="

  local token="${RUNNER_TOKEN:-}"
  if [[ -z "$token" ]]; then
    info "GitLab.com → 프로젝트 → Settings → CI/CD → Runners → New project runner"
    read -r -p "Runner 토큰 입력 (glrt-...): " token
  fi
  [[ -z "$token" ]] && err "Runner 토큰이 필요합니다."

  # gitlab-runner 컨테이너가 실행 중인지 확인
  if ! docker ps --format '{{.Names}}' | grep -q '^gitlab-runner$'; then
    log "gitlab-runner 컨테이너 기동 중..."
    docker compose -f "$COMPOSE_FILE" up -d gitlab-runner
    sleep 5
  fi

  docker exec gitlab-runner gitlab-runner register \
    --non-interactive \
    --url "https://gitlab.com" \
    --token "$token" \
    --executor "docker" \
    --docker-image "alpine:latest" \
    --description "RummiArena Local Runner ($(hostname))" \
    --tag-list "docker,rummiarena,local" \
    --run-untagged="true" \
    --docker-volumes "/var/run/docker.sock:/var/run/docker.sock"

  log "Runner 등록 완료"
  docker exec gitlab-runner gitlab-runner list
}

# ---------------------------------------------------------------------------
# 상태 확인
# ---------------------------------------------------------------------------
show_status() {
  log "=== CI/CD 환경 상태 ==="

  info "-- Docker 컨테이너 (CI 모드) --"
  docker compose -f "$COMPOSE_FILE" ps 2>/dev/null || echo "  (실행 중인 CI 컨테이너 없음)"

  info "-- SonarQube 상태 --"
  local sq_status
  sq_status=$(curl -sf http://localhost:9000/api/system/status 2>/dev/null || echo '{"status":"DOWN"}')
  echo "  $sq_status"

  if command -v kubectl >/dev/null 2>&1; then
    info "-- K8s cicd 네임스페이스 --"
    kubectl get pods -n "$CICD_NS" 2>/dev/null || echo "  (cicd 네임스페이스 없음)"
  fi
}

# ---------------------------------------------------------------------------
# CI 환경 중지
# ---------------------------------------------------------------------------
stop_cicd() {
  log "=== CI/CD 환경 중지 ==="
  docker compose -f "$COMPOSE_FILE" down
  log "완료. 볼륨까지 삭제하려면: docker compose -f docker-compose.cicd.yml down -v"
}

# ---------------------------------------------------------------------------
# 메인
# ---------------------------------------------------------------------------
ACTION="${1:-help}"
check_prereqs

case "$ACTION" in
  sonarqube|sq)
    start_sonarqube
    ;;
  runner-dryrun|dry-run)
    runner_helm_dry_run
    ;;
  runner-install|install)
    runner_helm_install
    ;;
  runner-register|register)
    runner_register
    ;;
  status)
    show_status
    ;;
  down|stop)
    stop_cicd
    ;;
  help|*)
    echo "사용법: $0 <command>"
    echo ""
    echo "Commands:"
    echo "  sonarqube        SonarQube + DB 기동 (docker-compose.cicd.yml)"
    echo "  runner-dryrun    GitLab Runner Helm dry-run 검증"
    echo "  runner-install   GitLab Runner Helm 실제 설치 (K8s)"
    echo "  runner-register  Docker 컨테이너 Runner 등록 (대화형)"
    echo "  status           CI/CD 환경 상태 확인"
    echo "  down             CI/CD 환경 전체 중지"
    echo ""
    echo "예시:"
    echo "  ./scripts/setup-cicd.sh sonarqube"
    echo "  RUNNER_TOKEN=glrt-xxx ./scripts/setup-cicd.sh runner-install"
    ;;
esac
