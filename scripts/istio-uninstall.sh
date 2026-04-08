#!/usr/bin/env bash
#
# scripts/istio-uninstall.sh
# Istio 완전 제거 + 롤백 스크립트 (RummiArena Phase 5 Rollback)
#
# 설계 문서: docs/02-design/20-istio-selective-mesh-design.md Section 9.3
#
# 수행 내용:
#   1. Istio CRD 리소스 삭제 (PeerAuthentication, DestinationRule, VirtualService)
#   2. sidecar injection annotation 제거 (game-server, ai-adapter)
#   3. 제외 대상의 opt-out annotation 제거
#   4. namespace 라벨 제거
#   5. 영향받은 Pod 재시작 (sidecar 제거)
#   6. Istio 완전 제거 (istioctl uninstall --purge)
#   7. istio-system namespace 삭제
#
# 멱등성: 이미 제거된 리소스는 건너뛴다.
# 사용법: bash scripts/istio-uninstall.sh [--skip-istiod]
#
# 옵션:
#   --skip-istiod   istiod 제거를 건너뛰고 sidecar만 제거 (부분 롤백)
#
set -euo pipefail

NAMESPACE="${NAMESPACE:-rummikub}"
SKIP_ISTIOD=false

# 인자 파싱
for arg in "$@"; do
    case "${arg}" in
        --skip-istiod) SKIP_ISTIOD=true ;;
        *) echo "알 수 없는 옵션: ${arg}"; exit 1 ;;
    esac
done

# istioctl 경로 탐색
ISTIO_VERSION="${ISTIO_VERSION:-1.24.2}"
ISTIOCTL="${ISTIO_DIR:-$HOME/istio-${ISTIO_VERSION}}/bin/istioctl"
if [ ! -f "${ISTIOCTL}" ]; then
    ISTIOCTL=$(command -v istioctl 2>/dev/null || echo "")
fi

# --- 색상 출력 ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

# --- 1. 사전 확인 ---
info "=== Istio 제거/롤백 시작 ==="
if [ "${SKIP_ISTIOD}" = true ]; then
    info "모드: 부분 롤백 (sidecar만 제거, istiod 유지)"
else
    info "모드: 완전 제거 (istiod + sidecar + CRD 모두 제거)"
fi

if ! kubectl get namespace "${NAMESPACE}" &>/dev/null; then
    warn "namespace '${NAMESPACE}'이 존재하지 않습니다. 건너뜁니다."
else
    info "namespace '${NAMESPACE}' 확인 완료"
fi

# --- 2. Istio CRD 리소스 삭제 ---
info "=== Istio CRD 리소스 삭제 ==="

# PeerAuthentication 삭제
PA_COUNT=$(kubectl get peerauthentication -n "${NAMESPACE}" --no-headers 2>/dev/null | wc -l || echo "0")
if [ "${PA_COUNT}" -gt 0 ]; then
    kubectl delete peerauthentication --all -n "${NAMESPACE}" 2>/dev/null || true
    info "PeerAuthentication ${PA_COUNT}개 삭제 완료"
else
    info "PeerAuthentication: 없음 (건너뜀)"
fi

# DestinationRule 삭제
DR_COUNT=$(kubectl get destinationrule -n "${NAMESPACE}" --no-headers 2>/dev/null | wc -l || echo "0")
if [ "${DR_COUNT}" -gt 0 ]; then
    kubectl delete destinationrule --all -n "${NAMESPACE}" 2>/dev/null || true
    info "DestinationRule ${DR_COUNT}개 삭제 완료"
else
    info "DestinationRule: 없음 (건너뜀)"
fi

# VirtualService 삭제
VS_COUNT=$(kubectl get virtualservice -n "${NAMESPACE}" --no-headers 2>/dev/null | wc -l || echo "0")
if [ "${VS_COUNT}" -gt 0 ]; then
    kubectl delete virtualservice --all -n "${NAMESPACE}" 2>/dev/null || true
    info "VirtualService ${VS_COUNT}개 삭제 완료"
else
    info "VirtualService: 없음 (건너뜀)"
fi

# --- 3. sidecar injection annotation 제거 (적용 대상) ---
info "=== sidecar injection annotation 제거 ==="

INJECT_DEPLOYMENTS=("game-server" "ai-adapter")
SIDECAR_ANNOTATIONS=(
    "sidecar.istio.io/inject"
    "sidecar.istio.io/proxyCPU"
    "sidecar.istio.io/proxyCPULimit"
    "sidecar.istio.io/proxyMemory"
    "sidecar.istio.io/proxyMemoryLimit"
)

for DEPLOY in "${INJECT_DEPLOYMENTS[@]}"; do
    if kubectl get deployment "${DEPLOY}" -n "${NAMESPACE}" &>/dev/null 2>&1; then
        # 각 annotation을 개별 제거
        for ANNO in "${SIDECAR_ANNOTATIONS[@]}"; do
            kubectl patch deployment "${DEPLOY}" -n "${NAMESPACE}" --type='json' \
                -p="[{\"op\": \"remove\", \"path\": \"/spec/template/metadata/annotations/${ANNO//\//~1}\"}]" \
                2>/dev/null || true
        done
        info "${DEPLOY}: sidecar annotation 제거 완료"
    else
        warn "${DEPLOY}: deployment가 존재하지 않습니다 (건너뜀)"
    fi
done

# --- 4. 제외 대상의 opt-out annotation 제거 ---
info "=== opt-out annotation 제거 ==="

EXCLUDE_DEPLOYMENTS=("frontend" "admin" "postgres" "redis" "ollama")

for DEPLOY in "${EXCLUDE_DEPLOYMENTS[@]}"; do
    if kubectl get deployment "${DEPLOY}" -n "${NAMESPACE}" &>/dev/null 2>&1; then
        kubectl patch deployment "${DEPLOY}" -n "${NAMESPACE}" --type='json' \
            -p='[{"op": "remove", "path": "/spec/template/metadata/annotations/sidecar.istio.io~1inject"}]' \
            2>/dev/null || true
        info "${DEPLOY}: opt-out annotation 제거 완료"
    else
        warn "${DEPLOY}: deployment가 존재하지 않습니다 (건너뜀)"
    fi
done

# --- 5. namespace 라벨 제거 ---
info "=== namespace 라벨 제거 ==="

kubectl label namespace "${NAMESPACE}" istio-injection- 2>/dev/null || true
kubectl label namespace "${NAMESPACE}" istio.io/rev- 2>/dev/null || true
info "namespace '${NAMESPACE}' Istio 라벨 제거 완료"

# --- 6. 영향받은 Pod 재시작 (sidecar 제거) ---
info "=== 영향받은 Pod 재시작 ==="

for DEPLOY in "${INJECT_DEPLOYMENTS[@]}"; do
    if kubectl get deployment "${DEPLOY}" -n "${NAMESPACE}" &>/dev/null 2>&1; then
        kubectl rollout restart deployment/"${DEPLOY}" -n "${NAMESPACE}"
        info "${DEPLOY}: rollout restart 실행"
    fi
done

# Pod 재시작 대기
info "Pod 재시작 대기 중 (최대 120초)..."
for DEPLOY in "${INJECT_DEPLOYMENTS[@]}"; do
    if kubectl get deployment "${DEPLOY}" -n "${NAMESPACE}" &>/dev/null 2>&1; then
        kubectl rollout status deployment/"${DEPLOY}" -n "${NAMESPACE}" --timeout=120s 2>/dev/null || \
            warn "${DEPLOY}: 120초 내에 롤아웃이 완료되지 않았습니다."
    fi
done

# sidecar 제거 확인
info "Pod READY 상태 확인:"
for DEPLOY in "${INJECT_DEPLOYMENTS[@]}"; do
    READY=$(kubectl get pods -l app="${DEPLOY}" -n "${NAMESPACE}" --no-headers 2>/dev/null | awk '{print $2}' | head -1 || echo "N/A")
    if [ "${READY}" = "1/1" ]; then
        info "  ${DEPLOY}: READY ${READY} (sidecar 제거 완료)"
    elif [ "${READY}" = "2/2" ]; then
        warn "  ${DEPLOY}: READY ${READY} (sidecar가 아직 존재합니다)"
    else
        warn "  ${DEPLOY}: READY ${READY}"
    fi
done

# --- 7. Istio 완전 제거 (선택) ---
if [ "${SKIP_ISTIOD}" = false ]; then
    info "=== Istio 완전 제거 ==="

    if [ -n "${ISTIOCTL}" ] && [ -f "${ISTIOCTL}" ]; then
        info "istioctl uninstall --purge 실행..."
        "${ISTIOCTL}" uninstall --purge -y 2>&1 || warn "istioctl uninstall에서 경고가 있습니다."
    else
        warn "istioctl을 찾을 수 없습니다. kubectl로 직접 제거합니다."
        # istiod deployment 삭제
        kubectl delete deployment istiod -n istio-system 2>/dev/null || true
        kubectl delete service istiod -n istio-system 2>/dev/null || true
        # MutatingWebhookConfiguration 삭제
        kubectl delete mutatingwebhookconfiguration istio-sidecar-injector 2>/dev/null || true
        kubectl delete validatingwebhookconfiguration istio-validator-istio-system 2>/dev/null || true
    fi

    # istio-system namespace 삭제
    if kubectl get namespace istio-system &>/dev/null; then
        info "istio-system namespace 삭제..."
        kubectl delete namespace istio-system --timeout=60s 2>/dev/null || \
            warn "istio-system namespace 삭제가 60초 내에 완료되지 않았습니다."
    fi

    # Istio CRD 삭제 여부 확인 (CRD는 다른 리소스에 영향을 줄 수 있으므로 안내만)
    ISTIO_CRDS=$(kubectl get crd 2>/dev/null | grep 'istio.io' | wc -l || echo "0")
    if [ "${ISTIO_CRDS}" -gt 0 ]; then
        warn "Istio CRD ${ISTIO_CRDS}개가 남아있습니다."
        warn "완전 삭제하려면: kubectl get crd | grep istio.io | awk '{print \$1}' | xargs kubectl delete crd"
        warn "CRD를 남겨두면 나중에 Istio 재설치가 빠릅니다."
    fi

    info "Istio 완전 제거 완료"
else
    info "=== istiod 제거 건너뜀 (--skip-istiod) ==="
fi

# --- 8. 요약 ---
echo ""
info "========================================="
info "  Istio 제거/롤백 완료"
info "========================================="
if [ "${SKIP_ISTIOD}" = true ]; then
    info "  모드:     부분 롤백 (sidecar만 제거)"
    info "  istiod:   유지됨"
else
    info "  모드:     완전 제거"
    info "  istiod:   제거됨"
fi
info "  CRD 삭제: PeerAuthentication, DestinationRule, VirtualService"
info "  sidecar:  game-server, ai-adapter에서 제거됨"
info "  라벨:     namespace Istio 라벨 제거됨"
info ""
info "  확인 명령:"
info "    kubectl get pods -n ${NAMESPACE}          (모든 Pod READY 1/1)"
info "    kubectl get pods -n istio-system          (비어있어야 함)"
info "    kubectl get ns istio-system               (없어야 함)"
info ""
info "  Helm values 복원:"
info "    istio-values.yaml를 ArgoCD valueFiles에서 제거하거나,"
info "    game-server/ai-adapter values.yaml에서 istio.enabled: false로 변경"
info "========================================="
