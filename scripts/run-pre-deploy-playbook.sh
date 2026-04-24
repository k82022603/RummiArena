#!/usr/bin/env bash
# run-pre-deploy-playbook.sh
#
# .claude/skills/pre-deploy-playbook/SKILL.md v1.1 의 Phase 1~4 를 자동 실행.
# release / hotfix 라벨 PR 머지 전 또는 K8s 재배포 직후 호출.
#
# 정책: docs/05-deployment/09-pre-deploy-playbook-gate.md
# 배경: Day 2 (2026-04-23) smoke PASS 이후 22:04~22:18 사용자 플레이테스트 에서
#       BUG-UI-009~014 6건 폭발. Playbook 이 호출되지 않은 것이 직접 원인.

set -euo pipefail

NAMESPACE="${NAMESPACE:-rummikub}"
ENDPOINT="${ENDPOINT:-http://localhost:30000}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPORT_DIR="${REPO_ROOT}/src/frontend/test-results/pre-deploy-playbook/$(date +%Y-%m-%d-%H%M)"

log() { echo "[playbook $(date '+%H:%M:%S')] $*"; }
err() { echo "[playbook ERROR] $*" >&2; exit 1; }

# -----------------------------------------------------------------
# Phase 1: Pre-flight
# -----------------------------------------------------------------
phase1_preflight() {
  log "Phase 1: Pre-flight"

  # 1. BUILD_ID 확인
  local build_id
  build_id=$(kubectl exec -n "${NAMESPACE}" deploy/frontend -- cat /app/.next/BUILD_ID 2>/dev/null || echo "UNKNOWN")
  log "BUILD_ID: ${build_id}"

  # 2. auth.json 존재 여부
  if [[ ! -f "${REPO_ROOT}/src/frontend/e2e/auth.json" ]]; then
    err "auth.json not found — global-setup 이 먼저 실행되어야 함"
  fi

  # 3. 네트워크 사전 점검
  local http_code
  http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "${ENDPOINT}" || echo "000")
  if [[ ! "${http_code}" =~ ^(200|307|308)$ ]]; then
    err "Endpoint ${ENDPOINT} returned HTTP ${http_code} — 배포 실패 가능"
  fi
  log "Endpoint ${ENDPOINT}: HTTP ${http_code} OK"

  # 4. Ollama warmup (cold start 대응, SKILL v1.1)
  log "Ollama warmup (qwen2.5:3b)..."
  kubectl exec -n "${NAMESPACE}" deploy/ollama -- \
    curl -s -X POST http://localhost:11434/api/generate \
    -d '{"model":"qwen2.5:3b","prompt":"ready","stream":false}' \
    --max-time 90 > /dev/null 2>&1 || log "WARN: Ollama warmup 실패 (무시하고 계속)"
}

# -----------------------------------------------------------------
# Phase 2: Playbook 실행 (Playwright)
# -----------------------------------------------------------------
phase2_playbook() {
  log "Phase 2: Playbook 실행 → ${REPORT_DIR}"
  mkdir -p "${REPORT_DIR}"

  cd "${REPO_ROOT}/src/frontend"

  # pre-deploy-playbook.spec.ts 는 SKILL Phase 2.3 플레이 시퀀스 구현체
  # --workers=1 K8s 부하 방지 (playwright.config.ts 와 동일)
  if npx playwright test e2e/pre-deploy-playbook.spec.ts \
      --workers=1 \
      --reporter=list \
      --output="${REPORT_DIR}"; then
    log "Playbook PASS"
    echo "PASS" > "${REPORT_DIR}/verdict.txt"
    return 0
  else
    log "Playbook FAIL — artifacts: ${REPORT_DIR}"
    echo "FAIL" > "${REPORT_DIR}/verdict.txt"
    return 1
  fi
}

# -----------------------------------------------------------------
# Phase 4: 리포트
# -----------------------------------------------------------------
phase4_report() {
  local verdict="$1"
  local summary_file="${REPORT_DIR}/summary.md"

  cat > "${summary_file}" <<EOF
## Pre-deploy Playbook — ${verdict}

- Endpoint: ${ENDPOINT}
- Report dir: ${REPORT_DIR}
- Trace zip: ${REPORT_DIR}/trace.zip (실패 시)
- 판정: $( [[ "${verdict}" == "PASS" ]] && echo "GO — 사용자 전달 가능" || echo "NO-GO — 즉시 수정 필요, 사용자 전달 차단" )

정책: docs/05-deployment/09-pre-deploy-playbook-gate.md §2.3
EOF

  log "Summary: ${summary_file}"
  cat "${summary_file}"
}

# -----------------------------------------------------------------
# main
# -----------------------------------------------------------------
main() {
  log "=== Pre-deploy Playbook 시작 ==="

  phase1_preflight

  if phase2_playbook; then
    phase4_report "PASS"
    log "=== 완료 (GO) ==="
    exit 0
  else
    phase4_report "FAIL"
    log "=== 완료 (NO-GO) — 사용자 전달 금지 ==="
    exit 1
  fi
}

main "$@"
