#!/usr/bin/env bash
# RummiArena K8s Helm 배포 스크립트
# 사용법: ./helm/deploy.sh [install|upgrade|uninstall|status]

set -euo pipefail

NAMESPACE="rummikub"
HELM_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACTION="${1:-install}"

log() { echo "[$(date '+%H:%M:%S')] $*"; }
err() { echo "[ERROR] $*" >&2; exit 1; }

check_prereqs() {
  command -v helm >/dev/null 2>&1 || err "helm이 설치되어 있지 않습니다."
  command -v kubectl >/dev/null 2>&1 || err "kubectl이 설치되어 있지 않습니다."
  kubectl cluster-info >/dev/null 2>&1 || err "K8s 클러스터에 연결할 수 없습니다."
  log "사전 조건 확인 완료"
}

ensure_namespace() {
  if ! kubectl get namespace "${NAMESPACE}" >/dev/null 2>&1; then
    log "네임스페이스 ${NAMESPACE} 생성..."
    kubectl create namespace "${NAMESPACE}"
  else
    log "네임스페이스 ${NAMESPACE} 이미 존재합니다."
  fi
}

install_or_upgrade() {
  local name="$1"
  local chart="$2"
  local extra_args="${3:-}"

  if helm status "${name}" -n "${NAMESPACE}" >/dev/null 2>&1; then
    log "helm upgrade: ${name}"
    # shellcheck disable=SC2086
    helm upgrade "${name}" "${chart}" -n "${NAMESPACE}" ${extra_args}
  else
    log "helm install: ${name}"
    # shellcheck disable=SC2086
    helm install "${name}" "${chart}" -n "${NAMESPACE}" ${extra_args}
  fi
}

deploy_all() {
  log "=== RummiArena K8s 배포 시작 (${NAMESPACE}) ==="

  # 1. PostgreSQL
  log "1/5 PostgreSQL 배포..."
  install_or_upgrade "postgres" "${HELM_DIR}/charts/postgres"

  # PostgreSQL Ready 대기
  log "PostgreSQL Ready 대기 (최대 120초)..."
  kubectl rollout status deployment/postgres -n "${NAMESPACE}" --timeout=120s || \
    log "경고: PostgreSQL 준비 타임아웃 - 계속 진행합니다"

  # 2. Redis
  log "2/5 Redis 배포..."
  install_or_upgrade "redis" "${HELM_DIR}/charts/redis"

  # Redis Ready 대기
  log "Redis Ready 대기 (최대 60초)..."
  kubectl rollout status deployment/redis -n "${NAMESPACE}" --timeout=60s || \
    log "경고: Redis 준비 타임아웃 - 계속 진행합니다"

  # 3. game-server (init container가 postgres/redis 대기)
  log "3/5 game-server 배포..."
  install_or_upgrade "game-server" "${HELM_DIR}/charts/game-server"

  # 4. ai-adapter
  log "4/5 ai-adapter 배포..."
  install_or_upgrade "ai-adapter" "${HELM_DIR}/charts/ai-adapter"

  # 5. frontend
  log "5/5 frontend 배포..."
  install_or_upgrade "frontend" "${HELM_DIR}/charts/frontend"

  log "=== 배포 완료 ==="
  show_status
}

show_status() {
  log "=== K8s 리소스 상태 ==="
  kubectl get all -n "${NAMESPACE}"
  echo ""
  log "=== Helm 릴리즈 목록 ==="
  helm list -n "${NAMESPACE}"
}

uninstall_all() {
  log "=== 모든 Helm 릴리즈 제거 ==="
  for name in frontend ai-adapter game-server redis postgres; do
    if helm status "${name}" -n "${NAMESPACE}" >/dev/null 2>&1; then
      log "helm uninstall: ${name}"
      helm uninstall "${name}" -n "${NAMESPACE}"
    else
      log "${name}: 설치되어 있지 않음 (스킵)"
    fi
  done
  log "완료. PVC는 수동으로 삭제하세요: kubectl delete pvc -n ${NAMESPACE} --all"
}

verify_health() {
  log "=== 헬스체크 ==="
  local failed=0

  # game-server
  if curl -sf --max-time 5 "http://localhost:30080/health" >/dev/null 2>&1; then
    log "game-server /health: OK"
  else
    log "game-server /health: FAIL (NodePort 30080)"
    ((failed++))
  fi

  # ai-adapter
  if curl -sf --max-time 5 "http://localhost:30081/health" >/dev/null 2>&1; then
    log "ai-adapter /health: OK"
  else
    log "ai-adapter /health: FAIL (NodePort 30081)"
    ((failed++))
  fi

  # frontend
  local fe_code
  fe_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://localhost:30000" 2>/dev/null || echo "000")
  if [[ "${fe_code}" =~ ^(200|307|308)$ ]]; then
    log "frontend /: OK (HTTP ${fe_code})"
  else
    log "frontend /: FAIL (HTTP ${fe_code}, NodePort 30000)"
    ((failed++))
  fi

  if [[ ${failed} -eq 0 ]]; then
    log "모든 헬스체크 통과"
  else
    log "경고: ${failed}개 헬스체크 실패"
  fi
}

case "${ACTION}" in
  install|deploy)
    check_prereqs
    ensure_namespace
    deploy_all
    ;;
  upgrade)
    check_prereqs
    deploy_all
    ;;
  uninstall|remove)
    uninstall_all
    ;;
  status)
    show_status
    ;;
  health|verify)
    verify_health
    ;;
  *)
    echo "사용법: $0 [install|upgrade|uninstall|status|health]"
    exit 1
    ;;
esac
