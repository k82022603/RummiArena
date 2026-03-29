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

# src/frontend/.env.local 에서 Google OAuth 값 자동 로드
ENVLOCAL="$(dirname "$0")/../src/frontend/.env.local"
if [ -f "$ENVLOCAL" ]; then
  GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-$(grep '^GOOGLE_CLIENT_ID=' "$ENVLOCAL" | cut -d= -f2-)}"
  GOOGLE_CLIENT_SECRET="${GOOGLE_CLIENT_SECRET:-$(grep '^GOOGLE_CLIENT_SECRET=' "$ENVLOCAL" | cut -d= -f2-)}"
fi

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

# Google OAuth 자격증명 주입 (선택 — Google Cloud Console에서 발급 후 사용)
# 사용법:
#   GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com" \
#   GOOGLE_CLIENT_SECRET="your-client-secret" \
#   bash scripts/inject-secrets.sh
if [ -n "${GOOGLE_CLIENT_ID}" ] && [ -n "${GOOGLE_CLIENT_SECRET}" ]; then
  echo "[4/4] Google OAuth 자격증명 주입 (frontend + game-server)..."

  GID_B64=$(printf '%s' "${GOOGLE_CLIENT_ID}" | base64 -w 0)
  GSECRET_B64=$(printf '%s' "${GOOGLE_CLIENT_SECRET}" | base64 -w 0)

  # frontend: ConfigMap에 GOOGLE_CLIENT_ID 패치
  # 키가 없을 수도 있으므로 replace 실패 시 add 로 폴백한다.
  # (values.yaml에서 GOOGLE_CLIENT_ID 키를 제거했기 때문에 ArgoCD sync 후 키 자체가 없을 수 있음)
  if kubectl get configmap frontend-config -n $NS -o jsonpath='{.data.GOOGLE_CLIENT_ID}' &>/dev/null 2>&1; then
    kubectl patch configmap frontend-config -n $NS \
      --type='json' \
      -p="[{\"op\":\"replace\",\"path\":\"/data/GOOGLE_CLIENT_ID\",\"value\":\"${GOOGLE_CLIENT_ID}\"}]" 2>/dev/null || \
    kubectl patch configmap frontend-config -n $NS \
      --type='json' \
      -p="[{\"op\":\"add\",\"path\":\"/data/GOOGLE_CLIENT_ID\",\"value\":\"${GOOGLE_CLIENT_ID}\"}]"
  else
    kubectl patch configmap frontend-config -n $NS \
      --type='json' \
      -p="[{\"op\":\"add\",\"path\":\"/data/GOOGLE_CLIENT_ID\",\"value\":\"${GOOGLE_CLIENT_ID}\"}]"
  fi

  # frontend: Secret에 GOOGLE_CLIENT_SECRET 패치
  kubectl patch secret frontend-secret -n $NS \
    --type='json' \
    -p="[{\"op\":\"replace\",\"path\":\"/data/GOOGLE_CLIENT_SECRET\",\"value\":\"${GSECRET_B64}\"}]"

  # game-server: Secret에 GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET 패치
  # (game-server도 id_token → game JWT 교환 시 GOOGLE_CLIENT_ID 필요)
  kubectl patch secret game-server-secret -n $NS \
    --type='json' \
    -p="[
      {\"op\":\"replace\",\"path\":\"/data/GOOGLE_CLIENT_ID\",\"value\":\"${GID_B64}\"},
      {\"op\":\"replace\",\"path\":\"/data/GOOGLE_CLIENT_SECRET\",\"value\":\"${GSECRET_B64}\"}
    ]"

  echo "    Google OAuth 자격증명 주입 완료 (frontend + game-server)"
  echo "    frontend + game-server 파드 재시작..."
  kubectl rollout restart deployment/frontend deployment/game-server -n $NS
  kubectl rollout status deployment/frontend -n $NS --timeout=60s
  kubectl rollout status deployment/game-server -n $NS --timeout=60s
else
  echo ""
  echo "[Google OAuth 미설정] src/frontend/.env.local에 값이 없거나 환경변수가 전달되지 않았습니다."
  echo "  현재 상태: Google 버튼 비활성화, 게스트 로그인은 정상 동작"
fi

echo ""
echo "=== 완료 ==="
echo "주입된 Secret 목록:"
kubectl get secret -n $NS --no-headers | awk '{print "  -", $1}'
echo ""
echo "주입 후 파드 재시작이 필요하면:"
echo "  kubectl rollout restart deployment/game-server -n $NS"
echo "  kubectl rollout restart deployment/frontend -n $NS"
