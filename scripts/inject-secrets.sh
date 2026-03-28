#!/bin/bash
# inject-secrets.sh — K8s 개발 환경 Secret 일괄 주입
# 사용법: bash scripts/inject-secrets.sh
#
# ArgoCD selfHeal이 Helm의 빈 값으로 덮어쓰는 것을 방지하기 위해
# argocd/application.yaml의 ignoreDifferences 설정이 필요하다.
# (이미 설정 완료 — argocd/application.yaml 참조)
#
# 주의: 아래 값은 개발 환경 전용. 운영 환경에서는 반드시 교체할 것.

set -e

NS=rummikub

echo "[1/3] postgres-secret 주입..."
kubectl create secret generic postgres-secret -n $NS \
  --from-literal=POSTGRES_USER=rummikub \
  --from-literal=POSTGRES_PASSWORD=REDACTED_DB_PASSWORD \
  --from-literal=POSTGRES_DB=rummikub \
  --dry-run=client -o yaml | kubectl apply -f -

echo "[2/3] game-server-secret 주입 (JWT_SECRET, DB_PASSWORD)..."
kubectl patch secret game-server-secret -n $NS \
  --type='json' \
  -p='[
    {"op":"replace","path":"/data/JWT_SECRET","value":"'"$(echo -n 'REDACTED_JWT_SECRET' | base64)"'"},
    {"op":"replace","path":"/data/DB_PASSWORD","value":"'"$(echo -n 'REDACTED_DB_PASSWORD' | base64)"'"}
  ]'

echo "[3/3] frontend-secret 주입 (NEXTAUTH_SECRET)..."
kubectl patch secret frontend-secret -n $NS \
  --type='json' \
  -p='[{"op":"replace","path":"/data/NEXTAUTH_SECRET","value":"'"$(echo -n 'REDACTED_NEXTAUTH_SECRET' | base64)"'"}]'

echo ""
echo "=== 완료 ==="
echo "주입된 Secret 목록:"
kubectl get secret -n $NS --no-headers | awk '{print "  -", $1}'
echo ""
echo "주입 후 파드 재시작이 필요하면:"
echo "  kubectl rollout restart deployment/game-server -n $NS"
echo "  kubectl rollout restart deployment/frontend -n $NS"
