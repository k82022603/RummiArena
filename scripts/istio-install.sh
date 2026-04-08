#!/usr/bin/env bash
#
# scripts/istio-install.sh
# Istio minimal profile 설치 스크립트 (RummiArena Phase 5.0)
#
# 설계 문서: docs/02-design/20-istio-selective-mesh-design.md
# ADR-020: Istio 선별 적용 (game-server + ai-adapter 2 Pod만)
#
# 16GB RAM(WSL2 10GB) 제약 환경을 위한 최소 설치:
#   - istiod만 설치 (Ingress Gateway 미설치 -- Traefik 유지)
#   - istiod 리소스: 128Mi req / 256Mi lim, 50m CPU req / 200m lim
#   - 추가 메모리 예상: ~180Mi (istiod만)
#
# 멱등성: 이미 설치되어 있으면 업그레이드를 수행한다.
# 사용법: bash scripts/istio-install.sh
#
set -euo pipefail

# --- 설정 ---
ISTIO_VERSION="${ISTIO_VERSION:-1.24.2}"
ISTIO_DIR="${ISTIO_DIR:-$HOME/istio-${ISTIO_VERSION}}"
ISTIOCTL="${ISTIO_DIR}/bin/istioctl"

# istiod 리소스 제한 (설계 문서 Section 3.1 기준)
PILOT_MEMORY_REQUEST="128Mi"
PILOT_MEMORY_LIMIT="256Mi"
PILOT_CPU_REQUEST="50m"
PILOT_CPU_LIMIT="200m"

# --- 색상 출력 ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

# --- 1. 사전 조건 확인 ---
info "=== Istio 설치 사전 조건 확인 ==="

# kubectl 확인
if ! command -v kubectl &>/dev/null; then
    error "kubectl이 설치되어 있지 않습니다."
    exit 1
fi
info "kubectl 확인 완료: $(kubectl version --client --short 2>/dev/null || kubectl version --client -o yaml | head -3)"

# K8s 클러스터 접근 확인
if ! kubectl cluster-info &>/dev/null; then
    error "Kubernetes 클러스터에 접근할 수 없습니다. Docker Desktop K8s가 실행 중인지 확인하세요."
    exit 1
fi
info "Kubernetes 클러스터 접근 확인 완료"

# 현재 메모리 확인 (참고용)
NODE_MEM=$(kubectl top nodes --no-headers 2>/dev/null | awk '{print $4}' || echo "측정불가")
info "현재 노드 메모리 사용량: ${NODE_MEM}"

# --- 2. istioctl 설치 ---
info "=== istioctl ${ISTIO_VERSION} 설치 확인 ==="

if [ -f "${ISTIOCTL}" ]; then
    INSTALLED_VERSION=$("${ISTIOCTL}" version --remote=false 2>/dev/null || echo "unknown")
    info "istioctl이 이미 설치되어 있습니다: ${INSTALLED_VERSION}"
else
    info "istioctl ${ISTIO_VERSION} 다운로드 시작..."

    cd /tmp
    if [ -f "istio-${ISTIO_VERSION}-linux-amd64.tar.gz" ]; then
        info "기존 다운로드 파일 사용"
    else
        curl -sL "https://github.com/istio/istio/releases/download/${ISTIO_VERSION}/istio-${ISTIO_VERSION}-linux-amd64.tar.gz" \
            -o "istio-${ISTIO_VERSION}-linux-amd64.tar.gz"
    fi

    # 기존 디렉토리가 있으면 삭제
    rm -rf "${ISTIO_DIR}"
    tar xzf "istio-${ISTIO_VERSION}-linux-amd64.tar.gz" -C "$(dirname "${ISTIO_DIR}")"

    if [ ! -f "${ISTIOCTL}" ]; then
        error "istioctl 바이너리를 찾을 수 없습니다: ${ISTIOCTL}"
        exit 1
    fi

    chmod +x "${ISTIOCTL}"
    info "istioctl 설치 완료: ${ISTIO_DIR}"

    # PATH 안내
    if ! echo "$PATH" | grep -q "${ISTIO_DIR}/bin"; then
        warn "PATH에 추가하려면: export PATH=${ISTIO_DIR}/bin:\$PATH"
    fi
fi

# 버전 확인
info "istioctl 버전: $("${ISTIOCTL}" version --remote=false 2>/dev/null)"

# --- 3. 사전 검증 (precheck) ---
info "=== Istio 사전 검증 (precheck) ==="
if ! "${ISTIOCTL}" x precheck 2>&1; then
    warn "precheck 경고가 있습니다. 위 출력을 확인하세요."
    warn "심각한 오류가 아니라면 설치를 계속합니다."
fi

# --- 4. Istio minimal 프로파일 설치 ---
info "=== Istio minimal 프로파일 설치 ==="
info "프로파일: minimal (istiod만, Gateway 없음)"
info "리소스: Memory ${PILOT_MEMORY_REQUEST}/${PILOT_MEMORY_LIMIT}, CPU ${PILOT_CPU_REQUEST}/${PILOT_CPU_LIMIT}"

# IstioOperator 설정 파일 생성 (멱등 설치/업그레이드용)
OPERATOR_YAML="/tmp/istio-minimal-operator.yaml"
cat > "${OPERATOR_YAML}" <<'YAMLEOF'
apiVersion: install.istio.io/v1alpha1
kind: IstioOperator
metadata:
  name: rummiarena-minimal
  namespace: istio-system
spec:
  profile: minimal

  # Ingress Gateway 비활성화 (Traefik이 North-South 전담)
  components:
    ingressGateways:
      - name: istio-ingressgateway
        enabled: false
    egressGateways:
      - name: istio-egressgateway
        enabled: false

  # istiod (Pilot) 리소스 제한
  values:
    pilot:
      resources:
        requests:
          memory: PILOT_MEMORY_REQUEST_PLACEHOLDER
          cpu: PILOT_CPU_REQUEST_PLACEHOLDER
        limits:
          memory: PILOT_MEMORY_LIMIT_PLACEHOLDER
          cpu: PILOT_CPU_LIMIT_PLACEHOLDER
      # 로그 레벨 (디버깅 시 debug로 변경)
      env:
        PILOT_LOG_LEVEL: "info"

    # 글로벌 sidecar 기본 리소스 (Pod annotation으로 오버라이드 가능)
    global:
      proxy:
        resources:
          requests:
            memory: "64Mi"
            cpu: "50m"
          limits:
            memory: "128Mi"
            cpu: "200m"
      # Sidecar injection 기본 비활성화
      # Pod-level annotation으로 선별 활성화
      proxy_init:
        resources:
          requests:
            memory: "32Mi"
            cpu: "10m"
          limits:
            memory: "64Mi"
            cpu: "50m"

  # MeshConfig
  meshConfig:
    # 기본적으로 sidecar injection 비활성화
    defaultConfig:
      holdApplicationUntilProxyStarts: true
    # Access log (디버깅용, 필요시 활성화)
    # accessLogFile: /dev/stdout
    # accessLogEncoding: JSON
YAMLEOF

# 플레이스홀더 치환
sed -i "s|PILOT_MEMORY_REQUEST_PLACEHOLDER|${PILOT_MEMORY_REQUEST}|g" "${OPERATOR_YAML}"
sed -i "s|PILOT_MEMORY_LIMIT_PLACEHOLDER|${PILOT_MEMORY_LIMIT}|g" "${OPERATOR_YAML}"
sed -i "s|PILOT_CPU_REQUEST_PLACEHOLDER|${PILOT_CPU_REQUEST}|g" "${OPERATOR_YAML}"
sed -i "s|PILOT_CPU_LIMIT_PLACEHOLDER|${PILOT_CPU_LIMIT}|g" "${OPERATOR_YAML}"

info "IstioOperator 설정 파일: ${OPERATOR_YAML}"

# 기존 Istio 설치 여부 확인
if kubectl get namespace istio-system &>/dev/null && \
   kubectl get deployment istiod -n istio-system &>/dev/null 2>&1; then
    info "기존 Istio 설치가 감지되었습니다. 업그레이드를 수행합니다."
fi

# 설치 (멱등 -- 이미 설치된 경우 업그레이드)
"${ISTIOCTL}" install -f "${OPERATOR_YAML}" -y

# --- 5. 설치 검증 ---
info "=== Istio 설치 검증 ==="

# istio-system namespace 확인
if ! kubectl get namespace istio-system &>/dev/null; then
    error "istio-system namespace가 생성되지 않았습니다."
    exit 1
fi
info "istio-system namespace 확인 완료"

# istiod Pod 대기
info "istiod Pod Ready 대기 중 (최대 120초)..."
if kubectl wait --for=condition=Ready pod -l app=istiod -n istio-system --timeout=120s; then
    info "istiod Pod가 Ready 상태입니다."
else
    error "istiod Pod가 120초 내에 Ready 상태가 되지 않았습니다."
    kubectl get pods -n istio-system
    exit 1
fi

# Pod 상태 출력
info "istio-system Pod 목록:"
kubectl get pods -n istio-system -o wide

# 리소스 사용량 확인 (약간 대기 후)
sleep 5
info "istiod 리소스 사용량:"
kubectl top pods -n istio-system 2>/dev/null || warn "메트릭 수집 대기 중 (1~2분 후 kubectl top pods -n istio-system 으로 확인)"

# Ingress Gateway가 설치되지 않았는지 확인
if kubectl get deployment istio-ingressgateway -n istio-system &>/dev/null 2>&1; then
    warn "Istio Ingress Gateway가 감지되었습니다. 설계상 미설치가 정상입니다."
    warn "Traefik과 충돌할 수 있으므로 확인이 필요합니다."
else
    info "Istio Ingress Gateway 미설치 확인 (Traefik이 North-South 전담)"
fi

# istioctl verify-install
info "설치 무결성 검증:"
"${ISTIOCTL}" verify-install -f "${OPERATOR_YAML}" 2>&1 || warn "verify-install에서 경고가 있습니다."

# --- 6. 요약 ---
echo ""
info "========================================="
info "  Istio ${ISTIO_VERSION} minimal 설치 완료"
info "========================================="
info "  프로파일:         minimal (istiod만)"
info "  Ingress Gateway:  미설치 (Traefik 유지)"
info "  istiod Memory:    ${PILOT_MEMORY_REQUEST} req / ${PILOT_MEMORY_LIMIT} lim"
info "  istiod CPU:       ${PILOT_CPU_REQUEST} req / ${PILOT_CPU_LIMIT} lim"
info "  istioctl 경로:    ${ISTIOCTL}"
info ""
info "  다음 단계:"
info "    1. bash scripts/istio-namespace-label.sh   (namespace 라벨링 + sidecar annotation)"
info "    2. kubectl rollout restart deployment/game-server deployment/ai-adapter -n rummikub"
info "    3. kubectl get pods -n rummikub (READY 2/2 확인)"
info "========================================="
