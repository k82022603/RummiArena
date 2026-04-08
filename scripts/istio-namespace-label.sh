#!/usr/bin/env bash
#
# scripts/istio-namespace-label.sh
# Istio 선별 sidecar injection 설정 스크립트 (RummiArena Phase 5.1)
#
# 설계 문서: docs/02-design/20-istio-selective-mesh-design.md
# 전략: namespace-level injection 비활성화 + Pod-level annotation으로 선별 주입
#
# 적용 대상: game-server, ai-adapter (2 Pod)
# 제외 대상: frontend, admin, postgres, redis, ollama (명시적)
#
# 멱등성: 이미 설정된 라벨/annotation이 있어도 안전하게 재적용한다.
# 사용법: bash scripts/istio-namespace-label.sh
#
set -euo pipefail

NAMESPACE="${NAMESPACE:-rummikub}"

# Istio CRD 매니페스트 디렉토리
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ISTIO_DIR="${PROJECT_ROOT}/istio"

# --- 색상 출력 ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

# --- 1. 사전 조건 확인 ---
info "=== Istio 선별 injection 설정 시작 ==="

# kubectl 접근 확인
if ! kubectl get namespace "${NAMESPACE}" &>/dev/null; then
    error "namespace '${NAMESPACE}'이 존재하지 않습니다."
    exit 1
fi
info "namespace '${NAMESPACE}' 확인 완료"

# istiod 동작 확인
if ! kubectl get deployment istiod -n istio-system &>/dev/null 2>&1; then
    error "istiod가 istio-system에 존재하지 않습니다."
    error "먼저 scripts/istio-install.sh 를 실행하세요."
    exit 1
fi

ISTIOD_READY=$(kubectl get deployment istiod -n istio-system -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
if [ "${ISTIOD_READY}" != "1" ]; then
    warn "istiod가 Ready 상태가 아닙니다 (readyReplicas=${ISTIOD_READY}). 계속 진행합니다."
fi
info "istiod 상태 확인 완료 (readyReplicas=${ISTIOD_READY})"

# --- 2. namespace 라벨 설정 ---
info "=== namespace 라벨 설정 ==="

# 핵심: namespace-level injection을 활성화하되,
# 제외 대상 Pod에는 명시적으로 sidecar.istio.io/inject: "false" annotation을 부여한다.
# 이 방식이 Pod-level annotation만 사용하는 것보다 Istio 공식 권장 패턴이다.
#
# 그러나 설계 문서(ADR-020)에서는 namespace-level injection을 비활성화하고
# 적용 대상에만 sidecar.istio.io/inject: "true"를 부여하는 방식을 명시했다.
# 설계 문서를 준수한다.

# namespace에 istio-injection 라벨을 설정하지 않음 (또는 명시적으로 disabled)
# 이미 enabled로 되어 있을 수 있으므로 명시적으로 disabled 설정
kubectl label namespace "${NAMESPACE}" istio-injection=disabled --overwrite 2>/dev/null || true
info "namespace '${NAMESPACE}' istio-injection=disabled 설정 완료"

# istio.io/rev 라벨이 있으면 제거 (revision-based injection 비활성화)
kubectl label namespace "${NAMESPACE}" istio.io/rev- 2>/dev/null || true

# --- 3. 적용 대상 Pod annotation 설정 (game-server, ai-adapter) ---
info "=== 적용 대상 Pod annotation 설정 ==="

# game-server deployment에 sidecar injection annotation 패치
info "game-server: sidecar injection 활성화 + 리소스 설정..."
kubectl patch deployment game-server -n "${NAMESPACE}" --type='json' -p='[
  {
    "op": "add",
    "path": "/spec/template/metadata/annotations",
    "value": {
      "sidecar.istio.io/inject": "true",
      "sidecar.istio.io/proxyCPU": "50m",
      "sidecar.istio.io/proxyCPULimit": "200m",
      "sidecar.istio.io/proxyMemory": "64Mi",
      "sidecar.istio.io/proxyMemoryLimit": "128Mi"
    }
  }
]' 2>/dev/null || {
    # annotations 경로가 이미 존재하면 merge 패치 사용
    kubectl patch deployment game-server -n "${NAMESPACE}" --type='merge' -p='{
      "spec": {
        "template": {
          "metadata": {
            "annotations": {
              "sidecar.istio.io/inject": "true",
              "sidecar.istio.io/proxyCPU": "50m",
              "sidecar.istio.io/proxyCPULimit": "200m",
              "sidecar.istio.io/proxyMemory": "64Mi",
              "sidecar.istio.io/proxyMemoryLimit": "128Mi"
            }
          }
        }
      }
    }'
}
info "game-server annotation 설정 완료"

# ai-adapter deployment에 sidecar injection annotation 패치
info "ai-adapter: sidecar injection 활성화 + 리소스 설정..."
kubectl patch deployment ai-adapter -n "${NAMESPACE}" --type='json' -p='[
  {
    "op": "add",
    "path": "/spec/template/metadata/annotations",
    "value": {
      "sidecar.istio.io/inject": "true",
      "sidecar.istio.io/proxyCPU": "50m",
      "sidecar.istio.io/proxyCPULimit": "200m",
      "sidecar.istio.io/proxyMemory": "64Mi",
      "sidecar.istio.io/proxyMemoryLimit": "128Mi"
    }
  }
]' 2>/dev/null || {
    kubectl patch deployment ai-adapter -n "${NAMESPACE}" --type='merge' -p='{
      "spec": {
        "template": {
          "metadata": {
            "annotations": {
              "sidecar.istio.io/inject": "true",
              "sidecar.istio.io/proxyCPU": "50m",
              "sidecar.istio.io/proxyCPULimit": "200m",
              "sidecar.istio.io/proxyMemory": "64Mi",
              "sidecar.istio.io/proxyMemoryLimit": "128Mi"
            }
          }
        }
      }
    }'
}
info "ai-adapter annotation 설정 완료"

# --- 4. 제외 대상 Pod annotation 설정 (명시적 opt-out) ---
info "=== 제외 대상 Pod annotation 설정 (명시적 opt-out) ==="

# namespace-level injection이 disabled이므로 이론상 불필요하나,
# 향후 namespace-level 전환 시를 대비하여 명시적으로 설정한다.
EXCLUDE_DEPLOYMENTS=("frontend" "admin" "postgres" "redis" "ollama")

for DEPLOY in "${EXCLUDE_DEPLOYMENTS[@]}"; do
    if kubectl get deployment "${DEPLOY}" -n "${NAMESPACE}" &>/dev/null 2>&1; then
        kubectl patch deployment "${DEPLOY}" -n "${NAMESPACE}" --type='merge' -p='{
          "spec": {
            "template": {
              "metadata": {
                "annotations": {
                  "sidecar.istio.io/inject": "false"
                }
              }
            }
          }
        }' 2>/dev/null || warn "${DEPLOY}: annotation 패치 실패 (무시)"
        info "${DEPLOY}: sidecar injection 명시적 비활성화 완료"
    else
        warn "${DEPLOY}: deployment가 존재하지 않습니다 (건너뜀)"
    fi
done

# --- 5. Istio CRD 매니페스트 적용 ---
info "=== Istio CRD 매니페스트 적용 ==="

if [ -d "${ISTIO_DIR}" ]; then
    for MANIFEST in "${ISTIO_DIR}"/*.yaml; do
        if [ -f "${MANIFEST}" ]; then
            info "적용: $(basename "${MANIFEST}")"
            kubectl apply -f "${MANIFEST}" -n "${NAMESPACE}"
        fi
    done
    info "Istio CRD 매니페스트 적용 완료"
else
    warn "istio/ 디렉토리가 존재하지 않습니다: ${ISTIO_DIR}"
    warn "PeerAuthentication, DestinationRule 등은 수동으로 적용하세요."
fi

# --- 6. 검증 ---
info "=== 설정 검증 ==="

# namespace 라벨 확인
NS_LABEL=$(kubectl get namespace "${NAMESPACE}" -o jsonpath='{.metadata.labels.istio-injection}' 2>/dev/null || echo "미설정")
info "namespace istio-injection 라벨: ${NS_LABEL}"

# 각 deployment의 annotation 확인
echo ""
info "--- Deployment sidecar annotation 현황 ---"
for DEPLOY in game-server ai-adapter frontend admin postgres redis ollama; do
    INJECT=$(kubectl get deployment "${DEPLOY}" -n "${NAMESPACE}" \
        -o jsonpath='{.spec.template.metadata.annotations.sidecar\.istio\.io/inject}' 2>/dev/null || echo "미설정")
    if [ "${INJECT}" = "true" ]; then
        info "  ${DEPLOY}: sidecar.istio.io/inject = ${INJECT} (적용 대상)"
    elif [ "${INJECT}" = "false" ]; then
        info "  ${DEPLOY}: sidecar.istio.io/inject = ${INJECT} (제외)"
    else
        warn "  ${DEPLOY}: sidecar.istio.io/inject = ${INJECT}"
    fi
done

# --- 7. Pod 재시작 안내 ---
echo ""
info "========================================="
info "  Istio 선별 injection 설정 완료"
info "========================================="
info ""
info "  적용 대상: game-server, ai-adapter"
info "  제외 대상: frontend, admin, postgres, redis, ollama"
info ""
info "  sidecar를 실제로 주입하려면 Pod를 재시작해야 합니다:"
info "    kubectl rollout restart deployment/game-server deployment/ai-adapter -n ${NAMESPACE}"
info ""
info "  재시작 후 확인:"
info "    kubectl get pods -n ${NAMESPACE}"
info "    (game-server, ai-adapter가 READY 2/2 이면 sidecar 주입 성공)"
info ""
info "  mTLS 확인 (istiod 경로 필요):"
info "    istioctl proxy-config cluster <game-server-pod> -n ${NAMESPACE}"
info "========================================="
