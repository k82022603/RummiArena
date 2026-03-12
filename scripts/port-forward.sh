#!/usr/bin/env bash
# scripts/port-forward.sh
# RummiArena 로컬 개발 환경 포트 포워딩 스크립트
# 사용법: ./scripts/port-forward.sh [traefik|argocd|all]
#
# 접속 URL:
#   Traefik Dashboard: http://localhost:9000/dashboard/
#   ArgoCD UI:        http://localhost:8080
#   ArgoCD (HTTPS):   https://localhost:8443

set -e

NAMESPACE_TRAEFIK="traefik"
NAMESPACE_ARGOCD="argocd"

port_forward_traefik() {
    echo "[INFO] Traefik Dashboard 포트 포워딩 시작: http://localhost:9000/dashboard/"
    kubectl port-forward svc/traefik -n "$NAMESPACE_TRAEFIK" 9000:9000 &
    TRAEFIK_PID=$!
    echo "[INFO] Traefik PID: $TRAEFIK_PID"
}

port_forward_argocd() {
    echo "[INFO] ArgoCD UI 포트 포워딩 시작: http://localhost:8080"
    kubectl port-forward svc/argocd-server -n "$NAMESPACE_ARGOCD" 8080:80 &
    ARGOCD_PID=$!
    echo "[INFO] ArgoCD PID: $ARGOCD_PID"
    echo "[INFO] 초기 admin 비밀번호:"
    kubectl -n "$NAMESPACE_ARGOCD" get secret argocd-initial-admin-secret \
        -o jsonpath="{.data.password}" 2>/dev/null | base64 -d && echo
}

cleanup() {
    echo ""
    echo "[INFO] 포트 포워딩 종료 중..."
    kill $TRAEFIK_PID 2>/dev/null || true
    kill $ARGOCD_PID 2>/dev/null || true
    echo "[INFO] 완료"
}

case "${1:-all}" in
    traefik)
        trap cleanup EXIT INT TERM
        port_forward_traefik
        echo "[INFO] Ctrl+C로 종료"
        wait
        ;;
    argocd)
        trap cleanup EXIT INT TERM
        port_forward_argocd
        echo "[INFO] Ctrl+C로 종료"
        wait
        ;;
    all|*)
        trap cleanup EXIT INT TERM
        port_forward_traefik
        port_forward_argocd
        echo ""
        echo "=== 포트 포워딩 활성 ==="
        echo "  Traefik Dashboard : http://localhost:9000/dashboard/"
        echo "  ArgoCD UI         : http://localhost:8080"
        echo "  ArgoCD admin PW   : 위 출력 참조"
        echo "========================="
        echo "[INFO] Ctrl+C로 모두 종료"
        wait
        ;;
esac
