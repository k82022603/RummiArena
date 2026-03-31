#!/bin/bash
# inject-secrets.sh — K8s 개발 환경 Secret 일괄 주입
# 사용법: bash scripts/inject-secrets.sh
#
# 시크릿 우선순위:
#   1) 환경변수로 직접 전달  (JWT_SECRET=xxx bash scripts/inject-secrets.sh)
#   2) src/frontend/.env.local 파일 (Google OAuth 전용)
#   2) src/ai-adapter/.env 파일 (LLM API 키 전용)
#   3) 미설정 시 openssl rand -base64 32 로 랜덤 생성 (경고 출력)
#
# 관리 대상 Secret (5개):
#   [1/5] postgres-secret     — DB 접속 정보
#   [2/5] game-server-secret  — JWT, DB 비밀번호, Google OAuth
#   [3/5] frontend-secret     — NextAuth, Google OAuth
#   [4/5] ai-adapter-secret   — OpenAI, Claude, DeepSeek API 키
#   [5/5] Google OAuth        — frontend + game-server (선택)
#
# ArgoCD selfHeal이 Helm의 빈 값으로 덮어쓰는 것을 방지하기 위해
# argocd/application.yaml의 ignoreDifferences 설정이 필요하다.
# (이미 설정 완료 — argocd/application.yaml 참조)

set -e

NS=rummikub

# ── 환경변수 체크 헬퍼 ──────────────────────────────────────────────────────
# $1: 변수명, $2: 현재 값
# 값이 없으면 경고를 출력하고 랜덤 값을 반환한다.
require_secret() {
  local var_name="$1"
  local var_value="$2"
  if [ -z "$var_value" ]; then
    local generated
    generated="$(openssl rand -base64 32)"
    echo "[WARNING] ${var_name} 환경변수가 설정되지 않았습니다. 랜덤 값으로 생성합니다." >&2
    echo "[WARNING]   → 이 값은 Pod 재시작 시 유지되지만, 스크립트 재실행 시 변경됩니다." >&2
    echo "[WARNING]   → 영구 사용을 원하면 환경변수로 전달하세요: export ${var_name}=<value>" >&2
    printf '%s' "$generated"
  else
    printf '%s' "$var_value"
  fi
}

# ── src/frontend/.env.local 에서 Google OAuth 값 자동 로드 ─────────────────
ENVLOCAL="$(dirname "$0")/../src/frontend/.env.local"
if [ -f "$ENVLOCAL" ]; then
  GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-$(grep '^GOOGLE_CLIENT_ID=' "$ENVLOCAL" | cut -d= -f2-)}"
  GOOGLE_CLIENT_SECRET="${GOOGLE_CLIENT_SECRET:-$(grep '^GOOGLE_CLIENT_SECRET=' "$ENVLOCAL" | cut -d= -f2-)}"
fi

# ── 시크릿 값 결정 (환경변수 우선, 없으면 랜덤 생성) ─────────────────────
DB_PASSWORD_VAL="$(require_secret DB_PASSWORD "${DB_PASSWORD:-}")"
JWT_SECRET_VAL="$(require_secret JWT_SECRET "${JWT_SECRET:-}")"
NEXTAUTH_SECRET_VAL="$(require_secret NEXTAUTH_SECRET "${NEXTAUTH_SECRET:-}")"

# ── src/ai-adapter/.env 에서 LLM API 키 자동 로드 ────────────────────────
AI_ENVFILE="$(dirname "$0")/../src/ai-adapter/.env"
if [ -f "$AI_ENVFILE" ]; then
  OPENAI_API_KEY="${OPENAI_API_KEY:-$(grep '^OPENAI_API_KEY=' "$AI_ENVFILE" | cut -d= -f2-)}"
  CLAUDE_API_KEY="${CLAUDE_API_KEY:-$(grep '^CLAUDE_API_KEY=' "$AI_ENVFILE" | cut -d= -f2-)}"
  DEEPSEEK_API_KEY="${DEEPSEEK_API_KEY:-$(grep '^DEEPSEEK_API_KEY=' "$AI_ENVFILE" | cut -d= -f2-)}"
fi

echo "[1/5] postgres-secret 주입..."
kubectl create secret generic postgres-secret -n $NS \
  --from-literal=POSTGRES_USER=rummikub \
  --from-literal=POSTGRES_PASSWORD="${DB_PASSWORD_VAL}" \
  --from-literal=POSTGRES_DB=rummikub \
  --dry-run=client -o yaml | kubectl apply -f -

echo "[2/5] game-server-secret 주입 (JWT_SECRET, DB_PASSWORD)..."
kubectl patch secret game-server-secret -n $NS \
  --type='json' \
  -p='[
    {"op":"replace","path":"/data/JWT_SECRET","value":"'"$(printf '%s' "${JWT_SECRET_VAL}" | base64 -w 0)"'"},
    {"op":"replace","path":"/data/DB_PASSWORD","value":"'"$(printf '%s' "${DB_PASSWORD_VAL}" | base64 -w 0)"'"}
  ]'

echo "[3/5] frontend-secret 주입 (NEXTAUTH_SECRET)..."
kubectl patch secret frontend-secret -n $NS \
  --type='json' \
  -p='[{"op":"replace","path":"/data/NEXTAUTH_SECRET","value":"'"$(printf '%s' "${NEXTAUTH_SECRET_VAL}" | base64 -w 0)"'"}]'

echo "[4/5] ai-adapter-secret 주입 (LLM API 키)..."
# 3개 키 중 하나라도 설정되어 있으면 패치를 시도한다.
# 키가 없으면 경고만 출력하고 건너뛴다 (강제 실패 아님).
_AI_PATCH_OPS=""
_AI_KEY_COUNT=0

if [ -n "${OPENAI_API_KEY:-}" ]; then
  _AI_PATCH_OPS="${_AI_PATCH_OPS}{\"op\":\"replace\",\"path\":\"/data/OPENAI_API_KEY\",\"value\":\"$(printf '%s' "${OPENAI_API_KEY}" | base64 -w 0)\"},"
  _AI_KEY_COUNT=$((_AI_KEY_COUNT + 1))
else
  echo "    [WARNING] OPENAI_API_KEY 미설정 — 건너뜀"
fi

if [ -n "${CLAUDE_API_KEY:-}" ]; then
  _AI_PATCH_OPS="${_AI_PATCH_OPS}{\"op\":\"replace\",\"path\":\"/data/CLAUDE_API_KEY\",\"value\":\"$(printf '%s' "${CLAUDE_API_KEY}" | base64 -w 0)\"},"
  _AI_KEY_COUNT=$((_AI_KEY_COUNT + 1))
else
  echo "    [WARNING] CLAUDE_API_KEY 미설정 — 건너뜀"
fi

if [ -n "${DEEPSEEK_API_KEY:-}" ]; then
  _AI_PATCH_OPS="${_AI_PATCH_OPS}{\"op\":\"replace\",\"path\":\"/data/DEEPSEEK_API_KEY\",\"value\":\"$(printf '%s' "${DEEPSEEK_API_KEY}" | base64 -w 0)\"},"
  _AI_KEY_COUNT=$((_AI_KEY_COUNT + 1))
else
  echo "    [WARNING] DEEPSEEK_API_KEY 미설정 — 건너뜀"
fi

if [ "$_AI_KEY_COUNT" -gt 0 ]; then
  # 마지막 콤마 제거
  _AI_PATCH_OPS="[${_AI_PATCH_OPS%,}]"
  kubectl patch secret ai-adapter-secret -n $NS \
    --type='json' \
    -p="${_AI_PATCH_OPS}"
  echo "    ai-adapter-secret 주입 완료 (${_AI_KEY_COUNT}개 키)"
  echo "    ai-adapter 파드 재시작..."
  kubectl rollout restart deployment/ai-adapter -n $NS
  kubectl rollout status deployment/ai-adapter -n $NS --timeout=60s
else
  echo "    [SKIP] LLM API 키가 하나도 설정되지 않았습니다."
  echo "    → src/ai-adapter/.env 파일에 값을 넣거나, 환경변수로 전달하세요."
  echo "    → 예: OPENAI_API_KEY=sk-xxx bash scripts/inject-secrets.sh"
fi

# Google OAuth 자격증명 주입 (선택 — Google Cloud Console에서 발급 후 사용)
# 사용법:
#   GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com" \
#   GOOGLE_CLIENT_SECRET="your-client-secret" \
#   bash scripts/inject-secrets.sh
if [ -n "${GOOGLE_CLIENT_ID}" ] && [ -n "${GOOGLE_CLIENT_SECRET}" ]; then
  echo "[5/5] Google OAuth 자격증명 주입 (frontend + game-server)..."

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
