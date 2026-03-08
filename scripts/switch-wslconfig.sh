#!/bin/bash
# ============================================================================
# WSL2 .wslconfig 프로젝트별 스위칭 스크립트
# ============================================================================
# 사용법:
#   bash scripts/switch-wslconfig.sh rummiarena   # RummiArena용 (10GB)
#   bash scripts/switch-wslconfig.sh hybrid-rag   # hybrid-rag용 (14GB)
#   bash scripts/switch-wslconfig.sh status       # 현재 설정 확인
#
# 적용 후 자동으로 wsl --shutdown 실행됨 (Docker Desktop 포함 재시작)
# ============================================================================

WSLCONFIG="/mnt/c/Users/KTDS/.wslconfig"
PROJECT_BASE="/mnt/d/Users/KTDS/Documents/06.과제"

RUMMIARENA_PROFILE="$PROJECT_BASE/RummiArena/.wslconfig.profile"
HYBRIDRAG_PROFILE="$PROJECT_BASE/hybrid-rag-knowledge-ops/.wslconfig.profile"

show_current() {
    echo "━━━ 현재 .wslconfig ━━━"
    cat "$WSLCONFIG"
    echo ""
    echo "━━━ WSL2 실제 상태 ━━━"
    echo "  CPU: $(nproc)코어"
    echo "  RAM: $(free -m | awk '/Mem:/{print $2}')MB"
    echo "  Swap: $(free -m | awk '/Swap:/{print $2}')MB"
}

apply_profile() {
    local profile_path="$1"
    local profile_name="$2"

    if [ ! -f "$profile_path" ]; then
        echo "[ERROR] 프로파일 없음: $profile_path"
        exit 1
    fi

    echo "━━━ .wslconfig 전환: $profile_name ━━━"
    echo ""
    echo "[변경 전]"
    cat "$WSLCONFIG"
    echo ""

    cp "$profile_path" "$WSLCONFIG"

    echo "[변경 후]"
    cat "$WSLCONFIG"
    echo ""
    echo "적용하려면 wsl --shutdown 필요합니다."
    echo "PowerShell에서 실행: wsl --shutdown"
    echo ""
    echo "⚠ 주의: 실행 중인 모든 WSL2 인스턴스와 Docker Desktop이 종료됩니다."
}

case "${1:-}" in
    rummiarena|rummi|ra)
        apply_profile "$RUMMIARENA_PROFILE" "RummiArena (10GB)"
        ;;
    hybrid-rag|hybrid|hr)
        apply_profile "$HYBRIDRAG_PROFILE" "hybrid-rag-knowledge-ops (14GB)"
        ;;
    status|st)
        show_current
        ;;
    *)
        echo "사용법: $0 {rummiarena|hybrid-rag|status}"
        echo ""
        echo "  rummiarena (ra)   RummiArena용 (10GB, K8s 개발)"
        echo "  hybrid-rag (hr)   hybrid-rag용 (14GB, 임베딩 파이프라인)"
        echo "  status (st)       현재 설정 확인"
        ;;
esac
