#!/usr/bin/env bash
#
# scripts/istio-proxy-check.sh
# Istio 사이드카(Envoy) 상태 진단 스크립트 (RummiArena Phase 5.3)
#
# 설계 문서: docs/02-design/20-istio-selective-mesh-design.md
# 검증 문서: docs/05-deployment/08-istio-phase5.2-circuit-breaker-validation.md
#
# 목적:
#   game-server / ai-adapter Pod의 Envoy 사이드카 상태를 한 번에 덤프한다.
#   - xDS 설정 동기화(sync) 상태 (CDS/LDS/EDS/RDS)
#   - mTLS 체결 카운트(connection_security_policy=mutual_tls)
#   - outlier detection 상태(health_flags, rq_error, rq_total)
#   - 최근 응답 코드/플래그 분포(istio_requests_total)
#
# 사용법:
#   bash scripts/istio-proxy-check.sh [NAMESPACE] [POD_PATTERN]
#
#   # 예: rummikub 네임스페이스의 game-server, ai-adapter Pod 모두 점검
#   bash scripts/istio-proxy-check.sh rummikub
#   bash scripts/istio-proxy-check.sh rummikub game-server
#   bash scripts/istio-proxy-check.sh rummikub ai-adapter
#
# 기본값:
#   NAMESPACE   = rummikub
#   POD_PATTERN = "game-server|ai-adapter" (ADR-020 sidecar 주입 대상)
#
set -euo pipefail

# --- 설정 ---
NAMESPACE="${1:-rummikub}"
POD_PATTERN="${2:-game-server|ai-adapter}"

ISTIO_VERSION="${ISTIO_VERSION:-1.24.2}"
ISTIOCTL="${ISTIOCTL:-}"

# --- 색상 출력 ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()    { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; }
section() { echo -e "\n${BLUE}=== $* ===${NC}"; }

# --- 사전 조건: kubectl ---
if ! command -v kubectl &>/dev/null; then
    error "kubectl이 설치되어 있지 않습니다."
    exit 1
fi

# --- 사전 조건: istioctl (경로 자동 탐색) ---
if [ -z "${ISTIOCTL}" ]; then
    if command -v istioctl &>/dev/null; then
        ISTIOCTL="$(command -v istioctl)"
    elif [ -x "$HOME/.local/bin/istioctl" ]; then
        ISTIOCTL="$HOME/.local/bin/istioctl"
    elif [ -x "$HOME/istio-${ISTIO_VERSION}/bin/istioctl" ]; then
        ISTIOCTL="$HOME/istio-${ISTIO_VERSION}/bin/istioctl"
    else
        error "istioctl을 찾을 수 없습니다. scripts/istio-install.sh를 먼저 실행하거나"
        error "ISTIOCTL 환경 변수로 경로를 지정하세요."
        exit 1
    fi
fi
info "istioctl: ${ISTIOCTL}"
info "namespace: ${NAMESPACE}"
info "pod pattern: ${POD_PATTERN}"

# --- namespace 존재 확인 ---
if ! kubectl get namespace "${NAMESPACE}" &>/dev/null; then
    error "namespace '${NAMESPACE}'가 존재하지 않습니다."
    exit 1
fi

# --- sidecar 주입 대상 Pod 목록 수집 ---
PODS=$(kubectl get pods -n "${NAMESPACE}" \
    -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' 2>/dev/null \
    | grep -E "^(${POD_PATTERN})" || true)

if [ -z "${PODS}" ]; then
    warn "pattern '${POD_PATTERN}'에 매칭되는 Pod가 없습니다."
    warn "kubectl get pods -n ${NAMESPACE} 로 현재 Pod 목록을 확인하세요."
    exit 1
fi

# --- 0. xDS 동기화 상태 (전역) ---
section "0. xDS 동기화 상태 (istioctl proxy-status)"
"${ISTIOCTL}" proxy-status 2>&1 | grep -E "NAME|${POD_PATTERN}" || warn "proxy-status 조회 실패"

# --- Pod별 진단 ---
for POD in ${PODS}; do
    section "Pod: ${POD}"

    # sidecar 컨테이너 확인
    if ! kubectl get pod "${POD}" -n "${NAMESPACE}" \
         -o jsonpath='{.spec.containers[*].name}' 2>/dev/null | grep -q istio-proxy; then
        warn "  istio-proxy 컨테이너가 없습니다 (sidecar 미주입). 건너뜁니다."
        continue
    fi

    # 1. READY 상태 확인
    READY=$(kubectl get pod "${POD}" -n "${NAMESPACE}" \
        -o jsonpath='{.status.containerStatuses[*].ready}' 2>/dev/null)
    info "  containers ready: ${READY}"

    # 2. xDS 상세 동기화 상태
    echo "  -- xDS sync (CDS/LDS/EDS/RDS) --"
    "${ISTIOCTL}" proxy-status "${POD}.${NAMESPACE}" 2>&1 \
        | head -5 || warn "  proxy-status 조회 실패"

    # 3. mTLS 체결 카운트 (istio_requests_total 기준 connection_security_policy)
    echo "  -- mTLS 체결 카운트 (istio_requests_total) --"
    { kubectl exec -n "${NAMESPACE}" "${POD}" -c istio-proxy \
        -- pilot-agent request GET stats/prometheus 2>/dev/null \
        | { grep -E '^istio_requests_total' || true; }; } \
        | python3 -c "
import sys, re, collections
agg = collections.Counter()
for ln in sys.stdin:
    sec = re.search(r'connection_security_policy=\"([^\"]*)\"', ln)
    rep = re.search(r'reporter=\"([^\"]*)\"', ln)
    dst = re.search(r'destination_canonical_service=\"([^\"]*)\"', ln)
    val = ln.strip().rsplit(' ', 1)[-1]
    try: val = int(float(val))
    except: val = 0
    if sec and rep and dst:
        agg[(rep.group(1), dst.group(1), sec.group(1))] += val
if not agg:
    print('    (no traffic observed yet)')
else:
    print('    {:<12} {:<18} {:<15} {}'.format('reporter', 'dst_service', 'mTLS', 'count'))
    for k in sorted(agg):
        print('    {:<12} {:<18} {:<15} {}'.format(k[0], k[1], k[2], agg[k]))
" 2>/dev/null || warn "  stats 조회 실패"

    # 4. outlier detection + upstream endpoint 상태 (clusters endpoint)
    echo "  -- outlier detection & upstream health --"
    { kubectl exec -n "${NAMESPACE}" "${POD}" -c istio-proxy \
        -- pilot-agent request GET clusters 2>/dev/null \
        | { grep -E 'outbound\|[0-9]+\|\|(ai-adapter|game-server|postgres|redis)\.rummikub.*::(rq_error|rq_total|health_flags)' || true; } \
        | sed 's/^/    /' \
        | head -30; } || warn "  clusters 조회 실패"

    # 5. 응답 코드 / 플래그 분포 (최근 누적)
    echo "  -- 응답 코드/플래그 분포 (source reporter only) --"
    { kubectl exec -n "${NAMESPACE}" "${POD}" -c istio-proxy \
        -- pilot-agent request GET stats/prometheus 2>/dev/null \
        | { grep -E '^istio_requests_total.*reporter="source"' || true; }; } \
        | python3 -c "
import sys, re, collections
agg = collections.Counter()
for ln in sys.stdin:
    code = re.search(r'response_code=\"([^\"]*)\"', ln)
    flg  = re.search(r'response_flags=\"([^\"]*)\"', ln)
    dst  = re.search(r'destination_canonical_service=\"([^\"]*)\"', ln)
    val = ln.strip().rsplit(' ', 1)[-1]
    try: val = int(float(val))
    except: val = 0
    if code and flg and dst:
        agg[(dst.group(1), code.group(1), flg.group(1))] += val
if not agg:
    print('    (no outbound traffic observed yet)')
else:
    print('    {:<18} {:<6} {:<8} {}'.format('dst_service', 'code', 'flags', 'count'))
    for k in sorted(agg):
        print('    {:<18} {:<6} {:<8} {}'.format(k[0], k[1], k[2], agg[k]))
" 2>/dev/null || warn "  응답 코드 분포 조회 실패"
done

section "요약"
info "점검 완료: ${NAMESPACE} namespace, pattern '${POD_PATTERN}'"
info ""
info "해석 가이드:"
info "  - mTLS 'mutual_tls'가 0 이면 PeerAuthentication STRICT 미적용 또는 비-mesh 트래픽"
info "  - response_flags 'UH'  = Upstream Unhealthy (outlier 차단, 서킷 OPEN)"
info "  - response_flags 'URX' = Upstream Retry Exceeded (VirtualService retries 소진)"
info "  - response_flags 'UF'  = Upstream Failure (연결 실패)"
info "  - response_flags 'FI'  = Fault Injection (EnvoyFilter/VS 주입된 장애)"
info "  - response_flags '-'   = 정상"
info ""
info "참고:"
info "  상세 Envoy stats: kubectl exec -n ${NAMESPACE} <pod> -c istio-proxy -- \\"
info "                    pilot-agent request GET stats"
info "  설정 덤프:         ${ISTIOCTL} proxy-config [cluster|route|listener|endpoint] <pod>.${NAMESPACE}"
