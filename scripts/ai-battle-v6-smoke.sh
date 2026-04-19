#!/bin/bash
# v6 ContextShaper Smoke 실측 wrapper
# Usage: ./scripts/ai-battle-v6-smoke.sh <shaper-id> [turns] [timeout]
#   shaper-id : passthrough | joker-hinter | pair-warmup
#   turns     : default 80
#   timeout   : default 700 (AI_ADAPTER_TIMEOUT_SEC, KDP #7 부등식 준수)
#
# 예시:
#   bash scripts/ai-battle-v6-smoke.sh passthrough      # sanity check (v2 baseline 재확인)
#   bash scripts/ai-battle-v6-smoke.sh joker-hinter     # Phase 4 — F1 가설 검증
#   bash scripts/ai-battle-v6-smoke.sh pair-warmup      # Phase 5 — F2 가설 검증
#
# 판단 기준 (ADR 44 §10.3):
#   GO    : place_rate >= 31% (vs v2 N=3 mean 29.07%, Δ >= +2%p)
#   Pivot : 27% <= place_rate < 31%
#   Kill  : place_rate < 27%
#
# Timeout 부등식 (KDP #7, ADR 41 §4):
#   script_ws(770) > gs_ctx(760) > http_client(760) > istio_vs(710) > DTO_max(720) > adapter_floor(700) > llm_vendor
#   Shaper 예산 50ms 추가해도 부등식 불변 (ADR 44 §8).

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SHAPER="${1:-joker-hinter}"
TURNS="${2:-80}"
TIMEOUT="${3:-700}"
LOG_DIR="$REPO_ROOT/work_logs/battles/r11-smoke"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
LOG_FILE="$LOG_DIR/v6-${SHAPER}-${TIMESTAMP}.log"

# 유효 shaper 값 검증
VALID_SHAPERS="passthrough joker-hinter pair-warmup"
if ! echo "$VALID_SHAPERS" | grep -qw "$SHAPER"; then
  echo "[ERROR] 유효하지 않은 shaper-id: $SHAPER"
  echo "  사용 가능: $VALID_SHAPERS"
  exit 1
fi

mkdir -p "$LOG_DIR"

echo "[$(date +%H:%M:%S)] ===== v6 Smoke 실측 시작 ====="
echo "[$(date +%H:%M:%S)] Shaper    : $SHAPER"
echo "[$(date +%H:%M:%S)] Turns     : $TURNS"
echo "[$(date +%H:%M:%S)] Timeout   : ${TIMEOUT}s"
echo "[$(date +%H:%M:%S)] Log       : $LOG_FILE"
echo ""

# --- 1. DEEPSEEK_REASONER_CONTEXT_SHAPER env 동적 전환 ---
echo "[$(date +%H:%M:%S)] [1/4] ai-adapter env 전환: DEEPSEEK_REASONER_CONTEXT_SHAPER=$SHAPER"
kubectl set env deploy/ai-adapter -n rummikub \
  "DEEPSEEK_REASONER_CONTEXT_SHAPER=$SHAPER"

# --- 2. rollout 대기 ---
echo "[$(date +%H:%M:%S)] [2/4] rollout 대기 (최대 2분)..."
kubectl rollout status deploy/ai-adapter -n rummikub --timeout=2m

# --- 3. env 실반영 확인 ---
echo "[$(date +%H:%M:%S)] [3/4] env 실반영 확인..."
kubectl exec -n rummikub deploy/ai-adapter -- printenv 2>/dev/null \
  | grep -iE 'shaper|timeout' \
  | sort

echo ""
echo "[$(date +%H:%M:%S)] [4/4] DeepSeek Reasoner 실측 시작 (${TURNS}턴, ~70~100분 예상)..."
echo "        v2 baseline: N=3 mean 29.07% (docs/04-testing/60)"
echo "        GO 기준    : >= 31.0% (+2%p)"
echo ""

# --- 4. 실측 실행 (결과를 로그 파일에 tee) ---
python3 "$REPO_ROOT/scripts/ai-battle-3model-r4.py" \
  --models deepseek \
  --turns "$TURNS" \
  --timeout "$TIMEOUT" \
  2>&1 | tee "$LOG_FILE"

echo ""
echo "[$(date +%H:%M:%S)] ===== v6 Smoke 실측 완료 ====="
echo "[$(date +%H:%M:%S)] 로그 저장: $LOG_FILE"
echo ""
echo "--- 실측 후 원복 명령 (passthrough sanity 이후 또는 실험 종료 시) ---"
echo "kubectl set env deploy/ai-adapter -n rummikub DEEPSEEK_REASONER_CONTEXT_SHAPER=passthrough"
