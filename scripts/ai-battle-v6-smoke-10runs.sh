#!/bin/bash
# v6 Smoke 10 Run Orchestrator
# Sequence: P P J J J J W W W W (passthrough x2, joker-hinter x4, pair-warmup x4)
#
# batch-battle SKILL Phase 1~4 준수
# - Phase 1: 사전점검 (Pod/health/configmap)
# - Phase 2: 매 run 전 Redis game 키 정리
# - Phase 3: 순차 실행 + master.log + runN.log 개별 저장
# - Phase 4: 배치 종료 시 env 원복 (passthrough)
#
# KDP #7 타임아웃 부등식 (docs/02-design/41):
#   script_ws(770) > gs_ctx(760) > http_client(760) > istio_vs(710)
#   > DTO_max(720) > adapter_floor(700) > llm_vendor
#
# 실행:
#   nohup bash scripts/ai-battle-v6-smoke-10runs.sh > /tmp/v6-smoke-10runs-nohup.log 2>&1 &
#   disown $!
#
# 예상 소요: 12~16시간 / 예상 비용: ~$0.40 (DeepSeek Reasoner x10 x 80턴)
# 판단 기준 (ADR 44 §10.3):
#   GO    : place_rate >= 31% (vs v2 N=3 mean 29.07%, Delta >= +2%p)
#   Pivot : 27% <= place_rate < 31%
#   Kill  : place_rate < 27%

set -uo pipefail  # -e 제거: 한 run 실패해도 다음 계속

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BATCH_TAG="r11-smoke-$(date +%Y%m%d-%H%M%S)"
LOG_DIR="$REPO_ROOT/work_logs/battles/$BATCH_TAG"
MASTER_LOG="$LOG_DIR/phase2-master.log"
mkdir -p "$LOG_DIR"

# Shaper 분배: passthrough x2 (sanity), joker-hinter x4 (F1), pair-warmup x4 (F2)
SEQUENCE=(
  "passthrough" "passthrough"
  "joker-hinter" "joker-hinter" "joker-hinter" "joker-hinter"
  "pair-warmup" "pair-warmup" "pair-warmup" "pair-warmup"
)

TURNS=80
TIMEOUT=700

{
  echo "[$(date '+%F %T')] ===== v6 Smoke 10 Run Batch 시작 ====="
  echo "  BatchTag: $BATCH_TAG"
  echo "  Sequence: ${SEQUENCE[*]}"
  echo "  Turns   : $TURNS"
  echo "  Timeout : ${TIMEOUT}s"
  echo "  LogDir  : $LOG_DIR"
  echo "  MasterLog: $MASTER_LOG"
} | tee -a "$MASTER_LOG"

# Phase 1: 사전점검 (batch-battle SKILL §Phase 1)
{
  echo ""
  echo "[$(date '+%F %T')] ===== Phase 1: 사전점검 ====="
} | tee -a "$MASTER_LOG"

# Pod 상태
POD_STATUS=$(kubectl get pods -n rummikub --no-headers 2>&1)
POD_COUNT=$(echo "$POD_STATUS" | grep -c "Running" || true)
{
  echo "[$(date '+%F %T')] Pods Running: $POD_COUNT"
  echo "$POD_STATUS"
} | tee -a "$MASTER_LOG"

if [ "$POD_COUNT" -lt 5 ]; then
  echo "[ERROR] Running Pod 수 부족 ($POD_COUNT < 5). 배치 중단." | tee -a "$MASTER_LOG"
  exit 1
fi

# game-server health
GS_READY=$(curl -s --max-time 10 http://localhost:30080/ready 2>/dev/null || echo "FAIL")
{
  echo "[$(date '+%F %T')] game-server /ready: $GS_READY"
} | tee -a "$MASTER_LOG"

# ai-adapter health
AA_HEALTH=$(curl -s --max-time 10 http://localhost:30081/health 2>/dev/null || echo "FAIL")
{
  echo "[$(date '+%F %T')] ai-adapter /health: $AA_HEALTH"
} | tee -a "$MASTER_LOG"

# ai-adapter DAILY_COST, TIMEOUT, SHAPER 확인
{
  echo "[$(date '+%F %T')] ai-adapter 비용/타임아웃 설정:"
  kubectl exec -n rummikub deploy/ai-adapter -- printenv 2>/dev/null \
    | grep -iE "COST_LIMIT|SHAPER|TIMEOUT" | sort | sed 's/^/  /'
} | tee -a "$MASTER_LOG"

{
  echo "[$(date '+%F %T')] ===== Phase 1 완료 ====="
  echo ""
} | tee -a "$MASTER_LOG"

# Phase 3: Run 순차 실행
PASS_COUNT=0
FAIL_COUNT=0

for i in "${!SEQUENCE[@]}"; do
  IDX=$((i+1))
  SHAPER="${SEQUENCE[$i]}"
  RUN_LOG="$LOG_DIR/phase2-run${IDX}-${SHAPER}.log"

  {
    echo ""
    echo "[$(date '+%F %T')] ===== Run ${IDX}/10 시작 (shaper=$SHAPER) ====="
  } | tee -a "$MASTER_LOG"

  # Phase 2: 매 run 전 Redis game 키 정리 (batch-battle SKILL §Phase 2)
  GAME_KEYS_BEFORE=$(kubectl exec -n rummikub deploy/redis -- redis-cli --scan --pattern "game:*" 2>/dev/null | wc -l || echo "0")
  {
    echo "[$(date '+%F %T')] [Phase2] Redis game:* 키 수: $GAME_KEYS_BEFORE"
  } | tee -a "$MASTER_LOG"

  if [ "$GAME_KEYS_BEFORE" -gt 0 ]; then
    kubectl exec -n rummikub deploy/redis -- sh -c \
      'redis-cli --scan --pattern "game:*" | xargs -r redis-cli DEL' 2>/dev/null || true
    echo "[$(date '+%F %T')] [Phase2] Redis game:* 키 삭제 완료" | tee -a "$MASTER_LOG"
  fi

  # ai-battle-v6-smoke.sh 실행 (env 전환 + rollout + 실측 포함)
  {
    echo "[$(date '+%F %T')] [Phase3] 실행: bash scripts/ai-battle-v6-smoke.sh $SHAPER $TURNS $TIMEOUT"
  } | tee -a "$MASTER_LOG"

  bash "$REPO_ROOT/scripts/ai-battle-v6-smoke.sh" "$SHAPER" "$TURNS" "$TIMEOUT" > "$RUN_LOG" 2>&1
  RC=$?

  # run 요약 추출 (place_rate, fallback, turns 라인)
  SUMMARY=$(tail -30 "$RUN_LOG" 2>/dev/null | grep -iE "place_rate|place rate|fallback|turns|total|결과" | tail -5 || echo "  (요약 라인 없음 — 전체 로그 확인: $RUN_LOG)")

  {
    echo "[$(date '+%F %T')] === Run ${IDX}/10 종료 (shaper=$SHAPER, exit=$RC) ==="
    if [ -n "$SUMMARY" ]; then
      echo "$SUMMARY" | sed 's/^/  /'
    else
      echo "  (tail 요약 없음)"
    fi
    echo "  상세 로그: $RUN_LOG"
  } | tee -a "$MASTER_LOG"

  if [ "$RC" -eq 0 ]; then
    PASS_COUNT=$((PASS_COUNT+1))
  else
    FAIL_COUNT=$((FAIL_COUNT+1))
    echo "[WARN] Run ${IDX} 비정상 종료 (exit=$RC). 다음 run 계속." | tee -a "$MASTER_LOG"
  fi

  # 다음 run 전 30초 쿨다운 (마지막 run 제외)
  if [ "$IDX" -lt 10 ]; then
    echo "[$(date '+%F %T')] [쿨다운] 30초 대기..." | tee -a "$MASTER_LOG"
    sleep 30
  fi
done

# Phase 4: 배치 종료 env 원복 (passthrough)
{
  echo ""
  echo "[$(date '+%F %T')] ===== Phase 4: env 원복 ====="
} | tee -a "$MASTER_LOG"

kubectl set env deploy/ai-adapter -n rummikub DEEPSEEK_REASONER_CONTEXT_SHAPER=passthrough >> "$MASTER_LOG" 2>&1 || true
kubectl rollout status deploy/ai-adapter -n rummikub --timeout=2m >> "$MASTER_LOG" 2>&1 || true

FINAL_SHAPER=$(kubectl exec -n rummikub deploy/ai-adapter -- printenv DEEPSEEK_REASONER_CONTEXT_SHAPER 2>/dev/null || echo "확인 실패")

{
  echo "[$(date '+%F %T')] env 원복 완료: DEEPSEEK_REASONER_CONTEXT_SHAPER=$FINAL_SHAPER"
  echo ""
  echo "[$(date '+%F %T')] ===== v6 Smoke 10 Run Batch 완료 ====="
  echo "  Pass     : $PASS_COUNT / 10"
  echo "  Fail     : $FAIL_COUNT / 10"
  echo "  BatchTag : $BATCH_TAG"
  echo "  LogDir   : $LOG_DIR"
  echo "  MasterLog: $MASTER_LOG"
  echo ""
  echo "  모니터링 명령:"
  echo "    tail -f $MASTER_LOG"
  echo "    ls $LOG_DIR"
} | tee -a "$MASTER_LOG"
